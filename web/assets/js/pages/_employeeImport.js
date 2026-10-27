// Excel ในหน้าพนักงาน
//
//   ไฟล์ที่ระบบสร้าง = คอลัมน์และลำดับเดียวกับตารางพนักงาน (LIST_COLUMNS) ทั้งหมด — listWorkbook ตัวเดียว:
//     - ส่งออก (ปุ่ม Excel / Excel ที่เลือก) · template เปล่า · ส่งออกเข้า-ออกรายเดือน (ชีต "เข้าใหม่" + "ลาออก")
//     - ช่องเลือก บริษัท / ประเภท / สถานะ ฯลฯ · คำอธิบายที่หัวคอลัมน์ · รหัส/เลขบัตรเป็นข้อความ (เลข 0 นำหน้าไม่หาย) · อายุ = ดูอย่างเดียว
//   นำเข้า: ไฟล์ข้างบน (จับคู่ตามรหัส แก้/เพิ่ม) หรือไฟล์ "เข้าใหม่" / "ลาออก" แบบของ HR (อ่านหัวตารางเอง)
//
//   อ่านไฟล์ (.xlsx / .xls) → แยกข้อมูล (application/usecases/employeeImport.js) → กล่องสรุปก่อนนำเข้า
//   → ใส่ในตารางเป็นแถว "ยังไม่บันทึก" (เขียว = เพิ่ม · เหลือง = บันทึกพ้นสภาพ เห็นค่าเดิม) → HR ตรวจช่องแดงแล้วกดบันทึกเอง
//   ไม่บันทึกอะไรจนกว่า HR กด "บันทึก" ในตาราง (ExcelGrid.stage)
import { api } from '../app/api.js';
import { parseEmployeeSheet, planWorkbookImport } from '../application/usecases/employeeImport.js';
import { employeeListRows, isListHeader, LIST_COLUMNS, monthlyMovers, parseEmployeeList, planEmployeeList, TEMPLATE_COLUMNS } from '../application/usecases/employeeList.js';
import { COMPANY_CODES, THAI_MONTHS_FULL } from '../domain/labels.js';
import { html, raw } from '../shared/dom.js';
import { downloadBlob, loadExcelJs, loadSheetJs, XLSX_MIME } from '../shared/excel.js';
import { thaiDate } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { END_REASON_LABEL } from '../shared/labels.js';
import { alertBox, badge } from '../ui/components.js';
import { loader, spinner } from '../ui/loading.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';

/** ปุ่มในแถบเครื่องมือของตาราง */
export const importButton = () =>
  html`<button type="button" class="btn btn-sm" data-import-excel title="นำเข้า: ไฟล์รายชื่อพนักงานที่ส่งออกจากตารางนี้ (แก้แล้วนำเข้ากลับ) · ไฟล์เข้าใหม่ / ลาออกของ HR · template">${raw(icon('upload'))} นำเข้า Excel</button>
    <button type="button" class="btn btn-sm" data-template-excel title="ดาวน์โหลด template 2 ชีต (เข้าใหม่ + ลาออก) หรือส่งออกเข้า-ออกประจำเดือน">${raw(icon('file-spreadsheet'))} Template / ส่งออกรายเดือน</button>`;

/** เลือกไฟล์ (ใช้ input ชั่วคราว — ตารางวาดใหม่บ่อย) */
export function pickExcelFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/**
 * อ่านไฟล์ → ทุกชีตที่เป็นรายชื่อ (มีหัวตารางและมีแถวข้อมูล) · ชีตว่าง / ชีตคำอธิบาย ถูกข้าม
 *   LIST = ไฟล์รายชื่อพนักงานที่ส่งออกจากตาราง (หัว รหัส / ชื่อ / นามสกุล / สถานะ)
 *   IN / OUT = ไฟล์เข้าใหม่ / ลาออกของ HR หรือ template 2 ชีต
 * @returns {Promise<{kind: 'IN'|'OUT'|'LIST', items: object[], sheet: string}[]>}
 */
