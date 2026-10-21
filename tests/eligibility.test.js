import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { buildInsuranceCycle } from '../web/assets/js/application/usecases/insuranceCycle.js';
import { defaultRules } from '../web/assets/js/infrastructure/mock/rules.js'; // fixture เท่านั้น
import { buildSeed } from '../web/assets/js/infrastructure/mock/seed.js';
import { insuranceStatus, matchUniformRule, uniformStatus } from '../web/assets/js/domain/eligibility.js';
const rules = defaultRules();
const TODAY = '2026-10-16';
const site = (p = {}) => ({ id: 1, companyCode: 'HL', name: 'HQ', hasGroupInsurance: true, poloColor: 'BLACK', ...p });
const emp = (p = {}) => ({
  id: 1,
  empCode: 'T001',
  firstName: 'ทดสอบ',
  lastName: 'ระบบ',
  companyCode: 'HL',
  siteId: 1,
  employeeType: 'CENTRAL',
  contractType: 'REGULAR',
  deptGroup: 'Support Line',
  position: null,
  level: 3,
  salary: 30000,
  birthDate: '1990-01-01',
  startDate: '2026-01-01',
  probationPassDate: null,
  status: 'ACTIVE',
  lastWorkingDate: null,
  endDate: null,
  endReason: null,
  ...p,
});
describe('ประกันกลุ่ม', () => {
  it('ส่วนกลาง ครบ 30 วัน (นับวันเริ่มงานเป็นวันที่ 1) → รอบวันที่ 5 ถัดไป', () => {
    const s = insuranceStatus(emp({ startDate: '2026-10-10' }), site(), rules);
    expect(s.eligible).toBe(true);
    expect(s.eligibleDate).toBe('2026-11-08');
    expect(s.enrollCycleDate).toBe('2026-12-05');
  });
  it('ครบสิทธิวันที่ 5 พอดี → เข้ารอบนั้นเลย', () => {
    const s = insuranceStatus(emp({ startDate: '2026-10-07' }), site(), rules);
    expect(s.eligibleDate).toBe('2026-11-05');
    expect(s.enrollCycleDate).toBe('2026-11-05');
  });
  it('ครบสิทธิหลังวันที่ 5 → รอบเดือนถัดไป', () => {
    const s = insuranceStatus(emp({ startDate: '2026-10-08' }), site(), rules);
    expect(s.eligibleDate).toBe('2026-11-06');
    expect(s.enrollCycleDate).toBe('2026-12-05');
  });
  it('อายุครบ 65 ระหว่างเป็นสมาชิก → แจ้งออกรอบถัดไป', () => {
    const s = insuranceStatus(emp({ startDate: '2020-01-01', birthDate: '1961-11-20' }), site(), rules);
    expect(s.eligible).toBe(true);
    expect(s.exitReason).toBe('AGE');
    expect(s.exitDate).toBe('2026-11-20');
    expect(s.exitCycleDate).toBe('2026-12-05');
  });
  it('อายุครบ 65 ก่อนรอบแจ้งเข้า → ไม่มีสิทธิ', () => {
    const s = insuranceStatus(emp({ startDate: '2026-10-10', birthDate: '1961-11-20' }), site(), rules);
    expect(s.eligible).toBe(false);
  });
  it('ขาดงานแล้วกลับมาทำงาน (ตั้งวันเริ่มงานใหม่) → แจ้งเข้าใหม่ แม้เคยแจ้งเข้า/ออกไปแล้ว', () => {
    const e = emp({ id: 7, startDate: '2026-09-07' });
    const old = [
      { id: 1, cycleDate: '2026-03-05', items: [{ employeeId: 7, type: 'IN' }] },
      { id: 2, cycleDate: '2026-08-05', items: [{ employeeId: 7, type: 'OUT' }] },
    ];
    const row = buildInsuranceCycle('2026-11-05', [e], [site()], rules, old).rows.find((r) => r.type === 'IN');
    expect(row.submitted).toBe(false);
    expect(row.effectiveDate).toBe('2026-10-06');
  });
  it('พ้นสภาพก่อนอายุครบ 65 → ใช้วันพ้นสภาพ', () => {
    const s = insuranceStatus(
      emp({ startDate: '2020-01-01', birthDate: '1961-11-20', status: 'INACTIVE', endReason: 'RESIGN', endDate: '2026-10-31', lastWorkingDate: '2026-10-30' }),
      site(),
      rules,
    );
    expect(s.exitReason).toBe('RESIGN');
    expect(s.exitDate).toBe('2026-10-31');
  });
  it('Pro Site สัญญา 3% → ไม่มีสิทธิ', () => {
    const s = insuranceStatus(
      emp({ companyCode: 'PRO', employeeType: 'PRO_SITE', contractType: 'SHORT_3PCT' }),
      site(),
      rules,
    );
    expect(s.eligible).toBe(false);
    expect(s.reasons[0]).toContain('3%');
  });
  it('แม่บ้าน CNS หน่วยงานไม่ได้ประกัน → ไม่มีสิทธิ', () => {
    const s = insuranceStatus(
      emp({ companyCode: 'CNS', employeeType: 'MAID_CNS' }),
      site({ hasGroupInsurance: false }),
      rules,
    );
    expect(s.eligible).toBe(false);
  });
  it('รายวัน CNS / CIC / PRO ได้ประกันกลุ่มเมื่อครบ 120 วัน', () => {
    for (const companyCode of ['CNS', 'CIC', 'PRO']) {
      const s = insuranceStatus(emp({ companyCode, employeeType: 'DAILY', startDate: '2026-01-01' }), site(), rules);
      expect(s.eligible).toBe(true);
      expect(s.eligibleDate).toBe('2026-04-30');
    }
  });
  it('อายุครบ 65 ก่อนรอบแจ้งเข้า → ไม่มีสิทธิ / ยังไม่ครบ 65 ณ รอบแจ้งเข้า → ได้', () => {
    expect(insuranceStatus(emp({ birthDate: '1960-01-01' }), site(), rules).eligible).toBe(false);
    expect(insuranceStatus(emp({ birthDate: '1961-03-01' }), site(), rules).eligible).toBe(true);
  });
  it('ขาดงาน 3 วัน → วันออก = วันทำงานสุดท้าย + 7', () => {
    const s = insuranceStatus(
      emp({ status: 'INACTIVE', endReason: 'ABSENT_3D', lastWorkingDate: '2026-10-01', endDate: '2026-10-04' }),
      site(),
      rules,
    );
    expect(s.exitDate).toBe('2026-10-08');
    expect(s.exitCycleDate).toBe('2026-11-05');
    expect(s.exitUrgent).toBe(false);
  });
  it('เลิกจ้าง → urgent, exitCycleDate = endDate', () => {
    const s = insuranceStatus(
      emp({ status: 'INACTIVE', endReason: 'TERMINATED', endDate: '2026-10-14' }),
      site(),
      rules,
    );
    expect(s.exitUrgent).toBe(true);
    expect(s.exitCycleDate).toBe('2026-10-14');
  });
  it('ลาออกก่อนถึงรอบแจ้งเข้า → ไม่ต้องแจ้ง', () => {
    const s = insuranceStatus(
      emp({ startDate: '2026-09-20', status: 'INACTIVE', endReason: 'RESIGN', endDate: '2026-10-25' }),
      site(),
      rules,
    );
    expect(s.eligible).toBe(false);
  });
});
describe('ชุดฟอร์ม', () => {
  it('Support Line ระดับ 3 → rule 1 (4/2)', () => {
    expect(matchUniformRule(emp({ level: 3 }), rules.uniform)?.id).toBe(1);
  });
  it('Support Line ระดับ 7 → rule 2 (2/1)', () => {
    expect(matchUniformRule(emp({ level: 7 }), rules.uniform)?.id).toBe(2);
  });
  it('CIC BU ส่วนกลาง ระดับ 7 → กฎ 19 (1 ตัว) · ระดับ 10 → ไม่พบกฎ (สูงสุดระดับ 9)', () => {
    expect(matchUniformRule(emp({ companyCode: 'CIC', deptGroup: 'BU ส่วนกลาง', level: 7 }), rules.uniform)?.id).toBe(19);
    expect(matchUniformRule(emp({ companyCode: 'CIC', deptGroup: 'BU ส่วนกลาง', level: 10 }), rules.uniform)).toBeNull();
  });
  it('Pro Site ตำแหน่งไม่อยู่ในรายการ → ตำแหน่งอื่นๆ / วิศวกร → rule 17', () => {
    const pro = { companyCode: 'PRO', employeeType: 'PRO_SITE', deptGroup: null, level: null };
    expect(matchUniformRule(emp({ ...pro, position: 'ธุรการ' }), rules.uniform)?.id).toBe(18);
    expect(matchUniformRule(emp({ ...pro, position: 'วิศวกร' }), rules.uniform)?.id).toBe(17);
  });
  it('ช่างทีมโมบาย site สีน้ำเงิน → POLO_NAVY, เริ่มงาน = ชุดช่าง 2 + โปโล 1 + รองเท้า 1', () => {
    const e = emp({
      companyCode: 'PRO',
      employeeType: 'PRO_SITE',
      deptGroup: null,
      level: null,
      position: 'ช่างทีมโมบาย',
      startDate: '2026-10-10',
    });
    const u = uniformStatus(e, site({ poloColor: 'NAVY' }), rules, [], TODAY);
    expect(u.entitlements[0].items).toContain('POLO_NAVY');
    expect(u.entitlements[0].itemQty).toEqual({ POLO_NAVY: 1, TECH_SHIRT: 2, TECH_PANTS: 2, SAFETY_SHOES: 1 });
  });
  it('หน่วยงานตั้งชุดฟอร์มทับกฎ → ใช้จำนวนของหน่วยงานแทนทั้งชุด', () => {
    const e = emp({ companyCode: 'PRO', employeeType: 'PRO_SITE', deptGroup: null, level: null, position: 'ช่างทีมโมบาย', startDate: '2026-10-10' });
    const s = site({
      poloColor: 'NAVY',
      uniformOverrides: [{ ruleId: 16, quantities: { START: { POLO_BLACK: 3, TECH_SHIRT: 0 }, PROBATION: {}, ANNUAL: {} } }],
    });
    const u = uniformStatus(e, s, rules, [], TODAY);
    expect(u.siteOverride).toBe(true);
    expect(u.entitlements.length).toBe(1);
    expect(u.entitlements[0].itemQty).toEqual({ POLO_NAVY: 3 });
  });
  it('ประจำปี: ทุก 1 ม.ค. หลังผ่านทดลองงาน ย้อนหลังไม่เกิน 3 ปี', () => {
    const u = uniformStatus(
      emp({ startDate: '2018-01-01', probationPassDate: '2018-04-30' }),
      site(),
      rules,
      [],
      TODAY,
    );
    expect(u.entitlements.map((x) => x.key)).toEqual(['PROBATION', 'ANNUAL-2024', 'ANNUAL-2025', 'ANNUAL-2026']);
  });
});
describe('seed + รอบประกัน', () => {
  it('URGENT ค้างส่ง 2 ราย และไม่มี IN ซ้ำ', () => {
    const db = buildSeed(TODAY);
    const cycle = buildInsuranceCycle('2026-11-05', db.employees, db.sites, db.rules, db.batches);
    const urgent = cycle.rows.filter((r) => r.type === 'URGENT' && !r.submitted);
    expect(urgent.map((r) => r.employee.lastName).sort()).toEqual(['ทำผิด', 'เลิกจ้าง']);
    const ins = cycle.rows.filter((r) => r.type === 'IN').map((r) => r.employee.id);
    expect(new Set(ins).size).toBe(ins.length);
  });
});
