import { ApiError } from '../../application/errors.js';
import { buildDashboard } from '../../application/usecases/dashboard.js';
import { batchCounts, batchIds, buildBatchDetail, buildInsuranceCycle, employeeLite, sentIndex } from '../../application/usecases/insuranceCycle.js';
import { buildBatchExport, buildInsurerExport } from '../../application/usecases/insurerExport.js';
import { buildUniformPending } from '../../application/usecases/uniformPending.js';
import { buildStockOptions, stockChange, stockRef, stockSizes, stockSubmitPayload, toStockRequest, uniformLines } from '../../application/usecases/uniformStock.js';
import { validateBindings, validateInsurerForm } from '../../application/insurerFormRules.js';
import { buildWorkQueue } from '../../application/usecases/workQueue.js';
import { todayISO } from '../../domain/date.js';
import { probationDueDate } from '../../domain/employee.js';
import { insuranceUrgentNotice, stockChangeNotice } from '../../application/usecases/notifications.js';
import { benefitsOf, uniformStatus } from '../../domain/eligibility.js';
import { isHandedOut, isStockIssue } from '../../domain/uniform.js';
import { activeRules, activeSettings, RULE_EPOCH, ruleTimeline, toRevisions } from '../../domain/ruleVersions.js';
import { UNIFORM_EVENTS } from '../../domain/uniform.js';
import { quantitiesError, validateInsuranceRule, validateSettings, validateUniformRule } from '../../application/ruleRules.js';
import { withTotals } from './rules.js';
import { CONFIG } from '../../config.js';
import { StockGateway } from '../http/stockGateway.js';
import { BATCH_TYPE_LABEL, END_REASON_LABEL, UNIFORM_EVENT_LABEL } from '../../domain/labels.js';
import { buildSeed } from './seed.js';
import { MOCK_USERS } from './users.js';

const STORAGE_KEY = 'hl-welfare-mock-v6'; // v6: แบบฟอร์มประกันจากไฟล์ Excel ที่อัปโหลด (template) + การผูกบริษัท

const LATENCY_MS = 150;


function load(today) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.db?.employees && s.db.activities) {
        // ครั้งเดียว: เครื่องหมายค่าเริ่มต้นเดิม "P" → "✓" (หลังจากนี้ผู้ใช้เลือก "P" เองได้)
        if (!s.db.marksV2) {
          for (const f of s.db.insurers ?? []) for (const k of ['inMark', 'outMark']) if (f[k] === 'P') f[k] = '✓';
          s.db.marksV2 = true;
        }
        s.db.batches = mergeLegacyBatches(s.db.batches ?? []);
        // พนักงานรายวันส่งแจ้งแยกทุกวันที่ 6
        if (!s.db.ruleHistory) s.db.rules.settings.insuranceCycleDayDaily ??= 6;
        return s.db;
      }
    }
  } catch {
    /* localStorage ใช้ไม่ได้ → ใช้ seed ใหม่ */
  }
  return buildSeed(today);
}

const nextId = (xs) => Math.max(0, ...xs.map((x) => x.id)) + 1;
const nextIdBy = (xs, key) => Math.max(0, ...xs.map((x) => x[key])) + 1;

/** ฉบับของกฎ (มีวันที่มีผล) จากกฎชุดเดียว — seed / ข้อมูลรุ่นก่อนที่ยังไม่มีประวัติ */
function ruleHistoryOf(rules) {
  return {
    insurance: toRevisions(rules.insurance),
    uniform: toRevisions(rules.uniform),
    settings: Object.entries(rules.settings).map(([key, value]) => ({ key, value, effectiveFrom: RULE_EPOCH })),
  };
}

/** ข้อมูลเดิม: ประวัติแยกตามประเภท ({type, employeeIds}) → รวมเป็นการส่งออกครั้งเดียว (รอบ + บริษัทประกัน + เวลาเดียวกัน) */
function mergeLegacyBatches(list) {
  if (list.every((b) => Array.isArray(b.items))) return list;
  const groups = new Map();
  for (const b of list) {
    const items = b.items ?? b.employeeIds.map((employeeId) => ({ employeeId, type: b.type }));
    const k = `${b.cycleDate}|${b.insurerId ?? ''}|${b.submittedAt}`;
    const g = groups.get(k);
    if (g) g.items.push(...items);
    else groups.set(k, { id: b.id, cycleDate: b.cycleDate, insurerId: b.insurerId ?? null, insurerName: b.insurerName ?? null, items, submittedAt: b.submittedAt, submittedBy: b.submittedBy });
  }
  return [...groups.values()].sort((a, b) => a.id - b.id);
}
const countText = (b) => {
  const c = batchCounts(b);
  return `เข้า ${c.in} · ออก ${c.out + c.urgent} ราย`;
};

const nowStamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${todayISO(d)}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const fullName = (e) => `${e.firstName} ${e.lastName}`;

/**
 * WelfareApi ในหน่วยความจำ + localStorage — ใช้ domain/use-case ชุดเดียวกับ PHP
 * ยกเว้นการส่งเบิกชุดฟอร์ม ซึ่งเรียกระบบสต็อกจริงผ่าน StockGateway (เทสต์ส่งตัวปลอมเข้ามาแทน)
 */
