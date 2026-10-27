// กรอกวันที่ในตาราง: เลือกพิมพ์ปี พ.ศ. หรือ ค.ศ.
import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { formatDateInput, parseDateInput } from '../web/assets/js/ui/datePicker.js';

describe('กรอกวันที่ พ.ศ. / ค.ศ.', () => {
  it('แสดงค่าเดิมตามยุคที่เลือก', () => {
    expect(formatDateInput('2026-03-05', 'BE')).toBe('05/03/2569');
    expect(formatDateInput('2026-03-05', 'CE')).toBe('05/03/2026');
    expect(formatDateInput('', 'BE')).toBe('');
  });
  it('พิมพ์ปีเต็ม: พ.ศ. / ค.ศ. ได้วันเดียวกัน (ปีที่ชัดว่าเป็นอีกยุคแปลงให้เอง)', () => {
    for (const era of ['BE', 'CE']) {
      expect(parseDateInput('5/3/2569', era)).toBe('2026-03-05');
      expect(parseDateInput('05-03-2026', era)).toBe('2026-03-05');
      expect(parseDateInput('05032569', era)).toBe('2026-03-05');
      expect(parseDateInput('2026-03-05', era)).toBe('2026-03-05');
    }
  });
  it('ปี 2 หลัก = ปีของยุคที่เลือก', () => {
    expect(parseDateInput('5/3/69', 'BE')).toBe('2026-03-05');
    expect(parseDateInput('5/3/26', 'CE')).toBe('2026-03-05');
  });
  it('ว่าง = ล้างค่า · วันที่ไม่มีจริง / รูปแบบผิด = null', () => {
    expect(parseDateInput('  ', 'BE')).toBe('');
    expect(parseDateInput('31/2/2569', 'BE')).toBe(null);
    expect(parseDateInput('29/2/2567', 'BE')).toBe('2024-02-29');
    expect(parseDateInput('5/13/2569', 'BE')).toBe(null);
    expect(parseDateInput('abc', 'BE')).toBe(null);
    expect(parseDateInput('5/3/256', 'BE')).toBe(null);
    expect(parseDateInput('5/3/1800', 'CE')).toBe(null);
  });
});
