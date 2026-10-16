export type CompanyCode = 'HL' | 'PRO' | 'CNS' | 'CIC' | 'AS';
export type EmployeeType = 'CENTRAL' | 'PRO_SITE' | 'DAILY' | 'MAID_CNS';
export type ContractType = 'REGULAR' | 'SHORT_3PCT';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE';
export type EndReason = 'RESIGN' | 'ABSENT_3D' | 'TERMINATED' | 'MISCONDUCT';
export type ISODate = string; // YYYY-MM-DD

export interface Company { code: CompanyCode; name: string; }

export interface Site {
  id: number;
  companyCode: CompanyCode;
  name: string;
  hasGroupInsurance: boolean;      // แม่บ้าน CNS: หน่วยงานนี้ได้ประกันกลุ่มไหม
  poloColor: 'BLACK' | 'NAVY';     // Pro Site: สีโปโลของหน่วยงาน
}

export interface Employee {
  id: number;
  empCode: string;
  firstName: string;
  lastName: string;
  companyCode: CompanyCode;
  siteId: number;
  employeeType: EmployeeType;
  contractType: ContractType;
  deptGroup: string | null;        // กลุ่มพนักงาน/ฝ่าย (ส่วนกลาง)
  position: string | null;         // ตำแหน่ง (Pro Site)
  level: number | null;
  salary: number;
  birthDate: ISODate;
  startDate: ISODate;
  probationPassDate: ISODate | null;
  status: EmployeeStatus;
  lastWorkingDate: ISODate | null;
  endDate: ISODate | null;
  endReason: EndReason | null;
}

// ----- Rules -----
export interface InsuranceRule {
  id: number;
  employeeType: EmployeeType;
  companies: CompanyCode[] | null; // null = ทุกบริษัท
  waitDays: number;
  excludeContracts: ContractType[];
  requireSiteInsurance: boolean;
  note: string;
}

export interface PvdRule {
  id: number;
  employeeType: EmployeeType;
  eligible: boolean;
  waitDays: number;                // 0 = ตั้งแต่วันแรก
  note: string;
}

export interface VestingStep { minYears: number; percent: number; }

export type UniformItemCode = 'POLO_BLACK' | 'POLO_NAVY' | 'TECH_SHIRT' | 'TECH_PANTS' | 'SAFETY_SHOES';
export interface UniformItem { code: UniformItemCode; name: string; }

export interface UniformRule {
  id: number;
  employeeType: EmployeeType;
  companies: CompanyCode[];
  deptGroups: string[] | null;     // null = ไม่อ้างอิงฝ่าย
  position: string | null;         // null = ไม่อ้างอิงตำแหน่ง
  levelMin: number | null;
  levelMax: number | null;
  style: string;
  items: UniformItemCode[];
  poloBySite: boolean;             // สีโปโลขึ้นกับ site.poloColor
  qtyStart: number;
  qtyStartLabel?: string;          // เช่น "2+1"
  qtyProbation: number;
  qtyAnnual: number;
  note: string;
}

export interface Settings {
  insuranceMaxAge: number;         // 65
  insuranceCycleDay: number;       // 5
  absentExtraDays: number;         // 7
  pvdEmployeeRate: number;         // 2 (%)
  pvdCompanyRate: number;          // 2 (%)
  pvdVesting: VestingStep[];
  pvdVestingIsPlaceholder: boolean;
  uniformAnnualMonth: number;      // เดือนที่แจกประจำปี (1 = ม.ค.)
}

export interface RuleSet {
  insurance: InsuranceRule[];
  pvd: PvdRule[];
  uniform: UniformRule[];
  uniformItems: UniformItem[];
  settings: Settings;
}

// ----- Computed -----
export interface InsuranceStatus {
  eligible: boolean;
  reasons: string[];               // เหตุผลที่ไม่มีสิทธิ (ภาษาไทย)
  eligibleDate: ISODate | null;    // วันที่ครบอายุงาน
  enrollCycleDate: ISODate | null; // รอบวันที่ 5 ที่จะแจ้งเข้า
  exitDate: ISODate | null;        // วันที่มีผลออก
  exitCycleDate: ISODate | null;
  exitUrgent: boolean;             // เลิกจ้าง/ทำผิด = แจ้งทันที
  ruleId: number | null;
}

