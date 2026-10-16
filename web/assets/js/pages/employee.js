// หน้า: รายละเอียดพนักงาน (employee.html?id=)
import { api } from '../app/api.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { todayISO } from '../domain/date.js';
import { formatThaiId } from '../domain/thaiId.js';
import { $, getParam, html, on, raw, render } from '../shared/dom.js';
import { money, relativeDays, tenure, thaiDate } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import {
  CONTRACT_LABEL,
  EMPLOYEE_TYPE_LABEL,
  EMPLOYEE_TYPE_TONE,
  END_REASON_LABEL,
  GENDER_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  UNIFORM_EVENT_LABEL,
  UNIFORM_ITEM_LABEL,
} from '../shared/labels.js';
import { alertBox, avatar, badge, card, emptyState, errorState, infoList, progress } from '../ui/components.js';
import { confirmAction } from '../ui/overlay.js';
import { DataTable } from '../ui/table.js';
import { activityFeed, enhanceIssueActions, issueAction, wireIssueActions } from './_shared.js';

initPage('employees', { tour: 'employee' });

const id = Number(getParam('id'));
const today = todayISO();

const reasons = (list) => html`<ul class="reasons">${list.map((r) => html`<li>${r}</li>`)}</ul>`;

function timeline(steps) {
  return html`<ol class="timeline">
    ${steps.map(
      (s) => html`<li class="${s.date && s.date <= today ? 'done' : ''} ${s.tone ?? ''}"><span>${s.label}</span><b class="num">${thaiDate(s.date)}</b></li>`,
    )}
  </ol>`;
}

function insuranceCard(emp, st) {
  let b = badge('ไม่มีสิทธิ', 'danger', { lg: true });
  if (st.eligible) {
    if (st.exitUrgent) b = badge('แจ้งออกทันที', 'danger', { lg: true });
    else if (st.exitDate) b = badge('แจ้งออก', 'warning', { lg: true });
    else if (st.eligibleDate && st.eligibleDate > today) b = badge('รอครบสิทธิ', 'info', { lg: true });
    else b = badge('มีสิทธิ', 'success', { lg: true });
  }
  const steps = [
    { label: 'เริ่มงาน', date: emp.startDate },
    { label: 'ครบอายุงาน', date: st.eligibleDate },
    { label: 'รอบแจ้งเข้า', date: st.enrollCycleDate },
  ];
  if (st.exitDate) {
    steps.push({ label: 'วันมีผลออก', date: st.exitDate, tone: st.exitUrgent ? 'danger' : 'warning' });
    if (!st.exitUrgent) steps.push({ label: 'รอบแจ้งออก', date: st.exitCycleDate, tone: 'warning' });
  }
  const body = st.eligible
    ? html`<div style="display:grid;gap:16px">
        ${st.enrollCycleDate && st.enrollCycleDate >= today && !st.exitDate
          ? html`<p class="small muted">แจ้งเข้า <b style="color:var(--fg)">${thaiDate(st.enrollCycleDate)}</b> · ${relativeDays(st.enrollCycleDate, today)}</p>`
          : ''}
        ${st.exitUrgent ? alertBox({ tone: 'danger', title: 'ต้องแจ้งออกทันที', body: 'เลิกจ้าง/กระทำผิด — ไม่รอรอบวันที่ 5' }) : ''} ${timeline(steps)}
      </div>`
    : reasons(st.reasons);
  return card({ title: 'ประกันกลุ่ม', iconName: 'shield-plus', actions: b, body });
}

