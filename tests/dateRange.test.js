import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { datePresets, inRange, isDateColumn, isoDay, isRange, makeRange, rangeLabel } from '../web/assets/js/domain/dateRange.js';
import { FilterState } from '../web/assets/js/ui/columnFilter.js';
import { thaiDate } from '../web/assets/js/shared/format.js';

describe('ตัวกรองช่วงวันที่ของคอลัมน์วันที่', () => {
  it('ตรวจคอลัมน์วันที่จากค่าที่ใช้เรียง (ว่างได้ · มีเวลาต่อท้ายได้)', () => {
    expect(isDateColumn(['2026-11-09', null, '', '2026-01-01 08:30:00', '2026-02-03T10:00:00Z'])).toBe(true);
    expect(isDateColumn([null, ''])).toBe(false);
    expect(isDateColumn(['2026-11-09', 'E0001'])).toBe(false);
    expect(isDateColumn([5, 10])).toBe(false);
    expect(isDateColumn(['2026-11-091'])).toBe(false);
    expect(isoDay('2026-11-09 23:59:59')).toBe('2026-11-09');
  });
  it('makeRange: ว่างทั้งคู่ = ไม่กรอง · สลับให้เมื่อต้น > ท้าย · เว้นข้างเดียวได้', () => {
    expect(makeRange('', '')).toBe(null);
    expect(makeRange('2026-12-31', '2026-01-01')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(makeRange('2026-03-01', '')).toEqual({ from: '2026-03-01', to: '' });
    expect(isRange({ from: '2026-03-01', to: '' })).toBe(true);
    expect(isRange(new Set(['a']))).toBe(false);
  });
  it('inRange รวมวันต้นและวันท้าย · ค่าว่างไม่อยู่ในช่วง', () => {
    const r = { from: '2026-10-01', to: '2026-10-31' };
    expect(inRange('2026-10-01', r)).toBe(true);
    expect(inRange('2026-10-31 18:00:00', r)).toBe(true);
    expect(inRange('2026-11-01', r)).toBe(false);
    expect(inRange(null, r)).toBe(false);
    expect(inRange('2020-01-01', { from: '', to: '2026-01-01' })).toBe(true);
  });
  it('ปุ่มลัดคำนวณจากวันนี้ (สิ้นเดือน / ข้ามปี)', () => {
    const p = Object.fromEntries(datePresets('2026-01-15').map((x) => [x.id, x]));
    expect([p.thisMonth.from, p.thisMonth.to]).toEqual(['2026-01-01', '2026-01-31']);
    expect([p.lastMonth.from, p.lastMonth.to]).toEqual(['2025-12-01', '2025-12-31']);
    expect([p.nextMonth.from, p.nextMonth.to]).toEqual(['2026-02-01', '2026-02-28']);
    expect([p.past7.from, p.past7.to]).toEqual(['2026-01-09', '2026-01-15']);
    expect(p.thisYear.label).toBe('ปี 2569');
  });
  it('ข้อความใน chip', () => {
    expect(rangeLabel({ from: '2026-10-01', to: '2026-10-31' }, thaiDate)).toBe('1 ต.ค. 69 – 31 ต.ค. 69');
    expect(rangeLabel({ from: '2026-10-01', to: '' }, thaiDate)).toBe('ตั้งแต่ 1 ต.ค. 69');
    expect(rangeLabel({ from: '', to: '2026-10-31' }, thaiDate)).toBe('ถึง 31 ต.ค. 69');
    expect(rangeLabel({ from: '2026-10-05', to: '2026-10-05' }, thaiDate)).toBe('5 ต.ค. 69');
  });
  it('FilterState กรองด้วยช่วง (ใช้ค่าที่ใช้เรียง) ร่วมกับตัวกรองแบบติ๊กของคอลัมน์อื่น', () => {
    const rows = [
      { id: 1, d: '2026-09-30', c: 'HL' },
      { id: 2, d: '2026-10-01', c: 'HL' },
      { id: 3, d: '2026-10-15', c: 'CNS' },
      { id: 4, d: null, c: 'HL' },
    ];
    const f = new FilterState();
    f.filters.set('d', { from: '2026-10-01', to: '2026-10-31' });
    const ids = (out) => out.map((r) => r.id);
    const textOf = (r, k) => (k === 'd' ? thaiDate(r.d) : r[k]);
    const sortOf = (r, k) => r[k];
    expect(ids(f.apply(rows, textOf, sortOf))).toEqual([2, 3]);
    f.filters.set('c', new Set(['HL']));
    expect(ids(f.apply(rows, textOf, sortOf))).toEqual([2]);
    expect(ids(f.apply(rows, textOf, sortOf, undefined, 'd'))).toEqual([1, 2, 4]);
  });
});
