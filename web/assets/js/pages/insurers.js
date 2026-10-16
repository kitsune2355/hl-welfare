// หน้า: แบบฟอร์มประกัน (insurers.html?id=&tab=) — ตั้งค่าไฟล์ Excel แจ้งเข้า-ออกของแต่ละบริษัทประกัน (เพิ่ม / แก้ไข / ทำสำเนา / ลบ)
//
// โครง: รายการแบบฟอร์ม (ซ้าย) · ตัวแก้ไข 4 แท็บ (ทั่วไป / บริษัท & กรมธรรม์ / คอลัมน์ / หัว–ท้ายเอกสาร) · ตัวอย่างไฟล์ (ล่าง)
// แก้ค่า → เก็บใน draft → ตัวอย่างอัปเดตทันที → กด "บันทึก" ถึงส่งไป api.saveInsurer
// ช่องผูกกับ draft ด้วย data-k:  "name" · "signer.phone" · "columns:3:header" · "headerLines:0:text" · "footerLines:2" · "co:HL:policyNo"
//
// ตัวแปร {…}: ช่องที่ใส่ data-var มีปุ่ม "แทรกข้อมูล" ของตัวเอง (เมนูแยกหมวด + ตัวอย่างค่า) และพิมพ์ "{" เพื่อเปิดเมนูได้
//            ใต้ช่องแสดง "ผลลัพธ์" ที่แทนค่าแล้ว (ส่วนที่มาจากตัวแปรเป็นแถบสี)
import { api } from '../app/api.js';
import { initPage } from '../app/shell.js';
import { blankInsurerForm, validateInsurerForm } from '../application/insurerFormRules.js';
import { buildSheetModel, cellValue, formatFormDate, thaiMonthYear } from '../application/usecases/insurerExport.js';
import { addDays, nextCycleDate, todayISO } from '../domain/date.js';
import { COLUMN_SOURCES, DATE_FORMATS, PLACEHOLDERS } from '../domain/insurerForm.js';
import { COMPANY_CODES } from '../domain/labels.js';
import { thaiIdCheckDigit } from '../domain/thaiId.js';
import { $, debounce, esc, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { downloadBlob, sheetModelToXlsx } from '../shared/excel.js';
import { icon } from '../shared/icons.js';
import { alertBox, badge, emptyState, errorState } from '../ui/components.js';
import { enhanceSelects } from '../ui/combobox.js';
import { busy, loader } from '../ui/loading.js';
import { confirmAction, errorMessage, toast } from '../ui/overlay.js';

initPage('insurers', { tour: 'insurers' });

const today = todayISO();
const cycle = nextCycleDate(today);
const editor = $('#editor');

const TABS = [
  { id: 'general', label: 'ข้อมูลทั่วไป' },
  { id: 'companies', label: 'บริษัท & กรมธรรม์' },
  { id: 'columns', label: 'คอลัมน์ในตาราง' },
  { id: 'document', label: 'หัว–ท้ายเอกสาร' },
];
/** ช่องที่ error แล้วต้องขึ้นจุดแดงที่แท็บไหน */
const TAB_OF_ERROR = { name: 'general', shortName: 'general', dateFormat: 'general', dateEra: 'general', companies: 'companies', columns: 'columns' };

/** ตัวแปรแยกหมวด — แสดงในเมนู "แทรกข้อมูล" */
const VAR_GROUPS = [
  { label: 'บริษัทในเครือ (แต่ละชีต)', tokens: ['{companyName}', '{companyCode}', '{policyNo}'] },
  { label: 'รอบและวันที่', tokens: ['{month}', '{cycleDate}', '{exportDate}'] },
  { label: 'จำนวนรายการ', tokens: ['{in}', '{out}', '{total}'] },
  { label: 'ผู้แจ้ง', tokens: ['{signerName}', '{signerDept}', '{signerPhone}'] },
  { label: 'บริษัทประกัน', tokens: ['{insurer}'] },
];
/** ลำดับตัวเลือก "ข้อมูลที่แสดงในคอลัมน์" (ข้อมูลพนักงาน → การแจ้ง → อื่น ๆ) */
const SOURCE_ORDER = ['seq', 'empCode', 'titleFullName', 'fullName', 'title', 'firstName', 'lastName', 'gender', 'birthDate', 'nationalId', 'position', 'phone', 'email', 'salary', 'startDate', 'companyCode', 'siteName', 'plan', 'inMark', 'outMark', 'effectiveDate', 'inEffectiveDate', 'outEffectiveDate', 'cycleDate', 'reason', 'text', 'blank'];

let forms = [];
let draft = null; // แบบฟอร์มที่กำลังแก้ (สำเนา)
let original = ''; // JSON ตอนเปิด — ใช้ตรวจว่ามีการแก้ไขค้าง
let errors = {};
let tab = TABS.some((t) => t.id === getParam('tab')) ? getParam('tab') : 'general';
let selCol = 0; // คอลัมน์ที่เลือกในแท็บคอลัมน์
let previewSheet = 1; // ชีตที่ดูในตัวอย่าง (0 = สรุป ถ้ามี)
let previewOpen = true;
const coCache = new Map(); // ค่าเดิมของบริษัทที่ถูกปิด (เปิดกลับแล้วได้ค่าคืน)

const clone = (x) => structuredClone(x);
const dirty = () => !!draft && JSON.stringify(draft) !== original;
const colLetter = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
const firstLine = (s) => String(s ?? '').split('\n')[0].trim();
/** บริษัทเรียงตามตัวอักษร = ลำดับชีตในไฟล์ (ตามไฟล์ของ HR: AS, CIC, CNS, HL, PRO) */
const CODES = [...COMPANY_CODES].sort();
const DATE_FORMAT_LABEL = { 'DD/MM/YYYY': 'วว/ดด/ปปปป', 'D/M/YYYY': 'ว/ด/ปปปป', 'D/M/YY': 'ว/ด/ปป' };

// ---------- ข้อมูลสมมติ (ตัวอย่าง + ผลลัพธ์ใต้ช่อง) ----------
function sampleEmployee(i, companyCode) {
  const first12 = `11017002307${i}`.slice(0, 12);
  return {
    id: i,
    empCode: `${companyCode}0600${i}`,
    title: i === 2 ? 'นางสาว' : 'นาย',
    firstName: ['สมชาย', 'สุดา', 'วิชัย'][i - 1],
    lastName: 'ตัวอย่าง',
    gender: i === 2 ? 'F' : 'M',
    birthDate: '1990-04-15',
    nationalId: first12 + thaiIdCheckDigit(first12),
    position: 'เจ้าหน้าที่',
    deptGroup: null,
    phone: '0812345678',
    email: '',
    salary: 18000,
    startDate: addDays(cycle, -40),
    companyCode,
    siteName: 'สำนักงานใหญ่',
    employeeType: 'CENTRAL',
  };
}
const sampleRow = (i, code) =>
  i < 3
    ? { type: 'IN', employee: sampleEmployee(i, code), effectiveDate: addDays(cycle, -8), reason: 'ครบอายุงาน 30 วัน' }
    : { type: 'OUT', employee: sampleEmployee(3, code), effectiveDate: addDays(cycle, -20), reason: 'ลาออก' };

function sampleCompany() {
  const c = draft.companies[0] ?? { companyCode: 'HL', policyNo: '', holderName: 'บริษัท ตัวอย่าง จำกัด', plan: '1' };
  return { ...c, companyName: c.holderName || c.companyCode };
}

function sampleData() {
  const cos = draft.companies.length ? draft.companies : [{ companyCode: 'HL', policyNo: '', holderName: 'บริษัท ตัวอย่าง จำกัด', plan: '1' }];
  return {
    cycleDate: cycle,
    insurer: draft,
    missing: [],
    companies: cos.map((c, ci) => ({
      ...c,
      companyName: c.holderName || c.companyCode,
      in: ci === 0 ? [sampleRow(1, c.companyCode), sampleRow(2, c.companyCode)] : [],
      out: ci === 0 ? [sampleRow(3, c.companyCode)] : [],
    })),
  };
}

/** ค่าของตัวแปรสำหรับแสดงผลลัพธ์ (ใช้บริษัทแรกที่ผูกไว้) */
function sampleVars(k) {
  const c = sampleCompany();
  const d = (iso) => formatFormDate(iso, draft.dateFormat, draft.dateEra);
  const vars = {
    insurer: draft.name,
    companyCode: c.companyCode,
    companyName: c.companyName,
    policyNo: c.policyNo,
    month: thaiMonthYear(cycle),
    cycleDate: d(cycle),
    exportDate: d(today),
    in: 2,
    out: 1,
    total: 3,
    signerName: draft.signer.name,
    signerDept: draft.signer.department,
    signerPhone: draft.signer.phone,
  };
  // ชื่อไฟล์ใช้ชื่อย่อ + วันที่รอบแบบ ค.ศ. (เรียงไฟล์ได้) — ตรงกับ buildSheetModel
  if (k === 'fileName') Object.assign(vars, { insurer: draft.shortName || draft.name, cycleDate: cycle });
  return vars;
}

/** ข้อความ + ตัวแปร → HTML ผลลัพธ์ (ส่วนที่แทนค่าเป็น <mark>) */
function resolvedHtml(text, k) {
  const vars = sampleVars(k);
  const out = String(text ?? '').replace(/\{(\w+)\}|([^{]+|\{)/g, (m, name, plain) => {
    if (plain !== undefined) return esc(plain);
    if (!(`{${name}}` in PLACEHOLDERS)) return `<mark class="bad" title="ไม่รู้จักข้อมูลนี้">${esc(m)}</mark>`;
    const v = String(vars[name] ?? '');
    return v ? `<mark title="${esc(PLACEHOLDERS[m])}">${esc(v)}</mark>` : `<mark class="empty" title="${esc(PLACEHOLDERS[m])} — ยังไม่ได้กรอก">ว่าง</mark>`;
  });
  return out.trim() ? out : '<span class="muted">(ว่าง)</span>';
}

// ---------- ช่องที่ใส่ตัวแปรได้ ----------
/**
 * @param {{k:string, value:string, label?:string, hint?:string, placeholder?:string, compact?:boolean, suffix?:string, aria?:string}} o
 */
function varField({ k, value, label = '', hint = '', placeholder = '', compact = false, suffix = '', aria = '' }) {
  const id = `v-${k.replace(/[^\w]/g, '-')}`;
  return html`<div class="vf${compact ? ' compact' : ''}">
    ${label ? html`<label for="${id}">${label}</label>` : ''}
    <div class="vf-box">
      <input class="input vf-input" id="${id}" data-k="${k}" data-var value="${value ?? ''}" placeholder="${placeholder}" autocomplete="off" aria-label="${aria || label}" />
      <button type="button" class="vf-btn" data-var-open="${id}" aria-haspopup="dialog" aria-label="แทรกข้อมูลอัตโนมัติ" title="แทรกข้อมูลอัตโนมัติ เช่น ชื่อบริษัท เดือน จำนวน (หรือพิมพ์ { )">
        ${raw(icon('braces'))}<span>แทรกข้อมูล</span>
      </button>
    </div>
    <div class="vf-out" data-out="${k}" data-suffix="${suffix}"><span class="vf-out-label">ผลลัพธ์</span><span class="vf-out-text">${raw(resolvedHtml(value, k))}${suffix}</span></div>
    ${hint ? html`<span class="hint">${hint}</span>` : ''}
  </div>`;
}

function refreshOut(k) {
  const el = editor.querySelector(`.vf-out[data-out="${CSS.escape(k)}"] .vf-out-text`);
  if (el) el.innerHTML = resolvedHtml(getValue(k), k) + esc(el.parentElement.dataset.suffix ?? '');
}
const refreshAllOuts = () => editor.querySelectorAll('.vf-out[data-out]').forEach((el) => refreshOut(el.dataset.out));

// ---------- เมนูแทรกข้อมูล ----------
let menu = null; // { el, field, query, start, end, active, fromBrace }

function closeMenu() {
  menu?.el.remove();
  menu = null;
}

function menuGroups(q) {
  const vars = sampleVars(menu?.field?.dataset.k);
  const ql = q.toLowerCase();
  return VAR_GROUPS.map((g) => ({
    ...g,
    items: g.tokens
      .filter((t) => !ql || t.toLowerCase().includes(ql) || PLACEHOLDERS[t].toLowerCase().includes(ql))
      .map((t) => ({ token: t, label: PLACEHOLDERS[t], example: String(vars[t.slice(1, -1)] ?? '') })),
  })).filter((g) => g.items.length);
}

function drawMenu() {
  const groups = menuGroups(menu.query);
  const count = groups.reduce((a, g) => a + g.items.length, 0);
  menu.active = Math.min(menu.active, Math.max(0, count - 1));
  let n = -1;
  menu.el.querySelector('.vf-list').innerHTML = count
    ? groups
        .map(
          (g) =>
            `<div class="vf-group">${esc(g.label)}</div>` +
            g.items
              .map((it) => {
                n++;
                return `<button type="button" class="vf-item${n === menu.active ? ' active' : ''}" role="option" aria-selected="${n === menu.active}" data-token="${esc(it.token)}">
                  <span class="vf-label">${esc(it.label)}</span>
                  <span class="vf-ex">${it.example ? esc(it.example) : '<i>ยังว่าง</i>'}</span>
                </button>`;
              })
              .join(''),
        )
        .join('')
    : '<div class="vf-none">ไม่พบข้อมูลที่ค้นหา</div>';
  // เลื่อนเฉพาะในรายการของเมนู (scrollIntoView จะเลื่อนทั้งหน้า → เมนูปิดตัวเอง)
  const list = menu.el.querySelector('.vf-list');
  const it = list.querySelector('.vf-item.active');
  if (it) {
    if (it.offsetTop < list.scrollTop) list.scrollTop = it.offsetTop - 6;
    else if (it.offsetTop + it.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = it.offsetTop + it.offsetHeight - list.clientHeight + 6;
  }
}

/** เปิดเมนูใต้ช่อง — fromBrace = เปิดเพราะพิมพ์ "{" (กรองตามที่พิมพ์ต่อในช่อง) */
function openMenu(field, { fromBrace = false } = {}) {
  closeMenu();
  const el = document.createElement('div');
  el.className = 'popover vf-menu';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'แทรกข้อมูลอัตโนมัติ');
  el.innerHTML = `<div class="vf-menu-head"><b>แทรกข้อมูลอัตโนมัติ</b><span>ระบบใส่ค่าจริงให้ตอนส่งออกไฟล์ · ตัวอย่างค่าแสดงด้านขวา</span></div>
    ${fromBrace ? '' : `<div class="popover-search">${icon('search')}<input type="text" placeholder="ค้นหา เช่น เดือน, กรมธรรม์, ผู้แจ้ง…" aria-label="ค้นหาข้อมูล" /></div>`}
    <div class="vf-list" role="listbox"></div>
    <div class="vf-menu-foot">↑ ↓ เลือก · Enter แทรก · Esc ปิด · ทางลัด: พิมพ์ <kbd>{</kbd> ในช่อง</div>`;
  document.body.append(el);
  // ตำแหน่งเคอร์เซอร์: พิมพ์ { = ตำแหน่งปัจจุบัน · กดปุ่ม = ตำแหน่งล่าสุดก่อนออกจากช่อง (ยังไม่เคยคลิกช่อง = ต่อท้าย)
  const caret = fromBrace ? (field.selectionStart ?? field.value.length) : Number(field.dataset.caret ?? field.value.length);
  const caretEnd = fromBrace ? caret : Number(field.dataset.caretEnd ?? caret);
  menu = { el, field, query: '', active: 0, start: fromBrace ? caret - 1 : caret, end: caretEnd, fromBrace };
  positionMenu();
  drawMenu();
  const search = el.querySelector('.popover-search input');
  // จอสัมผัส: ไม่โฟกัสช่องค้นหาเอง (แป้นพิมพ์จะเด้งขึ้นมาบังเมนู) — แตะช่องค้นหาเองได้
  if (!matchMedia('(pointer: coarse)').matches) search?.focus();
  search?.addEventListener('input', () => {
    menu.query = search.value.trim();
    menu.active = 0;
    drawMenu();
  });
  el.addEventListener('mousedown', (e) => e.target.closest('.vf-item') && e.preventDefault()); // ช่องไม่เสียโฟกัส
  el.addEventListener('click', (e) => {
    const it = e.target.closest('.vf-item');
    if (it) insertToken(it.dataset.token);
  });
  el.addEventListener('keydown', menuKeys);
}

/** วางเมนูใต้ช่อง ชิดขวา · ล้นล่างจอ → ขึ้นด้านบน · ช่องเลื่อนพ้นจอ → ปิด */
function positionMenu() {
  if (!menu) return;
  const r = menu.field.closest('.vf-box').getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return closeMenu();
  const el = menu.el;
  const w = Math.min(400, window.innerWidth - 16);
  el.style.width = `${w}px`;
  el.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
  const below = window.innerHeight - r.bottom;
  if (below < 360 && r.top > below) {
    el.style.top = '';
    el.style.bottom = `${window.innerHeight - r.top + 4}px`;
  } else {
    el.style.bottom = '';
    el.style.top = `${r.bottom + 4}px`;
  }
}

function menuKeys(e) {
  if (!menu) return;
  const count = menu.el.querySelectorAll('.vf-item').length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    menu.active = (menu.active + (e.key === 'ArrowDown' ? 1 : -1) + count) % Math.max(1, count);
    drawMenu();
  } else if (e.key === 'Enter') {
    const it = menu.el.querySelector('.vf-item.active');
    if (it) {
      e.preventDefault();
      insertToken(it.dataset.token);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    const f = menu.field;
    closeMenu();
    f.focus();
  }
}

function insertToken(token) {
  const f = menu.field;
  const start = menu.start;
  const end = menu.fromBrace ? (f.selectionStart ?? f.value.length) : menu.end;
  f.value = f.value.slice(0, start) + token + f.value.slice(end);
  closeMenu();
  f.focus();
  const pos = start + token.length;
  f.setSelectionRange(pos, pos);
  f.dispatchEvent(new Event('input', { bubbles: true }));
}

document.addEventListener('mousedown', (e) => {
  if (menu && !menu.el.contains(e.target) && !e.target.closest?.(`[data-var-open="${menu.field.id}"]`) && e.target !== menu.field) closeMenu();
});
window.addEventListener('resize', positionMenu); // รวมตอนแป้นพิมพ์มือถือเด้งขึ้น
// พื้นที่ที่ "มีช่องนั้นอยู่" เลื่อน → เมนูเลื่อนตามช่อง (ไม่นับการเลื่อนข้อความภายในช่องเอง/ในเมนู)
document.addEventListener(
  'scroll',
  (e) => {
    if (!menu || e.target === menu.field || menu.el.contains(e.target)) return;
    if (e.target === document || e.target.contains?.(menu.field)) positionMenu();
  },
  true,
);

// ---------- รายการแบบฟอร์ม ----------
function drawList() {
  const id = draft?.id ?? null;
  render(
    $('#list'),
    forms.length || draft
      ? html`${forms.map(
          (f) => html`<button type="button" class="ins-item${f.id === id ? ' active' : ''}" data-open="${f.id}" ${f.id === id ? raw('aria-current="true"') : ''}>
            <span class="ins-item-icon">${raw(icon('file-spreadsheet'))}</span>
            <span class="ins-item-body">
              <span class="ins-item-head">
                <b class="truncate">${f.id === id ? draft.shortName || 'ไม่มีชื่อ' : f.shortName}</b>
                ${(f.id === id ? draft.active : f.active) ? badge('เปิดใช้', 'success') : badge('ปิดอยู่', 'neutral')}
              </span>
              <span class="ins-item-cos">${(f.id === id ? draft : f).companies.map((c) => c.companyCode).join(' · ') || 'ยังไม่ผูกบริษัท'}</span>
            </span>
          </button>`,
        )}
        ${draft && !draft.id ? html`<div class="ins-item active new"><span class="ins-item-icon">${raw(icon('plus'))}</span><span class="ins-item-body"><b>${draft.shortName || 'แบบฟอร์มใหม่'}</b><span class="muted small">ยังไม่บันทึก</span></span></div>` : ''}`
      : emptyState({ iconName: 'file-spreadsheet', title: 'ยังไม่มีแบบฟอร์ม', description: 'กด “เพิ่มแบบฟอร์ม” เพื่อเริ่ม' }),
  );
}
const drawListSoon = debounce(drawList, 200);

// ---------- แท็บ: ข้อมูลทั่วไป ----------
const fieldErr = (k) => (errors[k] ? html`<span class="error">${errors[k]}</span>` : '');
const switchRow = (k, checked, title, desc) => html`<div class="sw-row">
  <button type="button" class="switch" role="switch" aria-checked="${!!checked}" data-switch="${k}" aria-label="${title}"></button>
  <span><b>${title}</b><small>${desc}</small></span>
</div>`;

function generalPane() {
  return html`<div class="pane-grid">
    <section class="pane-block">
      <h3>บริษัทประกัน</h3>
      <div class="field">
        <label for="f-name">ชื่อบริษัทประกัน<span class="req">*</span></label>
        <input class="input" id="f-name" data-k="name" value="${draft.name}" placeholder="เช่น บริษัท ไทยประกันชีวิต จำกัด (มหาชน)" ${errors.name ? raw('aria-invalid="true"') : ''} />
        ${fieldErr('name')}
      </div>
      <div class="field">
        <label for="f-short">ชื่อย่อ<span class="req">*</span></label>
        <input class="input" id="f-short" data-k="shortName" value="${draft.shortName}" placeholder="เช่น ไทยประกันชีวิต" ${errors.shortName ? raw('aria-invalid="true"') : ''} />
        ${errors.shortName ? fieldErr('shortName') : html`<span class="hint">แสดงในหน้าส่งออกและชื่อไฟล์</span>`}
      </div>
      ${switchRow('active', draft.active, draft.active ? 'เปิดใช้' : 'ปิดอยู่', draft.active ? 'แสดงในหน้าส่งออกของประกันกลุ่ม' : 'ไม่แสดงในหน้าส่งออก — เปิดเมื่อพร้อมใช้')}
    </section>

    <section class="pane-block">
      <h3>รูปแบบข้อมูลในไฟล์</h3>
      <div class="form-grid g2">
        <div class="field">
          <label for="f-date">รูปแบบวันที่</label>
          <select id="f-date" data-k="dateFormat" data-combobox>${Object.keys(DATE_FORMATS).map((k) => html`<option value="${k}" ${k === draft.dateFormat ? 'selected' : ''}>${DATE_FORMAT_LABEL[k]}</option>`)}</select>
        </div>
        <div class="field">
          <span class="label">ปี</span>
          <div class="seg-lg" role="radiogroup" aria-label="ปี">
            ${[
              ['BE', 'พ.ศ.'],
              ['CE', 'ค.ศ.'],
            ].map(([v, l]) => html`<button type="button" role="radio" aria-checked="${draft.dateEra === v}" class="${draft.dateEra === v ? 'on' : ''}" data-set="dateEra" data-value="${v}">${l}</button>`)}
          </div>
        </div>
      </div>
      <div class="example-line">${raw(icon('eye'))}<span>วันที่ในไฟล์จะเป็น <b class="num" id="date-example">${formatFormDate(cycle, draft.dateFormat, draft.dateEra)}</b></span></div>
      <div class="form-grid g2">
        <div class="field">
          <label for="f-in">เครื่องหมายในช่อง “เข้าใหม่”</label>
          <input class="input mark-input" id="f-in" data-k="inMark" value="${draft.inMark}" maxlength="5" />
        </div>
        <div class="field">
          <label for="f-out">เครื่องหมายในช่อง “ลาออก”</label>
          <input class="input mark-input" id="f-out" data-k="outMark" value="${draft.outMark}" maxlength="5" />
        </div>
      </div>
    </section>

    <section class="pane-block span-all">
      <h3>ไฟล์และชีต</h3>
      <div class="form-grid g2">
        ${varField({ k: 'fileName', value: draft.fileName, label: 'ชื่อไฟล์', suffix: '.xlsx' })}
        ${varField({ k: 'sheetName', value: draft.sheetName, label: 'ชื่อชีตของแต่ละบริษัท', hint: 'ปกติใช้ตัวย่อบริษัท เช่น HL, PRO' })}
        <div>
          ${switchRow('summarySheet', draft.summarySheet, 'มีชีต “สรุป”', 'ชีตแรกของไฟล์ — จำนวนเข้า/ออกต่อบริษัท')}
          ${draft.summarySheet ? html`<div class="sub-field">${varField({ k: 'summaryTitle', value: draft.summaryTitle, label: 'หัวชีตสรุป' })}</div>` : ''}
        </div>
        <div>${switchRow('includeEmptySheets', draft.includeEmptySheets, 'สร้างชีตแม้ไม่มีรายการ', 'บริษัทที่รอบนั้นไม่มีคนเข้า/ออก ก็ยังมีชีต (ตามไฟล์เดิม)')}</div>
      </div>
    </section>
  </div>`;
}

// ---------- แท็บ: บริษัท & กรมธรรม์ ----------
function usedBy(code) {
  return forms.find((f) => f.id !== draft.id && f.active && f.companies.some((c) => c.companyCode === code));
}

function companiesPane() {
  const byCode = new Map(draft.companies.map((c) => [c.companyCode, c]));
  return html`<div>
    <p class="pane-intro">${raw(icon('info'))}<span>เปิดเฉพาะบริษัทที่ส่งแจ้งกับ <b>${draft.shortName || 'บริษัทประกันนี้'}</b> — แต่ละบริษัทเป็น 1 ชีตในไฟล์ · 1 บริษัทผูกกับแบบฟอร์มที่เปิดใช้ได้ 1 แบบ</span></p>
    ${errors.companies ? alertBox({ tone: 'danger', title: errors.companies }) : ''}
    <div class="co-cards">
      ${CODES.map((code) => {
        const c = byCode.get(code);
        const other = usedBy(code);
        const clash = !!(c && other && draft.active);
        return html`<article class="co-card${c ? ' on' : ''}${clash ? ' clash' : ''}">
          <header>
            <button type="button" class="switch" role="switch" aria-checked="${!!c}" data-co-toggle="${code}" aria-label="ส่งแจ้งบริษัท ${code} กับแบบฟอร์มนี้"></button>
            <b class="co-code">${code}</b>
            ${other ? html`<span class="co-used${clash ? ' bad' : ''}" title="แบบฟอร์มที่เปิดใช้อื่นใช้บริษัทนี้อยู่">${raw(icon(clash ? 'alert-triangle' : 'info'))} ใช้กับ ${other.shortName}</span>` : ''}
          </header>
          ${c
            ? html`<div class="co-fields">
                <div class="field">
                  <label for="co-${code}-holder">ชื่อผู้ถือกรมธรรม์</label>
                  <input class="input" id="co-${code}-holder" data-k="co:${code}:holderName" value="${c.holderName}" placeholder="บริษัท … จำกัด" />
                </div>
                <div class="co-row">
                  <div class="field">
                    <label for="co-${code}-policy">เลขที่กรมธรรม์</label>
                    <input class="input" id="co-${code}-policy" data-k="co:${code}:policyNo" value="${c.policyNo}" placeholder="เช่น จี3-8001" />
                  </div>
                  <div class="field">
                    <label for="co-${code}-plan">แผนประกัน</label>
                    <input class="input" id="co-${code}-plan" data-k="co:${code}:plan" value="${c.plan}" placeholder="1" />
                  </div>
                </div>
              </div>`
            : html`<p class="co-off">ไม่อยู่ในไฟล์ของแบบฟอร์มนี้ — เปิดสวิตช์เพื่อเพิ่ม</p>`}
        </article>`;
      })}
    </div>
  </div>`;
}

// ---------- แท็บ: คอลัมน์ ----------
const SCOPE = [
  ['', 'ทุกแถว'],
  ['IN', 'เฉพาะเข้าใหม่'],
  ['OUT', 'เฉพาะลาออก'],
];
const groupParts = (g) =>
  String(g ?? '')
    .split('>')
    .map((s) => s.trim())
    .filter(Boolean);

/** ตัวอย่างค่าที่คอลัมน์นี้จะแสดง (แถวเข้าใหม่ / ลาออก) */
function columnExample(c) {
  if (c.source === 'blank') return 'ช่องว่าง — ให้กรอกเองใน Excel';
  const company = sampleCompany();
  const [inV, outV] = [1, 3].map((i, n) => String(cellValue(c, sampleRow(i, company.companyCode), n + 1, draft, company, cycle) ?? ''));
  if (inV === outV) return inV ? `ทุกแถว: ${inV}` : '(ว่าง)';
  return `เข้าใหม่: ${inV || '(ว่าง)'} · ลาออก: ${outV || '(ว่าง)'}`;
}

function columnsList() {
  return html`${draft.columns.map((c, i) => {
    const g = groupParts(c.group);
    return html`<li class="colx-item${i === selCol ? ' active' : ''}" draggable="true" data-col="${i}" role="option" aria-selected="${i === selCol}" tabindex="${i === selCol ? 0 : -1}">
      <span class="colx-grip" aria-hidden="true" title="ลากเพื่อย้าย">${raw(icon('grip-vertical'))}</span>
      <span class="colx-letter num">${colLetter(i)}</span>
      <span class="colx-main">
        <b class="truncate">${firstLine(c.header) || html`<i class="muted">(ไม่มีหัวคอลัมน์)</i>`}</b>
        <span class="colx-meta">
          <span class="truncate">${COLUMN_SOURCES[c.source]?.label ?? c.source}</span>
          ${c.only ? html`<span class="tag">${c.only === 'IN' ? 'เข้าใหม่' : 'ลาออก'}</span>` : ''}
          ${g.length ? html`<span class="tag grp" title="${g.join(' › ')}">${g[g.length - 1]}</span>` : ''}
        </span>
      </span>
    </li>`;
  })}`;
}

function columnDetail() {
  const c = draft.columns[selCol];
  if (!c) return emptyState({ iconName: 'list-checks', title: 'ยังไม่มีคอลัมน์', description: 'กด “เพิ่มคอลัมน์”' });
  const g = groupParts(c.group);
  const allGroups = [...new Set(draft.columns.flatMap((x) => groupParts(x.group)))];
  const n = draft.columns.length;
  return html`<div class="colx-detail">
    <header class="colx-dhead">
      <span class="colx-letter big num">${colLetter(selCol)}</span>
      <div class="grow">
        <h3>คอลัมน์ ${colLetter(selCol)}</h3>
        <p class="muted small">ลำดับที่ ${selCol + 1} จาก ${n} · ลากในรายการด้านซ้ายเพื่อย้าย</p>
      </div>
      <div class="row-actions">
        <button type="button" class="btn-icon sm" data-col-move="-1" ${selCol === 0 ? 'disabled' : ''} title="ย้ายไปซ้าย" aria-label="ย้ายไปซ้าย">${raw(icon('chevron-left'))}</button>
        <button type="button" class="btn-icon sm" data-col-move="1" ${selCol === n - 1 ? 'disabled' : ''} title="ย้ายไปขวา" aria-label="ย้ายไปขวา">${raw(icon('chevron-right'))}</button>
        <button type="button" class="btn-icon sm danger-text" data-col-del title="ลบคอลัมน์" aria-label="ลบคอลัมน์ ${colLetter(selCol)}">${raw(icon('trash-2'))}</button>
      </div>
    </header>

    <div class="field">
      <label for="c-header">หัวคอลัมน์</label>
      <textarea class="input" id="c-header" rows="2" data-k="columns:${selCol}:header" placeholder="เช่น รหัสพนักงาน">${c.header}</textarea>
      <span class="hint">กด Enter เพื่อขึ้นบรรทัดใหม่ในหัวตาราง (เช่น ไทย + อังกฤษ)</span>
    </div>

    <div class="field">
      <label for="c-source">ข้อมูลที่แสดงในคอลัมน์</label>
      <select id="c-source" data-k="columns:${selCol}:source" data-combobox>${SOURCE_ORDER.map((k) => html`<option value="${k}" ${k === c.source ? 'selected' : ''}>${COLUMN_SOURCES[k].label}</option>`)}</select>
      ${c.source === 'text' ? html`<input class="input" style="margin-top:8px" data-k="columns:${selCol}:text" value="${c.text ?? ''}" placeholder="ข้อความที่จะแสดงทุกแถว" aria-label="ข้อความคงที่" />` : ''}
      <div class="example-line" id="col-example">${raw(icon('eye'))}<span>${columnExample(c)}</span></div>
    </div>

    <div class="field">
      <span class="label">แสดงค่าในแถว</span>
      <div class="seg-lg" role="radiogroup" aria-label="แสดงค่าในแถว">
        ${SCOPE.map(([v, l]) => html`<button type="button" role="radio" aria-checked="${(c.only ?? '') === v}" class="${(c.only ?? '') === v ? 'on' : ''}" data-col-only="${v}">${l}</button>`)}
      </div>
      <span class="hint">เช่น วันเกิด/เลขบัตร กรอกเฉพาะแถวเข้าใหม่ — แถวลาออกเว้นว่าง</span>
    </div>

    <div class="field">
      <span class="label">อยู่ใต้หัวกลุ่ม <span class="muted">(ไม่บังคับ)</span></span>
      <div class="grp-row">
        <input class="input" list="grp-list" data-grp="0" value="${g[0] ?? ''}" placeholder="หัวกลุ่มชั้นบน" aria-label="หัวกลุ่มชั้นบน" />
        <span class="muted" aria-hidden="true">›</span>
        <input class="input" list="grp-list" data-grp="1" value="${g[1] ?? ''}" placeholder="กลุ่มย่อย" aria-label="กลุ่มย่อย" ${g[0] ? '' : 'disabled'} />
        <datalist id="grp-list">${allGroups.map((x) => html`<option value="${x}"></option>`)}</datalist>
      </div>
      <span class="hint">คอลัมน์ที่อยู่ติดกันและกลุ่มเดียวกันจะรวมหัวให้เอง เช่น <b>ประกันชีวิตกลุ่ม › เข้าใหม่</b></span>
    </div>

    <div class="field">
      <label for="c-width">ความกว้าง <b class="num" id="width-out">${c.width}</b> <span class="muted">ตัวอักษร</span></label>
      <input type="range" class="range" id="c-width" min="3" max="60" step="1" data-k="columns:${selCol}:width" value="${c.width}" />
    </div>
  </div>`;
}

function columnsPane() {
  return html`<div>
    ${errors.columns ? alertBox({ tone: 'danger', title: errors.columns }) : ''}
    <div class="colx">
      <div class="colx-side">
        <div class="colx-side-head">
          <b>${draft.columns.length} คอลัมน์</b>
          <span class="muted small">เรียงซ้าย → ขวาตามไฟล์</span>
        </div>
        <ul class="colx-list" role="listbox" aria-label="คอลัมน์ในตาราง">
          ${columnsList()}
        </ul>
        <button type="button" class="btn btn-sm colx-add" data-col-add>${raw(icon('plus'))} เพิ่มคอลัมน์ (ต่อจาก ${colLetter(selCol)})</button>
      </div>
      <div class="colx-pane" id="col-detail">${columnDetail()}</div>
    </div>
  </div>`;
}

// ---------- แท็บ: หัว–ท้ายเอกสาร ----------
function documentPane() {
  return html`<div class="pane-grid">
    <section class="pane-block span-all">
      <h3>หัวเอกสาร <span class="muted small">บรรทัดเหนือตาราง ยาวเต็มความกว้าง</span></h3>
      <ol class="doc-lines">
        ${draft.headerLines.map(
          (l, i) => html`<li class="doc-line">
            <div class="doc-tools" role="toolbar" aria-label="รูปแบบบรรทัด ${i + 1}">
              <span class="doc-no num">${i + 1}</span>
              <button type="button" class="tool${l.align !== 'center' ? ' on' : ''}" data-line-set="${i}" data-prop="align" data-value="left" title="ชิดซ้าย" aria-label="ชิดซ้าย" aria-pressed="${l.align !== 'center'}">${raw(icon('align-left'))}</button>
              <button type="button" class="tool${l.align === 'center' ? ' on' : ''}" data-line-set="${i}" data-prop="align" data-value="center" title="กึ่งกลาง" aria-label="กึ่งกลาง" aria-pressed="${l.align === 'center'}">${raw(icon('align-center'))}</button>
              <button type="button" class="tool${l.bold ? ' on' : ''}" data-line-set="${i}" data-prop="bold" title="ตัวหนา" aria-label="ตัวหนา" aria-pressed="${!!l.bold}">${raw(icon('bold'))}</button>
              <label class="tool-size">ขนาด
                <select data-k="headerLines:${i}:size" aria-label="ขนาดตัวอักษรบรรทัด ${i + 1}">${[10, 11, 12, 13, 14, 16, 18].map((s) => html`<option value="${s}" ${Number(l.size) === s ? 'selected' : ''}>${s}</option>`)}</select>
              </label>
              <span class="grow"></span>
              <button type="button" class="tool" data-line-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="เลื่อนขึ้น" aria-label="เลื่อนขึ้น">${raw(icon('arrow-up'))}</button>
              <button type="button" class="tool" data-line-move="${i}" data-dir="1" ${i === draft.headerLines.length - 1 ? 'disabled' : ''} title="เลื่อนลง" aria-label="เลื่อนลง">${raw(icon('arrow-down'))}</button>
              <button type="button" class="tool danger-text" data-line-del="${i}" title="ลบบรรทัด" aria-label="ลบบรรทัด ${i + 1}">${raw(icon('trash-2'))}</button>
            </div>
            ${varField({ k: `headerLines:${i}:text`, value: l.text, compact: true, aria: `หัวเอกสารบรรทัด ${i + 1}`, placeholder: 'พิมพ์ข้อความ แล้วกด “แทรกข้อมูล” เพื่อใส่ชื่อบริษัท เดือน ฯลฯ' })}
          </li>`,
        )}
      </ol>
      <button type="button" class="btn btn-sm" data-line-add="headerLines">${raw(icon('plus'))} เพิ่มบรรทัดหัวเอกสาร</button>
    </section>

    <section class="pane-block span-all">
      <h3>ใต้ตาราง</h3>
      ${varField({ k: 'totalsLine', value: draft.totalsLine, label: 'บรรทัดสรุปจำนวน', placeholder: 'เว้นว่าง = ไม่แสดง', hint: 'ต่อจากแถวสุดท้ายของตาราง' })}
      <span class="label doc-sub">ข้อความท้ายเอกสาร <span class="muted small">1 บรรทัด = 1 แถวใน Excel · บรรทัดว่าง = เว้น 1 แถว</span></span>
      <ol class="doc-lines">
        ${draft.footerLines.map(
          (l, i) => html`<li class="doc-line row-line">
            <span class="doc-no num">${i + 1}</span>
            <div class="grow">${varField({ k: `footerLines:${i}`, value: l, compact: true, aria: `ท้ายเอกสารบรรทัด ${i + 1}`, placeholder: '(บรรทัดว่าง)' })}</div>
            <button type="button" class="tool danger-text" data-foot-del="${i}" title="ลบบรรทัด" aria-label="ลบบรรทัดท้าย ${i + 1}">${raw(icon('trash-2'))}</button>
          </li>`,
        )}
      </ol>
      <button type="button" class="btn btn-sm" data-line-add="footerLines">${raw(icon('plus'))} เพิ่มบรรทัดท้ายเอกสาร</button>
    </section>

    <section class="pane-block span-all">
      <h3>ผู้แจ้ง <span class="muted small">ใช้กับข้อมูล “ชื่อผู้แจ้ง / แผนก / โทร” ในหัว–ท้ายเอกสาร</span></h3>
      <div class="form-grid g3">
        <div class="field"><label for="s-name">ชื่อผู้แจ้ง</label><input class="input" id="s-name" data-k="signer.name" value="${draft.signer.name}" /></div>
        <div class="field"><label for="s-dept">แผนก / ฝ่าย</label><input class="input" id="s-dept" data-k="signer.department" value="${draft.signer.department}" /></div>
        <div class="field"><label for="s-phone">โทรศัพท์</label><input class="input" id="s-phone" data-k="signer.phone" value="${draft.signer.phone}" /></div>
      </div>
    </section>
  </div>`;
}

const PANES = { general: generalPane, companies: companiesPane, columns: columnsPane, document: documentPane };

// ---------- ตัวแก้ไข ----------
function tabMeta(id) {
  if (id === 'companies') return `${draft.companies.length} บริษัท`;
  if (id === 'columns') return `${draft.columns.length} คอลัมน์`;
  if (id === 'document') return `${draft.headerLines.length + draft.footerLines.length} บรรทัด`;
  return draft.active ? 'เปิดใช้' : 'ปิดอยู่';
}

function stepsHtml() {
  const errTabs = new Set(Object.keys(errors).map((k) => TAB_OF_ERROR[k]).filter(Boolean));
  return html`${TABS.map(
    (t, i) => html`<button type="button" class="ins-step${t.id === tab ? ' active' : ''}" role="tab" aria-selected="${t.id === tab}" data-tab="${t.id}">
      <span class="ins-step-no">${i + 1}</span>
      <span class="ins-step-text"><b>${t.label}</b><small>${tabMeta(t.id)}</small></span>
      ${errTabs.has(t.id) ? html`<span class="ins-step-err" title="มีข้อมูลต้องแก้">!</span>` : ''}
    </button>`,
  )}`;
}

function drawPane() {
  closeMenu();
  render($('#pane'), PANES[tab]());
  enhanceSelects($('#pane'));
  render($('#steps'), stepsHtml());
}

function headTitle() {
  return html`${draft.shortName || draft.name || 'แบบฟอร์มใหม่'} ${draft.id ? '' : badge('ยังไม่บันทึก', 'warning')}`;
}

function drawEditor() {
  closeMenu();
  if (!draft) {
    render(editor, html`<div class="card">${emptyState({ iconName: 'file-spreadsheet', title: 'เลือกแบบฟอร์มทางซ้าย', description: 'หรือกด “เพิ่มแบบฟอร์ม”' })}</div>`);
    return;
  }
  render(
    editor,
    html`<section class="card ins-card">
        <header class="ins-head">
          <span class="card-icon">${raw(icon('file-spreadsheet'))}</span>
          <div class="grow">
            <h2 id="ed-title">${headTitle()}</h2>
            <p class="muted" id="ed-sub">${draft.name || 'กรอกชื่อบริษัทประกันในแท็บ “ข้อมูลทั่วไป”'}</p>
          </div>
          <div class="row-actions">
            ${draft.id
              ? html`<button type="button" class="btn btn-ghost btn-sm" id="dup">${raw(icon('copy'))} ทำสำเนา</button>
                  <button type="button" class="btn btn-ghost btn-sm danger-text" id="del">${raw(icon('trash-2'))} ลบ</button>`
              : ''}
          </div>
        </header>
        <nav class="ins-steps" id="steps" role="tablist" aria-label="ส่วนของแบบฟอร์ม"></nav>
        <div class="ins-pane" id="pane" role="tabpanel"></div>
      </section>

      <section class="card ins-preview${previewOpen ? '' : ' closed'}" id="sec-preview">
        <header class="ins-preview-head">
          <button type="button" class="ins-preview-toggle" id="preview-toggle" aria-expanded="${previewOpen}">
            ${raw(icon('chevron-down'))}
            <span><b>ตัวอย่างไฟล์</b><small>ข้อมูลสมมติ 3 คน (เข้า 2 · ออก 1) · คลิกคอลัมน์ในตัวอย่างเพื่อแก้คอลัมน์นั้น</small></span>
          </button>
          <button type="button" class="btn btn-sm" id="sample">${raw(icon('download'))} ดาวน์โหลดไฟล์ตัวอย่าง</button>
        </header>
        <div class="xl-wrap">
          <div class="xl-tabs" id="preview-tabs" role="tablist"></div>
          <div class="xl-scroll" id="preview"></div>
        </div>
      </section>

      <div class="form-footer">
        <span class="dirty-note" id="dirty-note"></span>
        <button type="button" class="btn btn-ghost" id="revert" disabled>ยกเลิกการแก้ไข</button>
        <button type="submit" class="btn btn-primary" id="save" data-label="บันทึก">${raw(icon('save'))} บันทึก</button>
      </div>`,
  );
  drawPane();
  drawPreview();
  afterEdit({ preview: false });
}

// ---------- ตัวอย่าง (HTML) ----------
function sheetHtml(sheet, isCompany) {
  const nrow = Math.max(0, ...sheet.cells.map((c) => c.r)) + 1;
  const ncol = Math.max(sheet.widths.length, ...sheet.cells.map((c) => c.c + 1));
  const at = new Map(sheet.cells.map((c) => [`${c.r},${c.c}`, c]));
  const span = new Map();
  const covered = new Set();
  for (const [r1, c1, r2, c2] of sheet.merges) {
    span.set(`${r1},${c1}`, { rs: r2 - r1 + 1, cs: c2 - c1 + 1 });
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) covered.add(`${r},${c}`);
  }
  const head = new Set(sheet.headerRows);
  const firstHead = Math.min(...sheet.headerRows);
  const lastData = Math.max(firstHead, ...sheet.cells.filter((c) => ['td', 'tdCenter', 'tdNum'].includes(c.s)).map((c) => c.r));
  const rows = [];
  for (let r = 0; r < nrow; r++) {
    const tds = [];
    for (let c = 0; c < ncol; c++) {
      const k = `${r},${c}`;
      if (covered.has(k)) continue;
      const cell = at.get(k);
      const sp = span.get(k);
      // เซลล์ในตารางที่ไม่ merge ข้ามคอลัมน์ ผูกกับคอลัมน์ → คลิกเพื่อแก้ / ไฮไลต์คอลัมน์ที่เลือก
      const inTable = isCompany && r >= firstHead && r <= lastData && !(sp?.cs > 1);
      const cls = [cell?.s ?? 'blank', cell?.bold ? 'b' : '', cell?.align === 'center' ? 'center' : '', inTable ? 'colcell' : '', inTable && c === selCol ? 'sel' : ''].join(' ');
      const style = cell?.size ? `font-size:${Math.round(cell.size * 0.9)}px` : '';
      tds.push(
        html`<td class="${cls}" ${inTable ? raw(`data-c="${c}" title="คลิกเพื่อแก้คอลัมน์ ${colLetter(c)}"`) : ''} ${sp?.rs > 1 ? raw(`rowspan="${sp.rs}"`) : ''} ${sp?.cs > 1 ? raw(`colspan="${sp.cs}"`) : ''} style="${style}">${raw(esc(String(cell?.v ?? '')).replace(/\n/g, '<br>'))}</td>`,
      );
    }
    rows.push(html`<tr class="${head.has(r) ? 'hr' : ''}"><th class="xl-rn">${r + 1}</th>${tds}</tr>`);
  }
  return html`<table class="xl-preview">
    <colgroup>
      <col style="width:34px" />
      ${sheet.widths.map((w) => html`<col style="width:${Math.round(w * 7.5)}px" />`)}
    </colgroup>
    <thead>
      <tr>
        <th class="xl-rn"></th>
        ${sheet.widths.map((_, i) => html`<th class="xl-cl${isCompany && i === selCol ? ' sel' : ''}" ${isCompany ? raw(`data-c="${i}"`) : ''}>${colLetter(i)}</th>`)}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

const previewModel = () => buildSheetModel(sampleData(), { exportDate: today });

function drawPreview() {
  const box = $('#preview');
  if (!box) return;
  let model;
  try {
    model = previewModel();
  } catch (e) {
    render(box, alertBox({ tone: 'warning', title: 'ยังแสดงตัวอย่างไม่ได้', body: errorMessage(e) }));
    return;
  }
  if (!model.sheets.length) {
    render(box, emptyState({ iconName: 'file-spreadsheet', title: 'ยังไม่มีชีต', description: 'เปิดบริษัทอย่างน้อย 1 บริษัทในแท็บ “บริษัท & กรมธรรม์”' }));
    $('#preview-tabs').innerHTML = '';
    return;
  }
  previewSheet = Math.min(previewSheet, model.sheets.length - 1);
  render(
    $('#preview-tabs'),
    html`${model.sheets.map((s, i) => html`<button type="button" class="xl-tab${i === previewSheet ? ' active' : ''}" role="tab" aria-selected="${i === previewSheet}" data-sheet="${i}">${s.name}</button>`)}
      <span class="muted small xl-file">${raw(icon('file-spreadsheet'))} ${model.fileName}.xlsx</span>`,
  );
  const isCompany = !(draft.summarySheet && previewSheet === 0);
  const sl = box.scrollLeft;
  render(box, sheetHtml(model.sheets[previewSheet], isCompany));
  box.scrollLeft = sl;
}
const drawPreviewSoon = debounce(drawPreview, 120);

// ---------- อ่าน / เขียนค่าใน draft ----------
function getValue(k) {
  const p = k.split(':');
  if (p[0] === 'co') return draft.companies.find((c) => c.companyCode === p[1])?.[p[2]];
  if (p[0] === 'footerLines') return draft.footerLines[Number(p[1])];
  if (p.length === 3) return draft[p[0]][Number(p[1])]?.[p[2]];
  if (k.includes('.')) {
    const [a, b] = k.split('.');
    return draft[a][b];
  }
  return draft[k];
}

function setValue(k, v) {
  const p = k.split(':');
  if (p[0] === 'co') {
    const c = draft.companies.find((x) => x.companyCode === p[1]);
    if (c) c[p[2]] = v;
  } else if (p[0] === 'footerLines') draft.footerLines[Number(p[1])] = v;
  else if (p.length === 3) draft[p[0]][Number(p[1])][p[2]] = v;
  else if (k.includes('.')) {
    const [a, b] = k.split('.');
    draft[a][b] = v;
  } else draft[k] = v;
}

const NUMERIC = /:(width|size)$/;

function afterEdit({ list = false, steps = false, preview = true } = {}) {
  const d = dirty();
  $('#revert').disabled = !d;
  render($('#dirty-note'), d ? html`<span class="dot"></span> มีการแก้ไขที่ยังไม่บันทึก` : '');
  if (list) drawListSoon();
  if (steps) render($('#steps'), stepsHtml());
  if (preview) drawPreviewSoon();
}

/** อัปเดตรายการคอลัมน์ด้านซ้ายโดยไม่วาดรายละเอียดใหม่ (ไม่เสียโฟกัส) */
function refreshColList() {
  const list = editor.querySelector('.colx-list');
  if (list) render(list, columnsList());
}

editor.addEventListener('input', (e) => {
  const t = e.target;
  // หัวกลุ่ม 2 ช่อง → "ชั้นบน > ชั้นย่อย"
  if (t.dataset.grp !== undefined) {
    const [top, sub] = editor.querySelectorAll('[data-grp]');
    sub.disabled = !top.value.trim();
    draft.columns[selCol].group = [top.value.trim(), top.value.trim() ? sub.value.trim() : ''].filter(Boolean).join(' > ');
    refreshColList();
    afterEdit();
    return;
  }
  const k = t.dataset?.k;
  if (!k || t.tagName === 'SELECT') return;
  setValue(k, NUMERIC.test(k) ? Number(t.value) || 0 : t.value);
  if (t.matches('[data-var]')) refreshOut(k);
  if (/^columns:\d+:(header|width|text)$/.test(k)) {
    refreshColList();
    if (k.endsWith(':width')) $('#width-out').textContent = t.value;
    if (k.endsWith(':text')) $('#col-example span').textContent = columnExample(draft.columns[selCol]);
  }
  if (k === 'name' || k === 'shortName') {
    render($('#ed-title'), headTitle());
    $('#ed-sub').textContent = draft.name || 'กรอกชื่อบริษัทประกันในแท็บ “ข้อมูลทั่วไป”';
    refreshAllOuts();
  }
  if (k.startsWith('signer.') || k.startsWith('co:')) refreshAllOuts();
  // พิมพ์ "{" → เปิดเมนูแทรกข้อมูล · เมนูเปิดอยู่ → กรองตามที่พิมพ์ต่อ
  if (t.matches('[data-var]')) {
    if (e.data === '{') openMenu(t, { fromBrace: true });
    else if (menu?.fromBrace && menu.field === t) {
      const typed = t.value.slice(menu.start, t.selectionStart ?? t.value.length);
      if (!typed.startsWith('{') || /[\s}]/.test(typed)) closeMenu();
      else {
        menu.query = typed.slice(1);
        menu.active = 0;
        drawMenu();
      }
    }
  }
  afterEdit({ list: k === 'name' || k === 'shortName' });
});

editor.addEventListener('focusout', (e) => {
  const f = e.target;
  if (f.matches?.('[data-var]')) {
    f.dataset.caret = String(f.selectionStart ?? f.value.length);
    f.dataset.caretEnd = String(f.selectionEnd ?? f.value.length);
  }
});

editor.addEventListener('keydown', (e) => {
  if (menu?.fromBrace && e.target === menu.field && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) menuKeys(e);
  // รายการคอลัมน์: ลูกศรขึ้น/ลง เลือก · Alt+ลูกศร ย้าย
  const li = e.target.closest?.('.colx-item');
  if (li && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const d = e.key === 'ArrowDown' ? 1 : -1;
    if (e.altKey) moveColumn(selCol, selCol + d);
    else selectColumn(selCol + d);
    editor.querySelector('.colx-item.active')?.focus();
  }
});

editor.addEventListener('change', (e) => {
  const t = e.target;
  const k = t.dataset?.k;
  if (!k || t.tagName !== 'SELECT') return;
  setValue(k, NUMERIC.test(k) ? Number(t.value) : t.value);
  if (k === 'dateFormat') {
    $('#date-example').textContent = formatFormDate(cycle, draft.dateFormat, draft.dateEra);
    refreshAllOuts();
  }
  if (/^columns:\d+:source$/.test(k)) {
    // ใส่หัวคอลัมน์ให้ถ้ายังว่าง แล้ววาดรายละเอียดใหม่ (ช่องข้อความคงที่ / ตัวอย่างค่า)
    const c = draft.columns[selCol];
    if (!c.header.trim()) c.header = COLUMN_SOURCES[t.value].label;
    drawPane();
  }
  afterEdit();
});

/** เปลี่ยนแท็บแล้วกลับไปต้นเนื้อหา (ถ้าเลื่อนลงไปแล้ว แถบแท็บติดบนอยู่) */
function scrollToPane() {
  const steps = $('#steps');
  const pane = $('#pane');
  if (pane.getBoundingClientRect().top < steps.getBoundingClientRect().bottom) steps.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
on(editor, 'click', '[data-tab]', (_e, b) => {
  tab = b.dataset.tab;
  setParams({ tab: tab === 'general' ? '' : tab });
  drawPane();
  scrollToPane();
});
on(editor, 'click', '[data-var-open]', (_e, b) => {
  const field = document.getElementById(b.dataset.varOpen);
  if (menu?.field === field && !menu.fromBrace) return closeMenu();
  openMenu(field);
});
on(editor, 'click', '[data-switch]', (_e, b) => {
  const k = b.dataset.switch;
  draft[k] = !draft[k];
  drawPane();
  afterEdit({ list: k === 'active', steps: true });
});
on(editor, 'click', '[data-set]', (_e, b) => {
  draft[b.dataset.set] = b.dataset.value;
  drawPane();
  afterEdit();
});
on(editor, 'click', '[data-co-toggle]', (_e, b) => {
  const code = b.dataset.coToggle;
  if (draft.companies.some((c) => c.companyCode === code)) {
    coCache.set(code, draft.companies.find((c) => c.companyCode === code));
    draft.companies = draft.companies.filter((c) => c.companyCode !== code);
  } else {
    draft.companies.push(coCache.get(code) ?? { companyCode: code, policyNo: '', holderName: '', plan: '1' });
    draft.companies.sort((a, c) => a.companyCode.localeCompare(c.companyCode));
  }
  drawPane();
  afterEdit({ list: true });
});

// คอลัมน์: เลือก / เพิ่ม / ย้าย / ลบ / ลากวาง
function selectColumn(i, { focus = false } = {}) {
  selCol = Math.max(0, Math.min(i, draft.columns.length - 1));
  if (tab !== 'columns') {
    tab = 'columns';
    setParams({ tab });
    drawPane();
  } else {
    refreshColList();
    render($('#col-detail'), columnDetail());
    enhanceSelects($('#col-detail'));
    const add = editor.querySelector('[data-col-add]');
    if (add) add.lastChild.textContent = ` เพิ่มคอลัมน์ (ต่อจาก ${colLetter(selCol)})`;
  }
  drawPreview();
  editor.querySelector('.colx-item.active')?.scrollIntoView({ block: 'nearest' });
  if (focus) {
    $('#pane').scrollIntoView({ block: 'start', behavior: 'smooth' });
    $('#c-header')?.focus({ preventScroll: true });
  }
}
function moveColumn(from, to) {
  const cols = draft.columns;
  if (to < 0 || to >= cols.length || from === to) return;
  const [c] = cols.splice(from, 1);
  cols.splice(to, 0, c);
  selCol = to;
  drawPane();
  afterEdit();
}
on(editor, 'click', '.colx-item', (_e, li) => selectColumn(Number(li.dataset.col)));
on(editor, 'click', '[data-col-move]', (_e, b) => moveColumn(selCol, selCol + Number(b.dataset.colMove)));
on(editor, 'click', '[data-col-add]', () => {
  const at = draft.columns.length ? selCol + 1 : 0;
  draft.columns.splice(at, 0, { source: 'blank', header: '', group: '', width: 12, only: '' });
  selCol = at;
  drawPane();
  $('#c-header')?.focus();
  afterEdit({ steps: true });
});
on(editor, 'click', '[data-col-del]', () => {
  draft.columns.splice(selCol, 1);
  selCol = Math.max(0, Math.min(selCol, draft.columns.length - 1));
  drawPane();
  afterEdit({ steps: true });
});
on(editor, 'click', '[data-col-only]', (_e, b) => {
  draft.columns[selCol].only = b.dataset.colOnly;
  render($('#col-detail'), columnDetail());
  enhanceSelects($('#col-detail'));
  refreshColList();
  afterEdit();
});
let dragFrom = null;
editor.addEventListener('dragstart', (e) => {
  const li = e.target.closest?.('.colx-item');
  if (!li) return;
  dragFrom = Number(li.dataset.col);
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragFrom));
});
editor.addEventListener('dragover', (e) => {
  const li = e.target.closest?.('.colx-item');
  if (dragFrom === null || !li) return;
  e.preventDefault();
  editor.querySelectorAll('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  const r = li.getBoundingClientRect();
  li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
});
editor.addEventListener('drop', (e) => {
  const li = e.target.closest?.('.colx-item');
  if (dragFrom === null || !li) return;
  e.preventDefault();
  let to = Number(li.dataset.col) + (li.classList.contains('drop-after') ? 1 : 0);
  if (to > dragFrom) to--;
  const from = dragFrom;
  dragFrom = null;
  moveColumn(from, to);
});
editor.addEventListener('dragend', () => {
  dragFrom = null;
  editor.querySelectorAll('.dragging, .drop-before, .drop-after').forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after'));
});

// หัว/ท้ายเอกสาร
on(editor, 'click', '[data-line-set]', (_e, b) => {
  const l = draft.headerLines[Number(b.dataset.lineSet)];
  if (b.dataset.prop === 'bold') l.bold = !l.bold;
  else l.align = b.dataset.value;
  drawPane();
  afterEdit();
});
on(editor, 'click', '[data-line-move]', (_e, b) => {
  const i = Number(b.dataset.lineMove);
  const j = i + Number(b.dataset.dir);
  const ls = draft.headerLines;
  [ls[i], ls[j]] = [ls[j], ls[i]];
  drawPane();
  afterEdit();
});
on(editor, 'click', '[data-line-del]', (_e, b) => {
  draft.headerLines.splice(Number(b.dataset.lineDel), 1);
  drawPane();
  afterEdit({ steps: true });
});
on(editor, 'click', '[data-foot-del]', (_e, b) => {
  draft.footerLines.splice(Number(b.dataset.footDel), 1);
  drawPane();
  afterEdit({ steps: true });
});
on(editor, 'click', '[data-line-add]', (_e, b) => {
  const which = b.dataset.lineAdd;
  if (which === 'headerLines') draft.headerLines.push({ text: '', align: 'left', bold: false, size: 11 });
  else draft.footerLines.push('');
  drawPane();
  const n = draft[which].length - 1;
  editor.querySelector(`[data-k="${which === 'headerLines' ? `headerLines:${n}:text` : `footerLines:${n}`}"]`)?.focus();
  afterEdit({ steps: true });
});

// ตัวอย่าง
on(editor, 'click', '[data-sheet]', (_e, b) => {
  previewSheet = Number(b.dataset.sheet);
  drawPreview();
});
on(editor, 'click', '.xl-preview [data-c]', (_e, td) => selectColumn(Number(td.dataset.c), { focus: true }));
on(editor, 'click', '#preview-toggle', (_e, b) => {
  previewOpen = !previewOpen;
  b.setAttribute('aria-expanded', String(previewOpen));
  $('#sec-preview').classList.toggle('closed', !previewOpen);
});
on(editor, 'click', '#sample', (_e, btn) =>
  busy(
    btn,
    async () => {
      const model = previewModel();
      downloadBlob(await sheetModelToXlsx(model), `ตัวอย่าง-${model.fileName}.xlsx`);
    },
    { label: 'กำลังสร้างไฟล์' },
  ).catch((err) => toast.error(errorMessage(err))),
);

// บันทึก / ยกเลิก / ทำสำเนา / ลบ
on(editor, 'click', '#revert', () => open(draft.id || null, { force: true, keepTab: true }));
on(editor, 'click', '#dup', () =>
  guard(() => start({ ...clone(draft), id: 0, name: `${draft.name} (สำเนา)`, shortName: `${draft.shortName} (สำเนา)`, active: false }, '')),
);
on(editor, 'click', '#del', () =>
  confirmAction({
    title: `ลบแบบฟอร์ม ${draft.shortName}?`,
    description: draft.active ? 'แบบฟอร์มนี้เปิดใช้อยู่ — บริษัทที่ผูกไว้จะไม่มีไฟล์ส่งออกจนกว่าจะผูกกับแบบฟอร์มอื่น' : '',
    body: 'ประวัติการส่งออกเดิมยังอยู่ครบ (เก็บชื่อบริษัทประกันไว้ในประวัติ)',
    confirmLabel: 'ลบแบบฟอร์ม',
    successMessage: `ลบแบบฟอร์ม ${draft.shortName} แล้ว`,
    action: async () => {
      await api.deleteInsurer(draft.id);
      draft = null;
      original = '';
      await loadForms();
      open(forms[0]?.id ?? null, { force: true });
    },
  }),
);

editor.addEventListener('submit', async (e) => {
  e.preventDefault();
  closeMenu();
  errors = validateInsurerForm(draft, forms);
  if (Object.keys(errors).length) {
    tab = TAB_OF_ERROR[Object.keys(errors)[0]] ?? tab; // ไปแท็บแรกที่มีปัญหา
    setParams({ tab: tab === 'general' ? '' : tab });
    drawPane();
    toast.error(Object.values(errors)[0]);
    editor.querySelector('#pane [aria-invalid="true"], #pane .alert')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  try {
    const saved = await busy($('#save'), () => api.saveInsurer(draft), { label: 'กำลังบันทึก' });
    toast.success(`บันทึกแบบฟอร์ม ${saved.shortName} แล้ว`);
    await loadForms();
    open(saved.id, { force: true, keepTab: true });
  } catch (err) {
    errors = err.details ?? {};
    toast.error(errorMessage(err));
    drawPane();
  }
});

// ---------- เปิด / สลับแบบฟอร์ม ----------
/** มีการแก้ไขค้าง → ถามก่อนทิ้ง */
function guard(fn) {
  if (!dirty()) return fn();
  confirmAction({
    title: 'ทิ้งการแก้ไขที่ยังไม่บันทึก?',
    body: `แบบฟอร์ม “${draft.shortName || 'ใหม่'}” มีการแก้ไขที่ยังไม่ได้บันทึก`,
    confirmLabel: 'ทิ้งการแก้ไข',
    action: async () => fn(),
  });
}

function start(f, orig, { keepTab = false } = {}) {
  draft = f;
  original = orig;
  errors = {};
  selCol = 0;
  if (!keepTab) tab = 'general';
  coCache.clear();
  previewSheet = f.summarySheet ? 1 : 0;
  setParams({ id: f.id || 'new', tab: tab === 'general' ? '' : tab });
  drawList();
  drawEditor();
}

function open(id, { force = false, keepTab = false } = {}) {
  const go = () => {
    const f = forms.find((x) => x.id === id);
    if (!f) {
      draft = null;
      setParams({ id: '', tab: '' });
      drawList();
      drawEditor();
      return;
    }
    start(clone(f), JSON.stringify(f), { keepTab });
  };
  force ? go() : guard(go);
}

on($('#list'), 'click', '[data-open]', (_e, b) => open(Number(b.dataset.open)));
$('#add').onclick = () => guard(() => start(blankInsurerForm(), ''));
window.addEventListener('beforeunload', (e) => {
  if (dirty()) e.preventDefault();
});

async function loadForms() {
  forms = await api.listInsurers();
}

render(editor, html`<div class="card">${loader({ text: 'กำลังโหลดแบบฟอร์ม', logo: true })}</div>`);
try {
  await loadForms();
  const want = getParam('id');
  if (want === 'new') start(blankInsurerForm(), '', { keepTab: true });
  else {
    const f = forms.find((x) => x.id === Number(want)) ?? forms[0];
    if (f) start(clone(f), JSON.stringify(f), { keepTab: true });
    else open(null, { force: true });
  }
} catch (e) {
  render($('#page'), errorState(e));
}
