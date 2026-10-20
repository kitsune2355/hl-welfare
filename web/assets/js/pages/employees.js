// หน้า: พนักงาน (employees.html) — ตาราง Excel เพิ่ม / แก้ไข / ลบ / บันทึกพ้นสภาพ ในตารางทั้งหมด (ไม่มีฟอร์มแยก)
import { api } from '../app/api.js';
import { can, companyChoices, myCompany } from '../app/auth.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { normalizeEmployee, validateEmployee } from '../application/employeeRules.js';
import { todayISO } from '../domain/date.js';
import { digitsOnly, formatThaiId } from '../domain/thaiId.js';
import { $, debounce, getParam, html, setParams } from '../shared/dom.js';
import { thaiDate } from '../shared/format.js';
import {
  COMPANY_CODES,
  CONTRACT_LABEL,
  DEPT_GROUPS,
  EMPLOYEE_TYPE_LABEL,
  EMPLOYEE_TYPE_TONE,
  END_REASON_LABEL,
  GENDER_LABEL,
  TITLES,
  PRO_POSITIONS,
  STATUS_LABEL,
  STATUS_TONE,
} from '../shared/labels.js';
import { badge, emptyState, errorState } from '../ui/components.js';
import { ExcelGrid } from '../ui/datagrid.js';
import { toast } from '../ui/overlay.js';
import { openEmployeeDetail } from './_employeeDetail.js';

const URGENT = ['TERMINATED', 'MISCONDUCT'];

initPage('employees');

const form = $('#filters');
const opts = (rec) => Object.entries(rec).map(([value, label]) => ({ value, label }));
const str = (v) => (v === null || v === undefined ? '' : String(v));
let sites = [];

// ----- ตัวกรองจาก URL: ช่องค้นหา + แท็กกรองเร็ว -----
/** กลุ่มแท็กกรองเร็ว — เลือกได้กลุ่มละ 1 ค่า (กดซ้ำ = ยกเลิก) · เพิ่ม/ลบกลุ่มได้ที่นี่ */
const TAG_GROUPS = [
  { param: 'status', field: 'status', label: 'สถานะ', options: STATUS_LABEL },
  { param: 'type', field: 'employeeType', label: 'ประเภท', options: EMPLOYEE_TYPE_LABEL },
  { param: 'company', field: 'companyCode', label: 'บริษัท', options: Object.fromEntries(COMPANY_CODES.map((c) => [c, c])) },
].filter((g) => g.param !== 'company' || myCompany() === null); // HR บริษัทเห็นบริษัทเดียว — ไม่ต้องมีแท็กบริษัท
const filter = () => ({
  q: getParam('q'),
  companyCode: getParam('company'),
  employeeType: getParam('type'),
  status: getParam('status'),
});
/** พนักงานที่ตรงคำค้น (ยังไม่กรองด้วยแท็ก) — ใช้นับจำนวนบนแท็ก */
let matched = [];
/** แสดงแท็กเมื่อได้ข้อมูล + ฟอนต์โหลดเสร็จแล้วเท่านั้น — กันปุ่มขยายตอนตัวเลขจริง/ฟอนต์จริงมาถึง */
let tagsReady = false;
const matchTags = (e, f, except) => TAG_GROUPS.every((g) => g === except || !f[g.field] || e[g.field] === f[g.field]);

