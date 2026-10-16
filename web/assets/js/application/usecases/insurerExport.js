// ส่งออกไฟล์แจ้งเข้า-ออกประกันกลุ่ม ตามแบบฟอร์มของบริษัทประกัน (แทนปุ่ม "ส่งแจ้ง")
//
//   1) buildInsurerExport — ใครอยู่ในไฟล์รอบนี้ (ฝั่ง server ทำแบบเดียวกันในเฟส 2)
//   2) buildSheetModel    — จัดหน้าเป็นเซลล์/merge/ความกว้าง ตามแบบฟอร์ม (ไม่ผูกกับไลบรารี Excel)
//   3) exportCsvRows      — ตารางเดียวสำหรับ CSV
//
// การส่งออกแบบ "บันทึกว่าแจ้งแล้ว" = สร้าง batch ของรอบนั้น (insurerId) → รายการไม่ตกค้างไปรอบถัดไป
// ส่งออกรอบเดิมซ้ำ = แทนที่ batch เดิมของรอบ + บริษัทประกันนั้น
import { COLUMN_SOURCES, fillPlaceholders, requiredEmployeeFields } from '../../domain/insurerForm.js';
import { EMPLOYEE_TYPE_LABEL, GENDER_LABEL, THAI_MONTHS_FULL } from '../../domain/labels.js';
import { buildInsuranceCycle, sentIndex } from './insuranceCycle.js';

const directionOf = (t) => (t === 'IN' ? 'IN' : 'OUT');
const byCode = (a, b) => a.employee.empCode.localeCompare(b.employee.empCode);

/**
 * รายชื่อที่ต้องอยู่ในไฟล์ของบริษัทประกัน `insurer` รอบ `cycleDate`
 * = รายการที่ยังไม่ส่งออก (รวมที่ตกค้างจากรอบก่อน) + ที่ส่งออกให้บริษัทประกันนี้ในรอบนี้แล้ว (ส่งออกซ้ำได้)
 */
export function buildInsurerExport({ cycleDate, insurer, employees, sites, rules, batches, companies = [] }) {
  const sent = sentIndex(batches);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const companyName = new Map(companies.map((c) => [c.code, c.legalName ?? c.name]));
  const codes = new Set(insurer.companies.map((c) => c.companyCode));
  const rows = buildInsuranceCycle(cycleDate, employees, sites, rules, batches)
    .rows.filter((r) => codes.has(r.employee.companyCode))
    .filter((r) => {
      if (!r.submitted) return true;
      const b = sent[directionOf(r.type)].get(r.employee.id);
      return b?.cycleDate === cycleDate && (b.insurerId ?? insurer.id) === insurer.id;
    })
    .map((r) => ({ ...r, employee: { ...r.employee, siteName: siteById.get(r.employee.siteId)?.name ?? '' } }));

  const needs = requiredEmployeeFields(insurer);
  const missing = rows
    .filter((r) => r.type === 'IN') // ข้อมูลส่วนตัวใช้เฉพาะแถวเข้าใหม่
    .map((r) => ({ employee: r.employee, fields: needs.filter((f) => !r.employee[f]) }))
    .filter((m) => m.fields.length);

  return {
    cycleDate,
    insurer,
    companies: insurer.companies.map((c) => {
      const mine = rows.filter((r) => r.employee.companyCode === c.companyCode);
      return {
        ...c,
        companyName: c.holderName?.trim() || companyName.get(c.companyCode) || c.companyCode,
        in: mine.filter((r) => r.type === 'IN').sort(byCode),
        out: mine.filter((r) => r.type !== 'IN').sort(byCode),
      };
    }),
    missing,
    alreadyExported: rows.filter((r) => r.submitted).length,
  };
}

// ---------- จัดรูปแบบค่า ----------
/** วันที่ ISO → ข้อความตามแบบฟอร์ม เช่น 05/02/2569 */
export function formatFormDate(iso, format = 'DD/MM/YYYY', era = 'BE') {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const year = era === 'BE' ? y + 543 : y;
  const pad = (n) => String(n).padStart(2, '0');
  if (format === 'D/M/YYYY') return `${d}/${m}/${year}`;
  if (format === 'D/M/YY') return `${d}/${m}/${String(year).slice(-2)}`;
  return `${pad(d)}/${pad(m)}/${year}`;
}

/** "กุมภาพันธ์ 2569" */
export const thaiMonthYear = (iso) => `${THAI_MONTHS_FULL[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(0, 4)) + 543}`;

