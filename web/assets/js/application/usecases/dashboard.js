import { addDays, nextCycleDate } from '../../domain/date.js';
import { insuranceStatus } from '../../domain/insurance.js';
import { COMPANY_CODES } from '../../domain/labels.js';
import { pvdStatus } from '../../domain/pvd.js';
import { buildInsuranceCycle } from './insuranceCycle.js';
import { buildUniformPending } from './uniformPending.js';

const UPCOMING_DAYS = 30;

export function buildDashboard(today, employees, sites, rules, batches, issues) {
  const active = employees.filter((e) => e.status === 'ACTIVE');
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const cycleDate = nextCycleDate(today, rules.settings.insuranceCycleDay);
  const pending = buildInsuranceCycle(cycleDate, employees, sites, rules, batches).rows.filter((r) => !r.submitted);
  const horizon = addDays(today, UPCOMING_DAYS);
  const upcoming = [];
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
