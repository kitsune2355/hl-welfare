// หน้า: ประกันกลุ่ม (insurance.html?cycle=)
import { api } from '../app/api.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { addMonths, nextCycleDate, todayISO } from '../domain/date.js';
import { downloadCsv } from '../shared/csv.js';
import { $, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { relativeDays, thaiDate, thaiDateLong, thaiDateTime } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { BATCH_TONE, BATCH_TYPE_LABEL, EMPLOYEE_TYPE_LABEL } from '../shared/labels.js';
import { badge, emptyState, employeeCell, errorState } from '../ui/components.js';
import { confirmAction } from '../ui/overlay.js';
import { DataTable } from '../ui/table.js';

initPage('insurance');

const today = todayISO();
const current = nextCycleDate(today);
let cycle = getParam('cycle', current);
let rows = [];
const selected = { IN: new Set(), OUT: new Set(), URGENT: new Set() };

const SECTIONS = [
  { type: 'URGENT', title: 'แจ้งออกทันที', description: 'เลิกจ้าง / กระทำผิด — ไม่รอรอบ แสดงทุกรอบจนกว่าจะส่ง', iconName: 'shield-alert' },
  { type: 'IN', title: 'แจ้งเข้า', description: 'พนักงานที่ครบอายุงานแล้ว (รวมที่ตกค้างจากรอบก่อน)', iconName: 'log-in' },
  { type: 'OUT', title: 'แจ้งออก', description: 'ลาออก / ขาดงาน 3 วัน (วันทำงานสุดท้าย + 7 วัน)', iconName: 'log-out' },
];

// ----- ตัวเลือกรอบ: ย้อนหลัง 6 / ล่วงหน้า 3 เดือน -----
const cycleSel = $('#cycle');
cycleSel.innerHTML = Array.from({ length: 10 }, (_, i) => addMonths(current, i - 6))
  .reverse()
  .map((c) => `<option value="${c}" data-hint="${relativeDays(c, today)}">รอบ ${thaiDate(c)}${c === current ? ' (ถัดไป)' : ''}</option>`)
  .join('');
cycleSel.value = cycle;
cycleSel.refreshCombobox?.();
cycleSel.addEventListener('change', () => {
  cycle = cycleSel.value;
  setParams({ cycle: cycle === current ? '' : cycle });
  Object.values(selected).forEach((s) => s.clear());
  loadCycle();
});

// ----- ตาราง 3 ส่วน -----
const tables = {};
render(
  $('#sections'),
  html`${SECTIONS.map(
    (s) => html`<section class="card" id="sec-${s.type}">
      <header class="card-head">
        <div class="card-title">
          <span class="card-icon">${raw(icon(s.iconName))}</span>
          <div>
            <h2>${s.title} <span data-count></span></h2>
            <p>${s.description}</p>
          </div>
        </div>
        <button class="btn btn-sm ${s.type === 'URGENT' ? 'btn-danger' : 'btn-primary'}" data-submit="${s.type}" disabled>${raw(icon('send'))} ส่ง${s.title}</button>
      </header>
      <div data-table></div>
    </section>`,
  )}`,
);

for (const s of SECTIONS) {
  const root = $(`#sec-${s.type} [data-table]`);
  tables[s.type] = new DataTable(root, {
    rowKey: (r) => r.employee.id,
    pageSize: 25,
    onRowClick: (r) => !r.submitted && toggle(s.type, r.employee.id),
    rowClass: (r) => (selected[s.type].has(r.employee.id) ? 'selected' : ''),
    columns: [
      {
        key: 'chk',
        header: raw(`<input type="checkbox" data-all="${s.type}" aria-label="เลือกทั้งหมด">`),
        mobile: 'lead',
        cls: 'center',
        cell: (r) =>
          html`<input type="checkbox" data-pick="${s.type}" data-id="${r.employee.id}" aria-label="เลือก ${r.employee.empCode}" ${r.submitted || selected[s.type].has(r.employee.id) ? 'checked' : ''} ${r.submitted ? 'disabled' : ''} />`,
      },
      { key: 'emp', header: 'พนักงาน', mobile: 'title', cell: (r) => employeeCell(r.employee, { link: true }) },
      { key: 'co', header: 'บริษัท', hideOnMobile: true, cell: (r) => `${r.employee.companyCode} · ${EMPLOYEE_TYPE_LABEL[r.employee.employeeType]}` },
      { key: 'reason', header: 'เหตุผล', cell: (r) => html`<span class="muted">${r.reason}</span>` },
      { key: 'date', header: 'วันมีผล', cell: (r) => html`<span class="num">${thaiDate(r.effectiveDate)}</span>` },
      {
        key: 'st',
        header: 'สถานะ',
        align: 'right',
        mobile: 'aside',
        cell: (r) => (r.submitted ? badge('ส่งแล้ว', 'success') : badge('รอส่ง', BATCH_TONE[r.type])),
      },
    ],
    empty: emptyState({ title: `ไม่มีรายการ${s.title}ในรอบนี้` }),
  });
}

function toggle(type, id) {
  if (selected[type].has(id)) selected[type].delete(id);
  else selected[type].add(id);
  drawSections();
}

function drawSections() {
  for (const s of SECTIONS) {
    const list = rows.filter((r) => r.type === s.type);
    const open = list.filter((r) => !r.submitted);
    const sec = $(`#sec-${s.type}`);
    // แจ้งออกทันที: ซ่อนทั้งส่วนถ้าไม่มีรายการ
    sec.classList.toggle('hidden', s.type === 'URGENT' && list.length === 0);
    sec.style.borderColor = s.type === 'URGENT' && open.length ? 'color-mix(in srgb, var(--danger) 40%, transparent)' : '';
    render(sec.querySelector('[data-count]'), open.length ? badge(`รอส่ง ${open.length}`, BATCH_TONE[s.type]) : badge('ครบแล้ว', 'success'));
    const n = selected[s.type].size;
    const btn = sec.querySelector('[data-submit]');
    btn.disabled = n === 0;
    btn.innerHTML = `${icon('send')} ส่ง${s.title}${n ? ` (${n})` : ''}`;
    tables[s.type].setRows(list);
    const all = sec.querySelector('[data-all]');
    if (all) {
      all.checked = open.length > 0 && open.every((r) => selected[s.type].has(r.employee.id));
      all.indeterminate = !all.checked && n > 0;
      all.disabled = open.length === 0;
    }
  }
}

async function loadCycle() {
  render($('#cycle-info'), html`รอบ <b style="color:var(--fg)">${thaiDateLong(cycle)}</b> · ${relativeDays(cycle, today)}`);
  SECTIONS.forEach((s) => tables[s.type].setRows(null));
  try {
    rows = (await api.getInsuranceCycle(cycle)).rows;
    drawSections();
  } catch (e) {
    render($('#sections'), errorState(e));
  }
}

// ----- ประวัติ batch + ยกเลิก -----
const batchTable = new DataTable($('#batches'), {
  rowKey: (b) => b.id,
  pageSize: 10,
  columns: [
    { key: 'id', header: 'เลขที่', cell: (b) => html`<span class="num muted">#${b.id}</span>` },
    { key: 'cycle', header: 'รอบ', cell: (b) => html`<span class="num">${thaiDate(b.cycleDate)}</span>` },
    { key: 'type', header: 'ประเภท', mobile: 'aside', cell: (b) => badge(BATCH_TYPE_LABEL[b.type], BATCH_TONE[b.type]) },
    { key: 'n', header: 'จำนวน', align: 'right', cell: (b) => html`<span class="num">${b.employeeIds.length} ราย</span>` },
    { key: 'at', header: 'ส่งเมื่อ', hideOnMobile: true, cell: (b) => html`<span class="num muted">${thaiDateTime(b.submittedAt)}</span>` },
    { key: 'by', header: 'โดย', hideOnMobile: true, cell: (b) => html`<span class="muted">${b.submittedBy}</span>` },
    {
      key: 'cancel',
      header: '',
      align: 'right',
      cell: (b) => html`<button class="btn btn-ghost btn-sm" data-cancel-batch="${b.id}">${raw(icon('undo-2'))} ยกเลิก</button>`,
    },
  ],
  empty: emptyState({ iconName: 'history', title: 'ยังไม่มีประวัติการส่ง' }),
});
let batches = [];
async function loadBatches() {
  batches = await api.listInsuranceBatches();
  batchTable.setRows(batches);
}

// ----- events -----
const sections = $('#sections');
sections.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.pick) {
    toggle(t.dataset.pick, Number(t.dataset.id));
  } else if (t.dataset.all) {
    const type = t.dataset.all;
    const open = rows.filter((r) => r.type === type && !r.submitted).map((r) => r.employee.id);
    const all = open.every((id) => selected[type].has(id));
    selected[type] = new Set(all ? [] : open);
    drawSections();
  }
});

