// ภาษาเดียวกับ HR (ubiquitous language) — ใช้ทั้งในเหตุผลที่คำนวณและบนหน้าจอ
// บริษัท / ประเภทพนักงาน ตั้งค่าได้ — รายการจริงอยู่ที่ domain/catalog.js (ตัวเดียวกันทั้งระบบ)
export { COMPANY_CODES, EMPLOYEE_TYPE_LABEL } from './catalog.js';

export const CONTRACT_LABEL = {
  REGULAR: 'ปกติ',
  SHORT_3PCT: 'สัญญา 3% ระยะสั้น',
};

export const STATUS_LABEL = {
  ACTIVE: 'ทำงานอยู่',
  INACTIVE: 'พ้นสภาพ',
};

/** เหตุผลพ้นสภาพ (ลำดับ = ลำดับในตัวเลือก / ช่องเลือกใน Excel) · "กระทำผิด" เดิมรวมเป็นเลิกจ้าง + หมายเหตุ (sql/020) */
export const END_REASON_LABEL = {
  RESIGN: 'ลาออก',
  ABSENT_3D: 'ขาดงานต่อเนื่องเกิน 3 วัน',
  CONTRACT_END: 'สิ้นสุดระยะเวลาการจ้าง',
  TERMINATED: 'เลิกจ้าง',
  RETIRED: 'เกษียณอายุ',
  DECEASED: 'เสียชีวิต',
  TRANSFERRED: 'โอนย้ายสังกัดบริษัท',
};

/** คำนำหน้าชื่อ (ใช้ในไฟล์แจ้งบริษัทประกัน) */
export const TITLES = ['นาย', 'นาง', 'นางสาว'];

export const GENDER_LABEL = {
  M: 'ชาย',
  F: 'หญิง',
};

export const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export const BATCH_TYPE_LABEL = {
  IN: 'แจ้งเข้า',
  OUT: 'แจ้งออก',
  URGENT: 'แจ้งออกทันที',
  CHANGE: 'แจ้งเปลี่ยนแปลง',
};

export const UNIFORM_EVENT_LABEL = {
  START: 'เริ่มงาน',
  PROBATION: 'ผ่านทดลองงาน',
  ANNUAL: 'ประจำปี',
};
