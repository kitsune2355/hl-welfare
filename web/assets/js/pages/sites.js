// หน้า: ตั้งค่าสวัสดิการ — แท็บองค์กร (sites.html?tab=companies|types|groups|sites · ไม่ใส่ = บริษัท)
//   แท็บเรียงตามลำดับที่ต้องตั้ง: 1 บริษัท → 2 ประเภทพนักงาน → 3 กลุ่ม/ฝ่าย → 4 หน่วยงาน
//   หน่วยงาน = ตาราง Excel เพิ่ม/แก้/ลบ + ชุดฟอร์มของหน่วยงาน (ไฟล์นี้) · บริษัท / ประเภท / กลุ่ม-ฝ่าย = pages/_orgSettings.js
//   ทุกแท็บมีกล่องอธิบาย "คืออะไร / ใช้ทำอะไร / ต้องมีอะไรก่อน" (ซ่อนได้)
import { api } from '../app/api.js';
import { can, companyChoices, myCompany } from '../app/auth.js';
import { initPage } from '../app/shell.js';
import { startTourIfNew } from '../app/tour.js';
import { UNIFORM_EVENTS } from '../domain/uniform.js';
import { $, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { COMPANY_CODES, EMPLOYEE_TYPE_LABEL, UNIFORM_EVENT_LABEL, UNIFORM_ITEM_LABEL } from '../shared/labels.js';
import { badge, companyChip, emptyState, errorState } from '../ui/components.js';
import { activeBulkActions, activeColumn, activeRowClass } from '../ui/activeColumn.js';
import { isCompanyActive } from '../domain/catalog.js';
import { ExcelGrid } from '../ui/datagrid.js';
import { loader } from '../ui/loading.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';

import { showOrgTab } from './_orgSettings.js';
import { aboutBox, wireAbout } from './_settingsAbout.js';
import { revealActiveTab, settingsTab, settingsTabs, wireSettingsTabs } from './_settingsTabs.js';

/** คู่มือตามแท็บ (tour/guides.js) — อ่านจาก URL เพราะ tab ประกาศทีหลัง */
const tourId = () => ({ sites: 'sites', types: 'sites-types', groups: 'sites-groups' })[getParam('tab')] ?? 'sites-companies';
initPage('sites', { tour: tourId });

// ===================== แท็บ =====================
// แท็บของหน้านี้ (แถบแท็บใช้ร่วมกับ rules.html — pages/_settingsTabs.js)
const TABS = ['companies', 'types', 'groups', 'sites'];
let tab = TABS.includes(getParam('tab')) ? getParam('tab') : 'companies';
function drawAbout() {
  render($('#about'), aboutBox(tab));
}
function drawTab() {
  render($('#tabs'), settingsTabs(tab));
  revealActiveTab($('#tabs'));
  $('#tab-hint').textContent = settingsTab(tab).hint;
  drawAbout();
  const panel = tab === 'sites' ? 'sites' : 'org';
  for (const p of ['sites', 'org']) $(`#panel-${p}`).classList.toggle('hidden', p !== panel);
  $('#summary').style.display = tab === 'sites' ? '' : 'none';
  if (panel === 'sites') grid.render();
  else showOrgTab($('#org'), tab);
}
function goTab(next) {
  tab = next;
  setParams({ tab: tab === 'companies' ? '' : tab });
  drawTab();
  startTourIfNew(tourId());
}
wireAbout($('#about'), drawAbout);
// แท็บของหน้านี้สลับในหน้า (คู่มือของแท็บเปิดครั้งแรก) · แท็บเงื่อนไขสวัสดิการ = ลิงก์ไป rules.html
wireSettingsTabs($('#tabs'), 'sites', goTab);

// ตั้งชุดฟอร์มของหน่วยงาน = แก้เงื่อนไขสวัสดิการ (สิทธิ์ rules.edit)
const canEdit = can('rules.edit');

const POLO = {
  BLACK: { label: 'ดำ', swatch: '#111827' },
  NAVY: { label: 'น้ำเงิน', swatch: '#1e3a8a' },
};

const sortSites = (list) => [...list].sort((a, b) => COMPANY_CODES.indexOf(a.companyCode) - COMPANY_CODES.indexOf(b.companyCode) || a.id - b.id);

function drawSummary() {
  const n = grid.getRows().filter((s) => !s.hasGroupInsurance).length;
  render($('#summary'), badge(`ไม่ได้รับประกัน ${n} หน่วยงาน`, n ? 'warning' : 'success'));
}

/** จำนวนพนักงาน (ทำงานอยู่) ต่อหน่วยงาน — โหลดพร้อมรายการหน่วยงาน */
let empCount = new Map();

const grid = new ExcelGrid($('#grid'), {
  rowKey: (s) => s.id,
  pageSize: 25,
  addLabel: 'เพิ่มหน่วยงาน',
  newRow: () => ({ id: 0, companyCode: myCompany() || COMPANY_CODES[0], name: '', hasGroupInsurance: true, poloColor: 'BLACK' }),
  validate: (s) => (s.name.trim() ? {} : { name: 'กรุณาระบุชื่อหน่วยงาน' }),
  columns: [
    {
      key: 'companyCode',
      header: 'บริษัท',
      width: 100,
      required: true,
      editor: 'select',
      // หน่วยงานที่สร้างแล้วย้ายบริษัทไม่ได้ (พนักงานผูกอยู่) — เลือกได้ตอนสร้างเท่านั้น
      hint: 'เลือกได้ตอนเพิ่มเท่านั้น — สร้างแล้วย้ายบริษัทไม่ได้ (พนักงานผูกอยู่)',
      editable: (s) => s.id === 0,
      value: (s) => s.companyCode,
      display: (s) => companyChip(s.companyCode),
      options: (s) => companyChoices(COMPANY_CODES).filter((c) => isCompanyActive(c) || c === s.companyCode).map((c) => ({ value: c, label: c })),
      set: (s, v) => ({ ...s, companyCode: String(v) }),
    },
    {
      key: 'name',
      header: 'ชื่อหน่วยงาน',
      hint: 'สำนักงาน / โครงการ / ไซต์ ที่พนักงานประจำ — เป็นชื่อแผนกในระบบสต็อก และใช้จับคู่ “ชื่อหน่วยงาน” ตอนนำเข้า Excel',
      width: 320,
      required: true,
      editor: 'text',
      value: (s) => s.name,
      set: (s, v) => ({ ...s, name: String(v ?? '').trim() }),
    },
    {
      key: 'employees',
      header: 'พนักงาน',
      hint: 'จำนวนพนักงานที่ทำงานอยู่',
      width: 104,
      align: 'right',
      value: (s) => empCount.get(s.id) ?? 0,
      display: (s) => (s.id ? html`<span class="num ${empCount.get(s.id) ? '' : 'muted'}">${empCount.get(s.id) ?? 0}</span>` : ''),
    },
    {
      key: 'hasGroupInsurance',
      header: 'ได้รับประกันกลุ่ม',
      hint: 'ใช้กับกฎประกันที่ติ๊ก “เฉพาะหน่วยงานที่ได้รับประกันกลุ่ม” (เช่น แม่บ้าน CNS) — ประเภทอื่นไม่ดูช่องนี้',
      width: 170,
      align: 'center',
      editor: 'switch',
      value: (s) => s.hasGroupInsurance,
      set: (s, v) => ({ ...s, hasGroupInsurance: !!v }),
    },
    {
      key: 'poloColor',
      header: 'สีโปโล',
      hint: 'ใช้กับกฎชุดฟอร์มที่ตั้ง “สีโปโลตามหน่วยงาน” (Pro Site) — กฎอื่นใช้สีตามกฎ',
      width: 130,
      editor: 'select',
      value: (s) => s.poloColor,
      display: (s) => html`<span class="row"><span class="swatch" style="background:${POLO[s.poloColor].swatch}"></span>${POLO[s.poloColor].label}</span>`,
      options: () => Object.entries(POLO).map(([value, p]) => ({ value, label: p.label })),
      set: (s, v) => ({ ...s, poloColor: v === 'NAVY' ? 'NAVY' : 'BLACK' }),
    },
    {
      // อ่านอย่างเดียวในตาราง — กดปุ่มเพื่อตั้งจำนวนชุดฟอร์มของหน่วยงาน (บันทึกทันที แยกจากปุ่มบันทึกของตาราง)
      key: 'uniform',
      header: 'ชุดฟอร์ม',
      hint: 'จำนวนชุดเฉพาะหน่วยงานนี้ (ทับกฎกลาง) — ไม่ตั้ง = ตามกฎกลาง · บันทึกทันทีแยกจากปุ่มบันทึกของตาราง',
      width: 210,
      value: (s) => (s.uniformOverrides ?? []).length,
      display: (s) =>
        s.id === 0
          ? html`<span class="muted small">บันทึกหน่วยงานก่อน</span>`
          : html`<span class="row" style="gap:6px">
              ${(s.uniformOverrides ?? []).length ? badge(`ตั้งเอง ${s.uniformOverrides.length} กฎ`, 'info') : html`<span class="muted small">ตามกฎกลาง</span>`}
              <button class="btn btn-ghost btn-sm" data-site-uniform="${s.id}" title="ตั้งชุดฟอร์มของหน่วยงานนี้">${raw(icon('shirt'))} ${canEdit ? 'ตั้งค่า' : 'ดู'}</button>
            </span>`,
    },
    activeColumn('ปิด = เลือกหน่วยงานนี้ให้พนักงานใหม่/ย้ายเข้าไม่ได้ · พนักงานเดิมอยู่ต่อได้ · แผนกในสต็อกปิดตาม'),
  ],
  onSave: async (row, isNew) => {
    let saved;
    if (isNew) {
      const { id: _id, ...input } = row;
      saved = await api.createSite(input);
    } else {
      saved = await api.updateSite(row.id, { name: row.name, hasGroupInsurance: row.hasGroupInsurance, poloColor: row.poloColor, active: row.active !== false });
    }
    // ส่งไปสต็อกไม่สำเร็จ — บันทึกในระบบนี้แล้ว แจ้งให้กดส่งเองอีกครั้ง
    if (saved?.stockWarning) toast.error(saved.stockWarning);
    const { stockWarning: _w, ...clean } = saved;
    return clean;
  },
  // ไม่มีการลบ — ปิดใช้งานแทน (คอลัมน์ "ใช้งาน") · หน่วยงานที่ปิด: พนักงานเดิมอยู่ต่อได้ เลือกใหม่ไม่ได้ · แผนกในสต็อกปิดตาม
  rowClass: activeRowClass,
  // เลือกหลายหน่วยงาน → ตั้งค่าพร้อมกัน (เป็นแถวยังไม่บันทึก ตรวจแล้วกดบันทึก)
  bulkActions: can('sites.edit')
    ? [
        ...activeBulkActions('หน่วยงาน'),
        { id: 'ins-on', label: 'ได้รับประกันกลุ่ม', icon: 'shield-plus', when: (s) => !s.hasGroupInsurance, run: (rows, g) => stageAll(g, rows, { hasGroupInsurance: true }) },
        { id: 'ins-off', label: 'ไม่ได้รับประกันกลุ่ม', icon: 'shield-off', when: (s) => s.hasGroupInsurance, run: (rows, g) => stageAll(g, rows, { hasGroupInsurance: false }) },
        { id: 'polo-black', label: 'โปโลสีดำ', when: (s) => s.poloColor !== 'BLACK', run: (rows, g) => stageAll(g, rows, { poloColor: 'BLACK' }) },
        { id: 'polo-navy', label: 'โปโลสีน้ำเงิน', when: (s) => s.poloColor !== 'NAVY', run: (rows, g) => stageAll(g, rows, { poloColor: 'NAVY' }) },
      ]
    : [],
  rowLabel: (s) => `${s.companyCode} · ${s.name}`,
  onSaved: () => drawSummary(),
  empty: emptyState({ iconName: 'building-2', title: 'ยังไม่มีหน่วยงาน', description: 'กด “เพิ่มหน่วยงาน” แล้วเลือกบริษัท — ทุกบริษัทควรมีอย่างน้อย 1 หน่วยงาน ไม่งั้นเพิ่มพนักงานของบริษัทนั้นไม่ได้' }),
});

/** แก้หลายแถวเป็น "ยังไม่บันทึก" (ไม่ซ่อนแถวอื่น) */
function stageAll(g, rows, patch) {
  g.stage({ edits: rows.map((s) => ({ key: s.id, row: { ...s, ...patch } })), onlyPending: false });
  return `แก้ ${rows.length} หน่วยงาน (ยังไม่บันทึก) — ตรวจแล้วกด “บันทึก”`;
}

// ===================== ชุดฟอร์มของหน่วยงาน (ตั้งทับกฎกลาง) =====================
let rulesCache = null;

const ruleWho = (r) =>
  [r.position ?? (r.deptGroups ? r.deptGroups.join(', ') : 'ทุกกลุ่ม/ฝ่าย'), r.levelMin !== null || r.levelMax !== null ? `ระดับ ${r.levelMin ?? 1}–${r.levelMax ?? 9}` : '']
    .filter(Boolean)
    .join(' · ');

function qtyTable(ruleId, q, items, editable) {
  return html`<table class="qty-grid" data-rule-grid="${ruleId}">
    <thead><tr><th>รายการ</th>${UNIFORM_EVENTS.map((ev) => html`<th class="n">${UNIFORM_EVENT_LABEL[ev]}</th>`)}</tr></thead>
    <tbody>
      ${items.map(
        (it) => html`<tr>
          <td>${it.name}</td>
          ${UNIFORM_EVENTS.map((ev) => {
            const v = q[ev]?.[it.code] ?? 0;
            return html`<td class="n">${editable
              ? html`<input class="input num" type="number" inputmode="numeric" min="0" max="20" data-q="${ev}|${it.code}" value="${v}" aria-label="${it.name} ${UNIFORM_EVENT_LABEL[ev]}" />`
              : html`<span class="num ${v ? '' : 'muted'}">${v}</span>`}</td>`;
          })}
        </tr>`,
      )}
    </tbody>
  </table>`;
}

/** แบบย่อของกฎที่ใช้ตามกฎกลาง: "เริ่มงาน โปโล 1 · เสื้อช่าง 2" ต่อรอบ */
function qtySummary(q) {
  const lines = UNIFORM_EVENTS.map((ev) => {
    const m = Object.entries(q[ev] ?? {}).filter(([, n]) => n > 0);
    return m.length ? html`<div class="qty-sum"><span class="ev">${UNIFORM_EVENT_LABEL[ev]}</span>${m.map(([c, n]) => html`<span>${UNIFORM_ITEM_LABEL[c] ?? c} <b class="num">${n}</b></span>`)}</div>` : '';
  }).filter((x) => x !== '');
  return lines.length ? html`<div class="qty-lines">${lines}</div>` : html`<span class="muted small">ไม่ได้ชุดฟอร์ม</span>`;
}
/** ตั้งเอง = ตารางแก้จำนวน · ตามกฎกลาง = แบบย่อ */
const qtyBlock = (ruleId, q, items, editable) => (editable ? qtyTable(ruleId, q, items, true) : qtySummary(q));

function readGrid(table) {
  const q = { START: {}, PROBATION: {}, ANNUAL: {} };
  table.querySelectorAll('[data-q]').forEach((i) => {
    const [ev, code] = i.dataset.q.split('|');
    if (Number(i.value) > 0) q[ev][code] = Number(i.value);
  });
  return q;
}

async function openSiteUniform(siteId) {
  const site = grid.getRows().find((s) => s.id === siteId);
  if (!site) return;
  const m = openModal({
    size: 'lg',
    title: `ชุดฟอร์มของหน่วยงาน “${site.name}”`,
    description: `${site.companyCode} · ตั้งจำนวนเฉพาะหน่วยงานนี้แทนกฎกลาง — กฎที่ไม่ได้ติ๊กใช้จำนวนตามกฎกลาง (แก้กฎกลางได้ที่แท็บ 6 ชุดฟอร์ม)`,
    body: html`<div data-body>${loader({ text: 'กำลังโหลดกฎชุดฟอร์ม' })}</div>`,
    footer: html`<button class="btn btn-ghost" data-close>${canEdit ? 'ยกเลิก' : 'ปิด'}</button>
      ${canEdit ? html`<button class="btn btn-primary" data-ok data-label="บันทึก">บันทึก</button>` : ''}`,
  });
  const body = m.el.querySelector('[data-body]');
  try {
    rulesCache ??= await api.getRules();
  } catch (e) {
    render(body, errorState(e));
    return;
  }
  // รายการทั้งหมด ยกเว้นโปโลสีที่ไม่ใช้กับหน่วยงานนี้เมื่อกฎตั้งสีตามหน่วยงาน
  const items = rulesCache.uniformItems.map((i) => ({ code: i.code, name: UNIFORM_ITEM_LABEL[i.code] ?? i.name }));
  const mine = rulesCache.uniform.filter((r) => r.companies.includes(site.companyCode));
  const over = new Map((site.uniformOverrides ?? []).map((o) => [o.ruleId, o.quantities]));
  render(
    body,
    mine.length
      ? html`<div class="rev-list">
          ${mine.map(
            (r) => html`<div class="rev-item ${over.has(r.id) ? 'current' : ''}" style="grid-template-columns:1fr" data-rule="${r.id}">
              <div class="row wrap" style="justify-content:space-between;gap:8px">
                <span class="two-line"><b style="font-weight:500">#${r.id} ${EMPLOYEE_TYPE_LABEL[r.employeeType]} · ${ruleWho(r)}</b><span class="sub">${r.style}${r.poloBySite ? ` · โปโลสี${site.poloColor === 'NAVY' ? 'น้ำเงิน' : 'ดำ'}ตามหน่วยงาน` : ''}</span></span>
                ${canEdit
                  ? html`<label class="chip-pick"><input type="checkbox" data-override="${r.id}" ${over.has(r.id) ? raw('checked') : ''} /> ตั้งจำนวนของหน่วยงานนี้</label>`
                  : over.has(r.id)
                    ? badge('ตั้งเอง', 'info')
                    : badge('ตามกฎกลาง', 'neutral')}
              </div>
              <div data-grid-slot="${r.id}">${qtyBlock(r.id, over.get(r.id) ?? r.quantities ?? {}, items, canEdit && over.has(r.id))}</div>
            </div>`,
          )}
        </div>`
      : emptyState({ iconName: 'shirt', title: `ยังไม่มีกฎชุดฟอร์มของบริษัท ${site.companyCode}`, description: 'เพิ่มกฎได้ที่แท็บ 6 ชุดฟอร์ม' }),
  );
  // ติ๊ก/เลิกติ๊ก: เปิดให้แก้ (เริ่มจากจำนวนของกฎกลาง) หรือกลับไปแสดงจำนวนของกฎกลาง
  body.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-override]');
    if (!cb) return;
    const r = mine.find((x) => x.id === Number(cb.dataset.override));
    const slot = body.querySelector(`[data-grid-slot="${r.id}"]`);
    const current = slot.querySelector('[data-q]') ? readGrid(slot) : null;
    render(slot, qtyBlock(r.id, cb.checked ? (current ?? over.get(r.id) ?? r.quantities ?? {}) : r.quantities ?? {}, items, cb.checked));
    cb.closest('.rev-item').classList.toggle('current', cb.checked);
  });
  const ok = m.el.querySelector('[data-ok]');
  if (!ok) return;
  ok.onclick = async () => {
    const overrides = [...body.querySelectorAll('[data-override]:checked')].map((cb) => ({
      ruleId: Number(cb.dataset.override),
      quantities: readGrid(body.querySelector(`[data-grid-slot="${cb.dataset.override}"]`)),
    }));
    const empty = overrides.find((o) => UNIFORM_EVENTS.every((ev) => !Object.keys(o.quantities[ev]).length));
    if (empty) return toast.error(`กฎ #${empty.ruleId}: ต้องได้ชุดฟอร์มอย่างน้อย 1 ชิ้น — ถ้าไม่ต้องตั้งเอง ให้เอาติ๊กออก`);
    m.busy(true, ok);
    try {
      const saved = await api.saveSiteUniform(site.id, overrides);
      site.uniformOverrides = saved.uniformOverrides;
      if (saved.stockWarning) toast.error(saved.stockWarning);
      grid.render();
      m.busy(false, ok);
      m.close();
      toast.success(overrides.length ? `บันทึกชุดฟอร์มของหน่วยงานแล้ว (${overrides.length} กฎ)` : 'หน่วยงานนี้ใช้ชุดฟอร์มตามกฎกลางแล้ว');
    } catch (e) {
      m.busy(false, ok);
      toast.error(errorMessage(e));
    }
  };
}

