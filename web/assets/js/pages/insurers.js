// หน้า: แบบฟอร์มประกัน (insurers.html)
//
//   ภาพรวม (ไม่มี ?id)     ① บริษัทประกัน + ไฟล์แบบฟอร์ม Excel   ② ผูกบริษัทในเครือ ↔ บริษัทประกัน (บันทึกทีเดียวทั้งตาราง)
//   แก้แบบฟอร์ม (?id=)    หน้าเดียว 2 กล่อง: ซ้าย = อัปโหลดไฟล์ Excel ของบริษัทประกัน (.xlsx/.xls — ระบบหาจุดเติมให้อัตโนมัติ) + การตั้งค่า
//                          ขวา = ตัวอย่างไฟล์ที่เติมข้อมูลสมมติแล้ว (อัปเดตเองเมื่อแก้การตั้งค่า · เปิดใน Excel ได้)
//   ระบบไม่สร้างแบบฟอร์มใหม่ — ตอนส่งออกเปิดไฟล์ที่อัปโหลดแล้วเติมรายชื่อลงไป (app/xlsxDirect.js)
//
// ไฟล์ที่อัปโหลดอยู่ในเบราว์เซอร์จนกด "บันทึก" — ตอนบันทึกจะล้างรายชื่อพนักงานในไฟล์ (ข้อมูลบุคคล) ก่อนเก็บ (app/excelTemplate.js)
import { api } from '../app/api.js';
import { can, getSession } from '../app/auth.js';
import { analyzeTemplate, exportFileName, fillTemplate, gridsOf, readTemplateFile, sanitizedLayout, sanitizeTemplate, templateBuffer } from '../app/excelTemplate.js';
import { initPage } from '../app/shell.js';
import { blankInsurerForm, validateInsurerForm } from '../application/insurerFormRules.js';
import { formatFormDate, thaiMonthYear } from '../application/usecases/insurerExport.js';
import { addDays, nextCycleDate, todayISO } from '../domain/date.js';
import { COLUMN_SOURCES, DATE_FORMATS, PLACEHOLDERS, VAR_SHORT } from '../domain/insurerForm.js';
import { COMPANY_CODES } from '../domain/labels.js';
import { thaiIdCheckDigit } from '../domain/thaiId.js';
import { $, esc, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { XLSX_MIME, bufferToBase64, downloadBlob } from '../shared/excel.js';
import { thaiDateTime } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { alertBox, badge, errorState } from '../ui/components.js';
import { enhanceSelects } from '../ui/combobox.js';
import { busy, loader } from '../ui/loading.js';
import { confirmAction, errorMessage, toast } from '../ui/overlay.js';
import { ExcelGrid } from '../ui/datagrid.js';
import { sheetPreviewHtml } from '../ui/sheetPreview.js';

initPage('insurers', { tour: () => (getParam('id') ? 'insurer-edit' : 'insurers') });

const today = todayISO();
const cycle = nextCycleDate(today);
const view = $('#view');
const page = $('#page');
const CODES = [...COMPANY_CODES].sort(); // ลำดับชีต/ตาราง = ตามตัวอักษร (เหมือนไฟล์ของ HR)
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
let draft = null; // แบบฟอร์มที่กำลังแก้
let original = '';
let errors = {};
/** ไฟล์ที่เพิ่งอัปโหลด (ยังไม่บันทึก): { buffer, converted, sheets:[{name, grid}], fromUpload, fileName } */
let src = null;
let testResult = null; // { buffer, sheets, active }

const clone = (x) => structuredClone(x);
const dirty = () => !!draft && (JSON.stringify(draft) !== original || !!src?.fromUpload);
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
      ${can('insurers.edit') ? html`<a class="btn btn-sm btn-primary" href="insurers.html?id=${f.id}">${raw(icon('pencil'))} แก้ไขแบบฟอร์ม</a>` : ''}
      ${t ? html`<button type="button" class="btn btn-sm" data-dl-template="${f.id}">${raw(icon('download'))} ดาวน์โหลดไฟล์ Excel</button>` : ''}
    </footer>
  </article>`;
}

/** คอลัมน์ตารางผูกบริษัท — 1 แถว = 1 บริษัทในเครือ (แก้ได้ทุกช่อง ไม่มีเพิ่ม/ลบแถว) */
const bindColumns = () => [
  {
    key: 'companyCode',
    header: 'บริษัทในเครือ',
    width: 240,
    value: (b) => b.companyCode,
    text: (b) => `${b.companyCode} ${legalName(b.companyCode)}`,
    display: (b) => html`<span class="bt-co"><b>${b.companyCode}</b><small class="truncate">${legalName(b.companyCode)}</small></span>`,
  },
  {
    key: 'insurerId',
    header: 'ส่งแจ้งกับ',
    width: 250,
    editor: 'select',
    value: (b) => (b.insurerId ? String(b.insurerId) : ''),
    options: () => [{ value: '', label: '— ไม่ส่งแจ้ง —' }, ...forms.map((f) => ({ value: String(f.id), label: `${f.shortName}${f.active ? '' : ' (ปิดอยู่)'}` }))],
    text: (b) => forms.find((f) => f.id === b.insurerId)?.shortName ?? 'ไม่ส่งแจ้ง',
    display: (b) => {
      const f = forms.find((x) => x.id === b.insurerId);
      if (!f) return html`<span class="muted">— ไม่ส่งแจ้ง —</span>`;
      const warn = !f.template ? 'ยังไม่มีไฟล์ Excel' : !f.active ? 'ปิดอยู่' : '';
      return html`<span class="row" style="gap:6px;min-width:0"><span class="truncate">${f.shortName}</span>${warn ? badge(warn, 'warning') : ''}</span>`;
    },
    // เลือกบริษัทประกัน → เติมชื่อผู้ถือกรมธรรม์ให้ (ถ้ายังว่าง)
    set: (b, v) => {
      const insurerId = Number(v) || null;
      return { ...b, insurerId, holderName: insurerId && !b.holderName ? legalName(b.companyCode).replace(/^บ\./, 'บริษัท ') : b.holderName };
    },
  },
  { key: 'policyNo', header: 'เลขที่กรมธรรม์', width: 170, editor: 'text', editable: (b) => !!b.insurerId, value: (b) => b.policyNo, set: (b, v) => ({ ...b, policyNo: String(v ?? '').trim() }) },
  {
    key: 'holderName',
    header: 'ชื่อผู้ถือกรมธรรม์',
    width: 320,
    editor: 'text',
    editable: (b) => !!b.insurerId,
    value: (b) => b.holderName,
    display: (b) => (b.holderName ? html`<span class="truncate">${b.holderName}</span>` : b.insurerId ? html`<span class="muted truncate">${legalName(b.companyCode)}</span>` : ''),
    set: (b, v) => ({ ...b, holderName: String(v ?? '').trim() }),
  },
  { key: 'plan', header: 'แผน', width: 80, editor: 'text', editable: (b) => !!b.insurerId, value: (b) => b.plan, set: (b, v) => ({ ...b, plan: String(v ?? '').trim() }) },
];
let bindGrid = null;

function drawOverview() {
  page.classList.remove('editing');
  render($('#head-actions'), can('insurers.edit') ? html`<a class="btn btn-primary" href="insurers.html?id=new">${raw(icon('plus'))} เพิ่มบริษัทประกัน</a>` : '');
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
        <div class="ic-grid" id="ic-grid">${insurerCards()}</div>
      </section>

      <section class="ov card" id="bindings">
        <header class="ov-head">
          <span class="ov-no">2</span>
          <div>
            <h2>บริษัทในเครือส่งแจ้งกับบริษัทประกันไหน</h2>
            <p>1 บริษัทในเครือ = 1 บริษัทประกัน · เลขกรมธรรม์และชื่อผู้ถือกรมธรรม์ใช้เติมในหัวเอกสารของชีตบริษัทนั้น</p>
          </div>
        </header>
        <div id="bind-grid" class="fill-body"></div>
      </section>`,
  );
  bindGrid = new ExcelGrid($('#bind-grid'), {
    columns: bindColumns(),
    rowKey: (b) => b.companyCode,
    readOnly: !can('insurers.edit'),
    // กดบันทึก → ส่งการผูกทั้งหมด (แถวนี้เป็นค่าใหม่) ทีละแถวที่แก้ — API ตรวจทั้งชุด
    onSave: async (row) => {
      const next = bindings.map((b) => (b.companyCode === row.companyCode ? row : b));
      forms = await api.saveInsurerBindings(next);
      bindings = next;
      return row;
    },
    onSaved: () => render($('#ic-grid'), insurerCards()),
    empty: '',
  });
  bindGrid.setRows(clone(bindings));
}