async function readSheets(file) {
  const XLSX = await loadSheetJs();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const found = [];
  let firstError = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const p = rows.slice(0, 15).some(isListHeader) ? parseEmployeeList(rows) : parseEmployeeSheet(rows);
    if (p.error) firstError ??= `ชีต "${name}": ${p.error}`;
    else if (p.items.length) found.push({ ...p, sheet: name });
  }
  if (!found.length) throw new Error(firstError ?? 'ไม่พบรายชื่อในไฟล์ (ใต้หัวตารางไม่มีแถวที่มีรหัสพนักงาน)');
  return found;
}

const KIND_LABEL = { IN: 'พนักงานเข้าใหม่', OUT: 'พนักงานลาออก', LIST: 'รายชื่อพนักงาน' };

/** แผนรวม: ชีตเข้าใหม่/ลาออก (planWorkbookImport) + ชีตรายชื่อพนักงาน (planEmployeeList — แก้ทุกช่อง) */
function planAll(parsed, employees, sites, opts) {
  const hr = parsed.filter((p) => p.kind !== 'LIST');
  const plan = hr.length ? planWorkbookImport(hr, employees, sites, opts) : { kinds: [], add: [], update: [], skip: [] };
  plan.unchanged = 0;
  for (const p of parsed.filter((x) => x.kind === 'LIST')) {
    const l = planEmployeeList(p, employees, sites, { deptGroups: opts.deptGroups ?? [] });
    plan.kinds.push({ kind: 'LIST', sheet: p.sheet, count: p.items.length });
    plan.add.push(...l.add.map((a) => ({ ...a, sheet: p.sheet })));
    plan.update.push(...l.update.map((u) => ({ ...u, sheet: p.sheet })));
    plan.skip.push(...l.skip.map((x) => ({ ...x, sheet: p.sheet })));
    plan.unchanged += l.unchanged;
  }
  return plan;
}

