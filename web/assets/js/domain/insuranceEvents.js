// รายการแจ้งประกันกลุ่มของพนักงาน 1 คน เมื่อมีการโอนย้าย / เปลี่ยนรหัส (คู่แฝด backend/domain/insurance_events.php)
//
//   ประวัติการเปลี่ยนแปลง (employee_changes) แบ่งการทำงานเป็นช่วง — แต่ละช่วงใช้ บริษัท / หน่วยงาน / ประเภท / รหัส ของช่วงนั้น
//   อายุงานนับต่อจากวันเริ่มงานเดิมเสมอ (ไม่รอ 30 วันใหม่)
//
//   ย้าย (บริษัท / หน่วยงาน / ประเภท เปลี่ยน) วันที่มีผล d:
//     ได้ประกันอยู่ → ที่ใหม่ไม่ได้ประกัน            = แจ้งออก (มีผล d − 1)
//     ได้ประกันอยู่ → ที่ใหม่ได้ + ติ๊กแจ้งประกัน     = แจ้งออก (d − 1) + แจ้งเข้า (d)   ← HR: ออก 19 พ.ย. เข้า 20 พ.ย.
//     ได้ประกันอยู่ → ที่ใหม่ได้ + ไม่ติ๊ก            = ไม่มีรายการ (คุ้มครองต่อเนื่อง)
//     ยังไม่ได้ประกัน → ที่ใหม่ได้                     = แจ้งเข้า (d หรือวันครบอายุงาน ถ้ายังไม่ครบ)
//   เปลี่ยนรหัสอย่างเดียว + ติ๊กแจ้งประกัน (ขณะได้ประกันอยู่) = แจ้งเปลี่ยนแปลง (d)
//
//   ref = id ของการเปลี่ยนแปลงที่ทำให้เกิดรายการ · 0 = แจ้งเข้าครั้งแรก / แจ้งออกตอนพ้นสภาพ (แบบเดิม)
//   ไม่มีประวัติการเปลี่ยนแปลง = ผลเหมือนเดิมทุกอย่าง (แจ้งเข้า ref 0 + แจ้งออก ref 0)
import { addDays, nextCycleDate } from './date.js';
import { cycleDayOf, insuranceStatus } from './insurance.js';

/** ฟิลด์ที่การเปลี่ยนแปลงเก็บค่าเดิม → ค่าใหม่ */
export const CHANGE_FIELDS = ['companyCode', 'siteId', 'employeeType', 'empCode'];

/** ย้ายบริษัท / หน่วยงาน / ประเภท (ไม่ใช่แค่เปลี่ยนรหัส) */
export const isTransfer = (c) => c.from.companyCode !== c.to.companyCode || c.from.siteId !== c.to.siteId || c.from.employeeType !== c.to.employeeType;

/** การเปลี่ยนแปลงของการจ้างงานรอบนี้: หลังวันเริ่มงาน · ไม่เกินวันพ้นสภาพ · เรียงตามวันที่มีผล */
export function activeChanges(emp, changes = []) {
  return changes
    .filter((c) => c.employeeId === emp.id && c.effectiveDate > emp.startDate && (!emp.endDate || c.effectiveDate <= emp.endDate))
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id - b.id);
}

const placeOf = (view, siteById) => `${siteById.get(view.siteId)?.name ?? `หน่วยงาน #${view.siteId}`} (${view.companyCode})`;

/**
 * @param {object} emp  พนักงาน (ค่าปัจจุบัน)
 * @param {Map<number, object>} siteById
 * @param {object} rules
 * @param {object[]} [changes]  ประวัติการเปลี่ยนแปลง (ของคนนี้หรือทั้งหมดก็ได้ — กรองตาม employeeId ให้)
 * @returns {{ref: number, type: 'IN'|'OUT'|'URGENT'|'CHANGE', view: object, effectiveDate: string, cycleDate: string, urgent: boolean, reason: string}[]}
 *   view = ข้อมูลพนักงาน ณ ช่วงนั้น (บริษัท/หน่วยงาน/ประเภท/รหัส ของช่วง) — ใช้แสดงและเขียนลงไฟล์
 */
export function insuranceEvents(emp, siteById, rules, changes = []) {
  const { settings } = rules;
  const list = activeChanges(emp, changes);
  const views = [list.length ? { ...emp, ...pick(list[0].from) } : emp, ...list.map((c) => ({ ...emp, ...pick(c.to) }))];
  const stOf = views.map((v) => insuranceStatus(v, siteById.get(v.siteId) ?? null, rules));
  const events = [];
  const cycleOf = (date, view) => nextCycleDate(date, cycleDayOf(view, settings));
  let covered = false;
  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const st = stOf[i];
    const c = i > 0 ? list[i - 1] : null;
    if (c) {
      const d = c.effectiveDate;
      if (isTransfer(c)) {
        if (covered && (!st.eligible || c.notifyInsurer)) {
          const prev = views[i - 1];
          events.push({
            ref: c.id,
            type: 'OUT',
            view: prev,
            effectiveDate: addDays(d, -1),
            cycleDate: cycleOf(addDays(d, -1), prev),
            urgent: false,
            reason: st.eligible ? `โอนย้ายไป ${placeOf(view, siteById)}` : `ย้ายไป ${placeOf(view, siteById)} — ไม่ได้รับประกันกลุ่ม`,
          });
          covered = false;
        }
      } else if (covered && c.notifyInsurer) {
        events.push({ ref: c.id, type: 'CHANGE', view, effectiveDate: d, cycleDate: cycleOf(d, view), urgent: false, reason: `เปลี่ยนรหัสพนักงาน ${c.from.empCode} → ${c.to.empCode}` });
      }
    }
    if (covered || !st.eligible || !st.enrollCycleDate) continue;
    // เริ่มคุ้มครองในช่วงนี้: วันครบอายุงาน หรือวันที่ย้ายมา (ถ้าครบแล้ว)
    const start = i === 0 ? emp.startDate : c.effectiveDate;
    const end = i < list.length ? addDays(list[i].effectiveDate, -1) : null;
    const eligible = st.eligibleDate ?? st.enrollCycleDate;
    const from = eligible > start ? eligible : start;
    if (end !== null && from > end) continue; // ย้ายออกก่อนครบอายุงาน — ไปนับในช่วงถัดไป
    const byMove = from === start && i > 0 && from !== eligible;
    const rule = rules.insurance.find((r) => r.id === st.ruleId);
    events.push({
      ref: byMove ? c.id : 0,
      type: 'IN',
      view,
      effectiveDate: from,
      cycleDate: from === eligible ? st.enrollCycleDate : cycleOf(from, view),
      urgent: false,
      reason: byMove ? `โอนย้ายจาก ${placeOf(views[i - 1], siteById)}` : `ครบอายุงาน ${rule?.waitDays ?? ''} วัน`,
    });
    covered = true;
  }
  const last = stOf[stOf.length - 1];
  if (covered && last.exitDate && last.exitCycleDate) {
    events.push({
      ref: 0,
      type: last.exitUrgent ? 'URGENT' : 'OUT',
      view: views[views.length - 1],
      effectiveDate: last.exitDate,
      cycleDate: last.exitCycleDate,
      urgent: last.exitUrgent,
      reason: null, // ให้ผู้เรียกใส่ (อายุครบ / เหตุผลพ้นสภาพ)
      exit: last,
    });
  }
  return events;
}

const pick = (o) => Object.fromEntries(CHANGE_FIELDS.map((k) => [k, o[k]]));
