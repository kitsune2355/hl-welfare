// หน้า: พนักงาน (employees.html) — ตาราง Excel แก้/เพิ่ม/ลบในตาราง
import { api } from '../app/api.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { normalizeEmployee, validateEmployee } from '../application/employeeRules.js';
import { todayISO } from '../domain/date.js';
import { $, debounce, getParam, html, setParams } from '../shared/dom.js';
import { money, thaiDate } from '../shared/format.js';
import {
  COMPANY_CODES,
  CONTRACT_LABEL,
  DEPT_GROUPS,
  EMPLOYEE_TYPE_LABEL,
  EMPLOYEE_TYPE_TONE,
  PRO_POSITIONS,
  STATUS_LABEL,
  STATUS_TONE,
} from '../shared/labels.js';
import { badge, employeeCell, emptyState, errorState } from '../ui/components.js';
import { ExcelGrid } from '../ui/datagrid.js';
import { confirmAction, toast } from '../ui/overlay.js';

initPage('employees');

const form = $('#filters');
const opts = (rec) => Object.entries(rec).map(([value, label]) => ({ value, label }));
const str = (v) => (v === null || v === undefined ? '' : String(v));
let sites = [];

// ----- ตัวกรองจาก URL -----
const filter = () => ({
  q: getParam('q'),
  companyCode: getParam('company'),
  employeeType: getParam('type'),
  status: getParam('status'),
});
function fillFilterForm() {
  const f = filter();
  form.q.value = f.q;
  for (const [name, v] of [['company', f.companyCode], ['type', f.employeeType], ['status', f.status]]) {
    form[name].value = v;
    form[name].refreshCombobox?.();
  }
  $('#clear').classList.toggle('hidden', !(f.q || f.companyCode || f.employeeType || f.status));
}

/** แก้ค่า 1 field แล้วจัด field ที่เกี่ยวข้องให้สอดคล้อง (เช่น เปลี่ยนบริษัท → หน่วยงานแรกของบริษัท) */
const setField = (key, conv) => (row, v) => normalizeEmployee({ ...row, [key]: conv(v) }, sites);

const columns = [
  { key: 'empCode', header: 'รหัส', width: 110, required: true, editor: 'text', value: (e) => e.empCode, set: setField('empCode', (v) => str(v).trim()) },
  { key: 'firstName', header: 'ชื่อ', width: 130, required: true, editor: 'text', value: (e) => e.firstName, set: setField('firstName', (v) => str(v).trim()) },
  { key: 'lastName', header: 'นามสกุล', width: 140, required: true, editor: 'text', value: (e) => e.lastName, set: setField('lastName', (v) => str(v).trim()) },
  {
    key: 'companyCode',
    header: 'บริษัท',
    width: 90,
    required: true,
    editor: 'select',
    value: (e) => e.companyCode,
    options: () => COMPANY_CODES.map((c) => ({ value: c, label: c })),
    set: setField('companyCode', str),
  },
  {
    key: 'siteId',
    header: 'หน่วยงาน',
    width: 220,
    required: true,
    editor: 'select',
    value: (e) => String(e.siteId),
    display: (e) => html`<span class="truncate">${sites.find((s) => s.id === e.siteId)?.name ?? '–'}</span>`,
    options: (e) => sites.filter((s) => s.companyCode === e.companyCode).map((s) => ({ value: String(s.id), label: s.name })),
    set: setField('siteId', Number),
  },
  {
    key: 'employeeType',
    header: 'ประเภท',
    width: 120,
    required: true,
    editor: 'select',
    value: (e) => e.employeeType,
    display: (e) => badge(EMPLOYEE_TYPE_LABEL[e.employeeType], EMPLOYEE_TYPE_TONE[e.employeeType], { dot: false }),
    options: (e) => opts(EMPLOYEE_TYPE_LABEL).filter((o) => o.value !== 'PRO_SITE' || e.companyCode === 'PRO'),
    set: setField('employeeType', str),
  },
  {
    key: 'deptGroup',
    header: 'กลุ่ม / ฝ่าย',
    width: 180,
    editor: 'select',
    editable: (e) => e.employeeType === 'CENTRAL',
    value: (e) => e.deptGroup,
    options: () => DEPT_GROUPS.map((d) => ({ value: d, label: d })),
    set: setField('deptGroup', (v) => str(v) || null),
  },
  {
    key: 'level',
    header: 'ระดับ',
    width: 70,
    align: 'right',
    editor: 'number',
    editable: (e) => e.employeeType === 'CENTRAL',
    value: (e) => e.level,
    set: setField('level', (v) => (v === null ? null : Number(v))),
  },
  {
    key: 'position',
    header: 'ตำแหน่ง',
    width: 150,
    editor: 'select',
    creatable: true,
    editable: (e) => e.employeeType === 'PRO_SITE',
    value: (e) => e.position,
    options: () => PRO_POSITIONS.map((p) => ({ value: p, label: p })),
    set: setField('position', (v) => str(v) || null),
  },
  {
    key: 'contractType',
    header: 'สัญญา',
    width: 150,
    editor: 'select',
    editable: (e) => e.employeeType === 'PRO_SITE',
    value: (e) => e.contractType,
    display: (e) => (e.employeeType === 'PRO_SITE' ? CONTRACT_LABEL[e.contractType] : ''),
    options: () => opts(CONTRACT_LABEL),
    set: setField('contractType', str),
  },
  {
    key: 'salary',
    header: 'เงินเดือน',
    width: 110,
    align: 'right',
    required: true,
    editor: 'number',
    value: (e) => e.salary,
    display: (e) => html`<span class="num">${e.salary ? money(e.salary) : ''}</span>`,
    set: setField('salary', (v) => Number(v) || 0),
  },
  { key: 'birthDate', header: 'วันเกิด', width: 110, required: true, editor: 'date', value: (e) => e.birthDate, display: (e) => (e.birthDate ? thaiDate(e.birthDate) : ''), set: setField('birthDate', str) },
  { key: 'startDate', header: 'วันเริ่มงาน', width: 110, required: true, editor: 'date', value: (e) => e.startDate, display: (e) => thaiDate(e.startDate), set: setField('startDate', str) },
  {
    key: 'probationPassDate',
    header: 'ผ่านทดลองงาน',
    width: 120,
    editor: 'date',
    value: (e) => e.probationPassDate,
    display: (e) => (e.probationPassDate ? thaiDate(e.probationPassDate) : ''),
    set: setField('probationPassDate', (v) => str(v) || null),
  },
  { key: 'status', header: 'สถานะ', width: 100, value: (e) => e.status, display: (e) => badge(STATUS_LABEL[e.status], STATUS_TONE[e.status]) },
];

