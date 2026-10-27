// ไฟล์รายชื่อพนักงาน — ส่งออกจากตาราง (ปุ่ม Excel / Excel ที่เลือก) → แก้ใน Excel → นำเข้ากลับ (ไม่เรียกเครือข่าย ทดสอบได้)
//
//   คอลัมน์ชุดเดียวกับตารางพนักงาน (LIST_COLUMNS) — หัวตารางแถว 1 · วันที่เป็นเซลล์วันที่ · รหัส/เลขบัตร/โทร เป็นข้อความ
//   นำเข้า: จับคู่ตาม "รหัส"
//     มีในระบบ   = แก้เฉพาะช่องที่ต่างจากเดิม (แถวสีเหลือง · ชี้ดูค่าเดิม) · เหมือนเดิมทุกช่อง = ไม่ทำอะไร
//     ไม่มีในระบบ = เพิ่มแถวใหม่ (สีเขียว)
//     ค่าที่อ่านไม่ได้ (บริษัท/หน่วยงาน/ประเภท/วันที่ ไม่รู้จัก) = คงค่าเดิม + แจ้งให้ตรวจ · คอลัมน์ที่ไม่มีในไฟล์ = ไม่แตะ
//   ทุกอย่างเข้าตารางเป็น "ยังไม่บันทึก" — HR ตรวจแล้วกดบันทึกเอง
import { COMPANY_CODES, EMPLOYEE_TYPE_LABEL, END_REASON_LABEL, GENDER_LABEL, STATUS_LABEL, TITLES } from '../../domain/labels.js';
import { ageOf, probationDueDate } from '../../domain/employee.js';
import { todayISO } from '../../domain/date.js';
import { defaultTypeFor, typeAllows } from '../../domain/catalog.js';
import { normalizeEmployee } from '../employeeRules.js';
import { matchDeptGroup, matchSite, toIsoDate } from './employeeImport.js';

const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const byLabel = (map, v) => {
  const s = norm(v);
  if (!s) return null;
  return Object.keys(map).find((k) => k === s || map[k] === s) ?? undefined; // undefined = อ่านไม่ได้
};

/**
 * คอลัมน์ของไฟล์ — ลำดับเดียวกับตารางพนักงาน (pages/employees.js) · ใช้ทั้งส่งออก / template / ส่งออกเข้า-ออกรายเดือน
 * key = ฟิลด์ของพนักงาน · kind: text | date | code (ข้อความที่เป็นตัวเลข) | number
 * out(e, ctx) = ค่าที่เขียนลงไฟล์ · in(v, ctx, row) = ค่าที่อ่านกลับ (undefined = อ่านไม่ได้ → คงค่าเดิม + แจ้ง)
 * readOnly = ค่าที่ระบบคำนวณ (อายุ) — เขียนลงไฟล์ให้ดู แต่นำเข้าไม่อ่าน · note = คำอธิบายที่หัวคอลัมน์
 * template: false = ไม่อยู่ใน template เปล่า (ระบบคำนวณ/เติมเอง หรือเป็นเรื่องพ้นสภาพ — ดู TEMPLATE_COLUMNS)
 */
