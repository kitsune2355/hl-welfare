// บริษัท + ประเภทพนักงาน ที่ตั้งค่าได้ (sites.html · sql/015) — คู่แฝดของส่วนต้นใน backend/domain/labels.php
//
// ค่าที่ export (COMPANY_CODES, EMPLOYEE_TYPES, EMPLOYEE_TYPE_LABEL, EMPLOYEE_TYPE_TONE) เป็นตัวเดียวกันทั้งระบบ
// applyCatalog() แก้ "ในที่" (ไม่สร้างตัวใหม่) → ทุกโมดูลที่ import ไปแล้วเห็นค่าล่าสุดทันที
// หน้าเว็บโหลดจาก API ก่อนวาดหน้า (app/catalog.js ผ่าน app/shell.js) · node / MockApi ที่ไม่ได้โหลด = ค่าตั้งต้น (พฤติกรรมเดิม)
//
// พฤติกรรมตามประเภท (แทนการเช็กรหัสในโค้ด):
//   companies      ใช้ได้เฉพาะบริษัทเหล่านี้ · null = ทุกบริษัท   (เดิม: Pro Site ต้องเป็น PRO)
//   usesDeptGroup  ต้องมีกลุ่ม / ฝ่าย + ระดับ                      (เดิม: ส่วนกลาง)
//   usesPosition   เก็บตำแหน่ง — ใช้จับกฎชุดฟอร์มตามตำแหน่ง       (เดิม: Pro Site)
//   dailyCycle     แจ้งประกันรอบรายวัน (ค่าตั้ง insuranceCycleDayDaily) (เดิม: รายวัน)

