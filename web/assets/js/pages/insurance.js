// หน้า: ประกันกลุ่ม (insurance.html?cycle=&tab=)
// แท็บ: แจ้งออกทันที / แจ้งเข้า / แจ้งออก (ตัวเลข = รอส่ง) / ประวัติการส่ง (คลิกแถว = ดูรายชื่อใน batch · ลิงก์ตรง ?batch=)
import { api } from '../app/api.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { addMonths, nextCycleDate, todayISO } from '../domain/date.js';
import { downloadCsv } from '../shared/csv.js';
import { $, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { relativeDays, thaiDate, thaiDateLong, thaiDateTime } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { BATCH_TONE, BATCH_TYPE_LABEL, EMPLOYEE_TYPE_LABEL } from '../shared/labels.js';
import { badge, emptyState, employeeCell, errorState, skeletonLines, tabs } from '../ui/components.js';
import { confirmAction, openModal } from '../ui/overlay.js';
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

/** ตัวอย่างรายชื่อใน batch: 2 ชื่อแรก + "+N" */
const PREVIEW_NAMES = 2;
const fullName = (e) => `${e.firstName} ${e.lastName}`;
function namesPreview(b) {
  const list = b.employees ?? [];
  if (!list.length) return html`<span class="muted">${b.employeeIds.length} ราย</span>`;
  const more = list.length - PREVIEW_NAMES;
  return html`<span class="names-preview">
    <span class="truncate">${list.slice(0, PREVIEW_NAMES).map(fullName).join(', ')}</span>
    ${more > 0 ? html`<span class="more num">+${more}</span>` : ''}
  </span>`;
}

const batchTable = new DataTable($('#batches'), {
  rowKey: (b) => b.id,
  pageSize: 25,
  onRowClick: (b) => openBatch(b.id),
  columns: [
    { key: 'id', header: 'เลขที่', sort: (b) => b.id, cell: (b) => html`<span class="num muted">#${b.id}</span>` },
    { key: 'cycle', header: 'รอบ', sort: (b) => b.cycleDate, cell: (b) => html`<span class="num">${thaiDate(b.cycleDate)}</span>` },
    { key: 'type', header: 'ประเภท', mobile: 'aside', cell: (b) => badge(BATCH_TYPE_LABEL[b.type], BATCH_TONE[b.type]) },
    // กรองหัวคอลัมน์ "รายชื่อ" = ค้นหาชื่อ/รหัสพนักงานใน batch ได้
    {
      key: 'names',
      header: 'รายชื่อ',
      cls: 'names-col',
      text: (b) => (b.employees ?? []).map((e) => `${fullName(e)} (${e.empCode})`).join(', '),
      cell: namesPreview,
    },
    { key: 'n', header: 'จำนวน', align: 'right', sort: (b) => b.employeeIds.length, cell: (b) => html`<span class="num">${b.employeeIds.length} ราย</span>` },
    { key: 'at', header: 'ส่งเมื่อ', hideOnMobile: true, sort: (b) => b.submittedAt, cell: (b) => html`<span class="num muted">${thaiDateTime(b.submittedAt)}</span>` },
    { key: 'by', header: 'โดย', hideOnMobile: true, cell: (b) => html`<span class="muted">${b.submittedBy}</span>` },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (b) => html`<span class="row-actions">
        <button class="btn btn-ghost btn-sm" data-open-batch="${b.id}">${raw(icon('users'))} ดูรายชื่อ</button>
        <button class="btn btn-ghost btn-sm" data-cancel-batch="${b.id}">${raw(icon('undo-2'))} ยกเลิก</button>
      </span>`,
    },
  ],
  empty: emptyState({ iconName: 'history', title: 'ยังไม่มีประวัติการส่ง' }),
});

// ----- รายละเอียด batch: รายชื่อพนักงานที่ถูกส่งแจ้ง (เปิดจากแถว / ลิงก์ ?batch=) -----
function batchCsv(d) {
  downloadCsv(
    `insurance-batch-${d.id}-${d.cycleDate}.csv`,
    ['เลขที่', 'ประเภทแจ้ง', 'รอบ', 'รหัสพนักงาน', 'ชื่อ', 'นามสกุล', 'บริษัท', 'ประเภทพนักงาน', 'หน่วยงาน', 'วันมีผล', 'เหตุผล', 'ส่งเมื่อ', 'ส่งโดย'],
    d.items.map((it) => [
      d.id,
      BATCH_TYPE_LABEL[d.type],
      d.cycleDate,
      it.employee.empCode,
      it.employee.firstName,
      it.employee.lastName,
      it.employee.companyCode ?? '',
      EMPLOYEE_TYPE_LABEL[it.employee.employeeType] ?? '',
      it.siteName,
      it.effectiveDate ?? '',
      it.reason,
      d.submittedAt,
      d.submittedBy,
    ]),
  );
}