function summaryHtml(plan, file, addMissing, missingCount) {
  const multi = plan.kinds.length > 1;
  const where = (r) => (multi ? `${r.sheet} · ${r.rowNo}` : r.rowNo);
  const rows = [
    ...plan.add.map((a) => ({ ...a, act: a.row.status === 'INACTIVE' ? 'addOut' : 'add', code: a.row.empCode, name: `${a.row.firstName} ${a.row.lastName}`, row: a.row })),
    ...plan.update.map((u) => ({ ...u, act: u.changes ? 'edit' : 'out', code: u.row.empCode, name: `${u.row.firstName} ${u.row.lastName}`, row: u.row })),
  ];
  const issueCount = rows.filter((r) => r.issues.length).length;
  const actBadge = (r) =>
    r.act === 'add'
      ? badge('เพิ่มใหม่', 'success')
      : r.act === 'addOut'
        ? badge('เพิ่ม (พ้นสภาพแล้ว)', 'neutral')
        : r.act === 'edit'
          ? badge(`แก้ไข ${r.changes.length} ช่อง`, 'warning')
          : badge(`พ้นสภาพ ${thaiDate(r.row.endDate)}`, 'warning');
  return html`<div class="imp-sum">
      <span class="imp-file">${raw(icon('file-spreadsheet'))} <b>${file.name}</b> · ${plan.kinds.map((k) => `${KIND_LABEL[k.kind]}${multi ? ` (ชีต "${k.sheet}")` : ''} ${k.count} แถว`).join(' · ')}</span>
      <span class="chg-tag add">เพิ่ม ${plan.add.length}</span>
      ${plan.kinds.some((k) => k.kind === 'OUT') ? html`<span class="chg-tag edit">บันทึกพ้นสภาพ ${plan.update.filter((u) => !u.changes).length}</span>` : ''}
      ${plan.kinds.some((k) => k.kind === 'LIST') ? html`<span class="chg-tag edit">แก้ไข ${plan.update.filter((u) => u.changes).length}</span>` : ''}
      ${plan.unchanged ? html`<span class="imp-skip-tag">เหมือนเดิม ${plan.unchanged}</span>` : ''}
      ${plan.skip.length ? html`<span class="imp-skip-tag">ข้าม ${plan.skip.length}</span>` : ''}
    </div>
    ${missingCount
      ? html`<label class="imp-missing">
          <input type="checkbox" data-add-missing ${addMissing ? 'checked' : ''} />
          <span><b>เพิ่มคนที่ยังไม่มีในระบบ (${missingCount} คน) เป็นพนักงานที่พ้นสภาพ</b>
            <small>ใช้เมื่อพนักงานเหล่านี้เคยอยู่ในประกันกลุ่ม/ชุดฟอร์มก่อนเริ่มใช้ระบบ และต้องแจ้งออก — ไม่ติ๊ก = ข้าม</small></span>
        </label>`
      : ''}
    ${issueCount
      ? alertBox({
          tone: 'warning',
          title: `${issueCount} แถวต้องตรวจในตารางก่อนบันทึก`,
          body: 'ช่องที่ระบบเดาไม่ได้จะเป็นสีแดง (เช่น หน่วยงาน กลุ่ม/ฝ่าย) — เลือกในตารางแล้วกด “บันทึก”',
        })
      : ''}
    <div class="imp-table table-wrap">
      <table class="table">
        <thead><tr><th class="num">${multi ? 'ชีต · แถว' : 'แถว'}</th><th>รหัส</th><th>ชื่อ</th><th>สิ่งที่จะทำ</th><th>ต้องตรวจ / เหตุผล</th></tr></thead>
        <tbody>
          ${rows.map(
            (r) => html`<tr>
              <td class="num muted">${where(r)}</td>
              <td class="num">${r.code}</td>
              <td>${r.name}</td>
              <td>${actBadge(r)}${r.act === 'edit' ? html` <span class="small muted">${r.changes.join(', ')}</span>` : r.act !== 'add' && r.row.endReason ? html` <span class="small muted">${END_REASON_LABEL[r.row.endReason]}</span>` : ''}</td>
              <td class="small">${r.issues.length ? html`<span class="imp-issue">${r.issues.join(' · ')}</span>` : html`<span class="muted">–</span>`}</td>
            </tr>`,
          )}
          ${plan.skip.map(
            (s) => html`<tr class="imp-skipped">
              <td class="num muted">${where(s)}</td>
              <td class="num">${s.empCode}</td>
              <td>${s.name}</td>
              <td>${badge('ข้าม', 'neutral')}</td>
              <td class="small muted">${s.reason}</td>
            </tr>`,
          )}
        </tbody>
      </table>
    </div>
    <p class="small muted imp-note">${raw(icon('info'))} ยังไม่บันทึก — รายการจะไปอยู่ในตารางเป็นแถว<b class="imp-g">สีเขียว</b> (เพิ่ม) / <b class="imp-y">สีเหลือง</b> (แก้ — ชี้ที่ช่องเพื่อดูค่าเดิม) ตรวจแล้วกด “บันทึก” ที่ตาราง</p>`;
}

/**
 * @param {File} file
 * @param {{sites: object[], prepareGrid: () => Promise<void>, stage: (o: {add: object[], edits: {key:number,row:object}[]}) => void}} ctx
 *   prepareGrid = ล้างตัวกรองแล้วโหลดพนักงานทั้งหมด (แถวที่จะแก้ต้องอยู่ในตาราง)
 */
