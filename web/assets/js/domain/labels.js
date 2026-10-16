// ภาษาเดียวกับ HR (ubiquitous language) — ใช้ทั้งในเหตุผลที่คำนวณและบนหน้าจอ
export const COMPANY_CODES = ['HL', 'PRO', 'CNS', 'CIC', 'AS'];

export const EMPLOYEE_TYPE_LABEL = {
  CENTRAL: 'ส่วนกลาง',
  PRO_SITE: 'Pro Site',
  DAILY: 'รายวัน',
  MAID_CNS: 'แม่บ้าน CNS',
};

export const CONTRACT_LABEL = {
  REGULAR: 'ปกติ',
  SHORT_3PCT: 'สัญญา 3% ระยะสั้น',
};

export const STATUS_LABEL = {
  ACTIVE: 'ทำงานอยู่',
  INACTIVE: 'พ้นสภาพ',
};

export const END_REASON_LABEL = {
  RESIGN: 'ลาออก',
  ABSENT_3D: 'ขาดงาน 3 วันติด',
  TERMINATED: 'เลิกจ้าง',
  MISCONDUCT: 'กระทำผิด',
};

export const BATCH_TYPE_LABEL = {
  IN: 'แจ้งเข้า',
  OUT: 'แจ้งออก',
  URGENT: 'แจ้งออกทันที',
};

export const UNIFORM_EVENT_LABEL = {
  START: 'เริ่มงาน',
  PROBATION: 'ผ่านทดลองงาน',
  ANNUAL: 'ประจำปี',
};
