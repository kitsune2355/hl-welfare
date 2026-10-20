// หน้า: ชุดฟอร์ม (uniform.html?tab=history)
import { api } from '../app/api.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { startTourIfNew } from '../app/tour.js';
import { diffDays, todayISO } from '../domain/date.js';
import { downloadCsv } from '../shared/csv.js';
import { $, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { relativeDays, thaiDate } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { UNIFORM_EVENT_LABEL } from '../shared/labels.js';
import { badge, emptyState, employeeCell, errorState, tabs } from '../ui/components.js';
import { confirmAction } from '../ui/overlay.js';
import { DataTable } from '../ui/table.js';
import { isHandedOut, isStockIssue } from '../domain/uniform.js';
import { alertBox } from '../ui/components.js';
import { STOCK_STAGE, canCancelIssue, enhanceIssueActions, issueAction, stockDocLink, syncStockQuietly, wireIssueActions } from './_shared.js';

/** คำแนะนำการใช้งานตามแท็บ (tour/steps.js) */
const tourId = () => ({ waiting: 'uniform-waiting', history: 'uniform-history' })[getParam('tab')] ?? 'uniform';
initPage('uniform', { tour: tourId });

const today = todayISO();
const OVERDUE_DAYS = 30;
const TABS = ['pending', 'waiting', 'history'];
let tab = TABS.includes(getParam('tab')) ? getParam('tab') : 'pending';
let pending = null;
let issues = null; // แจกแล้ว (บันทึกเอง + คลังจ่ายแล้ว)
let waiting = null; // ส่งเบิกคลังแล้ว รอคลังจ่าย
let employees = new Map();
const pieces = (label) => label.split('+').reduce((s, x) => s + Number(x), 0); // "2+1" → 3
const annualYear = (key) => ` ${Number(key.slice(7)) + 543}`;

const pendingTable = new DataTable($('#pending'), {
  rowKey: (r) => `${r.employee.id}-${r.entitlementKey}`,
  pageSize: 25,
  onRender: enhanceIssueActions,
  columns: [
    { key: 'emp', header: 'พนักงาน', cell: (r) => employeeCell(r.employee, { link: true }) },
    {
      key: 'ev',
      header: 'รอบ / แบบ',
      text: (r) => UNIFORM_EVENT_LABEL[r.event],
      cell: (r) => html`<span class="two-line" style="display:block;max-width:240px"
        ><b style="font-weight:500">${UNIFORM_EVENT_LABEL[r.event]} · ${r.qtyLabel} ตัว</b><span class="sub truncate">${r.style}</span></span
      >`,
    },
    {
      key: 'due',
      header: 'ครบกำหนด',
      sort: (r) => r.dueDate,
      text: (r) => thaiDate(r.dueDate),
      hideOnMobile: true,
      cls: 'nowrap',
      cell: (r) =>
        html`<span class="two-line"
          ><span class="num">${thaiDate(r.dueDate)}</span>${diffDays(r.dueDate, today) > OVERDUE_DAYS
            ? html`<span class="sub">${badge('เกินกำหนด', 'danger')}</span>`
            : html`<span class="sub">${relativeDays(r.dueDate, today)}</span>`}</span
        >`,
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      cell: (r) =>
        issueAction({ employeeId: r.employee.id, entitlementKey: r.entitlementKey, event: r.event, qty: pieces(r.qtyLabel), name: `${r.employee.firstName} ${r.employee.lastName}` }),
    },
  ],
  empty: emptyState({ iconName: 'package-check', title: 'แจกครบทุกรายการแล้ว 🎉', description: 'ไม่มีชุดฟอร์มค้างแจก' }),
});

const empCol = { key: 'emp', header: 'พนักงาน', mobile: 'title', cell: (i) => (employees.get(i.employeeId) ? employeeCell(employees.get(i.employeeId), { link: true }) : `#${i.employeeId}`) };
const roundCol = { key: 'ev', header: 'รอบ', cell: (i) => `${UNIFORM_EVENT_LABEL[i.event]}${i.event === 'ANNUAL' ? annualYear(i.entitlementKey) : ''}` };
const stockItems = (i) => i.stock.items.map((x) => `${x.name} × ${x.qty}`).join(', ');

const waitingTable = new DataTable($('#waiting'), {
  rowKey: (i) => i.id,
  pageSize: 25,
  columns: [
    { key: 'date', header: 'วันที่ส่งเบิก', mobile: 'field', sort: (i) => i.issuedAt, cell: (i) => html`<span class="num">${thaiDate(i.issuedAt)}</span>` },
    empCol,
    roundCol,
    { key: 'doc', header: 'ใบเบิก', mobile: 'aside', sort: (i) => i.stock.docNo, cell: (i) => stockDocLink(i.stock) },
    { key: 'items', header: 'รายการ', hideOnMobile: true, cell: (i) => html`<span class="muted truncate" style="display:block;max-width:320px" title="${stockItems(i)}">${stockItems(i)}</span>` },
    { key: 'by', header: 'ส่งโดย', hideOnMobile: true, cell: (i) => html`<span class="muted">${i.issuedBy}</span>` },
    {
      key: 'cancel',
      header: '',
      align: 'right',
      cell: (i) =>
        !canCancelIssue(true) ? '' : html`<button class="btn-icon sm danger" data-cancel-issue="${i.id}" title="ยกเลิกการส่งเบิก" aria-label="ยกเลิกการส่งเบิก">${raw(icon('undo-2'))}</button>`,
    },
  ],
  empty: emptyState({ iconName: 'package-check', title: 'ไม่มีใบที่รอคลังจ่าย', description: 'กด “ส่งเบิกคลัง” ที่แท็บค้างแจก แล้วใบจะมารออยู่ที่นี่' }),
});

const historyTable = new DataTable($('#history'), {
  rowKey: (i) => i.id,
  pageSize: 25,
  columns: [
    { key: 'date', header: 'วันที่แจก', mobile: 'field', sort: (i) => i.issuedAt, cell: (i) => html`<span class="num">${thaiDate(i.issuedAt)}</span>` },
    empCol,
    roundCol,
    { key: 'qty', header: 'จำนวน', align: 'right', sort: (i) => i.qty, cell: (i) => html`<span class="num">${i.qty} ตัว</span>` },
    { key: 'size', header: 'ไซซ์', align: 'center', mobile: 'aside', cell: (i) => badge(i.size, 'primary', { dot: false }) },
    {
      key: 'src',
      header: 'ที่มา',
      hideOnMobile: true,
      text: (i) => (isStockIssue(i) ? i.stock.docNo : 'บันทึกเอง'),
      cell: (i) =>
        isStockIssue(i)
          ? html`<span class="row" style="gap:6px">${stockDocLink(i.stock)} ${badge(STOCK_STAGE[i.stock.stage].label, STOCK_STAGE[i.stock.stage].tone)}</span>`
          : badge('บันทึกเอง', 'neutral'),
    },
    { key: 'by', header: 'บันทึกโดย', hideOnMobile: true, cell: (i) => html`<span class="muted">${i.issuedBy}</span>` },
    {
      key: 'cancel',
      header: '',
      align: 'right',
      // ผ่านคลังแล้วยกเลิกที่นี่ไม่ได้ — สต็อกถูกตัดไปแล้ว ต้องให้คลังยกเลิกใบจ่าย
      cell: (i) =>
        isStockIssue(i) || !canCancelIssue(false)
          ? ''
          : html`<button class="btn-icon sm danger" data-cancel-issue="${i.id}" title="ยกเลิกการแจก" aria-label="ยกเลิกการแจก">${raw(icon('undo-2'))}</button>`,
    },
  ],
  empty: emptyState({ iconName: 'history', title: 'ยังไม่มีประวัติการแจก' }),
});

function drawTabs() {
  render(
    $('#tabs'),
    tabs(
      [
        { value: 'pending', label: 'ค้างแจก', count: pending?.length },
        { value: 'waiting', label: 'รอคลังจ่าย', count: waiting?.length },
        { value: 'history', label: 'ประวัติการแจก', count: issues?.length },
      ],
      tab,
    ),
  );
  for (const t of TABS) $(`#tab-${t}`).classList.toggle('hidden', tab !== t);
}

function drawSummary() {
  const m = new Map();
  for (const r of pending) {
    const cur = m.get(r.style) ?? { people: 0, pieces: 0 };
    m.set(r.style, { people: cur.people + 1, pieces: cur.pieces + pieces(r.qtyLabel) });
  }
  const list = [...m.entries()].sort((a, b) => b[1].pieces - a[1].pieces);
  render(
    $('#summary'),
    list.length
      ? html`<ul class="summary-list">
          ${list.map(
            ([style, s]) => html`<li>
              <span style="min-width:0"><b class="truncate" style="display:block;font-weight:500">${style}</b><span class="small muted">${s.people} คน</span></span>
              <span class="big">${s.pieces} <span class="small muted" style="font-weight:400">ตัว</span></span>
            </li>`,
          )}
        </ul>`
      : html`<p class="small muted" style="padding:20px">ไม่มีรายการค้าง</p>`,
  );
}

async function load() {
  try {
    const warn = await syncStockQuietly();
    render($('#stock-warn'), warn ? alertBox({ tone: 'warning', body: warn }) : '');
    const [p, i, emps] = await Promise.all([api.listUniformPending(), api.listUniformIssues(), api.listEmployees()]);
    pending = p;
    issues = i.filter(isHandedOut);
    waiting = i.filter((x) => !isHandedOut(x));
    employees = new Map(emps.map((e) => [e.id, e]));
    drawTabs();
    drawSummary();
    pendingTable.setRows(pending);
    waitingTable.setRows(waiting);
    historyTable.setRows(issues);
  } catch (e) {
    render($('#pending'), html`<div style="padding:16px">${errorState(e)}</div>`);
  }
}

// ----- events -----
on($('#tabs'), 'click', '[data-tab]', (_e, t) => {
  tab = t.dataset.tab;
  setParams({ tab: tab === 'pending' ? '' : tab });
  drawTabs();
  startTourIfNew(tourId());
});
wireIssueActions($('#pending'), { today, onDone: load });
// แจก/ส่งเบิกจาก popup รายละเอียดพนักงาน → รายการค้างแจกเปลี่ยน
document.addEventListener('employee:changed', () => load());
on($('#waiting'), 'click', '[data-cancel-issue]', (_e, b) => {
  const i = waiting.find((x) => x.id === Number(b.dataset.cancelIssue));
  confirmAction({
    title: `ยกเลิกการส่งเบิก ${i.stock.docNo}?`,
    description: `${UNIFORM_EVENT_LABEL[i.event]} · ${stockItems(i)}`,
    body: 'ใบเบิกในระบบสต็อกจะถูกยกเลิกด้วย และรายการจะกลับไปเป็น “ค้างแจก” — ยกเลิกได้เฉพาะใบที่คลังยังไม่จ่าย',
    confirmLabel: 'ยกเลิกการส่งเบิก',
    successMessage: 'ยกเลิกแล้ว — รายการกลับไปเป็น “ค้างแจก”',
    action: async () => {
      await api.cancelUniformIssue(i.id);
      refreshCounts();
      await load();
    },
  });
});
$('#sync').onclick = () => load();
on($('#history'), 'click', '[data-cancel-issue]', (_e, b) => {
  const i = issues.find((x) => x.id === Number(b.dataset.cancelIssue));
  confirmAction({
    title: 'ยกเลิกการแจกนี้?',
    description: `${UNIFORM_EVENT_LABEL[i.event]} · ${i.qty} ตัว · ไซซ์ ${i.size}`,
    body: 'ใช้กรณีบันทึกผิด — รายการจะกลับไปเป็น “ค้างแจก”',
    confirmLabel: 'ยกเลิกการแจก',
    successMessage: 'ยกเลิกแล้ว — รายการกลับไปเป็น “ค้างแจก”',
    action: async () => {
      await api.cancelUniformIssue(i.id);
      refreshCounts();
      await load();
    },
  });
});

$('#export').onclick = () =>
  downloadCsv(
    'uniform-pending.csv',
    ['รหัสพนักงาน', 'ชื่อ', 'นามสกุล', 'บริษัท', 'รอบ', 'ครบกำหนด', 'จำนวน', 'แบบ'],
    (pending ?? []).map((r) => [r.employee.empCode, r.employee.firstName, r.employee.lastName, r.employee.companyCode, UNIFORM_EVENT_LABEL[r.event], r.dueDate, r.qtyLabel, r.style]),
  );

drawTabs();
load();
