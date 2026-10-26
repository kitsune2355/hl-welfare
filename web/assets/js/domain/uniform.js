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

/**
 * โลโก้บริษัทบนเสื้อ — ใช้เลือกแบบเสื้อในระบบสต็อก
 * กฎรุ่นก่อนไม่มี rule.logo (เก็บอยู่ใน localStorage) จึงอ่านจากชื่อแบบ "… โลโก้ HL" แทน
 */
export function uniformLogo(rule, emp) {
  return rule.logo ?? rule.style.match(/โลโก้\s*(\S+)/)?.[1] ?? emp.companyCode;
}

/**
 * การแจกที่ผ่านคลัง (source = 'STOCK') นับว่า "แจกแล้ว" เมื่อคลังจ่ายของแล้วเท่านั้น
 * ระหว่างรอคลังจ่าย (REQUESTED) สิทธิ์ยังไม่ครบ แต่ไม่อยู่ใน "ค้างแจก" เพราะ HR ส่งเบิกไปแล้ว
 * ใบที่คลังยกเลิกไม่ถูกเก็บไว้ (mock ลบทิ้งตอน sync) สิทธิ์จึงกลับเป็นค้างแจกเอง
 */
export const STOCK_HANDED_OUT = ['ISSUED', 'RECEIVED'];
export const isStockIssue = (issue) => issue.source === 'STOCK';
export const isHandedOut = (issue) => !isStockIssue(issue) || STOCK_HANDED_OUT.includes(issue.stock.stage);

/** รอบแจกชุดฟอร์ม เรียงตามลำดับเวลา */
export const UNIFORM_EVENTS = ['START', 'PROBATION', 'ANNUAL'];
const LEGACY_QTY = { START: 'qtyStart', PROBATION: 'qtyProbation', ANNUAL: 'qtyAnnual' };

/**
 * จำนวนต่อรายการต่อรอบของกฎ: { START: { TECH_SHIRT: 2, POLO_BLACK: 1 }, PROBATION: {...}, ANNUAL: {...} }
 * กฎรุ่นก่อนที่ไม่มี quantities: ทุกรายการได้ตามจำนวนของรอบ ยกเว้นรองเท้า 1 คู่
 */
export function ruleQuantities(rule) {
  if (rule.quantities) return rule.quantities;
  const out = {};
  for (const ev of UNIFORM_EVENTS) {
    const n = rule[LEGACY_QTY[ev]] ?? 0;
    out[ev] = Object.fromEntries(rule.items.map((c) => [c, n > 0 ? (c === 'SAFETY_SHOES' ? 1 : n) : 0]));
  }
  return out;
}

/** หน่วยงานตั้งชุดฟอร์มทับกฎข้อนี้ไว้ไหม — คืน quantities ของหน่วยงาน หรือ null */
export function siteOverride(rule, site) {
  return site?.uniformOverrides?.find((o) => o.ruleId === rule.id)?.quantities ?? null;
}

/**
 * จำนวนที่ใช้จริงที่หน่วยงานนี้ — หน่วยงานตั้งทับกฎไว้ = ใช้ของหน่วยงานแทนทั้งชุด
 * ตัดรายการที่เป็น 0 ออก และแทนโปโลด้วยสีของหน่วยงานถ้ากฎระบุ poloBySite
 * @returns {{START: Object<string, number>, PROBATION: Object<string, number>, ANNUAL: Object<string, number>}}
 */
export function siteQuantities(rule, site) {
  const base = siteOverride(rule, site) ?? ruleQuantities(rule);
  const polo = site?.poloColor === 'NAVY' ? 'POLO_NAVY' : 'POLO_BLACK';
  const out = {};
  for (const ev of UNIFORM_EVENTS) {
    const m = {};
    for (const [code, n] of Object.entries(base[ev] ?? {})) {
      if (!(n > 0)) continue;
      const c = rule.poloBySite && code.startsWith('POLO') ? polo : code;
      m[c] = (m[c] ?? 0) + n;
    }
    out[ev] = m;
  }
  return out;
}