export const LIST_COLUMNS = [
  { key: 'empCode', head: 'รหัส', kind: 'code', width: 12, out: (e) => e.empCode, in: (v) => norm(v) || undefined },
  { key: 'title', head: 'คำนำหน้า', width: 10, list: () => TITLES, out: (e) => e.title ?? '', in: (v) => (norm(v) ? (TITLES.includes(norm(v)) ? norm(v) : undefined) : null) },
  { key: 'firstName', head: 'ชื่อ', width: 16, out: (e) => e.firstName, in: (v) => norm(v) },
  { key: 'lastName', head: 'นามสกุล', width: 18, out: (e) => e.lastName, in: (v) => norm(v) },
  { key: 'gender', head: 'เพศ', width: 8, template: false, list: () => Object.values(GENDER_LABEL), out: (e) => GENDER_LABEL[e.gender] ?? '', in: (v) => byLabel(GENDER_LABEL, v) },
  { key: 'birthDate', head: 'วันเกิด', kind: 'date', width: 12, out: (e) => e.birthDate || null, in: (v) => (norm(v) ? toIsoDate(v) ?? undefined : '') },
  { key: 'age', head: 'อายุ', kind: 'number', width: 7, readOnly: true, template: false, note: 'ระบบคำนวณจากวันเกิด — แก้ช่องนี้ไม่มีผล', out: (e, ctx) => ageOf(e.birthDate, ctx.today ?? todayISO()) },
  { key: 'companyCode', head: 'บริษัท', width: 9, list: () => COMPANY_CODES, out: (e) => e.companyCode, in: (v) => (COMPANY_CODES.includes(norm(v).toUpperCase()) ? norm(v).toUpperCase() : undefined) },
  {
    key: 'siteId',
    head: 'หน่วยงาน',
    width: 30,
    out: (e, ctx) => ctx.sites.find((s) => s.id === e.siteId)?.name ?? '',
    // ชื่อหน่วยงานในบริษัทของแถวนั้น (ตรงทั้งชื่อก่อน แล้วค่อยใกล้เคียง)
    in: (v, ctx, row) => {
      const name = norm(v);
      if (!name) return 0;
      const exact = ctx.sites.find((s) => s.companyCode === row.companyCode && norm(s.name) === name);
      return (exact ?? matchSite(name, row.companyCode, ctx.sites))?.id ?? undefined;
    },
  },
  { key: 'employeeType', head: 'ประเภท', width: 13, list: () => Object.values(EMPLOYEE_TYPE_LABEL), out: (e) => EMPLOYEE_TYPE_LABEL[e.employeeType] ?? e.employeeType, in: (v) => byLabel(EMPLOYEE_TYPE_LABEL, v) },
  {
    key: 'deptGroup',
    head: 'กลุ่ม / ฝ่าย',
    width: 22,
    list: (ctx) => ctx.deptGroups,
    out: (e) => e.deptGroup ?? '',
    in: (v, ctx) => (norm(v) ? (ctx.deptGroups.includes(norm(v)) ? norm(v) : matchDeptGroup(v, ctx.deptGroups) ?? undefined) : null),
  },
  { key: 'level', head: 'ระดับ', kind: 'number', width: 7, out: (e) => e.level ?? null, in: (v) => (norm(v) ? (/^\d+$/.test(norm(v).replace(/^ระดับ\s*/, '')) ? Number(norm(v).replace(/^ระดับ\s*/, '')) : undefined) : null) },
  { key: 'position', head: 'ตำแหน่ง', width: 20, out: (e) => e.position ?? '', in: (v) => norm(v) || null },
  { key: 'startDate', head: 'วันเริ่มงาน', kind: 'date', width: 12, out: (e) => e.startDate || null, in: (v) => (norm(v) ? toIsoDate(v) ?? undefined : '') },
  { key: 'probationPassDate', head: 'ผ่านทดลองงาน', kind: 'date', width: 13, template: false, out: (e) => e.probationPassDate || null, in: (v) => (norm(v) ? toIsoDate(v) ?? undefined : null) },
  { key: 'nationalId', head: 'เลขบัตรประชาชน', kind: 'code', width: 16, out: (e) => e.nationalId ?? '', in: (v) => norm(v).replace(/\D/g, '') || null },
  { key: 'phone', head: 'โทรศัพท์มือถือ', kind: 'code', width: 13, out: (e) => e.phone ?? '', in: (v) => norm(v).replace(/\D/g, '') || null },
  { key: 'email', head: 'อีเมล', width: 24, out: (e) => e.email ?? '', in: (v) => norm(v) || null },
  { key: 'status', head: 'สถานะ', width: 11, template: false, list: () => Object.values(STATUS_LABEL), out: (e) => STATUS_LABEL[e.status] ?? e.status, in: (v) => byLabel(STATUS_LABEL, v) ?? (norm(v) ? undefined : 'ACTIVE') },
  { key: 'endReason', head: 'เหตุผลพ้นสภาพ', width: 15, template: false, list: () => Object.values(END_REASON_LABEL), out: (e) => END_REASON_LABEL[e.endReason] ?? '', in: (v) => byLabel(END_REASON_LABEL, v) },
  { key: 'lastWorkingDate', head: 'ทำงานวันสุดท้าย', kind: 'date', width: 14, template: false, out: (e) => e.lastWorkingDate || null, in: (v) => (norm(v) ? toIsoDate(v) ?? undefined : null) },
  { key: 'endDate', head: 'วันพ้นสภาพ', kind: 'date', width: 12, template: false, out: (e) => e.endDate || null, in: (v) => (norm(v) ? toIsoDate(v) ?? undefined : null) },
];
const COL = Object.fromEntries(LIST_COLUMNS.map((c) => [c.key, c]));
/**
 * template เปล่า — เฉพาะช่องที่ต้องกรอก: ไม่มีค่าที่ระบบคำนวณ/เติมให้ (อายุ · เพศ จากคำนำหน้า · ผ่านทดลองงาน = วันเริ่มงาน + 119 วัน)
 * และกลุ่มพ้นสภาพ (แถวใหม่ = ทำงานอยู่ · บันทึกพ้นสภาพที่ตาราง หรือส่งออกเข้า-ออกรายเดือน)
 */
