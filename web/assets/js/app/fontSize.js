// ขนาดตัวอักษรของทั้งระบบ — เลือกที่หน้า "บัญชีของฉัน" (account.html)
//
// เก็บใน localStorage ต่อผู้ใช้ต่อเบราว์เซอร์: hl-font:<username> = เปอร์เซ็นต์ (เช่น 115)
//   + hl-font = ค่าที่ใช้ล่าสุดในเบราว์เซอร์นี้ (หน้า login ยังไม่รู้ว่าใคร)
// ทุกหน้าอ่านค่าใน <script> ส่วน <head> ก่อนวาดหน้า (เหมือนธีม) → ตั้ง --ui-zoom ที่ <html>
// CSS (app.css ท้ายไฟล์) ใช้ zoom: var(--ui-zoom) ทั้งหน้า — app.css ใช้หน่วย px ทั้งหมด จึงปรับ font-size ของ <html> ไม่ได้
// กล่องลอย (position: fixed) ต้องแปลงพิกัดด้วย cssRect() ใน shared/dom.js
import { getSession } from './auth.js';

export const FONT_LEVELS = [
  { value: 90, label: 'เล็ก', hint: 'เห็นข้อมูลได้มากขึ้นในหน้าจอเดียว' },
  { value: 100, label: 'ปกติ', hint: 'ค่าเริ่มต้น' },
  { value: 115, label: 'ใหญ่', hint: 'อ่านสบายขึ้น' },
  { value: 130, label: 'ใหญ่มาก', hint: 'เหมาะกับจอใหญ่ หรือผู้ที่ต้องการตัวอักษรใหญ่' },
];
const KEY = 'hl-font';
const valid = (v) => FONT_LEVELS.some((l) => l.value === v);
const userKey = () => {
  const u = getSession()?.username;
  return u ? `${KEY}:${u}` : KEY;
};

/** ค่าปัจจุบัน (เปอร์เซ็นต์) */
export function getFontSize() {
  try {
    const v = Number(localStorage.getItem(userKey()) ?? localStorage.getItem(KEY) ?? 100);
    return valid(v) ? v : 100;
  } catch {
    return 100;
  }
}

/** ใช้กับหน้าปัจจุบันทันที (ไม่บันทึก) */
export function applyFontSize(v) {
  const root = document.documentElement;
  if (v === 100) root.style.removeProperty('--ui-zoom');
  else root.style.setProperty('--ui-zoom', String(v / 100));
}

/** บันทึก + ใช้ทันที */
export function setFontSize(v) {
  if (!valid(v)) return;
  try {
    localStorage.setItem(userKey(), String(v));
    localStorage.setItem(KEY, String(v));
  } catch {
    /* ignore */
  }
  applyFontSize(v);
}
