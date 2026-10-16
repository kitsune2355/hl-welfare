import type { ActivityEntity, BatchType, EmployeeStatus, EmployeeType, TaskKind, TaskSeverity, UniformItemCode } from '../domain/types';

export * from '../domain/labels';

/** สีของ Badge — ตรงกับ tone ใน ui/Badge */
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

export const STATUS_TONE: Record<EmployeeStatus, Tone> = { ACTIVE: 'success', INACTIVE: 'neutral' };

export const BATCH_TONE: Record<BatchType, Tone> = { IN: 'info', OUT: 'warning', URGENT: 'danger' };

export const EMPLOYEE_TYPE_TONE: Record<EmployeeType, Tone> = {
  CENTRAL: 'primary',
  PRO_SITE: 'info',
  DAILY: 'warning',
  MAID_CNS: 'neutral',
};

export const UNIFORM_ITEM_LABEL: Record<UniformItemCode, string> = {
  POLO_BLACK: 'โปโลสีดำ',
  POLO_NAVY: 'โปโลสีน้ำเงิน',
  TECH_SHIRT: 'เสื้อช่าง',
  TECH_PANTS: 'กางเกงช่าง',
  SAFETY_SHOES: 'รองเท้า Safety',
};

export const DEPT_GROUPS = [
  'Support Line',
  'การตลาด',
  'BU ส่วนกลาง',
  'ฝ่ายขาย',
  'วิศวกรรมและการออกแบบ',
  'บริหารห้องเช่าและพื้นที่เช่า',
];

export const PRO_POSITIONS = ['ช่างเทคนิค', 'ช่างทีมโมบาย', 'หัวหน้าช่างเทคนิค', 'วิศวกร', 'ผู้ควบคุมงาน', 'ธุรการโครงการ'];

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  INSURANCE_URGENT: 'แจ้งออกทันที',
  INSURANCE_IN: 'แจ้งเข้าประกัน',
  INSURANCE_OUT: 'แจ้งออกประกัน',
  UNIFORM_ISSUE: 'แจกชุดฟอร์ม',
  PROBATION_MISSING: 'ข้อมูลไม่ครบ',
  UNIFORM_RULE_MISSING: 'รอ HR ยืนยัน',
};

export const SEVERITY_LABEL: Record<TaskSeverity, string> = { critical: 'ด่วน', warning: 'ต้องทำ', info: 'ติดตาม' };
export const SEVERITY_TONE: Record<TaskSeverity, Tone> = { critical: 'danger', warning: 'warning', info: 'info' };

export const ACTIVITY_ENTITY_LABEL: Record<ActivityEntity, string> = {
  EMPLOYEE: 'พนักงาน',
  SITE: 'หน่วยงาน',
  INSURANCE_BATCH: 'ประกันกลุ่ม',
  UNIFORM_ISSUE: 'ชุดฟอร์ม',
};