const sumQty = (m) => Object.values(m).reduce((s, n) => s + n, 0);

export function uniformStatus(emp, site, rules, issues, today) {
  const rule = matchUniformRule(emp, rules.uniform);
  if (!rule) {
    const typeCovered = rules.uniform.some((r) => r.employeeType === emp.employeeType);
    return {
      ruleId: null,
      style: null,
      logo: null,
      siteOverride: false,
      reasons: [
        typeCovered
          ? 'ไม่พบกฎชุดฟอร์มที่ตรงกับบริษัท/กลุ่ม/ระดับของพนักงาน (รอ HR ยืนยัน)'
          : 'ประเภทพนักงานนี้ไม่อยู่ในเงื่อนไขชุดฟอร์ม',
      ],
      entitlements: [],
      upcoming: [],
    };
  }
  const quantities = siteQuantities(rule, site);
  const style = resolveStyle(rule, site);
  const limit = minDate(emp.endDate, today);
  const mine = issues.filter((i) => i.employeeId === emp.id);
  const ents = [];
  const push = (key, event, dueDate) => {
    const issue = mine.find((i) => i.entitlementKey === key);
    const itemQty = quantities[event];
    ents.push({
      key,
      event,
      dueDate,
      qty: sumQty(itemQty),
      qtyLabel: String(sumQty(itemQty)),
      items: Object.keys(itemQty),
      itemQty,
      style,
      issued: !!issue && isHandedOut(issue),
      requested: !!issue && !isHandedOut(issue),
      issueId: issue?.id ?? null,
      stockDocNo: issue?.stock?.docNo ?? null,
      stock: issue?.stock ?? null,
    });
  };
  if (sumQty(quantities.START) > 0 && emp.startDate <= limit) {
    push('START', 'START', emp.startDate);
  }
  // ผ่านทดลองงานก่อนเสมอ ถึงจะได้รอบผ่านโปรและรอบประจำปี (HR ยืนยัน)
  const pass = emp.probationPassDate;
  const month = String(rules.settings.uniformAnnualMonth).padStart(2, '0');
  if (pass && pass <= limit && sumQty(quantities.PROBATION) > 0) {
    push('PROBATION', 'PROBATION', pass);
  }
  if (pass && sumQty(quantities.ANNUAL) > 0) {
    const lastYear = yearOf(limit);
    for (let y = Math.max(yearOf(pass), lastYear - ANNUAL_LOOKBACK_YEARS + 1); y <= lastYear; y++) {
      const due = `${y}-${month}-01`;
      if (due > pass && due <= limit) push(`ANNUAL-${y}`, 'ANNUAL', due);
    }
  }
  // รอบที่ยังไม่ถึงกำหนด — แสดงล่วงหน้าในหน้าพนักงาน ไม่นับเป็นค้างแจก · ประจำปีแสดงเฉพาะรอบถัดไป · หลังวันพ้นสภาพไม่มี
  const upcoming = [];
  const ahead = (key, event, dueDate) => {
    if (dueDate <= limit || (emp.endDate && dueDate > emp.endDate)) return;
    const itemQty = quantities[event];
    upcoming.push({ key, event, dueDate, qty: sumQty(itemQty), qtyLabel: String(sumQty(itemQty)), items: Object.keys(itemQty), itemQty, style });
  };
  if (sumQty(quantities.START) > 0) ahead('START', 'START', emp.startDate);
  if (pass && sumQty(quantities.PROBATION) > 0) ahead('PROBATION', 'PROBATION', pass);
  if (pass && sumQty(quantities.ANNUAL) > 0) {
    let y = yearOf(limit > pass ? limit : pass);
    while (`${y}-${month}-01` <= limit || `${y}-${month}-01` <= pass) y++;
    ahead(`ANNUAL-${y}`, 'ANNUAL', `${y}-${month}-01`);
  }
  return {
    ruleId: rule.id,
    style,
    logo: uniformLogo(rule, emp),
    siteOverride: siteOverride(rule, site) !== null,
    reasons: [],
    entitlements: ents,
    upcoming,
  };
}
