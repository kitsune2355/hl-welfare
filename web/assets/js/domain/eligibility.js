import { insuranceStatus } from './insurance.js';
import { pvdStatus } from './pvd.js';
import { uniformStatus } from './uniform.js';
export { findInsuranceRule, insuranceExit, insuranceStatus } from './insurance.js';
export { pvdStatus } from './pvd.js';
export { matchUniformRule, resolveItems, resolveStyle, uniformStatus } from './uniform.js';

/** สิทธิสวัสดิการทั้งหมดของพนักงาน 1 คน */
export function benefitsOf(employee, site, rules, issues, today) {
  return {
    employee,
    site,
    insurance: insuranceStatus(employee, site, rules),
    pvd: pvdStatus(employee, rules, today),
    uniform: uniformStatus(employee, site, rules, issues, today),
  };
}
