import { describe, expect, it } from 'vitest';
import { ApiError } from '../../application/errors';
import { MockApi } from './mockApi';

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
    await expect(api.submitInsuranceBatch({ cycleDate: '2026-11-05', type: 'IN', employeeIds: [] })).rejects.toBeInstanceOf(ApiError);
    const cycle = await api.getInsuranceCycle('2026-11-05');
    const urgent = cycle.rows.filter((r) => r.type === 'URGENT' && !r.submitted).map((r) => r.employee.id);
    await api.submitInsuranceBatch({ cycleDate: '2026-11-05', type: 'URGENT', employeeIds: urgent });
    await expect(api.submitInsuranceBatch({ cycleDate: '2026-11-05', type: 'URGENT', employeeIds: urgent })).rejects.toMatchObject({ status: 409 });
    expect((await api.getDashboard()).urgentPending).toBe(0);
  });

  it('แจกชุดฟอร์ม: บันทึกแล้วหายจากค้างแจก, แจกซ้ำ → 409', async () => {
    const api = make();
    const [p] = await api.listUniformPending();
    const input = { employeeId: p.employee.id, entitlementKey: p.entitlementKey, event: p.event, qty: 2, size: 'M', issuedAt: TODAY };
    await api.createUniformIssue(input);
    const after = await api.listUniformPending();
    expect(after.some((x) => x.employee.id === p.employee.id && x.entitlementKey === p.entitlementKey)).toBe(false);
    await expect(api.createUniformIssue(input)).rejects.toMatchObject({ status: 409 });
  });

  it('ไม่พบพนักงาน → 404', async () => {
    await expect(make().getEmployeeBenefits(99999)).rejects.toMatchObject({ status: 404 });
  });
});
