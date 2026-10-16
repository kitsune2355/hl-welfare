import { minDate, yearOf } from './date.js';

export const OTHER_POSITION = 'ตำแหน่งอื่นๆ';

const ANNUAL_LOOKBACK_YEARS = 3;

/** rule.position เก็บได้หลายตำแหน่งคั่นด้วย "," เช่น "หัวหน้าช่างเทคนิค, วิศวกร" */
function positionsOf(rule) {
  return rule.position === null ? [] : rule.position.split(',').map((p) => p.trim());
}

export function matchUniformRule(emp, rules) {
  const candidates = rules.filter(
    (r) =>
      r.employeeType === emp.employeeType &&
      r.companies.includes(emp.companyCode) &&
      (r.deptGroups === null || (emp.deptGroup !== null && r.deptGroups.includes(emp.deptGroup))) &&
      (r.levelMin === null || (emp.level !== null && emp.level >= r.levelMin)) &&
      (r.levelMax === null || (emp.level !== null && emp.level <= r.levelMax)),
  );
  return (
    candidates.find((r) => emp.position !== null && positionsOf(r).includes(emp.position)) ??
    candidates.find((r) => r.position === null) ??
    candidates.find((r) => r.position === OTHER_POSITION) ??
    null
  );
}

/** แทนโปโลด้วยสีของหน่วยงาน ถ้ากฎระบุ poloBySite */
export function resolveItems(rule, site) {
  if (!rule.poloBySite) return rule.items;
  const polo = site?.poloColor === 'NAVY' ? 'POLO_NAVY' : 'POLO_BLACK';
  return rule.items.map((i) => (i === 'POLO_BLACK' || i === 'POLO_NAVY' ? polo : i));
}

export function resolveStyle(rule, site) {
  if (!rule.poloBySite || !rule.items.some((i) => i.startsWith('POLO'))) return rule.style;
  return `${rule.style} · โปโล${site?.poloColor === 'NAVY' ? 'สีน้ำเงิน' : 'สีดำ'}`;
}

export function uniformStatus(emp, site, rules, issues, today) {
  const rule = matchUniformRule(emp, rules.uniform);
  if (!rule) {
    const typeCovered = rules.uniform.some((r) => r.employeeType === emp.employeeType);
    return {
      ruleId: null,
      style: null,
      reasons: [
        typeCovered
          ? 'ไม่พบกฎชุดฟอร์มที่ตรงกับบริษัท/กลุ่ม/ระดับของพนักงาน (รอ HR ยืนยัน)'
          : 'ประเภทพนักงานนี้ไม่อยู่ในเงื่อนไขชุดฟอร์ม',
      ],
      entitlements: [],
    };
  }
  const items = resolveItems(rule, site);
  const style = resolveStyle(rule, site);
  const limit = minDate(emp.endDate, today);
  const mine = issues.filter((i) => i.employeeId === emp.id);
  const ents = [];
  const push = (key, event, dueDate, qty, qtyLabel) => {
    const issue = mine.find((i) => i.entitlementKey === key);
    ents.push({ key, event, dueDate, qty, qtyLabel, items, style, issued: !!issue, issueId: issue?.id ?? null });
  };
  if (rule.qtyStart > 0 && emp.startDate <= limit) {
    push('START', 'START', emp.startDate, rule.qtyStart, rule.qtyStartLabel ?? String(rule.qtyStart));
  }
  const pass = emp.probationPassDate;
  if (pass && pass <= limit && rule.qtyProbation > 0) {
    push('PROBATION', 'PROBATION', pass, rule.qtyProbation, String(rule.qtyProbation));
  }
  if (pass && rule.qtyAnnual > 0) {
    const month = String(rules.settings.uniformAnnualMonth).padStart(2, '0');
    const lastYear = yearOf(limit);
    for (let y = Math.max(yearOf(pass), lastYear - ANNUAL_LOOKBACK_YEARS + 1); y <= lastYear; y++) {
      const due = `${y}-${month}-01`;
      if (due > pass && due <= limit) push(`ANNUAL-${y}`, 'ANNUAL', due, rule.qtyAnnual, String(rule.qtyAnnual));
    }
  }
  return { ruleId: rule.id, style, reasons: [], entitlements: ents };
}
