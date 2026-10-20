import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';
import { buildStockOptions, stockChange, stockSizes, stockSubmitPayload, toStockRequest } from '../web/assets/js/application/usecases/uniformStock.js';

const TODAY = '2026-10-16';

/** ระบบสต็อกปลอม — จำใบที่ออกไว้ และให้เทสต์เลื่อนสถานะใบเองได้ */
function fakeStock() {
  const docs = new Map();
  let next = 1;
  const status = (ref) => {
    const d = docs.get(ref);
    return { doc_id: d.id, doc_no: d.no, stage: d.stage, issued_at: d.issuedAt, received_at: null, cancel_note: d.note ?? '', items: d.items };
  };
  return {
    docs,
    calls: [],
    async catalog({ items }) {
      this.calls.push('catalog');
      return {
        department: { department_id: 77, department_name: 'HLG Engineering', company_name: 'PRO' },
        items: items.map((code) => ({
          item_code: code,
          variants: [
            { sub_category_id: 4, sub_category_name: `${code} ชาย`, variant_label: 'ผู้ชาย', products: [{ product_id: 31, product_code: 'X-1', product_name: `${code} ไซซ์ L`, size: 'L', on_hand: 5 }] },
            { sub_category_id: 5, sub_category_name: `${code} หญิง`, variant_label: 'ผู้หญิง', products: [{ product_id: 41, product_code: 'X-2', product_name: `${code} ไซซ์ M`, size: 'M', on_hand: 0 }] },
          ],
        })),
      };
    },
    async submit(p) {
      this.calls.push('submit');
      const ref = `${p.employee_id}:${p.entitlement_key}`;
      const id = next++;
      docs.set(ref, { id, no: `WRQ-6910-000${id}`, stage: 'REQUESTED', issuedAt: null, items: p.lines.map((l) => ({ product_id: l.product_id, product_name: 'เสื้อ ไซซ์ L', size: 'L', qty: l.qty })) });
      return { doc_id: id, doc_no: `WRQ-6910-000${id}`, duplicate: false, status: { [ref]: status(ref) } };
    },
    async status(refs) {
      this.calls.push('status');
      return Object.fromEntries(refs.filter((r) => docs.has(r)).map((r) => [r, status(r)]));
    },
    async cancel(ref) {
      this.calls.push('cancel');
      docs.get(ref).stage = 'CANCELLED';
      return { ok: true };
    },
  };
}

async function setup() {
  const stock = fakeStock();
  const api = new MockApi(() => TODAY, stock);
  const [p] = await api.listUniformPending();
  const opt = await api.getUniformStockOptions(p.employee.id, p.entitlementKey);
  const lines = opt.items.map((it) => ({ itemCode: it.itemCode, productId: 31, qty: it.qty }));
  return { api, stock, p, opt, lines };
}

describe('ส่งเบิกชุดฟอร์มผ่านระบบสต็อก', () => {
  it('ส่งเบิกแล้ว → ออกจากค้างแจก ไปรอคลังจ่าย และส่งซ้ำไม่ได้', async () => {
    const { api, p, lines } = await setup();
    const before = (await api.listUniformPending()).length;
    const issue = await api.requestUniformFromStock({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, lines });
    expect(issue.source).toBe('STOCK');
    expect(issue.stock.stage).toBe('REQUESTED');
    expect((await api.listUniformPending()).length).toBe(before - 1);
    const b = await api.getEmployeeBenefits(p.employee.id);
    const ent = b.uniform.entitlements.find((e) => e.key === p.entitlementKey);
    expect(ent.requested).toBe(true);
    expect(ent.issued).toBe(false);
    await expect(api.requestUniformFromStock({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, lines })).rejects.toMatchObject({ status: 409 });
    await expect(api.createUniformIssue({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, event: p.event, qty: 1, size: 'L', issuedAt: TODAY })).rejects.toMatchObject({ status: 409 });
  });
  it('ยังไม่เลือกไซซ์ / จำนวนไม่ถูก → 422 ไม่เรียกระบบสต็อก', async () => {
    const { api, stock, p, lines } = await setup();
    await expect(api.requestUniformFromStock({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, lines: lines.map((l) => ({ ...l, productId: 0 })) })).rejects.toMatchObject({ status: 422 });
    await expect(api.requestUniformFromStock({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, lines: lines.map((l) => ({ ...l, qty: 1.5 })) })).rejects.toMatchObject({ status: 422 });
    expect(stock.calls.includes('submit')).toBe(false);
  });
  it('sync: คลังจ่ายแล้ว → แจกแล้ว ยกเลิกในระบบนี้ไม่ได้', async () => {
    const { api, stock, p, lines } = await setup();
    const issue = await api.requestUniformFromStock({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, lines });
    Object.assign(stock.docs.get(issue.stock.ref), { stage: 'ISSUED', issuedAt: '2026-10-18 09:30:00' });
    expect((await api.syncUniformStock()).changed).toBe(1);
    const [i] = (await api.listUniformIssues(p.employee.id)).filter((x) => x.id === issue.id);
    expect(i.stock.stage).toBe('ISSUED');
    expect(i.issuedAt).toBe('2026-10-18');
    const b = await api.getEmployeeBenefits(p.employee.id);
    expect(b.uniform.entitlements.find((e) => e.key === p.entitlementKey).issued).toBe(true);
    await expect(api.cancelUniformIssue(issue.id)).rejects.toMatchObject({ status: 409 });
    expect((await api.syncUniformStock()).changed).toBe(0);
  });
  it('sync: คลังยกเลิกใบ → กลับเป็นค้างแจก', async () => {
    const { api, stock, p, lines } = await setup();
    const before = (await api.listUniformPending()).length;
    const issue = await api.requestUniformFromStock({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, lines });
    stock.docs.get(issue.stock.ref).stage = 'CANCELLED';
    await api.syncUniformStock();
    expect((await api.listUniformPending()).length).toBe(before);
    expect((await api.listUniformIssues()).some((x) => x.id === issue.id)).toBe(false);
  });
  it('ยกเลิกการส่งเบิกจากระบบนี้ → ยกเลิกใบในสต็อกด้วย', async () => {
    const { api, stock, p, lines } = await setup();
    const issue = await api.requestUniformFromStock({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, lines });
    await api.cancelUniformIssue(issue.id);
    expect(stock.docs.get(issue.stock.ref).stage).toBe('CANCELLED');
    expect((await api.listUniformPending()).some((r) => r.employee.id === p.employee.id && r.entitlementKey === p.entitlementKey)).toBe(true);
  });
});

