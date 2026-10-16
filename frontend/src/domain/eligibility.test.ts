import { describe, expect, it } from 'vitest';
import { buildInsuranceCycle } from '../application/usecases/insuranceCycle';
import { defaultRules } from '../infrastructure/mock/rules'; // fixture เท่านั้น
import { buildSeed } from '../infrastructure/mock/seed';
import { insuranceStatus, matchUniformRule, pvdStatus, uniformStatus } from './eligibility';
import type { Employee, Site } from './types';

const rules = defaultRules();
const TODAY = '2026-10-16';

const site = (p: Partial<Site> = {}): Site => ({ id: 1, companyCode: 'HL', name: 'HQ', hasGroupInsurance: true, poloColor: 'BLACK', ...p });

const emp = (p: Partial<Employee> = {}): Employee => ({
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
  it('ส่วนกลาง ครบ 30 วัน → รอบวันที่ 5 ถัดไป', () => {
    const s = insuranceStatus(emp({ startDate: '2026-10-10' }), site(), rules);
    expect(s.eligible).toBe(true);
    expect(s.eligibleDate).toBe('2026-11-09');
    expect(s.enrollCycleDate).toBe('2026-12-05');
  });

  it('ครบสิทธิวันที่ 5 พอดี → เข้ารอบนั้นเลย', () => {
    const s = insuranceStatus(emp({ startDate: '2026-10-06' }), site(), rules);
    expect(s.eligibleDate).toBe('2026-11-05');
    expect(s.enrollCycleDate).toBe('2026-11-05');
  });

  it('Pro Site สัญญา 3% → ไม่มีสิทธิ', () => {
    const s = insuranceStatus(emp({ companyCode: 'PRO', employeeType: 'PRO_SITE', contractType: 'SHORT_3PCT' }), site(), rules);
    expect(s.eligible).toBe(false);
    expect(s.reasons[0]).toContain('3%');
  });

  it('แม่บ้าน CNS หน่วยงานไม่ได้ประกัน → ไม่มีสิทธิ', () => {
    const s = insuranceStatus(emp({ companyCode: 'CNS', employeeType: 'MAID_CNS' }), site({ hasGroupInsurance: false }), rules);
    expect(s.eligible).toBe(false);
  });

  it('รายวัน CNS ไม่อยู่ในเงื่อนไข', () => {
    expect(insuranceStatus(emp({ companyCode: 'CNS', employeeType: 'DAILY' }), site(), rules).eligible).toBe(false);
  });

  it('อายุ 66 ณ รอบแจ้งเข้า → ไม่มีสิทธิ / อายุ 65 ยังได้', () => {
    expect(insuranceStatus(emp({ birthDate: '1960-01-01' }), site(), rules).eligible).toBe(false);
    expect(insuranceStatus(emp({ birthDate: '1961-03-01' }), site(), rules).eligible).toBe(true);
  });

  it('ขาดงาน 3 วัน → วันออก = วันทำงานสุดท้าย + 7', () => {
    const s = insuranceStatus(emp({ status: 'INACTIVE', endReason: 'ABSENT_3D', lastWorkingDate: '2026-10-01', endDate: '2026-10-04' }), site(), rules);
    expect(s.exitDate).toBe('2026-10-08');
    expect(s.exitCycleDate).toBe('2026-11-05');
    expect(s.exitUrgent).toBe(false);
  });

  it('เลิกจ้าง → urgent, exitCycleDate = endDate', () => {
    const s = insuranceStatus(emp({ status: 'INACTIVE', endReason: 'TERMINATED', endDate: '2026-10-14' }), site(), rules);
    expect(s.exitUrgent).toBe(true);
    expect(s.exitCycleDate).toBe('2026-10-14');
  });

  it('ลาออกก่อนถึงรอบแจ้งเข้า → ไม่ต้องแจ้ง', () => {
    const s = insuranceStatus(emp({ startDate: '2026-09-20', status: 'INACTIVE', endReason: 'RESIGN', endDate: '2026-10-25' }), site(), rules);
    expect(s.eligible).toBe(false);
  });
});