function drawTags() {
  const f = filter();
  const any = TAG_GROUPS.some((g) => f[g.field]);
  $('#quick-tags').classList.toggle('pending', !tagsReady);
  $('#quick-tags').innerHTML = String(html`${TAG_GROUPS.map((g) => {
      // นับแบบ faceted: ใช้ตัวกรองของกลุ่มอื่น แต่ไม่ใช้ของกลุ่มตัวเอง
      const pool = matched.filter((e) => matchTags(e, f, g));
      return html`<span class="tag-group" role="group" aria-label="${g.label}">
        ${Object.entries(g.options).map(([value, label]) => {
          const on = f[g.field] === value;
          const n = pool.filter((e) => e[g.field] === value).length;
          return html`<button type="button" class="chip${on ? ' active' : ''}${!n && !on ? ' zero' : ''}" data-tag="${g.param}" data-value="${value}" aria-pressed="${on ? 'true' : 'false'}">${label} <span class="n num">${n}</span></button>`;
        })}
      </span>`;
    })}
    ${any ? html`<button type="button" class="chip chip-clear" data-clear-tags>ล้างแท็ก</button>` : ''}`);
}
function fillFilterForm() {
  form.q.value = filter().q;
  drawTags();
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
    options: () => companyChoices(COMPANY_CODES).map((c) => ({ value: c, label: c })),
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
  // ----- ข้อมูลแจ้งประกัน (ไม่บังคับ — ว่างแล้วระบบเตือนตอนส่งออก) -----
  {
    key: 'title',
    header: 'คำนำหน้า',
    width: 90,
    editor: 'select',
    value: (e) => e.title,
    options: () => TITLES.map((t) => ({ value: t, label: t })),
    // เลือกคำนำหน้า → เลือกเพศให้
    set: (row, v) => normalizeEmployee({ ...row, title: str(v) || null, gender: v ? (v === 'นาย' ? 'M' : 'F') : row.gender }, sites),
  },
  { key: 'gender', header: 'เพศ', width: 70, editor: 'select', value: (e) => e.gender, display: (e) => GENDER_LABEL[e.gender] ?? '', options: () => opts(GENDER_LABEL), set: setField('gender', (v) => str(v) || null) },
  {
    key: 'nationalId',
    header: 'เลขบัตรประชาชน',
    width: 150,
    editor: 'text',
    value: (e) => (e.nationalId ? formatThaiId(e.nationalId) : ''),
    display: (e) => (e.nationalId ? html`<span class="num">${formatThaiId(e.nationalId)}</span>` : ''),
    set: setField('nationalId', (v) => digitsOnly(str(v)) || null),
  },
  { key: 'phone', header: 'โทรศัพท์มือถือ', width: 120, editor: 'text', value: (e) => e.phone, set: setField('phone', (v) => digitsOnly(str(v)) || null) },
  { key: 'email', header: 'อีเมล', width: 180, editor: 'text', value: (e) => e.email, set: setField('email', (v) => str(v).trim() || null) },
  // ----- พ้นสภาพ: เปลี่ยนสถานะเป็น "พ้นสภาพ" แล้วกรอกเหตุผล + วันที่ -----
  {
    key: 'status',
    header: 'สถานะ',
    width: 110,
    editor: 'select',
    value: (e) => e.status,
    display: (e) => badge(STATUS_LABEL[e.status], STATUS_TONE[e.status]),
    options: () => opts(STATUS_LABEL),
    set: (row, v) =>
      v === 'ACTIVE'
        ? { ...row, status: 'ACTIVE', endReason: null, endDate: null, lastWorkingDate: null }
        : { ...row, status: 'INACTIVE', endDate: row.endDate ?? todayISO() },
  },
  {
    key: 'endReason',
    header: 'เหตุผลพ้นสภาพ',
    width: 140,
    editor: 'select',
    editable: (e) => e.status === 'INACTIVE',
    value: (e) => e.endReason,
    display: (e) => (e.endReason ? (URGENT.includes(e.endReason) ? badge(END_REASON_LABEL[e.endReason], 'danger') : END_REASON_LABEL[e.endReason]) : ''),
    options: () => opts(END_REASON_LABEL),
    set: setField('endReason', (v) => str(v) || null),
  },
  {
    key: 'lastWorkingDate',
    header: 'ทำงานวันสุดท้าย',
    width: 120,
    editor: 'date',
    editable: (e) => e.status === 'INACTIVE',
    value: (e) => e.lastWorkingDate,
    display: (e) => (e.lastWorkingDate ? thaiDate(e.lastWorkingDate) : ''),
    set: setField('lastWorkingDate', (v) => str(v) || null),
  },
  {
    key: 'endDate',
    header: 'วันพ้นสภาพ',
    width: 110,
    editor: 'date',
    editable: (e) => e.status === 'INACTIVE',
    value: (e) => e.endDate,
    display: (e) => (e.endDate ? thaiDate(e.endDate) : ''),
    set: setField('endDate', (v) => str(v) || null),
  },
];

