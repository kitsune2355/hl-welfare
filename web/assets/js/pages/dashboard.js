// หน้า: ภาพรวม & ติดตามงาน (index.html?tab=summary|queue|activity)
//   สรุป    = ตัวเลขหลัก, พนักงานแยกบริษัท, จะครบสิทธิใน 30 วัน
//   คิวงาน  = ทุกเรื่องที่ต้องทำ จัดระดับ ด่วน/ต้องทำ/ติดตาม
//   กิจกรรม = บันทึกกิจกรรม (audit log)
// รีเฟรชอัตโนมัติทุก 60 วินาที + เมื่อกลับมาที่แท็บของเบราว์เซอร์
import { api } from '../app/api.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { progress } from '../ui/loading.js';
import { startTourIfNew } from '../app/tour.js';
import { todayISO } from '../domain/date.js';
import { $, debounce, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { clock, int, relativeDays, thaiDate, thaiDateLong } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { SEVERITY_LABEL, SEVERITY_TONE, TASK_KIND_LABEL } from '../shared/labels.js';
import { alertBox, badge, emptyState, employeeCell, errorState, skeletonCards, skeletonLines, statCard, tabs } from '../ui/components.js';
import { DataTable } from '../ui/table.js';
import { activityFeed } from './_shared.js';

const TABS = ['summary', 'queue', 'activity'];
let tab = TABS.includes(getParam('tab')) ? getParam('tab') : 'summary';
/** id ของเนื้อหาแนะนำการใช้งานตามแท็บ (tour/steps.js) */
const tourId = () => (tab === 'summary' ? 'dashboard' : `dashboard-${tab}`);
initPage('dashboard', { tour: tourId });

const REFRESH_MS = 60_000;
const AUTO_KEY = 'hl-monitor-auto';
const today = todayISO();
const COMPANY_COLOR = { HL: '#2563eb', PRO: '#0891b2', CNS: '#10b981', CIC: '#f59e0b', AS: '#8b5cf6' };

const state = {
  dash: null,
  tasks: null,
  severity: getParam('severity'),
  kind: getParam('kind'),
  q: '',
  entity: '',
  limit: 30,
  todayCount: null,
};

const h = new Date().getHours();
render($('#greeting'), `${h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'} 👋`);
render($('#stats'), skeletonCards(4));
render($('#sev-stats'), skeletonCards(3));
render($('#feed'), skeletonLines(6));

// ===================== แท็บ =====================
function drawTabs() {
  const critical = state.tasks?.filter((t) => t.severity === 'critical').length;
  const open = state.tasks?.length;
  render(
    $('#tabs'),
    tabs(
      [
        { value: 'summary', label: 'สรุป' },
        { value: 'queue', label: 'คิวงาน', count: open || undefined, tone: critical ? 'danger' : 'warning' },
        { value: 'activity', label: 'บันทึกกิจกรรม', count: state.todayCount || undefined, tone: 'primary' },
      ],
      tab,
    ),
  );
  for (const t of TABS) $(`#tab-${t}`).classList.toggle('hidden', t !== tab);
}

on($('#tabs'), 'click', '[data-tab]', (_e, b) => {
  tab = b.dataset.tab;
  setParams({ tab: tab === 'summary' ? '' : tab });
  drawTabs();
  startTourIfNew(tourId()); // แท็บนี้เปิดครั้งแรก → แนะนำการใช้งานของแท็บนี้
});

// ===================== สรุป =====================
const upcoming = new DataTable($('#upcoming'), {
  rowKey: (r) => `${r.employee.id}-${r.benefit}`,
  pageSize: 10,
  columns: [
    { key: 'emp', header: 'พนักงาน', text: (r) => `${r.employee.firstName} ${r.employee.lastName}`, cell: (r) => employeeCell(r.employee, { link: true }) },
    {
      key: 'date',
      header: 'วันที่ครบ',
      align: 'right',
      sort: (r) => r.date,
      text: (r) => thaiDate(r.date),
      cell: (r) => html`<span class="two-line"><span class="num">${thaiDate(r.date)}</span><span class="sub">${relativeDays(r.date, today)}</span></span>`,
    },
  ],
  empty: emptyState({ iconName: 'calendar-clock', title: 'ไม่มีพนักงานที่จะครบสิทธิใน 30 วัน' }),
});

function drawSummary(d) {
  render($('#today'), `ภาพรวมสวัสดิการ ณ ${thaiDateLong(d.today)}`);
  const box = $('#urgent-alert');
  box.classList.toggle('hidden', d.urgentPending === 0);
  if (d.urgentPending > 0) {
    render(
      box,
      alertBox({
        tone: 'danger',
        title: `มีพนักงาน ${d.urgentPending} รายที่ต้องแจ้งออกจากประกันกลุ่มทันที`,
        body: 'กรณีเลิกจ้าง / กระทำผิด ต้องแจ้งบริษัทประกันโดยไม่รอรอบวันที่ 5',
        action: html`<a class="btn btn-danger btn-sm" href="insurance.html?tab=urgent">ไปส่งออกไฟล์</a>`,
      }),
    );
  }
  render(
    $('#stats'),
    html`${statCard({ label: 'พนักงานปัจจุบัน', value: int(d.activeTotal), hint: 'ทุกบริษัทในเครือ', iconName: 'users', href: 'employees.html?status=ACTIVE' })}
    ${statCard({
      label: `รอบแจ้งประกัน ${thaiDate(d.nextCycleDate)}`,
      value: html`${d.nextCycleIn}<small>เข้า</small>${d.nextCycleOut}<small>ออก</small>`,
      hint: relativeDays(d.nextCycleDate, d.today),
      iconName: 'shield-plus',
      tone: 'info',
      href: 'insurance.html',
    })}
    ${statCard({
      label: 'แจ้งออกทันทีค้าง',
      value: d.urgentPending,
      hint: d.urgentPending ? 'ต้องดำเนินการวันนี้' : 'ไม่มีรายการค้าง',
      iconName: 'shield-alert',
      tone: d.urgentPending ? 'danger' : 'success',
      href: 'insurance.html?tab=urgent',
    })}
    ${statCard({ label: 'ชุดฟอร์มค้างแจก', value: d.uniformPending, hint: 'รายการที่ถึงกำหนดแล้ว', iconName: 'shirt', tone: 'warning', href: 'uniform.html' })}`,
  );
  const max = Math.max(1, ...d.activeByCompany.map((c) => c.count));
  render(
    $('#by-company'),
    html`<ul class="bars">
      ${d.activeByCompany.map(
        (c) => html`<li>
          <div class="bar-head"><b>${c.companyCode}</b><span class="muted num">${int(c.count)} คน</span></div>
          <div class="track"><div class="fill" style="width:${(c.count / max) * 100}%;background:${COMPANY_COLOR[c.companyCode]}"></div></div>
        </li>`,
      )}
    </ul>`,
  );
  upcoming.setRows(d.upcomingEligible);
}

// ===================== คิวงาน =====================
/** ลิงก์ไปหน้าที่ใช้แก้งานนั้น */
function taskLink(t) {
  if (t.kind === 'INSURANCE_URGENT') return { href: 'insurance.html?tab=urgent', label: 'ไปส่งออกไฟล์' };
  if (t.kind === 'INSURANCE_IN') return { href: 'insurance.html?tab=in', label: 'ไปส่งออกไฟล์' };
  if (t.kind === 'INSURANCE_OUT') return { href: 'insurance.html?tab=out', label: 'ไปส่งออกไฟล์' };
  if (t.kind === 'UNIFORM_ISSUE') return { href: 'uniform.html', label: 'ไปแจกชุด' };
  if (t.kind === 'PROBATION_MISSING') return { href: `employees.html?q=${encodeURIComponent(t.employee.empCode)}`, label: 'บันทึกข้อมูล' };
  return { href: `employee.html?id=${t.employee.id}`, label: 'ดูพนักงาน' };
}

const taskTable = new DataTable($('#tasks'), {
  rowKey: (t) => t.id,
  pageSize: 25,
  columns: [
    {
      key: 'sev',
      header: 'ระดับ',
      mobile: 'aside',
      cls: 'nowrap',
      text: (t) => SEVERITY_LABEL[t.severity],
      sort: (t) => ({ critical: 0, warning: 1, info: 2 })[t.severity],
      cell: (t) => badge(SEVERITY_LABEL[t.severity], SEVERITY_TONE[t.severity]),
    },
    { key: 'kind', header: 'ประเภท', hideOnMobile: true, cls: 'nowrap', text: (t) => TASK_KIND_LABEL[t.kind], cell: (t) => html`<span class="muted">${TASK_KIND_LABEL[t.kind]}</span>` },
    {
      key: 'task',
      header: 'งาน',
      mobile: 'title',
      text: (t) => t.title,
      cell: (t) => html`<span class="two-line" style="display:block;max-width:260px"
        ><b class="truncate" style="display:block;font-weight:500" title="${t.title}">${t.title}</b
        ><span class="sub truncate" title="${t.detail}">${t.detail}</span></span
      >`,
    },
    { key: 'emp', header: 'พนักงาน', text: (t) => `${t.employee.firstName} ${t.employee.lastName}`, cell: (t) => employeeCell(t.employee, { link: true }) },
    {
      key: 'due',
      header: 'กำหนด',
      cls: 'nowrap',
      sort: (t) => t.dueDate,
      text: (t) => (t.dueDate ? thaiDate(t.dueDate) : ''),
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
        return html`<a class="btn btn-sm ${t.severity === 'critical' ? 'btn-primary' : ''}" href="${l.href}" title="${l.label}" aria-label="${l.label}"
          >${raw(icon('arrow-right'))}<span class="label-xl">${l.label}</span></a
        >`;
      },
    },
  ],
  empty: '',
});

