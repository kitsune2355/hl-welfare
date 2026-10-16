// หน้า: ประกันกลุ่ม (insurance.html?cycle=&tab=)
// แท็บ: แจ้งออกทันที / แจ้งเข้า / แจ้งออก (ตัวเลข = ยังไม่ส่งออก) / ประวัติการส่งออก (คลิกแถว = ดูรายชื่อ · ลิงก์ตรง ?batch=)
// ไม่มีปุ่ม "ส่งแจ้ง" — HR กด "ส่งออกไฟล์แจ้งประกัน" ทุกรอบ ได้ไฟล์ Excel ตามแบบฟอร์มของแต่ละบริษัทประกัน (ตั้งค่าที่ insurers.html)
import { api } from '../app/api.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { exportFileName, fillTemplate, templateBuffer } from '../app/excelTemplate.js';
import { exportCsvRows, thaiMonthYear } from '../application/usecases/insurerExport.js';
import { addMonths, nextCycleDate, todayISO } from '../domain/date.js';
import { EMPLOYEE_FIELD_LABEL } from '../domain/insurerForm.js';
import { downloadCsv } from '../shared/csv.js';
import { $, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { XLSX_MIME, downloadBlob } from '../shared/excel.js';
import { relativeDays, thaiDate, thaiDateLong, thaiDateTime } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { batchCounts } from '../application/usecases/insuranceCycle.js';
import { cycleDays } from '../domain/insurance.js';
import { BATCH_TONE, BATCH_TYPE_LABEL, EMPLOYEE_TYPE_LABEL } from '../shared/labels.js';
import { alertBox, badge, emptyState, employeeCell, errorState, tabs } from '../ui/components.js';
import { confirmAction, errorMessage, openModal, toast } from '../ui/overlay.js';
import { DataTable } from '../ui/table.js';
import { busy, loader, progress } from '../ui/loading.js';

initPage('insurance');

const today = todayISO();
// รอบในแต่ละเดือน: วันที่ 5 = พนักงานทั่วไป · วันที่ 6 = พนักงานรายวัน (ตั้งค่าที่เงื่อนไขสวัสดิการ)
const settings = await api
  .getRules()
  .then((r) => r.settings)
  .catch(() => ({ insuranceCycleDay: 5, insuranceCycleDayDaily: 6 }));
const DAYS = cycleDays(settings);
const groupOf = (date) => {
  const day = Number(date.slice(8, 10));
  if (DAYS.length === 1) return 'ทุกประเภท';
  return day === settings.insuranceCycleDayDaily ? 'พนักงานรายวัน' : 'พนักงานทั่วไป';
};
const current = DAYS.map((d) => nextCycleDate(today, d)).reduce((a, b) => (a < b ? a : b));
let cycle = getParam('cycle', current);
let rows = null;
let batches = [];
let insurers = [];

/** แท็บของหน้า — id ใช้ใน URL (?tab=) */
const SECTIONS = [
  { id: 'urgent', type: 'URGENT', title: 'แจ้งออกทันที', description: 'เลิกจ้าง / กระทำผิด — อยู่ในไฟล์ส่งออกทุกรอบจนกว่าจะส่งออก', iconName: 'shield-alert', tone: 'danger' },
  { id: 'in', type: 'IN', title: 'แจ้งเข้า', description: 'พนักงานที่ครบอายุงานแล้ว (รวมที่ตกค้างจากรอบก่อน)', iconName: 'log-in', tone: 'info' },
  { id: 'out', type: 'OUT', title: 'แจ้งออก', description: 'ลาออก / ขาดงาน 3 วัน (วันทำงานสุดท้าย + 7 วัน)', iconName: 'log-out', tone: 'warning' },
];
/** บริษัทในเครือ → แบบฟอร์มบริษัทประกันที่เปิดใช้ */
const insurerOf = (companyCode) => insurers.find((f) => f.active && f.companies.some((c) => c.companyCode === companyCode));
let tab = getParam('tab'); // ว่าง = เลือกให้อัตโนมัติหลังโหลด (แท็บแรกที่มีรายการรอส่ง)

// ----- ตัวเลือกรอบ: ย้อนหลัง 6 / ล่วงหน้า 3 เดือน · เดือนละ 2 รอบ (ทั่วไป / รายวัน) -----
const cycleSel = $('#cycle');
const monthStart = `${current.slice(0, 8)}01`;
cycleSel.innerHTML = Array.from({ length: 10 }, (_, i) => addMonths(monthStart, i - 6))
  .flatMap((m) => DAYS.map((d) => `${m.slice(0, 8)}${String(d).padStart(2, '0')}`))
  .reverse()
  .map((c) => `<option value="${c}" data-hint="${groupOf(c)} · ${relativeDays(c, today)}">รอบ ${thaiDate(c)} · ${groupOf(c)}${c === current ? ' (ถัดไป)' : ''}</option>`)
  .join('');
cycleSel.value = cycle;
cycleSel.refreshCombobox?.();
cycleSel.addEventListener('change', () => {
  cycle = cycleSel.value;
  setParams({ cycle: cycle === current ? '' : cycle });
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
        </header>
        <div data-table class="fill-body"></div>
      </section>`,
    )}
    <section class="card fill hidden" id="sec-history">
      <header class="card-head">
        <div class="card-title">
          <span class="card-icon">${raw(icon('history'))}</span>
          <div>
            <h2>ประวัติการส่งออก</h2>
            <p>ทุกครั้งที่ส่งออกไฟล์แบบ “บันทึกว่าแจ้งแล้ว” · ส่งออกผิด? กด “ยกเลิก” แล้วรายชื่อจะกลับไปรอส่งออก</p>
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
    columns: [
      { key: 'emp', header: 'พนักงาน', mobile: 'title', text: (r) => `${r.employee.firstName} ${r.employee.lastName} ${r.employee.empCode}`, cell: (r) => employeeCell(r.employee, { link: true }) },
      { key: 'co', header: 'บริษัท', hideOnMobile: true, cell: (r) => `${r.employee.companyCode} · ${EMPLOYEE_TYPE_LABEL[r.employee.employeeType]}` },
      {
        key: 'insurer',
        header: 'บริษัทประกัน',
        hideOnMobile: true,
        text: (r) => insurerOf(r.employee.companyCode)?.shortName ?? 'ยังไม่ผูกแบบฟอร์ม',
        cell: (r) => {
          const f = insurerOf(r.employee.companyCode);
          return f ? html`<span class="muted">${f.shortName}</span>` : badge('ยังไม่ผูกแบบฟอร์ม', 'warning');
        },
      },
      { key: 'reason', header: 'เหตุผล', cell: (r) => html`<span class="muted">${r.reason}</span>` },
      { key: 'date', header: 'วันมีผล', sort: (r) => r.effectiveDate, cell: (r) => html`<span class="num">${thaiDate(r.effectiveDate)}</span>` },
      {
        key: 'st',
        header: 'สถานะ',
        align: 'right',
        mobile: 'aside',
        text: (r) => (r.submitted ? 'ส่งออกแล้ว' : 'ยังไม่ส่งออก'),
        cell: (r) => (r.submitted ? badge('ส่งออกแล้ว', 'success') : badge('ยังไม่ส่งออก', BATCH_TONE[r.type])),
      },
    ],
    empty: emptyState({ iconName: 'circle-check', title: `ไม่มีรายการ${s.title}ในรอบนี้` }),
  });
}

/** จำนวนเข้า/ออกในการส่งออก 1 ครั้ง */
function countLabel(b) {
  const c = batchCounts(b);
  return [c.in ? `เข้า ${c.in}` : '', c.urgent ? `ออกทันที ${c.urgent}` : '', c.out ? `ออก ${c.out}` : ''].filter(Boolean).join(' · ');
}
function countChips(b) {
  const c = batchCounts(b);
  return html`<span class="io-chips">
    ${c.in ? html`<span class="io in" title="แจ้งเข้า">${raw(icon('user-plus'))}<b class="num">${c.in}</b></span>` : ''}
    ${c.urgent ? html`<span class="io urgent" title="แจ้งออกทันที">${raw(icon('zap'))}<b class="num">${c.urgent}</b></span>` : ''}
    ${c.out ? html`<span class="io out" title="แจ้งออก">${raw(icon('user-minus'))}<b class="num">${c.out}</b></span>` : ''}
    <span class="io-total num">${c.total} ราย</span>
  </span>`;
}

/** ตัวอย่างรายชื่อใน batch: 2 ชื่อแรก + "+N" */
const PREVIEW_NAMES = 2;
const fullName = (e) => `${e.firstName} ${e.lastName}`;
function namesPreview(b) {
  const list = b.employees ?? [];
  if (!list.length) return html`<span class="muted">${b.items.length} ราย</span>`;
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
    { key: 'insurer', header: 'บริษัทประกัน', mobile: 'aside', text: (b) => b.insurerName ?? '–', cell: (b) => html`<span class="muted">${b.insurerName ?? '–'}</span>` },
    // กรองหัวคอลัมน์ "รายชื่อ" = ค้นหาชื่อ/รหัสพนักงานใน batch ได้
    {
      key: 'names',
      header: 'รายชื่อ',
      cls: 'names-col',
      text: (b) => (b.employees ?? []).map((e) => `${fullName(e)} (${e.empCode})`).join(', '),
      cell: namesPreview,
    },
    {
      key: 'n',
      header: 'เข้า / ออก',
      align: 'right',
      sort: (b) => b.items.length,
      text: (b) => countLabel(b),
      cell: (b) => countChips(b),
    },
    { key: 'at', header: 'ส่งออกเมื่อ', hideOnMobile: true, sort: (b) => b.submittedAt, cell: (b) => html`<span class="num muted">${thaiDateTime(b.submittedAt)}</span>` },
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
  empty: emptyState({ iconName: 'history', title: 'ยังไม่มีประวัติการส่งออก' }),
});

// ----- รายละเอียด batch: รายชื่อพนักงานที่ส่งออกไปแล้ว (เปิดจากแถว / ลิงก์ ?batch=) -----
function batchCsv(d) {
  downloadCsv(
    `insurance-batch-${d.id}-${d.cycleDate}.csv`,
    ['เลขที่', 'ประเภทแจ้ง', 'รอบ', 'รหัสพนักงาน', 'ชื่อ', 'นามสกุล', 'บริษัท', 'ประเภทพนักงาน', 'หน่วยงาน', 'วันมีผล', 'เหตุผล', 'ส่งเมื่อ', 'ส่งโดย'],
    d.items.map((it) => [
      d.id,
      BATCH_TYPE_LABEL[it.type],
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
  return html`<div class="batch-items" role="list">
    ${d.items.map(
      (it, i) => html`<div
        class="bi-row"
        role="listitem"
        data-search="${`${it.employee.empCode} ${fullName(it.employee)} ${it.siteName} ${it.employee.companyCode ?? ''} ${BATCH_TYPE_LABEL[it.type]}`.toLowerCase()}"
      >
        <span class="bi-no num">${i + 1}</span>
        <span class="bi-type">${badge(BATCH_TYPE_LABEL[it.type], BATCH_TONE[it.type])}</span>
        <span class="bi-emp">${employeeCell(it.employee, { link: true })}</span>
        <span class="bi-co"
          ><span><b>${it.employee.companyCode ?? ''}</b> · ${EMPLOYEE_TYPE_LABEL[it.employee.employeeType] ?? ''}</span><small class="truncate">${it.siteName}</small></span
        >
        <span class="bi-date"><small>${it.type === 'IN' ? 'วันครบสิทธิ' : 'วันมีผล'}</small><b class="num">${it.effectiveDate ? thaiDate(it.effectiveDate) : '–'}</b></span>
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
    title: b ? `ส่งออกไฟล์${b.insurerName ? `แจ้ง${b.insurerName}` : ''} #${id}` : `รายการส่งออก #${id}`,
    description: b ? `รอบ ${thaiDate(b.cycleDate)} · ส่งออกเมื่อ ${thaiDateTime(b.submittedAt)} โดย ${b.submittedBy}` : '',
    body: html`<div data-batch-body>${loader({ text: 'กำลังโหลดรายชื่อ' })}</div>`,
    footer: html`<button class="btn btn-ghost danger-text foot-start" data-batch-cancel disabled>${raw(icon('undo-2'))} ยกเลิกการส่งออก</button>
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
        ${countChips(d)}
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

// ----- วาดแท็บ + จำนวนที่ยังไม่ส่งออก -----
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
        { value: 'history', label: 'ประวัติการส่งออก', count: batches.length || undefined },
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
    render(sec.querySelector('[data-count]'), open.length ? badge(`ยังไม่ส่งออก ${open.length}`, s.tone) : rows ? badge('ส่งออกครบแล้ว', 'success') : '');
    tables[s.type].setRows(rows ? list : null);
  }
  drawTabs();
}

async function loadCycle() {
  render($('#cycle-info'), html`รอบ <b style="color:var(--fg)">${thaiDateLong(cycle)}</b> · ${relativeDays(cycle, today)} · <b style="color:var(--fg)">${groupOf(cycle)}</b> · ส่งออกไฟล์แจ้งประกันทุกวันที่ ${settings.insuranceCycleDay}${DAYS.length > 1 ? ` · พนักงานรายวันทุกวันที่ ${settings.insuranceCycleDayDaily}` : ''}`);
  rows = null;
  drawSections();
  try {
    rows = (await api.getInsuranceCycle(cycle)).rows;
    // เลือกแท็บให้อัตโนมัติ: แท็บแรกที่มีรายการยังไม่ส่งออก (ด่วนก่อน)
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
on(sections, 'click', '[data-open-batch]', (_e, btn) => openBatch(Number(btn.dataset.openBatch)));
on(sections, 'click', '[data-cancel-batch]', (_e, btn) => cancelBatch(batches.find((x) => x.id === Number(btn.dataset.cancelBatch))));

function cancelBatch(b) {
  confirmAction({
    title: `ยกเลิกการส่งออก #${b.id}?`,
    description: `${b.insurerName ? `${b.insurerName} · ` : ''}รอบ ${thaiDate(b.cycleDate)} · ${countLabel(b)}`,
    body: 'ใช้กรณีส่งออกผิด — รายชื่อจะกลับไปเป็น “ยังไม่ส่งออก” และอยู่ในไฟล์รอบถัดไป · ถ้าส่งไฟล์ให้บริษัทประกันแล้ว ต้องแจ้งยกเลิกด้วย',
    confirmLabel: 'ยกเลิกการส่งออก',
    successMessage: `ยกเลิก #${b.id} แล้ว — รายชื่อกลับไปเป็น “ยังไม่ส่งออก”`,
    action: async () => {
      await api.cancelInsuranceBatch(b.id);
      refreshCounts();
      await Promise.all([loadCycle(), loadBatches()]);
    },
  });
}

// ----- ส่งออกไฟล์แจ้งประกัน (แทนปุ่ม "ส่งแจ้ง") -----
const countOf = (d) => ({
  in: d.companies.reduce((a, c) => a + c.in.length, 0),
  out: d.companies.reduce((a, c) => a + c.out.length, 0),
});

/** การ์ดของบริษัทประกัน 1 ราย: จำนวนต่อบริษัท + คำเตือนข้อมูลไม่ครบ + ปุ่มดาวน์โหลด */
function exportCard(d) {
  const f = d.insurer;
  const n = countOf(d);
  return html`<article class="export-card" data-insurer="${f.id}">
    <header class="export-head">
      <span class="card-icon">${raw(icon('file-spreadsheet'))}</span>
      <div class="grow">
        <h3>${f.shortName}</h3>
        <p class="muted">${f.name}</p>
      </div>
      <div class="export-n">
        <span class="chip-n n-in"><b class="num">${n.in}</b> เข้า</span>
        <span class="chip-n n-out"><b class="num">${n.out}</b> ออก</span>
      </div>
    </header>
    <div class="export-co" role="table" aria-label="จำนวนต่อบริษัท">
      ${d.companies.map(
        (c) => html`<div class="export-co-row" role="row">
          <b role="cell">${c.companyCode}</b>
          <span role="cell" class="muted truncate">${c.policyNo ? `กรมธรรม์ ${c.policyNo}` : 'ยังไม่ระบุเลขกรมธรรม์'}</span>
          <span role="cell" class="num">${c.in.length} เข้า · ${c.out.length} ออก</span>
        </div>`,
      )}
    </div>
    ${d.missing.length
      ? html`<details class="export-missing">
          <summary>${raw(icon('alert-triangle'))} ข้อมูลไม่ครบ <b class="num">${d.missing.length}</b> ราย — ช่องนั้นในไฟล์จะว่าง</summary>
          <ul>
            ${d.missing.map(
              (m) => html`<li>
                <a href="employee-form.html?id=${m.employee.id}" target="_blank" rel="noopener">${m.employee.firstName} ${m.employee.lastName}</a>
                <span class="num muted">${m.employee.empCode}</span>
                <span class="muted">ขาด ${m.fields.map((x) => EMPLOYEE_FIELD_LABEL[x] ?? x).join(', ')}</span>
              </li>`,
            )}
          </ul>
        </details>`
      : ''}
    ${d.alreadyExported ? html`<p class="export-note">${raw(icon('info'))} ส่งออกรอบนี้ไปแล้ว ${d.alreadyExported} ราย — ส่งออกอีกครั้งจะได้รายชื่อเดิม + ที่เพิ่มขึ้น และแทนที่ประวัติเดิม</p>` : ''}
    ${f.template
      ? html`<p class="export-note">${raw(icon('file-spreadsheet'))} ใช้แบบฟอร์ม <b>${f.template.fileName}</b></p>`
      : alertBox({ tone: 'warning', title: 'ยังไม่มีไฟล์แบบฟอร์ม Excel', body: html`<a href="insurers.html?id=${f.id}">อัปโหลดแบบฟอร์มของบริษัทประกันนี้</a> — ระหว่างนี้ส่งออกเป็น CSV ได้` })}
    <footer class="export-actions">
      <button class="btn btn-primary" data-export="xlsx" data-id="${f.id}" ${f.template ? '' : 'disabled'}>${raw(icon('download'))} ดาวน์โหลด Excel</button>
      <button class="btn" data-export="csv" data-id="${f.id}">CSV</button>
    </footer>
  </article>`;
}

async function openExport() {
  const active = insurers.filter((f) => f.active);
  const m = openModal({
    size: 'lg',
    title: `ส่งออกไฟล์แจ้งประกัน · รอบ ${thaiDate(cycle)} (${groupOf(cycle)})`,
    description: `ประจำเดือน ${thaiMonthYear(cycle)} · 1 ไฟล์ต่อบริษัทประกัน (ชีตสรุป + ชีตละบริษัทในเครือ) ตามแบบฟอร์มที่ตั้งไว้`,
    body: html`<div data-export-body>${loader({ text: 'กำลังเตรียมรายชื่อของแต่ละบริษัทประกัน', logo: true })}</div>`,
    footer: html`<a class="btn btn-ghost foot-start" href="insurers.html">${raw(icon('file-spreadsheet'))} ตั้งค่าแบบฟอร์ม</a>
      <button class="btn btn-primary" data-close>ปิด</button>`,
  });
  const body = m.el.querySelector('[data-export-body]');
  if (!active.length) {
    render(body, emptyState({ iconName: 'file-spreadsheet', title: 'ยังไม่มีแบบฟอร์มที่เปิดใช้', description: 'ไปที่เมนู “แบบฟอร์มประกัน” เพื่อเพิ่มหรือเปิดใช้แบบฟอร์มของบริษัทประกัน' }));
    return;
  }
  let previews;
  try {
    previews = await Promise.all(active.map((f) => api.exportInsurance({ cycleDate: cycle, insurerId: f.id })));
  } catch (e) {
    render(body, errorState(e));
    return;
  }
  const mapped = new Set(active.flatMap((f) => f.companies.map((c) => c.companyCode)));
  const unmapped = [...new Set((rows ?? []).filter((r) => !r.submitted).map((r) => r.employee.companyCode))].filter((c) => !mapped.has(c));
  render(
    body,
    html`${unmapped.length
        ? alertBox({ tone: 'warning', title: `บริษัท ${unmapped.join(', ')} ยังไม่ได้ผูกกับแบบฟอร์มที่เปิดใช้`, body: 'รายชื่อของบริษัทนี้จะไม่อยู่ในไฟล์ใด — เพิ่มบริษัทที่เมนู “แบบฟอร์มประกัน”' })
        : ''}
      <label class="export-record">
        <input type="checkbox" data-record checked />
        <span><b>บันทึกว่าแจ้งรอบนี้แล้ว</b><small>รายชื่อในไฟล์จะไม่ตกค้างไปรอบถัดไป · ส่งออกซ้ำได้ (แทนที่ของเดิม) · ยกเลิกได้ที่แท็บประวัติการส่งออก — ไม่ติ๊ก = ดาวน์โหลดดูอย่างเดียว</small></span>
      </label>
      <div class="export-list">${previews.map(exportCard)}</div>`,
  );
  on(body, 'click', '[data-export]', async (_e, btn) => {
    const id = Number(btn.dataset.id);
    const format = btn.dataset.export;
    const record = body.querySelector('[data-record]').checked;
    const others = [...body.querySelectorAll('[data-export]')].filter((b) => b !== btn);
    others.forEach((b) => (b.disabled = true));
    try {
      await busy(btn, async () => {
        // สร้างไฟล์ให้สำเร็จก่อน แล้วค่อยบันทึกว่าแจ้งแล้ว (สร้างไฟล์ไม่ได้ = ไม่บันทึก)
        let d = await api.exportInsurance({ cycleDate: cycle, insurerId: id, record: false });
        // Excel = เติมข้อมูลลงไฟล์แบบฟอร์มของบริษัทประกัน (คงรูปแบบเดิมทั้งหมด)
        const name = exportFileName(d.insurer, cycle);
        if (format === 'xlsx') {
          const out = await progress.track(templateBuffer(d.insurer.template).then((buf) => fillTemplate(buf, d, { exportDate: today })));
          downloadBlob(new Blob([out], { type: XLSX_MIME }), `${name}.xlsx`);
        } else {
          const csv = exportCsvRows(d);
          downloadCsv(`${name}.csv`, csv.header, csv.rows);
        }
        if (record) d = await api.exportInsurance({ cycleDate: cycle, insurerId: id, record: true });
        const n = countOf(d);
        toast.success(`ส่งออก${d.insurer.shortName} แล้ว — เข้า ${n.in} · ออก ${n.out} ราย${record ? ' · บันทึกว่าแจ้งแล้ว' : ''}`);
        if (record) {
          body.querySelector(`.export-card[data-insurer="${id}"]`).outerHTML = String(exportCard(d));
          refreshCounts();
          await Promise.all([loadCycle(), loadBatches()]);
        }
      }, { label: format === 'xlsx' ? 'กำลังสร้างไฟล์' : 'กำลังสร้าง CSV' });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      others.forEach((b) => b.isConnected && (b.disabled = false));
    }
  });
}

$('#export').onclick = openExport;

api
  .listInsurers()
  .then((list) => {
    insurers = list;
    drawSections();
  })
  .catch(() => {});

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