export const TEMPLATE_COLUMNS = LIST_COLUMNS.filter((c) => c.template !== false);
/**
 * template ชีต "ลาออก" — จับคู่ตามรหัส แล้วบันทึกพ้นสภาพ (ไม่มีคอลัมน์สถานะ: มีเหตุผล/วันพ้นสภาพ = พ้นสภาพ)
 * "ชื่อ - นามสกุล" ไว้ให้ HR ดูอ้างอิงเท่านั้น — หัวไม่ตรงคอลัมน์ไหนของระบบ นำเข้าจึงไม่อ่าน (ชื่อในระบบไม่ถูกแก้)
 */
export const LEAVE_COLUMNS = [
  COL.empCode,
  { key: 'refName', head: 'ชื่อ - นามสกุล', width: 26, readOnly: true, note: 'ไว้ดูอ้างอิง — ระบบจับคู่ตามรหัส ไม่อ่านช่องนี้', out: (e) => `${e.title ?? ''}${e.firstName} ${e.lastName}`.trim() },
  COL.endReason,
  COL.lastWorkingDate,
  COL.endDate,
];
/** คำนำหน้า → เพศ (ไม่ชัด เช่น ว่าที่ ร.ต. = ไม่เดา) */
const genderOfTitle = (t) => (t === 'นาย' ? 'M' : t === 'นาง' || t === 'นางสาว' ? 'F' : null);

/**
 * หัวตารางแถวนี้เป็นไฟล์รายชื่อพนักงานของระบบ — "รหัส" + ("ชื่อ" "นามสกุล" แยกกัน หรือ "เหตุผลพ้นสภาพ" ของชีตลาออก)
 * แยกจากไฟล์เข้าใหม่/ลาออกของ HR ("รหัสพนักงาน" · ชื่อรวม · เหตุผลอยู่ใน "หมายเหตุ")
 */
export const isListHeader = (row) => {
  const h = (row ?? []).map(norm);
  // ไฟล์ของ HR ใช้ "รหัสพนักงาน" + "ชื่อพนักงาน" (ชื่อรวม) — ไฟล์ของระบบแยก รหัส / ชื่อ / นามสกุล (template ไม่มีสถานะ)
  return h.includes('รหัส') && ((h.includes('ชื่อ') && h.includes('นามสกุล')) || h.includes('เหตุผลพ้นสภาพ'));
};

