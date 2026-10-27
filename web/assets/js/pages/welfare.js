// หน้า: สวัสดิการเพิ่มเติม 1 อย่าง (welfare.html?id=<รหัส>&tab=history) — เมนูของแต่ละสวัสดิการใน sidebar
//   แท็บผู้มีสิทธิ์: พนักงานที่ตรงเงื่อนไข + สถานะ (รอครบสิทธิ์ / ค้างให้ / ให้ครบแล้ว) + บันทึกการให้
//   แท็บประวัติการให้: ทุกครั้งที่ให้ + ช่องข้อมูลที่สวัสดิการกำหนด · ยกเลิกได้ (บันทึกผิด)
//   ตั้งค่า (เงื่อนไข / รอบ / ช่องข้อมูล) ที่ welfare-setup.html
import { api } from '../app/api.js';
import { can } from '../app/auth.js';
import { refreshCatalog, welfarePrograms } from '../app/catalog.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { welfarePeriodLabel } from '../domain/welfare.js';
import { $, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { relativeDays, thaiDate } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { alertBox, companyChip, emptyState, employeeCell, errorState, tabs } from '../ui/components.js';
import { confirmAction } from '../ui/overlay.js';
import { DataTable } from '../ui/table.js';
import { todayISO } from '../domain/date.js';
import { openEmployeeDetail } from './_employeeDetail.js';
import { FREQUENCY_LABEL, STATE_LABEL, amountText, canRecord, openWelfareRecord, stateBadge } from './_welfareShared.js';

const id = Number(getParam('id'));
initPage(`welfare-${id}`, { tour: 'welfare' });

const today = todayISO();
const TABS = ['roster', 'history'];
const FILTERS = ['ALL', 'DUE', 'WAITING', 'DONE'];
let tab = TABS.includes(getParam('tab')) ? getParam('tab') : 'roster';
let filter = FILTERS.includes(getParam('state')) ? getParam('state') : 'ALL';
let program = welfarePrograms().find((p) => p.id === id) ?? null;
let roster = null;
let records = null;
const canGive = can('welfare.record');

function drawHead() {
  render(
    $('#head'),
    html`<div class="row" style="gap:14px">
        <span class="card-icon">${raw(icon(icon(program.icon) ? program.icon : 'gift'))}</span>
        <div>
          <h1>${program.name}</h1>
          <p>${program.description || FREQUENCY_LABEL[program.frequency]}</p>
        </div>
      </div>
      <div class="page-actions">
        ${can('rules.view')
          ? html`<a class="btn" href="welfare-setup.html?edit=${program.id}">${raw(icon('pencil'))} ${can('welfare.manage') ? 'แก้เงื่อนไข' : 'ดูเงื่อนไข'}</a>`
          : ''}
      </div>`,
  );
  document.title = `${program.name} · HL Welfare`;
  render(
    $('#notice'),
    program.active
      ? ''
      : alertBox({ tone: 'warning', title: 'สวัสดิการนี้ปิดใช้งานแล้ว', body: 'ไม่แสดงในเมนู และบันทึกการให้ไม่ได้ — ดูประวัติได้ตามเดิม · เปิดกลับได้ที่หน้าตั้งค่า' }),
  );
}

function drawTabs() {
  const due = roster?.filter((r) => r.status.state === 'DUE').length;
  render(
    $('#tabs'),
    tabs(
      [
        { value: 'roster', label: 'ผู้มีสิทธิ์', count: roster?.length },
        { value: 'history', label: 'ประวัติการให้', count: records?.length },
      ],
      tab,
    ),
  );
  for (const t of TABS) $(`#tab-${t}`).classList.toggle('hidden', tab !== t);
  const count = (s) => (roster ?? []).filter((r) => s === 'ALL' || r.status.state === s).length;
  render(
    $('#filters'),
    html`${FILTERS.map(
      (s) =>
        html`<button type="button" class="chip${s === filter ? ' active' : ''}" data-filter="${s}" aria-pressed="${s === filter}">
          ${s === 'ALL' ? 'ทั้งหมด' : s === 'DUE' && program.frequency === 'ANYTIME' ? 'ใช้สิทธิ์ได้' : STATE_LABEL[s]}<span class="n num">${count(s)}</span>
        </button>`,
    )}`,
  );
  if (due !== undefined && program.frequency !== 'ANYTIME') $('#roster-hint').textContent = `ค้างให้ ${due} คน — กด “บันทึกการให้” เมื่อให้สวัสดิการแล้ว`;
}

/** ข้อความรอบที่ค้าง: "ปี 2568, ปี 2569" */
const openPeriods = (st) =>
  st.periods
    .filter((p) => !p.done)
    .map((p) => welfarePeriodLabel(p.key))
    .join(', ');

const rosterTable = new DataTable($('#roster'), {
  rowKey: (r) => r.employee.id,
  pageSize: 25,
  onRowDblClick: (r) => openEmployeeDetail(r.employee.id),
  columns: [
    { key: 'emp', header: 'พนักงาน', mobile: 'title', text: (r) => `${r.employee.empCode} ${r.employee.firstName} ${r.employee.lastName}`, cell: (r) => employeeCell(r.employee, { link: true }) },
    { key: 'company', header: 'บริษัท', text: (r) => r.employee.companyCode, cell: (r) => companyChip(r.employee.companyCode) },
    { key: 'site', header: 'หน่วยงาน', hideOnMobile: true, text: (r) => r.siteName, cell: (r) => html`<span class="truncate" style="display:block;max-width:220px">${r.siteName}</span>` },
    { key: 'rule', header: 'เงื่อนไข', hideOnMobile: true, text: (r) => r.status.ruleLabel || '–', cell: (r) => r.status.ruleLabel || html`<span class="muted">–</span>` },
    {
      key: 'eligible',
      header: 'ครบสิทธิ์',
      sort: (r) => r.status.eligibleDate,
      text: (r) => thaiDate(r.status.eligibleDate),
      cls: 'nowrap',
      cell: (r) =>
        html`<span class="two-line"
          ><span class="num">${thaiDate(r.status.eligibleDate)}</span>${r.status.state === 'WAITING' ? html`<span class="sub">${relativeDays(r.status.eligibleDate, today)}</span>` : ''}</span
        >`,
    },
    {
      key: 'amount',
      header: program?.frequency === 'ANYTIME' ? 'วงเงิน/ปี' : 'สิทธิ์',
      align: 'right',
      text: (r) => amountText(r.status.amount, program.unit),
      cell: (r) => html`<span class="num">${amountText(r.status.amount, program.unit) || '–'}</span>`,
    },
    {
      key: 'state',
      header: 'สถานะ',
      text: (r) => STATE_LABEL[r.status.state],
      cell: (r) =>
        html`<span class="two-line">${stateBadge(program, r.status)}${r.status.state === 'DUE' && program.frequency !== 'ANYTIME'
            ? html`<span class="sub">${openPeriods(r.status)}</span>`
            : ''}</span
        >`,
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      cell: (r) =>
        canGive && canRecord(program, r.status) && r.employee.status === 'ACTIVE'
          ? html`<button class="btn btn-primary btn-sm" data-give="${r.employee.id}">${raw(icon('check'))} บันทึกการให้</button>`
          : canGive && canRecord(program, r.status)
            ? html`<button class="btn btn-sm" data-give="${r.employee.id}" title="พ้นสภาพแล้ว — ยังให้รอบที่ค้างก่อนพ้นสภาพได้">${raw(icon('check'))} บันทึก</button>`
            : '',
    },
  ],
  empty: emptyState({ iconName: 'users', title: 'ยังไม่มีผู้มีสิทธิ์', description: 'ไม่มีพนักงานที่ตรงเงื่อนไข หรือกรองไว้ — ปรับเงื่อนไขได้ที่หน้าตั้งค่า' }),
});

/** คอลัมน์ของช่องข้อมูลที่สวัสดิการกำหนด */
const fieldCols = () =>
  (program?.fields ?? []).map((f) => ({
    key: `f-${f.key}`,
    header: f.label,
    hideOnMobile: true,
    text: (r) => String(r.data?.[f.key] ?? ''),
    cell: (r) => {
      const v = r.data?.[f.key];
      if (v === undefined || v === null || v === '') return html`<span class="muted">–</span>`;
      return f.type === 'date' ? html`<span class="num">${thaiDate(v)}</span>` : f.type === 'number' ? html`<span class="num">${amountText(v, '')}</span>` : String(v);
    },
  }));

let historyTable = null;
function buildHistoryTable() {
  historyTable = new DataTable($('#history'), {
    rowKey: (r) => r.id,
    pageSize: 25,
    onRowDblClick: (r) => openEmployeeDetail(r.employeeId),
    columns: [
      { key: 'date', header: 'วันที่ให้', sort: (r) => r.date, text: (r) => thaiDate(r.date), cls: 'nowrap', cell: (r) => html`<span class="num">${thaiDate(r.date)}</span>` },
      { key: 'emp', header: 'พนักงาน', mobile: 'title', text: (r) => `${r.employee.empCode} ${r.employee.firstName} ${r.employee.lastName}`, cell: (r) => employeeCell(r.employee, { link: true }) },
      { key: 'period', header: 'รอบ', text: (r) => welfarePeriodLabel(r.periodKey), cell: (r) => welfarePeriodLabel(r.periodKey) },
      {
        key: 'amount',
        header: program.unit ? `จำนวน (${program.unit})` : 'จำนวน',
        align: 'right',
        text: (r) => (r.amount === null ? '' : String(r.amount)),
        cell: (r) => html`<span class="num">${r.amount === null ? '–' : amountText(r.amount, '')}</span>`,
      },
      ...fieldCols(),
      { key: 'note', header: 'หมายเหตุ', hideOnMobile: true, text: (r) => r.note, cell: (r) => html`<span class="muted truncate" style="display:block;max-width:220px">${r.note || '–'}</span>` },
      { key: 'by', header: 'ผู้บันทึก', hideOnMobile: true, text: (r) => r.recordedBy, cell: (r) => html`<span class="small muted">${r.recordedBy}</span>` },
      {
        key: 'act',
        header: '',
        align: 'right',
        cell: (r) =>
          canGive ? html`<button class="btn-icon sm danger" data-cancel="${r.id}" title="ยกเลิกการให้" aria-label="ยกเลิกการให้">${raw(icon('undo-2'))}</button>` : '',
      },
    ],
    empty: emptyState({ iconName: 'history', title: 'ยังไม่มีประวัติการให้' }),
  });
}

function drawRoster() {
  rosterTable.setRows(roster.filter((r) => filter === 'ALL' || r.status.state === filter));
}

async function load() {
  try {
    // ข้อมูลสวัสดิการล่าสุด (อาจถูกแก้จากหน้าตั้งค่า / ยังไม่อยู่ใน catalog)
    const list = await api.listWelfarePrograms();
    program = list.find((p) => p.id === id) ?? null;
    if (!program) {
      render(
        $('#page'),
        emptyState({ iconName: 'gift', title: 'ไม่พบสวัสดิการนี้', description: 'อาจถูกปิดใช้งาน หรือลิงก์ไม่ถูกต้อง', action: html`<a class="btn" href="index.html">กลับหน้าแรก</a>` }),
      );
      return;
    }
    drawHead();
    if (!historyTable) buildHistoryTable();
    [roster, records] = await Promise.all([api.getWelfareRoster(id), api.listWelfareRecords(id)]);
    drawTabs();
    drawRoster();
    historyTable.setRows(records);
  } catch (e) {
    render($('#roster'), html`<div style="padding:16px">${errorState(e)}</div>`);
  }
}

const changed = () => {
  refreshCounts();
  load();
};

// ----- events -----
on($('#tabs'), 'click', '[data-tab]', (_e, t) => {
  tab = t.dataset.tab;
  setParams({ tab: tab === 'roster' ? '' : tab });
  drawTabs();
});
on($('#filters'), 'click', '[data-filter]', (_e, b) => {
  filter = b.dataset.filter;
  setParams({ state: filter === 'ALL' ? '' : filter });
  drawTabs();
  drawRoster();
});
on($('#roster'), 'click', '[data-give]', (_e, b) => {
  const r = roster.find((x) => x.employee.id === Number(b.dataset.give));
  openWelfareRecord({ program, employee: r.employee, status: r.status, onDone: changed });
});
on($('#history'), 'click', '[data-cancel]', (_e, b) => {
  const r = records.find((x) => x.id === Number(b.dataset.cancel));
  confirmAction({
    title: 'ยกเลิกการให้นี้?',
    description: `${r.employee.firstName} ${r.employee.lastName} · ${welfarePeriodLabel(r.periodKey)}${r.amount !== null ? ` · ${amountText(r.amount, program.unit)}` : ''}`,
    body: 'ใช้กรณีบันทึกผิด — รอบนี้จะกลับไปเป็น “ค้างให้” แล้วบันทึกใหม่ได้ทันที',
    confirmLabel: 'ยกเลิกการให้',
    successMessage: 'ยกเลิกแล้ว — กลับไปเป็น “ค้างให้”',
    action: async () => {
      await api.cancelWelfareRecord(r.id);
      changed();
    },
  });
});
// บันทึกจาก popup รายละเอียดพนักงาน → สถานะเปลี่ยน
document.addEventListener('employee:changed', () => load());

if (program) {
  drawHead();
  drawTabs();
}
load();
refreshCatalog().catch(() => {});