export async function runEmployeeImport(file, ctx) {
  const m = openModal({
    size: 'lg',
    title: 'นำเข้าพนักงานจาก Excel',
    body: html`<div data-imp-body>${loader({ text: 'กำลังอ่านไฟล์' })}</div>`,
    footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" data-imp-ok disabled data-label="นำเข้าในตาราง">${raw(icon('upload'))} นำเข้าในตาราง</button>`,
  });
  const body = m.el.querySelector('[data-imp-body]');
  const ok = m.el.querySelector('[data-imp-ok]');
  let parsed;
  let employees;
  try {
    parsed = await readSheets(file);
    employees = await api.listEmployees({});
  } catch (e) {
    body.innerHTML = String(alertBox({ tone: 'danger', title: 'อ่านไฟล์ไม่ได้', body: errorMessage(e) }));
    return;
  }
  const missingCount = planAll(parsed, employees, ctx.sites, { deptGroups: ctx.deptGroups }).skip.filter((s) => s.reason === 'ไม่พบรหัสนี้ในระบบ').length;
  let addMissing = false;
  let plan;
  const draw = () => {
    plan = planAll(parsed, employees, ctx.sites, { addMissing, deptGroups: ctx.deptGroups });
    body.innerHTML = String(summaryHtml(plan, file, addMissing, missingCount));
    const n = plan.add.length + plan.update.length;
    ok.disabled = n === 0;
    ok.innerHTML = String(html`${raw(icon('upload'))} นำเข้าในตาราง (${n})`);
  };
  draw();
  body.addEventListener('change', (e) => {
    if (!e.target.matches('[data-add-missing]')) return;
    addMissing = e.target.checked;
    draw();
  });
  ok.onclick = async () => {
    m.busy(true, ok);
    try {
      if (plan.update.length) await ctx.prepareGrid();
      ctx.stage({ add: plan.add.map((a) => a.row), edits: plan.update.map((u) => ({ key: u.id, row: u.row })) });
      m.busy(false, ok);
      m.close();
      const issues = [...plan.add, ...plan.update].filter((x) => x.issues.length).length;
      toast.success(
        `นำเข้าในตารางแล้ว ${plan.add.length + plan.update.length} รายการ (ยังไม่บันทึก)${issues ? ` — ต้องตรวจ ${issues} แถว (ช่องสีแดง / หมายเหตุในกล่องสรุป)` : ''} แล้วกด “บันทึก”`,
      );
    } catch (e) {
      m.busy(false, ok);
      toast.error(errorMessage(e));
    }
  };
}

// ===================== ไฟล์ Excel พนักงาน — คอลัมน์ชุดเดียวกับตาราง (LIST_COLUMNS) =====================
// ส่งออก (ปุ่ม Excel) · template เปล่า · ส่งออกเข้า-ออกรายเดือน ใช้ listWorkbook ตัวเดียวกัน → นำเข้ากลับด้วย "นำเข้า Excel" ได้ทุกไฟล์
const EXTRA_ROWS = 200; // ช่องเลือก/รูปแบบเตรียมไว้ใต้ข้อมูล (แถวที่จะเพิ่มเอง)
const listRule = (values, strict = true) => ({
  type: 'list',
  allowBlank: true,
  formulae: [`"${values.join(',')}"`],
  showErrorMessage: strict,
  errorStyle: 'warning',
  error: 'เลือกจากรายการ',
});
const isoToDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
/** คำอธิบายที่หัวคอลัมน์ (ชี้ที่หัวใน Excel) — คอลัมน์ที่มี note ใน LIST_COLUMNS ใช้ค่านั้นก่อน */
const HEAD_NOTE = {
  empCode: 'ต้องไม่ซ้ำ — ใช้จับคู่พนักงานในระบบ (มีแล้ว = แก้ · ไม่มี = เพิ่มใหม่)',
  companyCode: () => COMPANY_CODES.join(' / '),
  siteId: 'ชื่อตามแท็บ "หน่วยงาน" ของบริษัทนั้น',
  employeeType: 'ว่าง = ระบบเลือกตามบริษัท',
  deptGroup: 'เฉพาะประเภทที่ใช้กลุ่ม/ฝ่าย (เช่น ส่วนกลาง)',
  level: 'ตัวเลข 1–9 (ประเภทที่ใช้ระดับ)',
  birthDate: 'วันที่ — พิมพ์ วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ. ก็ได้)',
  startDate: 'วันที่ — พิมพ์ วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ. ก็ได้)',
  probationPassDate: 'ว่าง = ระบบคำนวณจากวันเริ่มงาน',
  nationalId: '13 หลัก (ใส่ขีดได้)',
  status: 'พ้นสภาพ = ใส่เหตุผลและวันพ้นสภาพด้วย',
  endReason: () => Object.values(END_REASON_LABEL).join(' / '),
};
const HELP = [
  'ไฟล์รายชื่อพนักงาน — กรอก/แก้ในไฟล์นี้แล้วนำเข้าที่หน้าพนักงาน (ปุ่ม "นำเข้า Excel")',
  '',
  '• คอลัมน์และลำดับเดียวกับตารางพนักงานในระบบ (template เปล่ามีเฉพาะช่องที่ต้องกรอก)',
  '• จับคู่ตาม "รหัส": มีในระบบ = แก้เฉพาะช่องที่เปลี่ยน · ไม่มีในระบบ = เพิ่มพนักงานใหม่',
  '• ลบคอลัมน์ที่ไม่ต้องการแก้ออกได้ — คอลัมน์ที่ไม่มีในไฟล์ ระบบไม่แตะ',
  '• หน่วยงาน / ประเภท / กลุ่ม-ฝ่าย ใช้ชื่อตามระบบ · วันที่พิมพ์ วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ.)',
  '• อายุ (หัวสีเทา) ระบบคำนวณจากวันเกิด — แก้ช่องนี้ไม่มีผล',
  '• ไม่มีคอลัมน์ไหน = ระบบเติมให้: เพศ จากคำนำหน้า · ผ่านทดลองงาน = วันเริ่มงาน + 119 วัน · แถวใหม่ = ทำงานอยู่',
  '• ค่าที่ระบบอ่านไม่ได้จะคงค่าเดิมและแจ้งให้ตรวจ — ทุกอย่างเข้าตารางเป็น "ยังไม่บันทึก" ตรวจแล้วกดบันทึกเอง',
];