function pvdCard(st, settings) {
  const joined = st.memberYears !== null;
  const b = !st.eligible
    ? badge('ไม่มีสิทธิ', 'danger', { lg: true })
    : joined
      ? badge('เป็นสมาชิก', 'success', { lg: true })
      : badge('รอครบสิทธิ', 'info', { lg: true });
  const body = !st.eligible
    ? reasons(st.reasons)
    : html`<div style="display:grid;gap:20px">
        ${infoList(
          [
            { label: 'วันเป็นสมาชิก', value: thaiDate(st.joinDate) },
            { label: 'อายุสมาชิก', value: joined ? `${st.memberYears} ปี` : '–' },
            { label: `พนักงานหัก ${settings.pvdEmployeeRate}%`, value: html`<span class="num">${money(st.employeeMonthly)} ฿/เดือน</span>` },
            { label: `บริษัทสมทบ ${settings.pvdCompanyRate}%`, value: html`<span class="num">${money(st.companyMonthly)} ฿/เดือน</span>` },
          ],
          2,
        )}
        ${st.vestingPercent !== null
          ? html`<div>
              <div class="row between small" style="margin-bottom:6px"><span class="muted">สิทธิในเงินสมทบ (vesting)</span><b class="num">${st.vestingPercent}%</b></div>
              ${progress(st.vestingPercent, st.vestingPercent >= 100 ? 'success' : '')}
              ${settings.pvdVestingIsPlaceholder ? html`<p class="small" style="margin-top:6px;color:var(--warning)">ตาราง vesting เป็นค่าตัวอย่าง รอ HR ยืนยัน</p>` : ''}
            </div>`
          : ''}
      </div>`;
  return card({ title: 'กองทุนสำรองเลี้ยงชีพ', iconName: 'piggy-bank', actions: b, body });
}

function renderUniform(emp, st) {
  const pending = st.entitlements.filter((e) => !e.issued).length;
  const b = st.ruleId === null ? badge('ไม่พบสิทธิ', 'danger', { lg: true }) : pending ? badge(`ค้างแจก ${pending}`, 'warning', { lg: true }) : badge('ครบแล้ว', 'success', { lg: true });
  render(
    $('#uniform'),
    card({
      title: 'ชุดฟอร์ม',
      description: st.style ?? '',
      iconName: 'shirt',
      actions: b,
      padded: false,
      body: st.ruleId === null ? html`<p class="small muted" style="padding:20px">${st.reasons.join(' · ')}</p>` : raw('<div id="uniform-table"></div>'),
    }),
  );
  if (st.ruleId === null) return;
  const t = new DataTable($('#uniform-table'), {
    rowKey: (e) => e.key,
    onRender: enhanceIssueActions,
    columns: [
      { key: 'event', header: 'รอบ', cell: (e) => html`<b style="font-weight:500">${UNIFORM_EVENT_LABEL[e.event]}${e.event === 'ANNUAL' ? ` ${Number(e.key.slice(7)) + 543}` : ''}</b>` },
      { key: 'due', header: 'ครบกำหนด', sort: (e) => e.dueDate, cell: (e) => html`<span class="num">${thaiDate(e.dueDate)}</span>` },
      { key: 'qty', header: 'จำนวน', align: 'right', cell: (e) => html`<span class="num">${e.qtyLabel} ตัว</span>` },
      { key: 'items', header: 'รายการ', hideOnMobile: true, cell: (e) => html`<span class="muted">${e.items.map((i) => UNIFORM_ITEM_LABEL[i]).join(', ')}</span>` },
      {
        key: 'act',
        header: '',
        align: 'right',
        cell: (e) =>
          e.issued
            ? html`<span class="row" style="justify-content:flex-end">${badge('แจกแล้ว', 'success')}
                <button class="btn-icon sm danger" data-cancel-issue="${e.issueId}" data-label="${UNIFORM_EVENT_LABEL[e.event]}" title="ยกเลิกการแจก" aria-label="ยกเลิกการแจก">${raw(icon('undo-2'))}</button></span>`
            : emp.status === 'ACTIVE'
              ? issueAction({ employeeId: emp.id, entitlementKey: e.key, event: e.event, qty: e.qty })
              : badge('ไม่ได้แจก', 'neutral'),
      },
    ],
    empty: emptyState({ iconName: 'shirt', title: 'ยังไม่ถึงรอบแจกชุดฟอร์ม', description: 'จะได้รับเมื่อเริ่มงาน / ผ่านทดลองงาน / รอบประจำปี ตามกฎ' }),
  });
  t.setRows([...st.entitlements].reverse());
}

