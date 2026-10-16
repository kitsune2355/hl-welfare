import { addDays, diffDays, nextCycleDate } from '../../domain/date.js';
import { cycleDayOf, insuranceStatus } from '../../domain/insurance.js';
import { END_REASON_LABEL, UNIFORM_EVENT_LABEL } from '../../domain/labels.js';
import { matchUniformRule } from '../../domain/uniform.js';
import { sentIndex } from './insuranceCycle.js';
import { buildUniformPending } from './uniformPending.js';

const PROBATION_DAYS = 119;

const UNIFORM_CRITICAL_DAYS = 30;

const CYCLE_SOON_DAYS = 7;

const RANK = { critical: 0, warning: 1, info: 2 };

/**
 * คิวงานรวมของ HR — ทุกเรื่องที่ "ต้องทำ" ณ วันนี้ เรียงตามความเร่งด่วน
 * - แจ้งออกทันที (critical) · แจ้งเข้า/ออกที่ตกค้างจากรอบก่อน (critical)
 * - แจ้งเข้า/ออกรอบถัดไป (warning ถ้าเหลือ ≤ 7 วัน)
 * - ชุดฟอร์มค้างแจก (critical ถ้าเกิน 30 วัน)
 * - คุณภาพข้อมูล: ยังไม่บันทึกผ่านทดลองงาน, ไม่พบกฎชุดฟอร์ม
 */
export function buildWorkQueue(today, employees, sites, rules, batches, issues) {
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const sent = sentIndex(batches);
  const tasks = [];
  const overdue = (due) => Math.max(0, diffDays(due, today));
  const cycleSeverity = (due) =>
    due < today ? 'critical' : diffDays(today, due) <= CYCLE_SOON_DAYS ? 'warning' : 'info';
  for (const e of employees) {
    const st = insuranceStatus(e, siteById.get(e.siteId) ?? null, rules);
    const cycle = nextCycleDate(today, cycleDayOf(e, rules.settings)); // รอบถัดไปของพนักงานคนนี้ (รายวัน = วันที่ 6)
    if (st.eligible && st.enrollCycleDate && !sent.IN.has(e.id) && st.enrollCycleDate <= cycle) {
      tasks.push({
        id: `INSURANCE_IN:${e.id}`,
        kind: 'INSURANCE_IN',
        severity: cycleSeverity(st.enrollCycleDate),
        employee: e,
        title: 'แจ้งเข้าประกันกลุ่ม',
        detail: st.enrollCycleDate < cycle ? 'ตกค้างจากรอบก่อน' : 'รอบถัดไป',
        dueDate: st.enrollCycleDate,
        overdueDays: overdue(st.enrollCycleDate),
      });
    }
    if (st.eligible && st.exitDate && st.exitCycleDate && !sent.OUT.has(e.id)) {
      const reason = e.endReason ? END_REASON_LABEL[e.endReason] : 'พ้นสภาพ';
      if (st.exitUrgent) {
        tasks.push({
          id: `INSURANCE_URGENT:${e.id}`,
          kind: 'INSURANCE_URGENT',
          severity: 'critical',
          employee: e,
          title: 'แจ้งออกประกันทันที',
          detail: reason,
          dueDate: st.exitDate,
          overdueDays: overdue(st.exitDate),
        });
      } else if (st.exitCycleDate <= cycle) {
        tasks.push({
          id: `INSURANCE_OUT:${e.id}`,
          kind: 'INSURANCE_OUT',
          severity: cycleSeverity(st.exitCycleDate),
          employee: e,
          title: 'แจ้งออกประกันกลุ่ม',
          detail: reason,
          dueDate: st.exitCycleDate,
          overdueDays: overdue(st.exitCycleDate),
        });
      }
    }
    if (e.status !== 'ACTIVE') continue;
    const passDue = addDays(e.startDate, PROBATION_DAYS);
    if (!e.probationPassDate && passDue < today) {
      tasks.push({
        id: `PROBATION_MISSING:${e.id}`,
        kind: 'PROBATION_MISSING',
        severity: 'warning',
        employee: e,
        title: 'ยังไม่บันทึกวันผ่านทดลองงาน',
        detail: `ครบ ${PROBATION_DAYS} วันแล้ว — มีผลกับสิทธิชุดฟอร์ม`,
        dueDate: passDue,
        overdueDays: overdue(passDue),
      });
    }
    const covered = rules.uniform.some((r) => r.employeeType === e.employeeType);
    if (covered && !matchUniformRule(e, rules.uniform)) {
      tasks.push({
        id: `UNIFORM_RULE_MISSING:${e.id}`,
        kind: 'UNIFORM_RULE_MISSING',
        severity: 'info',
        employee: e,
        title: 'ไม่พบกฎชุดฟอร์ม',
        detail: 'บริษัท/กลุ่ม/ระดับนี้ยังไม่มีในเงื่อนไข — รอ HR ยืนยัน',
        dueDate: null,
        overdueDays: 0,
      });
    }
  }
  for (const p of buildUniformPending(employees, sites, rules, issues, today)) {
    const days = overdue(p.dueDate);
    tasks.push({
      id: `UNIFORM_ISSUE:${p.employee.id}:${p.entitlementKey}`,
      kind: 'UNIFORM_ISSUE',
      severity: days > UNIFORM_CRITICAL_DAYS ? 'critical' : 'warning',
      employee: p.employee,
      title: `แจกชุดฟอร์ม (${UNIFORM_EVENT_LABEL[p.event]})`,
      detail: `${p.qtyLabel} ตัว · ${p.style}`,
      dueDate: p.dueDate,
      overdueDays: days,
    });
  }
  return tasks.sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      b.overdueDays - a.overdueDays ||
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
  );
}
