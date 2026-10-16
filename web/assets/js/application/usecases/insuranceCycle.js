import { insuranceStatus } from '../../domain/insurance.js';
import { END_REASON_LABEL } from '../../domain/labels.js';

const directionOf = (t) => (t === 'IN' ? 'IN' : 'OUT');

/** employeeId → batch ที่แจ้งไปแล้ว แยกตามทิศทาง (URGENT นับเป็น OUT) */
export function sentIndex(batches) {
  const idx = { IN: new Map(), OUT: new Map() };
  for (const b of batches) for (const id of b.employeeIds) idx[directionOf(b.type)].set(id, b);
  return idx;
}

/**
 * รายการแจ้งประกันของรอบ cycleDate
 * - แสดงรายการที่ยังไม่ส่ง (รวมที่ตกค้างจากรอบก่อน) + ที่ส่งแล้วในรอบนี้
 * - URGENT ที่ยังไม่ส่งแสดงทุกรอบจนกว่าจะส่ง
 */
export function buildInsuranceCycle(cycleDate, employees, sites, rules, batches) {
  const sent = sentIndex(batches);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const rows = [];
  for (const emp of employees) {
    const st = insuranceStatus(emp, siteById.get(emp.siteId) ?? null, rules);
    if (!st.eligible || !st.enrollCycleDate) continue;
    const inBatch = sent.IN.get(emp.id);
    if (inBatch ? inBatch.cycleDate === cycleDate : st.enrollCycleDate <= cycleDate) {
      const rule = rules.insurance.find((r) => r.id === st.ruleId);
      rows.push({
        employee: emp,
        type: 'IN',
        effectiveDate: st.eligibleDate ?? st.enrollCycleDate,
        reason: `ครบอายุงาน ${rule?.waitDays ?? ''} วัน`,
        submitted: !!inBatch,
      });
    }
    if (!st.exitDate || !st.exitCycleDate) continue;
    const outBatch = sent.OUT.get(emp.id);
    const type = st.exitUrgent ? 'URGENT' : 'OUT';
    const show = outBatch ? outBatch.cycleDate === cycleDate : st.exitUrgent || st.exitCycleDate <= cycleDate;
    if (show) {
      rows.push({
        employee: emp,
        type,
        effectiveDate: st.exitDate,
        reason: emp.endReason ? END_REASON_LABEL[emp.endReason] : 'พ้นสภาพ',
        submitted: !!outBatch,
      });
    }
  }
  rows.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return { cycleDate, rows };
}

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
 * @returns {InsuranceBatch & {items: {employee, siteName, effectiveDate: string|null, reason: string}[]}}
 */
export function buildBatchDetail(batch, employees, sites, rules, batches) {
  const dir = directionOf(batch.type);
  const cycleRows = buildInsuranceCycle(batch.cycleDate, employees, sites, rules, batches).rows.filter((r) => directionOf(r.type) === dir);
  const rowOf = new Map(cycleRows.map((r) => [r.employee.id, r]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const items = batch.employeeIds
    .map((id) => {
      const emp = empById.get(id);
      const row = rowOf.get(id);
      return {
        employee: emp ? employeeLite(emp) : { id, empCode: `#${id}`, firstName: '(ไม่พบข้อมูลพนักงาน)', lastName: '' },
        siteName: emp ? (siteById.get(emp.siteId)?.name ?? '') : '',
        effectiveDate: row?.effectiveDate ?? null,
        reason: row?.reason ?? '',
      };
    })
    .sort((a, b) => a.employee.empCode.localeCompare(b.employee.empCode));
  return { ...batch, items };
}
