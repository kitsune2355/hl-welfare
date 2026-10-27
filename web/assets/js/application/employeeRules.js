import { defaultTypeFor, typeAllows, typeInfo } from '../domain/catalog.js';
import { probationDueDate } from '../domain/employee.js';
import { digitsOnly, isValidThaiId } from '../domain/thaiId.js';

/**
 * กฎตรวจข้อมูลพนักงาน — ใช้ร่วมกันทั้งฟอร์มและตาราง Excel (คู่กับ backend/domain/rules_check.php)
 * ไม่ตรวจตำแหน่ง (มาจากไฟล์นำเข้าได้ แต่ไม่บังคับ) · ระบบไม่เก็บเงินเดือน
 */
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
  if (!e.siteId) x.siteId = 'กรุณาเลือกหน่วยงาน';
  // ประเภทตั้งค่าได้ (sites.html แท็บประเภทพนักงาน) — พฤติกรรมตามค่าที่ตั้ง ไม่เช็กรหัส
  const type = typeInfo(e.employeeType);
  if (!type) x.employeeType = 'กรุณาเลือกประเภทพนักงาน';
  else if (!typeAllows(e.employeeType, e.companyCode)) x.employeeType = `ประเภท ${type.name} ใช้กับบริษัทนี้ไม่ได้`;
  if (type?.usesDeptGroup) {
    if (!e.deptGroup) x.deptGroup = 'กรุณาเลือกกลุ่ม/ฝ่าย';
    // ระดับพนักงาน 1–9 (HR ยืนยันสูงสุดระดับ 9)
    if (!(Number.isInteger(Number(e.level)) && Number(e.level) >= 1 && Number(e.level) <= 9)) x.level = 'ระดับต้องเป็นตัวเลข 1–9';
  }
  if (e.status === 'INACTIVE') {
    if (!e.endReason) x.endReason = 'กรุณาเลือกเหตุผล';
    if (!e.endDate) x.endDate = 'กรุณาระบุวันพ้นสภาพ';
    if (e.endReason === 'ABSENT_3D' && !e.lastWorkingDate) x.lastWorkingDate = 'ขาดงาน 3 วันต้องระบุวันทำงานสุดท้าย';
    if (e.endDate && e.endDate < e.startDate) x.endDate = 'ต้องไม่ก่อนวันเริ่มงาน';
  }
  return x;
}
/**
 * ทำให้ field ที่ขึ้นกับบริษัท/ประเภทสอดคล้องกัน (เช่น เปลี่ยนบริษัท → เลือกหน่วยงานแรกของบริษัท)
 * วันผ่านทดลองงานว่าง → คำนวณให้ = วันเริ่มงาน + 119 วัน
 */
export function normalizeEmployee(e, sites) {
  const n = { ...e };
  if (!n.probationPassDate && n.startDate) n.probationPassDate = probationDueDate(n.startDate);
  // ประเภทที่ใช้กับบริษัทนี้ไม่ได้ (เช่น Pro Site แต่เปลี่ยนเป็นบริษัทอื่น) → ประเภทแรกที่ใช้ได้
  if (!typeAllows(n.employeeType, n.companyCode)) n.employeeType = defaultTypeFor(n.companyCode);
  const type = typeInfo(n.employeeType);
  // เลือกหน่วยงานไว้แต่คนละบริษัท (เพิ่งเปลี่ยนบริษัท) → หน่วยงานแรกของบริษัท
  // ยังไม่ได้เลือก (0 — เช่น นำเข้า Excel แล้วหาหน่วยงานไม่เจอ) = ปล่อยว่างให้เลือกเอง ไม่เดาให้เงียบ ๆ
  const site = sites.find((s) => s.id === n.siteId);
  if (n.siteId && (!site || site.companyCode !== n.companyCode))
    n.siteId = sites.find((s) => s.companyCode === n.companyCode)?.id ?? 0;
  if (type?.usesDeptGroup) {
    n.level ??= 1; // กลุ่ม / ฝ่ายไม่เดาให้ — ว่าง = ช่องแดงให้เลือก
  } else {
    n.deptGroup = null;
    n.level = null;
  }
  // ตำแหน่งมีคอลัมน์ให้ทุกประเภทแล้ว (ไม่บังคับ) — ไม่ล้างตามประเภท · สัญญา 3% ยังใช้เฉพาะประเภทที่เก็บตำแหน่ง (แบบเดิม)
  if (!type?.usesPosition) n.contractType = 'REGULAR';
  return n;
}
