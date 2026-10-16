import type {
  BatchType,
  CompanyCode,
  ContractType,
  EmployeeStatus,
  EmployeeType,
  EndReason,
  UniformEvent,
} from './types';

// ภาษาเดียวกับ HR (ubiquitous language) — ใช้ทั้งในเหตุผลที่คำนวณและบนหน้าจอ

export const COMPANY_CODES: CompanyCode[] = ['HL', 'PRO', 'CNS', 'CIC', 'AS'];

export const EMPLOYEE_TYPE_LABEL: Record<EmployeeType, string> = {
  CENTRAL: 'ส่วนกลาง',
  PRO_SITE: 'Pro Site',
  DAILY: 'รายวัน',
  MAID_CNS: 'แม่บ้าน CNS',
};

export const CONTRACT_LABEL: Record<ContractType, string> = {
  REGULAR: 'ปกติ',
  SHORT_3PCT: 'สัญญา 3% ระยะสั้น',
};

export const STATUS_LABEL: Record<EmployeeStatus, string> = {
  ACTIVE: 'ทำงานอยู่',
  INACTIVE: 'พ้นสภาพ',
};

export const END_REASON_LABEL: Record<EndReason, string> = {
  RESIGN: 'ลาออก',
  ABSENT_3D: 'ขาดงาน 3 วันติด',
  TERMINATED: 'เลิกจ้าง',
  MISCONDUCT: 'กระทำผิด',
};

export const BATCH_TYPE_LABEL: Record<BatchType, string> = {
  IN: 'แจ้งเข้า',
  OUT: 'แจ้งออก',
  URGENT: 'แจ้งออกทันที',
};

export const UNIFORM_EVENT_LABEL: Record<UniformEvent, string> = {
  START: 'เริ่มงาน',
  PROBATION: 'ผ่านทดลองงาน',
  ANNUAL: 'ประจำปี',
};
