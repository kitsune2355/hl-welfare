export * from '../domain/labels.js';
export const STATUS_TONE = { ACTIVE: 'success', INACTIVE: 'neutral' };
export const BATCH_TONE = { IN: 'info', OUT: 'warning', URGENT: 'danger' };
export { EMPLOYEE_TYPE_TONE } from '../domain/catalog.js';
export const UNIFORM_ITEM_LABEL = {
  POLO_BLACK: 'โปโลสีดำ',
  POLO_NAVY: 'โปโลสีน้ำเงิน',
  TECH_SHIRT: 'เสื้อช่าง',
  TECH_PANTS: 'กางเกงช่าง',
  SAFETY_SHOES: 'รองเท้า Safety',
};
/** กลุ่ม / ฝ่ายตั้งต้น (= sql/014) — รายการจริงแก้ได้ที่หน้าเงื่อนไขสวัสดิการ แท็บ "ค่าตั้งค่า" (api.listDeptGroups) */
export const DEPT_GROUPS = [
  'Support Line',
  'การตลาด',
  'BU ส่วนกลาง',
  'ฝ่ายขาย',
  'วิศวกรรมและการออกแบบ',
  'บริหารห้องเช่าและพื้นที่เช่า',
];
export const PRO_POSITIONS = [
  'ช่างเทคนิค',
  'ช่างทีมโมบาย',
  'หัวหน้าช่างเทคนิค',
  'วิศวกร',
  'ผู้ควบคุมงาน',
  'ธุรการโครงการ',
];
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
/** ไซซ์รองเท้า (เบอร์) — บันทึกแจกเอง */
export const SHOE_SIZES = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'];
export const TASK_KIND_LABEL = {
  INSURANCE_URGENT: 'แจ้งออกทันที',
  INSURANCE_IN: 'แจ้งเข้าประกัน',
  INSURANCE_OUT: 'แจ้งออกประกัน',
  UNIFORM_ISSUE: 'แจกชุดฟอร์ม',
  PROBATION_MISSING: 'ข้อมูลไม่ครบ',
  UNIFORM_RULE_MISSING: 'รอ HR ยืนยัน',
};
export const SEVERITY_LABEL = { critical: 'ด่วน', warning: 'ต้องทำ', info: 'ติดตาม' };
export const SEVERITY_TONE = { critical: 'danger', warning: 'warning', info: 'info' };
export const ACTIVITY_ENTITY_LABEL = {
  EMPLOYEE: 'พนักงาน',
  SITE: 'หน่วยงาน',
  INSURANCE_BATCH: 'ประกันกลุ่ม',
  INSURER_FORM: 'แบบฟอร์มประกัน',
  DEPT_GROUP: 'กลุ่ม / ฝ่าย',
  COMPANY: 'บริษัท',
  EMPLOYEE_TYPE: 'ประเภทพนักงาน',
  UNIFORM_ISSUE: 'ชุดฟอร์ม',
  STOCK_REQUEST: 'ใบเบิกสต็อก',
  USER: 'ผู้ใช้',
  SYSTEM: 'ระบบ',
};