/** สีป้ายประเภทที่เลือกได้ (= ui/components.js badge tone) */
export const TYPE_TONES = ['primary', 'info', 'success', 'warning', 'danger', 'neutral'];
/** สีบริษัทเมื่อไม่ได้ตั้ง — ตามลำดับบริษัท */
const COMPANY_PALETTE = ['#2563eb', '#0891b2', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#6366f1', '#84cc16', '#ec4899'];

export const DEFAULT_COMPANIES = [
  { code: 'HL', name: 'แฮปปี้แลนด์ (HL)', legalName: 'บริษัท แฮปปี้แลนด์ จำกัด', color: '#2563eb' },
  { code: 'PRO', name: 'PRO', legalName: 'บริษัท โปรแอ็คทีฟ แมเนจเม้นท์ จำกัด', color: '#0891b2' },
  { code: 'CNS', name: 'CNS', legalName: 'บริษัท คลีนนิ่ง โซลูชั่น จำกัด', color: '#10b981' },
  { code: 'CIC', name: 'CIC', legalName: 'บริษัท คอน.อิน.คอน จำกัด', color: '#f59e0b' },
  { code: 'AS', name: 'AS', legalName: 'บริษัท อาเชี่ยน คอนสตรั๊คชั่น จำกัด', color: '#8b5cf6' },
];

export const DEFAULT_EMPLOYEE_TYPES = [
  { code: 'CENTRAL', name: 'ส่วนกลาง', description: 'พนักงานสำนักงาน — มีกลุ่ม / ฝ่าย และระดับ', companies: null, usesDeptGroup: true, usesPosition: false, dailyCycle: false, tone: 'primary' },
  { code: 'PRO_SITE', name: 'Pro Site', description: 'พนักงานประจำโครงการของ PRO — แยกชุดฟอร์มตามตำแหน่ง', companies: ['PRO'], usesDeptGroup: false, usesPosition: true, dailyCycle: false, tone: 'info' },
  { code: 'DAILY', name: 'รายวัน', description: 'พนักงานรายวัน — แจ้งประกันรอบรายวัน', companies: null, usesDeptGroup: false, usesPosition: false, dailyCycle: true, tone: 'warning' },
  { code: 'MAID_CNS', name: 'แม่บ้าน CNS', description: 'แม่บ้านของ CNS — ประกันกลุ่มตามหน่วยงาน', companies: null, usesDeptGroup: false, usesPosition: false, dailyCycle: false, tone: 'neutral' },
  { code: 'FIXED_TERM', name: 'สัญญาแบบมีกำหนดระยะเวลา', description: 'พนักงานสัญญาจ้างที่มีวันสิ้นสุดสัญญา', companies: null, usesDeptGroup: false, usesPosition: false, dailyCycle: false, tone: 'success' },
];

/** @type {string[]} รหัสบริษัทตามลำดับ */
export const COMPANY_CODES = [];
/** @type {string[]} รหัสประเภทตามลำดับ */
export const EMPLOYEE_TYPES = [];
/** @type {Record<string, string>} */
export const EMPLOYEE_TYPE_LABEL = {};
/** @type {Record<string, string>} */
export const EMPLOYEE_TYPE_TONE = {};

let companies = [];
let types = [];

const refill = (arr, values) => arr.splice(0, arr.length, ...values);
const refillObj = (obj, entries) => {
  for (const k of Object.keys(obj)) delete obj[k];
  Object.assign(obj, Object.fromEntries(entries));
};

/** ใช้รายการชุดใหม่ (ส่งเฉพาะส่วนที่มี) */
export function applyCatalog({ companies: cs, employeeTypes: ts } = {}) {
  if (Array.isArray(cs)) {
    companies = cs.map((c) => ({ ...c }));
    refill(COMPANY_CODES, companies.map((c) => c.code));
  }
  if (Array.isArray(ts)) {
    types = ts.map((t) => ({ ...t, companies: t.companies ?? null }));
    refill(EMPLOYEE_TYPES, types.map((t) => t.code));
    refillObj(EMPLOYEE_TYPE_LABEL, types.map((t) => [t.code, t.name]));
    refillObj(EMPLOYEE_TYPE_TONE, types.map((t) => [t.code, TYPE_TONES.includes(t.tone) ? t.tone : 'neutral']));
  }
}
applyCatalog({ companies: DEFAULT_COMPANIES, employeeTypes: DEFAULT_EMPLOYEE_TYPES });

export const companyList = () => companies;
export const employeeTypeList = () => types;
export const companyOf = (code) => companies.find((c) => c.code === code) ?? null;
/** พฤติกรรมของประเภท · ไม่รู้จัก = null */
export const typeInfo = (code) => types.find((t) => t.code === code) ?? null;
/** ประเภทนี้ใช้กับบริษัทนี้ได้ไหม */
export const typeAllows = (code, companyCode) => {
  const t = typeInfo(code);
  return !!t && (t.companies === null || t.companies.includes(companyCode));
};
/** ประเภทที่ใช้กับบริษัทนี้ได้ (ตามลำดับ) */
export const typesFor = (companyCode) => types.filter((t) => t.companies === null || t.companies.includes(companyCode)).map((t) => t.code);
/** เปิดใช้งานไหม (sql/018 — ปิดแล้ว: ข้อมูลเดิมใช้ต่อ แต่เลือกใหม่ไม่ได้) */
export const isCompanyActive = (code) => companyOf(code)?.active !== false;
export const isTypeActive = (code) => typeInfo(code)?.active !== false;
/** ประเภทตั้งต้นของแถวใหม่ / เมื่อประเภทเดิมใช้กับบริษัทไม่ได้ — ประเภทแรกที่ใช้ได้ (ที่เปิดใช้งานก่อน) */
export const defaultTypeFor = (companyCode) => typesFor(companyCode).find(isTypeActive) ?? typesFor(companyCode)[0] ?? types[0]?.code ?? 'CENTRAL';
/** สีบริษัท (แถบพนักงานหน้าภาพรวม) — ไม่ได้ตั้ง = สีตามลำดับ */
export const companyColor = (code) => companyOf(code)?.color || COMPANY_PALETTE[Math.max(0, COMPANY_CODES.indexOf(code)) % COMPANY_PALETTE.length];
