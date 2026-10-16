import type {
  ActivityFilter,
  ActivityLog,
  BatchType,
  Company,
  DashboardData,
  Employee,
  EmployeeBenefits,
  EmployeeFilter,
  InsuranceBatch,
  InsuranceCycle,
  ISODate,
  MonitorTask,
  PvdRow,
  RuleSet,
  Site,
  UniformIssue,
  UniformPendingRow,
} from '../domain/types';

export type SitePatch = Partial<Pick<Site, 'hasGroupInsurance' | 'poloColor' | 'name'>>;
export type SiteInput = Omit<Site, 'id'>;
export type EmployeeInput = Omit<Employee, 'id'> & { id?: number };
export type UniformIssueInput = Omit<UniformIssue, 'id' | 'issuedBy'>;
export interface InsuranceBatchInput {
  cycleDate: ISODate;
  type: BatchType;
  employeeIds: number[];
}

/** Port หลักของระบบ — MockApi และ HttpApi (adapter) ต้อง implement ครบ */
export interface WelfareApi {
  getDashboard(): Promise<DashboardData>;

  listCompanies(): Promise<Company[]>;
  listSites(): Promise<Site[]>;
  createSite(input: SiteInput): Promise<Site>;
  updateSite(id: number, patch: SitePatch): Promise<Site>;
  /** 409 ถ้ายังมีพนักงานในหน่วยงาน */
  deleteSite(id: number): Promise<void>;

  listEmployees(filter?: EmployeeFilter): Promise<Employee[]>;
  getEmployeeBenefits(id: number): Promise<EmployeeBenefits>;
  saveEmployee(emp: EmployeeInput): Promise<Employee>;
  /** 409 ถ้ามีประวัติแจ้งประกัน/แจกชุดแล้ว (ให้ใช้การบันทึกพ้นสภาพแทน) */
  deleteEmployee(id: number): Promise<void>;

  getRules(): Promise<RuleSet>;

  getInsuranceCycle(cycleDate: ISODate): Promise<InsuranceCycle>;
  listInsuranceBatches(): Promise<InsuranceBatch[]>;
  submitInsuranceBatch(input: InsuranceBatchInput): Promise<InsuranceBatch>;
  /** ยกเลิก batch → รายการกลับไปเป็น "รอส่ง" */
  cancelInsuranceBatch(id: number): Promise<void>;

  listPvdMembers(): Promise<PvdRow[]>;

  listUniformIssues(employeeId?: number): Promise<UniformIssue[]>;
  createUniformIssue(input: UniformIssueInput): Promise<UniformIssue>;
  listUniformPending(): Promise<UniformPendingRow[]>;
  /** ยกเลิกการแจก (บันทึกผิด) → กลับไปเป็น "ค้างแจก" */
  cancelUniformIssue(id: number): Promise<void>;

  // ----- Monitoring -----
  getWorkQueue(): Promise<MonitorTask[]>;
  listActivity(filter?: ActivityFilter): Promise<ActivityLog[]>;

  /** มีเฉพาะ adapter ที่รีเซ็ตข้อมูลได้ (mock) */
  reset?(): Promise<void>;
}
