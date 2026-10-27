// สร้าง seed ของฐานข้อมูล hl_welfare + ไฟล์คำตอบอ้างอิง (golden) จากข้อมูลจำลองชุดเดียวกับ MockApi
//
//   node scripts/export-seed.mjs [YYYY-MM-DD]      (ค่าเริ่มต้น = วันที่ของ seed ที่ใช้ในเทสต์)
//
// ผลลัพธ์
//   backend/sql/002_seed_master.sql  บริษัท หน่วยงาน กฎ ตั้งค่า แบบฟอร์มประกัน (ข้อมูลตั้งต้นที่ใช้จริง)
//   backend/sql/003_seed_demo.sql    พนักงาน/ประวัติจำลอง (ใช้ทดลอง/เทสต์ — ไม่ต้องรันบนระบบจริง)
//   backend/tests/fixtures/golden.json  คำตอบของ MockApi ณ วันที่นั้น — PHP ต้องตอบเหมือนกันทุกตัว (tests/run.php)
//
// วันที่ใน seed ขึ้นกับ "วันนี้" (เช่น เริ่มงาน 12 วันก่อน) ไฟล์ทั้งสามจึงต้องสร้างจากวันเดียวกัน
import { writeFileSync } from 'node:fs';
import { buildSeed } from '../web/assets/js/infrastructure/mock/seed.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';

export const SEED_DATE = '2026-10-19';
const today = process.argv[2] ?? SEED_DATE;
const SYSTEM = 'system';
const NOW = `${today} 00:00:00`;

const q = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0')}'`;
};
const json = (v) => (v === null || v === undefined ? null : JSON.stringify(v));
const audit = [NOW, SYSTEM, SYSTEM];
const insert = (table, cols, rows) => {
  if (!rows.length) return '';
  const all = [...cols, 'created_at', 'created_by', 'updated_by'];
  const out = [];
  for (let i = 0; i < rows.length; i += 50) {
    out.push(`INSERT INTO \`${table}\` (${all.map((c) => `\`${c}\``).join(', ')}) VALUES\n` +
      rows.slice(i, i + 50).map((r) => `  (${[...r, ...audit].map(q).join(', ')})`).join(',\n') + ';');
  }
  return out.join('\n') + '\n\n';
};
const header = (name, what) => `-- ============================================================
--  ${name} — ${what}
--  สร้างโดย scripts/export-seed.mjs ${today} (ห้ามแก้มือ — แก้ที่ web/assets/js/infrastructure/mock/ แล้วสร้างใหม่)
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/${name}
-- ============================================================

SET NAMES utf8;