export interface PvdStatus {
  eligible: boolean;
  reasons: string[];
  joinDate: ISODate | null;
  employeeMonthly: number;
  companyMonthly: number;
  memberYears: number | null;
  vestingPercent: number | null;
}

export type UniformEvent = 'START' | 'PROBATION' | 'ANNUAL';

export interface UniformEntitlement {
  key: string;                     // START | PROBATION | ANNUAL-2026
  event: UniformEvent;
  dueDate: ISODate;
  qty: number;
  qtyLabel: string;
  items: UniformItemCode[];
  style: string;
  issued: boolean;
  issueId: number | null;
}

export interface UniformStatus {
  ruleId: number | null;
  style: string | null;
  reasons: string[];
  entitlements: UniformEntitlement[];
}

export interface EmployeeBenefits {
  employee: Employee;
  site: Site | null;
  insurance: InsuranceStatus;
  pvd: PvdStatus;
  uniform: UniformStatus;
}

export type BatchType = 'IN' | 'OUT' | 'URGENT';

export interface InsuranceCycleRow {
  employee: Employee;
  type: BatchType;
  effectiveDate: ISODate;
  reason: string;
  submitted: boolean;
}
export interface InsuranceCycle { cycleDate: ISODate; rows: InsuranceCycleRow[]; }

export interface InsuranceBatch {
  id: number;
  cycleDate: ISODate;
  type: BatchType;
  employeeIds: number[];
  submittedAt: string;
  submittedBy: string;
}

export interface UniformIssue {
  id: number;
  employeeId: number;
  entitlementKey: string;
  event: UniformEvent;
  qty: number;
  size: string;
  issuedAt: ISODate;
  issuedBy: string;
}

export interface UniformPendingRow {
  employee: Employee;
  entitlementKey: string;
  event: UniformEvent;
  dueDate: ISODate;
  qtyLabel: string;
  style: string;
}

export interface PvdRow { employee: Employee; pvd: PvdStatus; }

export interface DashboardData {
  today: ISODate;
  activeByCompany: { companyCode: CompanyCode; count: number }[];
  activeTotal: number;
  nextCycleDate: ISODate;
  nextCycleIn: number;
  nextCycleOut: number;
  urgentPending: number;
  upcomingEligible: { employee: Employee; benefit: 'INSURANCE' | 'PVD'; date: ISODate }[];
  uniformPending: number;
}

export interface EmployeeFilter {
  q?: string;
  companyCode?: CompanyCode | '';
  employeeType?: EmployeeType | '';
  status?: EmployeeStatus | '';
}

// ----- Monitoring -----
export type TaskKind =
  | 'INSURANCE_URGENT'
  | 'INSURANCE_IN'
  | 'INSURANCE_OUT'
  | 'UNIFORM_ISSUE'
  | 'PROBATION_MISSING'
  | 'UNIFORM_RULE_MISSING';
export type TaskSeverity = 'critical' | 'warning' | 'info';

/** งาน 1 รายการในคิวงาน (คำนวณสด ไม่ได้เก็บใน DB) */
export interface MonitorTask {
  id: string;                      // `${kind}:${employeeId}[:key]`
  kind: TaskKind;
  severity: TaskSeverity;
  employee: Employee;
  title: string;
  detail: string;
  dueDate: ISODate | null;
  overdueDays: number;             // > 0 = เลยกำหนดมาแล้ว
}

export type ActivityEntity = 'EMPLOYEE' | 'SITE' | 'INSURANCE_BATCH' | 'UNIFORM_ISSUE';
export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'CANCEL';

/** บันทึกกิจกรรม (= ตาราง audit_log ฝั่ง PHP) */
export interface ActivityLog {
  id: number;
  at: string;                      // YYYY-MM-DDTHH:mm:ss
  user: string;
  entity: ActivityEntity;
  entityId: string;
  action: ActivityAction;
  summary: string;                 // ข้อความภาษาไทยสำหรับแสดงผล
  employeeId: number | null;       // ใช้ลิงก์ไปหน้าพนักงาน
}

export interface ActivityFilter {
  entity?: ActivityEntity;
  employeeId?: number;
  limit?: number;
}
