// แบบฟอร์ม Excel ของบริษัทประกัน: อ่านไฟล์ที่อัปโหลด → เดาตำแหน่ง → เก็บแบบฟอร์ม (ล้างข้อมูลบุคคล) → เติมข้อมูลตอนส่งออก
//
//   readTemplateFile(file)              อ่าน .xlsx / .xls → { buffer(xlsx), converted, sheets:[{name, grid}] }
//   analyzeTemplate(sheets)             เดาชีตต้นแบบ/ชีตสรุป + layout ของแต่ละชีต (application/usecases/templateDetect.js)
//   sanitizeTemplate(buffer, t)         เก็บเฉพาะชีตที่ใช้ · ล้างแถวข้อมูลตัวอย่าง + เซลล์ที่ระบบเติม (ไม่เก็บข้อมูลบุคคลในระบบ)
//   fillTemplate(buffer, data, opts)    สร้างไฟล์ส่งออก: ชีตสรุป + ชีตละบริษัท · ส่วนท้ายเลื่อนตามจำนวนคน
//   ทั้งสองแก้ "ไฟล์ของบริษัทประกันตัวจริง" โดยตรง (xlsxDirect.js) — ไม่สร้างไฟล์ใหม่เลียนแบบ ส่วนอื่นของไฟล์คงเดิมทุกไบต์
//   ExcelJS ใช้อ่านไฟล์เพื่อหาตำแหน่ง/แสดงตัวอย่างเท่านั้น
//   templateBuffer(template)            ไฟล์แบบฟอร์มที่เก็บไว้ (base64 ในข้อมูล หรือ url ของไฟล์ตั้งต้น)
//
// ทำงานได้ทั้งในเบราว์เซอร์ และใน Node (ทดสอบ — ส่ง ExcelJS เข้ามาด้วย useExcelLibs)
import { cellValue, formatFormDate, thaiMonthYear } from '../application/usecases/insurerExport.js';
import { addr, detectLayout, guessSheets, parseAddr } from '../application/usecases/templateDetect.js';
import { fillPlaceholders } from '../domain/insurerForm.js';
import { base64ToBuffer, loadExcelJs, loadSheetJs } from '../shared/excel.js';
import { resolveColor, themePalette } from '../shared/xlColor.js';
import { fillXlsx, sanitizeXlsx } from './xlsxDirect.js';
import { partsOf } from './xlsxParts.js';

// เซลล์ที่ใช้ฟอนต์สัญลักษณ์ (Wingdings) → ✓/✗ ต้องเขียนเป็นตัวอักษรของฟอนต์นั้น ไม่งั้นจะแสดงเป็นสัญลักษณ์อื่น
const SYMBOL_FONTS = { 'wingdings 2': { '✓': 'P', '✗': 'O' }, wingdings: { '✓': 'ü', '✗': 'û' } };
const symbolGlyph = (fontName, v) => SYMBOL_FONTS[String(fontName ?? '').trim().toLowerCase()]?.[v] ?? v;

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

/** เซลล์ที่ "เห็นได้" แม้ไม่มีข้อความ — สีพื้น (ไม่ใช่ขาว) หรือเส้นขอบ */
function visibleStyle(cell) {
  const f = cell.fill;
  const filled = f?.type === 'pattern' && f.pattern && f.pattern !== 'none' && !(f.pattern === 'solid' && /FFFFFF$/i.test(f.fgColor?.argb ?? ''));
  const b = cell.border;
  return filled || !!(b && (b.top?.style || b.bottom?.style || b.left?.style || b.right?.style));
}

/**
 * แถว/คอลัมน์สุดท้ายที่ใช้จริง: มีข้อความ / merge / รูปภาพ — และเซลล์ว่างที่มีสีพื้นหรือเส้นขอบใกล้ ๆ ส่วนนั้น
 * (ไฟล์ .xls บางไฟล์จัดรูปแบบไว้ถึงแถว 65,536 ถ้าใช้ rowCount ตรง ๆ จะช้าและไฟล์ที่เก็บใหญ่เกินจำเป็น)
 */
