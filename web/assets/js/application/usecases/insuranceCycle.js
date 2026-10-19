import { inCycleGroup, insuranceStatus } from '../../domain/insurance.js';
import { END_REASON_LABEL } from '../../domain/labels.js';

const directionOf = (t) => (t === 'IN' ? 'IN' : 'OUT');

/**
 * ประวัติการส่งออก 1 รายการ = ส่งออกไฟล์ 1 ครั้ง (1 บริษัทประกัน · 1 รอบ) มีทั้งคนเข้าและคนออก
 *   items: [{ employeeId, type: 'IN' | 'OUT' | 'URGENT' }]
 */
export const batchIds = (b) => [...new Set(b.items.map((i) => i.employeeId))];
export function batchCounts(b) {
  const n = (t) => b.items.filter((i) => i.type === t).length;
  return { in: n('IN'), out: n('OUT'), urgent: n('URGENT'), total: b.items.length };
}

/**
 * employeeId → batch ที่แจ้งไปแล้ว แยกตามทิศทาง (URGENT นับเป็น OUT)
 * ส่ง employees มาด้วย = นับเฉพาะการแจ้งของการจ้างงานรอบปัจจุบัน (รอบส่ง >= วันเริ่มงาน)
 * พนักงานที่ขาดงานแล้วกลับมาทำงาน HR ตั้งวันเริ่มงานใหม่ → ต้องแจ้งเข้าใหม่ได้ ประวัติเดิมยังอยู่
 */
export function sentIndex(batches, employees = null) {
  const startOf = employees ? new Map(employees.map((e) => [e.id, e.startDate])) : null;
  const idx = { IN: new Map(), OUT: new Map() };
  for (const b of batches) {
    for (const it of b.items) {
      const start = startOf?.get(it.employeeId);
      if (start && b.cycleDate < start) continue;
      idx[directionOf(it.type)].set(it.employeeId, b);
    }
  }
  return idx;
}

/**
 * รายการแจ้งประกันของรอบ cycleDate
 * - แสดงรายการที่ยังไม่ส่ง (รวมที่ตกค้างจากรอบก่อน) + ที่ส่งแล้วในรอบนี้
 * - URGENT ที่ยังไม่ส่งแสดงทุกรอบจนกว่าจะส่ง
 * - พนักงานรายวันอยู่ในรอบของตัวเอง (วันที่ 6) แยกจากประเภทอื่น (วันที่ 5)
 */
export function buildInsuranceCycle(cycleDate, employees, sites, rules, batches) {
  const sent = sentIndex(batches, employees);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const rows = [];
  for (const emp of employees) {
    if (!inCycleGroup(emp, rules.settings, cycleDate)) continue; // รอบวันที่ 6 = พนักงานรายวัน · วันที่ 5 = ประเภทอื่น
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
        reason: st.exitReason === 'AGE' ? `อายุครบ ${rules.settings.insuranceMaxAge} ปี` : emp.endReason ? END_REASON_LABEL[emp.endReason] : 'พ้นสภาพ',
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
 * @returns {InsuranceBatch & {items: {type, employee, siteName, effectiveDate: string|null, reason: string}[]}}
 */
const TYPE_ORDER = { URGENT: 0, IN: 1, OUT: 2 };
export function buildBatchDetail(batch, employees, sites, rules, batches) {
  const cycleRows = buildInsuranceCycle(batch.cycleDate, employees, sites, rules, batches).rows;
  const rowOf = new Map(cycleRows.map((r) => [`${r.employee.id}|${directionOf(r.type)}`, r]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const items = batch.items
    .map(({ employeeId: id, type }) => {
      const emp = empById.get(id);
      const row = rowOf.get(`${id}|${directionOf(type)}`);
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
