// หน้า: ฟอร์มพนักงาน (employee-form.html[?id=]) — เพิ่ม / แก้ไข / บันทึกพ้นสภาพ
import { api } from '../app/api.js';
import { initPage } from '../app/shell.js';
import { validateEmployee } from '../application/employeeRules.js';
import { addDays, todayISO } from '../domain/date.js';
import { $, $$, esc, getParam, html, render } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { alertBox, errorState } from '../ui/components.js';
import { errorMessage, toast } from '../ui/overlay.js';

initPage('employees', { tour: 'employee-form' });

const id = Number(getParam('id')) || null;
const form = $('#form');
let sites = [];
let inactive = false;
let touched = false;

/** select ที่ถูกแปลงเป็น combobox ต้องเรียก refreshCombobox() หลังเปลี่ยนค่าด้วย JS */
const setSelect = (name, value) => {
  form[name].value = value ?? '';
  form[name].refreshCombobox?.();
};

function fillSites() {
  const sel = form.siteId;
  const current = sel.value;
  sel.innerHTML = sites
    .filter((s) => s.companyCode === form.companyCode.value)
    .map((s) => `<option value="${s.id}">${esc(s.name)}</option>`)
    .join('');
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  sel.refreshCombobox?.();
}

/** แสดง/ซ่อนช่องตามประเภทพนักงานและสถานะ */
function syncVisibility() {
  const pro = form.companyCode.value === 'PRO';
  if (!pro && form.employeeType.value === 'PRO_SITE') setSelect('employeeType', 'CENTRAL');
  form.employeeType.querySelector('option[value="PRO_SITE"]').disabled = !pro; // Pro Site เลือกได้เฉพาะ PRO
  form.employeeType.refreshCombobox?.();
  $('#type-hint').classList.toggle('hidden', pro);

  const type = form.employeeType.value;
  $$('[data-for]').forEach((el) => el.classList.toggle('hidden', el.dataset.for !== type));
  $$('[data-inactive]').forEach((el) => el.classList.toggle('hidden', !inactive));
  $('#inactive').setAttribute('aria-checked', String(inactive));

  const start = form.startDate.value;
  $('#probation-hint').textContent = start ? `ปกติ 119 วัน → ${addDays(start, 119)}` : '';
  $('#absent-hint').textContent = form.endReason.value === 'ABSENT_3D' ? 'วันออกจากประกัน = วันทำงานสุดท้าย + 7 วัน' : '';
  const urgent = inactive && ['TERMINATED', 'MISCONDUCT'].includes(form.endReason.value);
  $('#urgent-note').classList.toggle('hidden', !urgent);
  if (urgent) {
    render(
      $('#urgent-note'),
      alertBox({ tone: 'danger', title: 'ต้องแจ้งออกจากประกันกลุ่มทันที', body: 'หลังบันทึก รายการจะไปอยู่ที่หน้า “ประกันกลุ่ม” ส่วนแจ้งออกทันที · PVD vesting = 0%' }),
    );
  }
}

/** อ่านค่าฟอร์ม → ข้อมูลพนักงาน */
function readForm() {
  const v = (n) => form[n].value.trim();
  const type = v('employeeType');
  return {
    id: id ?? undefined,
    empCode: v('empCode'),
    firstName: v('firstName'),
    lastName: v('lastName'),
    companyCode: v('companyCode'),
    siteId: Number(v('siteId')) || 0,
    employeeType: type,
    contractType: type === 'PRO_SITE' ? v('contractType') : 'REGULAR',
    deptGroup: type === 'CENTRAL' ? v('deptGroup') || null : null,
    position: type === 'PRO_SITE' ? v('position') || null : null,
    level: type === 'CENTRAL' ? (v('level') === '' ? null : Number(v('level'))) : null,
    salary: v('salary') === '' ? 0 : Number(v('salary')),
    birthDate: v('birthDate'),
    startDate: v('startDate'),
    probationPassDate: v('probationPassDate') || null,
    status: inactive ? 'INACTIVE' : 'ACTIVE',
    endReason: inactive ? v('endReason') || null : null,
    endDate: inactive ? v('endDate') || null : null,
    lastWorkingDate: inactive ? v('lastWorkingDate') || v('endDate') || null : null,
  };
}

