// โอนย้าย (บริษัท / หน่วยงาน / ประเภท) และเปลี่ยนรหัสพนักงาน — มีวันที่มีผล เก็บประวัติ (คู่แฝด backend/api/employee_changes.php)
//
//   บันทึก = แก้ข้อมูลพนักงานเป็นค่าใหม่ + เก็บรายการ { from, to, effectiveDate, notifyInsurer, note }
//   ประกันกลุ่มคำนวณจากประวัติ (domain/insuranceEvents.js): อายุงานนับต่อ · ย้ายแบบแจ้งประกัน = ออก (วันก่อนย้าย) + เข้า (วันย้าย)
//   ลบได้เฉพาะรายการล่าสุดที่ยังไม่อยู่ในไฟล์ที่ส่งออกแล้ว → ข้อมูลพนักงานกลับเป็นค่าเดิม
import { isCompanyActive, isTypeActive, typeAllows, typeInfo } from '../../domain/catalog.js';
import { CHANGE_FIELDS, isTransfer } from '../../domain/insuranceEvents.js';
import { validateEmployee } from '../employeeRules.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** ค่าที่การเปลี่ยนแปลงเก็บ (บริษัท / หน่วยงาน / ประเภท / รหัส) */
export const changeFieldsOf = (e) => Object.fromEntries(CHANGE_FIELDS.map((k) => [k, e[k]]));

/** ชนิดของการเปลี่ยนแปลง: ย้าย (บริษัท/หน่วยงาน/ประเภทเปลี่ยน) หรือเปลี่ยนรหัสอย่างเดียว */
export const changeKind = (from, to) => (isTransfer({ from, to }) ? 'TRANSFER' : 'CODE');

/**
 * ตรวจคำขอ — คืน errors รายช่อง (ว่าง = ผ่าน)
 * @param {object} emp  พนักงาน (ค่าปัจจุบัน)
 * @param {{effectiveDate, companyCode, siteId, employeeType, empCode, notifyInsurer, note}} input
 * @param {{sites: object[], employees: object[], changes: object[], companies?: object[], types?: object[]}} ctx
 */
export function validateEmployeeChange(emp, input, { sites, employees, changes }) {
  const x = {};
  const to = { companyCode: input.companyCode, siteId: Number(input.siteId), employeeType: input.employeeType, empCode: String(input.empCode ?? '').trim() };
  if (emp.status !== 'ACTIVE') x.effectiveDate = 'พนักงานพ้นสภาพแล้ว — โอนย้าย / เปลี่ยนรหัสไม่ได้';
  if (!ISO.test(input.effectiveDate ?? '')) x.effectiveDate = 'กรุณาระบุวันที่มีผล';
  else if (input.effectiveDate <= emp.startDate) x.effectiveDate = 'วันที่มีผลต้องหลังวันเริ่มงาน';
  else {
    const last = changes.filter((c) => c.employeeId === emp.id).reduce((m, c) => (c.effectiveDate > m ? c.effectiveDate : m), '');
    if (last && input.effectiveDate <= last) x.effectiveDate = `ต้องหลังการเปลี่ยนแปลงครั้งก่อน (${last})`;
  }
  const site = sites.find((s) => s.id === to.siteId);
  if (!site) x.siteId = 'กรุณาเลือกหน่วยงาน';
  else if (site.companyCode !== to.companyCode) x.siteId = 'หน่วยงานไม่ได้อยู่ในบริษัทที่เลือก';
  else if (site.active === false && site.id !== emp.siteId) x.siteId = 'หน่วยงานนี้ปิดใช้งานแล้ว';
  if (to.companyCode !== emp.companyCode && !isCompanyActive(to.companyCode)) x.companyCode = 'บริษัทนี้ปิดใช้งานแล้ว';
  if (!typeAllows(to.employeeType, to.companyCode)) x.employeeType = 'ประเภทนี้ใช้กับบริษัทที่เลือกไม่ได้';
  else if (to.employeeType !== emp.employeeType && !isTypeActive(to.employeeType)) x.employeeType = 'ประเภทนี้ปิดใช้งานแล้ว';
  if (!to.empCode) x.empCode = 'กรุณาใส่รหัสพนักงาน';
  else if (to.empCode.length > 20) x.empCode = 'รหัสยาวเกิน 20 ตัวอักษร';
  else if (employees.some((e) => e.empCode === to.empCode && e.id !== emp.id)) x.empCode = 'รหัสพนักงานซ้ำ';
  if (input.note && String(input.note).length > 255) x.note = 'หมายเหตุยาวเกิน 255 ตัวอักษร';
  if (!Object.keys(x).length && CHANGE_FIELDS.every((k) => to[k] === emp[k])) x.siteId = 'ไม่มีอะไรเปลี่ยน — เลือกหน่วยงาน / บริษัท / ประเภทใหม่ หรือใส่รหัสใหม่';
  if (!Object.keys(x).length) {
    // ข้อมูลพนักงานหลังเปลี่ยนต้องถูกต้อง (เช่น ประเภทที่ใช้กลุ่ม/ฝ่าย ต้องมีกลุ่ม/ฝ่าย)
    const bad = validateEmployee({ ...emp, ...to });
    const k = Object.keys(bad)[0];
    if (k) x[CHANGE_FIELDS.includes(k) ? k : 'employeeType'] = CHANGE_FIELDS.includes(k) ? bad[k] : `${bad[k]} — แก้ในตารางพนักงานก่อน แล้วค่อยย้าย`;
  }
  return x;
}

