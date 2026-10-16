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
    await api.deleteSite(s.id);
    expect((await api.listSites()).some((x) => x.id === s.id)).toBe(false);
    await expect(api.deleteSite(1)).rejects.toMatchObject({ status: 409 });
  });
  it('พนักงาน: ลบได้ถ้ายังไม่มีประวัติ / มีประวัติ → 409', async () => {
    const api = make();
    const [base] = await api.listEmployees();
    const { id: _id, ...rest } = base;
    const created = await api.saveEmployee({ ...rest, empCode: 'NEW001' });
    await api.deleteEmployee(created.id);
    await expect(api.getEmployeeBenefits(created.id)).rejects.toMatchObject({ status: 404 });
    const batches = await api.listInsuranceBatches();
    await expect(api.deleteEmployee(batches[0].employeeIds[0])).rejects.toMatchObject({ status: 409 });
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
    await api.saveEmployee({ ...e, salary: e.salary + 1 });
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