/**
 * สมุดงานรายชื่อพนักงาน — sheets = [{ name, employees, color? }] ชีตละตารางเดียว (หัวแถว 1) + ชีต "วิธีใช้"
 * columns = คอลัมน์ที่เขียน (ค่าเริ่มต้น = ทุกคอลัมน์ของตาราง · template เปล่า = TEMPLATE_COLUMNS)
 * วันที่เป็นเซลล์วันที่ (แสดงปี พ.ศ.) · รหัส/เลขบัตร/โทร เป็นข้อความ · ช่องเลือก บริษัท ประเภท สถานะ ฯลฯ · อายุ = หัวสีเทา (ระบบคำนวณ)
 */
async function listWorkbook(sheets, { sites, deptGroups = [], columns = LIST_COLUMNS }) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HL Welfare';
  const ctx = { sites, deptGroups };
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name, { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    const head = ws.addRow(columns.map((c) => c.head));
    head.height = 24;
    head.eachCell((cell, n) => {
      const c = columns[n - 1];
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.readOnly ? 'FF94A3B8' : sh.color ?? 'FF0E7490' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      const note = c.note ?? (typeof HEAD_NOTE[c.key] === 'function' ? HEAD_NOTE[c.key]() : HEAD_NOTE[c.key]);
      if (note) cell.note = note;
    });
    for (const r of employeeListRows(sh.employees, sites, undefined, columns)) {
      ws.addRow(r.map((v, i) => (columns[i].kind === 'date' && v ? isoToDate(v) : v)));
    }
    const last = sh.employees.length + 1 + EXTRA_ROWS;
    columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? 14;
      for (let r = 2; r <= last; r++) {
        if (c.kind === 'date') ws.getCell(r, i + 1).numFmt = '[$-th-TH]d/m/bbbb';
        if (c.kind === 'code') ws.getCell(r, i + 1).numFmt = '@';
      }
      const values = c.list?.(ctx);
      // ช่องเลือก — รายการยาว (เกิน 255 ตัวอักษร) ใส่ใน Excel ไม่ได้ ข้ามไป
      if (values?.length && values.join(',').length < 250) ws.dataValidations.add(`${col.letter}2:${col.letter}${last}`, listRule(values, false));
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
  const help = wb.addWorksheet('วิธีใช้');
  help.getColumn(1).width = 110;
  HELP.forEach((t, i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = t;
    if (i === 0) cell.font = { bold: true, size: 13 };
  });
  return wb.xlsx.writeBuffer();
}
const saveXlsx = (buf, name) => downloadBlob(new Blob([buf], { type: XLSX_MIME }), name);

const lastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
};

