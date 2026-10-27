// ตั้งค่าองค์กร (sites.html แท็บ บริษัท / ประเภทพนักงาน / กลุ่ม-ฝ่าย) — ตาราง Excel: ดับเบิลคลิกแก้ · เลือกหลายแถวลบ · กดบันทึก
//
//   บริษัท        backend/api/org.php      — รหัสตั้งตอนเพิ่มเท่านั้น · ลำดับ = ปุ่มขึ้น/ลง (บันทึกทันที)
//   ประเภทพนักงาน backend/api/org.php      — พฤติกรรม (บริษัทที่ใช้ได้ · กลุ่ม/ฝ่าย+ระดับ · ตำแหน่ง · รอบรายวัน) แทนการเช็กรหัสในโค้ด
//   กลุ่ม / ฝ่าย   backend/api/dept_groups.php — เปลี่ยนชื่อ = แก้ชื่อในพนักงาน + กฎทุกฉบับ
//   ลบได้เมื่อไม่มีใครใช้ (API ตอบ 409 + เหตุผล → แถวแดงพร้อมสาเหตุ) · แก้ = สิทธิ์ org.edit
//   บันทึกแล้ว → refreshCatalog() ให้ทั้งระบบเห็นค่าใหม่ทันที + โหลดจำนวนที่ใช้ใหม่
import { api } from '../app/api.js';
import { can } from '../app/auth.js';
import { refreshCatalog } from '../app/catalog.js';
import { validateDeptGroup } from '../application/deptGroupRules.js';
import { validateCompany, validateEmployeeType } from '../application/orgRules.js';
import { COMPANY_CODES, companyColor, employeeTypeList, TYPE_TONES } from '../domain/catalog.js';
import { html, raw, render } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { DEPT_GROUPS } from '../shared/labels.js';
import { alertBox, badge, emptyState, errorState } from '../ui/components.js';
import { activeBulkActions, activeColumn, activeRowClass } from '../ui/activeColumn.js';
import { ExcelGrid } from '../ui/datagrid.js';
import { loader } from '../ui/loading.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';

export const canEditOrg = can('org.edit');

const TONE_LABEL = { primary: 'น้ำเงิน', info: 'ฟ้า', success: 'เขียว', warning: 'ส้ม', danger: 'แดง', neutral: 'เทา' };
/** พฤติกรรมของประเภท: [field, หัวคอลัมน์, คำอธิบาย (tooltip)] */
const BEHAVIORS = [
  ['usesDeptGroup', 'กลุ่ม/ฝ่าย + ระดับ', 'ต้องเลือกกลุ่ม / ฝ่าย และระดับ 1–9 — กฎชุดฟอร์มแยกจำนวนตามกลุ่มและระดับได้ (แบบส่วนกลาง)'],
  ['usesPosition', 'ตำแหน่ง', 'กฎชุดฟอร์มเดิมที่แยกตามตำแหน่งจับได้ + ใช้สัญญา 3% ได้ (แบบ Pro Site)'],
  ['dailyCycle', 'รอบแจ้งรายวัน', 'แจ้งเข้า/ออกประกันกลุ่มในรอบรายวัน (วันรอบตั้งที่แท็บค่าตั้งค่า) แทนรอบปกติ'],
];
const count = (n) => (n === undefined || n === null ? html`<span class="muted">–</span>` : n ? html`<span class="num">${n}</span>` : html`<span class="muted num">0</span>`);
const str = (v) => String(v ?? '').trim();

// ===================== บริษัท =====================
let companies = [];
let coGrid = null;

