// นำเข้า Excel ในหน้าพนักงาน — ไฟล์ "เข้าใหม่" / "ลาออก" ประจำเดือนที่ HR ได้รับ
//
//   อ่านไฟล์ (.xlsx / .xls) → แยกข้อมูล (application/usecases/employeeImport.js) → กล่องสรุปก่อนนำเข้า
//   → ใส่ในตารางเป็นแถว "ยังไม่บันทึก" (เขียว = เพิ่ม · เหลือง = บันทึกพ้นสภาพ เห็นค่าเดิม) → HR ตรวจช่องแดงแล้วกดบันทึกเอง
//   ไม่บันทึกอะไรจนกว่า HR กด "บันทึก" ในตาราง (ExcelGrid.stage)
import { api } from '../app/api.js';
import { parseEmployeeSheet, planEmployeeImport } from '../application/usecases/employeeImport.js';
import { html, raw } from '../shared/dom.js';
import { loadSheetJs } from '../shared/excel.js';
import { thaiDate } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { END_REASON_LABEL } from '../shared/labels.js';
import { alertBox, badge } from '../ui/components.js';
import { loader } from '../ui/loading.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';

/** ปุ่มในแถบเครื่องมือของตาราง */
export const importButton = () =>
  html`<button type="button" class="btn btn-sm" data-import-excel title="นำเข้ารายชื่อพนักงานเข้าใหม่ / ลาออก จากไฟล์ Excel ของ HR">${raw(icon('upload'))} นำเข้า Excel</button>`;

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

/** อ่านไฟล์ → แถวของชีตแรกที่มีหัว "รหัสพนักงาน" (ไม่มี = ชีตแรก) */
async function readRows(file) {
  const XLSX = await loadSheetJs();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  let first = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    first ??= rows;
    if (rows.slice(0, 15).some((r) => (r ?? []).some((c) => String(c ?? '').trim() === 'รหัสพนักงาน'))) return rows;
  }
  return first ?? [];
}

const KIND_LABEL = { IN: 'พนักงานเข้าใหม่', OUT: 'พนักงานลาออก' };

function summaryHtml(plan, file, addMissing, missingCount) {
  const rows = [
    ...plan.add.map((a) => ({ ...a, act: a.row.status === 'INACTIVE' ? 'addOut' : 'add', code: a.row.empCode, name: `${a.row.firstName} ${a.row.lastName}`, row: a.row })),
    ...plan.update.map((u) => ({ ...u, act: 'out', code: u.row.empCode, name: `${u.row.firstName} ${u.row.lastName}`, row: u.row })),
  ].sort((a, b) => a.rowNo - b.rowNo);
  const issueCount = rows.filter((r) => r.issues.length).length;
  const actBadge = (r) =>
    r.act === 'add'
      ? badge('เพิ่มใหม่', 'success')
      : r.act === 'addOut'
        ? badge('เพิ่ม (พ้นสภาพแล้ว)', 'neutral')
        : badge(`พ้นสภาพ ${thaiDate(r.row.endDate)}`, 'warning');
  return html`<div class="imp-sum">
      <span class="imp-file">${raw(icon('file-spreadsheet'))} <b>${file.name}</b> · ${KIND_LABEL[plan.kind]}</span>
      <span class="chg-tag add">เพิ่ม ${plan.add.length}</span>
      ${plan.kind === 'OUT' ? html`<span class="chg-tag edit">บันทึกพ้นสภาพ ${plan.update.length}</span>` : ''}
      ${plan.skip.length ? html`<span class="imp-skip-tag">ข้าม ${plan.skip.length}</span>` : ''}
    </div>
    ${plan.kind === 'OUT' && missingCount
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
        <thead><tr><th class="num">แถว</th><th>รหัส</th><th>ชื่อ</th><th>สิ่งที่จะทำ</th><th>ต้องตรวจ / เหตุผล</th></tr></thead>
        <tbody>
          ${rows.map(
            (r) => html`<tr>
              <td class="num muted">${r.rowNo}</td>
              <td class="num">${r.code}</td>
              <td>${r.name}</td>
              <td>${actBadge(r)}${r.act !== 'add' && r.row.endReason ? html` <span class="small muted">${END_REASON_LABEL[r.row.endReason]}</span>` : ''}</td>
              <td class="small">${r.issues.length ? html`<span class="imp-issue">${r.issues.join(' · ')}</span>` : html`<span class="muted">–</span>`}</td>
            </tr>`,
          )}
          ${plan.skip.map(
            (s) => html`<tr class="imp-skipped">
              <td class="num muted">${s.rowNo}</td>
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
    parsed = parseEmployeeSheet(await readRows(file));
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.items.length) throw new Error('ไม่พบรายชื่อในไฟล์ (ใต้หัวตารางไม่มีแถวที่มีรหัสพนักงาน)');
    employees = await api.listEmployees({});
  } catch (e) {
    body.innerHTML = String(alertBox({ tone: 'danger', title: 'อ่านไฟล์ไม่ได้', body: errorMessage(e) }));
    return;
  }
  const missingCount = parsed.kind === 'OUT' ? planEmployeeImport(parsed, employees, ctx.sites).skip.filter((s) => s.reason === 'ไม่พบรหัสนี้ในระบบ').length : 0;
  let addMissing = false;
  let plan;
  const draw = () => {
    plan = planEmployeeImport(parsed, employees, ctx.sites, { addMissing });
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
