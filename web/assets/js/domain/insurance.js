import { typeInfo } from './catalog.js';
import { addDays, addMonths, nextCycleDate } from './date.js';
import { waitStartDate } from './transfer.js';

/** วันที่รอบแจ้งประกันของพนักงาน — ประเภทที่ตั้ง "รอบรายวัน" ส่งแยกทุกวันที่ 6 (ตั้งค่าได้) · ประเภทอื่นทุกวันที่ 5 */
export function cycleDayOf(emp, settings) {
  return typeInfo(emp.employeeType)?.dailyCycle ? (settings.insuranceCycleDayDaily ?? settings.insuranceCycleDay) : settings.insuranceCycleDay;
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

/** วันที่อายุครบ N ปี (วันเกิดปีที่ N) — 29 ก.พ. ปีไม่อธิกสุรทินเลื่อนเป็น 1 มี.ค. ทั้งสองฝั่ง */
export const birthdayAt = (birthDate, years) => addMonths(birthDate, years * 12);

/**
 * วันมีผลออกจากประกันกลุ่ม — null ถ้ายังไม่พ้นสภาพและอายุยังไม่ครบ
 * อายุครบ insuranceMaxAge ระหว่างเป็นสมาชิก → แจ้งออกรอบถัดไป (exitReason = 'AGE')
 * ถ้ามีทั้งพ้นสภาพและอายุครบ ใช้วันที่มาก่อน
 */
export function insuranceExit(emp, settings) {
  const job = employmentExit(emp, settings);
  const ageDate = birthdayAt(emp.birthDate, settings.insuranceMaxAge);
  if (job && job.exitDate <= ageDate) return job;
  if (!job && emp.status === 'INACTIVE') return null;
  return { exitDate: ageDate, exitCycleDate: nextCycleDate(ageDate, cycleDayOf(emp, settings)), exitUrgent: false, exitReason: 'AGE' };
}

/** วันมีผลออกเพราะพ้นสภาพ — null ถ้ายังไม่พ้นสภาพ */
function employmentExit(emp, settings) {
  if (!emp.endReason && !emp.endDate) return null;
  const day = cycleDayOf(emp, settings);
  switch (emp.endReason) {
    case 'TERMINATED':
    case 'MISCONDUCT': {
      const exitDate = emp.endDate ?? emp.lastWorkingDate;
      if (!exitDate) return null;
      return { exitDate, exitCycleDate: exitDate, exitUrgent: true, exitReason: emp.endReason };
    }
    case 'ABSENT_3D': {
      const base = emp.lastWorkingDate ?? emp.endDate;
      if (!base) return null;
      const exitDate = addDays(base, settings.absentExtraDays);
      return { exitDate, exitCycleDate: nextCycleDate(exitDate, day), exitUrgent: false, exitReason: emp.endReason };
    }
    default: {
      // RESIGN หรือพ้นสภาพโดยไม่ระบุเหตุผล
      const exitDate = emp.endDate ?? emp.lastWorkingDate;
      if (!exitDate) return null;
      return { exitDate, exitCycleDate: nextCycleDate(exitDate, day), exitUrgent: false, exitReason: emp.endReason ?? null };
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
    exitReason: null,
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
  // นับวันเริ่มงานเป็นวันที่ 1 — ทำงานครบ 30 วันในวันเริ่มงาน + 29 · ได้สิทธิจริงวันถัดไป (HR: 30 + 1) = วันเริ่มงาน + 30
  // โอนย้ายแบบ "นับวันรอใหม่" = นับจากวันที่ย้าย (domain/transfer.js)
  const eligibleDate = addDays(waitStartDate(emp), rule.waitDays);
  const enrollCycleDate = nextCycleDate(eligibleDate, cycleDayOf(emp, settings));
  if (birthdayAt(emp.birthDate, settings.insuranceMaxAge) <= enrollCycleDate) {
    return none(`อายุครบ ${settings.insuranceMaxAge} ปีก่อนถึงรอบแจ้งเข้า`, { ruleId: rule.id, eligibleDate });
  }
  const exit = insuranceExit(emp, settings);
  if (exit && exit.exitDate < enrollCycleDate) {
    return none('พ้นสภาพก่อนถึงรอบแจ้งเข้า — ไม่ต้องแจ้งเข้า/ออก', {
      ruleId: rule.id,
      eligibleDate,
      enrollCycleDate,
    });
  }
  return {
    eligible: true,
    reasons: [],
    eligibleDate,
    enrollCycleDate,
    exitDate: exit?.exitDate ?? null,
    exitCycleDate: exit?.exitCycleDate ?? null,
    exitUrgent: exit?.exitUrgent ?? false,
    exitReason: exit?.exitReason ?? null,
    ruleId: rule.id,
  };
}