/** รายการเปลี่ยนแปลงที่จะเก็บ (ผ่านการตรวจแล้ว) */
export function buildEmployeeChange(emp, input, { id, at, by }) {
  const from = changeFieldsOf(emp);
  const to = { companyCode: input.companyCode, siteId: Number(input.siteId), employeeType: input.employeeType, empCode: String(input.empCode).trim() };
  return {
    id,
    employeeId: emp.id,
    kind: changeKind(from, to),
    effectiveDate: input.effectiveDate,
    from,
    to,
    notifyInsurer: !!input.notifyInsurer,
    note: String(input.note ?? '').trim() || null,
    createdAt: at,
    createdBy: by,
  };
}

/** ลบได้ไหม: ต้องเป็นรายการล่าสุด และยังไม่อยู่ในไฟล์ที่ส่งออกแล้ว — คืนข้อความเหตุผล หรือ null = ลบได้ */
export function changeUndoBlock(change, changes, batches) {
  const mine = changes.filter((c) => c.employeeId === change.employeeId);
  const latest = mine.reduce((m, c) => (!m || c.effectiveDate > m.effectiveDate || (c.effectiveDate === m.effectiveDate && c.id > m.id) ? c : m), null);
  if (latest?.id !== change.id) return 'ลบได้เฉพาะรายการล่าสุด';
  if (batches.some((b) => b.items.some((i) => i.employeeId === change.employeeId && i.changeId === change.id))) {
    return 'อยู่ในไฟล์แจ้งประกันที่ส่งออกแล้ว — ยกเลิกการส่งออกครั้งนั้นก่อน';
  }
  return null;
}

/** ข้อความสรุป เช่น "ย้าย สาขาบางนา (HL) → ไซต์ A (PRO) · รหัส H001 → P001" */
export function changeSummary(c, siteName) {
  const parts = [];
  const place = (v) => `${siteName(v.siteId)} (${v.companyCode})`;
  if (c.from.companyCode !== c.to.companyCode || c.from.siteId !== c.to.siteId) parts.push(`ย้าย ${place(c.from)} → ${place(c.to)}`);
  if (c.from.employeeType !== c.to.employeeType) parts.push(`ประเภท ${typeInfo(c.from.employeeType)?.name ?? c.from.employeeType} → ${typeInfo(c.to.employeeType)?.name ?? c.to.employeeType}`);
  if (c.from.empCode !== c.to.empCode) parts.push(`รหัส ${c.from.empCode} → ${c.to.empCode}`);
  return parts.join(' · ');
}
