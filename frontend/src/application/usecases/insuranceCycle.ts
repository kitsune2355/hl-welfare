import { insuranceStatus } from '../../domain/insurance';
import { END_REASON_LABEL } from '../../domain/labels';
import type {
  BatchType,
  Employee,
  InsuranceBatch,
  InsuranceCycle,
  InsuranceCycleRow,
  ISODate,
  RuleSet,
  Site,
} from '../../domain/types';

type Direction = 'IN' | 'OUT';
const directionOf = (t: BatchType): Direction => (t === 'IN' ? 'IN' : 'OUT');

/** employeeId → batch ที่แจ้งไปแล้ว แยกตามทิศทาง (URGENT นับเป็น OUT) */
export function sentIndex(batches: InsuranceBatch[]): Record<Direction, Map<number, InsuranceBatch>> {
  const idx = { IN: new Map<number, InsuranceBatch>(), OUT: new Map<number, InsuranceBatch>() };
  for (const b of batches) for (const id of b.employeeIds) idx[directionOf(b.type)].set(id, b);
  return idx;
}

/**
 * รายการแจ้งประกันของรอบ cycleDate
 * - แสดงรายการที่ยังไม่ส่ง (รวมที่ตกค้างจากรอบก่อน) + ที่ส่งแล้วในรอบนี้
 * - URGENT ที่ยังไม่ส่งแสดงทุกรอบจนกว่าจะส่ง
 */
export function buildInsuranceCycle(
  cycleDate: ISODate,
  employees: Employee[],
  sites: Site[],
  rules: RuleSet,
  batches: InsuranceBatch[],
): InsuranceCycle {
  const sent = sentIndex(batches);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const rows: InsuranceCycleRow[] = [];

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
    const type: BatchType = st.exitUrgent ? 'URGENT' : 'OUT';
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
