// หน้า: ประกันกลุ่ม (insurance.html?cycle=&tab=)
// แท็บ: แจ้งออกทันที / แจ้งเข้า / แจ้งออก (ตัวเลข = รอส่ง) / ประวัติการส่ง
import { api } from '../app/api.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { addMonths, nextCycleDate, todayISO } from '../domain/date.js';
import { downloadCsv } from '../shared/csv.js';
import { $, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { relativeDays, thaiDate, thaiDateLong, thaiDateTime } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { BATCH_TONE, BATCH_TYPE_LABEL, EMPLOYEE_TYPE_LABEL } from '../shared/labels.js';
import { badge, emptyState, employeeCell, errorState, tabs } from '../ui/components.js';
import { confirmAction } from '../ui/overlay.js';
import { DataTable } from '../ui/table.js';

initPage('insurance');

const today = todayISO();
const current = nextCycleDate(today);
let cycle = getParam('cycle', current);
let rows = null;
let batches = [];
const selected = { IN: new Set(), OUT: new Set(), URGENT: new Set() };

/** แท็บของหน้า — id ใช้ใน URL (?tab=) */
const SECTIONS = [
  { id: 'urgent', type: 'URGENT', title: 'แจ้งออกทันที', description: 'เลิกจ้าง / กระทำผิด — ส่งได้ทันทีไม่รอรอบ และแสดงทุกรอบจนกว่าจะส่ง', iconName: 'shield-alert', tone: 'danger' },
  { id: 'in', type: 'IN', title: 'แจ้งเข้า', description: 'พนักงานที่ครบอายุงานแล้ว (รวมที่ตกค้างจากรอบก่อน)', iconName: 'log-in', tone: 'info' },
  { id: 'out', type: 'OUT', title: 'แจ้งออก', description: 'ลาออก / ขาดงาน 3 วัน (วันทำงานสุดท้าย + 7 วัน)', iconName: 'log-out', tone: 'warning' },
];
let tab = getParam('tab'); // ว่าง = เลือกให้อัตโนมัติหลังโหลด (แท็บแรกที่มีรายการรอส่ง)

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

// ----- การ์ดของแต่ละแท็บ (แสดงทีละใบ) -----
render(
  $('#sections'),
  html`${SECTIONS.map(
      (s) => html`<section class="card fill hidden" id="sec-${s.id}">
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
        <div data-table class="fill-body"></div>
      </section>`,
    )}
    <section class="card fill hidden" id="sec-history">
      <header class="card-head">
        <div class="card-title">
          <span class="card-icon">${raw(icon('history'))}</span>
          <div>
            <h2>ประวัติการส่งแจ้ง</h2>
            <p>ส่งผิด? กด “ยกเลิก” แล้วรายชื่อจะกลับไปรอส่ง</p>
          </div>
        </div>
      </header>
      <div id="batches" class="fill-body"></div>
    </section>`,
);

const tables = {};
for (const s of SECTIONS) {
  tables[s.type] = new DataTable($(`#sec-${s.id} [data-table]`), {
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
      { key: 'emp', header: 'พนักงาน', mobile: 'title', text: (r) => `${r.employee.firstName} ${r.employee.lastName} ${r.employee.empCode}`, cell: (r) => employeeCell(r.employee, { link: true }) },
      { key: 'co', header: 'บริษัท', hideOnMobile: true, cell: (r) => `${r.employee.companyCode} · ${EMPLOYEE_TYPE_LABEL[r.employee.employeeType]}` },
      { key: 'reason', header: 'เหตุผล', cell: (r) => html`<span class="muted">${r.reason}</span>` },
      { key: 'date', header: 'วันมีผล', sort: (r) => r.effectiveDate, cell: (r) => html`<span class="num">${thaiDate(r.effectiveDate)}</span>` },
      {
        key: 'st',
        header: 'สถานะ',
        align: 'right',
        mobile: 'aside',
        cell: (r) => (r.submitted ? badge('ส่งแล้ว', 'success') : badge('รอส่ง', BATCH_TONE[r.type])),
      },
    ],
    empty: emptyState({ iconName: 'circle-check', title: `ไม่มีรายการ${s.title}ในรอบนี้` }),
  });
}