function insurerCards() {
  return html`${forms.map(insurerCard)}
    <a class="ic-add" href="insurers.html?id=new">${raw(icon('plus'))}<b>เพิ่มบริษัทประกัน</b><small>อัปโหลดไฟล์ Excel ของบริษัทใหม่</small></a>`;
}

function loadBindings() {
  bindings = CODES.map((code) => {
    const f = forms.find((x) => x.companies.some((c) => c.companyCode === code));
    const c = f?.companies.find((x) => x.companyCode === code);
    return { companyCode: code, insurerId: f?.id ?? null, policyNo: c?.policyNo ?? '', holderName: c?.holderName ?? '', plan: c?.plan ?? '1' };
  });
}

on(view, 'click', '[data-dl-template]', (_e, btn) => {
  const f = forms.find((x) => x.id === Number(btn.dataset.dlTemplate));
  busy(btn, async () => downloadBlob(new Blob([await templateBuffer(f.template)], { type: XLSX_MIME }), f.template.fileName.replace(/\.xlsx?$/i, '') + '.xlsx')).catch((err) => toast.error(errorMessage(err)));
});

// ===================================================================
// แก้แบบฟอร์ม
// ===================================================================
const activeBadge = () => (draft.active ? badge('เปิดใช้', 'success') : badge('ปิดอยู่', 'neutral'));

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
            <span id="ed-state">${activeBadge()}</span>
          </header>
          </div>
          <div class="ed-split">
            <div class="ed-left" id="ed-left"></div>
            <aside class="ed-right" id="ed-right" aria-label="ตัวอย่างไฟล์พร้อมข้อมูลสมมติ"></aside>
          </div>
        </section>
        <div class="form-footer">
          <span class="dirty-note" id="dirty-note"></span>
          <a class="btn btn-ghost" href="insurers.html">ยกเลิก</a>
          <button type="submit" class="btn btn-primary" id="save" data-label="บันทึก">${raw(icon('save'))} บันทึก</button>
        </div>
      </form>`,
  );
  drawLeft();
  drawPreview();
}

function refreshDirty() {
  render($('#dirty-note'), dirty() ? html`<span class="dot"></span> มีการแก้ไขที่ยังไม่บันทึก` : '');
}

/** กล่องซ้าย: ไฟล์ + การตั้งค่า (render ใหม่เฉพาะตอนกดปุ่ม — ระหว่างพิมพ์ไม่ render เพื่อไม่ให้เคอร์เซอร์หลุด) */
function drawLeft() {
  const left = $('#ed-left');
  if (!left) return;
  render(left, leftPane());
  enhanceSelects(left);
  refreshDirty();
}

/** ช่องเครื่องหมายเข้าใหม่/ลาออก + ปุ่มเลือกเร็ว (พิมพ์ ✓ เองยาก) */
const MARKS = ['✓', '✗'];
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

// ---------- กล่องซ้าย: ไฟล์แบบฟอร์ม + การตั้งค่า ----------
function leftPane() {
  return html`<div class="ed-body">${fileBlock()}${settingsBlocks()}</div>`;
}

function fileBlock() {
  const t = draft.template;
  return html`<section class="pane-block" id="file-block">
    <h3>${raw(icon('file-spreadsheet'))} ไฟล์ Excel ของบริษัทประกัน</h3>
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

    <label class="drop${t ? ' sm' : ''}" id="drop" tabindex="0">
      <input type="file" id="file-input" accept=".xlsx,.xls,application/vnd.ms-excel,${XLSX_MIME}" hidden />
      <span class="drop-icon">${raw(icon('file-spreadsheet'))}</span>
      <b>${t ? 'เปลี่ยนไฟล์ Excel' : 'อัปโหลดไฟล์ Excel ที่ส่งบริษัทประกัน'}</b>
      <span>ลากไฟล์มาวางที่นี่ หรือ <u>คลิกเพื่อเลือกไฟล์</u> (.xlsx แนะนำ · .xls)</span>
      <small>ใช้ไฟล์ที่เคยส่งจริงได้เลย (มีรายชื่ออยู่ก็ได้) — ระบบหาให้ว่าควรเติมข้อมูลตรงไหน</small>
    </label>

    ${t
      ? html`<div class="file-card${src?.fromUpload ? ' new' : ''}">
          <span class="ic-xl">${raw(icon('file-spreadsheet'))}</span>
          <div class="grow">
            <b>${t.fileName}</b>
            <span class="muted small">${src?.fromUpload ? 'ไฟล์ใหม่ — ยังไม่บันทึก' : t.uploadedAt ? `อัปโหลด ${thaiDateTime(t.uploadedAt)} · ${t.uploadedBy}` : t.uploadedBy} · ชีต ${t.sheet}${t.summary ? ` + ${t.summary.sheet}` : ''}</span>
          </div>
          ${src?.fromUpload ? '' : html`<button type="button" class="btn btn-sm" id="dl-current">${raw(icon('download'))} ดาวน์โหลดไฟล์ที่เก็บไว้</button>`}
        </div>
        ${fillSummary(t)}`
      : ''}
    ${errors.template ? alertBox({ tone: 'danger', title: errors.template }) : ''}
    ${xlsNotice()}
    <p class="privacy">${raw(icon('lock'))} รายชื่อพนักงานที่อยู่ในไฟล์ (ข้อมูลบุคคล) จะถูกล้างออกก่อนเก็บ — เก็บไว้เฉพาะแบบฟอร์มเปล่า · ชีตอื่นที่ไม่ใช้ไม่ถูกเก็บ</p>
  </section>`;
}

/** สิ่งที่ระบบจะเติมลงไฟล์ (หาให้อัตโนมัติจากไฟล์) */
function fillSummary(t) {
  const cols = t.columns.filter((c) => c.source !== 'blank');
  const cells = Object.values(t.cells ?? {}).flatMap((v) => [...String(v).matchAll(/\{(\w+)\}/g)].map((m) => VAR_SHORT['{' + m[1] + '}'] ?? m[1]));
  const label = (c) => (COLUMN_SOURCES[c.source]?.label ?? c.source).split(' — ')[0].replace(/\s*\(.*\)$/, '');
  return html`<div class="fill-sum">
    <div><span class="fs-k">ชีตที่ใช้</span><span>${t.sheet} (ชีตละบริษัทในเครือ)${t.summary ? ` · ${t.summary.sheet} (สรุป)` : ''}</span></div>
    <div><span class="fs-k">เติมรายชื่อ ${cols.length} คอลัมน์</span><span class="fs-tags">${cols.map((c) => html`<span class="fs-tag">${label(c)}</span>`)}</span></div>
    ${cells.length ? html`<div><span class="fs-k">เติมช่อง</span><span class="fs-tags">${[...new Set(cells)].map((x) => html`<span class="fs-tag auto">${x}</span>`)}</span></div>` : ''}
  </div>`;
}

async function handleFile(file) {
  if (!file) return;
  if (!/\.xlsx?$/i.test(file.name)) return toast.error('รองรับเฉพาะไฟล์ Excel (.xlsx หรือ .xls)');
  if (file.size > 10 * 1024 * 1024) return toast.error('ไฟล์ใหญ่เกิน 10MB');
  render($('#drop'), loader({ text: 'กำลังอ่านไฟล์และหาจุดที่ต้องเติม', compact: true }));
  try {
    const r = await readTemplateFile(file);
    const a = analyzeTemplate(r.sheets);
    if (!a.layout) throw new Error('ไม่พบตารางรายชื่อในไฟล์นี้ — ตรวจว่าเป็นไฟล์แบบฟอร์มแจ้งเข้า-ออกของบริษัทประกัน');
    const layout = a.layout;
    src = { ...r, fromUpload: true, fileName: file.name };
    draft.template = { fileName: file.name, converted: r.converted, lost: r.lost, uploadedAt: null, uploadedBy: '', sheet: a.sheet, ...layout, summary: a.summary };
    errors = {};
    const nCols = layout.columns.filter((c) => c.source !== 'blank').length;
    toast.success(`อ่านไฟล์แล้ว — ระบบจะเติมรายชื่อ ${nCols} คอลัมน์ · ${Object.keys(layout.cells).length} ช่อง`);
    drawEditor();
    buildPreview();
  } catch (e) {
    toast.error(errorMessage(e));
    drawLeft();
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

// ---------- การตั้งค่า (ใต้ไฟล์ในกล่องซ้าย) ----------
const switchRow = (k, checked, title, desc) => html`<div class="sw-row">
  <button type="button" class="switch" role="switch" aria-checked="${!!checked}" data-switch="${k}" aria-label="${title}"></button>
  <span><b>${title}</b><small>${desc}</small></span>
