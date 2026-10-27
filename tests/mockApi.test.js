import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { ApiError } from '../web/assets/js/application/errors.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';
const TODAY = '2026-10-16';
const make = () => new MockApi(() => TODAY);
describe('MockApi (validation ตามสเปกข้อ 8)', () => {
  it('dashboard มีข้อมูลและ URGENT ค้าง 2 ราย', async () => {
    const d = await make().getDashboard();
    expect(d.activeTotal).toBeGreaterThan(30);
    expect(d.nextCycleDate).toBe('2026-11-05');
    expect(d.urgentPending).toBe(2);
    expect(d.upcomingEligible.length).toBeGreaterThan(0);
  });
  it('รหัสพนักงานซ้ำ → 409', async () => {
    const api = make();
    const [e] = await api.listEmployees();
    const { id: _id, ...rest } = e;
    await expect(api.saveEmployee({ ...rest, empCode: e.empCode })).rejects.toMatchObject({ status: 409 });
  });
  it('ส่งแจ้งประกัน: ว่าง → 422, ส่งซ้ำ → 409', async () => {
    const api = make();
    await expect(
      api.submitInsuranceBatch({ cycleDate: '2026-11-05', type: 'IN', employeeIds: [] }),
    ).rejects.toBeInstanceOf(ApiError);
    const cycle = await api.getInsuranceCycle('2026-11-05');
    const urgent = cycle.rows.filter((r) => r.type === 'URGENT' && !r.submitted).map((r) => r.employee.id);
    await api.submitInsuranceBatch({ cycleDate: '2026-11-05', type: 'URGENT', employeeIds: urgent });
    await expect(
      api.submitInsuranceBatch({ cycleDate: '2026-11-05', type: 'URGENT', employeeIds: urgent }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await api.getDashboard()).urgentPending).toBe(0);
  });
  it('แจกชุดฟอร์ม: บันทึกแล้วหายจากค้างแจก, แจกซ้ำ → 409', async () => {
    const api = make();
    const [p] = await api.listUniformPending();
    const input = {
      employeeId: p.employee.id,
      entitlementKey: p.entitlementKey,
      event: p.event,
      qty: 2,
      size: 'M',
      issuedAt: TODAY,
    };
    await api.createUniformIssue(input);
    const after = await api.listUniformPending();
    expect(after.some((x) => x.employee.id === p.employee.id && x.entitlementKey === p.entitlementKey)).toBe(false);
    await expect(api.createUniformIssue(input)).rejects.toMatchObject({ status: 409 });
  });
  it('ไม่พบพนักงาน → 404', async () => {
    await expect(make().getEmployeeBenefits(99999)).rejects.toMatchObject({ status: 404 });
  });
});
describe('MockApi CRUD + monitoring', () => {
  it('หน่วยงาน: สร้าง → แก้ชื่อ → ลบ (ลบไม่ได้ถ้ามีพนักงาน)', async () => {
    const api = make();
    const s = await api.createSite({
      companyCode: 'HL',
      name: 'สาขาทดสอบ',
      hasGroupInsurance: true,
      poloColor: 'BLACK',
    });
    await expect(
      api.createSite({ companyCode: 'HL', name: 'สาขาทดสอบ', hasGroupInsurance: true, poloColor: 'BLACK' }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await api.updateSite(s.id, { name: 'สาขาใหม่' })).name).toBe('สาขาใหม่');
    expect(s.active).toBe(true);
    const off = await api.updateSite(s.id, { active: false });
    expect([off.active, (await api.listSites()).find((x) => x.id === s.id)?.active]).toEqual([false, false]);
    const [e] = await api.listEmployees({ companyCode: 'HL' });
    await expect(api.saveEmployee({ ...e, siteId: s.id })).rejects.toMatchObject({ status: 422 }); // ย้ายเข้าหน่วยงานที่ปิดไม่ได้
    expect('deleteSite' in api).toBe(false);
  });
  it('พนักงาน: ปิดใช้งาน = ไม่อยู่ในการคำนวณ · เปิดกลับได้ · มีประวัติแล้วปิดไม่ได้ (409)', async () => {
    const api = make();
    const [base] = await api.listEmployees();
    const { id: _id, ...rest } = base;
    const created = await api.saveEmployee({ ...rest, empCode: 'NEW001' });
    expect(created.active).toBe(true);
    const before = (await api.getDashboard()).activeEmployees;
    const off = await api.saveEmployee({ ...created, active: false });
    expect(off.active).toBe(false);
    expect((await api.listEmployees({ q: 'NEW001' }))[0].active).toBe(false); // ยังอยู่ในตาราง
    if (created.status === 'ACTIVE' && before !== undefined) expect((await api.getDashboard()).activeEmployees).toBe(before - 1);
    expect(api.world.employees.some((e) => e.id === created.id)).toBe(false);
    expect((await api.saveEmployee({ ...off, active: true })).active).toBe(true);
    const batches = await api.listInsuranceBatches();
    const withHistory = (await api.listEmployees()).find((e) => e.id === batches[0].items[0].employeeId);
    await expect(api.saveEmployee({ ...withHistory, active: false })).rejects.toMatchObject({ status: 409 });
    expect('deleteEmployee' in api).toBe(false);
  });
  it('ประวัติการส่ง: รายชื่อย่อในรายการ + รายละเอียด batch (วันมีผล/เหตุผลตรงกับหน้ารอบ)', async () => {
    const api = make();
    const cycle = await api.getInsuranceCycle('2026-11-05');
    const urgent = cycle.rows.filter((r) => r.type === 'URGENT');
    const b = await api.submitInsuranceBatch({ cycleDate: '2026-11-05', type: 'URGENT', employeeIds: urgent.map((r) => r.employee.id) });
    const [listed] = await api.listInsuranceBatches();
    expect(listed.id).toBe(b.id);
    expect(listed.employees.map((e) => e.empCode).sort()).toEqual(urgent.map((r) => r.employee.empCode).sort());
    expect('salary' in listed.employees[0]).toBe(false); // ระบบไม่เก็บเงินเดือน
    const d = await api.getInsuranceBatch(b.id);
    expect(d.items.length).toBe(urgent.length);
    for (const it of d.items) {
      const r = urgent.find((x) => x.employee.id === it.employee.id);
      expect(it.effectiveDate).toBe(r.effectiveDate);
      expect(it.reason).toBe(r.reason);
      expect(it.siteName.length > 0).toBe(true);
    }
    await expect(api.getInsuranceBatch(9999)).rejects.toBeInstanceOf(ApiError);
  });
  it('ยกเลิก batch / ยกเลิกการแจก → กลับเป็นงานค้าง', async () => {
    const api = make();
    const cycle = await api.getInsuranceCycle('2026-11-05');
    const ids = cycle.rows.filter((r) => r.type === 'URGENT').map((r) => r.employee.id);
    const b = await api.submitInsuranceBatch({ cycleDate: '2026-11-05', type: 'URGENT', employeeIds: ids });
    await api.cancelInsuranceBatch(b.id);
    expect((await api.getDashboard()).urgentPending).toBe(2);
    const [p] = await api.listUniformPending();
    const before = (await api.listUniformPending()).length;
    const issue = await api.createUniformIssue({
      employeeId: p.employee.id,
      entitlementKey: p.entitlementKey,
      event: p.event,
      qty: 1,
      size: 'L',
      issuedAt: TODAY,
    });
    await api.cancelUniformIssue(issue.id);
    expect((await api.listUniformPending()).length).toBe(before);
  });
  it('บันทึกกิจกรรม: ทุกการแก้ไขถูกบันทึก ใหม่สุดก่อน + กรองตามพนักงาน', async () => {
    const api = make();
    const s = await api.createSite({
      companyCode: 'AS',
      name: 'ไซต์ใหม่',
      hasGroupInsurance: false,
      poloColor: 'NAVY',
    });
    const [top] = await api.listActivity({ limit: 1 });
    expect(top).toMatchObject({ entity: 'SITE', action: 'CREATE', entityId: String(s.id) });
    const [e] = await api.listEmployees();
    await api.saveEmployee({ ...e, phone: '0899999999' });
    const mine = await api.listActivity({ employeeId: e.id });
    expect(mine[0].summary).toContain(e.firstName);
  });
  it('คิวงาน: URGENT/ข้อมูลไม่ครบ/ไม่พบกฎ อยู่ในคิว และ critical มาก่อน', async () => {
    const q = await make().getWorkQueue();
    const kinds = new Set(q.map((t) => t.kind));
    expect(kinds).toContain('INSURANCE_URGENT');
    expect(kinds).toContain('PROBATION_MISSING');
    expect(kinds).toContain('UNIFORM_RULE_MISSING');
    const rank = { critical: 0, warning: 1, info: 2 };
    expect(q.every((t, i) => i === 0 || rank[q[i - 1].severity] <= rank[t.severity])).toBe(true);
  });
});

