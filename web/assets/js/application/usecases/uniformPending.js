import { uniformStatus } from '../../domain/uniform.js';

/** ชุดฟอร์มที่ถึงกำหนดแต่ยังไม่แจก และยังไม่ได้ส่งเบิกคลัง (เฉพาะพนักงานที่ยังทำงานอยู่) เรียงตามวันครบกำหนด */
export function buildUniformPending(employees, sites, rules, issues, today) {
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const rows = [];
  for (const emp of employees) {
    if (emp.status !== 'ACTIVE') continue;
    const st = uniformStatus(emp, siteById.get(emp.siteId) ?? null, rules, issues, today);
    for (const e of st.entitlements) {
      if (e.issued || e.requested) continue;
      rows.push({
        employee: emp,
        entitlementKey: e.key,
        event: e.event,
        dueDate: e.dueDate,
        qtyLabel: e.qtyLabel,
        itemQty: e.itemQty,
        style: e.style,
      });
    }
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** รอบที่ยังไม่ถึงกำหนด และยังไม่ได้แจก/ส่งเบิก — ส่งเบิกล่วงหน้าได้ (เฉพาะพนักงานที่ยังทำงานอยู่) เรียงตามวันครบกำหนด */
export function buildUniformUpcoming(employees, sites, rules, issues, today) {
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const rows = [];
  for (const emp of employees) {
    if (emp.status !== 'ACTIVE') continue;
    const st = uniformStatus(emp, siteById.get(emp.siteId) ?? null, rules, issues, today);
    for (const e of st.upcoming) {
      if (e.issued || e.requested) continue;
      rows.push({
        employee: emp,
        entitlementKey: e.key,
        event: e.event,
        dueDate: e.dueDate,
        qtyLabel: e.qtyLabel,
        itemQty: e.itemQty,
        style: e.style,
      });
    }
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
