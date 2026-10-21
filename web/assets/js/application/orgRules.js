// ตั้งค่าองค์กร (sites.html) — กฎตรวจบริษัท / ประเภทพนักงาน + นับการใช้งาน
// คู่กับ backend/api/org.php (แก้ที่หนึ่งต้องแก้อีกที่)
import { ruleTimeline } from '../domain/ruleVersions.js';
import { TYPE_TONES } from '../domain/catalog.js';

const fold = (s) => String(s ?? '').trim().toLocaleLowerCase('th');

/**
 * บริษัท — code เปลี่ยนไม่ได้หลังสร้าง (พนักงาน/หน่วยงาน/สิทธิ์ผู้ใช้อ้างถึง)
 * @param {{code:string, name:string, legalName?:string, color?:string}} c
 * @param {{code:string}[]} all  บริษัททั้งหมด
 * @param {boolean} creating
 */
export function validateCompany(c, all, creating) {
  const x = {};
  const code = String(c.code ?? '').trim().toUpperCase();
  if (creating) {
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(code)) x.code = 'รหัส 2–10 ตัว: ตัวอักษรอังกฤษพิมพ์ใหญ่ / ตัวเลข ขึ้นต้นด้วยตัวอักษร';
    else if (all.some((o) => o.code === code)) x.code = 'มีบริษัทรหัสนี้แล้ว';
  }
  const name = String(c.name ?? '').trim();
  if (!name) x.name = 'กรุณากรอกชื่อบริษัท';
  else if ([...name].length > 150) x.name = 'ชื่อยาวเกิน 150 ตัวอักษร';
  if ([...String(c.legalName ?? '').trim()].length > 200) x.legalName = 'ชื่อตามทะเบียนยาวเกิน 200 ตัวอักษร';
  if (c.color && !/^#[0-9a-fA-F]{6}$/.test(c.color)) x.color = 'สีต้องเป็นรูปแบบ #rrggbb';
  return x;
}

/**
 * ประเภทพนักงาน
 * @param {object} t  { code, name, description, companies: string[]|null, usesDeptGroup, usesPosition, dailyCycle, tone }
 * @param {{code:string, name:string}[]} all
 * @param {string[]} companyCodes
 * @param {boolean} creating
 */
export function validateEmployeeType(t, all, companyCodes, creating) {
  const x = {};
  const code = String(t.code ?? '').trim().toUpperCase();
  if (creating) {
    if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(code)) x.code = 'รหัส 2–20 ตัว: ตัวอักษรอังกฤษพิมพ์ใหญ่ / ตัวเลข / _ ขึ้นต้นด้วยตัวอักษร';
    else if (all.some((o) => o.code === code)) x.code = 'มีประเภทรหัสนี้แล้ว';
  }
  const name = String(t.name ?? '').trim();
  if (!name) x.name = 'กรุณากรอกชื่อประเภท';
  else if ([...name].length > 100) x.name = 'ชื่อยาวเกิน 100 ตัวอักษร';
  else if (all.some((o) => o.code !== code && fold(o.name) === fold(name))) x.name = 'มีประเภทชื่อนี้แล้ว';
  if ([...String(t.description ?? '').trim()].length > 255) x.description = 'คำอธิบายยาวเกิน 255 ตัวอักษร';
  if (t.companies !== null && !(Array.isArray(t.companies) && t.companies.length && t.companies.every((c) => companyCodes.includes(c)))) {
    x.companies = 'เลือกบริษัทอย่างน้อย 1 บริษัท หรือ "ทุกบริษัท"';
  }
  if (!TYPE_TONES.includes(t.tone)) x.tone = 'เลือกสีป้าย';
  return x;
}

/** กฎ (ใช้อยู่ + รอมีผล) ที่อ้างถึง — pick(rule) คืนรายการค่าที่กฎนั้นอ้าง */
function liveRuleIds(revisions, today, pick) {
  const use = new Map();
  for (const t of ruleTimeline(revisions, today)) {
    for (const r of [...t.pending, ...(t.current ? [t.current] : [])]) {
      if (r.deleted) continue;
      for (const v of pick(r)) {
        if (!use.has(v)) use.set(v, new Set());
        use.get(v).add(t.id);
      }
    }
  }
  return use;
}

/** รหัสบริษัท → จำนวนกฎ (ประกัน + ชุดฟอร์ม) ที่ใช้อยู่ / รอมีผล ที่ระบุบริษัทนี้ */
export function companyRuleUsage(history, today) {
  const out = new Map();
  for (const kind of ['insurance', 'uniform']) {
    for (const [code, ids] of liveRuleIds(history[kind], today, (r) => r.companies ?? [])) out.set(code, (out.get(code) ?? 0) + ids.size);
  }
  return out;
}

/** รหัสประเภท → จำนวนกฎ (ประกัน + ชุดฟอร์ม) ที่ใช้อยู่ / รอมีผล */
export function typeRuleUsage(history, today) {
  const out = new Map();
  for (const kind of ['insurance', 'uniform']) {
    for (const [code, ids] of liveRuleIds(history[kind], today, (r) => [r.employeeType])) out.set(code, (out.get(code) ?? 0) + ids.size);
  }
  return out;
}

/** ข้อความ "ลบไม่ได้ — ยังมี…" จากจำนวนที่ใช้ · ไม่มีใครใช้ = null */
export function inUseMessage(parts) {
  const why = parts.filter(([n]) => n > 0).map(([n, label]) => `${label} ${n}`);
  return why.length ? `ลบไม่ได้ — ยังมี${why.join(' · ')} ที่ใช้อยู่` : null;
}