function blankEmployee() {
  const f = filter();
  return normalizeEmployee(
    {
      id: 0,
      empCode: '',
      firstName: '',
      lastName: '',
      companyCode: f.companyCode || myCompany() || 'HL',
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
  readOnly: !can('employees.edit'), // ไม่มีสิทธิ์แก้ = ดูอย่างเดียว
  // ไม่มีช่องเงินเดือนในระบบ (ไม่ต้องกรอก) → ไม่ตรวจเงินเดือน
  validate: (e) => {
    const { salary: _salary, ...errors } = validateEmployee(e);
    return errors;
  },
  newRow: blankEmployee,
  pageSize: 25,
  page: Math.max(1, Number(getParam('page')) || 1),
  onPageChange: (p) => setParams({ page: p > 1 ? p : '' }),
  onSave: async (row, isNew) => {
    // ขาดงาน 3 วัน: ไม่กรอกวันทำงานสุดท้าย → ใช้วันพ้นสภาพ (เหมือนฟอร์มเดิม)
    const payload = row.status === 'INACTIVE' && !row.lastWorkingDate && row.endReason !== 'ABSENT_3D' ? { ...row, lastWorkingDate: row.endDate } : row;
    const saved = await api.saveEmployee(isNew ? { ...payload, id: undefined } : payload);
    if (saved.status === 'INACTIVE' && URGENT.includes(saved.endReason)) {
      toast.error(`${saved.firstName} ${saved.lastName}: ${END_REASON_LABEL[saved.endReason]} — ต้องแจ้งออกจากประกันกลุ่มทันที (หน้า “ประกันกลุ่ม”)`);
    }
    return saved;
  },
  onOpen: (e) => openEmployeeDetail(e.id),
  // มือถือก็ใช้ตารางเดียวกัน (เลื่อนแนวนอน) — เพิ่ม/แก้ได้ในตารางทุกขนาดจอ
  // ลบ = ทำเครื่องหมายไว้ ลบจริงตอนกดบันทึก (มีกล่องยืนยันรายชื่อก่อน)
  // ลบได้เฉพาะข้อมูลที่บันทึกผิด — ถ้ามีประวัติแจ้งประกัน/แจกชุดแล้ว API ไม่ให้ลบ (ใช้ "พ้นสภาพ" แทน)
  onRemove: (e) => api.deleteEmployee(e.id),
  rowLabel: (e) => `${e.empCode} · ${e.firstName} ${e.lastName}`,
  onSaved: () => refreshCounts(),
  empty: emptyState({ iconName: 'user-x', title: 'ไม่พบพนักงาน', description: 'ลองเปลี่ยนคำค้นหรือล้างตัวกรอง / กด “เพิ่มแถว” เพื่อเริ่มกรอกข้อมูล' }),
});

async function load() {
  grid.setRows(null);
  try {
    const f = filter();
    // ดึงตามคำค้นครั้งเดียว แล้วกรองด้วยแท็กในเบราว์เซอร์ → นับจำนวนบนแท็กได้ทันที
    const [list, siteList] = await Promise.all([api.listEmployees({ q: f.q }), sites.length ? sites : api.listSites()]);
    sites = siteList;
    matched = list;
    if (!tagsReady) {
      await document.fonts?.ready;
      tagsReady = true;
    }
    drawTags();
    grid.setRows(list.filter((e) => matchTags(e, f)));
  } catch (e) {
    $('#grid').innerHTML = String(html`<div style="padding:16px">${errorState(e)}</div>`);
  }
}

// ----- events: เปลี่ยนตัวกรอง → เขียนลง URL → โหลดใหม่ -----
const applyFilter = (params = {}) => {
  setParams({ q: form.q.value.trim(), ...params, page: '' });
  grid.page = 1;
  fillFilterForm();
  load();
};
form.addEventListener('submit', (e) => e.preventDefault());
form.q.addEventListener('input', debounce(() => applyFilter(), 250));
$('#quick-tags').addEventListener('click', (e) => {
  const tag = e.target.closest('[data-tag]');
  if (tag) {
    const { tag: param, value } = tag.dataset;
    return applyFilter({ [param]: getParam(param) === value ? '' : value }); // กดซ้ำ = ยกเลิก
  }
  if (e.target.closest('[data-clear-tags]')) applyFilter(Object.fromEntries(TAG_GROUPS.map((g) => [g.param, ''])));
});

fillFilterForm();
load();
