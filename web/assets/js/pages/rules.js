// หน้า: เงื่อนไขสวัสดิการ (rules.html?tab=insurance|uniform|settings|pending)
// แก้กฎได้ผ่านหน้าจอ แบบมีวันที่มีผล — ทุกครั้งที่บันทึก = ฉบับใหม่ของกฎ (domain/ruleVersions.js)
import { api } from '../app/api.js';
import { can } from '../app/auth.js';
import { initPage } from '../app/shell.js';
import { startTourIfNew } from '../app/tour.js';
import { typeInfo } from '../domain/catalog.js';
import { OTHER_POSITION, UNIFORM_EVENTS } from '../domain/uniform.js';
import { CONTRACT_TYPES, EMPLOYEE_TYPES, LEVEL_RANGE, QTY_MAX, SETTING_SPEC, validateInsuranceRule, validateSettings, validateUniformRule } from '../application/ruleRules.js';
import { $, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { relativeDays, thaiDate, thaiDateLong } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { CONTRACT_LABEL, DEPT_GROUPS, EMPLOYEE_TYPE_LABEL, PRO_POSITIONS, UNIFORM_EVENT_LABEL, UNIFORM_ITEM_LABEL } from '../shared/labels.js';
import { alertBox, badge, emptyState, errorState, tabs } from '../ui/components.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';
import { DataTable } from '../ui/table.js';

/** คำแนะนำการใช้งานตามแท็บ (tour/steps.js) — อ่านจาก URL เพราะ tab ประกาศทีหลัง */
const tourId = () => ({ settings: 'rules-settings', pending: 'rules-pending' })[getParam('tab')] ?? 'rules';
initPage('rules', { tour: tourId });

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TABS = ['insurance', 'uniform', 'settings', 'pending'];
const KIND_LABEL = { insurance: 'กฎประกันกลุ่ม', uniform: 'กฎชุดฟอร์ม' };
const canEdit = can('rules.edit');

let tab = TABS.includes(getParam('tab')) ? getParam('tab') : 'insurance';
let hist = null; // { today, insurance, uniform, settings, uniformItems }
let companies = [];
/** กลุ่ม / ฝ่าย ให้เลือกในกฎชุดฟอร์ม (แก้ที่ sites.html?tab=groups) — ยังไม่ได้รัน sql/014 = รายการตั้งต้นในโค้ด */
let groups = [];
async function loadGroups() {
  try {
    groups = await api.listDeptGroups();
  } catch (e) {
    if (e.status !== 409) throw e;
    groups = DEPT_GROUPS.map((name, i) => ({ id: -(i + 1), name }));
  }
}
/** ตำแหน่งที่มีในข้อมูลพนักงาน — ตัวเลือกของช่องตำแหน่งในกฎชุดฟอร์ม (ไม่มีสิทธิ์ดูพนักงาน = ว่าง) */
let employeePositions = [];
let query = '';

// ===================== คำอธิบายกฎ =====================
const companiesText = (list) => (list === null ? 'ทุกบริษัท' : list.join(', '));
const itemName = (code, rule) => (rule?.poloBySite && code.startsWith('POLO') ? 'โปโล (สีตามหน่วยงาน)' : UNIFORM_ITEM_LABEL[code] ?? code);
function levelText(r) {
  if (r.levelMin === null && r.levelMax === null) return typeInfo(r.employeeType)?.usesDeptGroup ? 'ทุกระดับ' : '';
  if (r.levelMin !== null && r.levelMax !== null) return r.levelMin === r.levelMax ? `ระดับ ${r.levelMin}` : `ระดับ ${r.levelMin}–${r.levelMax}`;
  return r.levelMin !== null ? `ระดับ ${r.levelMin} ขึ้นไป` : `ไม่เกินระดับ ${r.levelMax}`;
}
function whoText(r) {
  const parts = [r.position ?? (r.deptGroups ? r.deptGroups.join(', ') : 'ทุกกลุ่ม/ฝ่าย'), levelText(r)].filter(Boolean);
  return parts.join(' · ');
}
/** "เริ่มงาน: เสื้อช่าง 2 · โปโล 1" ต่อรอบ */
function qtyLines(r) {
  const lines = UNIFORM_EVENTS.map((ev) => {
    const m = Object.entries(r.quantities?.[ev] ?? {}).filter(([, n]) => n > 0);
    return m.length ? html`<div class="qty-sum"><span class="ev">${UNIFORM_EVENT_LABEL[ev]}</span>${m.map(([c, n]) => html`<span>${itemName(c, r)} <b class="num">${n}</b></span>`)}</div>` : '';
  }).filter((x) => x !== '');
  return lines.length ? html`<div class="qty-lines">${lines}</div>` : html`<span class="muted">–</span>`;
}
const summary = (kind, r) =>
  kind === 'insurance'
    ? `${EMPLOYEE_TYPE_LABEL[r.employeeType]} · ${companiesText(r.companies)} · รอ ${r.waitDays} วัน`
    : `${EMPLOYEE_TYPE_LABEL[r.employeeType]} · ${r.companies.join(', ')} · ${whoText(r)} — ${r.style}`;

const sinceText = (d) => (d <= '2000-01-01' ? 'ตั้งแต่เริ่มระบบ' : thaiDate(d));
function pendingBadge(t) {
  if (!t.pending.length) return '';
  const p = t.pending[0];
  return badge(p.deleted ? `เลิกใช้ ${thaiDate(p.effectiveFrom)}` : `เปลี่ยน ${thaiDate(p.effectiveFrom)}`, 'warning');
}
const matches = (text) => !query || text.toLowerCase().includes(query.toLowerCase());

// ===================== ตารางกฎ =====================
function actionsCell(kind, t) {
  return html`<div class="row-actions">
    <button class="btn-icon sm" data-history="${kind}:${t.id}" title="ประวัติ / การเปลี่ยนที่รอมีผล" aria-label="ประวัติ">${raw(icon('history'))}</button>
    ${canEdit && t.current
      ? html`<button class="btn-icon sm" data-edit="${kind}:${t.id}" title="แก้กฎ" aria-label="แก้กฎ">${raw(icon('pencil'))}</button>
          <button class="btn-icon sm danger" data-retire="${kind}:${t.id}" title="เลิกใช้กฎ" aria-label="เลิกใช้กฎ">${raw(icon('ban'))}</button>`
      : ''}
  </div>`;
}

const insuranceColumns = [
  { key: 'id', header: '#', mobile: 'aside', cell: (t) => html`<span class="muted num">#${t.id}</span>` },
  {
    key: 'who',
    header: 'ประเภทพนักงาน · บริษัท',
    mobile: 'title',
    text: (t) => summary('insurance', t.current),
    cell: (t) => html`<span class="two-line"><b style="font-weight:500">${EMPLOYEE_TYPE_LABEL[t.current.employeeType]}</b><span class="sub">${companiesText(t.current.companies)}</span></span>`,
  },
  { key: 'wait', header: 'ครบสิทธิเมื่อทำงาน', align: 'right', sort: (t) => t.current.waitDays, cell: (t) => html`<span class="num">${t.current.waitDays} วัน</span>` },
  {
    key: 'cond',
    header: 'เงื่อนไขเพิ่ม',
    cell: (t) =>
      html`<span class="row wrap" style="gap:4px"
        >${t.current.excludeContracts.map((c) => badge(`ไม่รวม${CONTRACT_LABEL[c]}`, 'danger'))}
        ${t.current.requireSiteInsurance ? badge('เฉพาะหน่วยงานที่ได้รับ', 'warning') : ''}
        ${!t.current.excludeContracts.length && !t.current.requireSiteInsurance ? html`<span class="muted">–</span>` : ''}</span
      >`,
  },
  { key: 'since', header: 'มีผลตั้งแต่', hideOnMobile: true, sort: (t) => t.current.effectiveFrom, cell: (t) => html`<span class="two-line"><span class="num">${sinceText(t.current.effectiveFrom)}</span><span class="sub">${pendingBadge(t)}</span></span>` },
  { key: 'note', header: 'หมายเหตุ', hideOnMobile: true, cell: (t) => html`<span class="muted">${t.current.note || '–'}</span>` },
  { key: 'act', header: '', align: 'right', cell: (t) => actionsCell('insurance', t) },
];

const uniformColumns = [
  { key: 'id', header: '#', mobile: 'aside', cell: (t) => html`<span class="muted num">#${t.id}</span>` },
  {
    key: 'who',
    header: 'ใครได้',
    mobile: 'title',
    text: (t) => summary('uniform', t.current),
    cell: (t) =>
      html`<span class="two-line" style="max-width:280px"
        ><b style="font-weight:500">${EMPLOYEE_TYPE_LABEL[t.current.employeeType]} · ${t.current.companies.join(', ')}</b><span class="sub">${whoText(t.current)}</span></span
      >`,
  },
  { key: 'style', header: 'แบบ', cell: (t) => html`<span class="two-line"><span>${t.current.style}</span><span class="sub">${t.current.logo ? `โลโก้ ${t.current.logo}` : ''}</span></span>` },
  { key: 'qty', header: 'จำนวนต่อรอบ', cell: (t) => qtyLines(t.current) },
  { key: 'since', header: 'มีผลตั้งแต่', hideOnMobile: true, sort: (t) => t.current.effectiveFrom, cell: (t) => html`<span class="two-line"><span class="num">${sinceText(t.current.effectiveFrom)}</span><span class="sub">${pendingBadge(t)}</span></span>` },
  { key: 'act', header: '', align: 'right', cell: (t) => actionsCell('uniform', t) },
];

function drawRuleTable(kind) {
  const all = hist[kind].filter((t) => t.current);
  const retired = hist[kind].filter((t) => !t.current);
  const rows = all.filter((t) => matches(summary(kind, t.current) + ' ' + t.current.note + ` #${t.id}`));
  render(
    $('#content'),
    html`<div class="rules-toolbar">
        <div class="input-icon">
          ${raw(icon('search'))}
          <input class="input" type="search" id="q" placeholder="${kind === 'insurance' ? 'ค้นหาประเภท / บริษัท' : 'ค้นหาบริษัท / ตำแหน่ง / แบบ'}" value="${query}" aria-label="ค้นหากฎ" autocomplete="off" />
        </div>
        <span class="small muted">${rows.length} จาก ${all.length} กฎ${retired.length ? ` · เลิกใช้แล้ว ${retired.length}` : ''}</span>
        <span class="spacer"></span>
        ${retired.length ? html`<button class="btn btn-ghost btn-sm" data-retired="${kind}">${raw(icon('history'))} กฎที่เลิกใช้</button>` : ''}
      </div>
      <div id="rules-table" class="fill-body"></div>`,
  );
  new DataTable($('#rules-table'), {
    rowKey: (t) => t.id,
    rowNumbers: false,
    columns: kind === 'insurance' ? insuranceColumns : uniformColumns,
    exportName: kind === 'insurance' ? 'กฎประกันกลุ่ม' : 'กฎชุดฟอร์ม',
    // ดับเบิลคลิกแถว = แก้กฎ (ไม่มีสิทธิ์ = ดูประวัติ) — แก้ในตารางตรง ๆ ไม่ได้เพราะต้องเลือกวันที่มีผล
    onRowDblClick: (t) => (canEdit ? openRuleEditor(kind, t.id, structuredClone(t.current)) : openHistory(kind, t.id)),
    bulkActions: canEdit
      ? [{ id: 'retire', label: 'เลิกใช้ที่เลือก', icon: 'ban', tone: 'danger', run: (rows) => openRetire(kind, rows.map((t) => t.id)) }]
      : [],
    empty: emptyState({
      iconName: 'list-checks',
      title: query ? 'ไม่พบกฎที่ค้นหา' : 'ยังไม่มีกฎ',
      description: canEdit && !query ? 'กด “เพิ่มกฎ” ด้านบนเพื่อเริ่ม' : '',
    }),
  }).setRows(rows);
}

// ===================== ค่าตั้งค่า =====================
function settingRows(key) {
  return hist.settings.filter((s) => s.key === key).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}
function currentSetting(key) {
  return settingRows(key).find((s) => s.effectiveFrom <= hist.today)?.value;
}
function settingInput(key) {
  const [min, max, label, unit] = SETTING_SPEC[key];
  const v = currentSetting(key);
  const control =
    key === 'uniformAnnualMonth'
      ? html`<select class="input" id="set-${key}" data-set="${key}" ${canEdit ? '' : raw('disabled')}>
          ${MONTHS.map((m, i) => html`<option value="${i + 1}" ${i + 1 === Number(v) ? raw('selected') : ''}>${m}</option>`)}
        </select>`
      : html`<input class="input num" type="number" inputmode="numeric" min="${min}" max="${max}" id="set-${key}" data-set="${key}" value="${v}" ${canEdit ? '' : raw('disabled')} />`;
  return html`<div class="field" data-field="${key}">
    <label for="set-${key}">${label}</label>
    ${control}
    <span class="hint">${unit ? `${unit} · ` : ''}${min}–${max}</span>
  </div>`;
}
function drawSettings() {
  const pending = hist.settings.filter((s) => s.effectiveFrom > hist.today).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  render(
    $('#content'),
    html`<div class="fill-body scroll"><div class="panel-pad" style="display:grid;gap:20px">
      <div class="settings-form">${Object.keys(SETTING_SPEC).map(settingInput)}</div>
      ${canEdit
        ? html`<div class="effective-bar">
            ${effectiveField('settings-from')}
            <p class="hint small muted">ค่าใหม่ใช้ตั้งแต่วันที่นี้ — ก่อนหน้านั้นระบบยังใช้ค่าเดิม (เช่น ตั้งเดือนแจกชุดประจำปีของปีหน้าไว้ล่วงหน้าได้)</p>
            <button class="btn btn-primary" id="save-settings" data-label="บันทึกค่าตั้งค่า">${raw(icon('save'))} บันทึกค่าตั้งค่า</button>
          </div>`
        : ''}
      ${pending.length
        ? html`<div>
            <h3 style="font-size:15px;margin-bottom:8px">ค่าที่ตั้งไว้ล่วงหน้า</h3>
            <div class="rev-list">
              ${pending.map(
                (s) => html`<div class="rev-item pending">
                  <span class="when num">${thaiDate(s.effectiveFrom)}</span>
                  <span class="what"><span>${SETTING_SPEC[s.key]?.[2] ?? s.key} → <b>${settingValueText(s.key, s.value)}</b></span><span class="meta">${relativeDays(s.effectiveFrom, hist.today)} · โดย ${s.updatedBy ?? '–'}</span></span>
                  ${canEdit ? html`<button class="btn btn-ghost btn-sm danger-text" data-cancel-setting="${s.key}|${s.effectiveFrom}">ยกเลิก</button>` : html`<span></span>`}
                </div>`,
              )}
            </div>
          </div>`
        : ''}
      <p class="hint small muted">ประเภทพนักงาน และกลุ่ม / ฝ่าย ที่ใช้ในกฎ ตั้งได้ที่ <a href="sites.html?tab=types">ตั้งค่าองค์กร → ประเภทพนักงาน</a> · <a href="sites.html?tab=groups">กลุ่ม / ฝ่าย</a></p>
    </div></div>`,
  );
}
const settingValueText = (key, v) => (key === 'uniformAnnualMonth' ? MONTHS[Number(v) - 1] : `${v} ${SETTING_SPEC[key]?.[3] ?? ''}`);

// ===================== รอมีผล (ทุกเรื่องรวมกัน) =====================
function pendingItems() {
  const out = [];
  for (const kind of ['insurance', 'uniform']) {
    for (const t of hist[kind]) for (const p of t.pending) out.push({ kind, t, p, date: p.effectiveFrom });
  }
  for (const s of hist.settings) if (s.effectiveFrom > hist.today) out.push({ kind: 'settings', s, date: s.effectiveFrom });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function drawPending() {
  const items = pendingItems();
  render(
    $('#content'),
    items.length
      ? html`<div class="fill-body scroll"><div class="panel-pad rev-list">
          ${items.map((it) =>
            it.kind === 'settings'
              ? html`<div class="rev-item pending">
                  <span class="when num">${thaiDate(it.date)}</span>
                  <span class="what"><b style="font-weight:500">ค่าตั้งค่า</b><span>${SETTING_SPEC[it.s.key]?.[2] ?? it.s.key} → ${settingValueText(it.s.key, it.s.value)}</span><span class="meta">${relativeDays(it.date, hist.today)}</span></span>
                  ${canEdit ? html`<button class="btn btn-ghost btn-sm danger-text" data-cancel-setting="${it.s.key}|${it.s.effectiveFrom}">ยกเลิก</button>` : html`<span></span>`}
                </div>`
              : html`<div class="rev-item pending">
                  <span class="when num">${thaiDate(it.date)}</span>
                  <span class="what">
                    <b style="font-weight:500">${KIND_LABEL[it.kind]} #${it.t.id} ${it.p.deleted ? '— เลิกใช้' : it.t.current ? '— แก้ไข' : '— กฎใหม่'}</b>
                    <span>${summary(it.kind, it.p)}</span>
                    ${it.kind === 'uniform' && !it.p.deleted ? qtyLines(it.p) : ''}
                    <span class="meta">${relativeDays(it.date, hist.today)} · โดย ${it.p.updatedBy ?? '–'}</span>
                  </span>
                  ${canEdit
                    ? html`<span class="row" style="gap:4px">
                        ${it.p.deleted ? '' : html`<button class="btn btn-ghost btn-sm" data-edit-rev="${it.kind}:${it.t.id}:${it.p.revisionId}">แก้</button>`}
                        <button class="btn btn-ghost btn-sm danger-text" data-cancel-rev="${it.kind}:${it.p.revisionId}">ยกเลิก</button>
                      </span>`
                    : html`<span></span>`}
                </div>`,
          )}
        </div></div>`
      : html`<div class="fill-body scroll">${emptyState({ iconName: 'calendar-clock', title: 'ไม่มีการเปลี่ยนแปลงที่รอมีผล', description: 'แก้กฎแล้วเลือก “วันที่มีผล” เป็นวันข้างหน้า รายการจะมารออยู่ที่นี่' })}</div>`,
  );
}

// ===================== วาดหน้า =====================
function draw() {
  const pendingCount = pendingItems().length;
  render(
    $('#tabs'),
    tabs(
      [
        { value: 'insurance', label: 'ประกันกลุ่ม', count: hist.insurance.filter((t) => t.current).length },
        { value: 'uniform', label: 'ชุดฟอร์ม', count: hist.uniform.filter((t) => t.current).length },
        { value: 'settings', label: 'ค่าตั้งค่า' },
        { value: 'pending', label: 'รอมีผล', count: pendingCount, tone: pendingCount ? 'warning' : '' },
      ],
      tab,
    ),
  );
  // .btn ตั้ง display เอง แอตทริบิวต์ hidden จึงซ่อนไม่ได้ — ใช้ style แทน
  $('#add').style.display = canEdit && (tab === 'insurance' || tab === 'uniform') ? '' : 'none';
  $('#add-label').textContent = tab === 'uniform' ? 'เพิ่มกฎชุดฟอร์ม' : 'เพิ่มกฎประกันกลุ่ม';
  render(
    $('#notice'),
    canEdit ? '' : alertBox({ tone: 'info', body: 'ดูได้อย่างเดียว — บัญชีนี้ไม่มีสิทธิ์แก้เงื่อนไขสวัสดิการ (ผู้ดูแลระบบให้สิทธิ์ได้ที่หน้าผู้ดูแลระบบ)' }),
  );
  if (tab === 'insurance' || tab === 'uniform') drawRuleTable(tab);
  else if (tab === 'settings') drawSettings();
  else drawPending();
}

/** หลังบันทึก: API คืนประวัติชุดใหม่ → วาดใหม่ */
function applyHistory(h, message) {
  const { stockWarning, ...rest } = h;
  hist = rest;
  draw();
  if (message) toast.success(message);
  // กฎชุดฟอร์มเปลี่ยน → ระบบส่งชุดรอบเริ่มงานไปสต็อกเอง · ส่งไม่สำเร็จ = แจ้งให้กดส่งที่หน้าหน่วยงาน
  if (stockWarning) toast.error(stockWarning);
}

// ===================== ฟิลด์ที่ใช้ร่วมกัน =====================
function effectiveField(id, value = hist.today) {
  return html`<div class="field" data-field="effectiveFrom">
    <label for="${id}">วันที่มีผล<span class="req">*</span></label>
    <input class="input" type="date" id="${id}" value="${value}" />
  </div>`;
}
function effectiveHint(date) {
  if (!date) return '';
  if (date > hist.today) return html`<span class="hint">ใช้ตั้งแต่ ${thaiDateLong(date)} (${relativeDays(date, hist.today)}) — ก่อนหน้านั้นยังใช้ฉบับเดิม</span>`;
  if (date < hist.today) return html`<span class="hint">ย้อนหลัง — สิทธิที่คำนวณวันนี้ใช้ฉบับนี้ทันที แต่การแจ้ง/แจกที่ทำไปแล้วไม่เปลี่ยน</span>`;
  return html`<span class="hint">มีผลทันทีวันนี้</span>`;
}
function chipPicks(name, options, selected, { all = null } = {}) {
  const isAll = selected === null;
  return html`<div class="chip-picks" role="group">
    ${all ? html`<label class="chip-pick all"><input type="checkbox" data-all="${name}" ${isAll ? raw('checked') : ''} /> ${all}</label>` : ''}
    ${options.map(
      (o) => html`<label class="chip-pick"><input type="checkbox" data-pick="${name}" value="${o.value}" ${!isAll && selected.includes(o.value) ? raw('checked') : ''} ${isAll ? raw('disabled') : ''} /> ${o.label}</label>`,
    )}
  </div>`;
}
function readPicks(root, name) {
  const all = root.querySelector(`[data-all="${name}"]`);
  if (all?.checked) return null;
  return [...root.querySelectorAll(`[data-pick="${name}"]:checked`)].map((i) => i.value);
}
function wireAllToggles(root) {
  root.addEventListener('change', (e) => {
    const all = e.target.closest('[data-all]');
    if (!all) return;
    root.querySelectorAll(`[data-pick="${all.dataset.all}"]`).forEach((i) => (i.disabled = all.checked));
  });
}
function showErrors(root, errs) {
  root.querySelectorAll('[data-field]').forEach((f) => {
    const msg = errs[f.dataset.field];
    f.toggleAttribute('aria-invalid', !!msg);
    if (msg) f.setAttribute('aria-invalid', 'true');
    let el = f.querySelector(':scope > .error');
    if (msg) {
      if (!el) {
        el = document.createElement('span');
        el.className = 'error';
        f.append(el);
      }
      el.textContent = msg;
    } else el?.remove();
  });
  const first = root.querySelector('[aria-invalid="true"]');
  first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ===================== ฟอร์มกฎ (เพิ่ม / แก้) =====================
const blankInsurance = () => ({ employeeType: EMPLOYEE_TYPES[0], companies: null, waitDays: 30, excludeContracts: [], requireSiteInsurance: false, note: '' });
const blankUniform = () => ({
  employeeType: EMPLOYEE_TYPES[0],
  companies: [],
  deptGroups: null,
  position: null, // ว่าง = ทุกตำแหน่ง
  levelMin: null,
  levelMax: null,
  style: '',
  logo: null,
  poloBySite: false,
  quantities: { START: {}, PROBATION: {}, ANNUAL: {} },
  note: '',
});

function insuranceForm(r) {
  return html`<div class="rule-form">
    <div class="field" data-field="employeeType">
      <label for="f-type">ประเภทพนักงาน<span class="req">*</span></label>
      <select class="input" id="f-type">${EMPLOYEE_TYPES.map((t) => html`<option value="${t}" ${t === r.employeeType ? raw('selected') : ''}>${EMPLOYEE_TYPE_LABEL[t]}</option>`)}</select>
    </div>
    <div class="field" data-field="waitDays">
      <label for="f-wait">ครบสิทธิเมื่อทำงานครบ (วัน)<span class="req">*</span></label>
      <input class="input num" type="number" inputmode="numeric" min="1" max="365" id="f-wait" value="${r.waitDays}" />
      <span class="hint">นับวันเริ่มงานเป็นวันที่ 1</span>
    </div>
    <div class="field full" data-field="companies">
      <label>บริษัท<span class="req">*</span></label>
      ${chipPicks('companies', companies.map((c) => ({ value: c.code, label: c.code })), r.companies, { all: 'ทุกบริษัท' })}
    </div>
    <div class="field" data-field="excludeContracts">
      <label>ไม่รวมสัญญา</label>
      ${chipPicks('contracts', CONTRACT_TYPES.map((c) => ({ value: c, label: CONTRACT_LABEL[c] })), r.excludeContracts)}
    </div>
    <div class="field">
      <label>หน่วยงาน</label>
      <label class="chip-pick" style="align-self:flex-start"><input type="checkbox" id="f-site" ${r.requireSiteInsurance ? raw('checked') : ''} /> เฉพาะหน่วยงานที่ได้รับประกันกลุ่ม</label>
    </div>
    <div class="field full">
      <label for="f-note">หมายเหตุ</label>
      <input class="input" id="f-note" value="${r.note}" maxlength="255" placeholder="เช่น ตามประกาศ HR ฉบับที่ …" />
    </div>
  </div>`;
}
function readInsurance(root) {
  return {
    employeeType: root.querySelector('#f-type').value,
    companies: readPicks(root, 'companies'),
    waitDays: Number(root.querySelector('#f-wait').value),
    excludeContracts: readPicks(root, 'contracts') ?? [],
    requireSiteInsurance: root.querySelector('#f-site').checked,
    note: root.querySelector('#f-note').value.trim(),
  };
}

function qtyGrid(r) {
  const items = hist.uniformItems;
  const q = r.quantities ?? {};
  return html`<table class="qty-grid">
    <thead>
      <tr><th>รายการ</th>${UNIFORM_EVENTS.map((ev) => html`<th class="n">${UNIFORM_EVENT_LABEL[ev]}</th>`)}</tr>
    </thead>
    <tbody>
      ${items.map(
        (it) => html`<tr>
          <td>${it.name}</td>
          ${UNIFORM_EVENTS.map(
            (ev) => html`<td class="n"><input class="input num" type="number" inputmode="numeric" min="0" max="${QTY_MAX}" data-qty="${ev}|${it.code}" value="${q[ev]?.[it.code] ?? 0}" aria-label="${it.name} ${UNIFORM_EVENT_LABEL[ev]}" /></td>`,
          )}
        </tr>`,
      )}
    </tbody>
    <tfoot><tr><td>รวม (ชิ้น)</td>${UNIFORM_EVENTS.map((ev) => html`<td class="n num" data-total="${ev}">0</td>`)}</tr></tfoot>
  </table>`;
}
function readQty(root) {
  const q = { START: {}, PROBATION: {}, ANNUAL: {} };
  root.querySelectorAll('[data-qty]').forEach((i) => {
    const [ev, code] = i.dataset.qty.split('|');
    const n = Number(i.value || 0);
    if (n > 0) q[ev][code] = n;
  });
  return q;
}
function updateQtyTotals(root) {
  const q = readQty(root);
  for (const ev of UNIFORM_EVENTS) {
    const cell = root.querySelector(`[data-total="${ev}"]`);
    if (cell) cell.textContent = String(Object.values(q[ev]).reduce((s, n) => s + n, 0));
  }
}
function uniformForm(r) {
  // ชื่อกลุ่มที่กฎเลือกไว้แต่ไม่อยู่ในรายการแล้ว (ข้อมูลเดิม) ยังแสดงให้เห็น/เอาออกได้
  const names = [...groups.map((g) => g.name), ...(r.deptGroups ?? []).filter((n) => !groups.some((g) => g.name === n))];
  return html`<div class="rule-form">
    <div class="field" data-field="employeeType">
      <label for="f-type">ประเภทพนักงาน<span class="req">*</span></label>
      <select class="input" id="f-type">${EMPLOYEE_TYPES.map((t) => html`<option value="${t}" ${t === r.employeeType ? raw('selected') : ''}>${EMPLOYEE_TYPE_LABEL[t]}</option>`)}</select>
    </div>
    <div class="field" data-field="style">
      <label for="f-style">ชื่อแบบชุดฟอร์ม<span class="req">*</span></label>
      <input class="input" id="f-style" value="${r.style}" maxlength="200" placeholder="เช่น โปโลสีดำ โลโก้ HL" />
    </div>
    <div class="field full" data-field="companies">
      <label>บริษัท<span class="req">*</span></label>
      ${chipPicks('companies', companies.map((c) => ({ value: c.code, label: c.code })), r.companies)}
    </div>
    <div class="field full" data-field="deptGroups">
      <label>กลุ่ม / ฝ่าย <span class="muted small">(พนักงานส่วนกลาง)</span></label>
      ${chipPicks('groups', names.map((g) => ({ value: g, label: g })), r.deptGroups, { all: 'ทุกกลุ่ม' })}
      <span class="hint">เพิ่ม / เปลี่ยนชื่อกลุ่มได้ที่ <a href="sites.html?tab=groups" target="_blank">ตั้งค่าองค์กร → กลุ่ม / ฝ่าย</a></span>
    </div>
    ${positionField(r)}
    <div class="field" data-field="levelMin">
      <label for="f-lmin">ระดับต่ำสุด</label>
      <input class="input num" type="number" inputmode="numeric" min="${LEVEL_RANGE[0]}" max="${LEVEL_RANGE[1]}" id="f-lmin" value="${r.levelMin ?? ''}" placeholder="ไม่จำกัด" />
    </div>
    <div class="field" data-field="levelMax">
      <label for="f-lmax">ระดับสูงสุด</label>
      <input class="input num" type="number" inputmode="numeric" min="${LEVEL_RANGE[0]}" max="${LEVEL_RANGE[1]}" id="f-lmax" value="${r.levelMax ?? ''}" placeholder="ไม่จำกัด (สูงสุด 9)" />
    </div>
    <div class="field">
      <label for="f-logo">โลโก้บนเสื้อ <span class="muted small">(ใช้เลือกแบบในสต็อก)</span></label>
      <select class="input" id="f-logo">
        <option value="">ตามบริษัทของพนักงาน</option>
        ${companies.map((c) => html`<option value="${c.code}" ${c.code === r.logo ? raw('selected') : ''}>${c.code}</option>`)}
      </select>
    </div>
    <div class="field">
      <label>สีโปโล</label>
      <label class="chip-pick" style="align-self:flex-start"><input type="checkbox" id="f-polo" ${r.poloBySite ? raw('checked') : ''} /> ใช้สีตามหน่วยงาน (ดำ / น้ำเงิน)</label>
    </div>
    <div class="field full" data-field="quantities">
      <label>จำนวนต่อรอบ<span class="req">*</span> <span class="muted small">(0 = ไม่ได้ · หน่วยงานตั้งต่างจากนี้ได้ที่หน้าหน่วยงาน)</span></label>
      ${qtyGrid(r)}
    </div>
    <div class="field full">
      <label for="f-note">หมายเหตุ</label>
      <input class="input" id="f-note" value="${r.note}" maxlength="255" />
    </div>
  </div>`;
}
// ===================== ตำแหน่งในกฎชุดฟอร์ม =====================
// เก็บเป็นข้อความคั่นด้วย "," (uniform_rules.position) · ไม่เลือก = ทุกตำแหน่ง
// พนักงานตรงกฎเมื่อตำแหน่งตรงตัวอักษร จึงให้เลือกจากตำแหน่งที่มีในข้อมูลพนักงานแทนการพิมพ์เอง
const splitPositions = (s) => (s ? s.split(',').map((p) => p.trim()).filter(Boolean) : []);

/** ตัวเลือก = ตำแหน่งในข้อมูลพนักงาน + ที่กฎชุดฟอร์มใช้อยู่/รอมีผล + รายการตั้งต้น · "ตำแหน่งอื่นๆ" อยู่ท้าย */
function positionOptions(selected) {
  const set = new Set([...PRO_POSITIONS, ...employeePositions, ...selected]);
  for (const t of hist.uniform) for (const r of [t.current, ...t.pending]) if (r && !r.deleted) splitPositions(r.position).forEach((p) => set.add(p));
  set.delete(OTHER_POSITION);
  return [...[...set].sort((a, b) => a.localeCompare(b, 'th')), OTHER_POSITION];
}

function positionField(r) {
  const selected = splitPositions(r.position);
  const options = positionOptions(selected);
  // แสดงเมื่อประเภทพนักงานตั้ง "ใช้ตำแหน่ง" (ตั้งค่าองค์กร → ประเภทพนักงาน) หรือกฎเลือกตำแหน่งไว้แล้ว
  const show = !!typeInfo(r.employeeType)?.usesPosition || selected.length > 0;
  return html`<div class="field full" data-field="position" data-pos-field ${show ? '' : raw('hidden')}>
    <label>ตำแหน่ง <span class="muted small">(ไม่เลือก = ทุกตำแหน่ง · “${OTHER_POSITION}” = ตำแหน่งที่ไม่มีกฎของตัวเอง)</span></label>
    <div data-pos-chips>${chipPicks('positions', options.map((p) => ({ value: p, label: p })), selected)}</div>
    <div class="row" style="gap:8px;margin-top:8px">
      <input class="input" id="f-pos-new" list="f-pos-list" maxlength="100" placeholder="ตำแหน่งที่ไม่มีในรายการ" style="max-width:280px" aria-label="เพิ่มตำแหน่ง" />
      <datalist id="f-pos-list">${options.map((p) => html`<option value="${p}"></option>`)}</datalist>
      <button type="button" class="btn btn-ghost btn-sm" data-pos-add>${raw(icon('plus'))} เพิ่ม</button>
    </div>
    <span class="hint">ตัวเลือกมาจากตำแหน่งในข้อมูลพนักงาน — พนักงานได้กฎนี้เมื่อตำแหน่งตรงกันทุกตัวอักษร</span>
  </div>`;
}

/** เพิ่มตำแหน่งจากช่องพิมพ์ — ตรงกับตัวเลือกเดิม (ไม่สนช่องว่าง/ตัวพิมพ์) = ติ๊กตัวเดิม ไม่สร้างซ้ำ */
function addPosition(root) {
  const input = root.querySelector('#f-pos-new');
  const v = input.value.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (!v) return;
  const same = [...root.querySelectorAll('[data-pick="positions"]')].find((b) => b.value.replace(/\s+/g, '').toLowerCase() === v.replace(/\s+/g, '').toLowerCase());
  if (same) same.checked = true;
  else {
    const label = document.createElement('label');
    label.className = 'chip-pick';
    const cb = Object.assign(document.createElement('input'), { type: 'checkbox', value: v, checked: true });
    cb.dataset.pick = 'positions';
    label.append(cb, ` ${v}`);
    root.querySelector('[data-pos-chips] .chip-picks').append(label);
  }
  input.value = '';
  input.focus();
}

function wirePositionField(root) {
  const field = root.querySelector('[data-pos-field]');
  root.querySelector('#f-type').addEventListener('change', (e) => {
    field.hidden = !typeInfo(e.target.value)?.usesPosition && !readPicks(root, 'positions').length;
  });
  on(root, 'click', '[data-pos-add]', () => addPosition(root));
  root.querySelector('#f-pos-new').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addPosition(root);
  });
}

function readUniform(root) {
  const num = (id) => (root.querySelector(id).value === '' ? null : Number(root.querySelector(id).value));
  const positions = root.querySelector('[data-pos-field]').hidden ? [] : readPicks(root, 'positions');
  return {
    employeeType: root.querySelector('#f-type').value,
    style: root.querySelector('#f-style').value.trim(),
    companies: readPicks(root, 'companies') ?? [],
    deptGroups: readPicks(root, 'groups'),
    position: positions.length ? positions.join(', ') : null,
    levelMin: num('#f-lmin'),
    levelMax: num('#f-lmax'),
    logo: root.querySelector('#f-logo').value || null,
    poloBySite: root.querySelector('#f-polo').checked,
    quantities: readQty(root),
    note: root.querySelector('#f-note').value.trim(),
  };
}

/** เปิดฟอร์มกฎ — id = null คือเพิ่มกฎใหม่ · base = ค่าตั้งต้น (ฉบับที่ใช้อยู่ หรือฉบับที่รอมีผลที่จะแก้) */
function openRuleEditor(kind, id = null, base = null, date = null) {
  const rule = base ?? (kind === 'insurance' ? blankInsurance() : blankUniform());
  const editingPending = !!date && date > hist.today;
  const m = openModal({
    size: 'lg',
    title: id === null ? `เพิ่ม${KIND_LABEL[kind]}` : `แก้${KIND_LABEL[kind]} #${id}`,
    description: id === null ? 'กฎใหม่ใช้ตั้งแต่วันที่มีผลที่เลือก' : editingPending ? `แก้ฉบับที่รอมีผล ${thaiDate(date)}` : 'บันทึก = ฉบับใหม่ของกฎ ฉบับเดิมยังเก็บเป็นประวัติ',
    body: html`${kind === 'insurance' ? insuranceForm(rule) : uniformForm(rule)}
      <div class="effective-bar" style="margin-top:16px">
        ${effectiveField('f-from', date ?? hist.today)}
        <div class="hint small muted" id="f-from-hint">${effectiveHint(date ?? hist.today)}</div>
        <div class="row" style="gap:6px">
          <button type="button" class="btn btn-ghost btn-sm" data-quick="0">วันนี้</button>
          <button type="button" class="btn btn-ghost btn-sm" data-quick="month">1 เดือนหน้า</button>
          <button type="button" class="btn btn-ghost btn-sm" data-quick="year">1 ม.ค. ปีหน้า</button>
        </div>
      </div>`,
    footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" data-ok data-label="บันทึก">บันทึก</button>`,
  });
  const root = m.el;
  wireAllToggles(root);
  if (kind === 'uniform') {
    wirePositionField(root);
    updateQtyTotals(root);
    root.addEventListener('input', (e) => e.target.matches('[data-qty]') && updateQtyTotals(root));
  }
  const from = root.querySelector('#f-from');
  const refreshHint = () => render(root.querySelector('#f-from-hint'), effectiveHint(from.value));
  from.addEventListener('change', refreshHint);
  on(root, 'click', '[data-quick]', (_e, b) => {
    const t = hist.today;
    const [y, mo] = t.split('-').map(Number);
    from.value =
      b.dataset.quick === '0' ? t : b.dataset.quick === 'month' ? `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}-01` : `${y + 1}-01-01`;
    refreshHint();
  });
  const ok = root.querySelector('[data-ok]');
  ok.onclick = async () => {
    const values = kind === 'insurance' ? readInsurance(root) : readUniform(root);
    const ctx = { companies: companies.map((c) => c.code), items: hist.uniformItems.map((i) => i.code) };
    const errs = kind === 'insurance' ? validateInsuranceRule(values, ctx) : validateUniformRule(values, ctx);
    if (!from.value) errs.effectiveFrom = 'กรุณาเลือกวันที่มีผล';
    showErrors(root, errs);
    if (Object.keys(errs).length) return toast.error('กรุณาแก้ช่องที่มีกรอบสีแดง');
    m.busy(true, ok);
    try {
      const body = { ...values, effectiveFrom: from.value };
      const h = id === null ? await api.createRule(kind, body) : await api.updateRule(kind, id, body);
      m.busy(false, ok);
      m.close();
      applyHistory(h, from.value > hist.today ? `บันทึกแล้ว — จะมีผล ${thaiDate(from.value)}` : 'บันทึกแล้ว — มีผลทันที');
    } catch (e) {
      m.busy(false, ok);
      if (e.details) showErrors(root, e.details);
      toast.error(errorMessage(e));
    }
  };
}

// ===================== ประวัติ / เลิกใช้ =====================
function revItem(kind, t, r, state) {
  return html`<div class="rev-item ${state}">
    <span class="when num">${sinceText(r.effectiveFrom)}</span>
    <span class="what">
      <span class="row wrap" style="gap:6px">
        ${state === 'pending' ? badge('รอมีผล', 'warning') : state === 'current' ? badge('ใช้อยู่', 'success') : badge('ฉบับเก่า', 'neutral')}
        ${r.deleted ? badge('เลิกใช้', 'danger') : ''}
      </span>
      <span>${summary(kind, r)}</span>
      ${kind === 'uniform' && !r.deleted ? qtyLines(r) : ''}
      <span class="meta">${r.note ? `${r.note} · ` : ''}โดย ${r.updatedBy ?? '–'}</span>
    </span>
    ${canEdit && state === 'pending'
      ? html`<span class="row" style="gap:4px">
          ${r.deleted ? '' : html`<button class="btn btn-ghost btn-sm" data-edit-rev="${kind}:${t.id}:${r.revisionId}">แก้</button>`}
          <button class="btn btn-ghost btn-sm danger-text" data-cancel-rev="${kind}:${r.revisionId}">ยกเลิก</button>
        </span>`
      : html`<span></span>`}
  </div>`;
}
function openHistory(kind, id) {
  const t = hist[kind].find((x) => x.id === id);
  const m = openModal({
    size: 'lg',
    title: `ประวัติ${KIND_LABEL[kind]} #${id}`,
    description: 'ใหม่สุดอยู่บน — ฉบับที่รอมีผลแก้หรือยกเลิกได้จนถึงวันมีผล',
    body: html`<div class="rev-list">
      ${[...t.pending].reverse().map((r) => revItem(kind, t, r, 'pending'))}
      ${t.history.map((r, i) => revItem(kind, t, r, i === 0 && t.current ? 'current' : 'old'))}
    </div>`,
    footer: html`${canEdit && t.current ? html`<button class="btn foot-start" data-edit="${kind}:${id}">${raw(icon('pencil'))} แก้กฎ</button>` : ''}
      <button class="btn btn-primary" data-close>ปิด</button>`,
  });
  wireActions(m.el, () => m.close());
}
/** เลิกใช้กฎ 1 ข้อ (id) หรือหลายข้อ (ids จากแถวที่เลือก) ตั้งแต่วันที่เลือก */
function openRetire(kind, idOrIds) {
  const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
  const one = ids.length === 1 ? hist[kind].find((x) => x.id === ids[0]) : null;
  let resolve;
  const done = new Promise((r) => (resolve = r));
  const m = openModal({
    title: one ? `เลิกใช้${KIND_LABEL[kind]} #${one.id}?` : `เลิกใช้${KIND_LABEL[kind]} ${ids.length} ข้อ?`,
    description: one ? summary(kind, one.current) : ids.map((id) => `#${id}`).join(', '),
    onClose: () => resolve(),
    body: html`${alertBox({ tone: 'warning', body: 'ตั้งแต่วันที่เลือก ระบบจะไม่ใช้กฎนี้คำนวณสิทธิอีก — ประวัติและการแจ้ง/แจกที่ทำไปแล้วยังอยู่ครบ' })}
      <div class="effective-bar" style="margin-top:16px">${effectiveField('r-from')}<div class="hint small muted" id="r-hint">${effectiveHint(hist.today)}</div></div>`,
    footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-danger" data-ok data-label="เลิกใช้กฎ">เลิกใช้กฎ</button>`,
  });
  const from = m.el.querySelector('#r-from');
  from.addEventListener('change', () => render(m.el.querySelector('#r-hint'), effectiveHint(from.value)));
  const ok = m.el.querySelector('[data-ok]');
  ok.onclick = async () => {
    if (!from.value) return toast.error('กรุณาเลือกวันที่มีผล');
    m.busy(true, ok);
    let h = null;
    const failed = [];
    for (const id of ids) {
      try {
        h = await api.retireRule(kind, id, from.value);
      } catch (e) {
        failed.push(`#${id}: ${errorMessage(e)}`);
      }
    }
    m.busy(false, ok);
    if (failed.length) toast.error(`เลิกใช้ไม่สำเร็จ ${failed.length} ข้อ — ${failed.join(' · ')}`);
    if (!h) return;
    m.close();
    const n = ids.length - failed.length;
    applyHistory(h, from.value > hist.today ? `จะเลิกใช้ ${n} ข้อ ตั้งแต่ ${thaiDate(from.value)}` : `เลิกใช้กฎแล้ว ${n} ข้อ`);
  };
  return done;
}
function openRetired(kind) {
  const list = hist[kind].filter((t) => !t.current);
  const m = openModal({
    size: 'lg',
    title: `${KIND_LABEL[kind]}ที่เลิกใช้แล้ว`,
    body: html`<div class="rev-list">${list.map((t) => revItem(kind, t, t.history[1] ?? t.history[0], 'old'))}</div>`,
    footer: html`<button class="btn btn-primary" data-close>ปิด</button>`,
  });
  wireActions(m.el, () => m.close());
}

async function cancelRevision(kind, revisionId) {
  try {
    applyHistory(await api.cancelRuleRevision(kind, revisionId), 'ยกเลิกการเปลี่ยนแปลงแล้ว');
  } catch (e) {
    toast.error(errorMessage(e));
  }
}
async function cancelSetting(key, date) {
  try {
    applyHistory(await api.cancelSettingChange(key, date), 'ยกเลิกค่าที่ตั้งล่วงหน้าแล้ว');
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

/** ปุ่มที่อยู่ได้ทั้งในหน้าและใน modal — close = ปิด modal ก่อนเปิดอันใหม่ */
function wireActions(root, close = () => {}) {
  const split = (v) => v.split(':');
  on(root, 'click', '[data-edit]', (_e, b) => {
    const [kind, id] = split(b.dataset.edit);
    const t = hist[kind].find((x) => x.id === Number(id));
    close();
    openRuleEditor(kind, t.id, structuredClone(t.current));
  });
  on(root, 'click', '[data-edit-rev]', (_e, b) => {
    const [kind, id, rid] = split(b.dataset.editRev);
    const t = hist[kind].find((x) => x.id === Number(id));
    const r = t.pending.find((p) => p.revisionId === Number(rid));
    close();
    openRuleEditor(kind, t.id, structuredClone(r), r.effectiveFrom);
  });
  on(root, 'click', '[data-cancel-rev]', (_e, b) => {
    const [kind, rid] = split(b.dataset.cancelRev);
    close();
    cancelRevision(kind, Number(rid));
  });
  on(root, 'click', '[data-cancel-setting]', (_e, b) => {
    const [key, date] = b.dataset.cancelSetting.split('|');
    cancelSetting(key, date);
  });
  on(root, 'click', '[data-history]', (_e, b) => {
    const [kind, id] = split(b.dataset.history);
    openHistory(kind, Number(id));
  });
  on(root, 'click', '[data-retire]', (_e, b) => {
    const [kind, id] = split(b.dataset.retire);
    openRetire(kind, Number(id));
  });
  on(root, 'click', '[data-retired]', (_e, b) => openRetired(b.dataset.retired));
}

// ===================== events =====================
on($('#tabs'), 'click', '[data-tab]', (_e, t) => {
  tab = t.dataset.tab;
  query = '';
  setParams({ tab: tab === 'insurance' ? '' : tab });
  draw();
  startTourIfNew(tourId()); // แท็บนี้เปิดครั้งแรก → แนะนำของแท็บนี้
});
$('#add').onclick = () => openRuleEditor(tab);
wireActions($('#content'));
let searchTimer;
$('#content').addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    query = e.target.value.trim();
    drawRuleTable(tab);
    const q = $('#q');
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  }, 200);
});
on($('#content'), 'click', '#save-settings', async (_e, btn) => {
  const values = {};
  $('#content').querySelectorAll('[data-set]').forEach((i) => (values[i.dataset.set] = Number(i.value)));
  const date = $('#settings-from').value;
  const errs = validateSettings(values);
  if (!date) errs.effectiveFrom = 'กรุณาเลือกวันที่มีผล';
  showErrors($('#content'), errs);
  if (Object.keys(errs).length) return toast.error('กรุณาแก้ช่องที่มีกรอบสีแดง');
  btn.disabled = true;
  try {
    const h = await api.saveRuleSettings({ effectiveFrom: date, values });
    applyHistory(h, date > hist.today ? `บันทึกแล้ว — จะมีผล ${thaiDate(date)}` : 'บันทึกค่าตั้งค่าแล้ว');
  } catch (e) {
    if (e.details) showErrors($('#content'), e.details);
    toast.error(errorMessage(e));
    btn.disabled = false;
  }
});

// ===================== load =====================
try {
  let emps;
  [hist, companies, , emps] = await Promise.all([api.getRuleHistory(), api.listCompanies(), loadGroups(), api.listEmployees().catch(() => [])]);
  employeePositions = [...new Set(emps.map((e) => e.position?.trim()).filter(Boolean))];
  draw();
} catch (e) {
  render($('#content'), html`<div class="panel-pad">${errorState(e)}</div>`);
}
