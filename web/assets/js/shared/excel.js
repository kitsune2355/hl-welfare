// เขียนไฟล์ Excel (.xlsx) จากโมเดลชีต (application/usecases/insurerExport.js → buildSheetModel)
// ใช้ ExcelJS (MIT) ที่ vendor ไว้ใน assets/vendor/exceljs/ — โหลดเมื่อกดส่งออกครั้งแรกเท่านั้น (~950KB)

const VENDOR = 'assets/vendor/exceljs/exceljs.min.js';
const FONT = 'Tahoma';
const BASE_SIZE = 10;
const THIN = { style: 'thin', color: { argb: 'FF7F7F7F' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

let loading = null;
function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = VENDOR;
    s.onload = () => resolve(window.ExcelJS);
    s.onerror = () => {
      loading = null;
      reject(new Error('โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ'));
    };
    document.head.append(s);
  });
  return loading;
}

/** รูปแบบเซลล์ตาม style ในโมเดล */
function styleOf(cell) {
  const font = { name: FONT, size: BASE_SIZE };
  const st = { font, alignment: { vertical: 'middle', wrapText: true } };
  switch (cell.s) {
    case 'title':
      Object.assign(font, { bold: true, size: 14 });
      st.alignment.horizontal = 'center';
      break;
    case 'subtitle':
      Object.assign(font, { bold: true, size: 12 });
      st.alignment.horizontal = 'center';
      break;
    case 'th':
    case 'sumTh':
      font.bold = true;
      st.alignment.horizontal = 'center';
      st.border = BORDER;
      st.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEFF3' } };
      break;
    case 'td':
    case 'sumTd':
      st.border = BORDER;
      break;
    case 'tdCenter':
      st.border = BORDER;
      st.alignment.horizontal = 'center';
      break;
    case 'tdNum':
      st.border = BORDER;
      st.alignment.horizontal = 'right';
      st.numFmt = '#,##0';
      break;
    case 'total':
      font.bold = true;
      st.alignment.wrapText = false;
      break;
    case 'note':
      st.alignment.wrapText = false;
      break;
    default:
      // ข้อความหัวเอกสาร: ใช้ align / bold / size ของบรรทัดนั้น
      st.alignment.wrapText = false;
  }
  if (cell.bold !== undefined) font.bold = cell.bold;
  if (cell.size) font.size = Math.round(cell.size * (BASE_SIZE / 11));
  if (cell.align) st.alignment.horizontal = cell.align;
  return st;
}

/** โมเดลชีต → Blob .xlsx */
export async function sheetModelToXlsx(model) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HL Welfare';
  wb.created = new Date();
  for (const sh of model.sheets) {
    const ws = wb.addWorksheet(sh.name, {
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
      views: [{ state: 'frozen', ySplit: sh.headerRows.length ? Math.max(...sh.headerRows) + 1 : 0, showGridLines: false }],
    });
    sh.widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    for (const c of sh.cells) {
      const cell = ws.getCell(c.r + 1, c.c + 1);
      cell.value = c.v === '' ? null : c.v;
      Object.assign(cell, styleOf(c));
    }
    // merge ก่อนแล้วตั้งเส้นขอบเซลล์ที่ถูก merge ให้ครบ (ExcelJS ใช้รูปแบบของเซลล์บนซ้าย)
    for (const [r1, c1, r2, c2] of sh.merges) ws.mergeCells(r1 + 1, c1 + 1, r2 + 1, c2 + 1);
    // ความสูงแถวหัวตาราง: ตามจำนวนบรรทัดของข้อความที่ยาวที่สุด
    for (const r of sh.headerRows) {
      const lines = Math.max(1, ...sh.cells.filter((c) => c.r === r).map((c) => String(c.v).split('\n').length));
      ws.getRow(r + 1).height = Math.max(18, lines * 14);
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** ดาวน์โหลด Blob เป็นไฟล์ */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
