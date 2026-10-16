import { addDays, ageAt, nextCycleDate } from './date.js';

/** วันที่รอบแจ้งประกันของพนักงาน — รายวันส่งแยกทุกวันที่ 6 (ตั้งค่าได้) · ประเภทอื่นทุกวันที่ 5 */
export function cycleDayOf(emp, settings) {
  return emp.employeeType === 'DAILY' ? (settings.insuranceCycleDayDaily ?? settings.insuranceCycleDay) : settings.insuranceCycleDay;
}
/** วันที่ของรอบทั้งหมดในเดือน เช่น [5, 6] */
export function cycleDays(settings) {
  return [...new Set([settings.insuranceCycleDay, settings.insuranceCycleDayDaily ?? settings.insuranceCycleDay])].sort((a, b) => a - b);
}
/** รอบนี้ (cycleDate) เป็นของพนักงานคนนี้ไหม — วันที่ 5 = ทุกประเภทยกเว้นรายวัน · วันที่ 6 = รายวัน */
export function inCycleGroup(emp, settings, cycleDate) {
  return cycleDayOf(emp, settings) === Number(cycleDate.slice(8, 10));
}

export function findInsuranceRule(emp, rules) {
  return (
    rules.find(
      (r) => r.employeeType === emp.employeeType && (r.companies === null || r.companies.includes(emp.companyCode)),
    ) ?? null
  );
}

/** วันมีผลออกจากประกันกลุ่ม — null ถ้ายังไม่พ้นสภาพ */
export function insuranceExit(emp, settings) {
  if (!emp.endReason && !emp.endDate) return null;
  const day = cycleDayOf(emp, settings);
  switch (emp.endReason) {
    case 'TERMINATED':
    case 'MISCONDUCT': {
      const exitDate = emp.endDate ?? emp.lastWorkingDate;
      if (!exitDate) return null;
      return { exitDate, exitCycleDate: exitDate, exitUrgent: true };
    }
    case 'ABSENT_3D': {
      const base = emp.lastWorkingDate ?? emp.endDate;
      if (!base) return null;
      const exitDate = addDays(base, settings.absentExtraDays);
      return { exitDate, exitCycleDate: nextCycleDate(exitDate, day), exitUrgent: false };
    }
    default: {
      // RESIGN หรือพ้นสภาพโดยไม่ระบุเหตุผล
      const exitDate = emp.endDate ?? emp.lastWorkingDate;
      if (!exitDate) return null;
      return { exitDate, exitCycleDate: nextCycleDate(exitDate, day), exitUrgent: false };
    }
  }
}

export function insuranceStatus(emp, site, rules) {
  const { settings } = rules;
  const none = (reason, partial = {}) => ({
    eligible: false,
    reasons: [reason],
    eligibleDate: null,
    enrollCycleDate: null,
    exitDate: null,
    exitCycleDate: null,
    exitUrgent: false,
    ruleId: null,
    ...partial,
  });
  const rule = findInsuranceRule(emp, rules.insurance);
  if (!rule) return none('ประเภทพนักงาน/บริษัทนี้ไม่อยู่ในเงื่อนไขประกันกลุ่ม');
  if (rule.excludeContracts.includes(emp.contractType)) {
    return none('สัญญา 3% ระยะสั้น ไม่ได้รับประกันกลุ่ม', { ruleId: rule.id });
  }
  if (rule.requireSiteInsurance && !site?.hasGroupInsurance) {
    return none('หน่วยงานนี้ไม่ได้รับประกันกลุ่ม', { ruleId: rule.id });
  }
  const eligibleDate = addDays(emp.startDate, rule.waitDays);
  const enrollCycleDate = nextCycleDate(eligibleDate, cycleDayOf(emp, settings));
  const exit = insuranceExit(emp, settings);
  if (exit && exit.exitDate < enrollCycleDate) {
    return none('พ้นสภาพก่อนถึงรอบแจ้งเข้า — ไม่ต้องแจ้งเข้า/ออก', {
      ruleId: rule.id,
      eligibleDate,
      enrollCycleDate,
    });
  }
  if (ageAt(emp.birthDate, enrollCycleDate) > settings.insuranceMaxAge) {
    return none(`อายุเกิน ${settings.insuranceMaxAge} ปี ณ รอบแจ้งเข้า`, { ruleId: rule.id, eligibleDate });
  }
  return {
    eligible: true,
    reasons: [],
    eligibleDate,
    enrollCycleDate,
    exitDate: exit?.exitDate ?? null,
    exitCycleDate: exit?.exitCycleDate ?? null,
    exitUrgent: exit?.exitUrgent ?? false,
    ruleId: rule.id,
  };
}
