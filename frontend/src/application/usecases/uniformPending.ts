import { uniformStatus } from '../../domain/uniform';
import type { Employee, ISODate, RuleSet, Site, UniformIssue, UniformPendingRow } from '../../domain/types';

/** ชุดฟอร์มที่ถึงกำหนดแต่ยังไม่แจก (เฉพาะพนักงานที่ยังทำงานอยู่) เรียงตามวันครบกำหนด */
export function buildUniformPending(
  employees: Employee[],
  sites: Site[],
  rules: RuleSet,
  issues: UniformIssue[],
  today: ISODate,
): UniformPendingRow[] {
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const rows: UniformPendingRow[] = [];
  for (const emp of employees) {
    if (emp.status !== 'ACTIVE') continue;
    const st = uniformStatus(emp, siteById.get(emp.siteId) ?? null, rules, issues, today);
    for (const e of st.entitlements) {
      if (e.issued) continue;
      rows.push({
        employee: emp,
        entitlementKey: e.key,
        event: e.event,
        dueDate: e.dueDate,
        qtyLabel: e.qtyLabel,
        style: e.style,
      });
    }
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
