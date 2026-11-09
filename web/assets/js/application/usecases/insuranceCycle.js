import { inCycleGroup } from '../../domain/insurance.js';
import { insuranceEvents } from '../../domain/insuranceEvents.js';
import { END_REASON_LABEL } from '../../domain/labels.js';

/** ทิศทางของรายการ: URGENT นับเป็น OUT · CHANGE = แจ้งเปลี่ยนแปลง */
export const directionOf = (t) => (t === 'IN' ? 'IN' : t === 'CHANGE' ? 'CHANGE' : 'OUT');
/** คีย์จับคู่รายการกับที่ส่งแล้ว: พนักงาน + การเปลี่ยนแปลงที่ทำให้เกิดรายการ (0 = แจ้งเข้าครั้งแรก / แจ้งออกตอนพ้นสภาพ) */
export const sentKey = (employeeId, ref = 0) => `${employeeId}|${ref || 0}`;

/**
 * ประวัติการส่งออก 1 รายการ = ส่งออกไฟล์ 1 ครั้ง (1 บริษัทประกัน · 1 รอบ) มีทั้งคนเข้าและคนออก
 *   items: [{ employeeId, type: 'IN' | 'OUT' | 'URGENT' | 'CHANGE', changeId? }]
 */
export const batchIds = (b) => [...new Set(b.items.map((i) => i.employeeId))];
export function batchCounts(b) {
  const n = (t) => b.items.filter((i) => i.type === t).length;
  return { in: n('IN'), out: n('OUT'), urgent: n('URGENT'), change: n('CHANGE'), total: b.items.length };
}

/**
 * sentKey(พนักงาน, ref) → batch ที่แจ้งไปแล้ว แยกตามทิศทาง (URGENT นับเป็น OUT)
 * ส่ง employees มาด้วย = นับเฉพาะการแจ้งของการจ้างงานรอบปัจจุบัน (รอบส่ง >= วันเริ่มงาน)
 * พนักงานที่ขาดงานแล้วกลับมาทำงาน HR ตั้งวันเริ่มงานใหม่ → ต้องแจ้งเข้าใหม่ได้ ประวัติเดิมยังอยู่
 */
export function sentIndex(batches, employees = null) {
  const startOf = employees ? new Map(employees.map((e) => [e.id, e.startDate])) : null;
  const idx = { IN: new Map(), OUT: new Map(), CHANGE: new Map() };
  for (const b of batches) {
    for (const it of b.items) {
      const start = startOf?.get(it.employeeId);
      if (start && b.cycleDate < start) continue;
      idx[directionOf(it.type)].set(sentKey(it.employeeId, it.changeId), b);
    }
  }
  return idx;
}

/** เหตุผลของแถวแจ้งออกตอนพ้นสภาพ — อายุครบ / เหตุผลพ้นสภาพ */
export const exitReasonText = (emp, exit, settings) =>
  exit.exitReason === 'AGE' ? `อายุครบ ${settings.insuranceMaxAge} ปี` : emp.endReason ? END_REASON_LABEL[emp.endReason] : 'พ้นสภาพ';

/**
 * รายการแจ้งประกันของรอบ cycleDate
 * - แสดงรายการที่ยังไม่ส่ง (รวมที่ตกค้างจากรอบก่อน) + ที่ส่งแล้วในรอบนี้
 * - URGENT ที่ยังไม่ส่งแสดงทุกรอบจนกว่าจะส่ง
 * - พนักงานรายวันอยู่ในรอบของตัวเอง (วันที่ 6) แยกจากประเภทอื่น (วันที่ 5)
 * - changes = ประวัติโอนย้าย / เปลี่ยนรหัส (domain/insuranceEvents.js) — แถวมี ref เมื่อเกิดจากการเปลี่ยนแปลง
 *   employee ของแถว = ข้อมูล ณ ช่วงนั้น (แจ้งออกจากที่เดิม = บริษัท/หน่วยงาน/รหัสเดิม)
 */
export function buildInsuranceCycle(cycleDate, employees, sites, rules, batches, changes = []) {
  const sent = sentIndex(batches, employees);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const changesOf = groupChanges(changes);
  const rows = [];
  for (const emp of employees) {
    for (const ev of insuranceEvents(emp, siteById, rules, changesOf.get(emp.id))) {
      if (!inCycleGroup(ev.view, rules.settings, cycleDate)) continue; // รอบวันที่ 6 = พนักงานรายวัน · วันที่ 5 = ประเภทอื่น
      const b = sent[directionOf(ev.type)].get(sentKey(emp.id, ev.ref));
      const show = b ? b.cycleDate === cycleDate : ev.urgent || ev.cycleDate <= cycleDate;
      if (!show) continue;
      rows.push({
        employee: ev.view,
        type: ev.type,
        effectiveDate: ev.effectiveDate,
        reason: ev.reason ?? exitReasonText(emp, ev.exit, rules.settings),
        submitted: !!b,
        ...(ev.ref ? { ref: ev.ref } : {}),
      });
    }
  }
  rows.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return { cycleDate, rows };
}

/** employeeId → การเปลี่ยนแปลงของคนนั้น */
export function groupChanges(changes = []) {
  const m = new Map();
  for (const c of changes) m.set(c.employeeId, [...(m.get(c.employeeId) ?? []), c]);
  return m;
}

/** คีย์ของแถวในรอบ (จับคู่กับรายการใน batch) */
export const rowKey = (r) => `${sentKey(r.employee.id, r.ref)}|${directionOf(r.type)}`;
export const itemKey = (it) => `${sentKey(it.employeeId, it.changeId)}|${directionOf(it.type)}`;

/** ข้อมูลพนักงานแบบย่อ (ใช้แสดงรายชื่อใน batch) */
export const employeeLite = (e) => ({
  id: e.id,
  empCode: e.empCode,
  firstName: e.firstName,
  lastName: e.lastName,
  companyCode: e.companyCode,
  employeeType: e.employeeType,
  siteId: e.siteId,
  status: e.status,
});

/**
 * รายละเอียด batch ที่ส่งแจ้งแล้ว — รายชื่อพนักงาน + วันมีผล + เหตุผล
 * วันมีผล/เหตุผลคำนวณด้วยกฎเดียวกับหน้ารอบ (buildInsuranceCycle ของรอบที่ส่ง) จึงตรงกับที่เห็นตอนส่ง
 * @returns {InsuranceBatch & {items: {type, employee, siteName, effectiveDate: string|null, reason: string}[]}}
 */
const TYPE_ORDER = { URGENT: 0, IN: 1, OUT: 2, CHANGE: 3 };
export function buildBatchDetail(batch, employees, sites, rules, batches, changes = []) {
  const cycleRows = buildInsuranceCycle(batch.cycleDate, employees, sites, rules, batches, changes).rows;
  const rowOf = new Map(cycleRows.map((r) => [rowKey(r), r]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const items = batch.items
    .map((it) => {
      const { employeeId: id, type } = it;
      const row = rowOf.get(itemKey(it));
      const emp = row?.employee ?? empById.get(id); // แจ้งออกจากที่เดิม = บริษัท/หน่วยงาน/รหัสเดิม
      return {
        type,
        employee: emp ? employeeLite(emp) : { id, empCode: `#${id}`, firstName: '(ไม่พบข้อมูลพนักงาน)', lastName: '' },
        siteName: emp ? (siteById.get(emp.siteId)?.name ?? '') : '',
        effectiveDate: row?.effectiveDate ?? null,
        reason: row?.reason ?? '',
      };
    })
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.employee.empCode.localeCompare(b.employee.empCode));
  return { ...batch, items };
}
