// หน้า: เงื่อนไขสวัสดิการ (rules.html?tab=)
import { api } from '../app/api.js';
import { initPage } from '../app/shell.js';
import { $, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { CONTRACT_LABEL, EMPLOYEE_TYPE_LABEL, UNIFORM_ITEM_LABEL } from '../shared/labels.js';
import { alertBox, badge, card, errorState, infoList, tabs } from '../ui/components.js';
import { DataTable } from '../ui/table.js';

initPage('rules');

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const questions = $('#open-questions').innerHTML;
const questionCount = $('#open-questions').content.querySelectorAll('li').length;
let tab = getParam('tab', 'insurance');
let rules = null;

/** ตารางในการ์ด */
function tableCard(rows, columns, opts = {}) {
  render($('#content'), card({ ...opts, padded: false, body: raw('<div id="t"></div>') }));
  new DataTable($('#t'), { rowKey: (r) => r.id, columns, rowNumbers: false }).setRows(rows);
}

function draw() {
  render(
    $('#tabs'),
    tabs(
      [
        { value: 'insurance', label: 'ประกันกลุ่ม' },
        { value: 'pvd', label: 'กองทุนสำรองฯ' },
        { value: 'uniform', label: 'ชุดฟอร์ม' },
        { value: 'settings', label: 'ค่าตั้งค่า' },
        { value: 'open', label: 'รอ HR ยืนยัน', count: questionCount },
      ],
      tab,
    ),
  );
  const s = rules.settings;

  if (tab === 'insurance') {
    tableCard(rules.insurance, [
      { key: 'id', header: '#', cell: (x) => html`<span class="muted">${x.id}</span>` },
      { key: 't', header: 'ประเภทพนักงาน', cell: (x) => html`<b style="font-weight:500">${EMPLOYEE_TYPE_LABEL[x.employeeType]}</b>` },
      { key: 'c', header: 'บริษัท', cell: (x) => x.companies?.join(', ') ?? 'ทุกบริษัท' },
      { key: 'w', header: 'รอ (วัน)', align: 'right', cell: (x) => html`<span class="num">${x.waitDays}</span>` },
      {
        key: 'x',
        header: 'เงื่อนไขเพิ่ม',
        cell: (x) =>
          html`<span class="row wrap"
            >${x.excludeContracts.map((c) => badge(`ไม่รวม${CONTRACT_LABEL[c]}`, 'danger'))}
            ${x.requireSiteInsurance ? badge('เฉพาะหน่วยงานที่ได้รับ', 'warning') : ''}
            ${!x.excludeContracts.length && !x.requireSiteInsurance ? html`<span class="muted">–</span>` : ''}</span
          >`,
      },
      { key: 'n', header: 'หมายเหตุ', hideOnMobile: true, cell: (x) => html`<span class="muted">${x.note}</span>` },
    ]);
  } else if (tab === 'pvd') {
    render(
      $('#content'),
      html`<div class="grid grid-3">
        ${card({ title: 'สิทธิสมาชิก', padded: false, cls: 'span-2', body: raw('<div id="t"></div>') })}
        ${card({
          title: 'Vesting',
          description: '% สิทธิในเงินสมทบตามอายุสมาชิก',
          body: html`${s.pvdVestingIsPlaceholder ? html`<div class="mb">${alertBox({ tone: 'warning', body: 'ค่าตัวอย่าง — รอ HR ยืนยัน' })}</div>` : ''}
            <ul class="summary-list">
              ${s.pvdVesting.map((v) => html`<li style="padding:8px 0"><span class="muted">ตั้งแต่ ${v.minYears} ปี</span><b class="num">${v.percent}%</b></li>`)}
            </ul>
            <p class="small muted" style="margin-top:12px">กระทำผิด / ขาดงาน 3 วัน → 0%</p>`,
        })}
      </div>`,
    );
    new DataTable($('#t'), {
      rowKey: (r) => r.id,
      rowNumbers: false,
      columns: [
        { key: 't', header: 'ประเภท', cell: (x) => html`<b style="font-weight:500">${EMPLOYEE_TYPE_LABEL[x.employeeType]}</b>` },
        { key: 'e', header: 'สิทธิ', cell: (x) => (x.eligible ? badge('ได้รับ', 'success') : badge('ไม่ได้รับ', 'danger')) },
        { key: 'w', header: 'รอ (วัน)', align: 'right', cell: (x) => (x.eligible ? (x.waitDays === 0 ? 'วันแรก' : x.waitDays) : '–') },
        { key: 'n', header: 'หมายเหตุ', hideOnMobile: true, cell: (x) => html`<span class="muted">${x.note}</span>` },
      ],
    }).setRows(rules.pvd);
  } else if (tab === 'uniform') {
    tableCard(rules.uniform, [
      { key: 'id', header: '#', cell: (x) => html`<span class="muted">${x.id}</span>` },
      { key: 't', header: 'ประเภท', cell: (x) => EMPLOYEE_TYPE_LABEL[x.employeeType] },
      { key: 'c', header: 'บริษัท', cell: (x) => x.companies.join(', ') },
      { key: 'g', header: 'กลุ่ม / ตำแหน่ง', cell: (x) => html`<b style="font-weight:500">${x.position ?? x.deptGroups?.join(', ') ?? '–'}</b>` },
      {
        key: 'l',
        header: 'ระดับ',
        cell: (x) => (x.levelMin === null && x.levelMax === null ? (x.employeeType === 'CENTRAL' ? 'ทุกระดับ' : '–') : `${x.levelMin ?? 1}${x.levelMax ? `–${x.levelMax}` : '+'}`),
      },
      {
        key: 'i',
        header: 'รายการ',
        hideOnMobile: true,
        cell: (x) => html`<span class="muted">${x.items.map((i) => (x.poloBySite && i.startsWith('POLO') ? 'โปโล (สีตามหน่วยงาน)' : UNIFORM_ITEM_LABEL[i])).join(', ')}</span>`,
      },
      { key: 's', header: 'เริ่มงาน', align: 'right', cell: (x) => html`<span class="num">${x.qtyStartLabel ?? x.qtyStart}</span>` },
      { key: 'p', header: 'ผ่านทดลอง', align: 'right', cell: (x) => html`<span class="num">${x.qtyProbation}</span>` },
      { key: 'a', header: 'ประจำปี', align: 'right', cell: (x) => html`<span class="num">${x.qtyAnnual}</span>` },
    ]);
  } else if (tab === 'settings') {
    render(
      $('#content'),
      card({
        body: infoList(
          [
            { label: 'อายุสูงสุดประกันกลุ่ม', value: `${s.insuranceMaxAge} ปี` },
            { label: 'วันที่รอบแจ้งประกัน', value: `ทุกวันที่ ${s.insuranceCycleDay}${s.insuranceCycleDayDaily && s.insuranceCycleDayDaily !== s.insuranceCycleDay ? ` · พนักงานรายวันทุกวันที่ ${s.insuranceCycleDayDaily}` : ''}` },
            { label: 'ขาดงาน 3 วัน: วันออก', value: `วันทำงานสุดท้าย + ${s.absentExtraDays} วัน` },
            { label: 'PVD พนักงานหัก', value: `${s.pvdEmployeeRate}%` },
            { label: 'PVD บริษัทสมทบ', value: `${s.pvdCompanyRate}%` },
            { label: 'เดือนแจกชุดประจำปี', value: `1 ${MONTHS[s.uniformAnnualMonth - 1]}` },
          ],
          3,
        ),
      }),
    );
  } else {
    render($('#content'), card({ title: 'ประเด็นที่ต้องยืนยันกับ HR', iconName: 'circle-help', body: html`<ol class="questions">${raw(questions)}</ol>` }));
  }
}

on($('#tabs'), 'click', '[data-tab]', (_e, t) => {
  tab = t.dataset.tab;
  setParams({ tab: tab === 'insurance' ? '' : tab });
  draw();
});

try {
  rules = await api.getRules();
  draw();
} catch (e) {
  render($('#content'), errorState(e));
}