</div>`;

function settingsBlocks() {
  const fileVars = { insurer: draft.shortName || draft.name, cycleDate: cycle, month: thaiMonthYear(cycle) };
  return html`<section class="pane-block">
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
`;
}

// ---------- กล่องขวา: ตัวอย่างไฟล์ที่เติมข้อมูลสมมติแล้ว (อัปเดตเองเมื่อเปลี่ยนไฟล์/การตั้งค่า) ----------
let previewGen = 0; // กันผลของรอบเก่าที่เสร็จทีหลังมาทับรอบใหม่
let previewTimer = null;
let previewError = '';

/** เปลี่ยนการตั้งค่า → เติมตัวอย่างใหม่ (หน่วงไว้ระหว่างพิมพ์) */
function schedulePreview(delay = 500) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => buildPreview(), delay);
}

async function buildPreview() {
  clearTimeout(previewTimer);
  if (!draft?.template) return drawPreview();
  const gen = ++previewGen;
  const keep = testResult?.active;
  testResult = null;
  previewError = '';
  drawPreview();
  try {
    const buffer = src?.buffer ?? (await templateBuffer(draft.template));
    const data = { cycleDate: cycle, insurer: draft, companies: sampleCompanies(), missing: [] };
    const out = await fillTemplate(buffer, data, { exportDate: today });
    const sheets = await gridsOf(out);
    if (gen !== previewGen) return;
    // เปิดชีตบริษัทแรก (ถัดจากชีตสรุป) · เติมใหม่แล้วอยู่ชีตเดิม
    testResult = { buffer: out, sheets, active: keep != null && keep < sheets.length ? keep : sheets.length > 1 ? 1 : 0 };
  } catch (err) {
    if (gen !== previewGen) return;
    previewError = errorMessage(err);
  }
  drawPreview();
}

function drawPreview() {
  const box = $('#ed-right');
  if (!box) return;
  const sheetBox = box.querySelector('.lay-sheet');
  const scroll = sheetBox ? [sheetBox.scrollTop, sheetBox.scrollLeft] : null;
  render(box, previewPane());
  // เติมใหม่ (เช่นเปลี่ยนรูปแบบวันที่) → คงตำแหน่งที่เลื่อนดูอยู่
  const next = box.querySelector('.lay-sheet');
  if (scroll && next) [next.scrollTop, next.scrollLeft] = scroll;
}

function previewPane() {
  const t = draft.template;
  const head = html`<header class="pv-head">
    <div class="grow">
      <h3>${raw(icon('eye'))} ตัวอย่างไฟล์ที่ส่งออก</h3>
      <small class="muted">ข้อมูลสมมติ 3 คน (เข้า 2 · ออก 1) เติมลงไฟล์ของคุณ · อัปเดตเองเมื่อแก้การตั้งค่า</small>
    </div>
    ${testResult ? html`<button type="button" class="btn btn-sm btn-primary" id="test-download" title="ไฟล์ตัวอย่างนี้ — เปิดใน Excel ดูหน้าตาจริง">${raw(icon('download'))} เปิดใน Excel</button>` : ''}
  </header>`;
  if (!t)
    return html`${head}
      <div class="pv-empty">
        <span class="pv-empty-ic">${raw(icon('file-spreadsheet'))}</span>
        <b>อัปโหลดไฟล์ Excel ทางซ้าย แล้วตัวอย่างจะแสดงที่นี่</b>
        <ol class="how" aria-label="ระบบทำงานอย่างไร">
          <li><span class="how-no">1</span><b>ไฟล์ของบริษัทประกันตัวจริง</b><small>ระบบเก็บไฟล์นี้ไว้ (ล้างรายชื่อเดิมออก)</small></li>
          <li><span class="how-no">2</span><b>ระบบหาจุดที่ต้องเติมเอง</b><small>คอลัมน์รายชื่อ · ช่องเลขกรมธรรม์ / เดือน / ผู้แจ้ง</small></li>
          <li><span class="how-no">3</span><b>ส่งออก = เติมรายชื่อลงไฟล์นี้</b><small>โลโก้ สี สูตร หน้ากระดาษ เหมือนเดิมทุกอย่าง</small></li>
        </ol>
      </div>`;
  if (previewError)
    return html`${head}
      <div class="pv-body">
        ${alertBox({ tone: 'danger', title: 'เติมข้อมูลตัวอย่างไม่สำเร็จ', body: previewError })}
        <div><button type="button" class="btn btn-sm" id="test-build">${raw(icon('refresh-cw'))} ลองใหม่</button></div>
      </div>`;
  if (!testResult) return html`${head}<div class="pv-body pv-loading">${loader({ text: 'กำลังเติมข้อมูลตัวอย่างลงไฟล์' })}</div>`;
  const s = testResult.sheets[testResult.active];
  return html`${head}
    <div class="pv-body">
      <div class="xl-tabs">${testResult.sheets.map((x, i) => html`<button type="button" class="xl-tab${i === testResult.active ? ' active' : ''}" data-test-sheet="${i}">${x.name}</button>`)}</div>
      <div class="lay-sheet test">${sheetPreviewHtml(s.grid, { maxRows: 80 })}</div>
      <p class="test-note">${raw(icon('info'))}<span>แสดง<b>โดยประมาณ</b> — หน้าตาจริงดูได้จากปุ่ม “เปิดใน Excel” · ส่วนอื่นของไฟล์เหมือนต้นฉบับทุกอย่าง</span></p>
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
  if (k !== 'fileName') schedulePreview(); // ชื่อไฟล์ไม่อยู่ในเนื้อไฟล์
  refreshDirty();
});
view.addEventListener('change', (e) => {
  const k = e.target.dataset?.k;
  if (!k || !draft || e.target.tagName !== 'SELECT') return;
  setDraftValue(k, e.target.value);
  if (k === 'dateFormat') $('#date-example').textContent = formatFormDate(cycle, draft.dateFormat, draft.dateEra);
  schedulePreview(0);
  refreshDirty();
});
on(view, 'click', '[data-switch]', (_e, b) => {
  const k = b.dataset.switch;
  draft[k] = !draft[k];
  render($('#ed-state'), activeBadge());
  drawLeft();
  if (k !== 'active') schedulePreview(0);
});
on(view, 'click', '[data-set]', (_e, b) => {
  draft[b.dataset.set] = b.dataset.value;
  drawLeft();
  schedulePreview(0);
});
on(view, 'click', '[data-insert]', (_e, b) => insertToken(document.getElementById(b.dataset.target), b.dataset.insert));
on(view, 'click', '#test-build', () => buildPreview());
on(view, 'click', '#dl-current', (_e, btn) =>
  busy(btn, async () => downloadBlob(new Blob([await templateBuffer(draft.template)], { type: XLSX_MIME }), draft.template.fileName.replace(/\.xlsx?$/i, '') + '.xlsx')).catch((err) => toast.error(errorMessage(err))),
);
on(view, 'click', '#test-download', () => downloadBlob(new Blob([testResult.buffer], { type: XLSX_MIME }), `ตัวอย่าง-${exportFileName(draft, cycle)}.xlsx`));
on(view, 'click', '[data-test-sheet]', (_e, b) => {
  testResult.active = Number(b.dataset.testSheet);
  render($('#ed-right'), previewPane()); // ชีตอื่น → เริ่มจากมุมบนซ้าย
});