function usedExtent(ws) {
  const merges = (ws.model.merges ?? []).map(parseRange);
  let rows = Math.max(1, ...merges.map((m) => m.bottom));
  let cols = Math.max(1, ...merges.map((m) => m.right));
  for (const img of ws.getImages?.() ?? []) {
    rows = Math.max(rows, Math.ceil((img.range?.br?.nativeRow ?? img.range?.tl?.nativeRow ?? 0) + 1));
    cols = Math.max(cols, Math.ceil((img.range?.br?.nativeCol ?? img.range?.tl?.nativeCol ?? 0) + 1));
  }
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (valueText(cell.value).trim()) {
        rows = Math.max(rows, r);
        cols = Math.max(cols, c);
      }
    });
  });
  // สี/เส้นขอบ: นับเฉพาะที่อยู่ไม่ไกลจากส่วนที่มีข้อความ
  const maxR = rows + 40;
  const maxC = cols + 20;
  let sr = rows;
  let sc = cols;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r > maxR) return;
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (c <= maxC && visibleStyle(cell)) {
        sr = Math.max(sr, r);
        sc = Math.max(sc, c);
      }
    });
  });
  return { rows: sr, cols: sc, merges };
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
  const palette = themePalette(ws.workbook?._themes?.theme1 ?? ws._workbook?._themes?.theme1);
  const color = (c) => resolveColor(c, palette, grid.indexed);
  const edge = (e) => (e?.style ? { style: e.style, color: color(e.color) || '#000000' } : null);
  const style = (r, c) => {
    const cell = ws.getCell(r, c);
    const b = cell.border ?? {};
    const f = cell.fill;
    const font = cell.font ?? {};
    const fill = f?.type === 'pattern' && f.pattern && f.pattern !== 'none' ? color(f.pattern === 'solid' ? f.fgColor : (f.bgColor ?? f.fgColor)) : '';
    return {
      bold: !!font.bold,
      italic: !!font.italic,
      underline: !!font.underline,
      strike: !!font.strike,
      size: font.size,
      font: font.name ?? '',
      color: color(font.color),
      align: cell.alignment?.horizontal,
      valign: cell.alignment?.vertical,
      wrap: !!cell.alignment?.wrapText,
      border: !!(b.top?.style || b.bottom?.style || b.left?.style || b.right?.style),
      edges: { top: edge(b.top), right: edge(b.right), bottom: edge(b.bottom), left: edge(b.left) },
      fill,
    };
  };
  const widths = Array.from({ length: nCols }, (_, i) => ws.getColumn(i + 1).width ?? 9);
  // ความสูงแถว (pt) — แถวที่ไม่ได้กำหนดใช้ความสูงตั้งต้นของชีต
  const defaultHeight = ws.properties?.defaultRowHeight || 15;
  const heights = Array.from({ length: nRows }, (_, i) => ws.findRow(i + 1)?.height || defaultHeight);
  // แถวที่กำหนดความสูงเอง → ตัดข้อความที่เกิน (เหมือน Excel) · แถวอื่น Excel ปรับความสูงตามข้อความ
  const fixedRows = Array.from({ length: nRows }, (_, i) => !!ws.findRow(i + 1)?.height);
  const hiddenCols = Array.from({ length: nCols }, (_, i) => !!ws.getColumn(i + 1).hidden);
  const grid = { name: ws.name, nRows, nCols, text, style, merges, widths, heights, fixedRows, hiddenCols, drawings: [], indexed: null };
  return grid;
}

