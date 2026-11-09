// ตัวกรองช่วงวันที่ของคอลัมน์วันที่ (ตารางทุกตัว — ui/columnFilter.js)
//
//   คอลัมน์วันที่ = ค่าที่ใช้เรียงเป็นวันที่ ISO ("2026-11-09" หรือมีเวลาต่อท้าย) ทุกแถวที่ไม่ว่าง — ตรวจเองอัตโนมัติ
//   ช่วง = { from, to } เป็น ISO ไม่มีเวลา · เว้นข้างใดข้างหนึ่งได้ (ตั้งแต่… / ถึง…) · รวมวันต้นและวันท้าย
//   แถวที่วันที่ว่าง ไม่อยู่ในช่วงใด ๆ
import { addDays, addMonths, todayISO } from './date.js';

/** ค่า → "YYYY-MM-DD" (ตัดเวลาทิ้ง) · ไม่ใช่วันที่ = null */
export const isoDay = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|[ T])/.test(v) ? v.slice(0, 10) : null);

const blank = (v) => v === null || v === undefined || v === '';

/** ทุกค่าที่ไม่ว่างเป็นวันที่ และมีอย่างน้อย 1 ค่า */
export function isDateColumn(values) {
  let n = 0;
  for (const v of values) {
    if (blank(v)) continue;
    if (!isoDay(v)) return false;
    n++;
  }
  return n > 0;
}

/** ตัวกรองนี้เป็นช่วงวันที่ (ไม่ใช่ชุดค่าที่ติ๊กเลือก) */
export const isRange = (f) => !!f && typeof f === 'object' && !(f instanceof Set) && ('from' in f || 'to' in f);

/** สร้างช่วง — ว่างทั้งคู่ = null (ไม่กรอง) · ต้น > ท้าย = สลับให้ */
export function makeRange(from, to) {
  let a = isoDay(from) ?? '';
  let b = isoDay(to) ?? '';
  if (!a && !b) return null;
  if (a && b && a > b) [a, b] = [b, a];
  return { from: a, to: b };
}

export function inRange(v, r) {
  const d = isoDay(v);
  return !!d && (!r.from || d >= r.from) && (!r.to || d <= r.to);
}

const endOfMonth = (monthStart) => addDays(addMonths(monthStart, 1), -1);

/** ปุ่มลัด (หน้าจอแสดงเฉพาะปุ่มที่มีแถวตรง) */
export function datePresets(today = todayISO()) {
  const month = `${today.slice(0, 7)}-01`;
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const y = Number(today.slice(0, 4));
  return [
    { id: 'today', label: 'วันนี้', from: today, to: today },
    { id: 'past7', label: '7 วันที่ผ่านมา', from: addDays(today, -6), to: today },
    { id: 'past30', label: '30 วันที่ผ่านมา', from: addDays(today, -29), to: today },
    { id: 'next30', label: '30 วันข้างหน้า', from: today, to: addDays(today, 29) },
    { id: 'lastMonth', label: 'เดือนก่อน', from: prev, to: endOfMonth(prev) },
    { id: 'thisMonth', label: 'เดือนนี้', from: month, to: endOfMonth(month) },
    { id: 'nextMonth', label: 'เดือนหน้า', from: next, to: endOfMonth(next) },
    { id: 'thisYear', label: `ปี ${y + 543}`, from: `${y}-01-01`, to: `${y}-12-31` },
    { id: 'lastYear', label: `ปี ${y + 542}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ];
}

/** ข้อความของช่วง เช่น "1 ต.ค. 69 – 31 ต.ค. 69" · "ตั้งแต่ 1 ต.ค. 69" · "ถึง 31 ต.ค. 69" */
export function rangeLabel(r, fmt) {
  if (r.from && r.to) return r.from === r.to ? fmt(r.from) : `${fmt(r.from)} – ${fmt(r.to)}`;
  return r.from ? `ตั้งแต่ ${fmt(r.from)}` : `ถึง ${fmt(r.to)}`;
}
