// แบบฟอร์ม Excel ของบริษัทประกัน: อ่านไฟล์ที่อัปโหลด → เดาตำแหน่ง → เก็บแบบฟอร์ม (ล้างข้อมูลบุคคล) → เติมข้อมูลตอนส่งออก
//
//   readTemplateFile(file)              อ่าน .xlsx / .xls → { buffer(xlsx), converted, sheets:[{name, grid}] }
//   analyzeTemplate(sheets)             เดาชีตต้นแบบ/ชีตสรุป + layout ของแต่ละชีต (application/usecases/templateDetect.js)
//   sanitizeTemplate(buffer, t)         เก็บเฉพาะชีตที่ใช้ · ล้างแถวข้อมูลตัวอย่าง + เซลล์ที่ระบบเติม (ไม่เก็บข้อมูลบุคคลในระบบ)
//   fillTemplate(buffer, data, opts)    สร้างไฟล์ส่งออก: ชีตสรุป + ชีตละบริษัท · คงรูปแบบเดิมทั้งหมด · ส่วนท้ายเลื่อนตามจำนวนคน
//   templateBuffer(template)            ไฟล์แบบฟอร์มที่เก็บไว้ (base64 ในข้อมูล หรือ url ของไฟล์ตั้งต้น)
//
// ทำงานได้ทั้งในเบราว์เซอร์ และใน Node (ทดสอบ — ส่ง ExcelJS เข้ามาด้วย useExcelLibs)
import { cellValue, formatFormDate, thaiMonthYear } from '../application/usecases/insurerExport.js';
import { addr, detectLayout, guessSheets, parseAddr } from '../application/usecases/templateDetect.js';
import { fillPlaceholders } from '../domain/insurerForm.js';
import { base64ToBuffer, loadExcelJs, loadSheetJs } from '../shared/excel.js';

// ---------- อ่านชีตเป็น grid (ข้อความ + merge + รูปแบบคร่าว ๆ สำหรับแสดงตัวอย่าง) ----------
const pad = (n) => String(n).padStart(2, '0');
function valueText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return `${v.getUTCDate()}/${v.getUTCMonth() + 1}/${v.getUTCFullYear()}`;
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((x) => x.text).join('');
    if ('result' in v || v.formula || v.sharedFormula) return valueText(v.result);
    if (v.text) return String(v.text);
    if (v.error) return String(v.error);
    return '';
  }
  return String(v);
}

function parseRange(s) {
  const [a, b = a] = s.split(':');
  const p = parseAddr(a);
  const q = parseAddr(b);
  return { top: p.r, left: p.c, bottom: q.r, right: q.c };
}

/**
 * แถว/คอลัมน์สุดท้ายที่ "มีข้อมูล" (หรือ merge) — ไฟล์ .xls บางไฟล์จัดรูปแบบไว้ถึงแถว 65,536
 * ถ้าใช้ rowCount ตรง ๆ จะช้าและไฟล์ที่เก็บใหญ่เกินจำเป็น
 */
function usedExtent(ws) {
  const merges = (ws.model.merges ?? []).map(parseRange);
  let rows = Math.max(1, ...merges.map((m) => m.bottom));
  let cols = Math.max(1, ...merges.map((m) => m.right));
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (valueText(cell.value).trim()) {
        rows = Math.max(rows, r);
        cols = Math.max(cols, c);
      }
    });
  });
  return { rows, cols, merges };
}

/** ExcelJS worksheet → grid (แถว/คอลัมน์เริ่มที่ 1) */
export function gridFromWorksheet(ws) {
  const { rows: nRows, cols: nCols, merges } = usedExtent(ws);
  const masterOf = (r, c) => merges.find((m) => r >= m.top && r <= m.bottom && c >= m.left && c <= m.right);
  const textCache = new Map();
  const text = (r, c) => {
    const k = `${r},${c}`;
    if (!textCache.has(k)) {
      const m = masterOf(r, c);
      textCache.set(k, valueText(ws.getCell(m ? m.top : r, m ? m.left : c).value));
    }
    return textCache.get(k);
  };
  const style = (r, c) => {
    const cell = ws.getCell(r, c);
    const b = cell.border ?? {};
    const fill = cell.fill?.fgColor?.argb;
    return {
      bold: !!cell.font?.bold,
      size: cell.font?.size,
      align: cell.alignment?.horizontal,
      wrap: !!cell.alignment?.wrapText,
      border: !!(b.top || b.bottom || b.left || b.right),
      fill: fill && fill !== 'FFFFFFFF' && cell.fill?.pattern === 'solid' ? `#${fill.slice(-6)}` : '',
    };
  };
  const widths = Array.from({ length: nCols }, (_, i) => ws.getColumn(i + 1).width ?? 9);
  const heights = Array.from({ length: nRows }, (_, i) => ws.getRow(i + 1).height ?? 0);
  return { name: ws.name, nRows, nCols, text, style, merges, widths, heights };
}

