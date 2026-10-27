// โอนย้ายพนักงาน — ประวัติสังกัด + วันที่มีผล (คู่แฝด: backend/domain/transfer.php — แก้ที่หนึ่งต้องแก้อีกที่)
//
//   Transfer = { id, employeeId, effectiveDate, status: 'PENDING'|'APPLIED'|'CANCELLED',
//                from: Assignment, to: Assignment, resetWait, note, appliedAt, createdAt, createdBy }
//   Assignment = { companyCode, siteId, employeeType, deptGroup, position, level }
//
//   ตั้งล่วงหน้าได้: PENDING = ข้อมูลพนักงานยังเป็นค่าเดิม → ถึงวันที่มีผล ระบบเขียนค่าใหม่ให้เอง (applyTransfer)
//   resetWait = นับวันรอสิทธิ์ (ประกันกลุ่ม / สวัสดิการเพิ่มเติม) ใหม่จากวันที่ย้าย แทนวันเริ่มงาน
import { addDays } from './date.js';

/** ฟิลด์สังกัดที่การย้ายเปลี่ยนได้ */
export const ASSIGNMENT_FIELDS = ['companyCode', 'siteId', 'employeeType', 'deptGroup', 'position', 'level'];

/** สังกัดปัจจุบันของพนักงาน */
export function assignmentOf(emp) {
  return {
    companyCode: emp.companyCode,
    siteId: emp.siteId,
    employeeType: emp.employeeType,
    deptGroup: emp.deptGroup ?? null,
    position: emp.position ?? null,
    level: emp.level ?? null,
  };
}

/** ฟิลด์ที่ต่างกันระหว่างสังกัดเดิมกับใหม่ */
export function assignmentChanges(from, to) {
  return ASSIGNMENT_FIELDS.filter((k) => (from[k] ?? null) !== (to[k] ?? null));
}

/** วันเริ่มนับวันรอสิทธิ์ — ย้ายแบบ "นับใหม่" แล้ว = วันที่ย้าย · ไม่เคย = วันเริ่มงาน */
export const waitStartDate = (emp) => emp.benefitStartDate ?? emp.startDate;

const byDate = (a, b) => (a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : a.id - b.id);

/** การย้ายที่ตั้งไว้และถึงวันที่มีผลแล้ว (ยังไม่ได้เขียนลงพนักงาน) — เรียงตามวันที่ */
export function dueTransfers(transfers, today) {
  return transfers.filter((t) => t.status === 'PENDING' && t.effectiveDate <= today).sort(byDate);
}

/** พนักงานหลังการย้ายมีผล — สังกัดใหม่ + วันเริ่มนับวันรอสิทธิ์ (ถ้านับใหม่) */
export function applyTransfer(emp, t) {
  const next = { ...emp };
  for (const k of ASSIGNMENT_FIELDS) next[k] = t.to[k] ?? null;
  if (t.resetWait) next.benefitStartDate = t.effectiveDate;
  return next;
}

/**
 * ช่วงสังกัดของพนักงาน "อยู่ที่ไหน ตั้งแต่วันไหนถึงวันไหน" — เก่าสุดก่อน
 * ช่วงแรก = วันเริ่มงาน → วันก่อนย้ายครั้งแรก (สังกัด from ของการย้ายครั้งแรก) · ช่วงสุดท้าย until = วันพ้นสภาพ / null (ปัจจุบัน)
 * @returns {{since: string, until: string|null, transferId: number|null, current: boolean, assignment: Object}[]}
 */
export function assignmentPeriods(emp, transfers) {
  const applied = transfers.filter((t) => t.status === 'APPLIED').sort(byDate);
  const periods = [];
  let since = emp.startDate;
  let current = applied.length ? applied[0].from : assignmentOf(emp);
  let transferId = null;
  for (const t of applied) {
    periods.push({ since, until: addDays(t.effectiveDate, -1), transferId, current: false, assignment: current });
    since = t.effectiveDate;
    current = t.to;
    transferId = t.id;
  }
  periods.push({ since, until: emp.endDate ?? null, transferId, current: true, assignment: assignmentOf(emp) });
  return periods;
}

/**
 * ตรวจคำขอย้าย (ก่อนตรวจกับข้อมูลองค์กร — หน่วยงานตรงบริษัท / ปิดใช้งาน / ระดับตามประเภท ตรวจที่ API ด้วย validateEmployee)
 * @param {{effectiveDate: string, to: Object}} input
 * @returns {Object<string, string>} ช่อง → ข้อความ (ว่าง = ผ่าน)
 */
export function validateTransfer(input, emp, transfers) {
  const errors = {};
  const d = input.effectiveDate;
  if (emp.status !== 'ACTIVE') errors.effectiveDate = 'พนักงานพ้นสภาพแล้ว — โอนย้ายไม่ได้';
  else if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) errors.effectiveDate = 'กรุณาระบุวันที่มีผล';
  else if (d <= emp.startDate) errors.effectiveDate = 'วันที่มีผลต้องหลังวันเริ่มงาน';
  else {
    const last = transfers.filter((t) => t.status === 'APPLIED').sort(byDate).pop();
    if (last && d <= last.effectiveDate) errors.effectiveDate = 'วันที่มีผลต้องหลังการย้ายครั้งล่าสุด';
    else if (transfers.some((t) => t.status === 'PENDING')) errors.effectiveDate = 'มีการย้ายที่รอมีผลอยู่แล้ว — ยกเลิกรายการเดิมก่อน';
  }
  const to = input.to ?? {};
  if (!to.companyCode) errors.companyCode = 'กรุณาเลือกบริษัท';
  if (!to.siteId) errors.siteId = 'กรุณาเลือกหน่วยงาน';
  if (!to.employeeType) errors.employeeType = 'กรุณาเลือกประเภทพนักงาน';
  if (!Object.keys(errors).length && !assignmentChanges(assignmentOf(emp), to).length) errors.siteId = 'สังกัดใหม่เหมือนเดิม — ไม่มีอะไรเปลี่ยน';
  return errors;
}
