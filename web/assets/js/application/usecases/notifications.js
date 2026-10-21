// ข้อความแจ้งเตือน (กระดิ่ง) — ใช้ใน MockApi · ฝั่ง PHP: backend/usecases/notifications.php (ข้อความชุดเดียวกัน)
//
//   stockChangeNotice(kind, employee, prevStock, next)  ใบเบิกในสต็อกเปลี่ยนสถานะ (APPROVED | CANCELLED | ISSUED | RECEIVED)
//   insuranceUrgentNotice(employee, reasonLabel)       พ้นสภาพแบบต้องแจ้งออกประกันทันที
//   NOTICE_LOOK[type]                                   ไอคอน + สีของแต่ละประเภท (ใช้ในกระดิ่ง)

import { thaiDate } from '../../shared/format.js';

const fullName = (e) => `${e.firstName} ${e.lastName}`;

/** @returns {{type: string, title: string, message: string, link: string} | null} */
export function stockChangeNotice(kind, employee, prevStock, next) {
  const docNo = next?.docNo || prevStock.docNo;
  const who = employee ? `${fullName(employee)} (${employee.empCode})` : 'พนักงาน';
  const link = employee ? `employee.html?id=${employee.id}` : 'uniform.html?tab=waiting';
  if (kind === 'APPROVED') return { type: 'stock_approved', title: `อนุมัติใบเบิก ${docNo} แล้ว`, message: `ชุดฟอร์มของ ${who} — รอคลังจ่าย`, link };
  if (kind === 'CANCELLED') {
    const note = next?.cancelNote ?? '';
    const rejected = note.startsWith('ไม่อนุมัติ');
    return {
      type: rejected ? 'stock_rejected' : 'stock_cancelled',
      title: `${rejected ? 'ไม่อนุมัติใบเบิก' : 'คลังยกเลิกใบเบิก'} ${docNo}`,
      message: `${who}${note ? ` · ${note}` : ''} — กลับเป็นค้างแจก ส่งเบิกใหม่ได้`,
      link,
    };
  }
  if (kind === 'ISSUED') return { type: 'stock_issued', title: `คลังจ่ายชุดฟอร์มตามใบ ${docNo} แล้ว`, message: `${who} — รอพนักงานเซ็นรับ`, link };
  if (kind === 'RECEIVED') return { type: 'stock_received', title: `เซ็นรับชุดฟอร์มแล้ว — ใบ ${docNo}`, message: `${who} รับชุดฟอร์มเรียบร้อย`, link };
  return null;
}

export function insuranceUrgentNotice(employee, reasonLabel) {
  return {
    type: 'insurance_urgent',
    title: `แจ้งออกประกันทันที: ${fullName(employee)} (${employee.empCode})`,
    message: `${reasonLabel}${employee.endDate ? ` · วันพ้นสภาพ ${thaiDate(employee.endDate)}` : ''} — ไม่ต้องรอรอบ ส่งออกไฟล์แจ้งประกันได้ที่หน้าประกันกลุ่ม`,
    link: 'insurance.html?tab=urgent',
  };
}

/** ไอคอน + โทนสี (success | warning | danger | info) ของแต่ละประเภท */
export const NOTICE_LOOK = {
  stock_approved: { icon: 'circle-check', tone: 'success' },
  stock_rejected: { icon: 'circle-x', tone: 'danger' },
  stock_cancelled: { icon: 'circle-x', tone: 'warning' },
  stock_issued: { icon: 'truck', tone: 'info' },
  stock_received: { icon: 'package-check', tone: 'success' },
  insurance_urgent: { icon: 'shield-alert', tone: 'danger' },
};
