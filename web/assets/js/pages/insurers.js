// หน้า: แบบฟอร์มประกัน (insurers.html?id=) — ตั้งค่าไฟล์ Excel แจ้งเข้า-ออกของแต่ละบริษัทประกัน (เพิ่ม / แก้ไข / ทำสำเนา / ลบ)
//
// แก้ค่าในฟอร์ม → เก็บใน draft → ตัวอย่างด้านล่างอัปเดตทันที → กด "บันทึก" ถึงจะส่งไป api.saveInsurer
// ช่องในฟอร์มผูกกับ draft ด้วย data-k:  "name" · "signer.phone" · "columns:3:header" · "headerLines:0:size" · "co:HL:policyNo"
import { api } from '../app/api.js';
import { initPage } from '../app/shell.js';
import { blankInsurerForm, validateInsurerForm } from '../application/insurerFormRules.js';
import { buildSheetModel } from '../application/usecases/insurerExport.js';
import { addDays, nextCycleDate, todayISO } from '../domain/date.js';
import { COLUMN_SOURCES, DATE_ERA_LABEL, DATE_FORMATS, PLACEHOLDERS, ROW_SCOPE_LABEL } from '../domain/insurerForm.js';
import { COMPANY_CODES } from '../domain/labels.js';
import { thaiIdCheckDigit } from '../domain/thaiId.js';
import { $, debounce, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { downloadBlob, sheetModelToXlsx } from '../shared/excel.js';
import { icon } from '../shared/icons.js';
import { alertBox, badge, emptyState, errorState, skeletonLines } from '../ui/components.js';
import { enhanceSelects } from '../ui/combobox.js';
import { confirmAction, errorMessage, toast } from '../ui/overlay.js';

initPage('insurers', { tour: 'insurers' });

const today = todayISO();
const cycle = nextCycleDate(today);
const editor = $('#editor');
let forms = [];
let draft = null; // แบบฟอร์มที่กำลังแก้ (สำเนา)
let original = ''; // JSON ตอนเปิด — ใช้ตรวจว่ามีการแก้ไขค้าง
let errors = {};
let lastField = null; // ช่องข้อความล่าสุดที่โฟกัส (ปุ่มแทรกตัวแปร)
let previewSheet = 1; // ชีตที่ดูในตัวอย่าง (0 = สรุป ถ้ามี)
const coCache = new Map(); // ค่าเดิมของบริษัทที่ถูกเอาออก (ติ๊กกลับแล้วได้ค่าคืน)

const clone = (x) => structuredClone(x);
const dirty = () => draft && JSON.stringify(draft) !== original;
const colLetter = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
const opts = (rec, value) => Object.entries(rec).map(([v, label]) => html`<option value="${v}" ${v === String(value ?? '') ? 'selected' : ''}>${label}</option>`);

// ---------- รายการแบบฟอร์ม ----------
function drawList() {
  const id = draft?.id ?? null;
  render(
    $('#list'),
    forms.length
      ? html`${forms.map(
          (f) => html`<button type="button" class="ins-item${f.id === id ? ' active' : ''}" data-open="${f.id}" ${f.id === id ? raw('aria-current="true"') : ''}>
            <span class="ins-item-head">
              <b class="truncate">${f.shortName}</b>
              ${f.active ? badge('เปิดใช้', 'success') : badge('ปิดอยู่', 'neutral')}
            </span>
            <span class="ins-item-cos">${f.companies.length ? f.companies.map((c) => c.companyCode).join(' · ') : 'ยังไม่ผูกบริษัท'}</span>
            <span class="muted small">${f.columns.length} คอลัมน์ · ${DATE_FORMATS[f.dateFormat]?.split(' ')[0] ?? ''} ${DATE_ERA_LABEL[f.dateEra] ?? ''}</span>
          </button>`,
        )}
        ${draft && !draft.id ? html`<div class="ins-item active new">${raw(icon('plus'))} <b>แบบฟอร์มใหม่</b> (ยังไม่บันทึก)</div>` : ''}`
      : emptyState({ iconName: 'file-spreadsheet', title: 'ยังไม่มีแบบฟอร์ม', description: 'กด “เพิ่มแบบฟอร์ม” เพื่อเริ่ม' }),
  );
}

// ---------- ตัวแก้ไข ----------
function usedBy(code) {
  return forms.find((f) => f.id !== draft.id && f.active && f.companies.some((c) => c.companyCode === code));
}

const fieldErr = (k) => (errors[k] ? html`<span class="error">${errors[k]}</span>` : '');

function generalSection() {
  return html`<div class="form-section" id="sec-general">
    <div>
      <h3>ข้อมูลทั่วไป</h3>
      <p>ชื่อบริษัทประกัน รูปแบบวันที่ และชื่อไฟล์</p>
    </div>
    <div class="form-grid">
      <div class="field span-2">
        <label for="f-name">ชื่อบริษัทประกัน<span class="req">*</span></label>
        <input class="input" id="f-name" data-k="name" value="${draft.name}" placeholder="เช่น บริษัท ไทยประกันชีวิต จำกัด (มหาชน)" ${errors.name ? raw('aria-invalid="true"') : ''} />
        ${fieldErr('name')}
      </div>
      <div class="field">
        <label for="f-short">ชื่อย่อ<span class="req">*</span></label>
        <input class="input" id="f-short" data-k="shortName" value="${draft.shortName}" placeholder="ใช้ในชื่อไฟล์และหน้าส่งออก" ${errors.shortName ? raw('aria-invalid="true"') : ''} />
        ${fieldErr('shortName')}
      </div>
      <div class="field">
        <span class="label">สถานะ</span>
        <label class="switch-row">
          <button type="button" class="switch" role="switch" aria-checked="${!!draft.active}" data-toggle="active" aria-label="เปิดใช้แบบฟอร์มนี้"></button>
          <span>${draft.active ? 'เปิดใช้ — แสดงในหน้าส่งออก' : 'ปิดอยู่ — ไม่แสดงในหน้าส่งออก'}</span>
        </label>
      </div>
      <div class="field">
        <label for="f-date">รูปแบบวันที่</label>
        <select id="f-date" data-k="dateFormat" data-combobox>${opts(DATE_FORMATS, draft.dateFormat)}</select>
      </div>
      <div class="field">
        <label for="f-era">ปี</label>
        <select id="f-era" data-k="dateEra" data-combobox>${opts(DATE_ERA_LABEL, draft.dateEra)}</select>
      </div>
      <div class="field">
        <label for="f-in">เครื่องหมาย “เข้าใหม่”</label>
        <input class="input" id="f-in" data-k="inMark" value="${draft.inMark}" maxlength="5" />
      </div>
      <div class="field">
        <label for="f-out">เครื่องหมาย “ลาออก”</label>
        <input class="input" id="f-out" data-k="outMark" value="${draft.outMark}" maxlength="5" />
      </div>
      <div class="field span-2">
        <label for="f-file">ชื่อไฟล์</label>
        <input class="input" id="f-file" data-k="fileName" value="${draft.fileName}" data-text />
        <span class="hint">ใช้ตัวแปรได้ เช่น {insurer} {cycleDate} · นามสกุล .xlsx เติมให้เอง</span>
      </div>
      <div class="field">
        <label for="f-sheet">ชื่อชีตของแต่ละบริษัท</label>
        <input class="input" id="f-sheet" data-k="sheetName" value="${draft.sheetName}" data-text />
      </div>
      <div class="field">
        <span class="label">ตัวเลือกไฟล์</span>
        <label class="check"><input type="checkbox" data-k="summarySheet" ${draft.summarySheet ? 'checked' : ''} /> มีชีต “สรุป” (จำนวนต่อบริษัท)</label>
        <label class="check"><input type="checkbox" data-k="includeEmptySheets" ${draft.includeEmptySheets ? 'checked' : ''} /> สร้างชีตแม้บริษัทนั้นไม่มีรายการ</label>
      </div>
      <div class="field span-2 ${draft.summarySheet ? '' : 'hidden'}" id="summary-title">
        <label for="f-sum">หัวชีตสรุป</label>
        <input class="input" id="f-sum" data-k="summaryTitle" value="${draft.summaryTitle}" data-text />
      </div>
    </div>
  </div>`;
}

function companiesSection() {
  const byCode = new Map(draft.companies.map((c) => [c.companyCode, c]));
  return html`<div class="form-section" id="sec-companies">
    <div>
      <h3>บริษัทในเครือ & กรมธรรม์</h3>
      <p>ติ๊กบริษัทที่ส่งแจ้งกับบริษัทประกันนี้ — 1 บริษัทผูกกับแบบฟอร์มที่เปิดใช้ได้ 1 แบบ</p>
    </div>
    <div>
      ${errors.companies ? alertBox({ tone: 'danger', title: errors.companies }) : ''}
      <div class="ins-table co-table" role="table" aria-label="บริษัทในเครือ">
        <div class="ins-th" role="row"><span></span><span>บริษัท</span><span>ชื่อผู้ถือกรมธรรม์ (หัวเอกสาร)</span><span>เลขที่กรมธรรม์</span><span>แผนประกัน</span></div>
        ${COMPANY_CODES.map((code) => {
          const c = byCode.get(code);
          const other = usedBy(code);
          return html`<div class="ins-tr${c ? '' : ' off'}" role="row">
            <span><input type="checkbox" data-co-include="${code}" ${c ? 'checked' : ''} aria-label="ใช้กับบริษัท ${code}" /></span>
            <span class="co-code"><b>${code}</b>${other ? html`<small class="warn">ใช้กับ ${other.shortName}</small>` : ''}</span>
            <span><input class="input" data-k="co:${code}:holderName" value="${c?.holderName ?? ''}" ${c ? '' : 'disabled'} aria-label="ชื่อผู้ถือกรมธรรม์ ${code}" data-text /></span>
            <span><input class="input" data-k="co:${code}:policyNo" value="${c?.policyNo ?? ''}" ${c ? '' : 'disabled'} placeholder="เช่น จี3-8001" aria-label="เลขที่กรมธรรม์ ${code}" /></span>
            <span><input class="input" data-k="co:${code}:plan" value="${c?.plan ?? ''}" ${c ? '' : 'disabled'} placeholder="1" aria-label="แผนประกัน ${code}" /></span>
          </div>`;
        })}
      </div>
    </div>
  </div>`;
}

function columnsSection() {
  const n = draft.columns.length;
  return html`<div class="form-section" id="sec-columns">
    <div>
      <h3>คอลัมน์ในตาราง</h3>
      <p>เรียงซ้าย → ขวาตามไฟล์ · “กลุ่ม” ใช้ทำหัวตาราง 2 ชั้น เช่น <code>ประกันชีวิตกลุ่ม &gt; เข้าใหม่</code> — คอลัมน์ที่อยู่ติดกันและกลุ่มเดียวกันจะ merge ให้เอง</p>
    </div>
    <div>
      ${errors.columns ? alertBox({ tone: 'danger', title: errors.columns }) : ''}
      <div class="ins-table col-table" role="table" aria-label="คอลัมน์">
        <div class="ins-th" role="row"><span>คอลัมน์</span><span>หัวคอลัมน์ (ขึ้นบรรทัดใหม่ได้)</span><span>ข้อมูล</span><span>กลุ่ม</span><span>แสดงใน</span><span>กว้าง</span><span></span></div>
        ${draft.columns.map(
          (c, i) => html`<div class="ins-tr" role="row" data-col-row="${i}">
            <span class="col-letter num">${colLetter(i)}</span>
            <span data-label="หัวคอลัมน์"><textarea class="input" rows="2" data-k="columns:${i}:header" aria-label="หัวคอลัมน์ ${colLetter(i)}" data-text>${c.header}</textarea></span>
            <span class="col-src" data-label="ข้อมูล">
              <select data-k="columns:${i}:source" data-combobox data-size="sm" aria-label="ข้อมูลคอลัมน์ ${colLetter(i)}">${opts(Object.fromEntries(Object.entries(COLUMN_SOURCES).map(([k, v]) => [k, v.label])), c.source)}</select>
              ${c.source === 'text' ? html`<input class="input" data-k="columns:${i}:text" value="${c.text ?? ''}" placeholder="ข้อความที่จะแสดงทุกแถว" aria-label="ข้อความคงที่" />` : ''}
            </span>
            <span data-label="กลุ่ม (หัวตาราง 2 ชั้น)"><input class="input" data-k="columns:${i}:group" value="${c.group ?? ''}" placeholder="—" aria-label="กลุ่มของคอลัมน์ ${colLetter(i)}" data-text /></span>
            <span data-label="แสดงในแถว"><select data-k="columns:${i}:only" data-combobox data-size="sm" aria-label="แสดงในแถว">${opts(ROW_SCOPE_LABEL, c.only ?? '')}</select></span>
            <span data-label="ความกว้าง"><input class="input num" type="number" min="3" max="80" data-k="columns:${i}:width" value="${c.width}" aria-label="ความกว้างคอลัมน์ ${colLetter(i)}" /></span>
            <span class="row-actions">
              <button type="button" class="btn-icon sm" data-col-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="เลื่อนขึ้น" title="เลื่อนไปซ้าย">${raw(icon('arrow-up'))}</button>
              <button type="button" class="btn-icon sm" data-col-act="down" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="เลื่อนลง" title="เลื่อนไปขวา">${raw(icon('arrow-down'))}</button>
              <button type="button" class="btn-icon sm danger-text" data-col-act="del" data-i="${i}" aria-label="ลบคอลัมน์ ${colLetter(i)}" title="ลบ">${raw(icon('trash-2'))}</button>
            </span>
          </div>`,
        )}
      </div>
      <button type="button" class="btn btn-sm add-row" data-col-act="add">${raw(icon('plus'))} เพิ่มคอลัมน์</button>
    </div>
  </div>`;
}

function headerSection() {
  return html`<div class="form-section" id="sec-header">
    <div>
      <h3>หัวเอกสาร</h3>
      <p>บรรทัดเหนือตาราง (merge เต็มความกว้าง) · ใส่ตัวแปรได้ เช่น {companyName} {policyNo} {month}</p>
    </div>
    <div>
      <div class="ins-lines">
        ${draft.headerLines.map(
          (l, i) => html`<div class="ins-line">
            <input class="input grow" data-k="headerLines:${i}:text" value="${l.text}" aria-label="หัวเอกสารบรรทัด ${i + 1}" data-text />
            <select data-k="headerLines:${i}:align" data-combobox data-size="sm" aria-label="จัดตำแหน่ง">${opts({ left: 'ชิดซ้าย', center: 'กึ่งกลาง' }, l.align)}</select>
            <label class="check"><input type="checkbox" data-k="headerLines:${i}:bold" ${l.bold ? 'checked' : ''} /> ตัวหนา</label>
            <input class="input num size" type="number" min="8" max="24" data-k="headerLines:${i}:size" value="${l.size}" aria-label="ขนาดตัวอักษร" title="ขนาดตัวอักษร" />
            <button type="button" class="btn-icon sm danger-text" data-line-del="${i}" aria-label="ลบบรรทัด ${i + 1}">${raw(icon('trash-2'))}</button>
          </div>`,
        )}
      </div>
      <button type="button" class="btn btn-sm add-row" data-line-add>${raw(icon('plus'))} เพิ่มบรรทัด</button>
    </div>
  </div>`;
}

function footerSection() {
  return html`<div class="form-section" id="sec-footer">
    <div>
      <h3>ท้ายเอกสาร & ผู้แจ้ง</h3>
      <p>ต่อจากตาราง: บรรทัดสรุปจำนวน แล้วตามด้วยข้อความท้ายเอกสาร (1 บรรทัดต่อ 1 แถวใน Excel)</p>
    </div>
    <div class="form-grid">
      <div class="field span-2">
        <label for="f-totals">บรรทัดสรุปจำนวน</label>
        <input class="input" id="f-totals" data-k="totalsLine" value="${draft.totalsLine}" placeholder="เว้นว่าง = ไม่แสดง" data-text />
      </div>
      <div class="field span-2">
        <label for="f-foot">ข้อความท้ายเอกสาร</label>
        <textarea class="input" id="f-foot" rows="6" data-k="footerLines" data-text>${draft.footerLines.join('\n')}</textarea>
      </div>
      <div class="field">
        <label for="f-sname">ชื่อผู้แจ้ง {signerName}</label>
        <input class="input" id="f-sname" data-k="signer.name" value="${draft.signer.name}" />
      </div>
      <div class="field">
        <label for="f-sphone">โทรศัพท์ {signerPhone}</label>
        <input class="input" id="f-sphone" data-k="signer.phone" value="${draft.signer.phone}" />
      </div>
      <div class="field span-2">
        <label for="f-sdept">แผนก / ฝ่าย {signerDept}</label>
        <input class="input" id="f-sdept" data-k="signer.department" value="${draft.signer.department}" />
      </div>
    </div>
  </div>`;
}

function placeholdersBar() {
  return html`<div class="ph-bar" aria-label="ตัวแปรที่ใช้ได้">
    <span class="muted small">แทรกตัวแปรในช่องที่เลือกล่าสุด:</span>
    ${Object.entries(PLACEHOLDERS).map(([k, label]) => html`<button type="button" class="chip" data-ph="${k}" title="${label}">${k}</button>`)}
  </div>`;
}

function drawEditor() {
  if (!draft) {
    render(editor, html`<div class="card">${emptyState({ iconName: 'file-spreadsheet', title: 'เลือกแบบฟอร์มทางซ้าย', description: 'หรือกด “เพิ่มแบบฟอร์ม”' })}</div>`);
    return;
  }
  const title = draft.shortName || draft.name || 'แบบฟอร์มใหม่';
  render(
    editor,
    html`<section class="card ins-card">
        <header class="card-head">
          <div class="card-title">
            <span class="card-icon">${raw(icon('file-spreadsheet'))}</span>
            <div>
              <h2>${title} ${draft.id ? '' : badge('ยังไม่บันทึก', 'warning')}</h2>
              <p>${draft.id ? `แก้ไขแล้วกด “บันทึก” — ไฟล์ที่ส่งออกหลังจากนี้จะใช้แบบใหม่` : 'กรอกข้อมูลแล้วกด “บันทึก”'}</p>
            </div>
          </div>
          <div class="row-actions">
            ${draft.id
              ? html`<button type="button" class="btn btn-ghost btn-sm" id="dup">${raw(icon('copy'))} ทำสำเนา</button>
                  <button type="button" class="btn btn-ghost btn-sm danger-text" id="del">${raw(icon('trash-2'))} ลบ</button>`
              : ''}
          </div>
        </header>
        <div class="card-body">
          ${placeholdersBar()} ${generalSection()} ${companiesSection()} ${columnsSection()} ${headerSection()} ${footerSection()}
          <div class="form-section" id="sec-preview">
            <div>
              <h3>ตัวอย่าง</h3>
              <p>ข้อมูลสมมติ 3 แถว (เข้า 2 · ออก 1) — อัปเดตทันทีที่แก้</p>
              <button type="button" class="btn btn-sm" id="sample">${raw(icon('download'))} ดาวน์โหลดไฟล์ตัวอย่าง</button>
            </div>
            <div class="xl-wrap">
              <div class="xl-tabs" id="preview-tabs" role="tablist"></div>
              <div class="xl-scroll" id="preview"></div>
            </div>
          </div>
        </div>
      </section>
      <div class="form-footer">
        <button type="button" class="btn btn-ghost" id="revert" ${dirty() ? '' : 'disabled'}>ยกเลิกการแก้ไข</button>
        <button type="submit" class="btn btn-primary" id="save" data-label="บันทึก">${raw(icon('save'))} บันทึก</button>
      </div>`,
  );
  enhanceSelects(editor);
  drawPreview();
}

// ---------- ตัวอย่าง (HTML) ----------
function sampleData() {
  const id = (n) => {
    const first12 = `11017002307${n}`.slice(0, 12);
    return first12 + thaiIdCheckDigit(first12);
  };
  const emp = (i, companyCode) => ({
    id: i,
    empCode: `${companyCode}0600${i}`,
    title: i === 2 ? 'นางสาว' : 'นาย',
    firstName: ['สมชาย', 'สุดา', 'วิชัย'][i - 1],
    lastName: 'ตัวอย่าง',
    gender: i === 2 ? 'F' : 'M',
    birthDate: '1990-04-15',
    nationalId: id(i),
    position: 'เจ้าหน้าที่',
    phone: '0812345678',
    email: '',
    salary: 18000,
    startDate: addDays(cycle, -40),
    companyCode,
    siteName: 'สำนักงานใหญ่',
    employeeType: 'CENTRAL',
  });
  const cos = draft.companies.length ? draft.companies : [{ companyCode: 'HL', policyNo: '', holderName: 'บริษัท ตัวอย่าง จำกัด', plan: '1' }];
  return {
    cycleDate: cycle,
    insurer: draft,
    missing: [],
    companies: cos.map((c, ci) => ({
      ...c,
      companyName: c.holderName || c.companyCode,
      in: ci === 0 ? [1, 2].map((i) => ({ type: 'IN', employee: emp(i, c.companyCode), effectiveDate: addDays(cycle, -8), reason: 'ครบอายุงาน 30 วัน' })) : [],
      out: ci === 0 ? [{ type: 'OUT', employee: emp(3, c.companyCode), effectiveDate: addDays(cycle, -20), reason: 'ลาออก' }] : [],
    })),
  };
}

/** โมเดลชีต → ตาราง HTML (rowspan/colspan ตาม merge) */
function sheetHtml(sheet) {
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
  const rows = [];
  for (let r = 0; r < nrow; r++) {
    const tds = [];
    for (let c = 0; c < ncol; c++) {
      const k = `${r},${c}`;
      if (covered.has(k)) continue;
      const cell = at.get(k);
      const sp = span.get(k);
      const cls = [cell?.s ?? 'blank', cell?.bold ? 'b' : '', cell?.align === 'center' ? 'center' : ''].join(' ');
      const style = cell?.size ? `font-size:${Math.round(cell.size * 0.9)}px` : '';
      tds.push(
        html`<td class="${cls}" ${sp?.rs > 1 ? raw(`rowspan="${sp.rs}"`) : ''} ${sp?.cs > 1 ? raw(`colspan="${sp.cs}"`) : ''} style="${style}">${raw(
          String(cell?.v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/\n/g, '<br>'),
        )}</td>`,
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
        ${sheet.widths.map((_, i) => html`<th class="xl-cl">${colLetter(i)}</th>`)}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

function previewModel() {
  return buildSheetModel(sampleData(), { exportDate: today });
}

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
    render(box, emptyState({ iconName: 'file-spreadsheet', title: 'ไม่มีชีต — เลือกบริษัทอย่างน้อย 1 บริษัท' }));
    $('#preview-tabs').innerHTML = '';
    return;
  }
  previewSheet = Math.min(previewSheet, model.sheets.length - 1);
  render(
    $('#preview-tabs'),
    html`${model.sheets.map((s, i) => html`<button type="button" class="xl-tab${i === previewSheet ? ' active' : ''}" role="tab" aria-selected="${i === previewSheet}" data-sheet="${i}">${s.name}</button>`)}
      <span class="muted small xl-file">${raw(icon('file-spreadsheet'))} ${model.fileName}.xlsx</span>`,
  );
  render(box, sheetHtml(model.sheets[previewSheet]));
}
const drawPreviewSoon = debounce(drawPreview, 150);

// ---------- แก้ค่าใน draft ----------
function setValue(k, el) {
  const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) || 0 : el.value;
  const parts = k.split(':');
  if (parts[0] === 'co') {
    const c = draft.companies.find((x) => x.companyCode === parts[1]);
    if (c) c[parts[2]] = v;
  } else if (parts.length === 3) {
    draft[parts[0]][Number(parts[1])][parts[2]] = v;
  } else if (k === 'footerLines') {
    draft.footerLines = String(v).split('\n');
  } else if (k.includes('.')) {
    const [a, b] = k.split('.');
    draft[a][b] = v;
  } else {
    draft[k] = v;
  }
}

function afterEdit() {
  $('#revert').disabled = !dirty();
  drawPreviewSoon();
}

editor.addEventListener('input', (e) => {
  const k = e.target.dataset?.k;
  if (!k || e.target.tagName === 'SELECT') return;
  setValue(k, e.target);
  if (k === 'shortName' || k === 'name') drawListSoon();
  afterEdit();
});
editor.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.coInclude) {
    const code = t.dataset.coInclude;
    if (t.checked) {
      draft.companies.push(coCache.get(code) ?? { companyCode: code, policyNo: '', holderName: '', plan: '1' });
      draft.companies.sort((a, b) => COMPANY_CODES.indexOf(a.companyCode) - COMPANY_CODES.indexOf(b.companyCode));
    } else {
      coCache.set(code, draft.companies.find((c) => c.companyCode === code));
      draft.companies = draft.companies.filter((c) => c.companyCode !== code);
    }
    redraw('#sec-companies', companiesSection);
    afterEdit();
    return;
  }
  const k = t.dataset?.k;
  if (!k) return;
  setValue(k, t);
  if (k === 'summarySheet') $('#summary-title').classList.toggle('hidden', !t.checked);
  if (/^columns:\d+:source$/.test(k)) {
    // ใส่หัวคอลัมน์ให้ถ้ายังว่าง + แสดงช่อง "ข้อความคงที่"
    const i = Number(k.split(':')[1]);
    if (!draft.columns[i].header.trim()) draft.columns[i].header = COLUMN_SOURCES[t.value].label;
    redraw('#sec-columns', columnsSection);
  }
  afterEdit();
});
editor.addEventListener('focusin', (e) => {
  if (e.target.matches('[data-text]')) lastField = e.target;
});