function companyGrid(el) {
  return new ExcelGrid(el, {
    readOnly: !canEditOrg,
    rowKey: (c) => c.code,
    addLabel: 'เพิ่มบริษัท',
    // __new = แถวที่ยังไม่บันทึก (ตั้งรหัสได้) — แถวที่บันทึกแล้วมาจาก API ไม่มีค่านี้
    newRow: () => ({ code: '', name: '', legalName: '', color: '', siteCount: 0, employeeCount: 0, ruleCount: 0, insurerCount: 0, userCount: 0, active: true, __new: true }),
    validate: (c) => validateCompany(c, companies, !!c.__new),
    columns: [
      {
        key: 'order',
        header: 'ลำดับ',
        width: 84,
        filter: false,
        value: (c) => companies.findIndex((x) => x.code === c.code) + 1 || '',
        display: (c) => {
          const i = companies.findIndex((x) => x.code === c.code);
          if (i < 0 || !canEditOrg) return html`<span class="muted num">${i + 1 || ''}</span>`;
          return html`<span class="org-move">
            <button class="btn-icon sm" data-co-move="${i}|-1" title="เลื่อนขึ้น" aria-label="เลื่อน ${c.code} ขึ้น" ${i === 0 ? raw('disabled') : ''}>${raw(icon('chevron-up'))}</button>
            <button class="btn-icon sm" data-co-move="${i}|1" title="เลื่อนลง" aria-label="เลื่อน ${c.code} ลง" ${i === companies.length - 1 ? raw('disabled') : ''}>${raw(icon('chevron-down'))}</button>
          </span>`;
        },
      },
      {
        key: 'code',
        header: 'รหัส',
        width: 100,
        required: true,
        editor: 'text',
        editable: (c) => !!c.__new, // ตั้งตอนเพิ่มเท่านั้น
        value: (c) => c.code,
        display: (c) => (c.code ? html`<span class="org-code"><i class="org-dot" style="background:${c.color || companyColor(c.code)}"></i><b>${c.code}</b></span>` : ''),
        set: (c, v) => ({ ...c, code: str(v).toUpperCase() }),
      },
      {
        key: 'name',
        header: 'ชื่อ',
        width: 200,
        required: true,
        editor: 'text',
        value: (c) => c.name,
        display: (c) => (c.name ? html`<span class="co-chip" style="--co:${c.color || companyColor(c.code)}">${c.name}</span>` : ''),
        set: (c, v) => ({ ...c, name: str(v) }),
      },
      { key: 'legalName', header: 'ชื่อตามทะเบียน', width: 280, editor: 'text', value: (c) => c.legalName, set: (c, v) => ({ ...c, legalName: str(v) }) },
      {
        key: 'color',
        header: 'สี',
        width: 110,
        editor: 'custom',
        value: (c) => c.color,
        display: (c) => html`<span class="row" style="gap:6px"><i class="org-dot" style="background:${c.color || companyColor(c.code)}"></i>${c.color ? html`<span class="num small">${c.color}</span>` : html`<span class="muted small">อัตโนมัติ</span>`}</span>`,
        edit: (c) => pickColor(c),
        set: (c, v) => ({ ...c, color: v }),
      },
      { key: 'siteCount', header: 'หน่วยงาน', width: 96, align: 'right', value: (c) => c.siteCount, display: (c) => count(c.siteCount) },
      { key: 'employeeCount', header: 'พนักงาน', width: 96, align: 'right', value: (c) => c.employeeCount, display: (c) => count(c.employeeCount) },
      { key: 'ruleCount', header: 'กฎ', width: 70, align: 'right', value: (c) => c.ruleCount, display: (c) => count(c.ruleCount) },
      activeColumn('ปิด = เลือกบริษัทนี้ให้พนักงาน/หน่วยงานใหม่ไม่ได้ · ข้อมูลเดิมยังใช้และคำนวณตามเดิม · บริษัทในสต็อกปิดตาม'),
    ],
    rowClass: activeRowClass,
    bulkActions: canEditOrg ? activeBulkActions('บริษัท') : [],
    onSave: async (c, isNew) => api.saveCompany(c, isNew),
    rowLabel: (c) => `${c.code} — ${c.name}`,
    onSaved: () => reload(),
    exportName: 'บริษัท',
    empty: emptyState({ iconName: 'building-2', title: 'ยังไม่มีบริษัท' }),
  });
}

/** สีบริษัท: เลือกสี / สีอัตโนมัติ */
function pickColor(c) {
  return new Promise((resolve) => {
    let picked;
    const m = openModal({
      title: `สีของบริษัท ${c.code || 'ใหม่'}`,
      description: 'ใช้ในแถบพนักงานหน้าภาพรวม',
      body: html`<div class="row" style="gap:12px">
        <input type="color" id="co-color" value="${c.color || companyColor(c.code)}" class="org-color" />
        <label class="chip-pick"><input type="checkbox" id="co-auto" ${c.color ? '' : raw('checked')} /> สีอัตโนมัติ (ตามลำดับบริษัท)</label>
      </div>`,
      footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary" data-ok>ใช้สีนี้</button>`,
      onClose: () => resolve(picked),
    });
    m.el.querySelector('#co-color').addEventListener('input', () => (m.el.querySelector('#co-auto').checked = false));
    m.el.querySelector('[data-ok]').onclick = () => {
      picked = m.el.querySelector('#co-auto').checked ? '' : m.el.querySelector('#co-color').value.toLowerCase();
      m.close();
    };
  });
}

