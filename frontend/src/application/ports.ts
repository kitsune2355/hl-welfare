import type {
  BatchType,
  Company,
  DashboardData,
  Employee,
  EmployeeBenefits,
  EmployeeFilter,
  InsuranceBatch,
  InsuranceCycle,
  ISODate,
  PvdRow,
  RuleSet,
  Site,
  UniformIssue,
  UniformPendingRow,
} from '../domain/types';

export type SitePatch = Partial<Pick<Site, 'hasGroupInsurance' | 'poloColor' | 'name'>>;
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
  updateSite(id: number, patch: SitePatch): Promise<Site>;

  listEmployees(filter?: EmployeeFilter): Promise<Employee[]>;
  getEmployeeBenefits(id: number): Promise<EmployeeBenefits>;
  saveEmployee(emp: EmployeeInput): Promise<Employee>;

  getRules(): Promise<RuleSet>;

  getInsuranceCycle(cycleDate: ISODate): Promise<InsuranceCycle>;
  listInsuranceBatches(): Promise<InsuranceBatch[]>;
  submitInsuranceBatch(input: InsuranceBatchInput): Promise<InsuranceBatch>;

  listPvdMembers(): Promise<PvdRow[]>;

  listUniformIssues(employeeId?: number): Promise<UniformIssue[]>;
  createUniformIssue(input: UniformIssueInput): Promise<UniformIssue>;
  listUniformPending(): Promise<UniformPendingRow[]>;

  /** มีเฉพาะ adapter ที่รีเซ็ตข้อมูลได้ (mock) */
  reset?(): Promise<void>;
}