/** ไฟล์ .xls: นับรูปภาพ/กล่องข้อความในแต่ละชีต (แปลงในเบราว์เซอร์ไม่ได้ — แจ้งผู้ใช้) */
function xlsObjects(XLSX, buffer) {
  const found = { pictures: 0, textboxes: 0, shapes: 0 };
  try {
    const cfb = XLSX.CFB.read(new Uint8Array(buffer), { type: 'array' });
    const d = (XLSX.CFB.find(cfb, 'Workbook') ?? XLSX.CFB.find(cfb, 'Book'))?.content;
    if (!d) return found;
    const u16 = (i) => d[i] | (d[i + 1] << 8);
    for (let p = 0; p + 4 <= d.length; ) {
      const type = u16(p);
      const len = u16(p + 2);
      if (type === 0x5d && len >= 6) {
        const ot = u16(p + 8); // OBJ → ftCmo.ot
        if (ot === 8) found.pictures++;
        else if (ot === 6) found.textboxes++;
        else if ([1, 2, 3, 4, 9].includes(ot)) found.shapes++;
      }
      p += 4 + len;
    }
  } catch {
    /* อ่านไม่ได้ — ไม่แจ้ง */
  }
  return found;
}

/** .xls → .xlsx: SheetJS แปลงค่า/merge/ความกว้าง · สีพื้นเซลล์ (ไฮไลต์) ใส่กลับด้วย ExcelJS */
async function convertXls(buffer) {
  const XLSX = await loadSheetJs();
  const ExcelJS = await loadExcelJs();
  const book = XLSX.read(buffer, { type: 'array', cellStyles: true, cellDates: false });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(XLSX.write(book, { bookType: 'xlsx', type: 'array', cellStyles: true }));
  for (const ws of wb.worksheets) {
    const sh = book.Sheets[ws.name];
    if (!sh) continue;
    for (const [a, cell] of Object.entries(sh)) {
      const st = a[0] === '!' ? null : cell.s;
      const rgb = st?.fgColor?.rgb;
      if (st?.patternType === 'solid' && rgb && !/^F*$/i.test(rgb)) ws.getCell(a).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${rgb.slice(-6)}` } };
    }
  }
  return { buffer: await wb.xlsx.writeBuffer(), lost: xlsObjects(XLSX, buffer) };
}

/**
 * อ่านไฟล์ที่ผู้ใช้เลือก — .xls แปลงเป็น .xlsx ก่อน
 * @returns {Promise<{buffer:ArrayBuffer, converted:boolean, lost:{pictures:number,textboxes:number,shapes:number}|null, sheets:{name:string, grid:any}[]}>}
 *   lost = ของในไฟล์ .xls ที่แปลงไม่ได้ (รูปภาพ กล่องข้อความ) → แนะนำให้บันทึกเป็น .xlsx ใน Excel ก่อน
 */
export async function readTemplateFile(file) {
  const ExcelJS = await loadExcelJs();
  let buffer = await file.arrayBuffer();
  let converted = false;
  let lost = null;
  const isXls = /.xls$/i.test(file.name) || new Uint8Array(buffer.slice(0, 4)).join(',') === '208,207,17,224';
  if (isXls) {
    try {
      ({ buffer, lost } = await convertXls(buffer));
    } catch {
      throw new Error('เปิดไฟล์ .xls นี้ไม่ได้ — ลองเปิดใน Excel แล้วบันทึกเป็น .xlsx');
    }
    converted = true;
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('เปิดไฟล์นี้ไม่ได้ — ต้องเป็นไฟล์ Excel (.xlsx หรือ .xls)');
  }
  const sheets = await withParts(buffer, wb.worksheets.filter((ws) => ws.state !== 'hidden'));
  if (!sheets.length) throw new Error('ไฟล์นี้ไม่มีชีต');
  return { buffer, converted, lost, sheets };
}

/** เดาชีต + layout ให้ทั้งไฟล์ */
export function analyzeTemplate(sheets) {
  const g = guessSheets(sheets);
  const sheet = g.company ?? sheets[0].name;
  const company = detectLayout(sheets.find((s) => s.name === sheet).grid, 'company');
  const summary = g.summary ? detectLayout(sheets.find((s) => s.name === g.summary).grid, 'summary') : null;
  return { sheet, layout: company, summary: summary ? { sheet: g.summary, ...summary } : null };
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
  // ไฟล์ที่แปลงจาก .xls ไม่มีเส้นขอบ — ใส่ให้หัวตาราง/แถวข้อมูลก่อน (ไฟล์ .xlsx จริงไม่แตะรูปแบบเลย)
  if (converted) {
    const ExcelJS = await loadExcelJs();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    for (const [name, layout] of [[t.sheet, t], ...(t.summary ? [[t.summary.sheet, t.summary]] : [])]) {
      const ws = wb.getWorksheet(name);
      if (ws) decorate(ws, { ...layout, nCols: usedExtent(ws).cols });
    }
    buffer = await wb.xlsx.writeBuffer();
  }
  // เซลล์ที่ระบบเติม: เหลือเฉพาะป้าย (เช่น "เลขที่กรมธรรม์ : ชีวิตกลุ่ม") — ค่าเดิมในไฟล์ล้างออก
  const labels = (layout) => {
    const out = {};
    for (const [a, text] of Object.entries(layout.cells ?? {})) {
      const label = String(text).replace(/\{\w+\}/g, '').replace(/\s+$/, '');
      out[a] = /[ก-๙a-z]/i.test(label) ? label : '';
    }
    return out;
  };
  // แก้ไฟล์ต้นฉบับโดยตรง: เหลือชีตที่ใช้ · แถวข้อมูลตัวอย่างเหลือ 1 แถวว่าง (ส่วนอื่นของไฟล์คงเดิม)
  return sanitizeXlsx(buffer, [
    ...(t.summary ? [{ name: t.summary.sheet, layout: t.summary, cells: labels(t.summary) }] : []),
    { name: t.sheet, layout: t, cells: labels(t) },
  ]);
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
  const form = data.insurer;
  const t = form.template;
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

  let summary = null;
  if (t.summary) {
    const sum = (k) => companies.reduce((a, c) => a + c[k].length, 0);
    const vars = { ...base, in: sum('in'), out: sum('out'), total: sum('in') + sum('out'), companyName: '', companyCode: '', policyNo: '' };
    summary = {
      sheet: t.summary.sheet,
      name: sheetNameOf({ ...vars, companyCode: t.summary.sheet }, t.summary.sheet),
      layout: t.summary,
      n: Math.max(1, companies.length),
      cells: resolveCells(t.summary.cells, vars),
      rowValues: (i) =>
        companies[i] ? t.summary.columns.map((col) => [col.col, summaryValue(col.source, companies[i], i + 1)]).filter(([, v]) => v !== null) : [],
    };
  }

  const sheets = [];
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
    sheets.push({
      name: sheetNameOf(vars, company.companyCode),
      n: Math.max(1, rows.length), // ไม่มีรายการ = คงแถวว่าง 1 แถวไว้ (หน้าตาแบบฟอร์ม)
      cells: resolveCells(t.cells, vars),
      rowValues: (i) =>
        rows[i]
          ? t.columns.filter((col) => col.source !== 'blank').map((col) => [col.col, cellValue(col, rows[i], i + 1, form, company, data.cycleDate)])
          : [],
    });
  }
  // เติมลงไฟล์แบบฟอร์มตัวจริง (แก้ XML เฉพาะชีตที่เติม — ส่วนอื่นของไฟล์คงเดิม)
  return fillXlsx(buffer, { summary, template: { sheet: t.sheet, layout: t }, sheets, glyph: symbolGlyph });
}

/** grid ของทุกชีตในไฟล์ (ใช้แสดงตัวอย่างไฟล์ที่สร้างแล้ว) */
export async function gridsOf(buffer) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return withParts(buffer, wb.worksheets);
}

/** grid ของชีต + รูปภาพ/กล่องข้อความ + จานสีของไฟล์ (สำหรับแสดงตัวอย่าง) */
async function withParts(buffer, worksheets) {
  const parts = await partsOf(buffer).catch(() => ({ drawings: {}, indexed: null }));
  return worksheets.map((ws) => {
    const grid = gridFromWorksheet(ws);
    grid.drawings = parts.drawings[ws.name] ?? [];
    grid.indexed = parts.indexed;
    return { name: ws.name, grid };
  });
}

export { addr, parseAddr, pad };
