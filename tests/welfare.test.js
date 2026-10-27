import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import {
  matchWelfareRule,
  normalizeWelfareProgram,
  validateWelfareProgram,
  validateWelfareRecord,
  welfarePeriodLabel,
  welfareStatus,
} from '../web/assets/js/domain/welfare.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';

const TODAY = '2026-10-16';
const emp = {
  id: 1,
  companyCode: 'HL',
  employeeType: 'CENTRAL',
  deptGroup: 'Support Line',
  position: null,
  gender: 'F',
  level: 4,
  startDate: '2024-03-10',
  probationPassDate: '2024-07-07',
  status: 'ACTIVE',
  endDate: null,
  lastWorkingDate: null,
};
const program = (over = {}) =>
  normalizeWelfareProgram({
    id: 1,
    name: 'ตรวจสุขภาพ',
    frequency: 'YEARLY',
    unit: 'บาท',
    rules: [
      { id: 1, label: 'ระดับ 6 ขึ้นไป', levelMin: 6, amount: 3000 },
      { id: 2, label: 'ทั่วไป', waitDays: 90, amount: 1500 },
    ],
    fields: [{ label: 'โรงพยาบาล', type: 'select', options: ['A', 'B'], required: true }],
    ...over,
  });

describe('domain/welfare', () => {
  it('เลือกกฎข้อแรกที่ตรง', () => {
    const p = program();
    expect(matchWelfareRule(emp, p.rules).id).toBe(2);
    expect(matchWelfareRule({ ...emp, level: 7 }, p.rules).id).toBe(1);
    expect(matchWelfareRule(emp, [{ ...p.rules[1], genders: ['M'] }])).toBeNull();
  });
  it('รายปี: รอบย้อนหลังไม่เกิน 3 ปี · ให้แล้วไม่ค้าง', () => {
    const p = program();
    const s = welfareStatus(emp, p, [], TODAY);
    expect(s).toMatchObject({ state: 'DUE', eligibleDate: '2024-06-08', due: 3, amount: 1500 });
    expect(s.periods.map((x) => x.key)).toEqual(['Y-2024', 'Y-2025', 'Y-2026']);
    const recs = ['Y-2024', 'Y-2025', 'Y-2026'].map((k, i) => ({ id: i + 1, programId: 1, employeeId: 1, periodKey: k, amount: 1500 }));
    expect(welfareStatus(emp, p, recs, TODAY).state).toBe('DONE');
  });
  it('ครั้งเดียว / รอครบสิทธิ์ / พ้นสภาพก่อนครบ', () => {
    const p = program({ frequency: 'ONCE' });
    expect(welfareStatus({ ...emp, startDate: '2026-10-01' }, p, [], TODAY).state).toBe('WAITING');
    expect(welfareStatus({ ...emp, startDate: '2026-10-01', status: 'INACTIVE', endDate: '2026-10-10' }, p, [], TODAY).state).toBe('NONE');
    expect(welfareStatus(emp, p, [], TODAY).periods.map((x) => x.key)).toEqual(['ONCE']);
  });
  it('รายเดือน: 12 เดือนล่าสุด', () => {
    const s = welfareStatus(emp, program({ frequency: 'MONTHLY' }), [], TODAY);
    expect(s.periods.length).toBe(12);
    expect(s.periods.at(-1).key).toBe('M-2026-10');
    expect(s.periods[0].key).toBe('M-2025-11');
  });
  it('เบิกได้หลายครั้ง: ตัดวงเงินต่อปี', () => {
    const p = program({ frequency: 'ANYTIME' });
    const recs = [{ id: 1, programId: 1, employeeId: 1, periodKey: 'Y-2026', amount: 1000 }];
    const s = welfareStatus(emp, p, recs, TODAY);
    expect(s.periods[0]).toMatchObject({ key: 'Y-2026', used: 1000, remaining: 500, done: false });
    expect(validateWelfareRecord(p, s, { periodKey: 'Y-2026', date: TODAY, amount: 600, data: { f1: 'A' } }).amount).toBeTruthy();
    expect(validateWelfareRecord(p, s, { periodKey: 'Y-2026', date: TODAY, amount: 500, data: { f1: 'A' } })).toEqual({});
  });
  it('ตรวจการให้: รอบที่ให้แล้ว / ช่องบังคับ / ตัวเลือกนอกรายการ', () => {
    const p = program();
    const recs = [{ id: 1, programId: 1, employeeId: 1, periodKey: 'Y-2026', amount: 1500 }];
    const s = welfareStatus(emp, p, recs, TODAY);
    expect(validateWelfareRecord(p, s, { periodKey: 'Y-2026', date: TODAY, amount: 1500, data: { f1: 'A' } }).periodKey).toBe('รอบนี้ให้แล้ว');
    expect(validateWelfareRecord(p, s, { periodKey: 'Y-2025', date: TODAY, amount: 1500, data: {} })['data.f1']).toBeTruthy();
    expect(validateWelfareRecord(p, s, { periodKey: 'Y-2025', date: TODAY, amount: 1500, data: { f1: 'C' } })['data.f1']).toBeTruthy();
  });
  it('ตรวจการตั้งค่า + เติมรหัสเงื่อนไข/ช่องข้อมูลใหม่', () => {
    const p = normalizeWelfareProgram({ name: ' ทุนการศึกษา ', frequency: 'YEARLY', rules: [{ id: 3 }, {}], fields: [{ key: 'f2', label: 'a', type: 'text' }, { label: 'b', type: 'number' }] });
    expect(p.name).toBe('ทุนการศึกษา');
    expect(p.rules.map((r) => r.id)).toEqual([3, 4]);
    expect(p.fields.map((f) => f.key)).toEqual(['f2', 'f3']);
    expect(validateWelfareProgram(p, [])).toEqual({});
    expect(validateWelfareProgram(p, [{ id: 9, name: 'ทุนการศึกษา' }]).name).toBeTruthy();
    expect(validateWelfareProgram({ ...p, rules: [] }, []).rules).toBeTruthy();
    expect(validateWelfareProgram(normalizeWelfareProgram({ ...p, rules: [{ levelMin: 5, levelMax: 2 }] }), [])['rules.0.levelMax']).toBeTruthy();
  });
  it('ชื่อรอบเป็น พ.ศ.', () => {
    expect(welfarePeriodLabel('Y-2026')).toBe('ปี 2569');
    expect(welfarePeriodLabel('M-2026-03')).toBe('มี.ค. 2569');
    expect(welfarePeriodLabel('ONCE')).toBe('ครั้งเดียว');
  });
});

