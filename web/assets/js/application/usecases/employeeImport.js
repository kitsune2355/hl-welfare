// นำเข้ารายชื่อพนักงานจาก Excel ของ HR (ไม่เรียกเครือข่าย — ทดสอบได้ด้วยข้อมูลสมมติ)
//
//   parseEmployeeSheet(rows)   ตาราง (แถว × คอลัมน์ จาก SheetJS header:1) → { kind, items } หรือ { error }
//     - หาแถวหัวตารางเอง (แถวที่มี "รหัสพนักงาน") · จับคอลัมน์ตามชื่อหัว ไม่ขึ้นกับลำดับ
//     - มีคอลัมน์ "วันพ้นสภาพ" = ไฟล์ลาออก (OUT) · ไม่มี = ไฟล์เข้าใหม่ (IN)
//     - วันที่: เลขวันที่ของ Excel / Date / "วว/ดด/ปปปป" · ปี พ.ศ. (> 2400) แปลงเป็น ค.ศ.
//     - ชื่อ: "นายสมชาย ใจดี" → คำนำหน้า / ชื่อ / นามสกุล · เพศจากคำนำหน้า
//   planEmployeeImport(parsed, employees, sites)  → สิ่งที่จะใส่ในตาราง
//     IN : เพิ่มแถวใหม่ (รหัสซ้ำในระบบ = ข้าม) · เดาประเภท/หน่วยงาน/ฝ่าย — ที่เดาไม่ได้ปล่อยว่างให้ HR เลือก (ช่องแดง)
//     OUT: แก้พนักงานเดิมตามรหัส → พ้นสภาพ + วันพ้นสภาพ + เหตุผล (พ้นสภาพแล้ว = ข้าม)
//          ไม่พบในระบบ = ข้าม · หรือ addMissing: true = เพิ่มเป็นพนักงานที่พ้นสภาพแล้ว (ข้อมูลในไฟล์ครบ)
//   planWorkbookImport(parsedList, …)  หลายชีตในไฟล์เดียว (template 2 ชีต "เข้าใหม่" + "ลาออก") → รวมเป็นแผนเดียว
//     คนที่อยู่ทั้งสองชีต (เข้าแล้วออกในเดือนเดียวกัน) = เพิ่มแถวเดียวเป็นพ้นสภาพ ไม่ซ้ำ
//
//   Template (TEMPLATE_SHEETS) — คอลัมน์ชุดเดียวกับไฟล์ของ HR + "ประเภทพนักงาน" (ไม่บังคับ — ว่าง = เดาให้)
//   monthlyTemplateRows(employees, sites, month)  ส่งออกเข้า-ออกประจำเดือนในรูปแบบ template (นำเข้ากลับได้)
import { defaultTypeFor, typeAllows, typeInfo } from '../../domain/catalog.js';
import { COMPANY_CODES, EMPLOYEE_TYPE_LABEL, END_REASON_LABEL, TITLES } from '../../domain/labels.js';
import { probationDueDate } from '../../domain/employee.js';
import { DEPT_GROUPS } from '../../shared/labels.js';