on(sections, 'click', '[data-submit]', (_e, btn) => {
  const type = btn.dataset.submit;
  const ids = [...selected[type]];
  const chosen = rows.filter((r) => r.type === type && selected[type].has(r.employee.id));
  confirmAction({
    title: `ยืนยันส่ง${BATCH_TYPE_LABEL[type]}`,
    description: `${ids.length} ราย · รอบ ${thaiDate(cycle)}`,
    body: html`<ul class="modal-list">
        ${chosen.map((r) => html`<li><span>${r.employee.firstName} ${r.employee.lastName}</span><span class="num muted">${r.employee.empCode}</span></li>`)}
      </ul>
      <p style="margin-top:12px">ส่งแล้วจะแก้ไขไม่ได้ (ยกเลิกได้จากประวัติ) — พนักงานแต่ละคนถูกแจ้งเข้า/ออกได้ครั้งเดียว</p>`,
    confirmLabel: 'ยืนยันส่ง',
    danger: type === 'URGENT',
    successMessage: `ส่ง${BATCH_TYPE_LABEL[type]} ${ids.length} รายเรียบร้อย`,
    action: async () => {
      await api.submitInsuranceBatch({ cycleDate: cycle, type, employeeIds: ids });
      selected[type].clear();
      refreshCounts();
      await Promise.all([loadCycle(), loadBatches()]);
    },
  });
});