describe('MockApi เข้าสู่ระบบ', () => {
  it('ชื่อผู้ใช้/รหัสผ่านถูก → คืนชื่อและบทบาท · ผิด → 401', async () => {
    const api = make();
    const u = await api.login(' HR ', 'hr1234');
    expect(u).toMatchObject({ username: 'hr', role: 'HR Admin' });
    await expect(api.login('hr', 'wrong')).rejects.toMatchObject({ status: 401 });
  });

  it('บันทึกกิจกรรมใช้ชื่อผู้ใช้ที่เข้าสู่ระบบ (setActor)', async () => {
    const api = make();
    api.setActor('สมใจ ใจดี');
    await api.createSite({ companyCode: 'HL', name: 'สาขาผู้ใช้', hasGroupInsurance: true, poloColor: 'BLACK' });
    const [top] = await api.listActivity({ limit: 1 });
    expect(top.user).toBe('สมใจ ใจดี');
  });
});

describe('รอบแจ้งประกัน: พนักงานรายวันส่งแยกทุกวันที่ 6', () => {
  it('รอบวันที่ 6 มีเฉพาะพนักงานรายวัน · รอบวันที่ 5 ไม่มีพนักงานรายวัน', async () => {
    const api = make();
    const r5 = (await api.getInsuranceCycle('2026-11-05')).rows;
    const r6 = (await api.getInsuranceCycle('2026-11-06')).rows;
    expect(r5.length > 0 && r6.length > 0).toBe(true);
    expect(r5.some((r) => r.employee.employeeType === 'DAILY')).toBe(false);
    expect(r6.every((r) => r.employee.employeeType === 'DAILY')).toBe(true);
    const benefits = await api.getEmployeeBenefits(r6[0].employee.id);
    expect(benefits.insurance.enrollCycleDate).toBe('2026-11-06'); // รอบแจ้งของพนักงานรายวันเป็นวันที่ 6
  });
});

