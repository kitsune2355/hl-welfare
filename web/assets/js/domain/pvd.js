import { addDays, diffDays, minDate } from './date.js';

const round2 = (n) => Math.round(n * 100) / 100;

export function pvdStatus(emp, rules, today) {
  const { settings } = rules;
  const none = (reason) => ({
    eligible: false,
    reasons: [reason],
    joinDate: null,
    employeeMonthly: 0,
    companyMonthly: 0,
    memberYears: null,
    vestingPercent: null,
  });
  const rule = rules.pvd.find((r) => r.employeeType === emp.employeeType);
  if (!rule) return none('ประเภทพนักงานนี้ไม่อยู่ในเงื่อนไขกองทุนสำรองเลี้ยงชีพ');
  if (!rule.eligible) return none(rule.note || 'ไม่ได้รับกองทุนสำรองเลี้ยงชีพ');
  const joinDate = addDays(emp.startDate, rule.waitDays);
  if (emp.endDate && emp.endDate < joinDate) return none('พ้นสภาพก่อนครบกำหนดเป็นสมาชิก');
  const asOf = minDate(emp.endDate, today);
  const joined = asOf >= joinDate;
  const memberYears = joined ? Math.floor((diffDays(joinDate, asOf) / 365.25) * 10) / 10 : null;
  let vestingPercent = null;
  if (memberYears !== null) {
    const forfeited = emp.endReason === 'MISCONDUCT' || emp.endReason === 'ABSENT_3D';
    const step = [...settings.pvdVesting]
      .sort((a, b) => b.minYears - a.minYears)
      .find((s) => memberYears >= s.minYears);
    vestingPercent = forfeited ? 0 : (step?.percent ?? 0);
  }
  return {
    eligible: true,
    reasons: [],
    joinDate,
    employeeMonthly: round2((emp.salary * settings.pvdEmployeeRate) / 100),
    companyMonthly: round2((emp.salary * settings.pvdCompanyRate) / 100),
    memberYears,
    vestingPercent,
  };
}