function cellValue(col, row, seq, form, company, cycleDate) {
  const e = row.employee;
  const date = (d) => formatFormDate(d, form.dateFormat, form.dateEra);
  const isIn = row.type === 'IN';
  if (col.only === 'IN' && !isIn) return '';
  if (col.only === 'OUT' && isIn) return '';
  switch (col.source) {
    case 'seq': return seq;
    case 'empCode': return e.empCode;
    case 'title': return e.title ?? '';
    case 'fullName': return `${e.firstName} ${e.lastName}`;
    case 'titleFullName': return `${e.title ?? ''}${e.firstName} ${e.lastName}`;
    case 'firstName': return e.firstName;
    case 'lastName': return e.lastName;
    case 'gender': return GENDER_LABEL[e.gender] ?? '';
    case 'birthDate': return date(e.birthDate);
    case 'nationalId': return String(e.nationalId ?? '').replace(/\D/g, '');
    case 'position': return e.position ?? e.deptGroup ?? EMPLOYEE_TYPE_LABEL[e.employeeType] ?? '';
    case 'phone': return e.phone ?? '';
    case 'email': return e.email ?? '';
    case 'salary': return e.salary ? Number(e.salary) : '';
    case 'startDate': return date(e.startDate);
    case 'companyCode': return e.companyCode;
    case 'siteName': return e.siteName ?? '';
    case 'plan': return isIn ? (company.plan ?? '') : '';
    case 'inMark': return isIn ? form.inMark : '';
    case 'outMark': return isIn ? '' : form.outMark;
    case 'effectiveDate': return date(row.effectiveDate);
    case 'inEffectiveDate': return isIn ? date(row.effectiveDate) : '';
    case 'outEffectiveDate': return isIn ? '' : date(row.effectiveDate);
    case 'cycleDate': return date(cycleDate);
    case 'reason': return row.reason ?? '';
    case 'text': return col.text ?? '';
    default: return '';
  }
}

const groupPath = (c) =>
  String(c.group ?? '')
    .split('>')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2);

/**
 * หัวตารางหลายชั้น: คอลัมน์ที่มีกลุ่มเดียวกันติดกัน → merge แนวนอน · หัวคอลัมน์ยืดลงถึงแถวสุดท้าย → merge แนวตั้ง
 * @returns {{depth:number, cells:{r:number,c:number,v:string}[], merges:number[][]}} r/c เริ่มที่ 0
 */
export function headerLayout(columns) {
  const paths = columns.map(groupPath);
  const depth = Math.max(0, ...paths.map((p) => p.length)) + 1;
  const cells = [];
  const merges = [];
  for (let level = 0; level < depth - 1; level++) {
    let c = 0;
    while (c < columns.length) {
      const p = paths[c];
      if (p.length <= level) {
        c++;
        continue;
      }
      const key = p.slice(0, level + 1).join('>');
      let end = c;
      while (end + 1 < columns.length && paths[end + 1].slice(0, level + 1).join('>') === key && paths[end + 1].length > level) end++;
      cells.push({ r: level, c, v: p[level] });
      if (end > c) merges.push([level, c, level, end]);
      c = end + 1;
    }
  }
  columns.forEach((col, c) => {
    const top = paths[c].length;
    cells.push({ r: top, c, v: col.header });
    if (top < depth - 1) merges.push([top, c, depth - 1, c]);
  });
  return { depth, cells, merges };
}

/**
 * แปลงข้อมูลส่งออกเป็นโมเดลชีต (ไม่ขึ้นกับไลบรารี) — writer แปลงต่อเป็น .xlsx
 * style: title | subtitle | text | th | td | tdNum | total | note | sumTh | sumTd
 * @returns {{fileName:string, sheets:{name:string, widths:number[], cells:{r:number,c:number,v:any,s:string,align?:string,bold?:boolean,size?:number}[], merges:number[][], headerRows:number[]}[]}}
 */
