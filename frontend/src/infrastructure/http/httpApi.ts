import { ApiError } from '../../application/errors';
import type {
  EmployeeInput,
  InsuranceBatchInput,
  SiteInput,
  SitePatch,
  UniformIssueInput,
  WelfareApi,
} from '../../application/ports';
import type {
  ActivityFilter,
  ActivityLog,
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
} from '../../domain/types';

/** WelfareApi ผ่าน REST → PHP backend (สเปกข้อ 8) */
export class HttpApi implements WelfareApi {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
        credentials: 'include',
      });
    } catch {
      throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 0);
    }
    const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { data?: T; error?: string };
    if (!res.ok || body.error !== undefined) throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status);
    return body.data as T;
  }

  private send<T>(method: string, path: string, data: unknown) {
    return this.req<T>(path, { method, body: JSON.stringify(data) });
  }

  private async del(path: string): Promise<void> {
    await this.req<unknown>(path, { method: 'DELETE' });
  }

  getDashboard() {
    return this.req<DashboardData>('/dashboard');
  }
  listCompanies() {
    return this.req<Company[]>('/companies');
  }
  listSites() {
    return this.req<Site[]>('/sites');
  }
  createSite(input: SiteInput) {
    return this.send<Site>('POST', '/sites', input);
  }
  updateSite(id: number, patch: SitePatch) {
    return this.send<Site>('PATCH', `/sites/${id}`, patch);
  }
  deleteSite(id: number) {
    return this.del(`/sites/${id}`);
  }
  listEmployees(filter: EmployeeFilter = {}) {
    const qs = new URLSearchParams();
    if (filter.q) qs.set('q', filter.q);
    if (filter.companyCode) qs.set('company', filter.companyCode);
    if (filter.employeeType) qs.set('type', filter.employeeType);
    if (filter.status) qs.set('status', filter.status);
    const s = qs.toString();
    return this.req<Employee[]>(`/employees${s ? `?${s}` : ''}`);
  }
  getEmployeeBenefits(id: number) {
    return this.req<EmployeeBenefits>(`/employees/${id}/benefits`);
  }
  saveEmployee(emp: EmployeeInput) {
    return emp.id ? this.send<Employee>('PUT', `/employees/${emp.id}`, emp) : this.send<Employee>('POST', '/employees', emp);
  }
  deleteEmployee(id: number) {
    return this.del(`/employees/${id}`);
  }
  getRules() {
    return this.req<RuleSet>('/rules');
  }
  getInsuranceCycle(cycleDate: ISODate) {
    return this.req<InsuranceCycle>(`/insurance/cycles/${cycleDate}`);
  }
  listInsuranceBatches() {
    return this.req<InsuranceBatch[]>('/insurance/batches');
  }
  submitInsuranceBatch(input: InsuranceBatchInput) {
    return this.send<InsuranceBatch>('POST', '/insurance/batches', input);
  }
  cancelInsuranceBatch(id: number) {
    return this.del(`/insurance/batches/${id}`);
  }
  listPvdMembers() {
    return this.req<PvdRow[]>('/pvd/members');
  }
  listUniformIssues(employeeId?: number) {
    return this.req<UniformIssue[]>(`/uniform/issues${employeeId ? `?employeeId=${employeeId}` : ''}`);
  }
  createUniformIssue(input: UniformIssueInput) {
    return this.send<UniformIssue>('POST', '/uniform/issues', input);
  }
  listUniformPending() {
    return this.req<UniformPendingRow[]>('/uniform/pending');
  }
  cancelUniformIssue(id: number) {
    return this.del(`/uniform/issues/${id}`);
  }
  getWorkQueue() {
    return this.req<MonitorTask[]>('/monitor/tasks');
  }
  listActivity(filter: ActivityFilter = {}) {
    const qs = new URLSearchParams();
    if (filter.entity) qs.set('entity', filter.entity);
    if (filter.employeeId !== undefined) qs.set('employeeId', String(filter.employeeId));
    if (filter.limit) qs.set('limit', String(filter.limit));
    const s = qs.toString();
    return this.req<ActivityLog[]>(`/activity${s ? `?${s}` : ''}`);
  }
}