function batchItemsHtml(d) {
  const dateLabel = d.type === 'IN' ? 'วันครบสิทธิ' : 'วันมีผล';
  return html`<div class="batch-items" role="list">
    ${d.items.map(
      (it, i) => html`<div
        class="bi-row"
        role="listitem"
        data-search="${`${it.employee.empCode} ${fullName(it.employee)} ${it.siteName} ${it.employee.companyCode ?? ''}`.toLowerCase()}"
      >
        <span class="bi-no num">${i + 1}</span>
        <span class="bi-emp">${employeeCell(it.employee, { link: true })}</span>
        <span class="bi-co"
          ><span><b>${it.employee.companyCode ?? ''}</b> · ${EMPLOYEE_TYPE_LABEL[it.employee.employeeType] ?? ''}</span><small class="truncate">${it.siteName}</small></span
        >
        <span class="bi-date"><small>${dateLabel}</small><b class="num">${it.effectiveDate ? thaiDate(it.effectiveDate) : '–'}</b></span>
        <span class="bi-reason">${it.reason || ''}</span>
      </div>`,
    )}
    <div class="bi-none hidden">${emptyState({ iconName: 'search', title: 'ไม่พบรายชื่อที่ค้นหา' })}</div>
  </div>`;
}

async function openBatch(id) {
  const b = batches.find((x) => x.id === id);
  setParams({ batch: id });
  const m = openModal({
    size: 'lg',
    title: b ? `${BATCH_TYPE_LABEL[b.type]} #${id}` : `รายการส่งแจ้ง #${id}`,
    description: b ? `รอบ ${thaiDate(b.cycleDate)} · ส่งเมื่อ ${thaiDateTime(b.submittedAt)} โดย ${b.submittedBy}` : '',
    body: html`<div data-batch-body>${skeletonLines(6)}</div>`,
    footer: html`<button class="btn btn-ghost danger-text foot-start" data-batch-cancel disabled>${raw(icon('undo-2'))} ยกเลิกการส่ง</button>
      <button class="btn" data-batch-csv disabled>${raw(icon('download'))} ส่งออก CSV</button>
      <button class="btn btn-primary" data-close>ปิด</button>`,
    onClose: () => setParams({ batch: '' }),
  });
  const body = m.el.querySelector('[data-batch-body]');
  let d;
  try {
    d = await api.getInsuranceBatch(id);
  } catch (e) {
    render(body, errorState(e));
    return;
  }
  render(
    body,
    html`<div class="batch-summary">
        ${badge(BATCH_TYPE_LABEL[d.type], BATCH_TONE[d.type])}
        <span><b class="num">${d.items.length}</b> ราย</span>
        <span class="muted">รอบ <b class="num">${thaiDateLong(d.cycleDate)}</b></span>
      </div>
      ${d.items.length > 5
        ? html`<div class="input-icon batch-search">
            ${raw(icon('search'))}
            <input class="input" type="search" placeholder="ค้นหาชื่อ รหัส หรือหน่วยงาน…" aria-label="ค้นหารายชื่อใน batch" autocomplete="off" />
          </div>`
        : ''}
      ${batchItemsHtml(d)}`,
  );
  const search = body.querySelector('.batch-search input');
  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    body.querySelectorAll('.bi-row').forEach((r) => {
      const hit = !q || r.dataset.search.includes(q);
      r.hidden = !hit;
      shown += hit;
    });
    body.querySelector('.bi-none').classList.toggle('hidden', shown > 0);
  });
  const csvBtn = m.el.querySelector('[data-batch-csv]');
  csvBtn.disabled = false;
  csvBtn.onclick = () => batchCsv(d);
  const cancelBtn = m.el.querySelector('[data-batch-cancel]');
  cancelBtn.disabled = false;
  cancelBtn.onclick = () => {
    m.close();
    cancelBatch(d);
  };
}

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

on(sections, 'click', '[data-open-batch]', (_e, btn) => openBatch(Number(btn.dataset.openBatch)));
on(sections, 'click', '[data-cancel-batch]', (_e, btn) => cancelBatch(batches.find((x) => x.id === Number(btn.dataset.cancelBatch))));

function cancelBatch(b) {
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
}

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
loadBatches().then(() => {
  // ลิงก์ตรง ?batch=12 → เปิดแท็บประวัติ + รายละเอียด batch
  const id = Number(getParam('batch'));
  if (!id) return;
  tab = 'history';
  setParams({ tab });
  drawTabs();
  openBatch(id);
});