// ---------- บันทึก / ลบ ----------

view.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = clone(draft);
  errors = validateInsurerForm(payload, forms);
  if (Object.keys(errors).length) {
    drawLeft();
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
      openEditor(saved.id);
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
    body: src?.fromUpload ? 'ไฟล์ที่อัปโหลดจะหายไป' : 'การแก้ไขในแบบฟอร์มนี้จะหายไป',
    confirmLabel: 'ทิ้งการแก้ไข',
    action: async () => {
      original = JSON.stringify(draft);
      src = null;
      location.href = a.getAttribute('href');
    },
  });
});
window.addEventListener('beforeunload', (e) => {
  if (dirty()) e.preventDefault(); // ตารางผูกบริษัทถามเองเมื่อมีงานค้าง (ExcelGrid)
});

function openEditor(id) {
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
  testResult = null;
  setParams({ id: f ? f.id : 'new', step: '' }); // ?step= ของหน้าแบบขั้นตอนเดิม — ล้างทิ้ง
  drawEditor();
  if (draft.template) buildPreview();
}

// ---------- เริ่ม ----------
render(view, loader({ text: 'กำลังโหลดแบบฟอร์ม', logo: true }));
try {
  [forms, companies] = await Promise.all([api.listInsurers(), api.listCompanies()]);
  loadBindings();
  const id = getParam('id');
  // หน้าแก้ไขต้องมีสิทธิ์ insurers.edit — ไม่มี = แสดงภาพรวม
  if (id && can('insurers.edit')) openEditor(id);
  else drawOverview();
} catch (e) {
  render(view, errorState(e));
}