async function moveCompany(i, dir) {
  if (coGrid.hasPending()) return toast.error('บันทึกหรือยกเลิกการแก้ไขในตารางก่อนจัดลำดับ');
  const order = companies.map((c) => c.code);
  [order[i], order[i + dir]] = [order[i + dir], order[i]];
  try {
    companies = await api.saveCompanyOrder(order);
    await refreshCatalog();
    coGrid.setRows(companies);
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

// ===================== ประเภทพนักงาน =====================
let types = [];
let typesReady = true;
let tyGrid = null;

/** บริษัทที่ใช้ได้ (หลายค่า) — null = ทุกบริษัท */
function pickCompanies(t) {
  return new Promise((resolve) => {
    let picked;
    const all = t.companies === null;
    const m = openModal({
      title: `ประเภท “${t.name || t.code || 'ใหม่'}” ใช้กับบริษัท`,
      body: html`<div class="chip-picks" role="group">
        <label class="chip-pick all"><input type="checkbox" data-all ${all ? raw('checked') : ''} /> ทุกบริษัท</label>
        ${COMPANY_CODES.map((c) => html`<label class="chip-pick"><input type="checkbox" data-co value="${c}" ${!all && t.companies.includes(c) ? raw('checked') : ''} ${all ? raw('disabled') : ''} /> ${c}</label>`)}
      </div>`,
      footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary" data-ok>ตกลง</button>`,
      onClose: () => resolve(picked),
    });
    m.el.querySelector('[data-all]').addEventListener('change', (e) => m.el.querySelectorAll('[data-co]').forEach((i) => (i.disabled = e.target.checked)));
    m.el.querySelector('[data-ok]').onclick = () => {
      const list = [...m.el.querySelectorAll('[data-co]:checked')].map((i) => i.value);
      if (!m.el.querySelector('[data-all]').checked && !list.length) return toast.error('เลือกบริษัทอย่างน้อย 1 บริษัท หรือ “ทุกบริษัท”');
      picked = m.el.querySelector('[data-all]').checked ? null : list;
      m.close();
    };
  });
}

function typeGrid(el) {
  return new ExcelGrid(el, {
    readOnly: !canEditOrg || !typesReady,
    rowKey: (t) => t.code,
    addLabel: 'เพิ่มประเภท',
    newRow: () => ({ code: '', name: '', description: '', companies: null, usesDeptGroup: false, usesPosition: false, dailyCycle: false, tone: 'neutral', employeeCount: 0, ruleCount: 0, active: true, __new: true }),
    validate: (t) => validateEmployeeType(t, types, COMPANY_CODES, !!t.__new),
    columns: [
      {
        key: 'code',
        header: 'รหัส',
        width: 130,
        required: true,
        editor: 'text',
        editable: (t) => !!t.__new,
        value: (t) => t.code,
        display: (t) => (t.code ? html`<code class="org-code-text">${t.code}</code>` : ''),
        set: (t, v) => ({ ...t, code: str(v).toUpperCase() }),
      },
      { key: 'name', header: 'ชื่อ', width: 150, required: true, editor: 'text', value: (t) => t.name, display: (t) => (t.name ? badge(t.name, t.tone, { dot: false }) : ''), set: (t, v) => ({ ...t, name: str(v) }) },
      {
        key: 'tone',
        header: 'สีป้าย',
        width: 96,
        editor: 'select',
        value: (t) => t.tone,
        options: () => TYPE_TONES.map((x) => ({ value: x, label: TONE_LABEL[x] })),
        display: (t) => html`<span class="org-tone-dot tone-${t.tone}"></span> ${TONE_LABEL[t.tone] ?? t.tone}`,
        set: (t, v) => ({ ...t, tone: str(v) }),
      },
      {
        key: 'companies',
        header: 'ใช้กับบริษัท',
        width: 150,
        editor: 'custom',
        value: (t) => (t.companies === null ? null : t.companies.join(',')),
        text: (t) => (t.companies === null ? 'ทุกบริษัท' : t.companies.join(', ')),
        display: (t) => (t.companies === null ? html`<span class="muted">ทุกบริษัท</span>` : t.companies.join(', ')),
        edit: (t) => pickCompanies(t),
        set: (t, v) => ({ ...t, companies: v === null ? null : Array.isArray(v) ? v : String(v).split(',').filter(Boolean) }),
      },
      ...BEHAVIORS.map(([k, label]) => ({ key: k, header: label, width: 130, align: 'center', editor: 'switch', value: (t) => !!t[k], set: (t, v) => ({ ...t, [k]: !!v }) })),
      { key: 'description', header: 'คำอธิบาย', width: 260, editor: 'text', value: (t) => t.description, set: (t, v) => ({ ...t, description: str(v) }) },
      { key: 'employeeCount', header: 'พนักงาน', width: 90, align: 'right', value: (t) => t.employeeCount, display: (t) => count(t.employeeCount) },
      { key: 'ruleCount', header: 'กฎ', width: 70, align: 'right', value: (t) => t.ruleCount, display: (t) => count(t.ruleCount) },
      activeColumn('ปิด = เลือกประเภทนี้ให้พนักงาน/กฎใหม่ไม่ได้ · พนักงานและกฎเดิมยังใช้และคำนวณตามเดิม'),
    ],
    rowClass: activeRowClass,
    bulkActions: canEditOrg ? activeBulkActions('ประเภท') : [],
    onSave: async (t, isNew) => api.saveEmployeeType(t, isNew),
    rowLabel: (t) => `${t.name} (${t.code})`,
    onSaved: () => reload(),
    exportName: 'ประเภทพนักงาน',
    empty: emptyState({ iconName: 'users', title: 'ยังไม่มีประเภทพนักงาน' }),
  });
}

// ===================== กลุ่ม / ฝ่าย =====================
let groups = [];
let groupsReady = true;
let dgGrid = null;

function groupGrid(el) {
  return new ExcelGrid(el, {
    readOnly: !canEditOrg || !groupsReady,
    rowKey: (g) => g.id,
    addLabel: 'เพิ่มกลุ่ม / ฝ่าย',
    newRow: () => ({ id: 0, name: '', employeeCount: 0, ruleCount: 0, active: true }),
    validate: (g) => validateDeptGroup(g.name, groups, g.id),
    columns: [
      { key: 'name', header: 'ชื่อกลุ่ม / ฝ่าย', width: 320, required: true, editor: 'text', value: (g) => g.name, set: (g, v) => ({ ...g, name: str(v) }) },
      { key: 'employeeCount', header: 'พนักงาน', width: 96, align: 'right', value: (g) => g.employeeCount, display: (g) => count(g.employeeCount) },
      { key: 'ruleCount', header: 'กฎชุดฟอร์ม', width: 110, align: 'right', value: (g) => g.ruleCount, display: (g) => count(g.ruleCount) },
      activeColumn('ปิด = เลือกกลุ่มนี้ให้พนักงาน/กฎใหม่ไม่ได้ · พนักงานและกฎเดิมยังใช้ตามเดิม'),
    ],
    rowClass: activeRowClass,
    bulkActions: canEditOrg && groupsReady ? activeBulkActions('กลุ่ม') : [],
    // เปลี่ยนชื่อ = แก้ชื่อในพนักงาน + กฎชุดฟอร์มทุกฉบับ (backend ทำให้)
    onSave: async (g, isNew) => api.saveDeptGroup({ id: isNew ? undefined : g.id, name: g.name, active: g.active }),
    rowLabel: (g) => g.name,
    onSaved: () => reload(),
    exportName: 'กลุ่ม-ฝ่าย',
    empty: emptyState({ iconName: 'users', title: 'ยังไม่มีกลุ่ม / ฝ่าย' }),
  });
}

// ===================== โหลด / วาด =====================
let root = null;
let current = 'companies';
const HINT = {
  companies:
    'ดับเบิลคลิกเพื่อแก้ · รหัสตั้งตอนเพิ่มเท่านั้น (ใช้ทั้งระบบ — ตัวกรอง สิทธิ์ HR บริษัท กฎ ไฟล์แจ้งประกัน) · ชื่อตามทะเบียนใช้ในไฟล์แจ้งประกัน · ลำดับ = ปุ่มขึ้น/ลง · ไม่มีการลบ — ปิดที่คอลัมน์ “ใช้งาน” (ข้อมูลเดิมใช้ต่อ เลือกใหม่ไม่ได้)',
  types: 'ดับเบิลคลิกเพื่อแก้ · ติ๊กพฤติกรรมในตารางได้เลย (ชี้ที่หัวคอลัมน์ดูคำอธิบาย) · รหัสตั้งตอนเพิ่มเท่านั้น · ไม่มีการลบ — ปิดที่คอลัมน์ “ใช้งาน”',
  groups: 'ใช้กับประเภทที่ติ๊ก “กลุ่ม/ฝ่าย + ระดับ” · ดับเบิลคลิกเพื่อเปลี่ยนชื่อ — ชื่อในพนักงานและกฎชุดฟอร์มทุกฉบับเปลี่ยนตาม · ไม่มีการลบ — ปิดที่คอลัมน์ “ใช้งาน”',
};

async function loadTypes() {
  try {
    types = await api.listEmployeeTypes({ usage: true });
    typesReady = true;
  } catch (e) {
    if (e.status !== 409) throw e;
    types = employeeTypeList();
    typesReady = false;
  }
}
async function loadGroups() {
  try {
    groups = await api.listDeptGroups();
    groupsReady = true;
  } catch (e) {
    if (e.status !== 409) throw e;
    groups = DEPT_GROUPS.map((name, i) => ({ id: -(i + 1), name, employeeCount: null, ruleCount: null }));
    groupsReady = false;
  }
}
/** โหลดใหม่ทั้งสามส่วน (จำนวนที่ใช้ข้ามกัน) + แจ้งทั้งระบบ */
async function reload() {
  const [cs] = await Promise.all([api.listCompanies({ usage: true }), loadTypes(), loadGroups()]);
  companies = cs;
  await refreshCatalog();
  coGrid?.setRows(companies);
  tyGrid?.setRows(types);
  dgGrid?.setRows(groups);
}

function layout() {
  render(
    root,
    html`<div class="org-panel">
      <p class="hint small muted org-hint" data-org-hint></p>
      <div data-org-warn></div>
      <div class="org-grid" data-org="companies"></div>
      <div class="org-grid hidden" data-org="types"></div>
      <div class="org-grid hidden" data-org="groups"></div>
    </div>`,
  );
  coGrid = companyGrid(root.querySelector('[data-org="companies"]'));
  tyGrid = typeGrid(root.querySelector('[data-org="types"]'));
  dgGrid = groupGrid(root.querySelector('[data-org="groups"]'));
  // ปุ่มเลื่อนลำดับอยู่ในเซลล์ — จับก่อนตารางจะถือว่าคลิกเพื่อแก้เซลล์
  root.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-co-move]');
      if (!b) return;
      e.stopPropagation();
      const [i, dir] = b.dataset.coMove.split('|').map(Number);
      moveCompany(i, dir);
    },
    true,
  );
  // คำอธิบายพฤติกรรมที่หัวคอลัมน์ (ชี้ดู)
  root.querySelector('[data-org="types"]').addEventListener('mouseover', (e) => {
    const th = e.target.closest('th[data-col]');
    const b = th && BEHAVIORS.find(([k]) => k === th.dataset.col);
    if (b && !th.title) th.title = b[2];
  });
}

