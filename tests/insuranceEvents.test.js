import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { buildInsuranceCycle } from '../web/assets/js/application/usecases/insuranceCycle.js';
import { buildEmployeeChange, changeUndoBlock, validateEmployeeChange } from '../web/assets/js/application/usecases/employeeChange.js';
import { insuranceEvents } from '../web/assets/js/domain/insuranceEvents.js';
import { defaultRules } from '../web/assets/js/infrastructure/mock/rules.js'; // fixture เท่านั้น

const rules = defaultRules();
const sites = [
  { id: 1, companyCode: 'HL', name: 'สำนักงานใหญ่', hasGroupInsurance: true, active: true },
  { id: 2, companyCode: 'CNS', name: 'CNS ส่วนกลาง', hasGroupInsurance: true, active: true },
  { id: 3, companyCode: 'CNS', name: 'ไซต์แม่บ้าน ก', hasGroupInsurance: true, active: true },
  { id: 4, companyCode: 'CNS', name: 'ไซต์แม่บ้าน ข', hasGroupInsurance: false, active: true },
];
const siteById = new Map(sites.map((s) => [s.id, s]));
const emp = (p = {}) => ({
  id: 7, empCode: 'H001', firstName: 'ย้าย', lastName: 'ทดสอบ', companyCode: 'HL', siteId: 1, employeeType: 'CENTRAL', contractType: 'REGULAR',
  deptGroup: 'Support Line', position: null, level: 3, birthDate: '1990-01-01', startDate: '2026-01-01', probationPassDate: null,
  status: 'ACTIVE', lastWorkingDate: null, endDate: null, endReason: null, ...p,
});
let seq = 0;
/** การเปลี่ยนแปลงจากพนักงาน e ไปเป็นค่า to (บางช่อง) */
const change = (e, effectiveDate, to, notifyInsurer = true) => ({
  id: ++seq + 100, employeeId: e.id, effectiveDate, notifyInsurer,
  from: { companyCode: e.companyCode, siteId: e.siteId, employeeType: e.employeeType, empCode: e.empCode },
  to: { companyCode: e.companyCode, siteId: e.siteId, employeeType: e.employeeType, empCode: e.empCode, ...to },
});
/** พนักงานหลังเปลี่ยน (ค่าปัจจุบัน = to ของรายการสุดท้าย) */
const after = (e, c) => ({ ...e, ...c.to });
/** ไม่นับแจ้งออกตอนอายุครบ 65 (อยู่ไกลในอนาคตทุกคน) */
const noAge = (evs) => evs.filter((v) => v.exit?.exitReason !== 'AGE');
const brief = (evs) => noAge(evs).map((v) => [v.type, v.ref ? 'chg' : 0, v.effectiveDate, v.cycleDate, v.view.companyCode, v.view.empCode]);

