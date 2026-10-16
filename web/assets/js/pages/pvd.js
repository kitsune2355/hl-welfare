// หน้า: กองทุนสำรองเลี้ยงชีพ (pvd.html?tab=members|waiting|left)
import { api } from '../app/api.js';
import { initPage } from '../app/shell.js';
import { downloadCsv } from '../shared/csv.js';
import { $, getParam, html, on, render, setParams } from '../shared/dom.js';
import { int, money, thaiDate } from '../shared/format.js';
import { EMPLOYEE_TYPE_LABEL, STATUS_LABEL } from '../shared/labels.js';
import { alertBox, badge, emptyState, employeeCell, errorState, progress, skeletonCards, statCard, tabs } from '../ui/components.js';
import { DataTable } from '../ui/table.js';

initPage('pvd');

let view = getParam('tab', 'members');
let groups = { members: [], waiting: [], left: [] };
let all = [];

const table = new DataTable($('#list'), {
  rowKey: (r) => r.employee.id,
  pageSize: 25,
  onRowClick: (r) => (location.href = `employee.html?id=${r.employee.id}`),
  columns: [
    { key: 'emp', header: 'พนักงาน', text: (r) => `${r.employee.firstName} ${r.employee.lastName}`, cell: (r) => employeeCell(r.employee) },
    { key: 'type', header: 'บริษัท / ประเภท', hideOnMobile: true, cell: (r) => `${r.employee.companyCode} · ${EMPLOYEE_TYPE_LABEL[r.employee.employeeType]}` },
    { key: 'join', header: 'วันเป็นสมาชิก', sort: (r) => r.pvd.joinDate, cell: (r) => html`<span class="num">${thaiDate(r.pvd.joinDate)}</span>` },
    { key: 'sal', header: 'เงินเดือน', align: 'right', hideOnMobile: true, sort: (r) => r.employee.salary, cell: (r) => html`<span class="num">${money(r.employee.salary)}</span>` },
    { key: 'ded', header: 'หัก', align: 'right', sort: (r) => r.pvd.employeeMonthly, cell: (r) => html`<span class="num">${money(r.pvd.employeeMonthly)}</span>` },
    { key: 'con', header: 'สมทบ', align: 'right', sort: (r) => r.pvd.companyMonthly, cell: (r) => html`<span class="num">${money(r.pvd.companyMonthly)}</span>` },
    { key: 'yrs', header: 'อายุสมาชิก', align: 'right', sort: (r) => r.pvd.memberYears, cell: (r) => html`<span class="num">${r.pvd.memberYears === null ? '–' : `${r.pvd.memberYears} ปี`}</span>` },
    {
      key: 'vest',
      header: 'Vesting',
      sort: (r) => r.pvd.vestingPercent,
      text: (r) => (r.pvd.vestingPercent === null ? '' : `${r.pvd.vestingPercent}%`),
      cls: 'nowrap',
      cell: (r) =>
        view === 'left'
          ? badge(`${r.pvd.vestingPercent ?? 0}%`, 'neutral')
          : r.pvd.vestingPercent === null
            ? html`<span class="muted">–</span>`
            : html`<div class="vest-row" style="min-width:120px">
                ${progress(r.pvd.vestingPercent, r.pvd.vestingPercent >= 100 ? 'success' : '')}<span class="num">${r.pvd.vestingPercent}%</span>
              </div>`,
    },
  ],
  empty: emptyState({ iconName: 'piggy-bank', title: 'ไม่มีรายการ' }),
});

function draw() {
  render(
    $('#tabs'),
    tabs(
      [
        { value: 'members', label: 'สมาชิก', count: groups.members.length },
        { value: 'waiting', label: 'รอครบสิทธิ', count: groups.waiting.length },
        { value: 'left', label: 'พ้นสภาพ', count: groups.left.length },
      ],
      view,
    ),
  );
  table.page = 1;
  table.setRows(groups[view] ?? []);
}

on($('#tabs'), 'click', '[data-tab]', (_e, t) => {
  view = t.dataset.tab;
  setParams({ tab: view === 'members' ? '' : view });
  draw();
});

$('#export').onclick = () =>
  downloadCsv(
    'pvd-members.csv',
    ['รหัสพนักงาน', 'ชื่อ', 'นามสกุล', 'บริษัท', 'ประเภท', 'สถานะ', 'วันเป็นสมาชิก', 'เงินเดือน', 'หักพนักงาน', 'สมทบบริษัท', 'อายุสมาชิก (ปี)', 'vesting %'],
    all.map(({ employee: e, pvd: p }) => [
      e.empCode,
      e.firstName,
      e.lastName,
      e.companyCode,
      EMPLOYEE_TYPE_LABEL[e.employeeType],
      STATUS_LABEL[e.status],
      p.joinDate,
      e.salary.toFixed(2),
      p.employeeMonthly.toFixed(2),
      p.companyMonthly.toFixed(2),
      p.memberYears,
      p.vestingPercent,
    ]),
  );

render($('#stats'), skeletonCards(3));
try {
  const [rows, rules] = await Promise.all([api.listPvdMembers(), api.getRules()]);
  all = rows;
  const s = rules.settings;
  groups = {
    members: rows.filter((r) => r.employee.status === 'ACTIVE' && r.pvd.memberYears !== null),
    waiting: rows.filter((r) => r.employee.status === 'ACTIVE' && r.pvd.memberYears === null),
    left: rows.filter((r) => r.employee.status === 'INACTIVE'),
  };
  if (s.pvdVestingIsPlaceholder) {
    const box = $('#vesting-alert');
    box.classList.remove('hidden');
    render(
      box,
      alertBox({ tone: 'warning', title: 'ตาราง vesting เป็นค่าตัวอย่าง', body: `${s.pvdVesting.map((v) => `${v.minYears} ปี → ${v.percent}%`).join(' · ')} — รอ HR ยืนยันตารางจริง` }),
    );
  }
  const sumEmp = groups.members.reduce((a, r) => a + r.pvd.employeeMonthly, 0);
  const sumCo = groups.members.reduce((a, r) => a + r.pvd.companyMonthly, 0);
  render(
    $('#stats'),
    html`${statCard({ label: 'สมาชิกปัจจุบัน', value: int(groups.members.length), hint: `รอเข้าเป็นสมาชิก ${groups.waiting.length} คน`, iconName: 'users' })}
    ${statCard({ label: `พนักงานหัก ${s.pvdEmployeeRate}% รวม/เดือน`, value: money(sumEmp), hint: 'บาท', iconName: 'wallet', tone: 'info' })}
    ${statCard({ label: `บริษัทสมทบ ${s.pvdCompanyRate}% รวม/เดือน`, value: money(sumCo), hint: 'บาท', iconName: 'hand-coins', tone: 'success' })}`,
  );
  draw();
} catch (e) {
  render($('#stats'), errorState(e));
}