function show() {
  root.querySelectorAll('[data-org]').forEach((el) => el.classList.toggle('hidden', el.dataset.org !== current));
  root.querySelector('[data-org-hint]').textContent = HINT[current];
  const warn =
    current === 'types' && !typesReady
      ? alertBox({ tone: 'warning', body: 'ยังแก้ไม่ได้ — ต้องรัน migration backend/sql/015_org_settings.sql ก่อน (ตอนนี้ใช้ประเภทตั้งต้นในระบบ)' })
      : current === 'groups' && !groupsReady
        ? alertBox({ tone: 'warning', body: 'ยังแก้ไม่ได้ — ต้องรัน migration backend/sql/014_dept_groups.sql ก่อน (ตอนนี้ใช้รายการตั้งต้นในระบบ)' })
        : '';
  render(root.querySelector('[data-org-warn]'), warn);
  ({ companies: coGrid, types: tyGrid, groups: dgGrid })[current]?.render();
}

/** แสดงแท็บ (companies | types | groups) ใน el — โหลดครั้งแรกเมื่อเปิดแท็บ */
export async function showOrgTab(el, tab) {
  current = tab;
  if (root === el) return show();
  root = el;
  render(root, loader({ text: 'กำลังโหลด' }));
  try {
    await Promise.all([api.listCompanies({ usage: true }).then((cs) => (companies = cs)), loadTypes(), loadGroups()]);
  } catch (e) {
    render(root, html`<div class="panel-pad">${errorState(e)}</div>`);
    root = null;
    return;
  }
  layout();
  coGrid.setRows(companies);
  tyGrid.setRows(types);
  dgGrid.setRows(groups);
  show();
}

/** มีงานค้างในตารางของแท็บองค์กร (ใช้เตือนก่อนเปลี่ยนแท็บ) */
export const orgHasPending = () => [coGrid, tyGrid, dgGrid].some((g) => g?.hasPending());
