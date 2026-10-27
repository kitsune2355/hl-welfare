// กลุ่ม / ฝ่าย — กฎตรวจ (application/deptGroupRules.js) + MockApi (= backend/api/dept_groups.php)
import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { validateDeptGroup } from '../web/assets/js/application/deptGroupRules.js';
import { matchDeptGroup } from '../web/assets/js/application/usecases/employeeImport.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';

const make = () => new MockApi(() => '2026-10-16');
const groups = [
  { id: 1, name: 'Support Line' },
  { id: 2, name: 'ฝ่ายขาย' },
];

describe('กลุ่ม / ฝ่าย: กฎตรวจชื่อ', () => {
  it('ว่าง / ซ้ำ (ไม่สนตัวพิมพ์) / มี “,” = ไม่ผ่าน · ชื่อเดิมของตัวเอง = ผ่าน', () => {
    expect(validateDeptGroup('  ', groups, 0).name).toBe('กรุณากรอกชื่อกลุ่ม / ฝ่าย');
    expect(validateDeptGroup(' support line ', groups, 0).name).toBe('มีกลุ่ม / ฝ่ายชื่อนี้แล้ว');
    expect(validateDeptGroup('ก, ข', groups, 0).name).toBe('ชื่อห้ามมีเครื่องหมาย “,”');
    expect(validateDeptGroup('Support Line', groups, 1)).toEqual({});
    expect(validateDeptGroup('ฝ่ายบัญชี', groups, 0)).toEqual({});
  });
  it('นำเข้า Excel: จับคู่ฝ่ายกับรายการที่ตั้งค่า (ชื่อยาวก่อน)', () => {
    expect(matchDeptGroup('ฝ่ายบัญชีและการเงิน', ['ฝ่ายบัญชี', 'ฝ่ายขาย'])).toBe('ฝ่ายบัญชี');
    expect(matchDeptGroup('BU ส่วนกลาง (HL)', ['BU', 'BU ส่วนกลาง'])).toBe('BU ส่วนกลาง');
    expect(matchDeptGroup('ไม่มีในรายการ', ['ฝ่ายขาย'])).toBe(null);
  });
});

describe('กลุ่ม / ฝ่าย: MockApi', () => {
  it('รายการตั้งต้น 6 กลุ่ม + จำนวนพนักงาน / กฎที่ใช้', async () => {
    const api = make();
    const list = await api.listDeptGroups();
    const emps = await api.listEmployees();
    const sl = list.find((g) => g.name === 'Support Line');
    expect(list.length).toBeGreaterThan(5);
    expect(sl.ruleCount).toBe(2);
    expect(sl.employeeCount).toBe(emps.filter((e) => e.deptGroup === 'Support Line').length);
  });
  it('เพิ่ม → ต่อท้าย (เปิดใช้งาน) · ซ้ำ → 422 · ปิดใช้งาน = ยังอยู่ในรายการ', async () => {
    const api = make();
    const g = await api.saveDeptGroup({ name: ' ฝ่ายทดสอบ ' });
    expect(g.name).toBe('ฝ่ายทดสอบ');
    expect((await api.listDeptGroups()).at(-1).id).toBe(g.id);
    await expect(api.saveDeptGroup({ name: 'ฝ่ายทดสอบ' })).rejects.toMatchObject({ status: 422 });
    expect(g.active).toBe(true);
    const off = await api.saveDeptGroup({ id: g.id, name: g.name, active: false });
    expect([off.active, (await api.listDeptGroups()).find((x) => x.id === g.id)?.active]).toEqual([false, false]);
    expect('deleteDeptGroup' in api).toBe(false); // ไม่มีการลบแล้ว
  });
  it('กลุ่มที่ปิด: พนักงานเดิมแก้ได้ · ย้ายพนักงานอื่นเข้ากลุ่มนี้ไม่ได้ (422)', async () => {
    const api = make();
    const sl = (await api.listDeptGroups()).find((g) => g.name === 'Support Line');
    await api.saveDeptGroup({ id: sl.id, name: sl.name, active: false });
    const emps = await api.listEmployees({ employeeType: 'CENTRAL' });
    const inSl = emps.find((e) => e.deptGroup === 'Support Line');
    const other = emps.find((e) => e.deptGroup && e.deptGroup !== 'Support Line');
    expect((await api.saveEmployee({ ...inSl, phone: '0811111111' })).deptGroup).toBe('Support Line');
    await expect(api.saveEmployee({ ...other, deptGroup: 'Support Line' })).rejects.toMatchObject({ status: 422 });
  });
  it('เปลี่ยนชื่อ → พนักงาน + กฎชุดฟอร์มทุกฉบับเปลี่ยนตาม', async () => {
    const api = make();
    const sl = (await api.listDeptGroups()).find((g) => g.name === 'Support Line');
    await api.saveDeptGroup({ id: sl.id, name: 'Support Line (ใหม่)' });
    const emps = await api.listEmployees();
    expect(emps.filter((e) => e.deptGroup === 'Support Line').length).toBe(0);
    expect(emps.filter((e) => e.deptGroup === 'Support Line (ใหม่)').length).toBe(sl.employeeCount);
    const rules = await api.getRules();
    expect(rules.uniform.find((r) => r.id === 1).deptGroups).toEqual(['Support Line (ใหม่)']);
    const h = await api.getRuleHistory();
    expect(h.uniform.flatMap((t) => [...t.history, ...t.pending]).some((r) => r.deptGroups?.includes('Support Line'))).toBe(false);
  });
});