export function buildSheetModel(data, { exportDate }) {
  const form = data.insurer;
  const date = (d) => formatFormDate(d, form.dateFormat, form.dateEra);
  const baseVars = {
    insurer: form.name,
    month: thaiMonthYear(data.cycleDate),
    cycleDate: date(data.cycleDate),
    exportDate: date(exportDate),
    signerName: form.signer?.name ?? '',
    signerDept: form.signer?.department ?? '',
    signerPhone: form.signer?.phone ?? '',
  };
  const ncol = form.columns.length;
  const sheets = [];
  const totals = data.companies.map((c) => ({ code: c.companyCode, name: c.companyName, in: c.in.length, out: c.out.length }));

  if (form.summarySheet) {
    const cells = [];
    const merges = [
      [0, 0, 0, 6],
      [1, 0, 1, 6],
    ];
    cells.push({ r: 0, c: 0, v: fillPlaceholders(form.summaryTitle, baseVars), s: 'title' });
    cells.push({ r: 1, c: 0, v: `ประจำเดือน ${baseVars.month}`, s: 'subtitle' });
    ['ลำดับ', 'สังกัดบริษัท', 'ตัวย่อ', 'แจ้งเข้าใหม่', 'แจ้งออก', 'โอนย้าย/เปลี่ยนแปลง', 'รวม'].forEach((v, c) => cells.push({ r: 3, c, v, s: 'sumTh' }));
    const dash = (n) => (n ? n : '-');
    totals.forEach((t, i) => {
      const r = 4 + i;
      [i + 1, t.name, t.code, dash(t.in), dash(t.out), '-', t.in + t.out].forEach((v, c) => cells.push({ r, c, v, s: c === 1 ? 'sumTd' : 'tdNum' }));
    });
    const r = 4 + totals.length;
    const sum = (k) => totals.reduce((a, t) => a + t[k], 0);
    merges.push([r, 0, r, 2]);
    ['รวม', '', '', sum('in'), sum('out'), 0, sum('in') + sum('out')].forEach((v, c) => cells.push({ r, c, v, s: 'total' }));
    sheets.push({ name: 'สรุป', widths: [7, 34, 8, 12, 11, 20, 10], cells, merges, headerRows: [3] });
  }

  for (const company of data.companies) {
    if (!form.includeEmptySheets && !company.in.length && !company.out.length) continue;
    const vars = {
      ...baseVars,
      companyCode: company.companyCode,
      companyName: company.companyName,
      policyNo: company.policyNo ?? '',
      in: company.in.length,
      out: company.out.length,
      total: company.in.length + company.out.length,
    };
    const cells = [];
    const merges = [];
    const full = (r) => merges.push([r, 0, r, Math.max(0, ncol - 1)]);
    let r = 0;
    for (const line of form.headerLines ?? []) {
      cells.push({ r, c: 0, v: fillPlaceholders(line.text, vars), s: 'text', align: line.align, bold: line.bold, size: line.size });
      full(r);
      r++;
    }
    r++; // เว้น 1 แถว
    const head = headerLayout(form.columns);
    const top = r;
    head.cells.forEach((h) => cells.push({ r: top + h.r, c: h.c, v: h.v, s: 'th' }));
    head.merges.forEach(([r1, c1, r2, c2]) => merges.push([top + r1, c1, top + r2, c2]));
    const headerRows = Array.from({ length: head.depth }, (_, i) => top + i);
    r = top + head.depth;
    // แถวสำหรับเซลล์หัวตารางที่ถูก merge (ให้มีเส้นขอบครบ)
    for (const hr of headerRows) for (let c = 0; c < ncol; c++) if (!cells.some((x) => x.r === hr && x.c === c)) cells.push({ r: hr, c, v: '', s: 'th' });
    let seq = 0;
    for (const row of [...company.in, ...company.out]) {
      seq++;
      form.columns.forEach((col, c) => {
        const v = cellValue(col, row, seq, form, company, data.cycleDate);
        cells.push({ r, c, v, s: typeof v === 'number' ? 'tdNum' : ['seq', 'inMark', 'outMark', 'plan', 'gender', 'companyCode'].includes(col.source) ? 'tdCenter' : 'td' });
      });
      r++;
    }
    r++;
    if (form.totalsLine?.trim()) {
      cells.push({ r, c: 0, v: fillPlaceholders(form.totalsLine, vars), s: 'total' });
      full(r);
      r += 2;
    }
    for (const line of form.footerLines ?? []) {
      cells.push({ r, c: 0, v: fillPlaceholders(line, vars), s: 'note' });
      full(r);
      r++;
    }
    const name = fillPlaceholders(form.sheetName || '{companyCode}', vars).replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || company.companyCode;
    sheets.push({ name, widths: form.columns.map((c) => c.width), cells, merges, headerRows });
  }

  const fileName = `${fillPlaceholders(form.fileName || '{insurer} {cycleDate}', { ...baseVars, insurer: form.shortName || form.name, cycleDate: data.cycleDate })}`
    .replace(/[\\/?*:"<>|]/g, '-')
    .trim();
  return { fileName, sheets };
}

/** CSV: ตารางเดียวทุกบริษัท (คอลัมน์แรก = บริษัท) — หัวคอลัมน์ที่อยู่ในกลุ่มต่อชื่อกลุ่มย่อยไว้ข้างหน้า */
export function exportCsvRows(data) {
  const form = data.insurer;
  const header = [
    'บริษัท',
    ...form.columns.map((c) => {
      const p = groupPath(c);
      return [p[p.length - 1], c.header].filter(Boolean).join(' - ').replace(/\s*\n\s*/g, ' ');
    }),
  ];
  const rows = [];
  for (const company of data.companies) {
    let seq = 0;
    for (const row of [...company.in, ...company.out]) {
      seq++;
      rows.push([company.companyCode, ...form.columns.map((col) => cellValue(col, row, seq, form, company, data.cycleDate))]);
    }
  }
  return { header, rows };
}

/** ป้ายของแหล่งข้อมูล (ใช้ในหน้าตั้งค่า) */
export const sourceLabel = (s) => COLUMN_SOURCES[s]?.label ?? s;