describe('ประกันกลุ่ม: โอนย้าย / เปลี่ยนรหัส', () => {
  it('ไม่มีการเปลี่ยนแปลง = แจ้งเข้าครั้งเดียวแบบเดิม', () => {
    expect(brief(insuranceEvents(emp(), siteById, rules))).toEqual([['IN', 0, '2026-01-31', '2026-02-05', 'HL', 'H001']]);
  });
  it('ย้ายบริษัท (บริษัทประกันเดิม) + แจ้งประกัน → ออกวันก่อนย้าย + เข้าวันย้าย · อายุงานนับต่อ', () => {
    const e = emp();
    const c = change(e, '2026-11-20', { companyCode: 'CNS', siteId: 2, empCode: 'C001' });
    const evs = insuranceEvents(after(e, c), siteById, rules, [c]);
    expect(brief(evs)).toEqual([
      ['IN', 0, '2026-01-31', '2026-02-05', 'HL', 'H001'],
      ['OUT', 'chg', '2026-11-19', '2026-12-05', 'HL', 'H001'], // แจ้งออกจากบริษัทเดิม ด้วยรหัสเดิม
      ['IN', 'chg', '2026-11-20', '2026-12-05', 'CNS', 'C001'], // ไม่ต้องรอ 30 วันใหม่
    ]);
    expect(evs[1].reason).toBe('โอนย้ายไป CNS ส่วนกลาง (CNS)');
    expect(evs[2].reason).toBe('โอนย้ายจาก สำนักงานใหญ่ (HL)');
  });
  it('ย้ายโดยไม่ติ๊กแจ้งประกัน (ที่ใหม่ได้ประกัน) → คุ้มครองต่อเนื่อง ไม่มีรายการ', () => {
    const e = emp();
    const c = change(e, '2026-11-20', { companyCode: 'CNS', siteId: 2 }, false);
    expect(brief(insuranceEvents(after(e, c), siteById, rules, [c]))).toEqual([['IN', 0, '2026-01-31', '2026-02-05', 'HL', 'H001']]); // แจ้งเข้าตอนอยู่ HL
  });
  it('ย้ายไปหน่วยงานที่ไม่ได้รับประกัน → แจ้งออกเสมอ (แม้ไม่ติ๊ก) · ย้ายกลับ → แจ้งเข้าวันที่ย้าย', () => {
    const e = emp({ companyCode: 'CNS', siteId: 3, employeeType: 'MAID_CNS', deptGroup: null, level: null, startDate: '2025-01-01' });
    const c1 = change(e, '2026-03-10', { siteId: 4 }, false);
    const e1 = after(e, c1);
    const c2 = change(e1, '2026-06-01', { siteId: 3 }, false);
    const evs = insuranceEvents(after(e1, c2), siteById, rules, [c1, c2]);
    expect(noAge(evs).map((v) => [v.type, v.ref, v.effectiveDate, v.view.siteId])).toEqual([
      ['IN', 0, '2025-05-01', 3], // แม่บ้าน รอ 120 วัน
      ['OUT', c1.id, '2026-03-09', 3],
      ['IN', c2.id, '2026-06-01', 3],
    ]);
    expect(evs[1].reason).toBe('ย้ายไป ไซต์แม่บ้าน ข (CNS) — ไม่ได้รับประกันกลุ่ม');
  });
  it('ย้ายก่อนครบอายุงาน → แจ้งเข้าครั้งแรกที่ที่ใหม่ ตามวันครบเดิม (ไม่มีแจ้งออก)', () => {
    const e = emp({ startDate: '2026-10-01' });
    const c = change(e, '2026-10-15', { companyCode: 'CNS', siteId: 2, empCode: 'C009' });
    expect(brief(insuranceEvents(after(e, c), siteById, rules, [c]))).toEqual([['IN', 0, '2026-10-31', '2026-11-05', 'CNS', 'C009']]);
  });
  it('เปลี่ยนรหัสอย่างเดียว: ติ๊ก = แจ้งเปลี่ยนแปลง · ไม่ติ๊ก / ยังไม่ได้ประกัน = ไม่มีรายการ', () => {
    const e = emp();
    const c = change(e, '2026-11-20', { empCode: 'H999' });
    const evs = insuranceEvents(after(e, c), siteById, rules, [c]);
    expect(brief(evs)).toEqual([['IN', 0, '2026-01-31', '2026-02-05', 'HL', 'H001'], ['CHANGE', 'chg', '2026-11-20', '2026-12-05', 'HL', 'H999']]);
    expect(evs[1].reason).toBe('เปลี่ยนรหัสพนักงาน H001 → H999');
    const quiet = change(e, '2026-11-20', { empCode: 'H999' }, false);
    expect(noAge(insuranceEvents(after(e, quiet), siteById, rules, [quiet])).map((v) => v.type)).toEqual(['IN']);
    const early = emp({ startDate: '2026-11-01' });
    const ce = change(early, '2026-11-10', { empCode: 'H777' });
    expect(noAge(insuranceEvents(after(early, ce), siteById, rules, [ce])).map((v) => [v.type, v.ref])).toEqual([['IN', 0]]);
  });
  it('พ้นสภาพหลังย้าย → แจ้งออกจากที่ใหม่ · การเปลี่ยนแปลงหลังวันพ้นสภาพ / ก่อนวันเริ่มงานไม่นับ', () => {
    const e = emp();
    const c = change(e, '2026-11-20', { companyCode: 'CNS', siteId: 2 });
    const later = change(after(e, c), '2027-02-01', { siteId: 3, employeeType: 'MAID_CNS' });
    const gone = { ...after(e, c), status: 'INACTIVE', endReason: 'RESIGN', endDate: '2026-12-31', lastWorkingDate: '2026-12-31' };
    const evs = insuranceEvents(gone, siteById, rules, [c, later, change(e, '2025-12-01', { siteId: 1 })]);
    expect(evs.map((v) => [v.type, v.ref ? 'chg' : 0, v.effectiveDate, v.view.companyCode])).toEqual([
      ['IN', 0, '2026-01-31', 'HL'],
      ['OUT', 'chg', '2026-11-19', 'HL'],
      ['IN', 'chg', '2026-11-20', 'CNS'],
      ['OUT', 0, '2026-12-31', 'CNS'],
    ]);
  });
  it('รอบประกัน: ส่งแล้วจับคู่ตามการเปลี่ยนแปลง — แจ้งเข้าครั้งแรกที่ส่งแล้ว ไม่ซ่อนแจ้งเข้าตอนย้าย', () => {
    const e = emp();
    const c = change(e, '2026-11-20', { companyCode: 'CNS', siteId: 2, empCode: 'C001' });
    const now = after(e, c);
    const sentIn = { id: 1, cycleDate: '2026-02-05', insurerId: 1, items: [{ employeeId: 7, type: 'IN' }] };
    const rows = (batches) => buildInsuranceCycle('2026-12-05', [now], sites, rules, batches, [c]).rows.map((r) => [r.type, r.ref ?? 0, r.employee.empCode, r.submitted]);
    expect(rows([sentIn])).toEqual([['OUT', c.id, 'H001', false], ['IN', c.id, 'C001', false]]);
    const done = { id: 2, cycleDate: '2026-12-05', insurerId: 1, items: [{ employeeId: 7, type: 'OUT', changeId: c.id }, { employeeId: 7, type: 'IN', changeId: c.id }] };
    expect(rows([sentIn, done])).toEqual([['OUT', c.id, 'H001', true], ['IN', c.id, 'C001', true]]);
    expect(buildInsuranceCycle('2027-01-05', [now], sites, rules, [sentIn, done], [c]).rows).toEqual([]);
  });
});

