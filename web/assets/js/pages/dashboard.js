// หน้า: ภาพรวม & ติดตามงาน (index.html) — หน้าเดียว ไม่มีแท็บ ทั้งหน้าเป็น bento dashboard
//   ช่อง: รอบแจ้งประกัน (ใหญ่) · แจ้งออกทันที · ชุดฟอร์มค้าง · พนักงาน · จะครบสิทธิใน 30 วัน
//         · คิวงาน (#queue — กรองระดับ ด่วน/ต้องทำ/ติดตาม + ประเภท) · บันทึกกิจกรรม (#activity)
//   ลิงก์เก่า ?tab=queue|activity → เลื่อนไปส่วนนั้น
// รีเฟรชอัตโนมัติทุก 60 วินาที + เมื่อกลับมาที่แท็บของเบราว์เซอร์
import { api } from '../app/api.js';
import { myCompany } from '../app/auth.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { progress } from '../ui/loading.js';
import { diffDays, todayISO } from '../domain/date.js';
import { $, debounce, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { clock, int, relativeDays, thaiDate, thaiDateLong } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { SEVERITY_LABEL, SEVERITY_TONE, TASK_KIND_LABEL } from '../shared/labels.js';
import { badge, emptyState, employeeCell, errorState, skeletonLines } from '../ui/components.js';
import { DataTable } from '../ui/table.js';
import { activityFeed } from './_shared.js';

/** ลิงก์เก่าที่ชี้แท็บ (?tab=queue|activity) → เลื่อนไปส่วนนั้นหลังโหลด */
const jumpTo = ['queue', 'activity'].includes(getParam('tab')) ? getParam('tab') : '';
initPage('dashboard', { tour: 'dashboard' });

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
render($('#feed'), skeletonLines(6));

/** เลื่อนไปส่วน #queue / #activity (เผื่อแถบบนที่ติดอยู่) */
function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===================== สรุป =====================
const upcoming = new DataTable($('#upcoming'), {
  rowKey: (r) => `${r.employee.id}-${r.benefit}`,
  pageSize: 5, // ช่อง bento 1/3 แถว — 5 คนต่อหน้า
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

/** หัวของช่อง bento: ไอคอน + ชื่อ + ลิงก์ (ถ้ามี) */
const tileHead = (iconName, title, sub = '', link = null) => html`<header class="tile-head">
  <span class="tile-ic">${raw(icon(iconName))}</span>
  <div class="grow"><h2>${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div>
  ${link ? html`<a class="tile-link" href="${link.href}" ${link.tab ? raw(`data-goto-tab="${link.tab}"`) : ''}>${link.label} ${raw(icon('chevron-right'))}</a>` : ''}
</header>`;

function drawSummary(d) {
  render($('#today'), `ภาพรวมสวัสดิการ ณ ${thaiDateLong(d.today)}`);
  const days = diffDays(d.today, d.nextCycleDate);
  // ช่องใหญ่: รอบแจ้งประกันถัดไป (นับถอยหลัง + จำนวนเข้า/ออก)
  render(
    $('#t-cycle'),
    html`<div class="cycle-top">
        <span class="tile-kicker">${raw(icon('shield-plus'))} รอบแจ้งประกันกลุ่มถัดไป</span>
        <span class="cycle-date">${thaiDateLong(d.nextCycleDate)}</span>
      </div>
      <div class="cycle-main">
        <div class="cycle-count"><b class="num">${days <= 0 ? 'วันนี้' : days}</b>${days > 0 ? html`<span>วัน<br />ถึงรอบ</span>` : ''}</div>
        <div class="cycle-io">
          <a href="insurance.html?tab=in" class="io-tile"><span class="num">${int(d.nextCycleIn)}</span><small>แจ้งเข้า</small></a>
          <a href="insurance.html?tab=out" class="io-tile"><span class="num">${int(d.nextCycleOut)}</span><small>แจ้งออก</small></a>
        </div>
      </div>
      <div class="cycle-actions">
        <a class="btn btn-sm cycle-btn" href="insurance.html">${raw(icon('file-spreadsheet'))} ไปส่งออกไฟล์แจ้งประกัน</a>
        <span class="cycle-note">${relativeDays(d.nextCycleDate, d.today)} · ส่งออกครั้งเดียวได้ไฟล์ของทุกบริษัทประกัน</span>
      </div>`,
  );
  // แจ้งออกทันที (แดงเมื่อมีค้าง)
  const urgent = $('#t-urgent');
  urgent.classList.toggle('is-alert', d.urgentPending > 0);
  render(
    urgent,
    html`${tileHead('shield-alert', 'แจ้งออกทันทีค้าง', 'เลิกจ้าง / กระทำผิด — ไม่รอรอบวันที่ 5')}
      <div class="tile-big"><b class="num">${int(d.urgentPending)}</b><span>${d.urgentPending ? 'ราย ต้องแจ้งวันนี้' : 'ไม่มีรายการค้าง'}</span></div>
      ${d.urgentPending
        ? html`<a class="btn btn-danger btn-sm" href="insurance.html?tab=urgent">ไปส่งออกไฟล์ ${raw(icon('chevron-right'))}</a>`
        : html`<span class="tile-ok">${raw(icon('circle-check'))} เรียบร้อย</span>`}`,
  );
  // ชุดฟอร์มค้างแจก
  render(
    $('#t-uniform'),
    html`${tileHead('shirt', 'ชุดฟอร์มค้างแจก', 'ถึงกำหนดแล้ว ยังไม่ได้แจก / ส่งเบิก')}
      <div class="tile-big"><b class="num">${int(d.uniformPending)}</b><span>รายการ</span></div>
      <a class="btn btn-sm" href="uniform.html">${d.uniformPending ? 'ไปแจก / ส่งเบิกคลัง' : 'ดูหน้าชุดฟอร์ม'} ${raw(icon('chevron-right'))}</a>`,
  );
  // พนักงานปัจจุบัน + สัดส่วนแยกบริษัท (แถบเดียวต่อกัน + ตัวเลขรายบริษัท)
  const total = Math.max(1, d.activeTotal);
  render(
    $('#t-people'),
    html`${tileHead('users', 'พนักงานปัจจุบัน', myCompany() ? `บริษัท ${myCompany()}` : 'ทุกบริษัทในเครือ', { href: 'employees.html?status=ACTIVE', label: 'ดูทั้งหมด' })}
      <div class="tile-big"><b class="num">${int(d.activeTotal)}</b><span>คน</span></div>
      <div class="stack-bar" role="img" aria-label="สัดส่วนพนักงานแยกบริษัท">
        ${d.activeByCompany.filter((c) => c.count).map((c) => html`<i style="width:${(c.count / total) * 100}%;background:${COMPANY_COLOR[c.companyCode]}" title="${c.companyCode} ${c.count} คน"></i>`)}
      </div>
      <ul class="co-list">
        ${d.activeByCompany.map(
          (c) => html`<li><a href="employees.html?status=ACTIVE&company=${c.companyCode}"><i style="background:${COMPANY_COLOR[c.companyCode]}"></i><b>${c.companyCode}</b><span class="num">${int(c.count)}</span></a></li>`,
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
        return html`<a class="btn btn-sm task-go ${t.severity === 'critical' ? 'btn-primary' : ''}" href="${l.href}" title="${l.label}" aria-label="${l.label}"
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
  const SEV_HINT = { critical: 'เลยกำหนด / ทำทันที', warning: 'ภายใน 7 วัน', info: 'รอรอบ / รอยืนยัน' };
  render(
    $('#sev-row'),
    html`${['critical', 'warning', 'info'].map(
      (sv) => html`<button type="button" class="sev-pill tone-${SEVERITY_TONE[sv]}${state.severity === sv ? ' active' : ''}" data-severity="${sv}" aria-pressed="${state.severity === sv ? 'true' : 'false'}" title="กดเพื่อกรอง · กดซ้ำ = ยกเลิก">
        <b class="num">${count(sv)}</b><span>${SEVERITY_LABEL[sv]} · ${SEV_HINT[sv]}</span>
      </button>`,
    )}`,
  );
  const kindCounts = {};
  for (const t of all) if (!state.severity || t.severity === state.severity) kindCounts[t.kind] = (kindCounts[t.kind] ?? 0) + 1;
  render(
    $('#kinds'),
    html`<button class="chip${!state.kind ? ' active' : ''}" data-kind="">ทุกประเภท</button>
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

on($('#sev-row'), 'click', '[data-severity]', (_e, b) => {
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
    render($('#today-count'), `ใคร ทำอะไร เมื่อไร · วันนี้ ${state.todayCount} รายการ`);
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
    render($('#updated'), `อัปเดต ${clock(new Date())}`);
  } catch (e) {
    render($('#t-cycle'), errorState(e));
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

refresh().then(() => {
  if (!jumpTo) return;
  setParams({ tab: '' });
  scrollToSection(jumpTo);
});
