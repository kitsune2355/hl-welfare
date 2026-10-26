import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { activeRules, activeSettings, ruleTimeline } from '../web/assets/js/domain/ruleVersions.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';

const TODAY = '2026-10-16';
const rev = (id, revisionId, effectiveFrom, extra = {}) => ({ id, revisionId, effectiveFrom, deleted: false, waitDays: 30, ...extra });

describe('กฎแบบมีวันที่มีผล (domain/ruleVersions.js)', () => {
  it('ใช้ฉบับล่าสุดที่ถึงวันมีผลแล้ว · ฉบับล่วงหน้ายังไม่ใช้ · ฉบับลบ = ไม่มีกฎ', () => {
    const list = [
      rev(1, 1, '2000-01-01'),
      rev(1, 5, '2026-10-01', { waitDays: 45 }),
      rev(1, 6, '2026-12-01', { waitDays: 60 }),
      rev(2, 2, '2000-01-01'),
      rev(2, 7, '2026-10-16', { deleted: true }),
    ];
    const now = activeRules(list, TODAY);
    expect(now.length).toBe(1);
    expect(now[0]).toEqual({ id: 1, effectiveFrom: '2026-10-01', waitDays: 45 });
    expect(activeRules(list, '2026-12-01')[0].waitDays).toBe(60);
    expect(activeRules(list, '2026-10-15').map((r) => r.id)).toEqual([1, 2]);
  });
  it('วันเดียวกัน 2 ฉบับ → ฉบับที่บันทึกทีหลัง', () => {
    const list = [rev(1, 3, '2026-10-01', { waitDays: 40 }), rev(1, 9, '2026-10-01', { waitDays: 41 })];
    expect(activeRules(list, TODAY)[0].waitDays).toBe(41);
  });
  it('ค่าตั้งค่า: ค่าล่าสุดที่ถึงวันมีผล', () => {
    const rows = [
      { key: 'uniformAnnualMonth', value: 1, effectiveFrom: '2000-01-01' },
      { key: 'uniformAnnualMonth', value: 2, effectiveFrom: '2027-01-01' },
      { key: 'insuranceMaxAge', value: 65, effectiveFrom: '2000-01-01' },
    ];
    expect(activeSettings(rows, TODAY)).toEqual({ uniformAnnualMonth: 1, insuranceMaxAge: 65 });
    expect(activeSettings(rows, '2027-01-01').uniformAnnualMonth).toBe(2);
  });
  it('timeline: ฉบับปัจจุบัน + รอมีผล (เรียงตามวัน) + ประวัติ (ใหม่ก่อน)', () => {
    const t = ruleTimeline([rev(1, 1, '2000-01-01'), rev(1, 4, '2027-02-01'), rev(1, 3, '2026-11-01'), rev(1, 2, '2026-01-01')], TODAY);
    expect(t[0].current.revisionId).toBe(2);
    expect(t[0].pending.map((r) => r.revisionId)).toEqual([3, 4]);
    expect(t[0].history.map((r) => r.revisionId)).toEqual([2, 1]);
  });
});

describe('MockApi แก้กฎผ่านหน้าจอ', () => {
  const make = () => new MockApi(() => TODAY, null);
  it('แก้ล่วงหน้า → ยังใช้ฉบับเดิม · มีผลวันนี้ → ใช้ทันที', async () => {
    const api = make();
    const r = (await api.getRules()).insurance.find((x) => x.id === 3);
    await api.updateRule('insurance', 3, { ...r, waitDays: 90, effectiveFrom: '2026-12-01' });
    expect((await api.getRules()).insurance.find((x) => x.id === 3).waitDays).toBe(120);
    const h = await api.getRuleHistory();
    expect(h.insurance.find((t) => t.id === 3).pending.length).toBe(1);
    await api.updateRule('insurance', 3, { ...r, waitDays: 90, effectiveFrom: TODAY });
    expect((await api.getRules()).insurance.find((x) => x.id === 3).waitDays).toBe(90);
  });
  it('ระดับเกิน 9 → 422 · เลิกใช้กฎ → หายจากกฎที่มีผล', async () => {
    const api = make();
    const u = (await api.getRules()).uniform.find((x) => x.id === 2);
    await expect(api.updateRule('uniform', 2, { ...u, levelMax: 10 })).rejects.toMatchObject({ status: 422 });
    await api.retireRule('uniform', 2, TODAY);
    expect((await api.getRules()).uniform.some((x) => x.id === 2)).toBe(false);
  });
  it('ตำแหน่งหลายตำแหน่ง: ตัดช่องว่าง/ตัวซ้ำ คั่นด้วย ", " · ว่าง = ทุกตำแหน่ง · ยาวเกิน 200 → 422', async () => {
    const api = make();
    const u = (await api.getRules()).uniform.find((x) => x.id === 16);
    await api.updateRule('uniform', 16, { ...u, position: ' ช่างทีมโมบาย ,วิศวกร,, ช่างทีมโมบาย ', effectiveFrom: TODAY });
    expect((await api.getRules()).uniform.find((x) => x.id === 16).position).toBe('ช่างทีมโมบาย, วิศวกร');
    await api.updateRule('uniform', 16, { ...u, position: ' , ', effectiveFrom: TODAY });
    expect((await api.getRules()).uniform.find((x) => x.id === 16).position).toBe(null);
    await expect(api.updateRule('uniform', 16, { ...u, position: 'ก'.repeat(201), effectiveFrom: TODAY })).rejects.toMatchObject({ status: 422 });
  });
  it('ชุดฟอร์มของหน่วยงาน: ตรวจกฎกับบริษัท', async () => {
    const api = make();
    await expect(api.saveSiteUniform(5, [{ ruleId: 10, quantities: { START: { POLO_BLACK: 1 } } }])).rejects.toMatchObject({ status: 422 });
    const s = await api.saveSiteUniform(5, [{ ruleId: 16, quantities: { START: { POLO_BLACK: 2 }, PROBATION: {}, ANNUAL: {} } }]);
    expect(s.uniformOverrides.length).toBe(1);
  });
});