/** แถวของไฟล์ (ตามลำดับ LIST_COLUMNS · วันที่เป็น YYYY-MM-DD — ผู้เขียนไฟล์แปลงเป็นเซลล์วันที่) */
export function employeeListRows(employees, sites, today = todayISO(), columns = LIST_COLUMNS) {
  const ctx = { sites, today };
  return employees.map((e) => columns.map((c) => c.out(e, ctx)));
}

/**
 * @param {any[][]} rows  แถวจาก SheetJS (header: 1)
 * @returns {{kind: 'LIST', items: {rowNo:number, empCode:string, cells: Record<string, any>}[]} | {error: string}}
 */
export function parseEmployeeList(rows) {
  const h = rows.slice(0, 15).findIndex(isListHeader);
  if (h < 0) return { error: 'ไม่พบหัวตาราง "รหัส / ชื่อ / นามสกุล"' };
  const head = rows[h].map(norm);
  const idx = {};
  for (const c of LIST_COLUMNS) {
    if (c.readOnly) continue; // ค่าที่ระบบคำนวณ — ไม่อ่านกลับ
    const i = head.indexOf(c.head);
    if (i >= 0) idx[c.key] = i;
  }
  const items = [];
  rows.slice(h + 1).forEach((r, i) => {
    if (!r) return;
    const empCode = norm(r[idx.empCode]);
    if (!empCode) return;
    const cells = {};
    for (const k of Object.keys(idx)) cells[k] = r[idx[k]] ?? null;
    items.push({ rowNo: h + 2 + i, empCode, cells });
  });
  return { kind: 'LIST', items, columns: Object.keys(idx) };
}

/** ช่องที่ต่างจากเดิม (ใช้แสดงในกล่องสรุป) */
export function changedFields(a, b) {
  const same = (x, y) => (x ?? '') === (y ?? '') || String(x ?? '') === String(y ?? '');
  return LIST_COLUMNS.filter((c) => !c.readOnly && !same(a[c.key], b[c.key])).map((c) => c.head);
}

/**
 * @param {{items: object[], columns: string[]}} parsed
 * @param {object[]} employees  พนักงานทั้งหมดในระบบ
 * @param {object[]} sites
 * @param {{deptGroups?: string[]}} [opts]
 * @returns {{add: {rowNo, row, issues}[], update: {rowNo, id, row, issues, changes: string[]}[], skip: {rowNo, empCode, name, reason}[], unchanged: number}}
 */
