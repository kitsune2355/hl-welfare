// คู่มือทีละขั้น (tour/guides.js) + โหมดฝึก (app/practice.js)
import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { GUIDES } from '../web/assets/js/tour/guides.js';
import { practiceStock } from '../web/assets/js/app/practice.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';

/** id หน้า/แท็บ ที่ initPage ส่งให้คู่มือ (pages/*.js) */
const PAGES = [
  'dashboard', 'employees', 'employee', 'insurance', 'insurance-history', 'uniform', 'uniform-waiting', 'uniform-history',
  'sites', 'sites-companies', 'sites-types', 'sites-groups', 'rules', 'rules-settings', 'rules-pending',
  'insurers', 'insurer-edit', 'account', 'account-password', 'account-font',
  'admin-users', 'admin-permissions', 'admin-access', 'admin-health', 'admin-settings', 'admin-audit',
];

describe('คู่มือทีละขั้น', () => {
  it('id ไม่ซ้ำ · มีหัวข้อ/สรุป/ไอคอน · หน้าที่เสนอเป็นหน้าที่มีจริง', () => {
    expect(new Set(GUIDES.map((g) => g.id)).size).toBe(GUIDES.length);
    for (const g of GUIDES) {
      expect([g.id, !!g.title, !!g.summary, !!g.icon, g.minutes > 0, g.steps.length > 0].join()).toBe(`${g.id},true,true,true,true,true`);
      for (const p of g.pages) expect(`${g.id}:${PAGES.includes(p)}`).toBe(`${g.id}:true`);
    }
  });
  it('ทุกขั้นมีหัวข้อ + คำอธิบาย · ขั้นแรกบอกหน้าเริ่ม (href) · ขั้นที่ระบุหน้าต้องเป็นหน้าที่มีจริง', () => {
    for (const g of GUIDES) {
      expect(`${g.id}:${!!g.steps[0].href}`).toBe(`${g.id}:true`);
      g.steps.forEach((s, i) => {
        expect(`${g.id}#${i}:${!!s.title && !!s.text}`).toBe(`${g.id}#${i}:true`);
        if (s.page) expect(`${g.id}#${i}:${PAGES.includes(s.page)}`).toBe(`${g.id}#${i}:true`);
      });
    }
  });
  it('คำอธิบายสั้น อ่านง่าย (ไม่เกิน 260 ตัวอักษรต่อขั้น ไม่นับแท็ก)', () => {
    for (const g of GUIDES) g.steps.forEach((s, i) => expect(`${g.id}#${i}:${s.text.replace(/<[^>]+>/g, '').length <= 260}`).toBe(`${g.id}#${i}:true`));
  });
});

describe('โหมดฝึก: ระบบสต็อกปลอม', () => {
  it('ส่งเบิกชุดฟอร์มได้ครบขั้น โดยไม่เรียกระบบสต็อกจริง', async () => {
    const api = new MockApi(() => '2026-10-16', practiceStock(), { storageKey: 'test-practice' });
    const [p] = await api.listUniformPending();
    const opt = await api.getUniformStockOptions(p.employee.id, p.entitlementKey);
    expect(opt.blockers).toEqual([]);
    const lines = opt.items.map((it) => ({ itemCode: it.itemCode, productId: it.variants[0].products[1].productId, qty: it.qty }));
    const issue = await api.requestUniformFromStock({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, lines });
    expect([issue.source, issue.stock.stage, issue.stock.docNo.startsWith('ตัวอย่าง-')]).toEqual(['STOCK', 'REQUESTED', true]);
    expect((await api.syncUniformStock()).changed).toBe(0);
  });
});
