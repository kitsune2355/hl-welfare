import { digitsOnly, isValidThaiId } from '../domain/thaiId.js';

/** กฎตรวจข้อมูลพนักงาน — ใช้ร่วมกันทั้งฟอร์มและตาราง Excel */
export function validateEmployee(e) {
  const x = {};
  // ข้อมูลส่วนตัวสำหรับไฟล์แจ้งประกัน: ไม่บังคับ แต่ถ้ากรอกต้องถูกรูปแบบ
  if (e.nationalId && !isValidThaiId(e.nationalId)) x.nationalId = 'เลขบัตรประชาชนไม่ถูกต้อง (13 หลัก / ตรวจหลักสุดท้ายไม่ผ่าน)';
  if (e.phone && !/^0\d{8,9}$/.test(digitsOnly(e.phone))) x.phone = 'เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก';
  if (e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) x.email = 'รูปแบบอีเมลไม่ถูกต้อง';
  if (!e.empCode.trim()) x.empCode = 'กรุณากรอกรหัสพนักงาน';
  if (!e.firstName.trim()) x.firstName = 'กรุณากรอกชื่อ';
  if (!e.lastName.trim()) x.lastName = 'กรุณากรอกนามสกุล';
  if (!e.birthDate) x.birthDate = 'กรุณาระบุวันเกิด';
  if (!e.startDate) x.startDate = 'กรุณาระบุวันเริ่มงาน';
  if (e.birthDate && e.startDate && e.birthDate >= e.startDate) x.birthDate = 'วันเกิดต้องก่อนวันเริ่มงาน';
  if (e.probationPassDate && e.probationPassDate < e.startDate) x.probationPassDate = 'ต้องไม่ก่อนวันเริ่มงาน';
  if (!(e.salary > 0)) x.salary = 'กรุณากรอกเงินเดือน';
  if (!e.siteId) x.siteId = 'กรุณาเลือกหน่วยงาน';
  if (e.employeeType === 'CENTRAL') {
    if (!e.deptGroup) x.deptGroup = 'กรุณาเลือกกลุ่ม/ฝ่าย';
    if (!(Number(e.level) >= 1)) x.level = 'ระดับต้องเป็นตัวเลข ≥ 1';
  }
  if (e.employeeType === 'PRO_SITE' && !e.position?.trim()) x.position = 'กรุณาระบุตำแหน่ง';
  if (e.status === 'INACTIVE') {
    if (!e.endReason) x.endReason = 'กรุณาเลือกเหตุผล';
    if (!e.endDate) x.endDate = 'กรุณาระบุวันพ้นสภาพ';
    if (e.endReason === 'ABSENT_3D' && !e.lastWorkingDate) x.lastWorkingDate = 'ขาดงาน 3 วันต้องระบุวันทำงานสุดท้าย';
    if (e.endDate && e.endDate < e.startDate) x.endDate = 'ต้องไม่ก่อนวันเริ่มงาน';
  }
  return x;
}
/** ทำให้ field ที่ขึ้นกับบริษัท/ประเภทสอดคล้องกัน (เช่น เปลี่ยนบริษัท → เลือกหน่วยงานแรกของบริษัท) */
export function normalizeEmployee(e, sites) {
  const n = { ...e };
  if (n.employeeType === 'PRO_SITE' && n.companyCode !== 'PRO') n.employeeType = 'CENTRAL';
  const site = sites.find((s) => s.id === n.siteId);
  if (!site || site.companyCode !== n.companyCode)
    n.siteId = sites.find((s) => s.companyCode === n.companyCode)?.id ?? 0;
  if (n.employeeType === 'CENTRAL') {
    n.deptGroup ??= 'Support Line';
    n.level ??= 1;
  } else {
    n.deptGroup = null;
    n.level = null;
  }
  if (n.employeeType !== 'PRO_SITE') {
    n.position = null;
    n.contractType = 'REGULAR';
  }
  return n;
}