/** อ่านไฟล์ที่ผู้ใช้เลือก — .xls แปลงเป็น .xlsx ก่อน (รูปแบบเส้นขอบ/สีบางส่วนอาจหาย) */
export async function readTemplateFile(file) {
  const ExcelJS = await loadExcelJs();
  let buffer = await file.arrayBuffer();
  let converted = false;
  const isXls = /\.xls$/i.test(file.name) || new Uint8Array(buffer.slice(0, 4)).join(',') === '208,207,17,224';
  if (isXls) {
    const XLSX = await loadSheetJs();
    const wb = XLSX.read(buffer, { type: 'array', cellStyles: true, cellDates: false });
    buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
    converted = true;
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('เปิดไฟล์นี้ไม่ได้ — ต้องเป็นไฟล์ Excel (.xlsx หรือ .xls)');
  }
  const sheets = wb.worksheets.filter((ws) => ws.state !== 'hidden').map((ws) => ({ name: ws.name, grid: gridFromWorksheet(ws) }));
  if (!sheets.length) throw new Error('ไฟล์นี้ไม่มีชีต');
  return { buffer, converted, sheets };
}

/** เดาชีต + layout ให้ทั้งไฟล์ */
export function analyzeTemplate(sheets) {
  const g = guessSheets(sheets);
  const sheet = g.company ?? sheets[0].name;
  const company = detectLayout(sheets.find((s) => s.name === sheet).grid, 'company');
  const summary = g.summary ? detectLayout(sheets.find((s) => s.name === g.summary).grid, 'summary') : null;
  return { sheet, layout: company, summary: summary ? { sheet: g.summary, ...summary } : null };
}

// ---------- คัดลอกชีต (คงรูปแบบ) ----------
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
function plainValue(v) {
  if (v && typeof v === 'object' && !(v instanceof Date) && !v.richText) return 'result' in v || v.formula || v.sharedFormula ? (v.result ?? null) : v;
  return v;
}

/**
 * เขียนชีตใหม่จากชีตต้นแบบ
 * @param {{dataRow:number, footerRow:number}} layout
 * @param {{rows:number, fill:(ws, r:number, i:number)=>void, cells?:Record<string,any>, blank?:Set<string>, keepData?:boolean, decorate?:boolean, headerRow?:number, headerEnd?:number}} o
 *   rows = จำนวนแถวข้อมูลที่จะสร้าง (แทนแถวข้อมูลเดิมทั้งหมด) · keepData = คงแถวข้อมูลเดิมไว้ (ใช้ตอนล้างแบบฟอร์ม)
 */
function writeSheet(out, src, name, layout, o) {
  const ws = out.addWorksheet(name, {
    properties: clone(src.properties),
    pageSetup: { ...clone(src.pageSetup), printArea: undefined, printTitlesRow: undefined },
    headerFooter: clone(src.headerFooter),
    views: clone(src.views),
  });
  const used = usedExtent(src);
  const grid = { merges: used.merges };
  const nCols = used.cols;
  for (let c = 1; c <= nCols; c++) {
    const sc = src.getColumn(c);
    const dc = ws.getColumn(c);
    if (sc.width) dc.width = sc.width;
    if (sc.hidden) dc.hidden = true;
  }
  const { dataRow, footerRow } = layout;
  const span = footerRow - dataRow;
  const n = o.keepData ? span : o.rows;
  const delta = n - span;
  const isSlave = (r, c) => grid.merges.some((m) => r >= m.top && r <= m.bottom && c >= m.left && c <= m.right && (r !== m.top || c !== m.left));
  const copyRow = (sr, dr, values) => {
    const s = src.getRow(sr);
    const d = ws.getRow(dr);
    if (s.height) d.height = s.height;
    for (let c = 1; c <= nCols; c++) {
      const sc = s.getCell(c);
      const dc = d.getCell(c);
      dc.style = clone(sc.style) ?? {};
      if (values && !isSlave(sr, c) && sc.value !== null && sc.value !== undefined) dc.value = structuredClone(plainValue(sc.value)); // structuredClone คง Date ไว้ (JSON จะกลายเป็นข้อความ)
    }
  };
  for (let r = 1; r < dataRow; r++) copyRow(r, r, true);
  for (let i = 0; i < n; i++) {
    copyRow(o.keepData ? dataRow + i : dataRow, dataRow + i, !!o.keepData && false);
    o.fill?.(ws, dataRow + i, i);
  }
  for (let r = footerRow; r <= used.rows; r++) copyRow(r, r + delta, true);
  // merge: หัว/บนคงที่ · ส่วนท้ายเลื่อนตาม · ในพื้นที่ข้อมูลใช้ merge ของแถวต้นแบบซ้ำทุกแถว
  for (const m of grid.merges) {
    if (m.bottom < dataRow) ws.mergeCells(m.top, m.left, m.bottom, m.right);
    else if (m.top >= footerRow) ws.mergeCells(m.top + delta, m.left, m.bottom + delta, m.right);
    else if (m.top === dataRow && m.bottom === dataRow) for (let i = 0; i < n; i++) ws.mergeCells(dataRow + i, m.left, dataRow + i, m.right);
  }
  // เซลล์ที่ระบบเติม / ล้าง (ตำแหน่งในส่วนท้ายเลื่อนตาม)
  const at = (a) => {
    const p = parseAddr(a);
    return p ? ws.getCell(p.r >= footerRow ? p.r + delta : p.r, p.c) : null;
  };
  for (const a of o.blank ?? []) {
    const c = at(a);
    if (c) c.value = null;
  }
  for (const [a, v] of Object.entries(o.cells ?? {})) {
    const c = at(a);
    if (c) c.value = v === '' ? null : v;
  }
  if (o.decorate) decorate(ws, { ...layout, nCols, delta });
  return ws;
}