describe('MockApi สวัสดิการเพิ่มเติม', () => {
  it('สร้าง → ผู้มีสิทธิ์ → บันทึกการให้ → ให้ซ้ำ 422 → ยกเลิก', async () => {
    const api = new MockApi(() => TODAY);
    const p = await api.saveWelfareProgram({ name: 'ของขวัญปีใหม่', icon: 'gift', frequency: 'YEARLY', unit: 'บาท', rules: [{ amount: 500 }], fields: [] });
    expect(p.id).toBe(1);
    expect((await api.listWelfarePrograms()).length).toBe(1);
    const roster = await api.getWelfareRoster(p.id);
    const row = roster.find((r) => r.status.state === 'DUE' && r.employee.status === 'ACTIVE');
    const input = { employeeId: row.employee.id, periodKey: 'Y-2026', date: TODAY, amount: 500 };
    const rec = await api.createWelfareRecord(p.id, input);
    await expect(api.createWelfareRecord(p.id, input)).rejects.toMatchObject({ status: 422 });
    expect((await api.listWelfareRecords(p.id))[0].employee.id).toBe(row.employee.id);
    const b = await api.getEmployeeBenefits(row.employee.id);
    expect(b.welfare[0].status.periods.find((x) => x.key === 'Y-2026').done).toBe(true);
    await api.cancelWelfareRecord(rec.id);
    expect((await api.listWelfareRecords(p.id)).length).toBe(0);
    const d = await api.getDashboard();
    expect(d.welfareDue[0].programId).toBe(p.id);
  });
  it('ชื่อซ้ำ → 422 · ปิดใช้งานแล้วบันทึกการให้ไม่ได้', async () => {
    const api = new MockApi(() => TODAY);
    const p = await api.saveWelfareProgram({ name: 'A', frequency: 'ONCE', rules: [{}] });
    await expect(api.saveWelfareProgram({ name: 'a', frequency: 'ONCE', rules: [{}] })).rejects.toMatchObject({ status: 422 });
    await api.saveWelfareProgram({ ...p, active: false });
    await expect(api.createWelfareRecord(p.id, { employeeId: 1, periodKey: 'ONCE', date: TODAY })).rejects.toMatchObject({ status: 409 });
  });
});
