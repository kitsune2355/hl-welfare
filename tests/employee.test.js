import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { normalizeEmployee } from '../web/assets/js/application/employeeRules.js';
import { ageOf, PROBATION_DAYS, probationDueDate } from '../web/assets/js/domain/employee.js';

describe('ข้อมูลพนักงานที่คำนวณเอง', () => {
  it('วันผ่านทดลองงาน = วันเริ่มงาน + 119 วัน', () => {
    expect(PROBATION_DAYS).toBe(119);
    expect(probationDueDate('2026-01-01')).toBe('2026-04-30');
    expect(probationDueDate('2024-11-15')).toBe('2025-03-14');
    expect(probationDueDate(null)).toBe(null);
  });
  it('อายุเต็มปี (ยังไม่ถึงวันเกิดปีนี้ = ลบ 1)', () => {
    expect(ageOf('1990-10-20', '2026-10-20')).toBe(36);
    expect(ageOf('1990-10-21', '2026-10-20')).toBe(35);
    expect(ageOf('', '2026-10-20')).toBe(null);
  });
  it('normalizeEmployee: ว่าง → คำนวณให้ · กรอกเองแล้ว → คงไว้', () => {
    const sites = [{ id: 1, companyCode: 'HL' }];
    const base = { companyCode: 'HL', siteId: 1, employeeType: 'CENTRAL', startDate: '2026-01-01' };
    expect(normalizeEmployee({ ...base, probationPassDate: null }, sites).probationPassDate).toBe('2026-04-30');
    expect(normalizeEmployee({ ...base, probationPassDate: '2026-06-30' }, sites).probationPassDate).toBe('2026-06-30');
  });
});
