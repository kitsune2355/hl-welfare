// หน้า: ศูนย์ติดตามงาน (monitor.html) — คิวงาน + บันทึกกิจกรรม + รีเฟรชอัตโนมัติ
import { api } from '../app/api.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { todayISO } from '../domain/date.js';
import { $, debounce, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { clock, thaiDate } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { SEVERITY_LABEL, SEVERITY_TONE, TASK_KIND_LABEL } from '../shared/labels.js';
import { badge, emptyState, employeeCell, errorState, skeletonCards, skeletonLines, statCard } from '../ui/components.js';
import { DataTable } from '../ui/table.js';
import { activityFeed } from './_shared.js';

initPage('monitor');

const REFRESH_MS = 60_000;
const AUTO_KEY = 'hl-monitor-auto';
const today = todayISO();

const state = {
  tasks: null,
  severity: getParam('severity'),
  kind: getParam('kind'),
  q: '',
  entity: '',
  limit: 20,
  todayCount: null,
};

/** ลิงก์ไปหน้าที่ใช้แก้งานนั้น */
function taskLink(t) {
  if (t.kind.startsWith('INSURANCE')) return { href: 'insurance.html', label: 'ไปส่งแจ้ง' };
  if (t.kind === 'UNIFORM_ISSUE') return { href: 'uniform.html', label: 'ไปแจกชุด' };
  if (t.kind === 'PROBATION_MISSING') return { href: `employee-form.html?id=${t.employee.id}`, label: 'บันทึกข้อมูล' };
  return { href: `employee.html?id=${t.employee.id}`, label: 'ดูพนักงาน' };
}

const table = new DataTable($('#tasks'), {
  rowKey: (t) => t.id,
  pageSize: 15,
  columns: [
    { key: 'sev', header: 'ระดับ', mobile: 'aside', cls: 'nowrap', cell: (t) => badge(SEVERITY_LABEL[t.severity], SEVERITY_TONE[t.severity]) },
    {
      key: 'task',
      header: 'งาน',
      mobile: 'title',
      cell: (t) => html`<span class="two-line" style="display:block;max-width:220px"
        ><b class="truncate" style="display:block;font-weight:500" title="${t.title}">${t.title}</b
        ><span class="sub truncate" title="${t.detail}">${t.detail}</span></span
      >`,
    },
    { key: 'emp', header: 'พนักงาน', cell: (t) => employeeCell(t.employee, { link: true }) },
    {
      key: 'due',
      header: 'กำหนด',
      cls: 'nowrap',
      cell: (t) =>
        t.dueDate
          ? html`<span class="two-line"
              ><span class="num">${thaiDate(t.dueDate)}</span>${t.overdueDays > 0
                ? html`<span class="sub text-danger" style="font-weight:500">เลยมา ${t.overdueDays} วัน</span>`
                : html`<span class="sub">ยังไม่ถึง</span>`}</span
            >`
          : html`<span class="muted">–</span>`,
    },
    {
      key: 'go',
      header: '',
      align: 'right',
      cls: 'nowrap',
      cell: (t) => {
        const l = taskLink(t);
        return html`<a class="btn btn-sm ${t.severity === 'critical' ? 'btn-primary' : ''}" href="${l.href}">${raw(icon('arrow-right'))} ${l.label}</a>`;
      },
    },
  ],
  empty: '',
});

function drawTasks() {
  const all = state.tasks ?? [];
  const term = state.q.trim().toLowerCase();
  const shown = all.filter(
    (t) =>
      (!state.severity || t.severity === state.severity) &&
      (!state.kind || t.kind === state.kind) &&
      (!term || `${t.employee.empCode} ${t.employee.firstName} ${t.employee.lastName} ${t.title}`.toLowerCase().includes(term)),
  );

  // การ์ดสรุป
  const count = (s) => all.filter((t) => t.severity === s).length;
  const SEV = [
    ['critical', 'alert-octagon', 'เลยกำหนด / ต้องทำทันที'],
    ['warning', 'list-todo', 'ครบกำหนดภายใน 7 วัน'],
    ['info', 'eye', 'รอรอบถัดไป / รอยืนยัน'],
  ];
  render(
    $('#stats'),
    html`${SEV.map(
      ([s, ic, hint]) => html`<button type="button" class="stat${state.severity === s ? ' selected' : ''}" data-severity="${s}">
        <div class="stat-top"><span class="stat-label">${SEVERITY_LABEL[s]}</span><span class="stat-icon tone-${count(s) ? SEVERITY_TONE[s] : 'success'}">${raw(icon(ic))}</span></div>
        <div class="stat-value">${count(s)}</div>
        <div class="stat-hint">${hint}</div>
      </button>`,
    )}
    ${statCard({ label: 'กิจกรรมวันนี้', value: raw(`<span id="today-count">${state.todayCount ?? '–'}</span>`), hint: 'เพิ่ม / แก้ไข / ลบ / ส่งแจ้ง', iconName: 'activity' })}`,
  );

  // ชิปกรองตามประเภท
  const kindCounts = {};
  for (const t of all) if (!state.severity || t.severity === state.severity) kindCounts[t.kind] = (kindCounts[t.kind] ?? 0) + 1;
  render(
    $('#kinds'),
    html`<button class="chip${!state.kind ? ' active' : ''}" data-kind="">ทั้งหมด</button>
      ${Object.keys(TASK_KIND_LABEL).map((k) =>
        kindCounts[k] || state.kind === k
          ? html`<button class="chip${state.kind === k ? ' active' : ''}" data-kind="${k}">${TASK_KIND_LABEL[k]} <span class="n num">${kindCounts[k] ?? 0}</span></button>`
          : '',
      )}
      ${state.severity || state.kind ? html`<button class="chip" data-clear style="border-style:dashed">ล้างตัวกรอง</button>` : ''}`,
  );

  render($('#task-count'), badge(`${shown.length} รายการ`, shown.length ? 'warning' : 'success'));
  table.o.empty = emptyState({
    iconName: 'circle-check',
    title: all.length ? 'ไม่มีงานตามตัวกรองนี้' : 'ไม่มีงานค้าง 🎉',
    description: all.length ? 'ลองล้างตัวกรอง' : 'ทุกอย่างเรียบร้อยดี',
  });
  table.page = 1;
  table.setRows(shown);
}

async function loadTasks() {
  try {
    state.tasks = await api.getWorkQueue();
    drawTasks();
    render($('#updated'), `อัปเดต ${clock(new Date())}`);
  } catch (e) {
    render($('#stats'), '');
    render($('#tasks'), html`<div style="padding:16px">${errorState(e)}</div>`);
  }
}

async function loadActivity() {
  try {
    const items = await api.listActivity({ entity: state.entity || undefined, limit: state.limit });
    render($('#feed'), activityFeed(items));
    $('#more-wrap').classList.toggle('hidden', items.length < state.limit);
    const all = state.entity ? await api.listActivity({ limit: 500 }) : items;
    state.todayCount = all.filter((a) => a.at.startsWith(today)).length;
    const el = $('#today-count');
    if (el) el.textContent = String(state.todayCount);
  } catch {
    render($('#feed'), html`<p class="small text-danger" style="padding:16px">โหลดบันทึกกิจกรรมไม่สำเร็จ</p>`);
  }
}

const refresh = async () => {
  $('#refresh').disabled = true;
  await Promise.all([loadTasks(), loadActivity()]);
  $('#refresh').disabled = false;
  refreshCounts();
};

// ----- events -----
on($('#stats'), 'click', '[data-severity]', (_e, b) => {
  state.severity = state.severity === b.dataset.severity ? '' : b.dataset.severity;
  setParams({ severity: state.severity });
  drawTasks();
});
on($('#kinds'), 'click', '[data-kind]', (_e, b) => {
  state.kind = state.kind === b.dataset.kind ? '' : b.dataset.kind;
  setParams({ kind: state.kind });
  drawTasks();
});
on($('#kinds'), 'click', '[data-clear]', () => {
  state.kind = '';
  state.severity = '';
  setParams({ kind: '', severity: '' });
  drawTasks();
});
$('#q').addEventListener('input', debounce((e) => ((state.q = e.target.value), drawTasks()), 200));
$('#entity').addEventListener('change', (e) => {
  state.entity = e.target.value;
  state.limit = 20;
  loadActivity();
});
$('#more').onclick = () => {
  state.limit += 20;
  loadActivity();
};
$('#refresh').onclick = refresh;

// ----- รีเฟรชอัตโนมัติทุก 60 วินาที + เมื่อกลับมาที่แท็บ -----
let auto = true;
try {
  auto = localStorage.getItem(AUTO_KEY) !== 'off';
} catch {
  /* ignore */
}
let timer = null;
function setAuto(v) {
  auto = v;
  $('#auto').setAttribute('aria-checked', String(v));
  $('#live-dot').classList.toggle('on', v);
  clearInterval(timer);
  if (v) timer = setInterval(refresh, REFRESH_MS);
  try {
    localStorage.setItem(AUTO_KEY, v ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}
$('#auto').onclick = () => setAuto(!auto);
document.addEventListener('visibilitychange', () => auto && document.visibilityState === 'visible' && refresh());
setAuto(auto);

render($('#stats'), skeletonCards(4));
render($('#feed'), skeletonLines(5));
await refresh();
