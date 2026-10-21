// ทุกการคำนวณวันทำบน UTC เพื่อไม่ให้วันเลื่อนตาม timezone ของเครื่อง
const DAY_MS = 86_400_000;

export function parseISO(d) {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

export function toISO(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** วันที่วันนี้ตามเวลาเครื่อง (ไม่ใช่ UTC) ในรูป ISO */
export function todayISO(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(d, n) {
  return toISO(parseISO(d) + n * DAY_MS);
}

export function addMonths(d, n) {
  const dt = new Date(parseISO(d));
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return toISO(dt.getTime());
}

/** จำนวนวันจาก a ถึง b (b − a) */
export function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / DAY_MS);
}

/** อายุเต็มปี ณ วันที่ at */
export function ageAt(birth, at) {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ay, am, ad] = at.split('-').map(Number);
  return ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0);
}

/** วันที่ `day` แรกของเดือนที่ >= d (รอบแจ้งประกัน) */
export function nextCycleDate(d, day = 5) {
  const [y, m, dd] = d.split('-').map(Number);
  const target = dd <= day ? Date.UTC(y, m - 1, day) : Date.UTC(y, m, day);
  return toISO(target);
}

export function minDate(a, b) {
  return a !== null && a < b ? a : b;
}

export function yearOf(d) {
  return Number(d.slice(0, 4));
}