function blankEmployee() {
  const f = filter();
  return normalizeEmployee(
    {
      id: 0,
      empCode: '',
      firstName: '',
      lastName: '',
      companyCode: f.companyCode || 'HL',
      siteId: 0,
      employeeType: f.employeeType && (f.employeeType !== 'PRO_SITE' || f.companyCode === 'PRO') ? f.employeeType : 'CENTRAL',
      contractType: 'REGULAR',
      deptGroup: null,
      position: null,
      level: null,
      salary: 0,
      birthDate: '',
      startDate: todayISO(),
      probationPassDate: null,
      status: 'ACTIVE',
      lastWorkingDate: null,
      endDate: null,
      endReason: null,
    },
    sites,
  );
}

const grid = new ExcelGrid($('#grid'), {
  columns,
  rowKey: (e) => e.id,
  validate: (e) => validateEmployee(e),
  newRow: blankEmployee,
  pageSize: 25,
  page: Math.max(1, Number(getParam('page')) || 1),
  onPageChange: (p) => setParams({ page: p > 1 ? p : '' }),
  onSave: async (row, isNew) => {
    const saved = await api.saveEmployee(isNew ? { ...row, id: undefined } : row);
    if (isNew) toast.success(`เพิ่มพนักงาน ${saved.firstName} ${saved.lastName} แล้ว`);
    refreshCounts();
    return saved;
  },
  onOpen: (e) => (location.href = `employee.html?id=${e.id}`),
  // มือถือ: แสดงเป็นการ์ด แตะเพื่อเปิดรายละเอียด · ปุ่มเพิ่มไปที่ฟอร์มเต็ม
  mobileAddHref: 'employee-form.html',
  mobileAddLabel: 'เพิ่มพนักงาน',
  mobileCard: (e) => html`${employeeCell(e)}
    <div class="row wrap" style="gap:6px">
      ${badge(EMPLOYEE_TYPE_LABEL[e.employeeType], EMPLOYEE_TYPE_TONE[e.employeeType], { dot: false })}
      ${badge(STATUS_LABEL[e.status], STATUS_TONE[e.status])}
      <span class="small muted truncate">${e.companyCode} · ${sites.find((s) => s.id === e.siteId)?.name ?? ''}</span>
    </div>`,
  onDelete: (e) =>
    confirmAction({
      title: 'ลบพนักงาน?',
      description: `${e.firstName} ${e.lastName} (${e.empCode})`,
      body: 'ใช้สำหรับลบข้อมูลที่บันทึกผิดเท่านั้น — ถ้าพนักงานมีประวัติแจ้งประกันหรือแจกชุดแล้ว ระบบจะไม่ให้ลบ ให้ใช้ “บันทึกพ้นสภาพ” แทน',
      confirmLabel: 'ลบถาวร',
      successMessage: `ลบ ${e.firstName} ${e.lastName} แล้ว`,
      action: async () => {
        await api.deleteEmployee(e.id);
        grid.removeRow(e.id);
      },
    }),
  empty: emptyState({ iconName: 'user-x', title: 'ไม่พบพนักงาน', description: 'ลองเปลี่ยนคำค้นหรือล้างตัวกรอง / กด “เพิ่มแถว” เพื่อเริ่มกรอกข้อมูล' }),
});

async function load() {
  grid.setRows(null);
  try {
    const f = filter();
    const [list, siteList] = await Promise.all([api.listEmployees(f), sites.length ? sites : api.listSites()]);
    sites = siteList;
    grid.setRows(list);
  } catch (e) {
    $('#grid').innerHTML = String(html`<div style="padding:16px">${errorState(e)}</div>`);
  }
}

// ----- events: เปลี่ยนตัวกรอง → เขียนลง URL → โหลดใหม่ -----
const applyFilter = () => {
  setParams({ q: form.q.value.trim(), company: form.company.value, type: form.type.value, status: form.status.value, page: '' });
  grid.page = 1;
  fillFilterForm();
  load();
};
form.addEventListener('submit', (e) => e.preventDefault());
form.q.addEventListener('input', debounce(applyFilter, 250));
form.addEventListener('change', (e) => e.target.matches('select') && applyFilter());
$('#clear').onclick = () => {
  form.reset();
  applyFilter();
};

fillFilterForm();
load();