function drawQueue() {
  const all = state.tasks ?? [];
  const term = state.q.trim().toLowerCase();
  const shown = all.filter(
    (t) =>
      (!state.severity || t.severity === state.severity) &&
      (!state.kind || t.kind === state.kind) &&
      (!term || `${t.employee.empCode} ${t.employee.firstName} ${t.employee.lastName} ${t.title}`.toLowerCase().includes(term)),
  );
  const count = (s) => all.filter((t) => t.severity === s).length;
  const SEV = [
    ['critical', 'alert-octagon', 'เลยกำหนด / ต้องทำทันที'],
    ['warning', 'list-todo', 'ครบกำหนดภายใน 7 วัน'],
    ['info', 'eye', 'รอรอบถัดไป / รอยืนยัน'],
  ];
  render(
    $('#sev-stats'),
    html`${SEV.map(
      ([s, ic, hint]) => html`<button type="button" class="stat compact${state.severity === s ? ' selected' : ''}" data-severity="${s}">
        <span class="stat-icon tone-${count(s) ? SEVERITY_TONE[s] : 'success'}">${raw(icon(ic))}</span>
        <span style="flex:1;min-width:0"><span class="stat-label">${SEVERITY_LABEL[s]}</span><span class="stat-hint">${hint}</span></span>
        <span class="stat-value">${count(s)}</span>
      </button>`,
    )}`,
  );
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
  taskTable.o.empty = emptyState({
    iconName: 'circle-check',
    title: all.length ? 'ไม่มีงานตามตัวกรองนี้' : 'ไม่มีงานค้าง 🎉',
    description: all.length ? 'ลองล้างตัวกรอง' : 'ทุกอย่างเรียบร้อยดี',
  });
  taskTable.page = 1;
  taskTable.setRows(shown);
}