const batchTable = new DataTable($('#batches'), {
  rowKey: (b) => b.id,
  pageSize: 25,
  columns: [
    { key: 'id', header: 'เลขที่', sort: (b) => b.id, cell: (b) => html`<span class="num muted">#${b.id}</span>` },
    { key: 'cycle', header: 'รอบ', sort: (b) => b.cycleDate, cell: (b) => html`<span class="num">${thaiDate(b.cycleDate)}</span>` },
    { key: 'type', header: 'ประเภท', mobile: 'aside', cell: (b) => badge(BATCH_TYPE_LABEL[b.type], BATCH_TONE[b.type]) },
    { key: 'n', header: 'จำนวน', align: 'right', sort: (b) => b.employeeIds.length, cell: (b) => html`<span class="num">${b.employeeIds.length} ราย</span>` },
    { key: 'at', header: 'ส่งเมื่อ', hideOnMobile: true, sort: (b) => b.submittedAt, cell: (b) => html`<span class="num muted">${thaiDateTime(b.submittedAt)}</span>` },
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

// ----- วาดแท็บ + ส่วนที่เลือก -----
const openOf = (type) => (rows ?? []).filter((r) => r.type === type && !r.submitted);

function drawTabs() {
  render(
    $('#tabs'),
    tabs(
      [
        ...SECTIONS.map((s) => {
          const n = openOf(s.type).length;
          return { value: s.id, label: s.title, count: rows && n ? n : undefined, tone: s.tone };
        }),
        { value: 'history', label: 'ประวัติการส่ง', count: batches.length || undefined },
      ],
      tab,
    ),
  );
  for (const s of [...SECTIONS.map((x) => x.id), 'history']) $(`#sec-${s}`).classList.toggle('hidden', s !== tab);
}

function drawSections() {
  for (const s of SECTIONS) {
    const list = (rows ?? []).filter((r) => r.type === s.type);
    const open = openOf(s.type);
    const sec = $(`#sec-${s.id}`);
    render(sec.querySelector('[data-count]'), open.length ? badge(`รอส่ง ${open.length}`, s.tone) : rows ? badge('ครบแล้ว', 'success') : '');
    const n = selected[s.type].size;
    const btn = sec.querySelector('[data-submit]');
    btn.disabled = n === 0;
    btn.innerHTML = `${icon('send')} ส่ง${s.title}${n ? ` (${n})` : ''}`;
    tables[s.type].setRows(rows ? list : null);
    const all = sec.querySelector('[data-all]');
    if (all) {
      all.checked = open.length > 0 && open.every((r) => selected[s.type].has(r.employee.id));
      all.indeterminate = !all.checked && n > 0;
      all.disabled = open.length === 0;
    }
  }
  drawTabs();
}

function toggle(type, id) {
  if (selected[type].has(id)) selected[type].delete(id);
  else selected[type].add(id);
  drawSections();
}

async function loadCycle() {
  render($('#cycle-info'), html`รอบ <b style="color:var(--fg)">${thaiDateLong(cycle)}</b> · ${relativeDays(cycle, today)} · แจ้งบริษัทประกันทุกวันที่ 5`);
  rows = null;
  drawSections();
  try {
    rows = (await api.getInsuranceCycle(cycle)).rows;
    // เลือกแท็บให้อัตโนมัติ: แท็บแรกที่มีรายการรอส่ง (ด่วนก่อน)
    if (!tab) tab = SECTIONS.find((s) => openOf(s.type).length)?.id ?? 'in';
    drawSections();
  } catch (e) {
    render($('#sections'), errorState(e));
  }
}

async function loadBatches() {
  batches = await api.listInsuranceBatches();
  batchTable.setRows(batches);
  drawTabs();
}

// ----- events -----
on($('#tabs'), 'click', '[data-tab]', (_e, t) => {
  tab = t.dataset.tab;
  setParams({ tab });
  drawTabs();
});

const sections = $('#sections');
sections.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.pick) {
    toggle(t.dataset.pick, Number(t.dataset.id));
  } else if (t.dataset.all) {
    const type = t.dataset.all;
    const open = openOf(type).map((r) => r.employee.id);
    const all = open.every((id) => selected[type].has(id));
    selected[type] = new Set(all ? [] : open);
    drawSections();
  }
});

on(sections, 'click', '[data-submit]', (_e, btn) => {
  const type = btn.dataset.submit;
  const ids = [...selected[type]];
  const chosen = (rows ?? []).filter((r) => r.type === type && selected[type].has(r.employee.id));
  confirmAction({
    title: `ยืนยันส่ง${BATCH_TYPE_LABEL[type]}`,
    description: `${ids.length} ราย · รอบ ${thaiDate(cycle)}`,
    body: html`<ul class="modal-list">
        ${chosen.map((r) => html`<li><span>${r.employee.firstName} ${r.employee.lastName}</span><span class="num muted">${r.employee.empCode}</span></li>`)}
      </ul>
      <p style="margin-top:12px">ส่งแล้วจะแก้ไขไม่ได้ (ยกเลิกได้ที่แท็บประวัติการส่ง) — พนักงานแต่ละคนถูกแจ้งเข้า/ออกได้ครั้งเดียว</p>`,
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

on(sections, 'click', '[data-cancel-batch]', (_e, btn) => {
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
    (rows ?? []).map((r) => [
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
