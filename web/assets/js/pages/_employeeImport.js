// นำเข้า Excel ในหน้าพนักงาน — ไฟล์ "เข้าใหม่" / "ลาออก" ประจำเดือนที่ HR ได้รับ หรือ template 2 ชีต (เข้าใหม่ + ลาออก)
//
//   Template / ส่งออกรายเดือน (openTemplateDialog): ไฟล์ Excel 2 ชีต หัวตารางชุดเดียวกับที่นำเข้า
//     - template เปล่า: ช่องเลือก บริษัท / ระดับ / ประเภท / หมายเหตุ · คำอธิบายที่หัวคอลัมน์ · รหัส/เลขบัตรเป็นข้อความ (เลข 0 นำหน้าไม่หาย)
//     - ส่งออกเข้า-ออกของเดือน: รูปแบบเดียวกัน → แก้แล้วนำเข้ากลับได้
//
//   อ่านไฟล์ (.xlsx / .xls) → แยกข้อมูล (application/usecases/employeeImport.js) → กล่องสรุปก่อนนำเข้า
//   → ใส่ในตารางเป็นแถว "ยังไม่บันทึก" (เขียว = เพิ่ม · เหลือง = บันทึกพ้นสภาพ เห็นค่าเดิม) → HR ตรวจช่องแดงแล้วกดบันทึกเอง
//   ไม่บันทึกอะไรจนกว่า HR กด "บันทึก" ในตาราง (ExcelGrid.stage)
import { api } from '../app/api.js';
import { monthlyTemplateRows, OUT_NOTE_HINTS, parseEmployeeSheet, planWorkbookImport, TEMPLATE_SHEETS } from '../application/usecases/employeeImport.js';
import { COMPANY_CODES, EMPLOYEE_TYPE_LABEL, THAI_MONTHS_FULL } from '../domain/labels.js';
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
  html`<button type="button" class="btn btn-sm" data-import-excel title="นำเข้ารายชื่อพนักงานเข้าใหม่ / ลาออก จากไฟล์ Excel ของ HR หรือ template">${raw(icon('upload'))} นำเข้า Excel</button>
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
 * อ่านไฟล์ → ทุกชีตที่เป็นรายชื่อ (มีหัว "รหัสพนักงาน" และมีแถวข้อมูล)
 * template มี 2 ชีต (เข้าใหม่ + ลาออก) · ไฟล์ HR มีชีตเดียว · ชีตว่างถูกข้าม
 * @returns {Promise<{kind: 'IN'|'OUT', items: object[], sheet: string}[]>}
 */
async function readSheets(file) {
  const XLSX = await loadSheetJs();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const found = [];
  let firstError = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const p = parseEmployeeSheet(rows);
    if (p.error) firstError ??= `ชีต "${name}": ${p.error}`;
    else if (p.items.length) found.push({ ...p, sheet: name });
  }
  if (!found.length) throw new Error(firstError ?? 'ไม่พบรายชื่อในไฟล์ (ใต้หัวตารางไม่มีแถวที่มีรหัสพนักงาน)');
  return found;
}

const KIND_LABEL = { IN: 'พนักงานเข้าใหม่', OUT: 'พนักงานลาออก' };

function summaryHtml(plan, file, addMissing, missingCount) {
  const multi = plan.kinds.length > 1;
  const where = (r) => (multi ? `${r.sheet} · ${r.rowNo}` : r.rowNo);
  const rows = [
    ...plan.add.map((a) => ({ ...a, act: a.row.status === 'INACTIVE' ? 'addOut' : 'add', code: a.row.empCode, name: `${a.row.firstName} ${a.row.lastName}`, row: a.row })),
    ...plan.update.map((u) => ({ ...u, act: 'out', code: u.row.empCode, name: `${u.row.firstName} ${u.row.lastName}`, row: u.row })),
  ];
  const issueCount = rows.filter((r) => r.issues.length).length;
  const actBadge = (r) =>
    r.act === 'add'
      ? badge('เพิ่มใหม่', 'success')
      : r.act === 'addOut'
        ? badge('เพิ่ม (พ้นสภาพแล้ว)', 'neutral')
        : badge(`พ้นสภาพ ${thaiDate(r.row.endDate)}`, 'warning');
  return html`<div class="imp-sum">
      <span class="imp-file">${raw(icon('file-spreadsheet'))} <b>${file.name}</b> · ${plan.kinds.map((k) => `${KIND_LABEL[k.kind]}${multi ? ` (ชีต "${k.sheet}")` : ''} ${k.count} แถว`).join(' · ')}</span>
      <span class="chg-tag add">เพิ่ม ${plan.add.length}</span>
      ${plan.kinds.some((k) => k.kind === 'OUT') ? html`<span class="chg-tag edit">บันทึกพ้นสภาพ ${plan.update.length}</span>` : ''}
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
              <td>${actBadge(r)}${r.act !== 'add' && r.row.endReason ? html` <span class="small muted">${END_REASON_LABEL[r.row.endReason]}</span>` : ''}</td>
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
  const missingCount = planWorkbookImport(parsed, employees, ctx.sites, { deptGroups: ctx.deptGroups }).skip.filter((s) => s.reason === 'ไม่พบรหัสนี้ในระบบ').length;
  let addMissing = false;
  let plan;
  const draw = () => {
    plan = planWorkbookImport(parsed, employees, ctx.sites, { addMissing, deptGroups: ctx.deptGroups });
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

// ===================== Template / ส่งออกรายเดือน =====================
const MAX_ROWS = 500; // ช่องเลือก/รูปแบบเตรียมไว้ถึงแถวนี้
const HEAD_NOTES = {
  รหัสพนักงาน: 'ต้องไม่ซ้ำ — ใช้จับคู่พนักงานในระบบ (ชีตลาออก)',
  บริษัท: 'HL / PRO / CNS / CIC / AS',
  ชื่อพนักงาน: 'คำนำหน้า+ชื่อ เว้นวรรค นามสกุล เช่น นายสมชาย ใจดี',
  ชื่อหน่วยงาน: 'ชื่อตามหน้า "หน่วยงาน" ในระบบ (Pro Site เขียน PRO/FM/ชื่อไซต์ ได้)',
  ฝ่าย: 'ส่วนกลาง: กลุ่ม/ฝ่ายตามระบบ เช่น Support Line, ฝ่ายขาย',
  วันเริ่มงาน: 'วันที่ — พิมพ์ วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ. ก็ได้)',
  วันเข้างาน: 'วันที่ — พิมพ์ วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ. ก็ได้)',
  วันพ้นสภาพ: 'วันที่พ้นสภาพ — พิมพ์ วว/ดด/ปปปป',
  วันเกิด: 'วันที่ — พิมพ์ วว/ดด/ปปปป',
  ระดับ: 'ส่วนกลาง: ระดับ 1–9',
  เลขบัตรประชาชน: '13 หลัก (ใส่ขีดได้)',
  ประเภทพนักงาน: 'ไม่บังคับ — ว่าง = ระบบเดาจากบริษัท/หน่วยงาน',
  หมายเหตุ: 'ชีตลาออก: เหตุผล เช่น ลาออก / ขาดงานเกิน 3 วัน / เลิกจ้าง / กระทำผิด',
};
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

/** สมุดงาน 2 ชีต (template) — rows = { IN, OUT } แถวข้อมูลตามหัวตาราง (ว่าง = template เปล่า) */
async function buildTemplate(rows, subtitle) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HL Welfare';
  for (const kind of ['IN', 'OUT']) {
    const def = TEMPLATE_SHEETS[kind];
    const ws = wb.addWorksheet(def.name, { views: [{ state: 'frozen', ySplit: 2 }] });
    const n = def.head.length;
    ws.addRow([`${def.title}${subtitle ? ` — ${subtitle}` : ''}`]);
    ws.mergeCells(1, 1, 1, n);
    const t = ws.getCell(1, 1);
    t.font = { bold: true, size: 14, color: { argb: 'FF0E7490' } };
    ws.getRow(1).height = 26;
    const head = ws.addRow(def.head);
    head.height = 24;
    head.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kind === 'IN' ? 'FF0E7490' : 'FFB45309' } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      const note = HEAD_NOTES[c.value];
      if (note) c.note = note;
    });
    for (const r of rows[kind] ?? []) {
      ws.addRow(r.map((v, i) => (def.dates.includes(def.head[i]) && v ? isoToDate(v) : v)));
    }
    def.head.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      col.width = { ลำดับ: 7, รหัสพนักงาน: 14, บริษัท: 9, ชื่อพนักงาน: 28, ชื่อตำแหน่ง: 22, ชื่อหน่วยงาน: 32, ฝ่าย: 22, ระดับ: 10, เลขบัตรประชาชน: 18, ประเภทพนักงาน: 15, หมายเหตุ: 30 }[h] ?? 14;
      const letter = col.letter;
      const range = `${letter}3:${letter}${MAX_ROWS}`;
      if (def.dates.includes(h)) {
        // แสดงปี พ.ศ. แบบไฟล์ของ HR (ค่าในเซลล์เป็นวันที่จริง)
        for (let r = 3; r <= Math.max(3 + (rows[kind]?.length ?? 0), 60); r++) ws.getCell(r, i + 1).numFmt = '[$-th-TH]d/m/bbbb';
      }
      if (h === 'รหัสพนักงาน' || h === 'เลขบัตรประชาชน') for (let r = 3; r <= 60 + (rows[kind]?.length ?? 0); r++) ws.getCell(r, i + 1).numFmt = '@';
      if (h === 'บริษัท') ws.dataValidations.add(range, listRule(COMPANY_CODES));
      if (h === 'ระดับ') ws.dataValidations.add(range, listRule(Array.from({ length: 9 }, (_, k) => `ระดับ ${k + 1}`), false));
      if (h === 'ประเภทพนักงาน') ws.dataValidations.add(range, listRule(Object.values(EMPLOYEE_TYPE_LABEL)));
      if (h === 'หมายเหตุ' && kind === 'OUT') ws.dataValidations.add(range, listRule(OUT_NOTE_HINTS, false));
    });
  }
  return wb.xlsx.writeBuffer();
}

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

