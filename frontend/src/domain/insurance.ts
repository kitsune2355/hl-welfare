import { addDays, ageAt, nextCycleDate } from './date';
import type { Employee, InsuranceRule, InsuranceStatus, ISODate, RuleSet, Settings, Site } from './types';

export interface InsuranceExit {
  exitDate: ISODate;
  exitCycleDate: ISODate;
  exitUrgent: boolean;
}

export function findInsuranceRule(emp: Employee, rules: InsuranceRule[]): InsuranceRule | null {
  return (
    rules.find(
      (r) => r.employeeType === emp.employeeType && (r.companies === null || r.companies.includes(emp.companyCode)),
    ) ?? null
  );
}

/** วันมีผลออกจากประกันกลุ่ม — null ถ้ายังไม่พ้นสภาพ */
export function insuranceExit(emp: Employee, settings: Settings): InsuranceExit | null {
  if (!emp.endReason && !emp.endDate) return null;
  const day = settings.insuranceCycleDay;

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

export function insuranceStatus(emp: Employee, site: Site | null, rules: RuleSet): InsuranceStatus {
  const { settings } = rules;
  const none = (reason: string, partial: Partial<InsuranceStatus> = {}): InsuranceStatus => ({
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
  const enrollCycleDate = nextCycleDate(eligibleDate, settings.insuranceCycleDay);
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
