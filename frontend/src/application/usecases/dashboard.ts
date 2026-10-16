import { addDays, nextCycleDate } from '../../domain/date';
import { insuranceStatus } from '../../domain/insurance';
import { COMPANY_CODES } from '../../domain/labels';
import { pvdStatus } from '../../domain/pvd';
import type {
  DashboardData,
  Employee,
  InsuranceBatch,
  ISODate,
  RuleSet,
  Site,
  UniformIssue,
} from '../../domain/types';
import { buildInsuranceCycle } from './insuranceCycle';
import { buildUniformPending } from './uniformPending';

const UPCOMING_DAYS = 30;

export function buildDashboard(
  today: ISODate,
  employees: Employee[],
  sites: Site[],
  rules: RuleSet,
  batches: InsuranceBatch[],
  issues: UniformIssue[],
): DashboardData {
  const active = employees.filter((e) => e.status === 'ACTIVE');
  const siteById = new Map(sites.map((s) => [s.id, s]));

  const cycleDate = nextCycleDate(today, rules.settings.insuranceCycleDay);
  const pending = buildInsuranceCycle(cycleDate, employees, sites, rules, batches).rows.filter((r) => !r.submitted);

  const horizon = addDays(today, UPCOMING_DAYS);
  const upcoming: DashboardData['upcomingEligible'] = [];
  for (const emp of active) {
    const ins = insuranceStatus(emp, siteById.get(emp.siteId) ?? null, rules);
    if (ins.eligible && ins.eligibleDate && ins.eligibleDate > today && ins.eligibleDate <= horizon) {
      upcoming.push({ employee: emp, benefit: 'INSURANCE', date: ins.eligibleDate });
    }
    const pvd = pvdStatus(emp, rules, today);
    if (pvd.eligible && pvd.joinDate && pvd.joinDate > today && pvd.joinDate <= horizon) {
      upcoming.push({ employee: emp, benefit: 'PVD', date: pvd.joinDate });
    }
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  return {
    today,
    activeByCompany: COMPANY_CODES.map((companyCode) => ({
      companyCode,
      count: active.filter((e) => e.companyCode === companyCode).length,
    })),
    activeTotal: active.length,
    nextCycleDate: cycleDate,
    nextCycleIn: pending.filter((r) => r.type === 'IN').length,
    nextCycleOut: pending.filter((r) => r.type === 'OUT').length,
    urgentPending: pending.filter((r) => r.type === 'URGENT').length,
    upcomingEligible: upcoming,
    uniformPending: buildUniformPending(employees, sites, rules, issues, today).length,
  };
}