/** กล่อง Template / ส่งออกรายเดือน */
export function openTemplateDialog({ sites }) {
  const m = openModal({
    title: 'Template Excel พนักงานเข้า-ออก',
    description: 'ไฟล์ 2 ชีต: "เข้าใหม่" และ "ลาออก" — หัวตารางชุดเดียวกับไฟล์ของ HR นำเข้าด้วยปุ่ม "นำเข้า Excel" ได้ทั้งไฟล์ในครั้งเดียว',
    body: html`<div class="tpl-opts">
      <section class="tpl-opt">
        <span class="tile-ic">${raw(icon('file-spreadsheet'))}</span>
        <div class="grow"><b>Template เปล่า</b><small>กรอกพนักงานเข้าใหม่ / ลาออกของเดือน แล้วนำเข้า · มีช่องเลือกบริษัท ระดับ ประเภท และคำอธิบายที่หัวคอลัมน์</small></div>
        <button type="button" class="btn btn-sm" data-tpl-blank>${raw(icon('download'))} ดาวน์โหลด</button>
      </section>
      <section class="tpl-opt">
        <span class="tile-ic">${raw(icon('calendar-clock'))}</span>
        <div class="grow"><b>ส่งออกเข้า-ออกประจำเดือน</b><small>เข้าใหม่ = วันเริ่มงานในเดือนนั้น · ลาออก = วันพ้นสภาพในเดือนนั้น — รูปแบบเดียวกับ template</small>
          <label class="tpl-month">เดือน <input class="input" type="month" data-tpl-month value="${lastMonth()}" max="${new Date().toISOString().slice(0, 7)}" /></label>
        </div>
        <button type="button" class="btn btn-sm btn-primary" data-tpl-month-export>${raw(icon('download'))} ส่งออก</button>
      </section>
    </div>`,
    footer: html`<button class="btn btn-ghost" data-close>ปิด</button>`,
  });
  const save = (buf, name) => downloadBlob(new Blob([buf], { type: XLSX_MIME }), name);
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
      save(await buildTemplate({ IN: [], OUT: [] }, ''), 'template พนักงานเข้า-ออก.xlsx');
      toast.success('ดาวน์โหลด template แล้ว');
    });
  m.el.querySelector('[data-tpl-month-export]').onclick = async (e) => {
    const b = e.currentTarget;
    const ym = m.el.querySelector('[data-tpl-month]').value;
    if (!/^\d{4}-\d{2}$/.test(ym)) return toast.error('เลือกเดือนก่อน');
    return working(b, async () => {
      const rows = monthlyTemplateRows(await api.listEmployees({}), sites, ym);
      save(await buildTemplate(rows, `เดือน${monthLabel(ym)}`), `เข้า-ออก เดือน${monthLabel(ym)}.xlsx`);
      toast.success(`ส่งออกเดือน${monthLabel(ym)} แล้ว — เข้าใหม่ ${rows.IN.length} · ลาออก ${rows.OUT.length} คน`);
    });
  };
}