on($('#sev-stats'), 'click', '[data-severity]', (_e, b) => {
  state.severity = state.severity === b.dataset.severity ? '' : b.dataset.severity;
  setParams({ severity: state.severity });
  drawQueue();
});
on($('#kinds'), 'click', '[data-kind]', (_e, b) => {
  state.kind = state.kind === b.dataset.kind ? '' : b.dataset.kind;
  setParams({ kind: state.kind });
  drawQueue();
});
on($('#kinds'), 'click', '[data-clear]', () => {
  state.kind = '';
  state.severity = '';
  setParams({ kind: '', severity: '' });
  drawQueue();
});
$('#q').addEventListener('input', debounce((e) => ((state.q = e.target.value), drawQueue()), 200));

// ===================== บันทึกกิจกรรม =====================
async function loadActivity() {
  try {
    const items = await api.listActivity({ entity: state.entity || undefined, limit: state.limit });
    render($('#feed'), activityFeed(items));
    $('#more-wrap').classList.toggle('hidden', items.length < state.limit);
    const all = state.entity ? await api.listActivity({ limit: 500 }) : items;
    state.todayCount = all.filter((a) => a.at.startsWith(today)).length;
    render($('#today-count'), badge(`วันนี้ ${state.todayCount} รายการ`, 'primary'));
    drawTabs();
  } catch {
    render($('#feed'), html`<p class="small text-danger" style="padding:16px">โหลดบันทึกกิจกรรมไม่สำเร็จ</p>`);
  }
}
$('#entity').addEventListener('change', (e) => {
  state.entity = e.target.value;
  state.limit = 30;
  loadActivity();
});
$('#more').onclick = () => {
  state.limit += 30;
  loadActivity();
};

// ===================== โหลด + รีเฟรชอัตโนมัติ =====================
async function refresh() {
  $('#refresh').disabled = true;
  try {
    const [dash, tasks] = await Promise.all([api.getDashboard(), api.getWorkQueue()]);
    state.dash = dash;
    state.tasks = tasks;
    drawSummary(dash);
    drawQueue();
    drawTabs();
    render($('#updated'), `อัปเดต ${clock(new Date())}`);
  } catch (e) {
    render($('#stats'), errorState(e));
  }
  await loadActivity();
  $('#refresh').disabled = false;
  refreshCounts();
}

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
  if (v) timer = setInterval(() => progress.quiet(refresh), REFRESH_MS); // รีเฟรชเบื้องหลัง ไม่ขึ้น loading กลางจอ
  try {
    localStorage.setItem(AUTO_KEY, v ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}
$('#auto').onclick = () => setAuto(!auto);
$('#refresh').onclick = refresh;
document.addEventListener('visibilitychange', () => auto && document.visibilityState === 'visible' && progress.quiet(refresh));
setAuto(auto);

drawTabs();
refresh();