// ปุ่มอยู่ในเซลล์ของตาราง — จับก่อนตารางจะถือว่าเป็นการคลิกเพื่อแก้เซลล์
$('#grid').addEventListener(
  'click',
  (e) => {
    const b = e.target.closest('[data-site-uniform]');
    if (!b) return;
    e.stopPropagation();
    openSiteUniform(Number(b.dataset.siteUniform));
  },
  true,
);

// ส่งทั้งหมดเอง — ใช้เมื่อสต็อกเคยล่ม หรือกฎที่ตั้งล่วงหน้าเพิ่งถึงวันมีผล
// ส่งทุกบริษัทพร้อมกัน — HR บริษัท (ดูแลบริษัทเดียว) กดไม่ได้ · การบันทึกหน่วยงานของตัวเองยังส่งไปสต็อกเองตามปกติ
$('#sync-stock').style.display = can('sites.edit') && myCompany() === null ? '' : 'none';
$('#sync-stock').onclick = async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const r = await api.syncMasterToStock();
    toast.success(r.message);
  } catch (err) {
    toast.error(errorMessage(err));
  } finally {
    btn.disabled = false;
  }
};

drawTab();
try {
  const [siteList, emps] = await Promise.all([api.listSites(), api.listEmployees({ status: 'ACTIVE' }).catch(() => [])]);
  empCount = emps.reduce((m, e) => m.set(e.siteId, (m.get(e.siteId) ?? 0) + 1), new Map());
  grid.setRows(sortSites(siteList));
  drawSummary();
} catch (e) {
  render($('#grid'), html`<div style="padding:16px">${errorState(e)}</div>`);
}
