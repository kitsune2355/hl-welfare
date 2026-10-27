import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { assignmentPeriods, dueTransfers, validateTransfer, waitStartDate } from '../web/assets/js/domain/transfer.js';
import { insuranceStatus } from '../web/assets/js/domain/insurance.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';

const TODAY = '2026-10-16';
const emp = {
  id: 1,
  empCode: 'T-1',
  companyCode: 'HL',
  siteId: 1,
  employeeType: 'CENTRAL',
  deptGroup: 'Support Line',
  position: null,
  level: 3,
  startDate: '2025-01-10',
  status: 'ACTIVE',
  endDate: null,
};
const to = { companyCode: 'PRO', siteId: 9, employeeType: 'CENTRAL', deptGroup: 'BU ส่วนกลาง', position: null, level: 3 };

describe('domain/transfer', () => {
  it('ช่วงสังกัด: ก่อนย้าย / หลังย้าย ตั้งแต่วันไหนถึงวันไหน', () => {
    const transfers = [
      { id: 1, status: 'APPLIED', effectiveDate: '2026-03-01', from: { ...emp }, to },
      { id: 2, status: 'CANCELLED', effectiveDate: '2026-05-01', from: to, to: { ...to, siteId: 10 } },
    ];
    const p = assignmentPeriods({ ...emp, ...to }, transfers);
    expect(p.length).toBe(2);
    expect(p[0]).toMatchObject({ since: '2025-01-10', until: '2026-02-28', current: false, assignment: { companyCode: 'HL' } });
    expect(p[1]).toMatchObject({ since: '2026-03-01', until: null, current: true, transferId: 1, assignment: { companyCode: 'PRO' } });
  });
  it('ตรวจคำขอ: วันที่ก่อนเริ่มงาน / ไม่มีอะไรเปลี่ยน / มีรายการรอมีผลอยู่แล้ว', () => {
    expect(validateTransfer({ effectiveDate: '2025-01-01', to }, emp, [])).toMatchObject({ effectiveDate: 'วันที่มีผลต้องหลังวันเริ่มงาน' });
    expect(Object.keys(validateTransfer({ effectiveDate: '2026-11-01', to: { ...emp } }, emp, []))).toEqual(['siteId']);
    expect(validateTransfer({ effectiveDate: '2026-11-01', to }, emp, [{ id: 1, status: 'PENDING', effectiveDate: '2026-12-01' }]).effectiveDate).toBeTruthy();
    expect(validateTransfer({ effectiveDate: '2026-11-01', to }, emp, [])).toEqual({});
  });
  it('ถึงวันที่มีผลเท่านั้นจึงมีผล', () => {
    const t = [{ id: 1, status: 'PENDING', effectiveDate: '2026-10-17' }];
    expect(dueTransfers(t, TODAY).length).toBe(0);
    expect(dueTransfers(t, '2026-10-17').length).toBe(1);
  });
  it('นับวันรอใหม่: ประกันกลุ่มครบสิทธิ์จากวันที่ย้าย', () => {
    const rules = { insurance: [{ id: 1, employeeType: 'CENTRAL', companies: null, waitDays: 30, excludeContracts: [], requireSiteInsurance: false }], settings: { insuranceCycleDay: 5, insuranceMaxAge: 65, absentExtraDays: 7 } };
    const e = { ...emp, birthDate: '1990-01-01', contractType: 'REGULAR', endReason: null, lastWorkingDate: null };
    expect(waitStartDate(e)).toBe('2025-01-10');
    expect(insuranceStatus(e, null, rules).eligibleDate).toBe('2025-02-09');
    expect(insuranceStatus({ ...e, benefitStartDate: '2026-10-01' }, null, rules).eligibleDate).toBe('2026-10-31');
  });
});

describe('MockApi โอนย้าย', () => {
  const pick = async (api) => {
    const all = await api.listEmployees({ status: 'ACTIVE' });
    const e = all.find((x) => x.employeeType === 'CENTRAL' && x.companyCode === 'HL' && x.startDate < '2026-01-01');
    const sites = await api.listSites();
    const site = sites.find((s) => s.companyCode === 'HL' && s.id !== e.siteId && s.active !== false);
    return { e, site };
  };
  it('ตั้งล่วงหน้า: ข้อมูลยังเป็นค่าเดิม → ถึงวันแล้วมีผลเอง + บันทึกประวัติ', async () => {
    let today = TODAY;
    const api = new MockApi(() => today);
    const { e, site } = await pick(api);
    const r = await api.createTransfer(e.id, { effectiveDate: '2026-11-01', to: { ...e, siteId: site.id }, resetWait: true });
    expect(r.employee.siteId).toBe(e.siteId);
    expect(r.transfers[0].status).toBe('PENDING');
    today = '2026-11-01';
    const b = await api.getEmployeeBenefits(e.id);
    expect(b.employee.siteId).toBe(site.id);
    expect(b.employee.benefitStartDate).toBe('2026-11-01');
    expect(b.transfers[0]).toMatchObject({ status: 'APPLIED', from: { siteId: e.siteId }, to: { siteId: site.id } });
    const act = await api.listActivity({ employeeId: e.id });
    expect(act[0]).toMatchObject({ action: 'TRANSFER', user: 'system' });
  });
  it('วันที่มีผลวันนี้ = มีผลทันที · ยกเลิกได้เฉพาะที่ยังไม่มีผล', async () => {
    const api = new MockApi(() => TODAY);
    const { e, site } = await pick(api);
    const r = await api.createTransfer(e.id, { effectiveDate: TODAY, to: { ...e, siteId: site.id } });
    expect(r.employee.siteId).toBe(site.id);
    expect(r.employee.benefitStartDate).toBeNull();
    await expect(api.cancelTransfer(e.id, r.transfers[0].id)).rejects.toMatchObject({ status: 409 });
  });
  it('หน่วยงานคนละบริษัท → 422', async () => {
    const api = new MockApi(() => TODAY);
    const { e } = await pick(api);
    const other = (await api.listSites()).find((s) => s.companyCode !== 'HL');
    await expect(api.createTransfer(e.id, { effectiveDate: '2026-11-01', to: { ...e, siteId: other.id } })).rejects.toMatchObject({ status: 422 });
  });
});