/** แสดง error ใต้ช่อง (+ aria-invalid) */
function showErrors(errors) {
  $$('.field .error').forEach((el) => el.remove());
  for (const el of form.elements) {
    if (!el.name) continue;
    const msg = errors[el.name];
    if (msg) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
    el.refreshCombobox?.();
    if (msg) {
      const p = document.createElement('span');
      p.className = 'error';
      p.textContent = msg;
      el.closest('.field')?.append(p);
    }
  }
}

function fill(e) {
  for (const k of ['empCode', 'firstName', 'lastName', 'birthDate', 'startDate', 'probationPassDate', 'lastWorkingDate', 'endDate', 'salary', 'level']) {
    form[k].value = e[k] ?? '';
  }
  setSelect('companyCode', e.companyCode);
  fillSites();
  setSelect('siteId', String(e.siteId));
  syncVisibility();
  setSelect('employeeType', e.employeeType);
  setSelect('contractType', e.contractType);
  if (e.position && ![...form.position.options].some((o) => o.value === e.position)) form.position.add(new Option(e.position, e.position));
  setSelect('position', e.position);
  setSelect('deptGroup', e.deptGroup ?? 'Support Line');
  setSelect('endReason', e.endReason);
  inactive = e.status === 'INACTIVE';
  syncVisibility();
}

// ----- events -----
form.addEventListener('change', (e) => {
  if (e.target.name === 'companyCode') fillSites();
  syncVisibility();
  if (touched) showErrors(validateEmployee(readForm()));
});
form.addEventListener('input', () => touched && showErrors(validateEmployee(readForm())));
$('#inactive').onclick = () => {
  inactive = !inactive;
  syncVisibility();
};

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  touched = true;
  const data = readForm();
  const errors = validateEmployee(data);
  showErrors(errors);
  if (Object.keys(errors).length) {
    toast.error('กรุณาตรวจสอบข้อมูลที่ไฮไลต์สีแดง');
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }
  const btn = $('#save');
  btn.disabled = true;
  btn.innerHTML = `${icon('loader-2', 'spin')} บันทึก`;
  try {
    const saved = await api.saveEmployee(data);
    toast.success(id ? 'บันทึกการแก้ไขแล้ว' : `เพิ่มพนักงาน ${saved.firstName} แล้ว`);
    setTimeout(() => (location.href = `employee.html?id=${saved.id}`), 500);
  } catch (e) {
    toast.error(errorMessage(e));
    if (errorMessage(e).includes('รหัส')) showErrors({ empCode: errorMessage(e) });
    btn.disabled = false;
    btn.innerHTML = `${icon('save')} บันทึก`;
  }
});

// ----- โหลดข้อมูล -----
try {
  sites = await api.listSites();
  if (id) {
    const { employee: e } = await api.getEmployeeBenefits(id);
    const name = `${e.firstName} ${e.lastName}`;
    document.title = `แก้ไข ${name} · HL Welfare`;
    render($('#title'), `แก้ไข: ${name}`);
    render($('#crumbs'), html`<a href="employees.html">พนักงาน</a> › <a href="employee.html?id=${e.id}">${name}</a> › <span>แก้ไข</span>`);
    $('#cancel').href = `employee.html?id=${e.id}`;
    fill(e);
  } else {
    render($('#crumbs'), html`<a href="employees.html">พนักงาน</a> › <span>เพิ่มใหม่</span>`);
    form.startDate.value = todayISO();
    form.level.value = '1';
    fillSites();
    syncVisibility();
  }
} catch (e) {
  render($('#page'), errorState(e));
}