export function planEmployeeList(parsed, employees, sites, { deptGroups = [] } = {}) {
  const ctx = { sites, deptGroups };
  const byCode = new Map(employees.map((e) => [e.empCode, e]));
  const seen = new Set();
  const out = { add: [], update: [], skip: [], unchanged: 0 };
  // ลำดับการอ่าน: บริษัทก่อนหน่วยงาน/ประเภท (หน่วยงานจับคู่ในบริษัทของแถว)
  const order = ['companyCode', ...parsed.columns.filter((k) => k !== 'companyCode' && k !== 'empCode')];
  for (const it of parsed.items) {
    const name = `${it.cells.firstName ?? ''} ${it.cells.lastName ?? ''}`.trim();
    if (seen.has(it.empCode)) {
      out.skip.push({ rowNo: it.rowNo, empCode: it.empCode, name, reason: 'รหัสซ้ำในไฟล์ — ใช้แถวแรก' });
      continue;
    }
    seen.add(it.empCode);
    const old = byCode.get(it.empCode) ?? null;
    if (!old && !parsed.columns.includes('companyCode')) {
      out.skip.push({ rowNo: it.rowNo, empCode: it.empCode, name, reason: 'ไม่พบรหัสนี้ในระบบ' });
      continue;
    }
    const row = old
      ? { ...old }
      : {
          id: 0, empCode: it.empCode, title: null, firstName: '', lastName: '', gender: null, birthDate: '', companyCode: COMPANY_CODES[0], siteId: 0,
          employeeType: null, contractType: 'REGULAR', deptGroup: null, level: null, position: null, startDate: '', probationPassDate: null,
          nationalId: null, phone: null, email: null, status: 'ACTIVE', endReason: null, lastWorkingDate: null, endDate: null,
        };
    const issues = [];
    let skip = null;
    for (const key of order) {
      const c = COL[key];
      const raw = it.cells[key];
      const v = c.in(raw, ctx, row);
      if (v === undefined) {
        if (key === 'companyCode' && !old) {
          skip = `ไม่รู้จักบริษัท "${norm(raw)}"`;
          break;
        }
        issues.push(`${c.head} "${norm(raw) || '–'}" อ่านไม่ได้ — ${old ? 'คงค่าเดิม' : 'เลือกในตาราง'}`);
        continue;
      }
      if (v === '' && (key === 'birthDate' || key === 'startDate')) {
        if (!old) issues.push(`ไม่มี${c.head}`);
        continue;
      }
      row[key] = v;
    }
    if (skip) {
      out.skip.push({ rowNo: it.rowNo, empCode: it.empCode, name, reason: skip });
      continue;
    }
    if (!row.employeeType || !typeAllows(row.employeeType, row.companyCode)) {
      if (row.employeeType) issues.push(`ประเภท ${EMPLOYEE_TYPE_LABEL[row.employeeType]} ใช้กับบริษัท ${row.companyCode} ไม่ได้ — เปลี่ยนเป็นประเภทแรกที่ใช้ได้`);
      row.employeeType = defaultTypeFor(row.companyCode);
    }
    if (!parsed.columns.includes('status') && (row.endReason || row.endDate)) row.status = 'INACTIVE'; // ชีตลาออกของ template
    if (!old && !row.probationPassDate && row.startDate) row.probationPassDate = probationDueDate(row.startDate);
    if (!row.gender) row.gender = genderOfTitle(row.title); // ไฟล์ไม่มีคอลัมน์เพศ (template) / เว้นว่าง
    if (row.status === 'ACTIVE') Object.assign(row, { endReason: null, endDate: null, lastWorkingDate: null });
    const next = normalizeEmployee(row, sites);
    if (old) {
      // เทียบกับค่าเดิมที่จัดแบบเดียวกัน — ค่าที่ระบบเติมเอง (เช่น วันผ่านทดลองงานที่ว่าง) ไม่นับว่า "แก้"
      const changes = changedFields(next, normalizeEmployee(old, sites));
      // ไม่มีช่องที่เปลี่ยน แต่มีค่าที่อ่านไม่ได้ = บอกในรายการข้าม (ไม่เงียบหาย)
      if (!changes.length && issues.length) out.skip.push({ rowNo: it.rowNo, empCode: it.empCode, name, reason: issues.join(' · ') });
      else if (!changes.length) out.unchanged++;
      else out.update.push({ rowNo: it.rowNo, id: old.id, row: next, issues, changes });
    } else out.add.push({ rowNo: it.rowNo, row: next, issues });
  }
  return out;
}

/**
 * พนักงานเข้า-ออกของเดือน (YYYY-MM) — ส่งออกเป็นไฟล์รายชื่อ 2 ชีต (คอลัมน์เดียวกับตาราง · นำเข้ากลับได้)
 * เข้าใหม่ = วันเริ่มงานอยู่ในเดือนนั้น · ลาออก = พ้นสภาพ และวันพ้นสภาพอยู่ในเดือนนั้น
 * @returns {{IN: Object[], OUT: Object[]}}
 */
export function monthlyMovers(employees, month) {
  const inMonth = (d) => !!d && d.slice(0, 7) === month;
  const byCode = (a, b) => a.empCode.localeCompare(b.empCode);
  return {
    IN: employees.filter((e) => inMonth(e.startDate)).sort(byCode),
    OUT: employees.filter((e) => e.status === 'INACTIVE' && inMonth(e.endDate)).sort(byCode),
  };
}