describe('uniformStock use-case', () => {
  const ent = { key: 'START', event: 'START', qty: 3, items: ['POLO_BLACK', 'SAFETY_SHOES'] };
  const catalog = {
    department: null,
    items: [{ item_code: 'POLO_BLACK', variants: [{ sub_category_id: 4, sub_category_name: 'ชาย', variant_label: 'ผู้ชาย', products: [] }, { sub_category_id: 5, sub_category_name: 'หญิง', variant_label: 'ผู้หญิง', products: [] }] }],
  };
  it('เลือกแบบตามเพศ, รองเท้า 1 คู่, บอกสิ่งที่ยังไม่ได้จับคู่', () => {
    const o = buildStockOptions(ent, catalog, { gender: 'F' });
    expect(o.items[0].variantIndex).toBe(1);
    expect(o.items[0].qty).toBe(3);
    expect(o.items[1].qty).toBe(1);
    expect(o.blockers.length).toBe(2);
  });
  it('รอบเริ่มงาน: ใบเบิกพนักงานใหม่ + ชุดของ, ส่งวันเริ่มงาน, ไซซ์นับเฉพาะชุดฟอร์ม', () => {
    const o = buildStockOptions(ent, { ...catalog, doc_kind: 'new_staff', kit: [{ product_id: 90, product_name: 'บัตรพนักงาน', qty: 1, must_return: true, on_hand: 4 }] }, {});
    expect(o.docKind).toBe('new_staff');
    expect(o.kit).toEqual([{ productId: 90, name: 'บัตรพนักงาน', qty: 1, mustReturn: true, onHand: 4 }]);
    const emp = { id: 7, empCode: 'E7', firstName: 'ก', lastName: 'ข', position: null, deptGroup: null, companyCode: 'PRO', siteId: 4, startDate: '2026-10-20' };
    expect(stockSubmitPayload(emp, null, ent, 'PRO', [], 'HR').start_date).toBe('2026-10-20');
    const stock = toStockRequest('7:START', {
      doc_id: 1, doc_no: 'NRQ-6910-0001', stage: 'REQUESTED',
      items: [{ product_id: 31, product_name: 'เสื้อ L', size: 'L', qty: 3, uniform: true }, { product_id: 90, product_name: 'บัตรพนักงาน', size: 'บัตรพนักงาน', qty: 1, uniform: false }],
    });
    expect(stockSizes(stock)).toBe('L');
  });
  it('stockChange แยกการเปลี่ยนแปลง', () => {
    const prev = { stage: 'REQUESTED', items: [] };
    expect(stockChange(prev, null)).toBe('NONE');
    expect(stockChange(prev, { stage: 'REQUESTED', items: [] })).toBe('NONE');
    expect(stockChange(prev, { stage: 'ISSUED', items: [] })).toBe('ISSUED');
    expect(stockChange(prev, { stage: 'CANCELLED', items: [] })).toBe('CANCELLED');
  });
  it('รอผู้อนุมัติในสต็อก: อนุมัติ → APPROVED · ไม่อนุมัติ → CANCELLED', () => {
    const waiting = { stage: 'WAITING', items: [] };
    expect(stockChange(waiting, { stage: 'WAITING', items: [] })).toBe('NONE');
    expect(stockChange(waiting, { stage: 'REQUESTED', items: [] })).toBe('APPROVED');
    expect(stockChange(waiting, { stage: 'ISSUED', items: [] })).toBe('ISSUED'); // อนุมัติแล้วจ่ายเลยก่อนซิงก์รอบถัดไป
    expect(stockChange(waiting, { stage: 'CANCELLED', items: [] })).toBe('CANCELLED');
    expect(stockChange({ stage: 'REQUESTED', items: [] }, { stage: 'WAITING', items: [] })).toBe('UPDATE'); // ถูกส่งกลับไปรออนุมัติ
  });
});