on($('#batches'), 'click', '[data-cancel-batch]', (_e, btn) => {
  const b = batches.find((x) => x.id === Number(btn.dataset.cancelBatch));
  confirmAction({
    title: `ยกเลิก${BATCH_TYPE_LABEL[b.type]} #${b.id}?`,
    description: `รอบ ${thaiDate(b.cycleDate)} · ${b.employeeIds.length} ราย`,
    body: 'ใช้กรณีส่งผิด — พนักงานใน batch นี้จะกลับไปอยู่ในรายการรอส่ง ต้องแจ้งบริษัทประกันให้ยกเลิกด้วย',
    confirmLabel: 'ยกเลิกการส่ง',
    successMessage: `ยกเลิก batch #${b.id} แล้ว — รายการกลับไปเป็น “รอส่ง”`,
    action: async () => {
      await api.cancelInsuranceBatch(b.id);
      refreshCounts();
      await Promise.all([loadCycle(), loadBatches()]);
    },
  });
});

$('#export').onclick = () =>
  downloadCsv(
    `insurance-${cycle}.csv`,
    ['ประเภทแจ้ง', 'รหัสพนักงาน', 'ชื่อ', 'นามสกุล', 'บริษัท', 'ประเภทพนักงาน', 'วันเกิด', 'วันมีผล', 'เหตุผล', 'สถานะ'],
    rows.map((r) => [
      BATCH_TYPE_LABEL[r.type],
      r.employee.empCode,
      r.employee.firstName,
      r.employee.lastName,
      r.employee.companyCode,
      EMPLOYEE_TYPE_LABEL[r.employee.employeeType],
      r.employee.birthDate,
      r.effectiveDate,
      r.reason,
      r.submitted ? 'ส่งแล้ว' : 'รอส่ง',
    ]),
  );

loadCycle();
loadBatches();