describe('PVD', () => {
  it('Pro Site เป็นสมาชิกวันแรก', () => {
    const p = pvdStatus(emp({ companyCode: 'PRO', employeeType: 'PRO_SITE', startDate: '2026-10-13' }), rules, TODAY);
    expect(p.joinDate).toBe('2026-10-13');
  });

  it('ส่วนกลาง เป็นสมาชิกเมื่อครบ 120 วัน', () => {
    expect(pvdStatus(emp({ startDate: '2026-01-01' }), rules, TODAY).joinDate).toBe('2026-05-01');
  });

  it('หัก/สมทบ 2% ของเงินเดือน', () => {
    const p = pvdStatus(emp({ salary: 25555 }), rules, TODAY);
    expect(p.employeeMonthly).toBe(511.1);
    expect(p.companyMonthly).toBe(511.1);
  });

  it('รายวัน / แม่บ้าน ไม่มีสิทธิ', () => {
    expect(pvdStatus(emp({ employeeType: 'DAILY' }), rules, TODAY).eligible).toBe(false);
    expect(pvdStatus(emp({ employeeType: 'MAID_CNS' }), rules, TODAY).eligible).toBe(false);
  });

  it('vesting ตามอายุสมาชิก และกระทำผิด → 0%', () => {
    const base = { startDate: '2020-01-01' };
    expect(pvdStatus(emp(base), rules, TODAY).vestingPercent).toBe(100);
    expect(pvdStatus(emp({ ...base, endReason: 'MISCONDUCT', endDate: '2026-10-01' }), rules, TODAY).vestingPercent).toBe(0);
  });
});

describe('ชุดฟอร์ม', () => {
  it('Support Line ระดับ 3 → rule 1 (4/2)', () => {
    expect(matchUniformRule(emp({ level: 3 }), rules.uniform)?.id).toBe(1);
  });

  it('Support Line ระดับ 7 → rule 2 (2/1)', () => {
    expect(matchUniformRule(emp({ level: 7 }), rules.uniform)?.id).toBe(2);
  });

  it('CIC BU ส่วนกลาง ระดับ 7 → ไม่พบกฎ', () => {
    expect(matchUniformRule(emp({ companyCode: 'CIC', deptGroup: 'BU ส่วนกลาง', level: 7 }), rules.uniform)).toBeNull();
  });

  it('Pro Site ตำแหน่งไม่อยู่ในรายการ → ตำแหน่งอื่นๆ / วิศวกร → rule 17', () => {
    const pro = { companyCode: 'PRO' as const, employeeType: 'PRO_SITE' as const, deptGroup: null, level: null };
    expect(matchUniformRule(emp({ ...pro, position: 'ธุรการ' }), rules.uniform)?.id).toBe(18);
    expect(matchUniformRule(emp({ ...pro, position: 'วิศวกร' }), rules.uniform)?.id).toBe(17);
  });

  it('ช่างทีมโมบาย site สีน้ำเงิน → POLO_NAVY, จำนวน "2+1"', () => {
    const e = emp({ companyCode: 'PRO', employeeType: 'PRO_SITE', deptGroup: null, level: null, position: 'ช่างทีมโมบาย', startDate: '2026-10-10' });
    const u = uniformStatus(e, site({ poloColor: 'NAVY' }), rules, [], TODAY);
    expect(u.entitlements[0].items).toContain('POLO_NAVY');
    expect(u.entitlements[0].qtyLabel).toBe('2+1');
  });

  it('ประจำปี: ทุก 1 ม.ค. หลังผ่านทดลองงาน ย้อนหลังไม่เกิน 3 ปี', () => {
    const u = uniformStatus(emp({ startDate: '2018-01-01', probationPassDate: '2018-04-30' }), site(), rules, [], TODAY);
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
