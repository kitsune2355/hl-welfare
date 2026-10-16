import { ApiError } from '../../application/errors';
import type {
  EmployeeInput,
  InsuranceBatchInput,
  SitePatch,
  UniformIssueInput,
  WelfareApi,
} from '../../application/ports';
import { buildDashboard } from '../../application/usecases/dashboard';
import { buildInsuranceCycle, sentIndex } from '../../application/usecases/insuranceCycle';
import { buildUniformPending } from '../../application/usecases/uniformPending';
import { todayISO } from '../../domain/date';
import { benefitsOf } from '../../domain/eligibility';
import { pvdStatus } from '../../domain/pvd';
import type { Employee, EmployeeFilter, ISODate, PvdRow, Site } from '../../domain/types';
import { buildSeed, type MockDb } from './seed';

const STORAGE_KEY = 'hl-welfare-mock-v1';
const LATENCY_MS = 150;
const CURRENT_USER = 'HR (mock)';

interface Stored {
  seededFor: ISODate;
  db: MockDb;
}

function load(today: ISODate): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Stored;
      if (s?.db?.employees) return s.db;
    }
  } catch {
    /* localStorage ใช้ไม่ได้ → ใช้ seed ใหม่ */
  }
  return buildSeed(today);
}

/** WelfareApi ในหน่วยความจำ + localStorage — ใช้ domain/use-case ชุดเดียวกับ PHP */
export class MockApi implements WelfareApi {
  private db: MockDb;
  private readonly today: () => ISODate;

  constructor(today: () => ISODate = () => todayISO()) {
    this.today = today;
    this.db = load(this.today());
  }

  // ---------- helpers ----------
  private async run<T>(fn: () => T): Promise<T> {
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    return structuredClone(fn());
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ seededFor: this.today(), db: this.db } satisfies Stored));
    } catch {
      /* เต็ม / ถูกบล็อก → ทำงานต่อในหน่วยความจำ */
    }
  }

  private site(id: number): Site | null {
    return this.db.sites.find((s) => s.id === id) ?? null;
  }

  private employee(id: number): Employee {
    const e = this.db.employees.find((x) => x.id === id);
    if (!e) throw new ApiError('ไม่พบพนักงาน', 404);
    return e;
  }

  // ---------- WelfareApi ----------
  getDashboard() {
    return this.run(() => {
      const { employees, sites, rules, batches, issues } = this.db;
      return buildDashboard(this.today(), employees, sites, rules, batches, issues);
    });
  }

  listCompanies() {
    return this.run(() => this.db.companies);
  }

  listSites() {
    return this.run(() => this.db.sites);
  }

  updateSite(id: number, patch: SitePatch) {
    return this.run(() => {
      const s = this.db.sites.find((x) => x.id === id);
      if (!s) throw new ApiError('ไม่พบหน่วยงาน', 404);
      Object.assign(s, patch);
      this.persist();
      return s;
    });
  }

  listEmployees(filter: EmployeeFilter = {}) {
    return this.run(() => {
      const q = filter.q?.trim().toLowerCase() ?? '';
      return this.db.employees
        .filter(
          (e) =>
            (!q || `${e.empCode} ${e.firstName} ${e.lastName}`.toLowerCase().includes(q)) &&
            (!filter.companyCode || e.companyCode === filter.companyCode) &&
            (!filter.employeeType || e.employeeType === filter.employeeType) &&
            (!filter.status || e.status === filter.status),
        )
        .sort((a, b) => a.empCode.localeCompare(b.empCode));
    });
  }

  getEmployeeBenefits(id: number) {
    return this.run(() => {
      const e = this.employee(id);
      return benefitsOf(e, this.site(e.siteId), this.db.rules, this.db.issues, this.today());
    });
  }

  saveEmployee(input: EmployeeInput) {
    return this.run(() => {
      const dup = this.db.employees.find((e) => e.empCode === input.empCode && e.id !== input.id);
      if (dup) throw new ApiError('รหัสพนักงานซ้ำ', 409);
      if (!this.site(input.siteId)) throw new ApiError('ไม่พบหน่วยงาน', 422);

      if (input.id) {
        const e = this.employee(input.id);
        Object.assign(e, input);
        this.persist();
        return e;
      }
      const created: Employee = { ...input, id: Math.max(0, ...this.db.employees.map((e) => e.id)) + 1 };
      this.db.employees.push(created);
      this.persist();
      return created;
    });
  }

  getRules() {
    return this.run(() => this.db.rules);
  }

  getInsuranceCycle(cycleDate: ISODate) {
    return this.run(() => {
      const { employees, sites, rules, batches } = this.db;
      return buildInsuranceCycle(cycleDate, employees, sites, rules, batches);
    });
  }

  listInsuranceBatches() {
    return this.run(() => [...this.db.batches].sort((a, b) => b.id - a.id));
  }

  submitInsuranceBatch(input: InsuranceBatchInput) {
    return this.run(() => {
      if (input.employeeIds.length === 0) throw new ApiError('ไม่มีรายการที่เลือก', 422);
      input.employeeIds.forEach((id) => this.employee(id));
      const sent = sentIndex(this.db.batches)[input.type === 'IN' ? 'IN' : 'OUT'];
      const already = input.employeeIds.filter((id) => sent.has(id)).length;
      if (already > 0) throw new ApiError(`มีพนักงานที่ถูกแจ้งไปแล้ว ${already} ราย`, 409);

      const batch = {
        id: Math.max(0, ...this.db.batches.map((b) => b.id)) + 1,
        ...input,
        submittedAt: new Date().toISOString().slice(0, 19),
        submittedBy: CURRENT_USER,
      };
      this.db.batches.push(batch);
      this.persist();
      return batch;
    });
  }

  listPvdMembers() {
    return this.run(() => {
      const today = this.today();
      const rows: PvdRow[] = [];
      for (const employee of this.db.employees) {
        const pvd = pvdStatus(employee, this.db.rules, today);
        if (pvd.eligible) rows.push({ employee, pvd });
      }
      return rows.sort((a, b) => (a.pvd.joinDate ?? '').localeCompare(b.pvd.joinDate ?? ''));
    });
  }

  listUniformIssues(employeeId?: number) {
    return this.run(() =>
      this.db.issues
        .filter((i) => employeeId === undefined || i.employeeId === employeeId)
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.id - a.id),
    );
  }

  createUniformIssue(input: UniformIssueInput) {
    return this.run(() => {
      this.employee(input.employeeId);
      if (!input.size.trim()) throw new ApiError('กรุณาเลือกไซซ์', 422);
      if (this.db.issues.some((i) => i.employeeId === input.employeeId && i.entitlementKey === input.entitlementKey)) {
        throw new ApiError('รายการนี้แจกไปแล้ว', 409);
      }
      const issue = { ...input, id: Math.max(0, ...this.db.issues.map((i) => i.id)) + 1, issuedBy: CURRENT_USER };
      this.db.issues.push(issue);
      this.persist();
      return issue;
    });
  }

  listUniformPending() {
    return this.run(() => {
      const { employees, sites, rules, issues } = this.db;
      return buildUniformPending(employees, sites, rules, issues, this.today());
    });
  }

  reset() {
    return this.run(() => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      this.db = buildSeed(this.today());
    });
  }
}