/** วาดใหม่เฉพาะ section (ปุ่มเพิ่ม/ลบ/เลื่อน) โดยไม่เสียตำแหน่งเลื่อน */
function redraw(sel, fn) {
  const el = editor.querySelector(sel);
  const tmp = document.createElement('div');
  tmp.innerHTML = String(fn());
  const next = tmp.firstElementChild;
  el.replaceWith(next);
  enhanceSelects(next);
}

on(editor, 'click', '[data-col-act]', (_e, btn) => {
  const i = Number(btn.dataset.i);
  const cols = draft.columns;
  const act = btn.dataset.colAct;
  if (act === 'add') cols.push({ source: 'blank', header: '', group: '', width: 12, only: '' });
  if (act === 'del') cols.splice(i, 1);
  if (act === 'up' && i > 0) [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]];
  if (act === 'down' && i < cols.length - 1) [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]];
  redraw('#sec-columns', columnsSection);
  if (act === 'add') editor.querySelector(`[data-k="columns:${cols.length - 1}:header"]`)?.focus();
  afterEdit();
});
on(editor, 'click', '[data-line-add]', () => {
  draft.headerLines.push({ text: '', align: 'left', bold: false, size: 11 });
  redraw('#sec-header', headerSection);
  editor.querySelector(`[data-k="headerLines:${draft.headerLines.length - 1}:text"]`)?.focus();
  afterEdit();
});
on(editor, 'click', '[data-line-del]', (_e, btn) => {
  draft.headerLines.splice(Number(btn.dataset.lineDel), 1);
  redraw('#sec-header', headerSection);
  afterEdit();
});
on(editor, 'click', '[data-toggle="active"]', (_e, btn) => {
  draft.active = !draft.active;
  btn.setAttribute('aria-checked', String(draft.active));
  btn.nextElementSibling.textContent = draft.active ? 'เปิดใช้ — แสดงในหน้าส่งออก' : 'ปิดอยู่ — ไม่แสดงในหน้าส่งออก';
  redraw('#sec-companies', companiesSection);
  afterEdit();
});
on(editor, 'click', '[data-ph]', (_e, chip) => {
  const el = lastField && editor.contains(lastField) ? lastField : editor.querySelector('#f-totals');
  const s = el.selectionStart ?? el.value.length;
  el.value = el.value.slice(0, s) + chip.dataset.ph + el.value.slice(el.selectionEnd ?? s);
  el.focus();
  el.setSelectionRange(s + chip.dataset.ph.length, s + chip.dataset.ph.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
on(editor, 'click', '[data-sheet]', (_e, b) => {
  previewSheet = Number(b.dataset.sheet);
  drawPreview();
});
on(editor, 'click', '#sample', async (_e, btn) => {
  btn.disabled = true;
  try {
    const model = previewModel();
    downloadBlob(await sheetModelToXlsx(model), `ตัวอย่าง-${model.fileName}.xlsx`);
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    btn.disabled = false;
  }
});
on(editor, 'click', '#revert', () => open(draft.id || null, { force: true }));
on(editor, 'click', '#dup', () =>
  guard(() => {
    const copy = { ...clone(draft), id: 0, name: `${draft.name} (สำเนา)`, shortName: `${draft.shortName} (สำเนา)`, active: false };
    start(copy, '');
  }),
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
  errors = validateInsurerForm(draft, forms);
  if (Object.keys(errors).length) {
    drawEditor();
    toast.error(Object.values(errors)[0]);
    editor.querySelector('[aria-invalid="true"], .alert')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  const btn = $('#save');
  btn.disabled = true;
  btn.innerHTML = `${icon('loader-2', 'spin')} บันทึก`;
  try {
    const saved = await api.saveInsurer(draft);
    toast.success(`บันทึกแบบฟอร์ม ${saved.shortName} แล้ว`);
    await loadForms();
    open(saved.id, { force: true });
  } catch (err) {
    errors = err.details ?? {};
    toast.error(errorMessage(err));
    drawEditor();
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

function start(f, orig) {
  draft = f;
  original = orig;
  errors = {};
  coCache.clear();
  previewSheet = f.summarySheet ? 1 : 0;
  setParams({ id: f.id || 'new' });
  drawList();
  drawEditor();
}

function open(id, { force = false } = {}) {
  const go = () => {
    const f = forms.find((x) => x.id === id);
    if (!f) {
      draft = null;
      setParams({ id: '' });
      drawList();
      drawEditor();
      return;
    }
    start(clone(f), JSON.stringify(f));
  };
  force ? go() : guard(go);
}

const drawListSoon = debounce(drawList, 200);
on($('#list'), 'click', '[data-open]', (_e, b) => open(Number(b.dataset.open)));
$('#add').onclick = () => guard(() => start(blankInsurerForm(), ''));
window.addEventListener('beforeunload', (e) => {
  if (dirty()) e.preventDefault();
});

async function loadForms() {
  forms = await api.listInsurers();
}

render(editor, html`<div class="card">${skeletonLines(8)}</div>`);
try {
  await loadForms();
  const want = getParam('id');
  if (want === 'new') start(blankInsurerForm(), '');
  else open(Number(want) || forms[0]?.id || null, { force: true });
} catch (e) {
  render($('#page'), errorState(e));
}