const HEAD = {
  empCode: ['รหัสพนักงาน', 'รหัส'],
  companyCode: ['บริษัท'],
  name: ['ชื่อพนักงาน', 'ชื่อ-นามสกุล', 'ชื่อ - นามสกุล', 'ชื่อ-สกุล', 'ชื่อ'],
  position: ['ชื่อตำแหน่ง', 'ตำแหน่ง'],
  unit: ['ชื่อหน่วยงาน', 'หน่วยงาน'],
  division: ['ฝ่าย'],
  startDate: ['วันเริ่มงาน', 'วันเข้างาน'],
  endDate: ['วันพ้นสภาพ', 'วันลาออก', 'วันที่ลาออก'],
  birthDate: ['วันเกิด'],
  level: ['ระดับ'],
  nationalId: ['เลขบัตรประชาชน', 'เลขประจำตัวประชาชน'],
  note: ['หมายเหตุ'],
  employeeType: ['ประเภทพนักงาน', 'ประเภท'],
};
const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** ค่าในเซลล์ → YYYY-MM-DD (ปี พ.ศ. → ค.ศ.) · อ่านไม่ได้ = null */
export function toIsoDate(v) {
  if (v === null || v === undefined || v === '') return null;
  let y, m, d;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    [y, m, d] = [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()];
  } else if (typeof v === 'number' && v > 0) {
    // เลขวันที่ของ Excel (นับจาก 30 ธ.ค. 1899)
    const t = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  } else {
    const s = norm(v);
    let x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (x) [y, m, d] = [+x[1], +x[2], +x[3]];
    else if ((x = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
      [d, m, y] = [+x[1], +x[2], +x[3]];
      if (y < 100) y += 2500; // ปี 2 หลักในไฟล์ HR = พ.ศ. 25xx (69 = 2569)
    } else return null;
  }
  if (y > 2400) y -= 543;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const TITLE_RE = /^(นางสาว|น\.ส\.|นาง|นาย|ว่าที่\s?ร\.ต\.(?:หญิง)?|ดร\.)\s*/;
/** "นายสมชาย ใจดี" → { title, firstName, lastName, gender } */
export function splitThaiName(full) {
  const s = norm(full);
  const m = s.match(TITLE_RE);
  let title = m ? m[1].replace(/\s/g, '') : null;
  if (title === 'น.ส.') title = 'นางสาว';
  const rest = (m ? s.slice(m[0].length) : s).split(' ').filter(Boolean);
  const gender = title === 'นาย' ? 'M' : title === 'นาง' || title === 'นางสาว' ? 'F' : null;
  return {
    title: TITLES.includes(title) ? title : null,
    rawTitle: title,
    firstName: rest[0] ?? '',
    lastName: rest.slice(1).join(' '),
    gender,
  };
}

/** หมายเหตุในไฟล์ลาออก → เหตุผลพ้นสภาพในระบบ */
export function endReasonOf(note) {
  const s = norm(note);
  if (/ขาดงาน|ขางาน/.test(s)) return 'ABSENT_3D';
  if (/ทุจริต|กระทำผิด|ไล่ออก/.test(s)) return 'MISCONDUCT';
  if (/เลิกจ้าง/.test(s)) return 'TERMINATED';
  return 'RESIGN';
}

/**
 * @param {any[][]} rows  แถวจาก SheetJS (header: 1, raw: true)
 * @returns {{kind: 'IN'|'OUT', items: object[]} | {error: string}}
 */
export function parseEmployeeSheet(rows) {
  const h = rows.slice(0, 15).findIndex((r) => (r ?? []).some((c) => HEAD.empCode.includes(norm(c))));
  if (h < 0) return { error: 'ไม่พบหัวตาราง "รหัสพนักงาน" ใน 15 แถวแรก — ตรวจว่าเป็นไฟล์รายชื่อพนักงานเข้าใหม่/ลาออก' };
  const head = rows[h].map(norm);
  const col = {};
  for (const [k, names] of Object.entries(HEAD)) {
    const i = head.findIndex((x) => names.includes(x));
    if (i >= 0) col[k] = i;
  }
  const need = ['empCode', 'companyCode', 'name'];
  const miss = need.filter((k) => col[k] === undefined).map((k) => HEAD[k][0]);
  if (miss.length) return { error: `ไม่พบคอลัมน์ ${miss.join(', ')}` };
  const kind = col.endDate !== undefined ? 'OUT' : 'IN';
  if (kind === 'IN' && col.startDate === undefined) return { error: 'ไฟล์เข้าใหม่ต้องมีคอลัมน์ "วันเริ่มงาน"' };
  const get = (r, k) => (col[k] === undefined ? null : r[col[k]]);
  const items = [];
  rows.slice(h + 1).forEach((r, i) => {
    if (!r) return;
    const empCode = norm(get(r, 'empCode'));
    if (!empCode) return;
    const name = splitThaiName(get(r, 'name'));
    const level = norm(get(r, 'level')).match(/\d+/);
    items.push({
      rowNo: h + 2 + i, // เลขแถวใน Excel (นับจาก 1)
      empCode,
      companyCode: norm(get(r, 'companyCode')).toUpperCase(),
      ...name,
      position: norm(get(r, 'position')),
      unit: norm(get(r, 'unit')),
      division: norm(get(r, 'division')),
      startDate: toIsoDate(get(r, 'startDate')),
      endDate: toIsoDate(get(r, 'endDate')),
      birthDate: toIsoDate(get(r, 'birthDate')),
      level: level ? Number(level[0]) : null,
      nationalId: norm(get(r, 'nationalId')).replace(/\D/g, '') || null,
      note: norm(get(r, 'note')),
      typeLabel: norm(get(r, 'employeeType')),
    });
  });
  return { kind, items };
}

/** ชื่อหน่วยงานในไฟล์ → หน่วยงานในระบบ (บริษัทเดียวกัน · ตัด "PRO/FM/" นำหน้า · ตรงทั้งชื่อ หรือชื่อหนึ่งอยู่ในอีกชื่อ) */
export function matchSite(unit, companyCode, sites) {
  const clean = (x) =>
    norm(x)
      .replace(/^[A-Z]+\/[A-Z]+\//i, '') // PRO/FM/…
      .replace(/^pro site\s*[—-]\s*/i, '') // Pro Site — …
      .toLowerCase();
  const u = clean(unit);
  if (!u) return null;
  const mine = sites.filter((s) => s.companyCode === companyCode);
  return (
    mine.find((s) => clean(s.name) === u) ??
    mine.find((s) => {
      const n = clean(s.name);
      return u.length >= 4 && n.length >= 4 && (n.includes(u) || u.includes(n));
    }) ??
    null
  );
}

/**
 * ประเภทพนักงานจากไฟล์ (เดา — แก้ในตารางได้)
 * กรอกคอลัมน์ "ประเภทพนักงาน" มา (template) = ใช้ค่านั้น ถ้าใช้กับบริษัทได้
 * ไม่กรอก = เดาจากรูปแบบไฟล์ของ HR (Pro Site / แม่บ้าน CNS — ถ้ายังมีประเภทนั้นในระบบ) · ไม่เข้าเงื่อนไข = ส่วนกลาง / ประเภทแรกที่ใช้กับบริษัทได้
 */
export function guessEmployeeType(item) {
  const given = Object.keys(EMPLOYEE_TYPE_LABEL).find((k) => EMPLOYEE_TYPE_LABEL[k] === item.typeLabel || k === item.typeLabel);
  if (given && typeAllows(given, item.companyCode)) return given;
  const usable = (code) => typeAllows(code, item.companyCode);
  if (item.companyCode === 'PRO' && /^(PRO\/FM\/|pro site)/i.test(item.unit ?? '') && usable('PRO_SITE')) return 'PRO_SITE';
  if (item.companyCode === 'CNS' && /แม่บ้าน/.test(item.position) && usable('MAID_CNS')) return 'MAID_CNS';
  return usable('CENTRAL') ? 'CENTRAL' : defaultTypeFor(item.companyCode);
}

/** ฝ่ายในไฟล์ → กลุ่ม/ฝ่ายของระบบ (groups = ชื่อที่ตั้งค่าไว้ · ไม่ส่ง = รายการตั้งต้น) · ไม่ตรงอันไหน = null ให้ HR เลือก */
export function matchDeptGroup(division, groups = DEPT_GROUPS) {
  const d = norm(division);
  if (!d) return null;
  // ชื่อยาวก่อน — "BU ส่วนกลาง" ไม่ถูกแย่งด้วยกลุ่มชื่อสั้นที่เป็นส่วนหนึ่งของชื่อ
  return [...groups].sort((a, b) => b.length - a.length).find((g) => d.includes(g)) ?? null;
}

/**
 * @param {{kind: 'IN'|'OUT', items: object[]}} parsed
 * @param {object[]} employees  พนักงานทั้งหมดในระบบ
 * @param {object[]} sites
 * @param {{addMissing?: boolean}} [opts]  ไฟล์ลาออก: คนที่ไม่มีในระบบ → เพิ่มเป็นพนักงานที่พ้นสภาพ
 * @returns {{kind: 'IN'|'OUT', add: {rowNo:number, row:object, issues:string[]}[], update: {rowNo:number, id:number, row:object, issues:string[]}[], skip: {rowNo:number, empCode:string, name:string, reason:string}[]}}
 */
export function planEmployeeImport(parsed, employees, sites, { addMissing = false, deptGroups = DEPT_GROUPS } = {}) {
  const byCode = new Map(employees.map((e) => [e.empCode, e]));
  const out = { kind: parsed.kind, add: [], update: [], skip: [] };
  const seen = new Set();
  for (const it of parsed.items) {
    const name = `${it.firstName} ${it.lastName}`.trim();
    const skip = (reason) => out.skip.push({ rowNo: it.rowNo, empCode: it.empCode, name, reason });
    if (seen.has(it.empCode)) {
      skip('รหัสซ้ำในไฟล์');
      continue;
    }
    seen.add(it.empCode);
    const existing = byCode.get(it.empCode);

    if (parsed.kind === 'OUT') {
      if (!existing && !addMissing) skip('ไม่พบรหัสนี้ในระบบ');
      else if (!existing) {
        if (!it.endDate) skip('ไม่มีวันพ้นสภาพ / อ่านวันที่ไม่ได้');
        else if (!COMPANY_CODES.includes(it.companyCode)) skip(`ไม่รู้จักบริษัท "${it.companyCode}"`);
        else {
          const a = newEmployee(it, sites, deptGroups);
          const endReason = endReasonOf(it.note);
          out.add.push({ rowNo: it.rowNo, issues: a.issues, row: { ...a.row, status: 'INACTIVE', endDate: it.endDate, lastWorkingDate: it.endDate, endReason } });
        }
      } else if (existing.status === 'INACTIVE') skip('พ้นสภาพในระบบแล้ว');
      else if (!it.endDate) skip('ไม่มีวันพ้นสภาพ / อ่านวันที่ไม่ได้');
      else {
        const endReason = endReasonOf(it.note);
        const issues = [];
        if (endReason === 'ABSENT_3D') issues.push('ขาดงาน 3 วัน — ตรวจ "ทำงานวันสุดท้าย" (ใส่เท่าวันพ้นสภาพไว้ก่อน)');
        out.update.push({
          rowNo: it.rowNo,
          id: existing.id,
          row: { ...existing, status: 'INACTIVE', endDate: it.endDate, lastWorkingDate: it.endDate, endReason },
          issues,
        });
      }
      continue;
    }

    if (existing) {
      skip(`มีรหัสนี้ในระบบแล้ว (${existing.firstName} ${existing.lastName})`);
      continue;
    }
    if (!COMPANY_CODES.includes(it.companyCode)) {
      skip(`ไม่รู้จักบริษัท "${it.companyCode}"`);
      continue;
    }
    out.add.push({ rowNo: it.rowNo, ...newEmployee(it, sites, deptGroups) });
  }
  return out;
}

/** แถวพนักงานใหม่จาก 1 แถวในไฟล์ + สิ่งที่ HR ต้องตรวจ */
function newEmployee(it, sites, deptGroups) {
  const type = guessEmployeeType(it);
  const info = typeInfo(type);
  const site = matchSite(it.unit, it.companyCode, sites);
  const deptGroup = info?.usesDeptGroup ? matchDeptGroup(it.division, deptGroups) : null;
  const issues = [];
  if (!site) issues.push(`ไม่พบหน่วยงาน "${it.unit || '–'}" — เลือกในตาราง`);
  if (info?.usesDeptGroup && !deptGroup) issues.push(`ฝ่าย "${it.division || '–'}" — เลือกกลุ่ม/ฝ่ายในตาราง`);
  if (!it.title && it.rawTitle) issues.push(`คำนำหน้า "${it.rawTitle}" ไม่มีในระบบ — เลือกในตาราง`);
  if (!it.birthDate) issues.push('ไม่มีวันเกิด');
  return {
    issues,
    row: {
      id: 0,
      empCode: it.empCode,
      firstName: it.firstName,
      lastName: it.lastName,
      companyCode: it.companyCode,
      siteId: site?.id ?? 0,
      employeeType: type,
      contractType: 'REGULAR',
      deptGroup,
      position: info?.usesPosition ? it.position || null : null,
      level: info?.usesDeptGroup ? it.level : null,
      salary: 0,
      birthDate: it.birthDate ?? '',
      startDate: it.startDate ?? '',
      probationPassDate: probationDueDate(it.startDate),
      status: 'ACTIVE',
      lastWorkingDate: null,
      endDate: null,
      endReason: null,
      title: it.title,
      gender: it.gender,
      nationalId: it.nationalId,
      phone: null,
      email: null,
    },
  };
}

/**
 * หลายชีตในไฟล์เดียว → แผนเดียว (template: ชีตเข้าใหม่ + ชีตลาออก · ไฟล์ HR ชีตเดียวก็ใช้ได้)
 * คนในชีตลาออกที่เพิ่งอยู่ในชีตเข้าใหม่ของไฟล์เดียวกัน = แถวเพิ่มเดียวกัน เปลี่ยนเป็นพ้นสภาพ (ไม่เพิ่มซ้ำ)
 * @param {{kind: 'IN'|'OUT', items: object[], sheet?: string}[]} parsedList
 * @returns {{kinds: {kind: string, sheet?: string, count: number}[], add: object[], update: object[], skip: object[]}}
 */
export function planWorkbookImport(parsedList, employees, sites, opts = {}) {
  const out = { kinds: [], add: [], update: [], skip: [] };
  const ins = parsedList.filter((p) => p.kind === 'IN');
  const outs = parsedList.filter((p) => p.kind === 'OUT');
  for (const p of [...ins, ...outs]) out.kinds.push({ kind: p.kind, sheet: p.sheet, count: p.items.length });
  for (const p of ins) {
    const plan = planEmployeeImport(p, employees, sites, opts);
    out.add.push(...plan.add.map((a) => ({ ...a, sheet: p.sheet })));
    out.skip.push(...plan.skip.map((x) => ({ ...x, sheet: p.sheet })));
  }
  const addedByCode = new Map(out.add.map((a) => [a.row.empCode, a]));
  for (const p of outs) {
    const sameFile = p.items.filter((it) => addedByCode.has(it.empCode));
    for (const it of sameFile) {
      const a = addedByCode.get(it.empCode);
      if (!it.endDate) {
        out.skip.push({ rowNo: it.rowNo, sheet: p.sheet, empCode: it.empCode, name: `${it.firstName} ${it.lastName}`.trim(), reason: 'ไม่มีวันพ้นสภาพ / อ่านวันที่ไม่ได้' });
        continue;
      }
      a.row = { ...a.row, status: 'INACTIVE', endDate: it.endDate, lastWorkingDate: it.endDate, endReason: endReasonOf(it.note) };
      a.issues = [...a.issues, 'เข้าและออกในไฟล์เดียวกัน — เพิ่มเป็นพนักงานที่พ้นสภาพแล้ว'];
    }
    const rest = { ...p, items: p.items.filter((it) => !addedByCode.has(it.empCode)) };
    const plan = planEmployeeImport(rest, employees, sites, opts);
    out.add.push(...plan.add.map((a) => ({ ...a, sheet: p.sheet })));
    out.update.push(...plan.update.map((u) => ({ ...u, sheet: p.sheet })));
    out.skip.push(...plan.skip.map((x) => ({ ...x, sheet: p.sheet })));
  }
  return out;
}

// ---------- Template Excel 2 ชีต ----------
const IN_HEAD = ['ลำดับ', 'รหัสพนักงาน', 'บริษัท', 'ชื่อพนักงาน', 'ชื่อตำแหน่ง', 'ชื่อหน่วยงาน', 'ฝ่าย', 'วันเริ่มงาน', 'วันเกิด', 'ระดับ', 'เลขบัตรประชาชน', 'ประเภทพนักงาน', 'หมายเหตุ'];
const OUT_HEAD = ['ลำดับ', 'รหัสพนักงาน', 'บริษัท', 'ชื่อพนักงาน', 'ชื่อตำแหน่ง', 'ชื่อหน่วยงาน', 'ฝ่าย', 'วันเข้างาน', 'วันพ้นสภาพ', 'วันเกิด', 'เลขบัตรประชาชน', 'ระดับ', 'ประเภทพนักงาน', 'หมายเหตุ'];

/** ชีตของ template — ชื่อชีต / หัวตาราง (แถว 2 ใต้ชื่อเรื่อง — แบบไฟล์ของ HR) / คอลัมน์วันที่ */
export const TEMPLATE_SHEETS = {
  IN: { name: 'เข้าใหม่', title: 'พนักงานเข้าใหม่', head: IN_HEAD, dates: ['วันเริ่มงาน', 'วันเกิด'] },
  OUT: { name: 'ลาออก', title: 'พนักงานลาออก / พ้นสภาพ', head: OUT_HEAD, dates: ['วันเข้างาน', 'วันพ้นสภาพ', 'วันเกิด'] },
};

/** หมายเหตุที่แนะนำในชีตลาออก (ระบบอ่านเหตุผลจากคำในหมายเหตุ — ดู endReasonOf) */
export const OUT_NOTE_HINTS = ['ลาออก', 'ลาออก (ผิดกฎ ขาดงานเกิน 3 วัน)', 'เลิกจ้าง', 'กระทำผิด', 'สิ้นสุดระยะการจ้าง'];

const fullNameOf = (e) => `${e.title ?? ''}${e.firstName} ${e.lastName}`.trim();
/** ชื่อหน่วยงานแบบไฟล์ HR — Pro Site เขียนเป็น "PRO/FM/<ชื่อ>" (นำเข้ากลับแล้วเดาประเภทได้) */
function unitName(e, site) {
  if (!site) return '';
  return e.employeeType === 'PRO_SITE' ? `PRO/FM/${site.name.replace(/^pro site\s*[—-]\s*/i, '')}` : site.name;
}

/**
 * พนักงานเข้า-ออกของเดือน (YYYY-MM) → แถวของ template (ค่าวันที่เป็น YYYY-MM-DD — ผู้เขียนไฟล์แปลงเป็นวันที่ Excel)
 * เข้าใหม่ = วันเริ่มงานอยู่ในเดือนนั้น · ลาออก = พ้นสภาพ และวันพ้นสภาพอยู่ในเดือนนั้น
 * @returns {{IN: any[][], OUT: any[][]}}
 */
export function monthlyTemplateRows(employees, sites, month) {
  const siteOf = new Map(sites.map((x) => [x.id, x]));
  const inMonth = (d) => !!d && d.slice(0, 7) === month;
  const byCode = (a, b) => a.empCode.localeCompare(b.empCode);
  const common = (e) => {
    const site = siteOf.get(e.siteId);
    return {
      code: e.empCode,
      company: e.companyCode,
      name: fullNameOf(e),
      position: e.position ?? '',
      unit: unitName(e, site),
      division: e.deptGroup ?? '',
      level: e.level ? `ระดับ ${e.level}` : '',
      nid: e.nationalId ?? '',
      type: EMPLOYEE_TYPE_LABEL[e.employeeType] ?? '',
    };
  };
  const IN = employees
    .filter((e) => inMonth(e.startDate))
    .sort(byCode)
    .map((e, i) => {
      const c = common(e);
      return [i + 1, c.code, c.company, c.name, c.position, c.unit, c.division, e.startDate, e.birthDate || null, c.level, c.nid, c.type, ''];
    });
  const OUT = employees
    .filter((e) => e.status === 'INACTIVE' && inMonth(e.endDate))
    .sort(byCode)
    .map((e, i) => {
      const c = common(e);
      return [i + 1, c.code, c.company, c.name, c.position, c.unit, c.division, e.startDate, e.endDate, e.birthDate || null, c.nid, c.level, c.type, END_REASON_LABEL[e.endReason] ?? ''];
    });
  return { IN, OUT };
}