export class MockApi {
  db;
  today;
  stock;
  constructor(today = () => todayISO(), stock = new StockGateway(CONFIG.stock.bridgeUrl)) {
    this.today = today;
    this.stock = stock;
    this.db = load(this.today());
    this.db.ruleHistory ??= ruleHistoryOf(this.db.rules);
    this.syncRules();
  }
  // ---------- helpers ----------
  /** db.rules = กฎที่มีผล ณ วันนี้ จากฉบับทั้งหมด (= repo_rules ฝั่ง PHP) — เรียกก่อนทุกคำสั่ง เพราะกฎที่ตั้งล่วงหน้าถึงวันมีผลได้ */
  syncRules() {
    // db ที่ถูกแทนทั้งก้อน (เช่น scripts/export-seed.mjs ใส่ buildSeed() ตรง ๆ) ยังไม่มีประวัติ
    this.db.ruleHistory ??= ruleHistoryOf(this.db.rules);
    const h = this.db.ruleHistory;
    const today = this.today();
    this.db.rules = {
      insurance: activeRules(h.insurance, today),
      uniform: activeRules(h.uniform, today),
      uniformItems: this.db.rules.uniformItems,
      settings: activeSettings(h.settings, today),
    };
  }
  async run(fn) {
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    this.syncRules();
    return structuredClone(fn());
  }
  /** แบบ run สำหรับคำสั่งที่ต้องรอระบบสต็อก */
  async runAsync(fn) {
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    this.syncRules();
    return structuredClone(await fn());
  }
  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ seededFor: this.today(), db: this.db }));
    } catch {
      /* เต็ม / ถูกบล็อก → ทำงานต่อในหน่วยความจำ */
    }
  }
  /** = เขียน audit_log ฝั่ง PHP */
  log(entity, action, entityId, summary, employeeId = null) {
    this.db.activities.push({
      id: nextId(this.db.activities),
      at: nowStamp(),
      user: this.actor,
      entity,
      entityId: String(entityId),
      action,
      summary,
      employeeId,
    });
  }
  /**
   * = notify_users ฝั่ง PHP — โหมด mock มีผู้ใช้คนเดียว แจ้งทุกเรื่องถึงผู้ใช้ปัจจุบัน
   * (PHP แจ้งเฉพาะผู้ส่งเบิก / HR คนอื่นที่แจ้งประกันได้ ไม่รวมคนที่บันทึก)
   */
  notify(notice, employeeId = null) {
    if (!notice) return;
    this.db.notifications ??= [];
    this.db.notifications.push({ id: nextId(this.db.notifications), ...notice, employeeId, read: false, at: nowStamp() });
  }
  site(id) {
    return this.db.sites.find((s) => s.id === id) ?? null;
  }
  employee(id) {
    const e = this.db.employees.find((x) => x.id === id);
    if (!e) throw new ApiError('ไม่พบพนักงาน', 404);
    return e;
  }
  // ---------- Dashboard / Monitor ----------
  getDashboard() {
    return this.run(() => {
      const { employees, sites, rules, batches, issues } = this.db;
      return buildDashboard(this.today(), employees, sites, rules, batches, issues);
    });
  }
  getWorkQueue() {
    return this.run(() => {
      const { employees, sites, rules, batches, issues } = this.db;
      return buildWorkQueue(this.today(), employees, sites, rules, batches, issues);
    });
  }
  listActivity(filter = {}) {
    return this.run(() =>
      this.db.activities
        .filter(
          (a) =>
            (!filter.entity || a.entity === filter.entity) &&
            (filter.employeeId === undefined || a.employeeId === filter.employeeId),
        )
        .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
        .slice(0, filter.limit ?? 200),
    );
  }
  // ---------- Companies / Sites ----------
  listCompanies() {
    return this.run(() => this.db.companies);
  }
  listSites() {
    return this.run(() => this.db.sites);
  }
  createSite(input) {
    return this.run(() => {
      if (!input.name.trim()) throw new ApiError('กรุณาระบุชื่อหน่วยงาน', 422);
      if (this.db.sites.some((s) => s.companyCode === input.companyCode && s.name === input.name.trim())) {
        throw new ApiError('มีหน่วยงานชื่อนี้ในบริษัทแล้ว', 409);
      }
      const site = { ...input, name: input.name.trim(), id: nextId(this.db.sites), uniformOverrides: [] };
      this.db.sites.push(site);
      this.log('SITE', 'CREATE', site.id, `เพิ่มหน่วยงาน “${site.name}” (${site.companyCode})`);
      this.persist();
      return site;
    });
  }
  updateSite(id, patch) {
    return this.run(() => {
      const s = this.db.sites.find((x) => x.id === id);
      if (!s) throw new ApiError('ไม่พบหน่วยงาน', 404);
      if (patch.name !== undefined && !patch.name.trim()) throw new ApiError('กรุณาระบุชื่อหน่วยงาน', 422);
      const changes = [];
      if (patch.name !== undefined && patch.name !== s.name) changes.push(`ชื่อ → ${patch.name}`);
      if (patch.hasGroupInsurance !== undefined && patch.hasGroupInsurance !== s.hasGroupInsurance)
        changes.push(patch.hasGroupInsurance ? 'ได้รับประกันกลุ่ม' : 'ไม่ได้รับประกันกลุ่ม');
      if (patch.poloColor !== undefined && patch.poloColor !== s.poloColor)
        changes.push(`โปโลสี${patch.poloColor === 'NAVY' ? 'น้ำเงิน' : 'ดำ'}`);
      Object.assign(s, patch);
      if (changes.length) this.log('SITE', 'UPDATE', s.id, `แก้ไขหน่วยงาน “${s.name}”: ${changes.join(', ')}`);
      this.persist();
      return s;
    });
  }
  deleteSite(id) {
    return this.run(() => {
      const s = this.db.sites.find((x) => x.id === id);
      if (!s) throw new ApiError('ไม่พบหน่วยงาน', 404);
      const n = this.db.employees.filter((e) => e.siteId === id).length;
      if (n > 0) throw new ApiError(`ลบไม่ได้ — ยังมีพนักงานในหน่วยงานนี้ ${n} คน`, 409);
      this.db.sites = this.db.sites.filter((x) => x.id !== id);
      this.log('SITE', 'DELETE', id, `ลบหน่วยงาน “${s.name}”`);
      this.persist();
    });
  }
  // ---------- Employees ----------
  listEmployees(filter = {}) {
    return this.run(() => {
      const q = filter.q?.trim().toLowerCase() ?? '';
      return this.db.employees
        .filter(
          (e) =>
            (!q || `${e.empCode} ${e.firstName} ${e.lastName}`.toLowerCase().includes(q)) &&
            (!filter.companyCode || e.companyCode === filter.companyCode) &&
            (!filter.employeeType || e.employeeType === filter.employeeType) &&
            (!filter.status || e.status === filter.status),
        )
        .sort((a, b) => a.empCode.localeCompare(b.empCode));
    });
  }
  getEmployeeBenefits(id) {
    return this.run(() => {
      const e = this.employee(id);
      return benefitsOf(e, this.site(e.siteId), this.db.rules, this.db.issues, this.today());
    });
  }
  saveEmployee(input) {
    return this.run(() => {
      // วันผ่านทดลองงานว่าง → วันเริ่มงาน + 119 วัน (เหมือน backend)
      if (!input.probationPassDate && input.startDate) input = { ...input, probationPassDate: probationDueDate(input.startDate) };
      const dup = this.db.employees.find((e) => e.empCode === input.empCode && e.id !== input.id);
      if (dup) throw new ApiError('รหัสพนักงานซ้ำ', 409);
      const site = this.site(input.siteId);
      if (!site) throw new ApiError('ไม่พบหน่วยงาน', 422);
      if (site.companyCode !== input.companyCode) throw new ApiError('หน่วยงานไม่ได้อยู่ในบริษัทที่เลือก', 422);
      if (input.id) {
        const e = this.employee(input.id);
        const wasActive = e.status === 'ACTIVE';
        Object.assign(e, input);
        const terminated = wasActive && e.status === 'INACTIVE';
        if (terminated && (e.endReason === 'TERMINATED' || e.endReason === 'MISCONDUCT')) {
          this.notify(insuranceUrgentNotice(e, END_REASON_LABEL[e.endReason]), e.id);
        }
        this.log(
          'EMPLOYEE',
          'UPDATE',
          e.id,
          terminated ? `บันทึกพ้นสภาพ ${fullName(e)} (${e.empCode})` : `แก้ไขข้อมูล ${fullName(e)} (${e.empCode})`,
          e.id,
        );
        this.persist();
        return e;
      }
      const created = { ...input, id: nextId(this.db.employees) };
      this.db.employees.push(created);
      this.log('EMPLOYEE', 'CREATE', created.id, `เพิ่มพนักงาน ${fullName(created)} (${created.empCode})`, created.id);
      this.persist();
      return created;
    });
  }
  deleteEmployee(id) {
    return this.run(() => {
      const e = this.employee(id);
      const hasHistory =
        this.db.batches.some((b) => b.items.some((i) => i.employeeId === id)) || this.db.issues.some((i) => i.employeeId === id);
      if (hasHistory) throw new ApiError('ลบไม่ได้ — มีประวัติแจ้งประกัน/แจกชุดแล้ว ให้ใช้ “บันทึกพ้นสภาพ” แทน', 409);
      this.db.employees = this.db.employees.filter((x) => x.id !== id);
      this.log('EMPLOYEE', 'DELETE', id, `ลบพนักงาน ${fullName(e)} (${e.empCode})`);
      this.persist();
    });
  }
  getRules() {
    return this.run(() => this.db.rules);
  }
  // ---------- แก้เงื่อนไขสวัสดิการ (มีวันที่มีผล) = backend/api/rules_edit.php ----------
  ruleHistoryPayload() {
    const h = this.db.ruleHistory;
    const today = this.today();
    return {
      today,
      insurance: ruleTimeline(h.insurance, today),
      uniform: ruleTimeline(h.uniform, today),
      settings: h.settings,
      uniformItems: this.db.rules.uniformItems,
    };
  }
  getRuleHistory() {
    return this.run(() => this.ruleHistoryPayload());
  }
  /** ตรวจ + จัดรูปกฎ (items/จำนวนรวมของกฎชุดฟอร์มคำนวณจาก quantities) */
  cleanRule(kind, rule) {
    const ctx = { companies: this.db.companies.map((c) => c.code), items: this.db.rules.uniformItems.map((i) => i.code) };
    const x = kind === 'insurance' ? validateInsuranceRule(rule, ctx) : validateUniformRule(rule, ctx);
    if (Object.keys(x).length) throw new ApiError('ข้อมูลกฎไม่ถูกต้อง', 422, x);
    const { effectiveFrom: _e, id: _i, revisionId: _r, deleted: _d, updatedBy: _u, ...r } = rule;
    if (kind === 'insurance') return { ...r, waitDays: Number(r.waitDays), note: (r.note ?? '').trim() };
    const items = [...new Set(UNIFORM_EVENTS.flatMap((ev) => Object.keys(r.quantities[ev] ?? {})))];
    return withTotals({ ...r, items, note: (r.note ?? '').trim(), style: r.style.trim() });
  }
  /** เพิ่ม/แก้ฉบับ — ฉบับของกฎเดียวกันวันเดียวกันมีอยู่แล้ว = แก้ฉบับนั้น */
  writeRevision(kind, id, effectiveFrom, rule, deleted) {
    const list = this.db.ruleHistory[kind];
    const same = list.find((r) => r.id === id && r.effectiveFrom === effectiveFrom);
    if (same) Object.assign(same, rule, { id, effectiveFrom, deleted, updatedBy: this.actor });
    else list.push({ ...rule, id, revisionId: nextIdBy(list, 'revisionId'), effectiveFrom, deleted, updatedBy: this.actor });
  }
  createRule(kind, rule) {
    return this.run(() => {
      const r = this.cleanRule(kind, rule);
      const id = nextId(this.db.ruleHistory[kind]);
      const from = rule.effectiveFrom || this.today();
      this.writeRevision(kind, id, from, r, false);
      this.log('RULE', 'CREATE', `${kind}-${id}`, `เพิ่ม${kind === 'insurance' ? 'กฎประกันกลุ่ม' : 'กฎชุดฟอร์ม'} #${id} มีผล ${from}`);
      this.persist();
      return this.ruleHistoryPayload();
    });
  }
  updateRule(kind, id, rule) {
    return this.run(() => {
      if (!this.db.ruleHistory[kind].some((r) => r.id === id)) throw new ApiError('ไม่พบกฎ', 404);
      const from = rule.effectiveFrom || this.today();
      this.writeRevision(kind, id, from, this.cleanRule(kind, rule), false);
      this.log('RULE', 'UPDATE', `${kind}-${id}`, `แก้${kind === 'insurance' ? 'กฎประกันกลุ่ม' : 'กฎชุดฟอร์ม'} #${id} มีผล ${from}`);
      this.persist();
      return this.ruleHistoryPayload();
    });
  }
  retireRule(kind, id, effectiveFrom) {
    return this.run(() => {
      const mine = this.db.ruleHistory[kind].filter((r) => r.id === id);
      if (!mine.length) throw new ApiError('ไม่พบกฎ', 404);
      const last = mine.reduce((a, b) => (b.effectiveFrom > a.effectiveFrom || (b.effectiveFrom === a.effectiveFrom && b.revisionId > a.revisionId) ? b : a));
      const { id: _i, revisionId: _r, effectiveFrom: _e, deleted: _d, updatedBy: _u, ...values } = last;
      const from = effectiveFrom || this.today();
      this.writeRevision(kind, id, from, values, true);
      this.log('RULE', 'DELETE', `${kind}-${id}`, `เลิกใช้${kind === 'insurance' ? 'กฎประกันกลุ่ม' : 'กฎชุดฟอร์ม'} #${id} ตั้งแต่ ${from}`);
      this.persist();
      return this.ruleHistoryPayload();
    });
  }
  cancelRuleRevision(kind, revisionId) {
    return this.run(() => {
      const list = this.db.ruleHistory[kind];
      const rev = list.find((r) => r.revisionId === revisionId);
      if (!rev) throw new ApiError('ไม่พบการเปลี่ยนแปลงนี้', 404);
      if (rev.effectiveFrom <= this.today()) throw new ApiError('ฉบับนี้มีผลแล้ว ยกเลิกไม่ได้ — แก้กฎเป็นฉบับใหม่แทน', 409);
      this.db.ruleHistory[kind] = list.filter((r) => r !== rev);
      this.log('RULE', 'CANCEL', `${kind}-${rev.id}`, `ยกเลิกการเปลี่ยนกฎ #${rev.id} ที่จะมีผล ${rev.effectiveFrom}`);
      this.persist();
      return this.ruleHistoryPayload();
    });
  }
  saveRuleSettings({ effectiveFrom, values }) {
    return this.run(() => {
      const x = validateSettings(values ?? {});
      if (Object.keys(x).length) throw new ApiError('ค่าตั้งค่าไม่ถูกต้อง', 422, x);
      const from = effectiveFrom || this.today();
      const rows = this.db.ruleHistory.settings;
      for (const [key, v] of Object.entries(values)) {
        if (from <= this.today() && Number(this.db.rules.settings[key]) === Number(v)) continue;
        const same = rows.find((s) => s.key === key && s.effectiveFrom === from);
        if (same) same.value = Number(v);
        else rows.push({ key, value: Number(v), effectiveFrom: from, updatedBy: this.actor });
      }
      this.log('RULE', 'UPDATE', 'SETTINGS', `แก้ค่าตั้งค่า (มีผล ${from})`);
      this.persist();
      return this.ruleHistoryPayload();
    });
  }
  cancelSettingChange(key, date) {
    return this.run(() => {
      if (date <= this.today()) throw new ApiError('ค่านี้มีผลแล้ว ยกเลิกไม่ได้ — ตั้งค่าใหม่แทน', 409);
      const rows = this.db.ruleHistory.settings;
      if (!rows.some((s) => s.key === key && s.effectiveFrom === date)) throw new ApiError('ไม่พบการเปลี่ยนแปลงนี้', 404);
      this.db.ruleHistory.settings = rows.filter((s) => !(s.key === key && s.effectiveFrom === date));
      this.persist();
      return this.ruleHistoryPayload();
    });
  }
  /** โหมด mock ไม่มีสต็อกจริงให้ส่ง — ตอบจำนวนที่จะส่งเหมือนฝั่ง PHP */
  syncMasterToStock() {
    return this.run(() => ({
      companies: this.db.companies.length,
      sites: this.db.sites.length,
      createdSites: 0,
      message: `โหมดทดลอง: ไม่ได้ส่งจริง (บริษัท ${this.db.companies.length} · หน่วยงาน ${this.db.sites.length})`,
    }));
  }
  saveSiteUniform(siteId, overrides) {
    return this.run(() => {
      const s = this.db.sites.find((x) => x.id === siteId);
      if (!s) throw new ApiError('ไม่พบหน่วยงาน', 404);
      const items = this.db.rules.uniformItems.map((i) => i.code);
      const x = {};
      overrides.forEach((o, i) => {
        const rule = this.db.rules.uniform.find((r) => r.id === o.ruleId);
        if (!rule) x[`overrides.${i}`] = 'ไม่พบกฎชุดฟอร์ม';
        else if (!rule.companies.includes(s.companyCode)) x[`overrides.${i}`] = `กฎ #${rule.id} ไม่ใช่ของบริษัท ${s.companyCode}`;
        else if (quantitiesError(o.quantities, items)) x[`overrides.${i}`] = quantitiesError(o.quantities, items);
      });
      if (Object.keys(x).length) throw new ApiError('ข้อมูลชุดฟอร์มของหน่วยงานไม่ถูกต้อง', 422, x);
      s.uniformOverrides = overrides.map((o) => ({ ruleId: o.ruleId, quantities: o.quantities }));
      this.log('SITE', 'UPDATE', s.id, `ตั้งชุดฟอร์มของหน่วยงาน “${s.name}”: ${overrides.length ? `${overrides.length} กฎ` : 'ใช้ตามกฎกลางทั้งหมด'}`);
      this.persist();
      return s;
    });
  }
  // ---------- Insurance ----------
  getInsuranceCycle(cycleDate) {
    return this.run(() => {
      const { employees, sites, rules, batches } = this.db;
      return buildInsuranceCycle(cycleDate, employees, sites, rules, batches);
    });
  }
  listInsuranceBatches() {
    return this.run(() => {
      // แนบรายชื่อแบบย่อ (แสดงตัวอย่างชื่อ + ค้นหาในตารางประวัติ)
      const byId = new Map(this.db.employees.map((e) => [e.id, e]));
      return [...this.db.batches]
        .sort((a, b) => b.id - a.id)
        .map((b) => ({ ...b, employees: batchIds(b).map((id) => byId.get(id)).filter(Boolean).map(employeeLite) }));
    });
  }
  /** ไฟล์แจ้งบริษัทประกันของการส่งออกครั้งที่ผ่านมา (ดาวน์โหลดซ้ำ — ไม่บันทึกอะไรเพิ่ม) */
  exportInsuranceBatch(id) {
    return this.run(() => {
      const batch = this.db.batches.find((x) => x.id === id);
      if (!batch) throw new ApiError('ไม่พบรายการส่งออก', 404);
      const insurer = this.db.insurers.find((x) => x.id === batch.insurerId);
      if (!insurer) throw new ApiError(`ไม่พบแบบฟอร์มของ${batch.insurerName ?? 'บริษัทประกัน'}แล้ว — ดาวน์โหลดเป็น CSV จากหน้ารายชื่อแทน`, 404);
      const { employees, sites, rules, batches, companies } = this.db;
      return buildBatchExport({ batch, insurer, employees, sites, rules, batches, companies });
    });
  }
  getInsuranceBatch(id) {
    return this.run(() => {
      const b = this.db.batches.find((x) => x.id === id);
      if (!b) throw new ApiError('ไม่พบรายการส่งแจ้ง', 404);
      const { employees, sites, rules, batches } = this.db;
      return buildBatchDetail(b, employees, sites, rules, batches);
    });
  }
  submitInsuranceBatch(input) {
    return this.run(() => {
      if (input.employeeIds.length === 0) throw new ApiError('ไม่มีรายการที่เลือก', 422);
      input.employeeIds.forEach((id) => this.employee(id));
      const sent = sentIndex(this.db.batches, this.db.employees)[input.type === 'IN' ? 'IN' : 'OUT'];
      const already = input.employeeIds.filter((id) => sent.has(id)).length;
      if (already > 0) throw new ApiError(`มีพนักงานที่ถูกแจ้งไปแล้ว ${already} ราย`, 409);
      const batch = {
        id: nextId(this.db.batches),
        cycleDate: input.cycleDate,
        insurerId: input.insurerId ?? null,
        insurerName: input.insurerName ?? null,
        items: input.employeeIds.map((employeeId) => ({ employeeId, type: input.type })),
        submittedAt: nowStamp(),
        submittedBy: this.actor,
      };
      this.db.batches.push(batch);
      const one = input.employeeIds.length === 1 ? input.employeeIds[0] : null;
      this.log(
        'INSURANCE_BATCH',
        'CREATE',
        batch.id,
        `ส่ง${BATCH_TYPE_LABEL[input.type]} ${input.employeeIds.length} ราย (รอบ ${input.cycleDate})`,
        one,
      );
      this.persist();
      return batch;
    });
  }
  cancelInsuranceBatch(id) {
    return this.run(() => {
      const b = this.db.batches.find((x) => x.id === id);
      if (!b) throw new ApiError('ไม่พบรายการส่งแจ้ง', 404);
      this.db.batches = this.db.batches.filter((x) => x.id !== id);
      this.log(
        'INSURANCE_BATCH',
        'CANCEL',
        id,
        `ยกเลิกการส่งออก${b.insurerName ? b.insurerName : ''} #${id} รอบ ${b.cycleDate} (${countText(b)})`,
      );
      this.persist();
    });
  }
  // ---------- แบบฟอร์มบริษัทประกัน (CRUD) + ส่งออกไฟล์ ----------
  insurer(id) {
    const f = this.db.insurers.find((x) => x.id === id);
    if (!f) throw new ApiError('ไม่พบแบบฟอร์มบริษัทประกัน', 404);
    return f;
  }
  listInsurers() {
    return this.run(() => [...this.db.insurers].sort((a, b) => Number(b.active) - Number(a.active) || a.id - b.id));
  }
  saveInsurer(input) {
    return this.run(() => {
      const errors = validateInsurerForm(input, this.db.insurers);
      if (Object.keys(errors).length) throw new ApiError(Object.values(errors)[0], 422, errors);
      if (input.id) {
        const f = this.insurer(input.id);
        Object.assign(f, structuredClone(input));
        this.log('INSURER_FORM', 'UPDATE', f.id, `แก้ไขแบบฟอร์ม ${f.shortName}`);
        this.persist();
        return f;
      }
      const created = { ...structuredClone(input), id: nextId(this.db.insurers) };
      this.db.insurers.push(created);
      this.log('INSURER_FORM', 'CREATE', created.id, `เพิ่มแบบฟอร์ม ${created.shortName}`);
      this.persist();
      return created;
    });
  }
  /**
   * ผูกบริษัทในเครือ ↔ บริษัทประกัน ทั้งหมดในครั้งเดียว (1 บริษัท = 1 บริษัทประกัน หรือไม่ส่งแจ้ง)
   * @param {{companyCode:string, insurerId:number|null, policyNo:string, holderName:string, plan:string}[]} bindings
   */
  saveInsurerBindings(bindings) {
    return this.run(() => {
      const errors = validateBindings(bindings, this.db.insurers);
      if (Object.keys(errors).length) throw new ApiError(Object.values(errors)[0], 422, errors);
      for (const f of this.db.insurers) {
        f.companies = bindings
          .filter((b) => b.insurerId === f.id)
          .map(({ companyCode, policyNo, holderName, plan }) => ({ companyCode, policyNo: policyNo ?? '', holderName: holderName ?? '', plan: plan ?? '' }))
          .sort((a, b) => a.companyCode.localeCompare(b.companyCode));
      }
      const summary = this.db.insurers.map((f) => `${f.shortName}: ${f.companies.map((c) => c.companyCode).join(', ') || '-'}`).join(' · ');
      this.log('INSURER_FORM', 'UPDATE', 'bindings', `ผูกบริษัทกับบริษัทประกัน — ${summary}`);
      this.persist();
      return [...this.db.insurers].sort((a, b) => Number(b.active) - Number(a.active) || a.id - b.id);
    });
  }
  deleteInsurer(id) {
    return this.run(() => {
      const f = this.insurer(id);
      // ประวัติการส่งออกเก็บชื่อบริษัทประกันไว้ในตัว (insurerName) จึงลบแบบฟอร์มได้โดยไม่เสียประวัติ
      this.db.insurers = this.db.insurers.filter((x) => x.id !== id);
      this.log('INSURER_FORM', 'DELETE', id, `ลบแบบฟอร์ม ${f.shortName}`);
      this.persist();
    });
  }
  /**
   * ข้อมูลสำหรับไฟล์แจ้งบริษัทประกัน รอบ cycleDate
   * record = true → บันทึกว่าแจ้งแล้ว (แทนที่การส่งออกเดิมของรอบ + บริษัทประกันเดียวกัน)
   */
  exportInsurance({ cycleDate, insurerId, record = false }) {
    return this.run(() => {
      const insurer = this.insurer(insurerId);
      const { employees, sites, rules, companies } = this.db;
      const data = buildInsurerExport({ cycleDate, insurer, employees, sites, rules, batches: this.db.batches, companies });
      if (!record) return { ...data, batches: [] };
      const replaced = this.db.batches.filter((b) => b.cycleDate === cycleDate && b.insurerId === insurerId);
      this.db.batches = this.db.batches.filter((b) => !replaced.includes(b));
      const all = data.companies.flatMap((c) => [...c.in, ...c.out]);
      // ส่งออก 1 ครั้ง = ประวัติ 1 รายการ (มีทั้งคนเข้าและคนออก)
      const created = [];
      if (all.length) {
        const batch = {
          id: nextId(this.db.batches),
          cycleDate,
          insurerId,
          insurerName: insurer.shortName,
          items: all.map((r) => ({ employeeId: r.employee.id, type: r.type })),
          submittedAt: nowStamp(),
          submittedBy: this.actor,
        };
        this.db.batches.push(batch);
        created.push(batch);
      }
      const n = all.length;
      this.log(
        'INSURANCE_BATCH',
        'CREATE',
        created.map((b) => b.id).join(',') || '-',
        `ส่งออกไฟล์แจ้ง${insurer.shortName} รอบ ${cycleDate}: เข้า ${all.filter((r) => r.type === 'IN').length} · ออก ${all.filter((r) => r.type !== 'IN').length} ราย${replaced.length ? ' (แทนที่ไฟล์เดิมของรอบนี้)' : ''}`,
        n === 1 ? all[0].employee.id : null,
      );
      this.persist();
      // ข้อมูลหลังบันทึก: ทุกแถวเป็น "ส่งออกแล้ว"
      return {
        ...buildInsurerExport({ cycleDate, insurer, employees, sites, rules, batches: this.db.batches, companies }),
        batches: created,
      };
    });
  }
  // ---------- Uniform ----------
  listUniformIssues(employeeId) {
    return this.run(() =>
      this.db.issues
        .filter((i) => employeeId === undefined || i.employeeId === employeeId)
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.id - a.id),
    );
  }
  /** สิทธิ์ที่ยังไม่ได้แจกและยังไม่ได้ส่งเบิก — 404 ไม่พบ / 409 แจกหรือส่งเบิกไปแล้ว */
  openEntitlement(employeeId, entitlementKey) {
    const e = this.employee(employeeId);
    const site = this.site(e.siteId);
    const st = uniformStatus(e, site, this.db.rules, this.db.issues, this.today());
    const ent = st.entitlements.find((x) => x.key === entitlementKey);
    if (!ent) throw new ApiError('ไม่พบสิทธิ์ชุดฟอร์มรายการนี้', 404);
    if (ent.requested) throw new ApiError(`ส่งเบิกคลังไปแล้ว (ใบ ${ent.stockDocNo}) — รอคลังจ่าย`, 409);
    if (ent.issued) throw new ApiError('รายการนี้แจกไปแล้ว', 409);
    return { e, site, st, ent };
  }
  createUniformIssue(input) {
    return this.run(() => {
      const e = this.employee(input.employeeId);
      if (!input.size.trim()) throw new ApiError('กรุณาเลือกไซซ์', 422);
      const dup = this.db.issues.find((i) => i.employeeId === input.employeeId && i.entitlementKey === input.entitlementKey);
      if (dup) throw new ApiError(isStockIssue(dup) ? `ส่งเบิกคลังไปแล้ว (ใบ ${dup.stock.docNo})` : 'รายการนี้แจกไปแล้ว', 409);
      const issue = { ...input, source: 'MANUAL', id: nextId(this.db.issues), issuedBy: this.actor };
      this.db.issues.push(issue);
      this.log(
        'UNIFORM_ISSUE',
        'CREATE',
        issue.id,
        `แจกชุดฟอร์ม (${UNIFORM_EVENT_LABEL[input.event]}) ${input.qty} ตัว ไซซ์ ${input.size} ให้ ${fullName(e)}`,
        e.id,
      );
      this.persist();
      return issue;
    });
  }
  /** ผ่านคลัง: ยกเลิกได้เฉพาะใบที่คลังยังไม่จ่าย และต้องยกเลิกใบในระบบสต็อกก่อน */
  cancelUniformIssue(id) {
    return this.runAsync(async () => {
      const i = this.db.issues.find((x) => x.id === id);
      if (!i) throw new ApiError('ไม่พบรายการแจก', 404);
      if (isStockIssue(i)) {
        if (isHandedOut(i)) throw new ApiError(`คลังจ่ายของตามใบ ${i.stock.docNo} ไปแล้ว — ต้องให้คลังยกเลิกใบจ่ายในระบบสต็อก`, 409);
        await this.stock.cancel(i.stock.ref, 'ยกเลิกจากระบบสวัสดิการ', this.actor);
      }
      const e = this.db.employees.find((x) => x.id === i.employeeId);
      this.db.issues = this.db.issues.filter((x) => x.id !== id);
      this.log(
        'UNIFORM_ISSUE',
        'CANCEL',
        id,
        isStockIssue(i)
          ? `ยกเลิกการส่งเบิกชุดฟอร์ม (${UNIFORM_EVENT_LABEL[i.event]}) ใบ ${i.stock.docNo} ของ ${e ? fullName(e) : `#${i.employeeId}`}`
          : `ยกเลิกการแจกชุดฟอร์ม (${UNIFORM_EVENT_LABEL[i.event]}) ของ ${e ? fullName(e) : `#${i.employeeId}`}`,
        i.employeeId,
      );
      this.persist();
    });
  }
  // ---------- ส่งเบิกผ่านระบบสต็อก Uniform (ระบบสต็อกจริง ผ่าน web/api/stock_bridge.php) ----------
  getUniformStockOptions(employeeId, entitlementKey) {
    return this.runAsync(async () => {
      const { e, st, ent } = this.openEntitlement(employeeId, entitlementKey);
      const catalog = await this.stock.catalog({ items: ent.items, logo: st.logo, siteId: e.siteId, event: ent.event });
      return { ...buildStockOptions(ent, catalog, e), logo: st.logo, event: ent.event, qty: ent.qty, qtyLabel: ent.qtyLabel, style: ent.style };
    });
  }
  requestUniformFromStock({ employeeId, entitlementKey, lines }) {
    return this.runAsync(async () => {
      const { e, site, st, ent } = this.openEntitlement(employeeId, entitlementKey);
      if (!lines?.length) throw new ApiError('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ', 422);
      for (const l of lines) {
        if (!l.productId) throw new ApiError('กรุณาเลือกแบบและไซซ์ให้ครบทุกรายการ', 422);
        if (!(Number.isInteger(l.qty) && l.qty > 0)) throw new ApiError('จำนวนต้องเป็นจำนวนเต็มมากกว่า 0', 422);
      }
      const ref = stockRef(e.id, ent.key);
      const res = await this.stock.submit(stockSubmitPayload(e, site, ent, st.logo, lines, this.actor));
      const stock = res.status?.[ref] ? toStockRequest(ref, res.status[ref]) : { ref, docId: res.doc_id, docNo: res.doc_no, stage: 'WAITING', issuedAt: null, receivedAt: null, items: [] };
      // คำขอก่อนหน้าหลุดระหว่างทาง (ระบบสต็อกออกใบไปแล้ว) — ใช้ใบเดิม ไม่ซ้อนรายการ
      this.db.issues = this.db.issues.filter((i) => !(i.employeeId === e.id && i.entitlementKey === ent.key));
      const issue = {
        id: nextId(this.db.issues),
        employeeId: e.id,
        entitlementKey: ent.key,
        event: ent.event,
        qty: lines.reduce((s, l) => s + l.qty, 0),
        size: stockSizes(stock),
        issuedAt: this.today(),
        issuedBy: this.actor,
        source: 'STOCK',
        stock,
      };
      this.db.issues.push(issue);
      this.log('UNIFORM_ISSUE', 'CREATE', issue.id, `ส่งเบิกชุดฟอร์ม (${UNIFORM_EVENT_LABEL[ent.event]}) ใบ ${stock.docNo} ให้ ${fullName(e)} — รอผู้อนุมัติในระบบสต็อก`, e.id);
      this.persist();
      return issue;
    });
  }
  /**
   * ดึงสถานะใบเบิกจากระบบสต็อก — หน้าชุดฟอร์ม/พนักงานเรียกก่อนแสดงผล
   * ใบที่เซ็นรับแล้วจบแล้ว ไม่ต้องถามซ้ำ / ใบที่คลังยกเลิก → ลบทิ้ง สิทธิ์กลับเป็นค้างแจก
   * @returns {Promise<{changed: number}>}
   */
  syncUniformStock() {
    return this.runAsync(async () => {
      const open = this.db.issues.filter((i) => isStockIssue(i) && i.stock.stage !== 'RECEIVED');
      if (!open.length) return { changed: 0 };
      const status = await this.stock.status(open.map((i) => i.stock.ref));
      let changed = 0;
      for (const i of open) {
        const s = status[i.stock.ref];
        const next = s && s.doc_id === i.stock.docId ? toStockRequest(i.stock.ref, s) : null;
        const kind = stockChange(i.stock, next);
        if (kind === 'NONE') continue;
        changed++;
        const e = this.db.employees.find((x) => x.id === i.employeeId);
        const who = e ? fullName(e) : `#${i.employeeId}`;
        this.notify(stockChangeNotice(kind, e, i.stock, next), i.employeeId);
        if (kind === 'CANCELLED') {
          this.db.issues = this.db.issues.filter((x) => x.id !== i.id);
          const why = next.cancelNote ? ` (${next.cancelNote})` : '';
          const what = next.cancelNote?.startsWith('ไม่อนุมัติ') ? 'ผู้อนุมัติในระบบสต็อกไม่อนุมัติใบ' : 'คลังยกเลิกใบ';
          this.log('UNIFORM_ISSUE', 'CANCEL', i.id, `${what} ${i.stock.docNo}${why} — ชุดฟอร์มของ ${who} กลับเป็นค้างแจก`, i.employeeId);
          continue;
        }
        i.stock = next;
        i.size = stockSizes(next);
        i.qty = uniformLines(next).reduce((s2, x) => s2 + x.qty, 0) || i.qty;
        if (next.issuedAt) i.issuedAt = next.issuedAt.slice(0, 10);
        if (kind === 'APPROVED') this.log('UNIFORM_ISSUE', 'UPDATE', i.id, `ผู้อนุมัติในระบบสต็อกอนุมัติใบ ${next.docNo} ของ ${who} แล้ว — รอคลังจ่าย`, i.employeeId);
        if (kind === 'ISSUED') this.log('UNIFORM_ISSUE', 'UPDATE', i.id, `คลังจ่ายชุดฟอร์มตามใบ ${next.docNo} ให้ ${who} แล้ว`, i.employeeId);
        if (kind === 'RECEIVED') this.log('UNIFORM_ISSUE', 'UPDATE', i.id, `${who} เซ็นรับชุดฟอร์มตามใบ ${next.docNo} แล้ว`, i.employeeId);
      }
      if (changed) this.persist();
      return { changed };
    });
  }
  // ---------- การแจ้งเตือน (กระดิ่ง) ----------
  listNotifications({ before, limit = 10 } = {}) {
    return this.run(() => {
      const all = [...(this.db.notifications ?? [])].sort((a, b) => b.id - a.id);
      const rows = all.filter((n) => !before || n.id < before);
      const items = rows.slice(0, Math.max(1, Math.min(limit, 30)));
      return {
        items,
        unread: all.filter((n) => !n.read).length,
        total: all.length,
        hasMore: rows.length > items.length,
        nextBefore: items.length ? items[items.length - 1].id : null,
      };
    });
  }
  notificationUnread() {
    return this.run(() => ({ unread: (this.db.notifications ?? []).filter((n) => !n.read).length }));
  }
  readNotification(id) {
    return this.run(() => {
      const n = (this.db.notifications ?? []).find((x) => x.id === id);
      if (n && !n.read) {
        n.read = true;
        this.persist();
      }
      return { unread: (this.db.notifications ?? []).filter((x) => !x.read).length };
    });
  }
  readAllNotifications() {
    return this.run(() => {
      for (const n of this.db.notifications ?? []) n.read = true;
      this.persist();
      return { unread: 0 };
    });
  }
  listUniformPending() {
    return this.run(() => {
      const { employees, sites, rules, issues } = this.db;
      return buildUniformPending(employees, sites, rules, issues, this.today());
    });
  }
  // ---------- เข้าสู่ระบบ (mock) ----------
  /** ชื่อผู้ใช้ที่บันทึกในกิจกรรม — ตั้งจาก session หลัง login */
  actor = 'HR (mock)';

  setActor(name) {
    this.actor = name || 'HR (mock)';
  }

  async login(username, password) {
    await new Promise((r) => setTimeout(r, 700)); // จำลองเวลาตรวจสอบ ให้เห็นสถานะกำลังเข้าสู่ระบบ
    const u = MOCK_USERS.find((x) => x.username === String(username).trim().toLowerCase() && x.password === password);
    if (!u) throw new ApiError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401);
    return { username: u.username, name: u.name, role: u.role };
  }

  async logout() {}

  /** บัญชีทดลองสำหรับแสดงบนหน้า login (เฉพาะ mock) */
  demoAccounts() {
    return MOCK_USERS.map(({ username, password, role }) => ({ username, password, role }));
  }

  reset() {
    return this.run(() => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      this.db = buildSeed(this.today());
    });
  }
}
