// คู่มือทีละขั้น (tour/guides.js) + โหมดฝึก (app/practice.js)
import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { GUIDES } from '../web/assets/js/tour/guides.js';
import { icon } from '../web/assets/js/shared/icons.js';
import { practiceStock, realPageUrl } from '../web/assets/js/app/practice.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';

/** id หน้า/แท็บ ที่ initPage ส่งให้คู่มือ (pages/*.js) */
const PAGES = [
  'dashboard', 'employees', 'employee', 'insurance', 'insurance-history', 'uniform', 'uniform-upcoming', 'uniform-waiting', 'uniform-history',
  'sites', 'sites-companies', 'sites-types', 'sites-groups', 'rules', 'rules-settings', 'rules-pending',
  'insurers', 'insurer-edit', 'account', 'account-password', 'account-font',
  'admin-users', 'admin-permissions', 'admin-access', 'admin-health', 'admin-settings', 'admin-audit',
];

describe('คู่มือทีละขั้น', () => {
  it('id ไม่ซ้ำ · มีหัวข้อ/สรุป/ไอคอน/สีประจำเรื่อง · หน้าที่เสนอเป็นหน้าที่มีจริง', () => {
    expect(new Set(GUIDES.map((g) => g.id)).size).toBe(GUIDES.length);
    for (const g of GUIDES) {
      expect([g.id, !!g.title, !!g.summary, !!g.icon, /^#[0-9a-f]{6}$/.test(g.color), g.steps.length > 0].join()).toBe(`${g.id},true,true,true,true,true`);
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
  it('ไม่ชี้ทั้งแถวของตาราง (แถวกว้างกว่าจอ → กรอบไฮไลต์หลุดจอ) — ให้ชี้ช่องในแถวแทน', () => {
    for (const g of GUIDES) g.steps.forEach((s, i) => {
      const rows = (s.element ?? '').split(',').map((x) => x.trim()).filter((x) => /tbody tr[^ ]*$/.test(x));
      expect(`${g.id}#${i}:${rows.join('|')}`).toBe(`${g.id}#${i}:`);
    });
  });
  it('ขั้นที่เปลี่ยนแท็บ ชี้ที่ตัวแท็บ (ผู้ใช้รู้ว่าย้ายแท็บแล้ว) และกล่องไม่อยู่ด้านบน (ไม่บังแถบแท็บ)', () => {
    for (const g of GUIDES) g.steps.forEach((s, i) => {
      if (!String(s.before ?? '').includes('clickTab')) return;
      expect(`${g.id}#${i}:${(s.element ?? '').startsWith('.tab[data-tab=') && s.side !== 'top'}`).toBe(`${g.id}#${i}:true`);
    });
  });
  it('backTo อ้างขั้นที่มีอยู่จริง (key) และอยู่ก่อนหน้า', () => {
    for (const g of GUIDES) g.steps.forEach((s, i) => {
      if (!s.backTo) return;
      const to = g.steps.findIndex((x) => x.key === s.backTo);
      expect(`${g.id}#${i}:${to >= 0 && to < i}`).toBe(`${g.id}#${i}:true`);
    });
  });
  it('ไอคอนของทุกเรื่องมีอยู่จริง', () => {
    for (const g of GUIDES) expect(`${g.id}:${g.icon}:${!!icon(g.icon)}`).toBe(`${g.id}:${g.icon}:true`);
  });
  it('เรื่องของผู้ดูแลระบบแนะนำเฉพาะแท็บที่สอนจริง', () => {
    for (const g of GUIDES.filter((x) => x.id.startsWith('admin-'))) {
      const taught = new Set(g.steps.map((st) => st.page));
      for (const p of g.pages) expect(`${g.id}:${p}:${taught.has(p)}`).toBe(`${g.id}:${p}:true`);
    }
  });
  it('คำอธิบายสั้น อ่านง่าย (ไม่เกิน 260 ตัวอักษรต่อขั้น ไม่นับแท็ก)', () => {
    for (const g of GUIDES) g.steps.forEach((s, i) => expect(`${g.id}#${i}:${s.text.replace(/<[^>]+>/g, '').length <= 260}`).toBe(`${g.id}#${i}:true`));
  });
});

describe('โหมดฝึก: ออกแล้วกลับหน้าที่ใช้กับข้อมูลจริงได้', () => {
  it('ตัดค่าที่ชี้ข้อมูลตัวอย่าง · รายละเอียดพนักงาน → รายชื่อพนักงาน · คงแท็บไว้', () => {
    const B = 'http://x/hl-welfare/web/';
    expect(realPageUrl(B + 'employee.html?id=259')).toBe(B + 'employees.html');
    expect(realPageUrl(B + 'employees.html?q=HL9001&status=ACTIVE&page=2')).toBe(B + 'employees.html?status=ACTIVE');
    expect(realPageUrl(B + 'insurers.html?id=3')).toBe(B + 'insurers.html');
    expect(realPageUrl(B + 'uniform.html?tab=waiting&tour=1')).toBe(B + 'uniform.html?tab=waiting');
  });
});

describe('คู่มือที่ใส่ข้อมูลตัวอย่าง', () => {
  it('ขั้นแรกไม่ทำงานกับข้อมูลก่อนเข้าโหมดฝึก (href เป็นข้อความ) · นอกโหมดฝึกไม่ออกใบเบิก', async () => {
    for (const g of GUIDES) expect(`${g.id}:${typeof g.steps[0].href}`).toBe(`${g.id}:string`);
    let called = 0;
    const api = new Proxy({}, { get: () => async () => { called++; return []; } });
    await GUIDES.find((g) => g.id === 'uniform-cancel').steps[0].before({ api });
    expect(called).toBe(0);
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
  it('ส่งเบิกล่วงหน้าจากรายการรวม: ส่งแล้วหายจากรายการ · ไม่นับเป็นค้างแจก', async () => {
    const api = new MockApi(() => '2026-10-16', practiceStock(), { storageKey: 'test-practice' });
    const rows = await api.listUniformUpcoming();
    const pendingBefore = (await api.listUniformPending()).length;
    expect(rows.length > 1).toBe(true);
    expect(rows.every((r) => r.dueDate > '2026-10-16' && r.employee.status === 'ACTIVE')).toBe(true);
    const [p] = rows;
    const opt = await api.getUniformStockOptions(p.employee.id, p.entitlementKey);
    const lines = opt.items.map((it) => ({ itemCode: it.itemCode, productId: it.variants[0].products[1].productId, qty: it.qty }));
    await api.requestUniformFromStock({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, lines });
    const after = await api.listUniformUpcoming();
    expect(after.length).toBe(rows.length - 1);
    expect(after.some((x) => x.employee.id === p.employee.id && x.entitlementKey === p.entitlementKey)).toBe(false);
    expect((await api.listUniformPending()).length).toBe(pendingBefore);
  });
});
