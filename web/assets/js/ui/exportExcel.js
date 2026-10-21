// ส่งออกตารางเป็นไฟล์ Excel (.xlsx) — ใช้ร่วมกันทุกตาราง (DataTable / ExcelGrid)
//
//   exportTableExcel({ name, columns: [{ header, text(row) }], rows })
//     - ส่งออกทุกแถวตามตัวกรอง/การเรียงที่ใช้อยู่ (ทุกหน้า ไม่ใช่แค่หน้าที่เห็น)
//     - หัวตารางมีสีพื้น ตัวหนา · ตรึงแถวหัว · มีปุ่มกรอง (AutoFilter) · ความกว้างคอลัมน์ตามข้อความ
//     - ชื่อไฟล์ = ชื่อหน้า + วันที่ เช่น "พนักงาน 2026-10-19.xlsx"
import { html, raw } from '../shared/dom.js';
import { XLSX_MIME, downloadBlob, loadExcelJs } from '../shared/excel.js';
import { icon } from '../shared/icons.js';
import { busy } from './loading.js';
import { errorMessage, toast } from './overlay.js';

/** ปุ่ม "Excel" ในแถบเครื่องมือของตาราง */
export const exportButton = (disabled = false) =>
  html`<button type="button" class="btn btn-sm tbl-export" data-export-excel title="ส่งออกทุกแถวตามตัวกรองเป็นไฟล์ Excel" ${disabled ? 'disabled' : ''}>${raw(icon('file-spreadsheet'))}<span>Excel</span></button>`;

/** ชื่อหน้า (จาก <title> "ชื่อหน้า · HL Welfare") */
const pageName = () => (document.title.split('·')[0] || 'ตาราง').trim();
const today = () => new Date().toISOString().slice(0, 10);
/** ตัวเลขล้วนที่ไม่ใช่รหัส (ไม่ขึ้นต้นด้วย 0 และยาวไม่เกิน 12 หลัก) → เขียนเป็นตัวเลข */
const asValue = (t) => (/^-?(?:0|[1-9]\d{0,11})(?:\.\d+)?$/.test(t) ? Number(t) : t);

/**
 * @param {{name?: string, columns: {header: string, text: (row:any) => string}[], rows: any[]}} o
 */
export async function exportTableExcel({ name, columns, rows }) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HL Welfare';
  wb.created = new Date();
  const title = name || pageName();
  const ws = wb.addWorksheet(title.replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'Sheet1', { views: [{ state: 'frozen', ySplit: 1 }] });

  const header = ws.addRow(columns.map((c) => c.header));
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF0B5A70' } } };
  });
  const widths = columns.map((c) => c.header.length);
  for (const r of rows) {
    const values = columns.map((c, i) => {
      const t = String(c.text(r) ?? '').replace(/\s+/g, ' ').trim();
      widths[i] = Math.max(widths[i], t.length);
      return asValue(t);
    });
    ws.addRow(values);
  }
  ws.columns.forEach((col, i) => (col.width = Math.min(60, Math.max(8, Math.ceil(widths[i] * 1.15) + 2))));
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: XLSX_MIME }), `${title} ${today()}.xlsx`);
  toast.success(`ส่งออก Excel แล้ว — ${rows.length.toLocaleString('th-TH')} แถว`);
}

/** ผูกปุ่ม Excel ในกล่องของตาราง: getData() คืน { columns, rows } ตอนกด */
export function wireExport(root, getData) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-export-excel]');
    if (!btn || !root.contains(btn)) return;
    e.stopPropagation();
    busy(btn, () => exportTableExcel(getData()), { label: 'Excel' }).catch((err) => toast.error(errorMessage(err)));
  });
}