`;

const db = buildSeed(today);

// ---------- 002 ข้อมูลตั้งต้น ----------
let master = header('002_seed_master.sql', 'บริษัท หน่วยงาน กฎสวัสดิการ ตั้งค่า แบบฟอร์มประกัน');
master += insert('companies', ['code', 'name', 'legal_name', 'sort_order'], db.companies.map((c, i) => [c.code, c.name, c.legalName ?? '', i + 1]));
master += insert('sites', ['id', 'company_code', 'name', 'has_group_insurance', 'polo_color'],
  db.sites.map((s) => [s.id, s.companyCode, s.name, s.hasGroupInsurance, s.poloColor]));
master += insert('insurance_rules', ['id', 'employee_type', 'companies', 'wait_days', 'exclude_contracts', 'require_site_insurance', 'note'],
  db.rules.insurance.map((r) => [r.id, r.employeeType, json(r.companies), r.waitDays, json(r.excludeContracts), r.requireSiteInsurance, r.note]));
master += insert('uniform_items', ['code', 'name', 'sort_order'], db.rules.uniformItems.map((u, i) => [u.code, u.name, i + 1]));
master += insert('uniform_rules',
  ['id', 'employee_type', 'companies', 'dept_groups', 'position', 'level_min', 'level_max', 'style', 'logo', 'items', 'polo_by_site', 'qty_start', 'qty_start_label', 'qty_probation', 'qty_annual', 'note'],
  db.rules.uniform.map((r) => [r.id, r.employeeType, json(r.companies), json(r.deptGroups), r.position, r.levelMin, r.levelMax, r.style, r.logo ?? null,
    json(r.items), r.poloBySite, r.qtyStart, r.qtyStartLabel ?? null, r.qtyProbation, r.qtyAnnual, r.note]));
master += insert('settings', ['key', 'value'], Object.entries(db.rules.settings).map(([k, v]) => [k, String(v)]));
master += insert('insurer_forms', ['id', 'name', 'short_name', 'active', 'form_json'], db.insurers.map((f) => {
  const { id, name, shortName, active, ...rest } = f;
  return [id, name, shortName, active, JSON.stringify(rest)];
}));
writeFileSync('backend/sql/002_seed_master.sql', master);

// ---------- 003 ข้อมูลจำลอง ----------
let demo = header('003_seed_demo.sql', 'พนักงานและประวัติจำลอง (ทดลอง/เทสต์เท่านั้น ไม่ต้องรันบนระบบจริง)');
demo += insert('employees',
  ['id', 'emp_code', 'first_name', 'last_name', 'company_code', 'site_id', 'employee_type', 'contract_type', 'dept_group', 'position', 'level',
    'birth_date', 'start_date', 'probation_pass_date', 'status', 'last_working_date', 'end_date', 'end_reason', 'title', 'gender', 'national_id', 'phone', 'email'],
  db.employees.map((e) => [e.id, e.empCode, e.firstName, e.lastName, e.companyCode, e.siteId, e.employeeType, e.contractType, e.deptGroup, e.position, e.level,
    e.birthDate, e.startDate, e.probationPassDate, e.status, e.lastWorkingDate, e.endDate, e.endReason, e.title, e.gender, e.nationalId, e.phone, e.email]));
demo += insert('insurance_batches', ['id', 'cycle_date', 'insurer_id', 'insurer_name', 'submitted_at', 'submitted_by_user_id', 'submitted_by_name'],
  db.batches.map((b) => [b.id, b.cycleDate, b.insurerId, b.insurerName, b.submittedAt.replace('T', ' '), null, b.submittedBy]));
demo += insert('insurance_batch_items', ['batch_id', 'seq', 'employee_id', 'type', 'direction'],
  db.batches.flatMap((b) => b.items.map((it, i) => [b.id, i + 1, it.employeeId, it.type, it.type === 'IN' ? 'IN' : 'OUT'])));
demo += insert('uniform_issues', ['id', 'employee_id', 'entitlement_key', 'event', 'qty', 'size', 'issued_at', 'issued_by_user_id', 'issued_by_name', 'source'],
  db.issues.map((i) => [i.id, i.employeeId, i.entitlementKey, i.event, i.qty, i.size, i.issuedAt, null, i.issuedBy, 'MANUAL']));
demo += insert('audit_log', ['id', 'entity', 'entity_id', 'action', 'summary', 'employee_id', 'user_id', 'user_name', 'at'],
  db.activities.map((a) => [a.id, a.entity, a.entityId, a.action, a.summary, a.employeeId, null, a.user, a.at.replace('T', ' ')]));
writeFileSync('backend/sql/003_seed_demo.sql', demo);

// ---------- golden: คำตอบของ MockApi ณ วันเดียวกัน ----------
const api = new MockApi(() => today, null);
api.db = buildSeed(today);
const golden = { today, reads: {} };
const g = async (name, fn) => (golden.reads[name] = await fn());
await g('dashboard', () => api.getDashboard());
await g('workQueue', () => api.getWorkQueue());
await g('companies', () => api.listCompanies());
await g('sites', () => api.listSites());
await g('employees', () => api.listEmployees());
await g('employees?q=สม&company=HL', () => api.listEmployees({ q: 'สม', companyCode: 'HL' }));
await g('employees?type=DAILY&status=ACTIVE', () => api.listEmployees({ employeeType: 'DAILY', status: 'ACTIVE' }));
await g('rules', () => api.getRules());
golden.benefits = {};
for (const e of db.employees) golden.benefits[e.id] = await api.getEmployeeBenefits(e.id);
golden.cycles = {};
for (const c of ['2026-08-05', '2026-09-05', '2026-10-05', '2026-10-06', '2026-11-05', '2026-11-06', '2026-12-05']) golden.cycles[c] = await api.getInsuranceCycle(c);
await g('batches', () => api.listInsuranceBatches());
golden.batchDetail = {};
const ids = db.batches.map((b) => b.id);
for (const id of [...ids.slice(0, 3), ...ids.slice(-3)]) golden.batchDetail[id] = await api.getInsuranceBatch(id);
await g('batchExport:last', () => api.exportInsuranceBatch(ids[ids.length - 1]));
await g('insurers', () => api.listInsurers());
await g('export:2026-11-05:1', () => api.exportInsurance({ cycleDate: '2026-11-05', insurerId: 1, record: false }));
await g('export:2026-10-05:1', () => api.exportInsurance({ cycleDate: '2026-10-05', insurerId: 1, record: false }));
await g('issues', () => api.listUniformIssues());
await g('issues?employeeId=1', () => api.listUniformIssues(1));
await g('pending', () => api.listUniformPending());
await g('activity', () => api.listActivity());
await g('activity?entity=UNIFORM_ISSUE&limit=15', () => api.listActivity({ entity: 'UNIFORM_ISSUE', limit: 15 }));
await g('activity?employeeId=30', () => api.listActivity({ employeeId: 30 }));
writeFileSync('backend/tests/fixtures/golden.json', JSON.stringify(golden));
console.log(`seed ${today}: ${db.employees.length} employees, ${db.batches.length} batches, ${db.issues.length} issues, ${db.activities.length} activities`);
