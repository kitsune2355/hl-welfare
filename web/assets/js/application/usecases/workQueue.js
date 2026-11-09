import { diffDays, nextCycleDate } from '../../domain/date.js';
import { PROBATION_DAYS, probationDueDate } from '../../domain/employee.js';
import { cycleDayOf } from '../../domain/insurance.js';
import { insuranceEvents } from '../../domain/insuranceEvents.js';
import { UNIFORM_EVENT_LABEL } from '../../domain/labels.js';
import { matchUniformRule } from '../../domain/uniform.js';
import { directionOf, exitReasonText, groupChanges, sentIndex, sentKey } from './insuranceCycle.js';
import { buildUniformPending } from './uniformPending.js';

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
export function buildWorkQueue(today, employees, sites, rules, batches, issues, changes = []) {
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const sent = sentIndex(batches, employees);
  const changesOf = groupChanges(changes);
  const tasks = [];
  const overdue = (due) => Math.max(0, diffDays(due, today));
  const cycleSeverity = (due) =>
    due < today ? 'critical' : diffDays(today, due) <= CYCLE_SOON_DAYS ? 'warning' : 'info';
  for (const e of employees) {
    const cycle = nextCycleDate(today, cycleDayOf(e, rules.settings)); // รอบถัดไปของพนักงานคนนี้ (รายวัน = วันที่ 6)
    // รายการแจ้งประกันชุดเดียวกับหน้าประกันกลุ่ม (รวมโอนย้าย / เปลี่ยนรหัส) — ref ≠ 0 = เกิดจากการเปลี่ยนแปลง
    for (const ev of insuranceEvents(e, siteById, rules, changesOf.get(e.id))) {
      if (sent[directionOf(ev.type)].has(sentKey(e.id, ev.ref))) continue;
      const suffix = ev.ref ? `:${ev.ref}` : '';
      const reason = ev.reason ?? exitReasonText(e, ev.exit, rules.settings);
      if (ev.type === 'IN' && ev.cycleDate <= cycle) {
        tasks.push({
          id: `INSURANCE_IN:${e.id}${suffix}`,
          kind: 'INSURANCE_IN',
          severity: cycleSeverity(ev.cycleDate),
          employee: e,
          title: 'แจ้งเข้าประกันกลุ่ม',
          detail: ev.ref ? reason : ev.cycleDate < cycle ? 'ตกค้างจากรอบก่อน' : 'รอบถัดไป',
          dueDate: ev.cycleDate,
          overdueDays: overdue(ev.cycleDate),
        });
      } else if (ev.type === 'URGENT') {
        tasks.push({
          id: `INSURANCE_URGENT:${e.id}`,
          kind: 'INSURANCE_URGENT',
          severity: 'critical',
          employee: e,
          title: 'แจ้งออกประกันทันที',
          detail: reason,
          dueDate: ev.effectiveDate,
          overdueDays: overdue(ev.effectiveDate),
        });
      } else if ((ev.type === 'OUT' || ev.type === 'CHANGE') && ev.cycleDate <= cycle) {
        const change = ev.type === 'CHANGE';
        tasks.push({
          id: `${change ? 'INSURANCE_CHANGE' : 'INSURANCE_OUT'}:${e.id}${suffix}`,
          kind: change ? 'INSURANCE_CHANGE' : 'INSURANCE_OUT',
          severity: cycleSeverity(ev.cycleDate),
          employee: e,
          title: change ? 'แจ้งเปลี่ยนแปลงประกันกลุ่ม' : 'แจ้งออกประกันกลุ่ม',
          detail: reason,
          dueDate: ev.cycleDate,
          overdueDays: overdue(ev.cycleDate),
        });
      }
    }
    if (e.status !== 'ACTIVE') continue;
    const passDue = probationDueDate(e.startDate);
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
