// กฎตรวจข้อมูลพนักงาน (application/employeeRules.js) — ข้อมูลสมมติ
import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { validateEmployee } from '../web/assets/js/application/employeeRules.js';

const base = {
  empCode: 'T0001',
  firstName: 'ทดสอบ',
  lastName: 'กฎ',
  companyCode: 'PRO',
  siteId: 10,
  employeeType: 'PRO_SITE',
  birthDate: '1995-01-01',
  startDate: '2026-09-01',
  status: 'ACTIVE',
};

describe('กฎตรวจข้อมูลพนักงาน', () => {
  it('ไม่บังคับเงินเดือน / ตำแหน่ง (ไม่มีคอลัมน์ให้กรอกแล้ว)', () => {
    expect(validateEmployee({ ...base, salary: 0, position: '' })).toEqual({});
    expect(validateEmployee({ ...base, salary: undefined, position: null })).toEqual({});
  });
  it('ช่องบังคับอื่นยังตรวจ', () => {
    const x = validateEmployee({ ...base, siteId: 0, firstName: '' });
    expect([!!x.siteId, !!x.firstName]).toEqual([true, true]);
  });
});
