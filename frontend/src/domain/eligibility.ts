import { insuranceStatus } from './insurance';
import { pvdStatus } from './pvd';
import type { Employee, EmployeeBenefits, ISODate, RuleSet, Site, UniformIssue } from './types';
import { uniformStatus } from './uniform';

export { findInsuranceRule, insuranceExit, insuranceStatus } from './insurance';
export { pvdStatus } from './pvd';
export { matchUniformRule, resolveItems, resolveStyle, uniformStatus } from './uniform';

/** สิทธิสวัสดิการทั้งหมดของพนักงาน 1 คน */
export function benefitsOf(
  employee: Employee,
  site: Site | null,
  rules: RuleSet,
  issues: UniformIssue[],
  today: ISODate,
): EmployeeBenefits {
  return {
    employee,
    site,
    insurance: insuranceStatus(employee, site, rules),
    pvd: pvdStatus(employee, rules, today),
    uniform: uniformStatus(employee, site, rules, issues, today),
  };
}