/** ไฟล์ที่แปลงจาก .xls มักไม่มีเส้นขอบ — ใส่ให้หัวตาราง + แถวข้อมูลต้นแบบ */
function decorate(ws, { headerRow, headerEnd, dataRow, nCols }) {
  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  for (let r = headerRow; r <= dataRow; r++) {
    for (let c = 1; c <= nCols; c++) {
      const cell = ws.getCell(r, c);
      cell.border = box;
      if (r <= headerEnd) {
        cell.font = { ...(cell.font ?? {}), bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }
    }
  }
}

/** แทนค่าตัวแปร — ผลลัพธ์เป็นตัวเลขล้วนเขียนเป็นตัวเลข */
function resolveCells(cells, vars) {
  const out = {};
  for (const [a, text] of Object.entries(cells ?? {})) {
    const v = fillPlaceholders(text, vars);
    out[a] = /^-?\d+$/.test(v.trim()) ? Number(v) : v;
  }
  return out;
}

// ---------- เก็บแบบฟอร์ม ----------
/**
 * ไฟล์แบบฟอร์มที่จะเก็บในระบบ: เฉพาะชีตต้นแบบ (+ ชีตสรุป) · ล้างแถวข้อมูลตัวอย่าง (ข้อมูลบุคคล) และเซลล์ที่ระบบเติม
 * @returns {Promise<ArrayBuffer>}
 */
export async function sanitizeTemplate(buffer, t, { converted = false } = {}) {
  const ExcelJS = await loadExcelJs();
  const src = new ExcelJS.Workbook();
  await src.xlsx.load(buffer);
  const out = new ExcelJS.Workbook();
  out.creator = 'HL Welfare';
  const one = (sheetName, layout) => {
    const ws = src.getWorksheet(sheetName);
    if (!ws) throw new Error(`ไม่พบชีต “${sheetName}” ในไฟล์`);
    // เหลือแถวข้อมูลต้นแบบ 1 แถว (ว่าง) — แถวตัวอย่างอื่นตัดทิ้ง
    writeSheet(out, ws, sheetName, layout, { rows: 1, blank: new Set(Object.keys(layout.cells ?? {})), decorate: converted });
  };
  if (t.summary) one(t.summary.sheet, t.summary);
  one(t.sheet, t);
  return out.xlsx.writeBuffer();
}

/** หลังล้าง: แถวข้อมูลเหลือ 1 แถว → ส่วนท้ายเลื่อนขึ้นมา (ตำแหน่งเซลล์ที่ระบบเติมในส่วนท้ายก็เลื่อนตาม) */
export function sanitizedLayout(layout) {
  if (!layout) return layout;
  const delta = 1 - (layout.footerRow - layout.dataRow);
  const cells = {};
  for (const [a, v] of Object.entries(layout.cells ?? {})) {
    const p = parseAddr(a);
    cells[p.r >= layout.footerRow ? addr(p.r + delta, p.c) : a] = v;
  }
  return { ...layout, footerRow: layout.dataRow + 1, cells };
}

/** ไฟล์แบบฟอร์มที่เก็บไว้ → ArrayBuffer */
export async function templateBuffer(template) {
  if (template?.data) return base64ToBuffer(template.data);
  if (template?.url) {
    const res = await fetch(template.url);
    if (!res.ok) throw new Error('โหลดไฟล์แบบฟอร์มไม่สำเร็จ');
    return res.arrayBuffer();
  }
  throw new Error('ยังไม่ได้อัปโหลดไฟล์แบบฟอร์มของบริษัทประกันนี้');
}

// ---------- สร้างไฟล์ส่งออก ----------
/** ชื่อไฟล์ที่ส่งออก */
export function exportFileName(form, cycleDate) {
  const vars = { insurer: form.shortName || form.name, cycleDate, month: thaiMonthYear(cycleDate) };
  return fillPlaceholders(form.fileName || 'แจ้งเข้า-ออก {insurer} {cycleDate}', vars)
    .replace(/[\\/?*:"<>|]/g, '-')
    .trim();
}

const summaryValue = (source, row, seq) => {
  const dash = (n) => (n ? n : '-');
  switch (source) {
    case 'seq': return seq;
    case 'companyName': return row.legalName || row.companyName;
    case 'companyCode': return row.companyCode;
    case 'in': return dash(row.in.length);
    case 'out': return dash(row.out.length);
    case 'change': return '-';
    case 'total': return row.in.length + row.out.length;
    default: return null;
  }
};

/**
 * เติมข้อมูลลงแบบฟอร์ม → ไฟล์ .xlsx (ArrayBuffer)
 * @param {ArrayBuffer} buffer   ไฟล์แบบฟอร์ม (templateBuffer)
 * @param {import('../domain/types.js').InsurerExport} data   จาก api.exportInsurance
 */
export async function fillTemplate(buffer, data, { exportDate }) {
  const ExcelJS = await loadExcelJs();
  const form = data.insurer;
  const t = form.template;
  const src = new ExcelJS.Workbook();
  await src.xlsx.load(buffer);
  const out = new ExcelJS.Workbook();
  out.creator = 'HL Welfare';
  out.created = new Date();
  const date = (d) => formatFormDate(d, form.dateFormat, form.dateEra);
  const base = {
    insurer: form.name,
    month: thaiMonthYear(data.cycleDate),
    cycleDate: date(data.cycleDate),
    exportDate: date(exportDate),
    signerName: form.signer?.name ?? '',
    signerDept: form.signer?.department ?? '',
    signerPhone: form.signer?.phone ?? '',
  };
  const companies = data.companies;
  const used = new Set();
  const sheetNameOf = (vars, fallback) => {
    let name = fillPlaceholders(form.sheetName || '{companyCode}', vars).replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || fallback;
    while (used.has(name)) name = `${name.slice(0, 28)}-${used.size}`;
    used.add(name);
    return name;
  };

  if (t.summary) {
    const ws = src.getWorksheet(t.summary.sheet);
    const sum = (k) => companies.reduce((a, c) => a + c[k].length, 0);
    const vars = { ...base, in: sum('in'), out: sum('out'), total: sum('in') + sum('out'), companyName: '', companyCode: '', policyNo: '' };
    writeSheet(out, ws, sheetNameOf({ ...vars, companyCode: ws.name }, ws.name), t.summary, {
      rows: companies.length,
      cells: resolveCells(t.summary.cells, vars),
      fill: (sheet, r, i) => {
        for (const col of t.summary.columns) {
          const v = summaryValue(col.source, companies[i], i + 1);
          if (v !== null) sheet.getCell(r, col.col).value = v;
        }
      },
    });
  }

  const tpl = src.getWorksheet(t.sheet);
  if (!tpl) throw new Error(`แบบฟอร์มไม่มีชีต “${t.sheet}”`);
  for (const company of companies) {
    const rows = [...company.in, ...company.out];
    if (!rows.length && !form.includeEmptySheets) continue;
    const vars = {
      ...base,
      companyCode: company.companyCode,
      companyName: company.companyName,
      policyNo: company.policyNo ?? '',
      in: company.in.length,
      out: company.out.length,
      total: rows.length,
    };
    writeSheet(out, tpl, sheetNameOf(vars, company.companyCode), t, {
      rows: rows.length,
      cells: resolveCells(t.cells, vars),
      fill: (sheet, r, i) => {
        for (const col of t.columns) {
          if (col.source === 'blank') continue;
          const v = cellValue(col, rows[i], i + 1, form, company, data.cycleDate);
          sheet.getCell(r, col.col).value = v === '' ? null : v;
        }
      },
    });
  }
  if (!out.worksheets.length) throw new Error('ไม่มีชีตให้สร้าง — ไม่มีบริษัทที่ผูกกับบริษัทประกันนี้');
  return out.xlsx.writeBuffer();
}

/** grid ของทุกชีตในไฟล์ (ใช้แสดงตัวอย่างไฟล์ที่สร้างแล้ว) */
export async function gridsOf(buffer) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => ({ name: ws.name, grid: gridFromWorksheet(ws) }));
}

export { addr, parseAddr, pad };