describe('บันทึกโอนย้าย / เปลี่ยนรหัส', () => {
  const e = emp();
  const ctx = { sites, employees: [e, emp({ id: 8, empCode: 'C001' })], changes: [] };
  const base = { effectiveDate: '2026-11-20', companyCode: 'CNS', siteId: 2, employeeType: 'CENTRAL', empCode: 'C002', notifyInsurer: true };
  it('ตรวจ: วันที่หลังวันเริ่มงาน / หลังครั้งก่อน · หน่วยงานต้องอยู่ในบริษัท · รหัสห้ามซ้ำ · ต้องมีอะไรเปลี่ยน', () => {
    expect(validateEmployeeChange(e, base, ctx)).toEqual({});
    expect(Object.keys(validateEmployeeChange(e, { ...base, effectiveDate: '2026-01-01' }, ctx))).toEqual(['effectiveDate']);
    expect(Object.keys(validateEmployeeChange(e, { ...base, siteId: 1 }, ctx))).toEqual(['siteId']);
    expect(validateEmployeeChange(e, { ...base, empCode: 'C001' }, ctx).empCode).toBe('รหัสพนักงานซ้ำ');
    expect(Object.keys(validateEmployeeChange(e, { ...base, companyCode: 'HL', siteId: 1, empCode: 'H001' }, ctx))).toEqual(['siteId']);
    const prev = { ...ctx, changes: [{ id: 1, employeeId: 7, effectiveDate: '2026-11-25' }] };
    expect(validateEmployeeChange(e, base, prev).effectiveDate).toBe('ต้องหลังการเปลี่ยนแปลงครั้งก่อน (2026-11-25)');
    expect(Object.keys(validateEmployeeChange({ ...e, status: 'INACTIVE' }, base, ctx))).toEqual(['effectiveDate']);
  });
  it('ชนิด: ย้าย / เปลี่ยนรหัส · ลบได้เฉพาะรายการล่าสุดที่ยังไม่ส่งออก', () => {
    const c1 = buildEmployeeChange(e, base, { id: 1, at: 'x', by: 'hr' });
    expect([c1.kind, c1.from.empCode, c1.to.empCode, c1.to.siteId]).toEqual(['TRANSFER', 'H001', 'C002', 2]);
    const c2 = buildEmployeeChange(after(e, c1), { ...base, effectiveDate: '2026-12-01', empCode: 'C003' }, { id: 2, at: 'x', by: 'hr' });
    expect(c2.kind).toBe('CODE');
    expect(changeUndoBlock(c1, [c1, c2], [])).toBe('ลบได้เฉพาะรายการล่าสุด');
    expect(changeUndoBlock(c2, [c1, c2], [])).toBe(null);
    expect(changeUndoBlock(c2, [c1, c2], [{ items: [{ employeeId: 7, type: 'CHANGE', changeId: 2 }] }]).includes('ส่งออกแล้ว')).toBe(true);
  });
});
