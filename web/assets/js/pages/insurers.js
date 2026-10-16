// หน้า: แบบฟอร์มประกัน (insurers.html)
//
//   ภาพรวม (ไม่มี ?id)     ① บริษัทประกัน + ไฟล์แบบฟอร์ม Excel   ② ผูกบริษัทในเครือ ↔ บริษัทประกัน (บันทึกทีเดียวทั้งตาราง)
//   แก้แบบฟอร์ม (?id=)    ขั้น 1 ไฟล์ Excel ของบริษัทประกัน (อัปโหลด .xlsx/.xls) → ขั้น 2 จุดที่ระบบเติมข้อมูล (ระบบหาให้ แก้ได้บนไฟล์)
//                          → ขั้น 3 ทดลองเติมข้อมูล (ตั้งค่า + ดาวน์โหลดไฟล์ทดลองไปเปิดใน Excel)
//   ระบบไม่สร้างแบบฟอร์มใหม่ — ตอนส่งออกเปิดไฟล์ที่อัปโหลดแล้วเติมรายชื่อลงไป (app/xlsxDirect.js)
//
// ไฟล์ที่อัปโหลดอยู่ในเบราว์เซอร์จนกด "บันทึก" — ตอนบันทึกจะล้างรายชื่อพนักงานในไฟล์ (ข้อมูลบุคคล) ก่อนเก็บ (app/excelTemplate.js)
import { api } from '../app/api.js';
import { getSession } from '../app/auth.js';
import { analyzeTemplate, exportFileName, fillTemplate, gridsOf, readTemplateFile, sanitizedLayout, sanitizeTemplate, templateBuffer } from '../app/excelTemplate.js';
import { initPage } from '../app/shell.js';
import { blankInsurerForm, validateInsurerForm } from '../application/insurerFormRules.js';
import { cellValue, formatFormDate, thaiMonthYear } from '../application/usecases/insurerExport.js';
import { detectLayout } from '../application/usecases/templateDetect.js';
import { addDays, nextCycleDate, todayISO } from '../domain/date.js';
import { COLUMN_SOURCES, DATE_FORMATS, PLACEHOLDERS, SUMMARY_SOURCES, VAR_SHORT } from '../domain/insurerForm.js';
import { COMPANY_CODES } from '../domain/labels.js';
import { thaiIdCheckDigit } from '../domain/thaiId.js';
import { $, esc, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { XLSX_MIME, bufferToBase64, downloadBlob } from '../shared/excel.js';
import { thaiDateTime } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { alertBox, badge, emptyState, errorState } from '../ui/components.js';
import { enhanceSelects } from '../ui/combobox.js';
import { busy, loader } from '../ui/loading.js';
import { confirmAction, errorMessage, toast } from '../ui/overlay.js';
import { colLetter, sheetPreviewHtml } from '../ui/sheetPreview.js';

initPage('insurers', { tour: () => (getParam('id') ? 'insurer-edit' : 'insurers') });

const today = todayISO();
const cycle = nextCycleDate(today);
const view = $('#view');
const page = $('#page');
const CODES = [...COMPANY_CODES].sort(); // ลำดับชีต/ตาราง = ตามตัวอักษร (เหมือนไฟล์ของ HR)
const STEPS = [
  { id: 'file', label: 'ไฟล์ Excel ของบริษัทประกัน', hint: 'อัปโหลดไฟล์ที่ใช้ส่งจริง' },
  { id: 'layout', label: 'จุดที่ระบบเติมข้อมูล', hint: 'คอลัมน์ / ช่องที่จะเติม' },
  { id: 'export', label: 'ทดลองเติมข้อมูล', hint: 'ตั้งค่า · เปิดไฟล์ใน Excel' },
];
/** ตัวแปรที่แทรกได้ จัดหมวด (ปุ่มแทรกข้อมูล) */
const VAR_GROUPS = [
  { label: 'บริษัทในเครือ', tokens: ['{companyName}', '{companyCode}', '{policyNo}'] },
  { label: 'รอบ / วันที่', tokens: ['{month}', '{cycleDate}', '{exportDate}'] },
  { label: 'จำนวน', tokens: ['{in}', '{out}', '{total}'] },
  { label: 'ผู้แจ้ง', tokens: ['{signerName}', '{signerDept}', '{signerPhone}'] },
  { label: 'บริษัทประกัน', tokens: ['{insurer}'] },
];

// ---------- สถานะของหน้า ----------
let forms = [];
let companies = [];
let bindings = []; // [{companyCode, insurerId, policyNo, holderName, plan}]
let bindingsOrig = '';
let draft = null; // แบบฟอร์มที่กำลังแก้
let original = '';
let errors = {};
let step = 'file';
/** ไฟล์ที่แสดงในขั้นตำแหน่งข้อมูล: { buffer, converted, sheets:[{name, grid}], fromUpload, fileName } */
let src = null;
let previewOf = 'company'; // 'company' | 'summary'
let sel = {}; // { col } | { addr }
let testResult = null; // { buffer, sheets, active }

/** ข้อมูลที่ปกติกรอกเฉพาะแถวเข้าใหม่ */
const IN_ONLY = ['title', 'gender', 'birthDate', 'nationalId', 'position', 'phone', 'email', 'salary', 'plan'];

const clone = (x) => structuredClone(x);
const dirty = () => !!draft && (JSON.stringify(draft) !== original || !!src?.fromUpload);
const bindingsDirty = () => JSON.stringify(bindings) !== bindingsOrig;
const sheetOf = (name) => src?.sheets.find((s) => s.name === name)?.grid ?? null;
const currentLayout = () => (previewOf === 'summary' ? draft.template?.summary : draft.template);
const legalName = (code) => companies.find((c) => c.code === code)?.legalName ?? code;

// ---------- ข้อมูลสมมติ (ผลลัพธ์ตัวแปร / ตัวอย่างคอลัมน์ / ทดลองสร้างไฟล์) ----------
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
function sampleCompanies() {
  const cos = draft.companies.length ? draft.companies : [{ companyCode: 'HL', policyNo: 'ตัวอย่าง-001', holderName: 'บริษัท แฮปปี้แลนด์ จำกัด', plan: '1' }];
  return cos.map((c, ci) => ({
    ...c,
    companyName: c.holderName || legalName(c.companyCode),
    legalName: legalName(c.companyCode),
    in: ci === 0 ? [sampleRow(1, c.companyCode), sampleRow(2, c.companyCode)] : [],
    out: ci === 0 ? [sampleRow(3, c.companyCode)] : [],
  }));
}
function sampleVars() {
  const c = sampleCompanies()[0];
  const d = (iso) => formatFormDate(iso, draft.dateFormat, draft.dateEra);
  return {
    insurer: draft.name || 'บริษัทประกัน',
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
}

/** ข้อความที่มีตัวแปร → HTML: ตัวแปรเป็นป้าย (โหมด token) หรือค่าตัวอย่างไฮไลต์ (โหมด value) */
function richText(text, mode = 'token', vars = sampleVars()) {
  return String(text ?? '').replace(/\{(\w+)\}|([^{]+|\{)/g, (m, name, plain) => {
    if (plain !== undefined) return esc(plain).replace(/\n/g, '<br>');
    if (!(m in PLACEHOLDERS)) return `<mark class="bad">${esc(m)}</mark>`;
    if (mode === 'token') return `<span class="tk">${esc(VAR_SHORT[m] ?? m)}</span>`;
    const v = String(vars[name] ?? '');
    return v ? `<mark>${esc(v)}</mark>` : `<mark class="empty" title="${esc(PLACEHOLDERS[m])}">${esc(VAR_SHORT[m])} ว่าง</mark>`;
  });
}

/** แทรกตัวแปรที่ตำแหน่งเคอร์เซอร์ล่าสุดของช่อง (ยังไม่เคยคลิกช่อง = ต่อท้าย) */
function insertToken(field, token) {
  const focused = document.activeElement === field;
  const s = focused ? (field.selectionStart ?? field.value.length) : Number(field.dataset.caret ?? field.value.length);
  const e = focused ? (field.selectionEnd ?? s) : Number(field.dataset.caretEnd ?? s);
  field.value = field.value.slice(0, s) + token + field.value.slice(e);
  field.focus();
  field.setSelectionRange(s + token.length, s + token.length);
  field.dataset.caret = field.dataset.caretEnd = String(s + token.length);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
document.addEventListener('focusout', (e) => {
  const f = e.target;
  if (f.matches?.('input.input, textarea.input')) {
    f.dataset.caret = String(f.selectionStart ?? f.value.length);
    f.dataset.caretEnd = String(f.selectionEnd ?? f.value.length);
  }
});

/** ปุ่มแทรกข้อมูล (มองเห็นทั้งหมด ไม่ต้องเปิดเมนู) — คลิกแล้วแทรกที่เคอร์เซอร์ของช่อง targetId */
function varChips(targetId, groups = VAR_GROUPS) {
  const vars = sampleVars();
  return html`<div class="vchips" role="group" aria-label="แทรกข้อมูลอัตโนมัติ">
    ${groups.map(
      (g) => html`<div class="vchip-group">
        <span class="vchip-label">${g.label}</span>
        ${g.tokens.map((t) => {
          const ex = String(vars[t.slice(1, -1)] ?? '');
          return html`<button type="button" class="vchip" data-insert="${t}" data-target="${targetId}" title="${PLACEHOLDERS[t]}${ex ? ` — เช่น ${ex}` : ''}">+ ${VAR_SHORT[t]}</button>`;
        })}
      </div>`,
    )}
  </div>`;
}

// ===================================================================
// ภาพรวม
// ===================================================================
function insurerCard(f) {
  const t = f.template;
  const nCols = t?.columns?.filter((c) => c.source !== 'blank').length ?? 0;
  const nCells = Object.keys(t?.cells ?? {}).length + Object.keys(t?.summary?.cells ?? {}).length;
  return html`<article class="ic">
    <header class="ic-head">
      <span class="ic-icon">${raw(icon('shield-plus'))}</span>
      <div class="grow">
        <h3>${f.shortName}</h3>
        <p class="muted">${f.name}</p>
      </div>
      ${f.active ? badge('เปิดใช้', 'success') : badge('ปิดอยู่', 'neutral')}
    </header>
    ${t
      ? html`<div class="ic-file">
          <span class="ic-xl">${raw(icon('file-spreadsheet'))}</span>
          <div class="grow">
            <b class="truncate" title="${t.fileName}">${t.fileName}</b>
            <span class="muted small">ชีต ${t.sheet}${t.summary ? ` + ${t.summary.sheet}` : ''} · ${nCols} คอลัมน์ข้อมูล · ${nCells} ช่องเติมอัตโนมัติ</span>
            <span class="muted small">${t.uploadedAt ? `อัปโหลด ${thaiDateTime(t.uploadedAt)} · ${t.uploadedBy}` : t.uploadedBy}</span>
          </div>
        </div>`
      : html`<a class="ic-nofile" href="insurers.html?id=${f.id}">${raw(icon('download'))}<span><b>ยังไม่มีไฟล์แบบฟอร์ม</b><small>อัปโหลดไฟล์ Excel ของบริษัทประกันนี้</small></span></a>`}
    <div class="ic-cos">
      <span class="muted small">บริษัทที่ส่งแจ้ง</span>
      ${f.companies.length ? f.companies.map((c) => html`<span class="co-chip">${c.companyCode}</span>`) : html`<span class="muted small">— ยังไม่ผูก (ผูกที่ตารางด้านล่าง)</span>`}
    </div>
    <footer class="ic-actions">
      <a class="btn btn-sm btn-primary" href="insurers.html?id=${f.id}">${raw(icon('pencil'))} แก้ไขแบบฟอร์ม</a>
      ${t ? html`<button type="button" class="btn btn-sm" data-dl-template="${f.id}">${raw(icon('download'))} ดาวน์โหลดไฟล์ Excel</button>` : ''}
    </footer>
  </article>`;
}

function bindingRow(b) {
  const f = forms.find((x) => x.id === b.insurerId);
  const warn = !f ? '' : !f.template ? 'ยังไม่มีไฟล์แบบฟอร์ม — ส่งออก Excel ไม่ได้' : !f.active ? 'แบบฟอร์มปิดอยู่ — ไม่อยู่ในหน้าส่งออก' : '';
  return html`<div class="bt-row${b.insurerId ? '' : ' off'}" role="row">
    <span class="bt-co" role="cell"><b>${b.companyCode}</b><small class="truncate">${legalName(b.companyCode)}</small></span>
    <span role="cell">
      <select data-bind-insurer="${b.companyCode}" data-combobox aria-label="บริษัทประกันของ ${b.companyCode}">
        <option value="">— ไม่ส่งแจ้ง —</option>
        ${forms.map((x) => html`<option value="${x.id}" ${x.id === b.insurerId ? 'selected' : ''}>${x.shortName}${x.active ? '' : ' (ปิดอยู่)'}</option>`)}
      </select>
      ${warn ? html`<small class="bt-warn">${raw(icon('alert-triangle'))} ${warn}</small>` : ''}
    </span>
    <span role="cell"><input class="input" data-bind="${b.companyCode}:policyNo" value="${b.policyNo}" placeholder="เช่น จี3-8001" ${b.insurerId ? '' : 'disabled'} aria-label="เลขที่กรมธรรม์ ${b.companyCode}" /></span>
    <span role="cell"><input class="input" data-bind="${b.companyCode}:holderName" value="${b.holderName}" placeholder="${legalName(b.companyCode)}" ${b.insurerId ? '' : 'disabled'} aria-label="ชื่อผู้ถือกรมธรรม์ ${b.companyCode}" /></span>
    <span role="cell"><input class="input" data-bind="${b.companyCode}:plan" value="${b.plan}" placeholder="1" ${b.insurerId ? '' : 'disabled'} aria-label="แผนประกัน ${b.companyCode}" /></span>
  </div>`;
}

function drawOverview() {
  page.classList.remove('editing');
  render($('#head-actions'), html`<a class="btn btn-primary" href="insurers.html?id=new">${raw(icon('plus'))} เพิ่มบริษัทประกัน</a>`);
  render(
    view,
    html`<section class="ov">
        <header class="ov-head">
          <span class="ov-no">1</span>
          <div>
            <h2>ไฟล์ Excel ของบริษัทประกัน</h2>
            <p>ไฟล์ Excel ที่บริษัทประกันให้กรอก — ระบบเติมรายชื่อลงไฟล์นี้ตอนส่งออก โดยคงหน้าตาเดิมทุกอย่าง</p>
          </div>
        </header>
        <div class="ic-grid">
          ${forms.map(insurerCard)}
          <a class="ic-add" href="insurers.html?id=new">${raw(icon('plus'))}<b>เพิ่มบริษัทประกัน</b><small>อัปโหลดไฟล์แบบฟอร์มของบริษัทใหม่</small></a>
        </div>
      </section>

      <section class="ov card" id="bindings">
        <header class="ov-head">
          <span class="ov-no">2</span>
          <div>
            <h2>บริษัทในเครือส่งแจ้งกับบริษัทประกันไหน</h2>
            <p>1 บริษัทในเครือ = 1 บริษัทประกัน · เลขกรมธรรม์และชื่อผู้ถือกรมธรรม์ใช้เติมในหัวเอกสารของชีตบริษัทนั้น</p>
          </div>
        </header>
        <div class="bt" role="table" aria-label="ผูกบริษัทในเครือกับบริษัทประกัน">
          <div class="bt-row bt-head" role="row"><span>บริษัทในเครือ</span><span>ส่งแจ้งกับ</span><span>เลขที่กรมธรรม์</span><span>ชื่อผู้ถือกรมธรรม์</span><span>แผน</span></div>
          ${bindings.map(bindingRow)}
        </div>
        <footer class="bt-foot">
          <span class="dirty-note" id="bind-dirty"></span>
          <button type="button" class="btn btn-ghost" id="bind-reset" disabled>ยกเลิก</button>
          <button type="button" class="btn btn-primary" id="bind-save" disabled>${raw(icon('save'))} บันทึกการผูกบริษัท</button>
        </footer>
      </section>`,
  );
  enhanceSelects(view);
  refreshBindFoot();
}

function refreshBindFoot() {
  const d = bindingsDirty();
  $('#bind-save').disabled = !d;
  $('#bind-reset').disabled = !d;
  render($('#bind-dirty'), d ? html`<span class="dot"></span> ยังไม่ได้บันทึก` : '');
}

function loadBindings() {
  bindings = CODES.map((code) => {
    const f = forms.find((x) => x.companies.some((c) => c.companyCode === code));
    const c = f?.companies.find((x) => x.companyCode === code);
    return { companyCode: code, insurerId: f?.id ?? null, policyNo: c?.policyNo ?? '', holderName: c?.holderName ?? '', plan: c?.plan ?? '1' };
  });
  bindingsOrig = JSON.stringify(bindings);
}

view.addEventListener('change', (e) => {
  const code = e.target.dataset?.bindInsurer;
  if (!code) return;
  const b = bindings.find((x) => x.companyCode === code);
  b.insurerId = Number(e.target.value) || null;
  if (b.insurerId && !b.holderName) b.holderName = legalName(code).replace(/^บ\./, 'บริษัท ');
  const row = e.target.closest('.bt-row');
  const tmp = document.createElement('div');
  tmp.innerHTML = String(bindingRow(b));
  row.replaceWith(tmp.firstElementChild);
  enhanceSelects(view.querySelector(`[data-bind-insurer="${code}"]`).closest('.bt-row'));
  refreshBindFoot();
});
view.addEventListener('input', (e) => {
  const k = e.target.dataset?.bind;
  if (!k) return;
  const [code, field] = k.split(':');
  bindings.find((x) => x.companyCode === code)[field] = e.target.value;
  refreshBindFoot();
});
on(view, 'click', '#bind-reset', () => {
  bindings = JSON.parse(bindingsOrig);
  drawOverview();
});
on(view, 'click', '#bind-save', (_e, btn) =>
  busy(btn, async () => {
    forms = await api.saveInsurerBindings(bindings);
    loadBindings();
    toast.success('บันทึกการผูกบริษัทกับบริษัทประกันแล้ว');
    drawOverview();
  }, { label: 'กำลังบันทึก' }).catch((err) => toast.error(errorMessage(err))),
);
on(view, 'click', '[data-dl-template]', (_e, btn) => {
  const f = forms.find((x) => x.id === Number(btn.dataset.dlTemplate));
  busy(btn, async () => downloadBlob(new Blob([await templateBuffer(f.template)], { type: XLSX_MIME }), f.template.fileName.replace(/\.xlsx?$/i, '') + '.xlsx')).catch((err) => toast.error(errorMessage(err)));
});

// ===================================================================
// แก้แบบฟอร์ม
// ===================================================================
function stepState(id) {
  const t = draft.template;
  if (id === 'file') return t ? 'done' : '';
  if (id === 'layout') return errors.template ? 'error' : t ? 'done' : 'locked';
  return errors.name || errors.shortName ? 'error' : t ? '' : 'locked';
}

function drawEditor() {
  page.classList.add('editing');
  render(
    $('#head-actions'),
    draft.id ? html`<button type="button" class="btn danger-text" id="del">${raw(icon('trash-2'))} ลบบริษัทประกันนี้</button>` : '',
  );
  render(
    view,
    html`<a class="back-link" href="insurers.html" id="back">${raw(icon('chevron-left'))} แบบฟอร์มของบริษัทประกันทั้งหมด</a>
      <form id="ed" novalidate>
        <section class="card ed">
          <div class="ed-top">
          <header class="ed-head">
            <span class="ic-icon">${raw(icon('shield-plus'))}</span>
            <div class="grow">
              <h2 id="ed-title">${draft.shortName || draft.name || 'บริษัทประกันใหม่'} ${draft.id ? '' : badge('ยังไม่บันทึก', 'warning')}</h2>
              <p class="muted">${draft.template ? html`${raw(icon('file-spreadsheet'))} ${draft.template.fileName}${src?.fromUpload ? ' (ไฟล์ใหม่ — ยังไม่บันทึก)' : ''}` : 'ยังไม่มีไฟล์แบบฟอร์ม'}</p>
            </div>
            ${draft.active ? badge('เปิดใช้', 'success') : badge('ปิดอยู่', 'neutral')}
          </header>
          <nav class="ed-steps" role="tablist" aria-label="ขั้นตอน">
            ${STEPS.map((s, i) => {
              const st = stepState(s.id);
              return html`<button type="button" class="ed-step ${s.id === step ? 'active' : ''} ${st}" role="tab" aria-selected="${s.id === step}" data-step="${s.id}" ${st === 'locked' ? 'disabled' : ''}>
                <span class="ed-step-no">${st === 'done' && s.id !== step ? raw(icon('check')) : i + 1}</span>
                <span class="ed-step-text"><b>${s.label}</b><small>${st === 'locked' ? 'อัปโหลดไฟล์ก่อน' : st === 'error' ? 'มีข้อมูลต้องแก้' : s.hint}</small></span>
              </button>`;
            })}
          </nav>
          </div>
          <div class="ed-pane" id="pane"></div>
        </section>
        <div class="form-footer">
          <span class="dirty-note" id="dirty-note"></span>
          <a class="btn btn-ghost" href="insurers.html">ยกเลิก</a>
          <button type="submit" class="btn btn-primary" id="save" data-label="บันทึก">${raw(icon('save'))} บันทึก</button>
        </div>
      </form>`,
  );
  drawPane();
}

function refreshDirty() {
  render($('#dirty-note'), dirty() ? html`<span class="dot"></span> มีการแก้ไขที่ยังไม่บันทึก` : '');
}

async function drawPane() {
  const pane = $('#pane');
  if (step === 'file') render(pane, filePane());
  else if (step === 'layout') {
    if (!src) {
      render(pane, loader({ text: 'กำลังเปิดไฟล์แบบฟอร์ม', logo: true }));
      try {
        const buffer = await templateBuffer(draft.template);
        src = { buffer, converted: false, sheets: await gridsOf(buffer), fromUpload: false, fileName: draft.template.fileName };
      } catch (e) {
        render(pane, errorState(e));
        return;
      }
    }
    render(pane, layoutPane());
  } else render(pane, exportPane());
  enhanceSelects(pane);
  refreshDirty();
}

/** ช่องเครื่องหมายเข้าใหม่/ลาออก + ปุ่มเลือกเร็ว (พิมพ์ ✓ เองยาก) */
const MARKS = ['✓', '✗', 'X', 'P'];
function markField(id, key, label) {
  return html`<div class="field">
    <label for="${id}">${label}</label>
    <div class="mark-row">
      <input class="input mark-input" id="${id}" data-k="${key}" value="${draft[key]}" maxlength="5" />
      <div class="mark-picks" role="group" aria-label="เลือกเครื่องหมาย">
        ${MARKS.map((m) => html`<button type="button" class="mark-pick${draft[key] === m ? ' on' : ''}" data-set="${key}" data-value="${m}" aria-pressed="${draft[key] === m ? 'true' : 'false'}" title="ใช้ ${m}">${m}</button>`)}
      </div>
    </div>
  </div>`;
}

/** แบบฟอร์มที่แปลงจาก .xls — หน้าตาไม่ครบ (บอกว่าหายอะไร + วิธีแก้) */
function xlsNotice() {
  const t = draft.template;
  if (!t?.converted) return '';
  const lost = t.lost ?? {};
  const items = [lost.pictures ? 'รูปภาพ/โลโก้' : '', lost.textboxes ? 'กล่องข้อความ' : '', lost.shapes ? 'เส้น/รูปทรง' : ''].filter(Boolean);
  return alertBox({
    tone: 'warning',
    title: 'ไฟล์ .xls (Excel 97-2003) — ไฟล์ที่ส่งออกจะไม่เหมือนต้นฉบับทุกอย่าง',
    body: html`ระบบคงข้อความ สีไฮไลต์ ความกว้างคอลัมน์ และใส่เส้นขอบตารางให้แล้ว แต่${items.length ? html`<b>${items.join(' · ')}</b> และ` : ''}รูปแบบตัวอักษรบางส่วนแปลงจากไฟล์ .xls ไม่ได้<br />
      <b>ต้องการให้เหมือนแบบฟอร์มทางการทุกอย่าง:</b> เปิดไฟล์ใน Excel → File › Save As → เลือก “Excel Workbook (*.xlsx)” แล้วอัปโหลดไฟล์ .xlsx แทน`,
  });
}

// ---------- ขั้น 1: ไฟล์แบบฟอร์ม ----------
function filePane() {
  const t = draft.template;
  return html`<div class="ed-body">
    <div class="form-grid g2">
      <div class="field">
        <label for="f-name">ชื่อบริษัทประกัน<span class="req">*</span></label>
        <input class="input" id="f-name" data-k="name" value="${draft.name}" placeholder="เช่น บริษัท ไทยประกันชีวิต จำกัด (มหาชน)" ${errors.name ? raw('aria-invalid="true"') : ''} />
        ${errors.name ? html`<span class="error">${errors.name}</span>` : ''}
      </div>
      <div class="field">
        <label for="f-short">ชื่อย่อ<span class="req">*</span></label>
        <input class="input" id="f-short" data-k="shortName" value="${draft.shortName}" placeholder="เช่น ไทยประกันชีวิต" ${errors.shortName ? raw('aria-invalid="true"') : ''} />
        ${errors.shortName ? html`<span class="error">${errors.shortName}</span>` : html`<span class="hint">แสดงในหน้าส่งออกและชื่อไฟล์</span>`}
      </div>
    </div>

    <label class="drop" id="drop" tabindex="0">
      <input type="file" id="file-input" accept=".xlsx,.xls,application/vnd.ms-excel,${XLSX_MIME}" hidden />
      <span class="drop-icon">${raw(icon('file-spreadsheet'))}</span>
      <b>${t ? 'เปลี่ยนไฟล์ Excel' : 'อัปโหลดไฟล์ Excel ที่ส่งบริษัทประกัน'}</b>
      <span>ลากไฟล์มาวางที่นี่ หรือ <u>คลิกเพื่อเลือกไฟล์</u> (.xlsx แนะนำ · .xls)</span>
      <small>ใช้ไฟล์ที่เคยส่งจริงได้เลย (มีรายชื่ออยู่ก็ได้) — ระบบหาให้ว่าควรเติมข้อมูลตรงไหน</small>
    </label>

    <ol class="how" aria-label="ระบบทำงานอย่างไร">
      <li><span class="how-no">1</span><b>ไฟล์ของบริษัทประกันตัวจริง</b><small>ระบบเก็บไฟล์นี้ไว้ (ล้างรายชื่อเดิมออก)</small></li>
      <li><span class="how-no">2</span><b>กำหนดจุดที่ระบบเติม</b><small>คอลัมน์ไหนเติมข้อมูลอะไร · ช่องเลขกรมธรรม์ / เดือน / ผู้แจ้ง</small></li>
      <li><span class="how-no">3</span><b>ส่งออก = เติมรายชื่อลงไฟล์นี้</b><small>ไม่สร้างแบบฟอร์มใหม่ — โลโก้ สี สูตร หน้ากระดาษ เหมือนเดิมทุกอย่าง</small></li>
    </ol>

    ${t
      ? html`<div class="file-card${src?.fromUpload ? ' new' : ''}">
          <span class="ic-xl">${raw(icon('file-spreadsheet'))}</span>
          <div class="grow">
            <b>${t.fileName}</b>
            <span class="muted small">${src?.fromUpload ? 'ไฟล์ใหม่ — ยังไม่บันทึก' : t.uploadedAt ? `อัปโหลด ${thaiDateTime(t.uploadedAt)} · ${t.uploadedBy}` : t.uploadedBy} · ชีต ${t.sheet}${t.summary ? ` + ${t.summary.sheet}` : ''}</span>
          </div>
          ${src?.fromUpload ? '' : html`<button type="button" class="btn btn-sm" id="dl-current">${raw(icon('download'))} ดาวน์โหลดไฟล์ที่เก็บไว้</button>`}
          <button type="button" class="btn btn-sm" data-goto="layout">จุดที่ระบบเติมข้อมูล ${raw(icon('chevron-right'))}</button>
        </div>`
      : ''}
    ${xlsNotice()}
    <p class="privacy">${raw(icon('lock'))} รายชื่อพนักงานที่อยู่ในไฟล์ (ข้อมูลบุคคล) จะถูกล้างออกก่อนเก็บ — เก็บไว้เฉพาะแบบฟอร์มเปล่า · ชีตอื่นที่ไม่ใช้ไม่ถูกเก็บ</p>
  </div>`;
}

async function handleFile(file) {
  if (!file) return;
  if (!/\.xlsx?$/i.test(file.name)) return toast.error('รองรับเฉพาะไฟล์ Excel (.xlsx หรือ .xls)');
  if (file.size > 10 * 1024 * 1024) return toast.error('ไฟล์ใหญ่เกิน 10MB');
  render($('#drop'), loader({ text: 'กำลังอ่านไฟล์และหาตำแหน่งข้อมูล', compact: true }));
  try {
    const r = await readTemplateFile(file);
    const a = analyzeTemplate(r.sheets);
    const layout = a.layout ?? { headerRow: 1, headerEnd: 1, dataRow: 2, footerRow: 3, columns: [], cells: {} };
    src = { ...r, fromUpload: true, fileName: file.name };
    draft.template = { fileName: file.name, converted: r.converted, lost: r.lost, uploadedAt: null, uploadedBy: '', sheet: a.sheet, ...layout, summary: a.summary };
    previewOf = 'company';
    sel = {};
    testResult = null;
    step = 'layout';
    const nCols = layout.columns.filter((c) => c.source !== 'blank').length;
    if (a.layout) toast.success(`อ่านไฟล์แล้ว — หัวตารางแถว ${layout.headerRow} · ${nCols} คอลัมน์ข้อมูล · ${Object.keys(layout.cells).length} ช่องเติมอัตโนมัติ`);
    else toast.error('ไม่พบหัวตารางในไฟล์ — กำหนดตำแหน่งเองในขั้นถัดไป');
    drawEditor();
  } catch (e) {
    toast.error(errorMessage(e));
    drawPane();
  }
}

view.addEventListener('dragover', (e) => {
  const d = e.target.closest?.('#drop');
  if (!d) return;
  e.preventDefault();
  d.classList.add('over');
});
view.addEventListener('dragleave', (e) => e.target.closest?.('#drop')?.classList.remove('over'));
view.addEventListener('drop', (e) => {
  const d = e.target.closest?.('#drop');
  if (!d) return;
  e.preventDefault();
  d.classList.remove('over');
  handleFile(e.dataTransfer.files[0]);
});
view.addEventListener('change', (e) => {
  if (e.target.id === 'file-input') handleFile(e.target.files[0]);
});
view.addEventListener('keydown', (e) => {
  if (e.target.id === 'drop' && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    $('#file-input').click();
  }
});

// ---------- ขั้น 2: ตำแหน่งข้อมูล ----------
function columnLabels(layout, kind) {
  const out = {};
  for (const c of layout?.columns ?? []) {
    const label = kind === 'summary' ? SUMMARY_SOURCES[c.source] : COLUMN_SOURCES[c.source]?.label;
    out[c.col] = { label: c.source === 'blank' ? '—' : (label ?? c.source).split(' — ')[0].replace(/\s*\(.*\)$/, ''), only: c.only, blank: c.source === 'blank' };
  }
  return out;
}

function layoutPane() {
  const t = draft.template;
  const kind = previewOf;
  const L = currentLayout();
  const grid = sheetOf(kind === 'summary' ? t.summary?.sheet : t.sheet);
  const sheetOpts = (value, none) => html`${none ? html`<option value="">— ไม่มีชีตสรุป —</option>` : ''}${src.sheets.map((s) => html`<option value="${s.name}" ${s.name === value ? 'selected' : ''}>${s.name}</option>`)}`;
  const cells = {};
  for (const [a, text] of Object.entries(L?.cells ?? {})) cells[a] = richText(text, 'token');
  const tabs = t.summary
    ? html`<div class="seg-lg lay-tabs" role="tablist">
        <button type="button" role="tab" class="${kind === 'company' ? 'on' : ''}" aria-selected="${kind === 'company'}" data-preview="company">ชีตบริษัท · ${t.sheet}</button>
        <button type="button" role="tab" class="${kind === 'summary' ? 'on' : ''}" aria-selected="${kind === 'summary'}" data-preview="summary">ชีตสรุป · ${t.summary.sheet}</button>
      </div>`
    : '';
  return html`<div class="ed-body lay">
    ${errors.template ? alertBox({ tone: 'danger', title: errors.template }) : ''}
    ${xlsNotice()}
    <div class="lay-sheets">
      <div class="field">
        <label for="pick-company">ชีตแบบฟอร์มของแต่ละบริษัท</label>
        <select id="pick-company" data-pick-sheet="company" data-combobox>${sheetOpts(t.sheet)}</select>
        <span class="hint">ส่งออกแล้วได้ 1 ชีตต่อ 1 บริษัทในเครือ</span>
      </div>
      <div class="field">
        <label for="pick-summary">ชีตสรุป</label>
        <select id="pick-summary" data-pick-sheet="summary" data-combobox>${sheetOpts(t.summary?.sheet, true)}</select>
        <span class="hint">จำนวนเข้า/ออกต่อบริษัท (ถ้าไฟล์มี)</span>
      </div>
      <button type="button" class="btn btn-sm" id="redetect" title="ให้ระบบหาจุดเติมข้อมูลจากไฟล์ใหม่ (ทับที่แก้ไว้)">${raw(icon('refresh-cw'))} ให้ระบบหาจุดเติมใหม่</button>
    </div>

    ${L && grid
      ? html`<div class="lay-bar">
            ${tabs}
            <div class="lay-rows" aria-label="ส่วนของแบบฟอร์ม">
              <span class="lay-lg head">หัวตาราง</span> แถว <input class="input num row-in" type="number" min="1" data-row="headerRow" value="${L.headerRow}" aria-label="หัวตารางเริ่มแถว" /> ถึง <input class="input num row-in" type="number" min="1" data-row="headerEnd" value="${L.headerEnd}" aria-label="หัวตารางถึงแถว" />
              <span class="lay-lg data">ข้อมูลพนักงาน</span> <input class="input num row-in" type="number" min="1" data-row="dataRow" value="${L.dataRow}" aria-label="แถวข้อมูลพนักงานเริ่มแถว" />
              <span class="lay-lg foot">ส่วนท้าย</span> <input class="input num row-in" type="number" min="1" data-row="footerRow" value="${L.footerRow}" aria-label="ส่วนท้ายเริ่มแถว" />
              <span class="lay-lg auto">เติมอัตโนมัติ</span>
            </div>
          </div>
          <div class="lay-main">
            <div class="lay-sheet">
              ${sheetPreviewHtml(grid, {
                layout: L,
                columns: columnLabels(L, kind),
                cells,
                selected: sel,
                interactive: true,
                sampleNote: src.fromUpload ? 'ข้อมูลตัวอย่างในไฟล์ จะถูกล้างตอนบันทึก' : '',
              })}
            </div>
            <aside class="lay-side" id="side">${sidePanel(L, kind, grid)}</aside>
          </div>`
      : html`${tabs}${emptyState({ iconName: 'file-spreadsheet', title: 'เลือกชีตด้านบน' })}`}
  </div>`;
}

function sidePanel(L, kind, grid) {
  if (sel.col) {
    const c = sel.col;
    const col = L.columns.find((x) => x.col === c);
    const header = col?.header ?? (grid.text(L.headerEnd, c) || grid.text(L.headerRow, c) || '');
    const sources = kind === 'summary' ? SUMMARY_SOURCES : Object.fromEntries(Object.entries(COLUMN_SOURCES).filter(([k]) => k !== 'text').map(([k, v]) => [k, v.label]));
    const source = col?.source ?? 'blank';
    let example = '';
    if (kind === 'company' && source !== 'blank') {
      const co = sampleCompanies()[0];
      const [a, b] = [1, 3].map((i, n) => String(cellValue({ ...col, source }, sampleRow(i, co.companyCode), n + 1, draft, co, cycle) ?? ''));
      example = a === b ? a || '(ว่าง)' : `เข้าใหม่: ${a || '(ว่าง)'} · ลาออก: ${b || '(ว่าง)'}`;
    }
    return html`<div class="side-card">
      <header><span class="side-tag">คอลัมน์ ${colLetter(c)}</span><button type="button" class="btn-icon sm" data-side-close aria-label="ปิด">${raw(icon('x'))}</button></header>
      <p class="side-orig" title="หัวคอลัมน์ในไฟล์">${col?.group ? html`<small>${col.group.replace(/ > /g, ' › ')} ›</small> ` : ''}${header || html`<i class="muted">(ไม่มีหัวคอลัมน์)</i>`}</p>
      <div class="field">
        <label for="col-source">ข้อมูลที่ระบบเติมในคอลัมน์นี้</label>
        <select id="col-source" data-col-source="${c}" data-combobox>${Object.entries(sources).map(([k, v]) => html`<option value="${k}" ${k === source ? 'selected' : ''}>${v}</option>`)}</select>
      </div>
      ${example ? html`<div class="example-line">${raw(icon('eye'))}<span>${example}</span></div>` : ''}
      ${kind === 'company' && source !== 'blank'
        ? html`<div class="field">
            <span class="label">เติมค่าในแถว</span>
            <div class="seg-lg" role="radiogroup">
              ${[
                ['', 'ทุกแถว'],
                ['IN', 'เฉพาะเข้าใหม่'],
                ['OUT', 'เฉพาะลาออก'],
              ].map(([v, l]) => html`<button type="button" role="radio" aria-checked="${(col?.only ?? '') === v}" class="${(col?.only ?? '') === v ? 'on' : ''}" data-col-only="${v}">${l}</button>`)}
            </div>
          </div>`
        : ''}
    </div>`;
  }
  if (sel.addr) {
    const a = sel.addr;
    const p = /^([A-Z]+)(\d+)$/.exec(a);
    const r = Number(p[2]);
    const c = [...p[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const orig = grid.text(r, c);
    const has = a in (L.cells ?? {});
    const value = L.cells?.[a] ?? '';
    return html`<div class="side-card">
      <header><span class="side-tag">เซลล์ ${a}</span><button type="button" class="btn-icon sm" data-side-close aria-label="ปิด">${raw(icon('x'))}</button></header>
      <div class="field">
        <span class="label">ข้อความเดิมในไฟล์</span>
        <p class="side-orig">${orig ? orig : html`<i class="muted">(ว่าง)</i>`}</p>
      </div>
      <div class="field">
        <label for="cell-text">ตอนส่งออก ใส่ในเซลล์นี้</label>
        <input class="input" id="cell-text" data-cell="${a}" value="${value}" placeholder="${has ? '' : 'ใช้ข้อความเดิม — พิมพ์หรือกดปุ่มด้านล่างเพื่อเปลี่ยน'}" autocomplete="off" />
        <div class="vf-result" id="cell-result">${has ? html`<span class="vf-out-label">ผลลัพธ์</span><span>${raw(richText(value, 'value') || '(ว่าง)')}</span>` : html`<span class="muted small">ไม่เปลี่ยน — ใช้ข้อความเดิมในไฟล์</span>`}</div>
      </div>
      ${varChips('cell-text', kind === 'summary' ? [VAR_GROUPS[1], VAR_GROUPS[2], VAR_GROUPS[3]] : VAR_GROUPS)}
      ${has ? html`<button type="button" class="btn btn-sm btn-ghost" data-cell-reset="${a}">${raw(icon('undo-2'))} ใช้ข้อความเดิมในไฟล์</button>` : ''}
    </div>`;
  }
  const cols = (L.columns ?? []).filter((c) => c.source !== 'blank');
  const cells = Object.entries(L.cells ?? {});
  return html`<div class="side-card side-help">
    <p class="side-tip">${raw(icon('info'))}<span>นี่คือ<b>ไฟล์ของคุณ</b> — ป้ายสีเขียว (คอลัมน์) และช่องสีม่วง คือจุดที่ระบบจะเติมข้อมูล ส่วนอื่นของไฟล์ไม่ถูกแก้ · <b>คลิกคอลัมน์หรือช่อง</b>เพื่อเปลี่ยน</span></p>
    <h4>คอลัมน์ที่ระบบเติม (${cols.length})</h4>
    <ul class="side-list">
      ${cols.map((c) => html`<li><button type="button" data-pick-col="${c.col}"><span class="side-tag sm">${colLetter(c.col)}</span><span class="truncate">${(kind === 'summary' ? SUMMARY_SOURCES[c.source] : COLUMN_SOURCES[c.source]?.label) ?? c.source}</span></button></li>`)}
    </ul>
    <h4>เซลล์ที่เติมอัตโนมัติ (${cells.length})</h4>
    <ul class="side-list">
      ${cells.length ? cells.map(([a, text]) => html`<li><button type="button" data-pick-cell="${a}"><span class="side-tag sm auto">${a}</span><span class="truncate">${raw(richText(text, 'token'))}</span></button></li>`) : html`<li class="muted small">— ยังไม่มี (คลิกเซลล์ในตัวอย่างเพื่อเพิ่ม)</li>`}
    </ul>
  </div>`;
}

function redrawLayout({ keepScroll = true } = {}) {
  const sheet = view.querySelector('.lay-sheet');
  const pos = sheet ? [sheet.scrollLeft, sheet.scrollTop] : null;
  render($('#pane'), layoutPane());
  enhanceSelects($('#pane'));
  const s = view.querySelector('.lay-sheet');
  if (keepScroll && pos && s) [s.scrollLeft, s.scrollTop] = pos;
  refreshDirty();
}
function redrawSide() {
  const L = currentLayout();
  const grid = sheetOf(previewOf === 'summary' ? draft.template.summary.sheet : draft.template.sheet);
  render($('#side'), sidePanel(L, previewOf, grid));
  enhanceSelects($('#side'));
}

/** อ่านตำแหน่งใหม่จากชีตที่เลือก */
function redetect(kind) {
  const t = draft.template;
  if (kind === 'company') {
    const l = detectLayout(sheetOf(t.sheet), 'company');
    if (!l) return toast.error(`ไม่พบหัวตารางในชีต “${t.sheet}” — กำหนดแถวเองได้`);
    Object.assign(t, l);
  } else if (t.summary?.sheet) {
    const l = detectLayout(sheetOf(t.summary.sheet), 'summary');
    t.summary = l ? { sheet: t.summary.sheet, ...l } : { sheet: t.summary.sheet, headerRow: 1, headerEnd: 1, dataRow: 2, footerRow: 3, columns: [], cells: {} };
  }
}

view.addEventListener('click', (e) => {
  if (step !== 'layout') return;
  const t = e.target;
  const th = t.closest('.sp [data-col]');
  const td = t.closest('.sp td[data-addr]');
  const L = currentLayout();
  if (th) sel = { col: Number(th.dataset.col) };
  else if (td) {
    const r = Number(td.dataset.r);
    // ในหัวตาราง/แถวข้อมูล = เลือกคอลัมน์ · นอกตาราง = เลือกเซลล์
    sel = r >= L.headerRow && r < L.footerRow ? { col: Number(td.dataset.c) } : { addr: td.dataset.addr };
  } else if (t.closest('[data-pick-col]')) sel = { col: Number(t.closest('[data-pick-col]').dataset.pickCol) };
  else if (t.closest('[data-pick-cell]')) sel = { addr: t.closest('[data-pick-cell]').dataset.pickCell };
  else if (t.closest('[data-side-close]')) sel = {};
  else if (t.closest('[data-preview]')) {
    previewOf = t.closest('[data-preview]').dataset.preview;
    sel = {};
  } else if (t.closest('#redetect')) {
    redetect('company');
    redetect('summary');
    toast.success('อ่านตำแหน่งจากไฟล์ใหม่แล้ว');
  } else if (t.closest('[data-col-only]')) {
    const col = L.columns.find((x) => x.col === sel.col);
    if (col) col.only = t.closest('[data-col-only]').dataset.colOnly;
  } else if (t.closest('[data-cell-reset]')) {
    delete L.cells[t.closest('[data-cell-reset]').dataset.cellReset];
  } else return;
  redrawLayout();
});

view.addEventListener('input', (e) => {
  const t = e.target;
  if (step === 'layout' && t.dataset.cell) {
    const L = currentLayout();
    L.cells[t.dataset.cell] = t.value;
    render($('#cell-result'), html`<span class="vf-out-label">ผลลัพธ์</span><span>${raw(richText(t.value, 'value') || '(ว่าง)')}</span>`);
    // อัปเดตป้ายในตัวอย่าง
    const td = view.querySelector(`.sp td[data-addr="${t.dataset.cell}"]`);
    if (td) {
      td.classList.add('auto');
      td.innerHTML = richText(t.value, 'token');
    }
    refreshDirty();
  }
});
view.addEventListener('change', (e) => {
  const t = e.target;
  if (step !== 'layout') return;
  if (t.dataset.row) {
    const L = currentLayout();
    L[t.dataset.row] = Math.max(1, Number(t.value) || 1);
    if (L.headerEnd < L.headerRow) L.headerEnd = L.headerRow;
    redrawLayout();
  } else if (t.dataset.pickSheet) {
    const tpl = draft.template;
    if (t.dataset.pickSheet === 'company') {
      tpl.sheet = t.value;
      redetect('company');
      previewOf = 'company';
    } else {
      tpl.summary = t.value ? { sheet: t.value } : null;
      if (t.value) redetect('summary');
      previewOf = t.value ? 'summary' : 'company';
    }
    sel = {};
    redrawLayout({ keepScroll: false });
  } else if (t.dataset.colSource) {
    const L = currentLayout();
    const c = Number(t.dataset.colSource);
    let col = L.columns.find((x) => x.col === c);
    if (!col) {
      col = { col: c, header: '', group: '', source: 'blank', only: '' };
      L.columns.push(col);
      L.columns.sort((a, b) => a.col - b.col);
    }
    col.source = t.value;
    // ข้อมูลส่วนตัว/แผน เติมเฉพาะแถวเข้าใหม่ (ตามไฟล์จริง) — เปลี่ยนเองได้
    if (previewOf === 'company') col.only = IN_ONLY.includes(t.value) ? 'IN' : '';
    redrawLayout();
  }
});

// ---------- ขั้น 3: ตั้งค่าการส่งออก ----------
const switchRow = (k, checked, title, desc) => html`<div class="sw-row">
  <button type="button" class="switch" role="switch" aria-checked="${!!checked}" data-switch="${k}" aria-label="${title}"></button>
  <span><b>${title}</b><small>${desc}</small></span>
</div>`;

function exportPane() {
  const fileVars = { insurer: draft.shortName || draft.name, cycleDate: cycle, month: thaiMonthYear(cycle) };
  return html`<div class="ed-body">
    <div class="pane-grid">
      <section class="pane-block">
        <h3>การใช้งาน</h3>
        ${switchRow('active', draft.active, draft.active ? 'เปิดใช้' : 'ปิดอยู่', draft.active ? 'แสดงในหน้าส่งออกของประกันกลุ่ม' : 'ยังไม่แสดงในหน้าส่งออก — เปิดเมื่อพร้อม')}
        ${switchRow('includeEmptySheets', draft.includeEmptySheets, 'สร้างชีตแม้ไม่มีรายการ', 'บริษัทที่รอบนั้นไม่มีคนเข้า/ออก ก็ยังมีชีต')}
        <p class="muted small">บริษัทที่ส่งแจ้งกับบริษัทประกันนี้: ${draft.companies.length ? draft.companies.map((c) => c.companyCode).join(', ') : 'ยังไม่ผูก'} — ผูกได้ที่หน้าภาพรวม</p>
      </section>
      <section class="pane-block">
        <h3>รูปแบบข้อมูลในไฟล์</h3>
        <div class="form-grid g2">
          <div class="field">
            <label for="f-date">รูปแบบวันที่</label>
            <select id="f-date" data-k="dateFormat" data-combobox>${Object.keys(DATE_FORMATS).map((k) => html`<option value="${k}" ${k === draft.dateFormat ? 'selected' : ''}>${DATE_FORMATS[k]}</option>`)}</select>
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
          ${markField('f-in', 'inMark', 'เครื่องหมาย “เข้าใหม่”')}
          ${markField('f-out', 'outMark', 'เครื่องหมาย “ลาออก”')}
        </div>
        <div class="example-line">${raw(icon('eye'))}<span>วันที่ในไฟล์ เช่น <b class="num" id="date-example">${formatFormDate(cycle, draft.dateFormat, draft.dateEra)}</b></span></div>
      </section>
      <section class="pane-block">
        <h3>ชื่อไฟล์และชื่อชีต</h3>
        <div class="field">
          <label for="f-file">ชื่อไฟล์ที่ส่งออก</label>
          <input class="input" id="f-file" data-k="fileName" value="${draft.fileName}" />
          <div class="vf-result" id="out-fileName"><span class="vf-out-label">ผลลัพธ์</span><span>${raw(richText(draft.fileName, 'value', fileVars))}.xlsx</span></div>
          ${varChips('f-file', [{ label: 'แทรก', tokens: ['{insurer}', '{cycleDate}', '{month}'] }])}
        </div>
        <div class="field">
          <label for="f-sheet">ชื่อชีตของแต่ละบริษัท</label>
          <input class="input" id="f-sheet" data-k="sheetName" value="${draft.sheetName}" />
          ${varChips('f-sheet', [{ label: 'แทรก', tokens: ['{companyCode}', '{companyName}'] }])}
        </div>
      </section>
      <section class="pane-block">
        <h3>ผู้แจ้ง <span class="muted small">ใช้เติมช่อง “ผู้แจ้ง / โทร / แผนก” ในแบบฟอร์ม</span></h3>
        <div class="field"><label for="s-name">ชื่อผู้แจ้ง</label><input class="input" id="s-name" data-k="signer.name" value="${draft.signer.name}" /></div>
        <div class="form-grid g2">
          <div class="field"><label for="s-dept">แผนก / ฝ่าย</label><input class="input" id="s-dept" data-k="signer.department" value="${draft.signer.department}" /></div>
          <div class="field"><label for="s-phone">โทรศัพท์</label><input class="input" id="s-phone" data-k="signer.phone" value="${draft.signer.phone}" /></div>
        </div>
      </section>
      <section class="pane-block span-all" id="test-block">
        <h3>ทดลองเติมข้อมูลลงไฟล์ <span class="muted small">ข้อมูลสมมติ 3 คน (เข้า 2 · ออก 1) เติมลงไฟล์ Excel ของคุณ แล้วเปิดดูใน Excel ได้เลย</span></h3>
        ${testResult
          ? html`<div class="test-done">
                <span class="ic-xl">${raw(icon('file-spreadsheet'))}</span>
                <div class="grow">
                  <b>เติมข้อมูลลงไฟล์แล้ว · ${testResult.sheets.length} ชีต</b>
                  <span class="muted small">${testResult.sheets.map((s) => s.name).join(' · ')} — ส่วนอื่นของไฟล์เหมือนต้นฉบับทุกอย่าง</span>
                </div>
                <button type="button" class="btn btn-primary" id="test-download">${raw(icon('download'))} ดาวน์โหลดไปเปิดใน Excel</button>
                <button type="button" class="btn" id="test-build">${raw(icon('refresh-cw'))} เติมใหม่</button>
              </div>
              <p class="test-note">${raw(icon('eye'))}<span>ตัวอย่างด้านล่างแสดง<b>โดยประมาณ</b> — หน้าตาจริงดูจากไฟล์ที่ดาวน์โหลด</span></p>
              <div class="xl-tabs">${testResult.sheets.map((s, i) => html`<button type="button" class="xl-tab${i === testResult.active ? ' active' : ''}" data-test-sheet="${i}">${s.name}</button>`)}</div>
              <div class="lay-sheet test">${sheetPreviewHtml(testResult.sheets[testResult.active].grid, { maxRows: 80 })}</div>`
          : html`<div class="row wrap">
              <button type="button" class="btn btn-primary" id="test-build">${raw(icon('file-spreadsheet'))} เติมข้อมูลทดลอง</button>
            </div>`}
      </section>
    </div>
  </div>`;
}

function setDraftValue(k, v) {
  if (k.includes('.')) {
    const [a, b] = k.split('.');
    draft[a][b] = v;
  } else draft[k] = v;
}

view.addEventListener('input', (e) => {
  const k = e.target.dataset?.k;
  if (!k || !draft || e.target.tagName === 'SELECT') return;
  setDraftValue(k, e.target.value);
  if (k === 'fileName') render($('#out-fileName'), html`<span class="vf-out-label">ผลลัพธ์</span><span>${raw(richText(draft.fileName, 'value', { insurer: draft.shortName || draft.name, cycleDate: cycle, month: thaiMonthYear(cycle) }))}.xlsx</span>`);
  if (k === 'name' || k === 'shortName') render($('#ed-title'), html`${draft.shortName || draft.name || 'บริษัทประกันใหม่'} ${draft.id ? '' : badge('ยังไม่บันทึก', 'warning')}`);
  testResult = null;
  refreshDirty();
});
view.addEventListener('change', (e) => {
  const k = e.target.dataset?.k;
  if (!k || !draft || e.target.tagName !== 'SELECT') return;
  setDraftValue(k, e.target.value);
  if (k === 'dateFormat') $('#date-example').textContent = formatFormDate(cycle, draft.dateFormat, draft.dateEra);
  testResult = null;
  refreshDirty();
});
on(view, 'click', '[data-switch]', (_e, b) => {
  const k = b.dataset.switch;
  draft[k] = !draft[k];
  drawEditor();
});
on(view, 'click', '[data-set]', (_e, b) => {
  draft[b.dataset.set] = b.dataset.value;
  testResult = null;
  drawPane();
});
on(view, 'click', '[data-insert]', (_e, b) => insertToken(document.getElementById(b.dataset.target), b.dataset.insert));
on(view, 'click', '#test-build', (_e, btn) =>
  busy(btn, async () => {
    const buffer = src?.buffer ?? (await templateBuffer(draft.template));
    const data = { cycleDate: cycle, insurer: draft, companies: sampleCompanies(), missing: [] };
    const out = await fillTemplate(buffer, data, { exportDate: today });
    const sheets = await gridsOf(out);
    testResult = { buffer: out, sheets, active: sheets.length > 1 ? 1 : 0 }; // เปิดชีตบริษัทแรก (ถัดจากสรุป)
    drawPane();
    $('#test-block').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, { label: 'กำลังเติมข้อมูลลงไฟล์' }).catch((err) => toast.error(errorMessage(err))),
);
on(view, 'click', '#dl-current', (_e, btn) =>
  busy(btn, async () => downloadBlob(new Blob([await templateBuffer(draft.template)], { type: XLSX_MIME }), draft.template.fileName.replace(/\.xlsx?$/i, '') + '.xlsx')).catch((err) => toast.error(errorMessage(err))),
);
on(view, 'click', '#test-download', () => downloadBlob(new Blob([testResult.buffer], { type: XLSX_MIME }), `ตัวอย่าง-${exportFileName(draft, cycle)}.xlsx`));
on(view, 'click', '[data-test-sheet]', (_e, b) => {
  testResult.active = Number(b.dataset.testSheet);
  drawPane();
});

// ---------- ขั้นตอน / บันทึก / ลบ ----------
on(view, 'click', '[data-step], [data-goto]', (_e, b) => {
  step = b.dataset.step ?? b.dataset.goto;
  setParams({ step: step === 'file' ? '' : step });
  drawEditor();
});

view.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = clone(draft);
  errors = validateInsurerForm(payload, forms);
  if (Object.keys(errors).length) {
    step = errors.name || errors.shortName ? 'file' : errors.template ? (draft.template ? 'layout' : 'file') : step;
    drawEditor();
    toast.error(Object.values(errors)[0]);
    return;
  }
  try {
    await busy($('#save'), async () => {
      if (src?.fromUpload) {
        // ล้างข้อมูลบุคคลในไฟล์ก่อนเก็บ — เหลือแถวข้อมูลต้นแบบ 1 แถว (ตำแหน่งส่วนท้ายเลื่อนตาม)
        const t = payload.template;
        const clean = await sanitizeTemplate(src.buffer, t, { converted: src.converted });
        payload.template = {
          ...sanitizedLayout(t),
          sheet: t.sheet,
          fileName: t.fileName.replace(/\.xls$/i, '.xlsx'),
          converted: t.converted,
          data: bufferToBase64(clean),
          url: undefined,
          uploadedAt: new Date().toISOString().slice(0, 19),
          uploadedBy: getSession()?.name ?? 'ผู้ใช้',
          summary: t.summary ? { ...sanitizedLayout(t.summary), sheet: t.summary.sheet } : null,
        };
      }
      const saved = await api.saveInsurer(payload);
      toast.success(`บันทึกแบบฟอร์ม ${saved.shortName} แล้ว${src?.fromUpload ? ' — ล้างรายชื่อในไฟล์แล้ว' : ''}`);
      forms = await api.listInsurers();
      openEditor(saved.id, { keepStep: true });
    }, { label: 'กำลังบันทึก' });
  } catch (err) {
    errors = err.details ?? {};
    toast.error(errorMessage(err));
  }
});

on(document, 'click', '#del', () =>
  confirmAction({
    title: `ลบบริษัทประกัน ${draft.shortName}?`,
    description: draft.companies.length ? `บริษัท ${draft.companies.map((c) => c.companyCode).join(', ')} จะไม่มีบริษัทประกัน จนกว่าจะผูกใหม่` : '',
    body: 'ไฟล์แบบฟอร์มจะถูกลบด้วย · ประวัติการส่งออกเดิมยังอยู่ครบ',
    confirmLabel: 'ลบ',
    successMessage: `ลบ ${draft.shortName} แล้ว`,
    action: async () => {
      await api.deleteInsurer(draft.id);
      draft = null;
      original = '';
      location.href = 'insurers.html';
    },
  }),
);

/** ออกจากหน้าแก้ไขขณะมีงานค้าง → ถามก่อน */
on(document, 'click', 'a[href="insurers.html"], a[href^="insurers.html?id="]', (e, a) => {
  if (!dirty()) return;
  e.preventDefault();
  confirmAction({
    title: 'ทิ้งการแก้ไขที่ยังไม่บันทึก?',
    body: src?.fromUpload ? 'ไฟล์ที่อัปโหลดและตำแหน่งที่ตั้งไว้จะหายไป' : 'การแก้ไขในแบบฟอร์มนี้จะหายไป',
    confirmLabel: 'ทิ้งการแก้ไข',
    action: async () => {
      original = JSON.stringify(draft);
      src = null;
      location.href = a.getAttribute('href');
    },
  });
});
window.addEventListener('beforeunload', (e) => {
  if (dirty() || (!draft && bindingsDirty())) e.preventDefault();
});

function openEditor(id, { keepStep = false } = {}) {
  const f = id === 'new' ? null : forms.find((x) => x.id === Number(id));
  if (id !== 'new' && !f) {
    toast.error('ไม่พบแบบฟอร์มนี้');
    setParams({ id: '', step: '' });
    return drawOverview();
  }
  draft = f ? clone(f) : blankInsurerForm();
  original = JSON.stringify(draft);
  errors = {};
  src = null;
  sel = {};
  previewOf = 'company';
  testResult = null;
  if (!keepStep) step = STEPS.some((s) => s.id === getParam('step')) && draft.template ? getParam('step') : draft.template ? 'layout' : 'file';
  if (!draft.template && step !== 'file') step = 'file';
  setParams({ id: f ? f.id : 'new', step: step === 'file' ? '' : step });
  drawEditor();
}

// ---------- เริ่ม ----------
render(view, loader({ text: 'กำลังโหลดแบบฟอร์ม', logo: true }));
try {
  [forms, companies] = await Promise.all([api.listInsurers(), api.listCompanies()]);
  loadBindings();
  const id = getParam('id');
  if (id) openEditor(id);
  else drawOverview();
} catch (e) {
  render(view, errorState(e));
}

