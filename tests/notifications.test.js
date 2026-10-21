import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { insuranceUrgentNotice, NOTICE_LOOK, stockChangeNotice } from '../web/assets/js/application/usecases/notifications.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';

const emp = { id: 7, firstName: 'สมชาย', lastName: 'ใจดี', empCode: 'HL0007', endDate: '2026-10-20' };
const prev = { docNo: 'WRQ-0001' };

describe('ข้อความแจ้งเตือน', () => {
  it('ใบเบิกในสต็อก: อนุมัติ / ไม่อนุมัติ / คลังยกเลิก / จ่าย / เซ็นรับ', () => {
    expect(stockChangeNotice('APPROVED', emp, prev, { docNo: 'WRQ-0001' }).type).toBe('stock_approved');
    const rej = stockChangeNotice('CANCELLED', emp, prev, { docNo: 'WRQ-0001', cancelNote: 'ไม่อนุมัติ: ของหมด' });
    expect(rej.type).toBe('stock_rejected');
    expect(rej.message.includes('ไม่อนุมัติ: ของหมด')).toBe(true);
    expect(stockChangeNotice('CANCELLED', emp, prev, { docNo: 'WRQ-0001', cancelNote: 'คลังยกเลิก' }).type).toBe('stock_cancelled');
    expect(stockChangeNotice('ISSUED', emp, prev, { docNo: 'WRQ-0001' }).link).toBe('employee.html?id=7');
    expect(stockChangeNotice('RECEIVED', null, prev, null).link).toBe('uniform.html?tab=waiting');
    expect(stockChangeNotice('UPDATE', emp, prev, {})).toBe(null);
  });
  it('แจ้งออกประกันทันที: วันที่แบบไทย + ลิงก์แท็บแจ้งออกทันที', () => {
    const n = insuranceUrgentNotice(emp, 'เลิกจ้าง');
    expect(n.message.startsWith('เลิกจ้าง · วันพ้นสภาพ 20 ต.ค. 69')).toBe(true);
    expect(n.link).toBe('insurance.html?tab=urgent');
  });
  it('ทุกประเภทมีไอคอนและสี', () => {
    for (const t of ['stock_approved', 'stock_rejected', 'stock_cancelled', 'stock_issued', 'stock_received', 'insurance_urgent']) {
      expect(!!NOTICE_LOOK[t]?.icon && !!NOTICE_LOOK[t]?.tone).toBe(true);
    }
  });
});

describe('MockApi กระดิ่ง', () => {
  it('เลิกจ้าง → แจ้งเตือน · แบ่งหน้าเก่ากว่า id · อ่าน / อ่านทั้งหมด', async () => {
    const api = new MockApi(() => '2026-10-16');
    const active = (await api.listEmployees({ status: 'ACTIVE' })).slice(0, 3);
    for (const e of active) await api.saveEmployee({ ...e, status: 'INACTIVE', endReason: 'TERMINATED', endDate: '2026-10-16', lastWorkingDate: '2026-10-16' });
    const p1 = await api.listNotifications({ limit: 2 });
    expect(p1.items.length).toBe(2);
    expect(p1.hasMore).toBe(true);
    expect(p1.unread).toBe(3);
    const p2 = await api.listNotifications({ limit: 2, before: p1.nextBefore });
    expect(p2.items.length).toBe(1);
    expect(p2.hasMore).toBe(false);
    expect(p2.items[0].id < p1.items[1].id).toBe(true);
    expect((await api.readNotification(p1.items[0].id)).unread).toBe(2);
    expect((await api.readAllNotifications()).unread).toBe(0);
    expect((await api.notificationUnread()).unread).toBe(0);
  });
});
