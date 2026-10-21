// ตรวจข้อมูลกฎสวัสดิการก่อนบันทึก — ตรงกับ backend/api/rules_edit.php (แก้ที่หนึ่งต้องแก้อีกที่)
// คืน { field: 'ข้อความ' } — ว่าง = ผ่าน (หน้าเงื่อนไขสวัสดิการใช้แสดงช่องสีแดงทันที เซิร์ฟเวอร์ตรวจซ้ำ)
import { UNIFORM_EVENTS } from '../domain/uniform.js';

import { EMPLOYEE_TYPES } from '../domain/catalog.js';

export { EMPLOYEE_TYPES };
export const CONTRACT_TYPES = ['REGULAR', 'SHORT_3PCT'];
export const LEVEL_RANGE = [1, 9];
export const QTY_MAX = 20;

/** ค่าตั้งค่าที่แก้ได้: [ต่ำสุด, สูงสุด, ชื่อ, หน่วย] */
export const SETTING_SPEC = {
  insuranceMaxAge: [50, 80, 'อายุสูงสุดประกันกลุ่ม', 'ปี'],
  insuranceCycleDay: [1, 28, 'วันที่รอบแจ้งประกัน', 'ของเดือน'],
  insuranceCycleDayDaily: [1, 28, 'วันที่รอบแจ้งประกันพนักงานรายวัน', 'ของเดือน'],
  absentExtraDays: [0, 60, 'วันบวกเพิ่มกรณีขาดงาน 3 วัน', 'วัน'],
  uniformAnnualMonth: [1, 12, 'เดือนแจกชุดประจำปี', ''],
};

const isInt = (v, min, max) => Number.isInteger(Number(v)) && v !== '' && v !== null && Number(v) >= min && Number(v) <= max;

export function validateInsuranceRule(r, { companies }) {
  const x = {};
  if (!EMPLOYEE_TYPES.includes(r.employeeType)) x.employeeType = 'กรุณาเลือกประเภทพนักงาน';
  if (r.companies !== null && !(Array.isArray(r.companies) && r.companies.length && r.companies.every((c) => companies.includes(c)))) {
    x.companies = 'เลือกบริษัทอย่างน้อย 1 บริษัท หรือ "ทุกบริษัท"';
  }
  if (!isInt(r.waitDays, 1, 365)) x.waitDays = 'อายุงานต้องเป็นจำนวนวัน 1–365';
  if (!(r.excludeContracts ?? []).every((c) => CONTRACT_TYPES.includes(c))) x.excludeContracts = 'ประเภทสัญญาไม่ถูกต้อง';
  return x;
}

/** จำนวนต่อรายการต่อรอบ — คืนข้อความผิดพลาด หรือ '' */
export function quantitiesError(q, items) {
  if (!q || typeof q !== 'object') return 'กรุณาระบุจำนวนชุดฟอร์ม';
  let total = 0;
  for (const ev of UNIFORM_EVENTS) {
    for (const [code, n] of Object.entries(q[ev] ?? {})) {
      if (!items.includes(code)) return `ไม่รู้จักรายการชุดฟอร์ม ${code}`;
      if (!isInt(n, 0, QTY_MAX)) return `จำนวนต้องเป็นจำนวนเต็ม 0–${QTY_MAX}`;
      total += Number(n);
    }
  }
  return total === 0 ? 'ต้องได้ชุดฟอร์มอย่างน้อย 1 ชิ้นในรอบใดรอบหนึ่ง' : '';
}

export function validateUniformRule(r, { companies, items }) {
  const x = {};
  if (!EMPLOYEE_TYPES.includes(r.employeeType)) x.employeeType = 'กรุณาเลือกประเภทพนักงาน';
  if (!(Array.isArray(r.companies) && r.companies.length && r.companies.every((c) => companies.includes(c)))) x.companies = 'เลือกบริษัทอย่างน้อย 1 บริษัท';
  if (r.deptGroups !== null && !(Array.isArray(r.deptGroups) && r.deptGroups.length)) x.deptGroups = 'เลือกกลุ่ม/ฝ่ายอย่างน้อย 1 กลุ่ม หรือ "ทุกกลุ่ม"';
  for (const k of ['levelMin', 'levelMax']) if (r[k] !== null && !isInt(r[k], ...LEVEL_RANGE)) x[k] = 'ระดับต้องเป็น 1–9';
  if (!x.levelMin && !x.levelMax && r.levelMin !== null && r.levelMax !== null && Number(r.levelMin) > Number(r.levelMax)) {
    x.levelMax = 'ระดับสูงสุดต้องไม่น้อยกว่าระดับต่ำสุด';
  }
  if (!r.style?.trim()) x.style = 'กรุณาระบุชื่อแบบชุดฟอร์ม';
  const q = quantitiesError(r.quantities, items);
  if (q) x.quantities = q;
  return x;
}

export function validateSettings(values) {
  const x = {};
  for (const [k, v] of Object.entries(values)) {
    const s = SETTING_SPEC[k];
    if (!s) x[k] = 'ไม่รู้จักค่าตั้งค่านี้';
    else if (!isInt(v, s[0], s[1])) x[k] = `${s[2]}ต้องเป็นตัวเลข ${s[0]}–${s[1]}`;
  }
  return x;
}