async function load() {
  try {
    const [b, rules, activity] = await Promise.all([api.getEmployeeBenefits(id), api.getRules(), api.listActivity({ employeeId: id, limit: 30 })]);
    const e = b.employee;
    // ข้อมูลที่ไฟล์แจ้งประกันใช้ แต่ยังว่าง
    const missing = () => html`<span class="muted">– ยังไม่กรอก</span>`;
    const name = `${e.firstName} ${e.lastName}`;
    document.title = `${name} · HL Welfare`;
    render($('#crumb'), name);
    render(
      $('#head'),
      html`<div class="row" style="gap:16px">
          ${avatar(e.firstName, { lg: true })}
          <div>
            <h1 class="row wrap">${name} ${badge(STATUS_LABEL[e.status], STATUS_TONE[e.status])}</h1>
            <p class="num">${e.empCode} · ${EMPLOYEE_TYPE_LABEL[e.employeeType]} · ${e.companyCode}</p>
          </div>
        </div>
        <div class="page-actions">
          <a class="btn" href="employees.html?q=${encodeURIComponent(e.empCode)}">${raw(icon('pencil'))} ${e.status === 'ACTIVE' ? 'แก้ไข / บันทึกพ้นสภาพ' : 'แก้ไข'} ในตาราง</a>
        </div>`,
    );
    render(
      $('#info'),
      infoList([
        { label: 'หน่วยงาน', value: b.site?.name ?? '–' },
        { label: 'ประเภท', value: badge(EMPLOYEE_TYPE_LABEL[e.employeeType], EMPLOYEE_TYPE_TONE[e.employeeType], { dot: false }) },
        { label: e.employeeType === 'PRO_SITE' ? 'ตำแหน่ง' : 'ฝ่าย / ระดับ', value: e.position ?? (e.deptGroup ? `${e.deptGroup} · ระดับ ${e.level ?? '–'}` : '–') },
        { label: 'สัญญา', value: CONTRACT_LABEL[e.contractType] },
        { label: 'วันเริ่มงาน', value: thaiDate(e.startDate) },
        { label: 'ผ่านทดลองงาน', value: thaiDate(e.probationPassDate) },
        { label: 'อายุงาน', value: tenure(e.startDate, e.endDate ?? today) },
        { label: 'เงินเดือน', value: html`<span class="num">${money(e.salary)} ฿</span>` },
        { label: 'วันเกิด', value: thaiDate(e.birthDate) },
        { label: 'คำนำหน้า / เพศ', value: [e.title, GENDER_LABEL[e.gender]].filter(Boolean).join(' · ') || missing() },
        { label: 'เลขบัตรประชาชน', value: e.nationalId ? html`<span class="num">${formatThaiId(e.nationalId)}</span>` : missing() },
        { label: 'โทร / อีเมล', value: [e.phone, e.email].filter(Boolean).join(' · ') || '–' },
        ...(e.status === 'INACTIVE'
          ? [
              { label: 'เหตุผลพ้นสภาพ', value: e.endReason ? END_REASON_LABEL[e.endReason] : '–' },
              { label: 'วันทำงานสุดท้าย', value: thaiDate(e.lastWorkingDate) },
              { label: 'วันพ้นสภาพ', value: thaiDate(e.endDate) },
            ]
          : []),
      ]),
    );
    render($('#insurance'), insuranceCard(e, b.insurance));
    render($('#pvd'), pvdCard(b.pvd, rules.settings));
    renderUniform(e, b.uniform);
    render($('#activity'), activityFeed(activity, { linkEmployee: false }));
  } catch (err) {
    const notFound = err?.status === 404;
    render(
      $('#page'),
      notFound
        ? card({ body: emptyState({ iconName: 'user-x', title: 'ไม่พบพนักงาน', action: html`<a class="btn" href="employees.html">กลับไปหน้ารายชื่อ</a>` }) })
        : errorState(err),
    );
  }
}

wireIssueActions($('#uniform'), { today, onDone: load });
on($('#uniform'), 'click', '[data-cancel-issue]', (_e, b) =>
  confirmAction({
    title: `ยกเลิกการแจก (${b.dataset.label})?`,
    body: 'ใช้กรณีบันทึกผิด เช่น เลือกไซซ์ผิด แล้วบันทึกใหม่ได้ทันที',
    confirmLabel: 'ยกเลิกการแจก',
    successMessage: 'ยกเลิกแล้ว — กลับไปเป็น “ค้างแจก”',
    action: async () => {
      await api.cancelUniformIssue(Number(b.dataset.cancelIssue));
      refreshCounts();
      load();
    },
  }),
);

load();
