import { diffDays } from '../domain/date';
import type { ISODate } from '../domain/types';

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

/** 2026-11-05 → "5 พ.ย. 69" */
export function thaiDate(d: ISODate | null | undefined): string {
  if (!d) return '–';
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${TH_MONTHS[m - 1]} ${String(y + 543).slice(-2)}`;
}

/** 2026-11-05 → "5 พฤศจิกายน 2569" */
export function thaiDateLong(d: ISODate): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${TH_MONTHS_FULL[m - 1]} ${y + 543}`;
}

/** 2026-11-05T10:00:00 → "5 พ.ย. 69 10:00" */
export function thaiDateTime(s: string): string {
  return `${thaiDate(s.slice(0, 10))} ${s.slice(11, 16)}`.trim();
}

/** "อีก 12 วัน" / "วันนี้" / "เลยมา 3 วัน" */
export function relativeDays(d: ISODate, today: ISODate): string {
  const n = diffDays(today, d);
  if (n === 0) return 'วันนี้';
  return n > 0 ? `อีก ${n} วัน` : `เลยมา ${-n} วัน`;
}

/** อายุงาน: "2 ปี 3 เดือน" */
export function tenure(start: ISODate, end: ISODate): string {
  const days = diffDays(start, end);
  if (days < 0) return 'ยังไม่เริ่มงาน';
  const y = Math.floor(days / 365.25);
  const m = Math.floor((days - y * 365.25) / 30.44);
  if (y === 0 && m === 0) return `${days} วัน`;
  return [y ? `${y} ปี` : '', m ? `${m} เดือน` : ''].filter(Boolean).join(' ');
}

const moneyFmt = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('th-TH');

export const money = (n: number) => moneyFmt.format(n);
export const int = (n: number) => intFmt.format(n);

/** "เมื่อสักครู่" / "5 นาทีที่แล้ว" / "3 ชม.ที่แล้ว" / "เมื่อวาน 14:05" / "12 ต.ค. 69 09:30" */
export function timeAgo(stamp: string, now = new Date()): string {
  const t = new Date(stamp.length === 10 ? `${stamp}T00:00:00` : stamp);
  const sec = Math.round((now.getTime() - t.getTime()) / 1000);
  if (sec < 60) return 'เมื่อสักครู่';
  if (sec < 3600) return `${Math.floor(sec / 60)} นาทีที่แล้ว`;
  if (sec < 6 * 3600) return `${Math.floor(sec / 3600)} ชม.ที่แล้ว`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const hm = stamp.slice(11, 16);
  if (t.toDateString() === now.toDateString()) return `วันนี้ ${hm}`;
  if (t.toDateString() === yesterday.toDateString()) return `เมื่อวาน ${hm}`;
  return thaiDateTime(stamp);
}

export function clock(d: Date): string {
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