describe('ประวัติการส่งออก: ดาวน์โหลดไฟล์แจ้งประกันอีกครั้ง', () => {
  it('ได้รายชื่อเดิมของครั้งนั้น · ไม่บันทึกซ้ำ · ลบแบบฟอร์มแล้ว → 404', async () => {
    const api = make();
    await api.exportInsurance({ cycleDate: '2026-11-05', insurerId: 1, record: true });
    const before = await api.listInsuranceBatches();
    const b = before.find((x) => x.insurerId === 1 && x.cycleDate === '2026-11-05');
    const d = await api.exportInsuranceBatch(b.id);
    const ids = d.companies.flatMap((c) => [...c.in, ...c.out]).map((r) => `${r.employee.id}|${r.type}`).sort();
    expect(ids).toEqual(b.items.map((i) => `${i.employeeId}|${i.type}`).sort());
    expect(d.batchId).toBe(b.id);
    expect(d.insurer.id).toBe(1);
    expect(d.companies.flatMap((c) => c.in).every((r) => r.employee.nationalId !== undefined)).toBe(true);
    expect((await api.listInsuranceBatches()).length).toBe(before.length);
    await api.deleteInsurer(1);
    await expect(api.exportInsuranceBatch(b.id)).rejects.toMatchObject({ status: 404 });
  });
});