/** กล่อง Template / ส่งออกเข้า-ออกรายเดือน — คอลัมน์ชุดเดียวกับตารางพนักงาน */
export function openTemplateDialog({ sites, deptGroups = [] }) {
  const m = openModal({
    title: 'Template Excel พนักงาน',
    description: 'ลำดับคอลัมน์เดียวกับตารางพนักงาน — กรอก/แก้แล้วนำเข้าด้วยปุ่ม "นำเข้า Excel" ได้ทันที',
    body: html`<div class="tpl-opts">
      <section class="tpl-opt">
        <span class="tile-ic">${raw(icon('file-spreadsheet'))}</span>
        <div class="grow"><b>Template เปล่า</b><small>เฉพาะช่องที่ต้องกรอก (อายุ เพศ ผ่านทดลองงาน ระบบเติมให้) · มีช่องเลือกบริษัท ประเภท ฯลฯ และคำอธิบายที่หัวคอลัมน์</small></div>
        <button type="button" class="btn btn-sm" data-tpl-blank>${raw(icon('download'))} ดาวน์โหลด</button>
      </section>
      <section class="tpl-opt">
        <span class="tile-ic">${raw(icon('calendar-clock'))}</span>
        <div class="grow"><b>ส่งออกเข้า-ออกประจำเดือน</b><small>2 ชีต: เข้าใหม่ (วันเริ่มงานในเดือนนั้น) · ลาออก (วันพ้นสภาพในเดือนนั้น)</small>
          <label class="tpl-month">เดือน <input class="input" type="month" data-tpl-month value="${lastMonth()}" max="${new Date().toISOString().slice(0, 7)}" /></label>
        </div>
        <button type="button" class="btn btn-sm btn-primary" data-tpl-month-export>${raw(icon('download'))} ส่งออก</button>
      </section>
    </div>`,
    footer: html`<button class="btn btn-ghost" data-close>ปิด</button>`,
  });
  /** ปุ่มแสดงกำลังทำงานระหว่างสร้างไฟล์ (คืนไอคอน+ข้อความเดิมเมื่อเสร็จ) */
  const working = async (b, job) => {
    const before = b.innerHTML;
    b.disabled = true;
    b.innerHTML = `${spinner({ size: 'sm', onColor: b.classList.contains('btn-primary') })} กำลังสร้างไฟล์…`;
    try {
      await job();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      b.disabled = false;
      b.innerHTML = before;
    }
  };
  m.el.querySelector('[data-tpl-blank]').onclick = (e) =>
    working(e.currentTarget, async () => {
      saveXlsx(await listWorkbook([{ name: 'พนักงาน', employees: [] }], { sites, deptGroups, columns: TEMPLATE_COLUMNS }), 'template พนักงาน.xlsx');
      toast.success('ดาวน์โหลด template แล้ว');
    });
  m.el.querySelector('[data-tpl-month-export]').onclick = async (e) => {
    const b = e.currentTarget;
    const ym = m.el.querySelector('[data-tpl-month]').value;
    if (!/^\d{4}-\d{2}$/.test(ym)) return toast.error('เลือกเดือนก่อน');
    return working(b, async () => {
      const mv = monthlyMovers(await api.listEmployees({}), ym);
      const sheets = [
        { name: 'เข้าใหม่', employees: mv.IN },
        { name: 'ลาออก', employees: mv.OUT, color: 'FFB45309' },
      ];
      saveXlsx(await listWorkbook(sheets, { sites, deptGroups }), `เข้า-ออก เดือน${monthLabel(ym)}.xlsx`);
      toast.success(`ส่งออกเดือน${monthLabel(ym)} แล้ว — เข้าใหม่ ${mv.IN.length} · ลาออก ${mv.OUT.length} คน`);
    });
  };
}

/** ส่งออกพนักงาน (ปุ่ม Excel ของตาราง / Excel ที่เลือก) — นำเข้ากลับได้ */
export async function exportEmployeeList(employees, { sites, deptGroups = [], name = 'รายชื่อพนักงาน' }) {
  saveXlsx(await listWorkbook([{ name: 'พนักงาน', employees }], { sites, deptGroups }), `${name} ${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast.success(`ส่งออกแล้ว ${employees.length.toLocaleString('th-TH')} คน — แก้แล้วนำเข้ากลับได้ที่ปุ่ม “นำเข้า Excel”`);
}
