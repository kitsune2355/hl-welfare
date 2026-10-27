// หน้า: ตั้งค่าสวัสดิการ › สวัสดิการเพิ่มเติม (welfare-setup.html?edit=<รหัส> | ?new=1)
//   สร้าง / แก้ / เปิด-ปิดสวัสดิการที่ HR กำหนดเอง — แต่ละอันมีเมนูของตัวเองใน sidebar (app/shell.js)
//   ตัวแก้ = modal เดียว 4 ส่วน: ข้อมูลทั่วไป · รอบการให้ · เงื่อนไขผู้มีสิทธิ์ (หลายข้อ — ใช้ข้อแรกที่ตรง) · ช่องข้อมูลตอนบันทึกการให้
//   ตรวจด้วย domain/welfare.js ก่อนส่ง (เซิร์ฟเวอร์ตรวจซ้ำด้วยตัวคู่แฝด backend/domain/welfare.php)
//   ดู = rules.view · แก้ = welfare.manage
import { api } from '../app/api.js';
import { can } from '../app/auth.js';
import { refreshCatalog } from '../app/catalog.js';
import { initPage, refreshCounts } from '../app/shell.js';
import { companyList, employeeTypeList, typeInfo } from '../domain/catalog.js';
import { WELFARE_FREQUENCIES, normalizeWelfareProgram, validateWelfareProgram } from '../domain/welfare.js';
import { $, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { DEPT_GROUPS } from '../shared/labels.js';
import { badge, emptyState, errorState, switchButton } from '../ui/components.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';
import { DataTable } from '../ui/table.js';
import { aboutBox, wireAbout } from './_settingsAbout.js';
import { revealActiveTab, settingsTab, settingsTabs, wireSettingsTabs } from './_settingsTabs.js';
import { FIELD_TYPE_LABEL, FREQUENCY_HINT, FREQUENCY_LABEL, WAIT_FROM_LABEL, ruleSummary, showErrors } from './_welfareShared.js';

initPage('welfare-setup', { tour: 'welfare-setup' });

const TAB = 'programs';
const canEdit = can('welfare.manage');
/** ไอคอนที่เลือกได้ (ต้องมีใน shared/icons.js) */
const WELFARE_ICONS = ['gift', 'heart-pulse', 'stethoscope', 'baby', 'graduation-cap', 'cake', 'home', 'bus', 'utensils', 'flower', 'hand-coins', 'wallet', 'sparkles', 'badge-check', 'shield-plus', 'shirt'];

let programs = [];
/** กลุ่ม / ฝ่าย ให้เลือกในเงื่อนไข — ยังไม่ได้รัน sql/014 = รายการตั้งต้นในโค้ด */
let groups = [];

// ===================== แถบแท็บ + คำอธิบาย =====================
function drawChrome() {
  render($('#tabs'), settingsTabs(TAB));
  revealActiveTab($('#tabs'));
  render($('#about'), aboutBox(TAB));
  $('#tab-hint').textContent = settingsTab(TAB).hint;
  $('#add').classList.toggle('hidden', !canEdit);
}
wireSettingsTabs($('#tabs'), 'welfare-setup', () => {});
wireAbout($('#about'), () => render($('#about'), aboutBox(TAB)));

// ===================== รายการสวัสดิการ =====================
const typeName = (c) => typeInfo(c)?.name ?? c;
const table = new DataTable($('#content'), {
  rowKey: (p) => p.id,
  pageSize: 25,
  selectable: false,
  rowClass: (p) => (p.active ? '' : 'is-off'),
  onRowDblClick: (p) => openEditor(p),
  columns: [
    {
      key: 'name',
      header: 'สวัสดิการ',
      mobile: 'title',
      text: (p) => p.name,
      cell: (p) => html`<span class="row" style="gap:10px;min-width:0">
        <span class="card-icon">${raw(icon(icon(p.icon) ? p.icon : 'gift'))}</span>
        <span class="two-line" style="min-width:0"
          ><a href="welfare.html?id=${p.id}"><b style="font-weight:500">${p.name}</b></a><span class="sub truncate" style="max-width:320px">${p.description}</span></span
        >
      </span>`,
    },
    { key: 'freq', header: 'รอบการให้', text: (p) => FREQUENCY_LABEL[p.frequency], cell: (p) => FREQUENCY_LABEL[p.frequency] },
    {
      key: 'rules',
      header: 'เงื่อนไขผู้มีสิทธิ์',
      hideOnMobile: true,
      text: (p) => `${p.rules.length} ข้อ`,
      cell: (p) => html`<span class="two-line"
        ><span>${p.rules.length} ข้อ</span><span class="sub truncate" style="max-width:360px">${p.rules[0] ? ruleSummary(p, p.rules[0], { typeName }) : ''}</span></span
      >`,
    },
    { key: 'fields', header: 'ช่องข้อมูล', hideOnMobile: true, align: 'right', text: (p) => String(p.fields.length), cell: (p) => html`<span class="num">${p.fields.length}</span>` },
    {
      key: 'active',
      header: 'ใช้งาน',
      text: (p) => (p.active ? 'เปิด' : 'ปิด'),
      cell: (p) =>
        canEdit
          ? switchButton({ checked: p.active, label: `${p.active ? 'ปิด' : 'เปิด'}ใช้งาน ${p.name}`, attrs: `data-toggle="${p.id}"` })
          : badge(p.active ? 'เปิด' : 'ปิด', p.active ? 'success' : 'neutral'),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      cell: (p) =>
        html`<button class="btn btn-sm" data-edit="${p.id}">${raw(icon(canEdit ? 'pencil' : 'eye'))} ${canEdit ? 'แก้ไข' : 'ดู'}</button>`,
    },
  ],
  empty: emptyState({
    iconName: 'gift',
    title: 'ยังไม่มีสวัสดิการเพิ่มเติม',
    description: 'สร้างสวัสดิการใหม่ได้เอง เช่น ค่าคลอดบุตร ทุนการศึกษา ตรวจสุขภาพประจำปี — แต่ละอันจะมีเมนูของตัวเองใน sidebar',
    action: canEdit ? html`<button class="btn btn-primary" data-new>${raw(icon('plus'))} สร้างสวัสดิการใหม่</button>` : '',
  }),
});

async function load() {
  try {
    const [list, g] = await Promise.all([api.listWelfarePrograms(), api.listDeptGroups().catch(() => DEPT_GROUPS.map((name) => ({ name, active: true })))]);
    programs = list;
    groups = g.filter((x) => x.active !== false).map((x) => x.name);
    table.setRows(programs);
  } catch (e) {
    render($('#content'), html`<div style="padding:16px">${errorState(e)}</div>`);
  }
}

// ===================== ตัวแก้ =====================
const blankRule = () => ({ id: 0, label: '', companies: null, employeeTypes: null, deptGroups: null, positions: null, genders: null, levelMin: null, levelMax: null, waitDays: 0, amount: null, note: '' });
const blankField = () => ({ key: '', label: '', type: 'text', options: [], required: false });
const blankProgram = () => ({ id: null, name: '', icon: 'gift', description: '', active: true, frequency: 'YEARLY', waitFrom: 'START', unit: 'บาท', rules: [blankRule()], fields: [] });

/** ตัวเลือกแบบชิป — selected null = ทุกค่า (ติ๊ก "ทั้งหมด") */
function chipPicks(name, options, selected, allLabel) {
  const isAll = selected === null;
  return html`<div class="chip-picks" role="group">
    <label class="chip-pick all"><input type="checkbox" data-all="${name}" ${isAll ? raw('checked') : ''} /> ${allLabel}</label>
    ${options.map(
      (o) =>
        html`<label class="chip-pick"><input type="checkbox" data-pick="${name}" value="${o.value}" ${!isAll && selected.includes(o.value) ? raw('checked') : ''} ${isAll ? raw('disabled') : ''} /> ${o.label}</label>`,
    )}
  </div>`;
}
function readPicks(root, name) {
  if (root.querySelector(`[data-all="${name}"]`)?.checked) return null;
  return [...root.querySelectorAll(`[data-pick="${name}"]:checked`)].map((i) => i.value);
}
const field = (name, label, input, { full = false, req = false, hint = '' } = {}) =>
  html`<div class="field${full ? ' full' : ''}" data-field="${name}">
    <label>${label}${req ? html`<span class="req">*</span>` : ''}</label>
    ${input}
    ${hint ? html`<span class="hint">${hint}</span>` : ''}
  </div>`;
const val = (v) => (v === null || v === undefined ? '' : v);

function ruleCard(d, r, i) {
  const k = `rules.${i}.`;
  const amountLabel = d.frequency === 'ANYTIME' ? 'วงเงินต่อปี' : 'จำนวนต่อรอบ';
  return html`<div class="welfare-rule" data-rule="${i}">
    <div class="welfare-rule-head">
      <span class="tab-step num">${i + 1}</span>
      <input class="input" data-r="label" value="${r.label}" maxlength="100" placeholder="ชื่อเงื่อนไข เช่น ระดับ 6 ขึ้นไป (ไม่บังคับ)" aria-label="ชื่อเงื่อนไขข้อ ${i + 1}" />
      <button type="button" class="btn-icon sm" data-move="${i}" data-dir="-1" title="เลื่อนขึ้น (ตรวจก่อน)" aria-label="เลื่อนขึ้น" ${i === 0 ? raw('disabled') : ''}>${raw(icon('arrow-up'))}</button>
      <button type="button" class="btn-icon sm" data-move="${i}" data-dir="1" title="เลื่อนลง" aria-label="เลื่อนลง" ${i === d.rules.length - 1 ? raw('disabled') : ''}>${raw(icon('arrow-down'))}</button>
      <button type="button" class="btn-icon sm danger" data-remove-rule="${i}" title="ลบเงื่อนไขนี้" aria-label="ลบเงื่อนไขนี้">${raw(icon('trash-2'))}</button>
    </div>
    <div class="rule-form">
      ${field(`${k}companies`, 'บริษัท', chipPicks('companies', companyList().filter((c) => c.active !== false || r.companies?.includes(c.code)).map((c) => ({ value: c.code, label: c.code })), r.companies, 'ทุกบริษัท'), { full: true })}
      ${field(`${k}employeeTypes`, 'ประเภทพนักงาน', chipPicks('types', employeeTypeList().filter((t) => t.active !== false || r.employeeTypes?.includes(t.code)).map((t) => ({ value: t.code, label: t.name })), r.employeeTypes, 'ทุกประเภท'), { full: true })}
      ${field(`${k}deptGroups`, 'กลุ่ม / ฝ่าย', chipPicks('groups', [...new Set([...groups, ...(r.deptGroups ?? [])])].map((g) => ({ value: g, label: g })), r.deptGroups, 'ทุกกลุ่ม (รวมคนที่ไม่มีกลุ่ม)'), { full: true })}
      ${field(`${k}genders`, 'เพศ', chipPicks('genders', [{ value: 'M', label: 'ชาย' }, { value: 'F', label: 'หญิง' }], r.genders, 'ทุกเพศ'))}
      ${field(`${k}positions`, 'ตำแหน่ง', html`<input class="input" data-r="positions" value="${(r.positions ?? []).join(', ')}" placeholder="ว่าง = ทุกตำแหน่ง" />`, { hint: 'หลายตำแหน่งคั่นด้วยจุลภาค (,) — ต้องตรงกับชื่อในข้อมูลพนักงาน' })}
      ${field(`${k}levelMin`, 'ระดับต่ำสุด', html`<input class="input num" type="number" min="1" max="20" data-r="levelMin" value="${val(r.levelMin)}" placeholder="ไม่จำกัด" />`)}
      ${field(`${k}levelMax`, 'ระดับสูงสุด', html`<input class="input num" type="number" min="1" max="20" data-r="levelMax" value="${val(r.levelMax)}" placeholder="ไม่จำกัด" />`)}
      ${field(`${k}waitDays`, 'ได้สิทธิ์เมื่อทำงานครบ (วัน)', html`<input class="input num" type="number" min="0" max="3650" data-r="waitDays" value="${val(r.waitDays)}" />`, {
        hint: `นับจาก${WAIT_FROM_LABEL[d.waitFrom]} · 0 = ได้ทันที`,
      })}
      ${field(`${k}amount`, `${amountLabel}${d.unit ? ` (${d.unit})` : ''}`, html`<input class="input num" type="number" min="0" step="any" data-r="amount" value="${val(r.amount)}" placeholder="ไม่กำหนด" />`, {
        hint: d.frequency === 'ANYTIME' ? 'ว่าง = เบิกได้ไม่จำกัด' : 'ค่าเริ่มต้นตอนบันทึกการให้ (แก้ได้ทีละครั้ง)',
      })}
      ${field(`${k}note`, 'หมายเหตุ', html`<input class="input" data-r="note" value="${r.note}" maxlength="500" placeholder="เช่น ตามประกาศ HR ฉบับที่ …" />`, { full: true })}
    </div>
  </div>`;
}

function fieldRow(f, i) {
  const k = `fields.${i}.`;
  return html`<div class="welfare-fieldrow" data-fieldrow="${i}">
    ${field(`${k}label`, 'ชื่อช่อง', html`<input class="input" data-f="label" value="${f.label}" maxlength="100" placeholder="เช่น เลขที่ใบเสร็จ" />`, { req: true })}
    ${field(`${k}type`, 'ชนิด', html`<select class="input" data-f="type">${Object.entries(FIELD_TYPE_LABEL).map(([v, l]) => html`<option value="${v}" ${v === f.type ? raw('selected') : ''}>${l}</option>`)}</select>`)}
    ${f.type === 'select'
      ? field(`${k}options`, 'ตัวเลือก', html`<input class="input" data-f="options" value="${f.options.join(', ')}" placeholder="คั่นด้วยจุลภาค เช่น โรงพยาบาล A, โรงพยาบาล B" />`, { req: true })
      : html`<span></span>`}
    <label class="chip-pick welfare-fieldrow-req"><input type="checkbox" data-f="required" ${f.required ? raw('checked') : ''} /> บังคับกรอก</label>
    <button type="button" class="btn-icon sm danger" data-remove-field="${i}" title="ลบช่องนี้" aria-label="ลบช่องนี้">${raw(icon('trash-2'))}</button>
  </div>`;
}

function editorBody(d) {
  return html`<fieldset class="welfare-editor" ${canEdit ? '' : raw('disabled')}>
    <section class="form-section">
      <div><h3>ข้อมูลทั่วไป</h3><p>ชื่อนี้แสดงเป็นเมนูใน sidebar</p></div>
      <div class="rule-form">
        ${field('name', 'ชื่อสวัสดิการ', html`<input class="input" id="we-name" value="${d.name}" maxlength="100" placeholder="เช่น ค่าคลอดบุตร" />`, { full: true, req: true })}
        ${field('description', 'คำอธิบาย', html`<input class="input" id="we-desc" value="${d.description}" maxlength="500" placeholder="แสดงใต้ชื่อในหน้าสวัสดิการ" />`, { full: true })}
        ${field(
          'icon',
          'ไอคอนเมนู',
          html`<div class="icon-picks" role="radiogroup" aria-label="ไอคอนเมนู">
            ${WELFARE_ICONS.map(
              (n) => html`<label class="icon-pick" title="${n}"><input type="radio" name="we-icon" value="${n}" ${n === d.icon ? raw('checked') : ''} />${raw(icon(n))}</label>`,
            )}
          </div>`,
          { full: true },
        )}
        <label class="chip-pick" style="align-self:flex-start"><input type="checkbox" id="we-active" ${d.active ? raw('checked') : ''} /> เปิดใช้งาน (แสดงเมนู + คำนวณสิทธิ์)</label>
      </div>
    </section>
    <section class="form-section">
      <div><h3>รอบการให้สิทธิ์</h3><p>ให้บ่อยแค่ไหน และเริ่มนับวันรอจากวันไหน</p></div>
      <div class="rule-form">
        ${field(
          'frequency',
          'รอบการให้',
          html`<div class="welfare-freqs" role="radiogroup">
            ${WELFARE_FREQUENCIES.map(
              (f) => html`<label class="welfare-freq"><input type="radio" name="we-freq" value="${f}" ${f === d.frequency ? raw('checked') : ''} />
                <span><b>${FREQUENCY_LABEL[f]}</b><small class="muted">${FREQUENCY_HINT[f]}</small></span></label>`,
            )}
          </div>`,
          { full: true, req: true },
        )}
        ${field('waitFrom', 'เริ่มนับวันรอจาก', html`<select class="input" id="we-wait">${Object.entries(WAIT_FROM_LABEL).map(([v, l]) => html`<option value="${v}" ${v === d.waitFrom ? raw('selected') : ''}>${l}</option>`)}</select>`, {
          hint: 'วันเริ่มงาน = รวมการโอนย้ายแบบ “นับวันรอใหม่” (นับจากวันที่ย้าย)',
        })}
        ${field('unit', 'หน่วยของจำนวน', html`<input class="input" id="we-unit" value="${d.unit}" maxlength="20" placeholder="เช่น บาท / วัน / ชิ้น" />`, { hint: 'ว่าง = ไม่บันทึกจำนวน (ให้เป็นของ / สิทธิ์อย่างเดียว)' })}
      </div>
    </section>
    <section class="form-section">
      <div>
        <h3>เงื่อนไขผู้มีสิทธิ์</h3>
        <p>ระบบตรวจทีละข้อจากบนลงล่าง ใช้ข้อแรกที่ตรง — เรียงข้อเฉพาะ (เช่น ระดับสูง) ไว้ก่อนข้อทั่วไป</p>
      </div>
      <div class="welfare-rules" data-field="rules">
        ${d.rules.map((r, i) => ruleCard(d, r, i))}
        <button type="button" class="btn btn-sm" data-add-rule>${raw(icon('plus'))} เพิ่มเงื่อนไข</button>
      </div>
    </section>
    <section class="form-section">
      <div>
        <h3>ช่องข้อมูลตอนบันทึกการให้</h3>
        <p>สิ่งที่ต้องกรอกเพิ่มทุกครั้งที่ให้ เช่น เลขที่ใบเสร็จ ชื่อบุตร โรงพยาบาล (นอกจาก วันที่ / จำนวน / หมายเหตุ ที่มีอยู่แล้ว)</p>
      </div>
      <div class="welfare-fields" data-field="fields">
        ${d.fields.length ? d.fields.map(fieldRow) : html`<p class="small muted">ยังไม่มีช่องเพิ่ม</p>`}
        <button type="button" class="btn btn-sm" data-add-field>${raw(icon('plus'))} เพิ่มช่องข้อมูล</button>
      </div>
    </section>
  </fieldset>`;
}

const splitList = (s) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** ค่าในฟอร์ม → draft (เรียกก่อนวาดใหม่ทุกครั้ง ไม่ให้ค่าที่พิมพ์หาย) */
function readEditor(root, d) {
  const q = (s) => root.querySelector(s);
  d.name = q('#we-name').value;
  d.description = q('#we-desc').value;
  d.icon = q('[name="we-icon"]:checked')?.value ?? d.icon;
  d.active = q('#we-active').checked;
  d.frequency = q('[name="we-freq"]:checked')?.value ?? d.frequency;
  d.waitFrom = q('#we-wait').value;
  d.unit = q('#we-unit').value.trim();
  d.rules = [...root.querySelectorAll('[data-rule]')].map((el, i) => {
    const r = (n) => el.querySelector(`[data-r="${n}"]`).value.trim();
    const positions = splitList(r('positions'));
    return {
      id: d.rules[i].id,
      label: r('label'),
      companies: readPicks(el, 'companies'),
      employeeTypes: readPicks(el, 'types'),
      deptGroups: readPicks(el, 'groups'),
      genders: readPicks(el, 'genders'),
      positions: positions.length ? positions : null,
      levelMin: r('levelMin'),
      levelMax: r('levelMax'),
      waitDays: r('waitDays'),
      amount: r('amount'),
      note: r('note'),
    };
  });
  d.fields = [...root.querySelectorAll('[data-fieldrow]')].map((el, i) => {
    const f = (n) => el.querySelector(`[data-f="${n}"]`);
    return { key: d.fields[i].key, label: f('label').value.trim(), type: f('type').value, options: f('options') ? splitList(f('options').value) : d.fields[i].options, required: f('required').checked };
  });
  return d;
}

/** เลือก "ทั้งหมด" ไม่ได้คู่กับรายการ → ติ๊กทั้งหมดแล้วรายการถูกปิด · ทุกรายการว่าง = ติ๊กทั้งหมดกลับ */
function wireChipPicks(root) {
  root.addEventListener('change', (e) => {
    const all = e.target.closest('[data-all]');
    if (!all) return;
    all.closest('.chip-picks').querySelectorAll('[data-pick]').forEach((i) => (i.disabled = all.checked));
  });
}

function openEditor(existing) {
  const draft = structuredClone(existing ?? blankProgram());
  const title = existing ? `${canEdit ? 'แก้ไข' : 'ดู'}สวัสดิการ: ${existing.name}` : 'สร้างสวัสดิการใหม่';
  const m = openModal({
    size: 'lg',
    title,
    description: canEdit ? 'แก้แล้วมีผลทันทีกับการคำนวณสิทธิ์ — การให้ที่บันทึกไปแล้วไม่เปลี่ยน' : 'บัญชีนี้ดูได้อย่างเดียว (ต้องมีสิทธิ์ “สร้าง / แก้ไขสวัสดิการเพิ่มเติม”)',
    body: html`<div data-editor>${editorBody(draft)}</div>`,
    footer: canEdit
      ? html`${existing ? html`<a class="btn btn-ghost foot-start" href="welfare.html?id=${existing.id}">${raw(icon('external-link'))} เปิดหน้าสวัสดิการ</a>` : ''}
          <button class="btn btn-ghost" data-close>ยกเลิก</button>
          <button class="btn btn-primary" data-ok data-label="${existing ? 'บันทึก' : 'สร้างสวัสดิการ'}">${existing ? 'บันทึก' : 'สร้างสวัสดิการ'}</button>`
      : html`<button class="btn btn-primary" data-close>ปิด</button>`,
    onClose: () => setParams({ edit: '', new: '' }),
  });
  const box = m.el.querySelector('[data-editor]');
  const redraw = () => {
    readEditor(box, draft);
    render(box, editorBody(draft));
  };
  wireChipPicks(box);
  if (!canEdit) return;
  // วาดใหม่เมื่อเปลี่ยนสิ่งที่มีผลต่อป้าย / ช่อง (รอบการให้ หน่วย วันเริ่มนับ ชนิดช่อง)
  box.addEventListener('change', (e) => {
    if (e.target.matches('[name="we-freq"], #we-wait, #we-unit, [data-f="type"]')) redraw();
  });
  on(box, 'click', '[data-add-rule]', () => {
    readEditor(box, draft);
    draft.rules.push(blankRule());
    render(box, editorBody(draft));
    box.querySelector(`[data-rule="${draft.rules.length - 1}"] [data-r="label"]`)?.focus();
  });
  on(box, 'click', '[data-remove-rule]', (_e, b) => {
    readEditor(box, draft);
    draft.rules.splice(Number(b.dataset.removeRule), 1);
    render(box, editorBody(draft));
  });
  on(box, 'click', '[data-move]', (_e, b) => {
    readEditor(box, draft);
    const i = Number(b.dataset.move);
    const j = i + Number(b.dataset.dir);
    [draft.rules[i], draft.rules[j]] = [draft.rules[j], draft.rules[i]];
    render(box, editorBody(draft));
  });
  on(box, 'click', '[data-add-field]', () => {
    readEditor(box, draft);
    draft.fields.push(blankField());
    render(box, editorBody(draft));
    box.querySelector(`[data-fieldrow="${draft.fields.length - 1}"] [data-f="label"]`)?.focus();
  });
  on(box, 'click', '[data-remove-field]', (_e, b) => {
    readEditor(box, draft);
    draft.fields.splice(Number(b.dataset.removeField), 1);
    render(box, editorBody(draft));
  });
  const ok = m.el.querySelector('[data-ok]');
  ok.onclick = async () => {
    readEditor(box, draft);
    const p = normalizeWelfareProgram({ ...draft, id: existing?.id ?? null });
    const errs = validateWelfareProgram(p, programs);
    showErrors(box, errs);
    if (Object.keys(errs).length) return toast.error(Object.values(errs)[0]);
    m.busy(true, ok);
    try {
      const saved = await api.saveWelfareProgram(existing ? p : { ...p, id: undefined });
      toast.success(existing ? `บันทึก “${saved.name}” แล้ว` : `สร้าง “${saved.name}” แล้ว — เมนูใหม่อยู่ใน sidebar`);
      m.busy(false, ok);
      m.close();
      await afterSave();
    } catch (e) {
      m.busy(false, ok);
      if (e.details) showErrors(box, e.details);
      toast.error(errorMessage(e));
    }
  };
}

/** หลังบันทึก: รายการใหม่ + เมนูใน sidebar (refreshCatalog → CATALOG_EVENT) + ตัวนับ */
async function afterSave() {
  await load();
  await refreshCatalog().catch(() => {});
  refreshCounts();
}

// ----- events -----
$('#add').onclick = () => openEditor(null);
on($('#content'), 'click', '[data-new]', () => openEditor(null));
on($('#content'), 'click', '[data-edit]', (_e, b) => openEditor(programs.find((p) => p.id === Number(b.dataset.edit))));
on($('#content'), 'click', '[data-toggle]', async (_e, b) => {
  const p = programs.find((x) => x.id === Number(b.dataset.toggle));
  b.disabled = true;
  try {
    await api.saveWelfareProgram({ ...p, active: !p.active });
    toast.success(`${p.active ? 'ปิด' : 'เปิด'}ใช้งาน “${p.name}” แล้ว${p.active ? ' — ซ่อนจากเมนู' : ' — แสดงในเมนู'}`);
    await afterSave();
  } catch (e) {
    b.disabled = false;
    toast.error(errorMessage(e));
  }
});

drawChrome();
await load();
// ลิงก์จากหน้าสวัสดิการ (?edit=) / ปุ่มสร้างจากที่อื่น (?new=1)
const editId = Number(getParam('edit'));
if (editId && programs.some((p) => p.id === editId)) openEditor(programs.find((p) => p.id === editId));
else if (getParam('new') === '1' && canEdit) openEditor(null);
