import { ApiError } from '../../application/errors.js';
import { buildDashboard } from '../../application/usecases/dashboard.js';
import { buildBatchDetail, buildInsuranceCycle, employeeLite, sentIndex } from '../../application/usecases/insuranceCycle.js';
import { buildInsurerExport } from '../../application/usecases/insurerExport.js';
import { buildUniformPending } from '../../application/usecases/uniformPending.js';
import { validateBindings, validateInsurerForm } from '../../application/insurerFormRules.js';
import { buildWorkQueue } from '../../application/usecases/workQueue.js';
import { todayISO } from '../../domain/date.js';
import { benefitsOf } from '../../domain/eligibility.js';
import { BATCH_TYPE_LABEL, UNIFORM_EVENT_LABEL } from '../../domain/labels.js';
import { pvdStatus } from '../../domain/pvd.js';
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
        return s.db;
      }
    }
  } catch {
    /* localStorage ใช้ไม่ได้ → ใช้ seed ใหม่ */
  }
  return buildSeed(today);
}

const nextId = (xs) => Math.max(0, ...xs.map((x) => x.id)) + 1;

const nowStamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${todayISO(d)}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const fullName = (e) => `${e.firstName} ${e.lastName}`;

/** WelfareApi ในหน่วยความจำ + localStorage — ใช้ domain/use-case ชุดเดียวกับ PHP */
export class MockApi {
  db;
  today;
  constructor(today = () => todayISO()) {
    this.today = today;
    this.db = load(this.today());
  }
  // ---------- helpers ----------
  async run(fn) {
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    return structuredClone(fn());
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
      const site = { ...input, name: input.name.trim(), id: nextId(this.db.sites) };
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
        this.db.batches.some((b) => b.employeeIds.includes(id)) || this.db.issues.some((i) => i.employeeId === id);
      if (hasHistory) throw new ApiError('ลบไม่ได้ — มีประวัติแจ้งประกัน/แจกชุดแล้ว ให้ใช้ “บันทึกพ้นสภาพ” แทน', 409);
      this.db.employees = this.db.employees.filter((x) => x.id !== id);
      this.log('EMPLOYEE', 'DELETE', id, `ลบพนักงาน ${fullName(e)} (${e.empCode})`);
      this.persist();
    });
  }
  getRules() {
    return this.run(() => this.db.rules);
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
        .map((b) => ({ ...b, employees: b.employeeIds.map((id) => byId.get(id)).filter(Boolean).map(employeeLite) }));
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
      const sent = sentIndex(this.db.batches)[input.type === 'IN' ? 'IN' : 'OUT'];
      const already = input.employeeIds.filter((id) => sent.has(id)).length;
      if (already > 0) throw new ApiError(`มีพนักงานที่ถูกแจ้งไปแล้ว ${already} ราย`, 409);
      const batch = { id: nextId(this.db.batches), ...input, submittedAt: nowStamp(), submittedBy: this.actor };
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
        `ยกเลิก${BATCH_TYPE_LABEL[b.type]} #${id} (${b.employeeIds.length} ราย)`,
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
      const created = [];
      for (const type of ['IN', 'OUT', 'URGENT']) {
        const ids = all.filter((r) => r.type === type).map((r) => r.employee.id);
        if (!ids.length) continue;
        const batch = {
          id: nextId(this.db.batches),
          cycleDate,
          type,
          employeeIds: ids,
          submittedAt: nowStamp(),
          submittedBy: this.actor,
          insurerId,
          insurerName: insurer.shortName,
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
  listPvdMembers() {
    return this.run(() => {
      const today = this.today();
      const rows = [];
      for (const employee of this.db.employees) {
        const pvd = pvdStatus(employee, this.db.rules, today);
        if (pvd.eligible) rows.push({ employee, pvd });
      }
      return rows.sort((a, b) => (a.pvd.joinDate ?? '').localeCompare(b.pvd.joinDate ?? ''));
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
  createUniformIssue(input) {
    return this.run(() => {
      const e = this.employee(input.employeeId);
      if (!input.size.trim()) throw new ApiError('กรุณาเลือกไซซ์', 422);
      if (this.db.issues.some((i) => i.employeeId === input.employeeId && i.entitlementKey === input.entitlementKey)) {
        throw new ApiError('รายการนี้แจกไปแล้ว', 409);
      }
      const issue = { ...input, id: nextId(this.db.issues), issuedBy: this.actor };
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
  cancelUniformIssue(id) {
    return this.run(() => {
      const i = this.db.issues.find((x) => x.id === id);
      if (!i) throw new ApiError('ไม่พบรายการแจก', 404);
      const e = this.db.employees.find((x) => x.id === i.employeeId);
      this.db.issues = this.db.issues.filter((x) => x.id !== id);
      this.log(
        'UNIFORM_ISSUE',
        'CANCEL',
        id,
        `ยกเลิกการแจกชุดฟอร์ม (${UNIFORM_EVENT_LABEL[i.event]}) ของ ${e ? fullName(e) : `#${i.employeeId}`}`,
        i.employeeId,
      );
      this.persist();
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
