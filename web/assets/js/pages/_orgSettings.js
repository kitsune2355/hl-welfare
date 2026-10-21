// ตั้งค่าองค์กร (sites.html แท็บ บริษัท / ประเภทพนักงาน / กลุ่ม-ฝ่าย) — ตาราง + กล่องเพิ่ม/แก้
//
//   บริษัท        backend/api/org.php      — รหัสเปลี่ยนไม่ได้ · ลบได้เมื่อไม่มีหน่วยงาน/พนักงาน/ผู้ใช้/กฎ/บริษัทประกันที่ผูก
//   ประเภทพนักงาน backend/api/org.php      — พฤติกรรม (บริษัทที่ใช้ได้ · กลุ่ม/ฝ่าย+ระดับ · ตำแหน่ง · รอบรายวัน) แทนการเช็กรหัสในโค้ด
//   กลุ่ม / ฝ่าย   backend/api/dept_groups.php — เปลี่ยนชื่อ = แก้ชื่อในพนักงาน + กฎทุกฉบับ
//   แก้ = สิทธิ์ org.edit · หลังแก้บริษัท/ประเภท → refreshCatalog() ให้ทั้งระบบเห็นค่าใหม่ทันที
import { api } from '../app/api.js';
import { can } from '../app/auth.js';
import { refreshCatalog } from '../app/catalog.js';
import { validateDeptGroup } from '../application/deptGroupRules.js';
import { validateCompany, validateEmployeeType } from '../application/orgRules.js';
import { COMPANY_CODES, companyColor, employeeTypeList, TYPE_TONES } from '../domain/catalog.js';
import { html, on, raw, render } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { DEPT_GROUPS } from '../shared/labels.js';
import { alertBox, badge, emptyState, errorState } from '../ui/components.js';
import { loader } from '../ui/loading.js';
import { confirmAction, errorMessage, openModal, toast } from '../ui/overlay.js';

export const canEditOrg = can('org.edit');

const TONE_LABEL = { primary: 'น้ำเงิน', info: 'ฟ้า', success: 'เขียว', warning: 'ส้ม', danger: 'แดง', neutral: 'เทา' };
/** พฤติกรรมของประเภท: [field, ชื่อสั้น (ในตาราง), คำอธิบาย (ในกล่องแก้)] */
const BEHAVIORS = [
  ['usesDeptGroup', 'กลุ่ม/ฝ่าย + ระดับ', 'ต้องเลือกกลุ่ม / ฝ่าย และระดับ 1–9 — กฎชุดฟอร์มแยกจำนวนตามกลุ่มและระดับได้ (แบบส่วนกลาง)'],
  ['usesPosition', 'ตำแหน่ง', 'เก็บตำแหน่งจากไฟล์นำเข้า — กฎชุดฟอร์มเดิมที่แยกตามตำแหน่งจับได้ (แบบ Pro Site)'],
  ['dailyCycle', 'รอบแจ้งรายวัน', 'แจ้งเข้า/ออกประกันกลุ่มในรอบรายวัน (วันที่ตั้งใน “รอบแจ้งประกันรายวัน” ของเงื่อนไขสวัสดิการ) แทนรอบปกติ'],
];

// ===================== ส่วนที่ใช้ร่วมกัน =====================
function showErrors(root, errs) {
  root.querySelectorAll('[data-field]').forEach((f) => {
    const msg = errs[f.dataset.field];
    if (msg) f.setAttribute('aria-invalid', 'true');
    else f.removeAttribute('aria-invalid');
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
}
const num = (n) => (n ? html`<span class="num">${n}</span>` : html`<span class="muted num">0</span>`);
/** เหตุผลที่ลบไม่ได้ — null = ลบได้ */
const blockedBy = (row, parts) => {
  const why = parts.filter(([k]) => row[k] > 0).map(([k, label]) => `${label} ${row[k]}`);
  return why.length ? `ลบไม่ได้ — ยังมี${why.join(' · ')} ที่ใช้อยู่` : null;
};
function actions(key, value, name, blocked) {
  if (!canEditOrg) return '';
  return html`<td class="org-act">
    <button class="btn-icon sm" data-${key}-edit="${value}" title="แก้ไข" aria-label="แก้ไข ${name}">${raw(icon('pencil'))}</button>
    <button class="btn-icon sm danger-text" data-${key}-del="${value}" title="${blocked ?? 'ลบ'}" aria-label="ลบ ${name}" ${blocked ? raw('disabled') : ''}>${raw(icon('trash-2'))}</button>
  </td>`;
}
function sectionHead(title, hint, addAttr, addLabel) {
  return html`<div class="org-head">
    <div>
      <h2>${title}</h2>
      <p class="hint small muted">${hint}</p>
    </div>
    ${canEditOrg ? html`<button class="btn btn-primary btn-sm" ${raw(addAttr)}>${raw(icon('plus'))} ${addLabel}</button>` : ''}
  </div>`;
}
/** กล่องเพิ่ม/แก้: body + อ่านค่า + ตรวจ + บันทึก */
function editor({ title, description, body, read, validate, save, onOpen }) {
  const m = openModal({
    title,
    description,
    body,
    footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" data-ok data-label="บันทึก">บันทึก</button>`,
  });
  onOpen?.(m.el);
  m.el.querySelector('input:not([type="hidden"]):not([readonly]), select')?.focus();
  const ok = m.el.querySelector('[data-ok]');
  const submit = async () => {
    const values = read(m.el);
    const errs = validate(values);
    showErrors(m.el, errs);
    if (Object.keys(errs).length) return toast.error('กรุณาแก้ช่องที่มีกรอบสีแดง');
    m.busy(true, ok);
    try {
      await save(values);
      m.busy(false, ok);
      m.close();
    } catch (e) {
      m.busy(false, ok);
      if (e.details) showErrors(m.el, e.details);
      toast.error(errorMessage(e));
    }
  };
  ok.onclick = submit;
  m.el.addEventListener('keydown', (e) => e.key === 'Enter' && e.target.matches('input[type="text"], input:not([type])') && submit());
}
const ask = (title, description, action, successMessage) => confirmAction({ title, description, confirmLabel: 'ลบ', successMessage, action });

// ===================== บริษัท =====================
let companies = [];

function companiesView() {
  return html`${sectionHead(
      'บริษัท',
      'รหัสใช้ทั่วระบบ (ตัวกรอง สิทธิ์ HR บริษัท กฎสวัสดิการ ไฟล์แจ้งประกัน) — ตั้งแล้วเปลี่ยนไม่ได้ · ชื่อตามทะเบียนใช้ในชีตสรุปของไฟล์แจ้งประกัน · ลำดับใช้กับรายการบริษัททั้งระบบ',
      'data-co-add',
      'เพิ่มบริษัท',
    )}
    <div class="table-wrap org-table-wrap">
      <table class="table org-table">
        <thead>
          <tr>
            ${canEditOrg ? html`<th class="org-move" aria-label="ลำดับ"></th>` : ''}
            <th>รหัส</th><th>ชื่อ</th><th>ชื่อตามทะเบียน</th>
            <th class="num">หน่วยงาน</th><th class="num">พนักงาน</th><th class="num">กฎ</th>${canEditOrg ? html`<th></th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${companies.map((c, i) => {
            const blocked = blockedBy(c, [['siteCount', 'หน่วยงาน'], ['employeeCount', 'พนักงาน'], ['userCount', 'ผู้ใช้ HR บริษัท'], ['ruleCount', 'กฎสวัสดิการ'], ['insurerCount', 'บริษัทประกันที่ผูก']]);
            return html`<tr>
              ${canEditOrg
                ? html`<td class="org-move">
                    <button class="btn-icon sm" data-co-up="${i}" title="เลื่อนขึ้น" aria-label="เลื่อน ${c.code} ขึ้น" ${i === 0 ? raw('disabled') : ''}>${raw(icon('chevron-up'))}</button>
                    <button class="btn-icon sm" data-co-down="${i}" title="เลื่อนลง" aria-label="เลื่อน ${c.code} ลง" ${i === companies.length - 1 ? raw('disabled') : ''}>${raw(icon('chevron-down'))}</button>
                  </td>`
                : ''}
              <td><span class="org-code"><i class="org-dot" style="background:${c.color || companyColor(c.code)}"></i><b>${c.code}</b></span></td>
              <td>${c.name}</td>
              <td class="${c.legalName ? '' : 'muted'}">${c.legalName || '–'}</td>
              <td class="num">${num(c.siteCount)}</td>
              <td class="num">${num(c.employeeCount)}</td>
              <td class="num">${num(c.ruleCount)}</td>
              ${actions('co', c.code, c.code, blocked)}
            </tr>`;
          })}
        </tbody>
      </table>
    </div>`;
}

function openCompany(c = null) {
  const creating = !c;
  editor({
    title: creating ? 'เพิ่มบริษัท' : `แก้ไขบริษัท ${c.code}`,
    description: creating ? 'บริษัทใหม่เลือกได้ทันทีในหน่วยงาน พนักงาน กฎสวัสดิการ และสิทธิ์ HR บริษัท' : 'รหัสเปลี่ยนไม่ได้ — พนักงาน หน่วยงาน และสิทธิ์ผู้ใช้อ้างถึงรหัสนี้',
    body: html`<div class="org-form">
      <div class="field" data-field="code">
        <label for="co-code">รหัสบริษัท<span class="req">*</span></label>
        <input class="input" id="co-code" maxlength="10" value="${c?.code ?? ''}" ${creating ? '' : raw('readonly')} placeholder="เช่น HLM" style="text-transform:uppercase" />
        <span class="hint">2–10 ตัว ตัวอักษรอังกฤษพิมพ์ใหญ่ / ตัวเลข</span>
      </div>
      <div class="field" data-field="color">
        <label for="co-color">สี <span class="muted small">(แถบพนักงานหน้าภาพรวม)</span></label>
        <span class="row" style="gap:8px">
          <input type="color" id="co-color" value="${c?.color || companyColor(c?.code ?? '')}" />
          <label class="chip-pick"><input type="checkbox" id="co-color-auto" ${c && !c.color ? raw('checked') : ''} /> สีอัตโนมัติ</label>
        </span>
      </div>
      <div class="field full" data-field="name">
        <label for="co-name">ชื่อ<span class="req">*</span></label>
        <input class="input" id="co-name" maxlength="150" value="${c?.name ?? ''}" placeholder="ชื่อที่แสดงในระบบ" />
      </div>
      <div class="field full" data-field="legalName">
        <label for="co-legal">ชื่อตามทะเบียน</label>
        <input class="input" id="co-legal" maxlength="200" value="${c?.legalName ?? ''}" placeholder="เช่น บริษัท … จำกัด (ใช้ในไฟล์แจ้งประกัน)" />
      </div>
    </div>`,
    read: (el) => ({
      code: (c?.code ?? el.querySelector('#co-code').value).trim().toUpperCase(),
      name: el.querySelector('#co-name').value.trim(),
      legalName: el.querySelector('#co-legal').value.trim(),
      color: el.querySelector('#co-color-auto').checked ? '' : el.querySelector('#co-color').value,
    }),
    validate: (v) => validateCompany(v, companies, creating),
    save: async (v) => {
      await api.saveCompany(v, creating);
      await reload();
      toast.success(creating ? `เพิ่มบริษัท ${v.code} แล้ว` : `บันทึกบริษัท ${v.code} แล้ว`);
    },
  });
}

async function moveCompany(i, dir) {
  const order = companies.map((c) => c.code);
  [order[i], order[i + dir]] = [order[i + dir], order[i]];
  try {
    companies = await api.saveCompanyOrder(order);
    await refreshCatalog();
    draw();
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

// ===================== ประเภทพนักงาน =====================
let types = [];
let typesReady = true;

function companiesText(list) {
  return list === null ? html`<span class="muted">ทุกบริษัท</span>` : list.join(', ');
}
function typesView() {
  return html`${sectionHead(
      'ประเภทพนักงาน',
      'ใช้แยกกฎประกันกลุ่ม / ชุดฟอร์ม · พฤติกรรมของแต่ละประเภทตั้งได้ (บริษัทที่ใช้ได้ · กลุ่ม/ฝ่าย+ระดับ · ตำแหน่ง · รอบแจ้งรายวัน) · รหัสเปลี่ยนไม่ได้',
      'data-ty-add',
      'เพิ่มประเภท',
    )}
    ${typesReady ? '' : alertBox({ tone: 'warning', body: 'ยังแก้ไม่ได้ — ต้องรัน migration backend/sql/015_org_settings.sql ก่อน (ตอนนี้ใช้ประเภทตั้งต้นในระบบ)' })}
    <div class="table-wrap org-table-wrap">
      <table class="table org-table">
        <thead>
          <tr><th>ประเภท</th><th>รหัส</th><th>ใช้กับบริษัท</th><th>พฤติกรรม</th><th class="num">พนักงาน</th><th class="num">กฎ</th>${canEditOrg && typesReady ? html`<th></th>` : ''}</tr>
        </thead>
        <tbody>
          ${types.map((t) => {
            const blocked = blockedBy(t, [['employeeCount', 'พนักงาน'], ['ruleCount', 'กฎสวัสดิการ']]);
            const flags = BEHAVIORS.filter(([k]) => t[k]);
            return html`<tr>
              <td>
                <span class="two-line">${badge(t.name, t.tone, { dot: false })}${t.description ? html`<span class="sub">${t.description}</span>` : ''}</span>
              </td>
              <td><code class="org-code-text">${t.code}</code></td>
              <td>${companiesText(t.companies)}</td>
              <td>${flags.length ? html`<span class="org-flags">${flags.map(([, label]) => html`<span class="chip-tag">${label}</span>`)}</span>` : html`<span class="muted">–</span>`}</td>
              <td class="num">${t.employeeCount === undefined ? html`<span class="muted">–</span>` : num(t.employeeCount)}</td>
              <td class="num">${t.ruleCount === undefined ? html`<span class="muted">–</span>` : num(t.ruleCount)}</td>
              ${typesReady ? actions('ty', t.code, t.name, blocked) : ''}
            </tr>`;
          })}
        </tbody>
      </table>
    </div>`;
}

function chipPicks(name, options, selected, all) {
  const isAll = selected === null;
  return html`<div class="chip-picks" role="group">
    <label class="chip-pick all"><input type="checkbox" data-all="${name}" ${isAll ? raw('checked') : ''} /> ${all}</label>
    ${options.map(
      (o) => html`<label class="chip-pick"><input type="checkbox" data-pick="${name}" value="${o}" ${!isAll && selected.includes(o) ? raw('checked') : ''} ${isAll ? raw('disabled') : ''} /> ${o}</label>`,
    )}
  </div>`;
}

function openType(t = null) {
  const creating = !t;
  const base = t ?? { code: '', name: '', description: '', companies: null, usesDeptGroup: false, usesPosition: false, dailyCycle: false, tone: 'neutral' };
  editor({
    title: creating ? 'เพิ่มประเภทพนักงาน' : `แก้ไขประเภท ${t.name}`,
    description: creating
      ? 'ประเภทใหม่เลือกได้ทันทีในตารางพนักงาน และตั้งกฎประกันกลุ่ม / ชุดฟอร์มของประเภทนี้ได้ที่หน้าเงื่อนไขสวัสดิการ'
      : `พนักงาน ${t.employeeCount ?? 0} คน · กฎ ${t.ruleCount ?? 0} ข้อ ใช้ประเภทนี้ — แก้พฤติกรรมแล้วมีผลกับการคำนวณสิทธิทันที`,
    body: html`<div class="org-form">
      <div class="field" data-field="code">
        <label for="ty-code">รหัส<span class="req">*</span></label>
        <input class="input" id="ty-code" maxlength="20" value="${base.code}" ${creating ? '' : raw('readonly')} placeholder="เช่น CONTRACT" style="text-transform:uppercase" />
        <span class="hint">2–20 ตัว ตัวอักษรอังกฤษพิมพ์ใหญ่ / ตัวเลข / _</span>
      </div>
      <div class="field" data-field="name">
        <label for="ty-name">ชื่อ<span class="req">*</span></label>
        <input class="input" id="ty-name" maxlength="100" value="${base.name}" placeholder="เช่น พนักงานสัญญาจ้าง" />
      </div>
      <div class="field full" data-field="description">
        <label for="ty-desc">คำอธิบาย</label>
        <input class="input" id="ty-desc" maxlength="255" value="${base.description}" placeholder="ใครอยู่ในประเภทนี้" />
      </div>
      <div class="field full" data-field="companies">
        <label>ใช้กับบริษัท<span class="req">*</span></label>
        ${chipPicks('ty-co', COMPANY_CODES, base.companies, 'ทุกบริษัท')}
      </div>
      <div class="field full">
        <label>พฤติกรรม</label>
        <div class="org-behaviors">
          ${BEHAVIORS.map(
            ([k, label, desc]) => html`<label class="org-behavior"><input type="checkbox" data-flag="${k}" ${base[k] ? raw('checked') : ''} /><span><b>${label}</b><small>${desc}</small></span></label>`,
          )}
        </div>
      </div>
      <div class="field full" data-field="tone">
        <label>สีป้าย<span class="req">*</span></label>
        <div class="org-tones" role="radiogroup">
          ${TYPE_TONES.map(
            (tone) => html`<label class="org-tone"><input type="radio" name="ty-tone" value="${tone}" ${tone === base.tone ? raw('checked') : ''} />${badge(base.name || TONE_LABEL[tone], tone, { dot: false })}</label>`,
          )}
        </div>
      </div>
    </div>`,
    onOpen: (el) => {
      el.addEventListener('change', (e) => {
        const all = e.target.closest('[data-all]');
        if (all) el.querySelectorAll(`[data-pick="${all.dataset.all}"]`).forEach((i) => (i.disabled = all.checked));
      });
      // ชื่อในตัวอย่างสีป้ายเปลี่ยนตามที่พิมพ์
      el.querySelector('#ty-name').addEventListener('input', (e) => {
        el.querySelectorAll('.org-tone .badge').forEach((b, i) => (b.lastChild.textContent = e.target.value.trim() || TONE_LABEL[TYPE_TONES[i]]));
      });
    },
    read: (el) => ({
      code: (t?.code ?? el.querySelector('#ty-code').value).trim().toUpperCase(),
      name: el.querySelector('#ty-name').value.trim(),
      description: el.querySelector('#ty-desc').value.trim(),
      companies: el.querySelector('[data-all="ty-co"]').checked ? null : [...el.querySelectorAll('[data-pick="ty-co"]:checked')].map((i) => i.value),
      ...Object.fromEntries(BEHAVIORS.map(([k]) => [k, el.querySelector(`[data-flag="${k}"]`).checked])),
      tone: el.querySelector('[name="ty-tone"]:checked')?.value ?? '',
    }),
    validate: (v) => validateEmployeeType(v, types, COMPANY_CODES, creating),
    save: async (v) => {
      await api.saveEmployeeType(v, creating);
      await reload();
      toast.success(creating ? `เพิ่มประเภท ${v.name} แล้ว` : `บันทึกประเภท ${v.name} แล้ว`);
    },
  });
}

// ===================== กลุ่ม / ฝ่าย =====================
let groups = [];
let groupsReady = true;

function groupsView() {
  return html`${sectionHead(
      'กลุ่ม / ฝ่าย',
      'ใช้กับประเภทที่ตั้ง “กลุ่ม/ฝ่าย + ระดับ” (เช่น ส่วนกลาง) — เลือกในตารางพนักงาน และแยกจำนวนชุดฟอร์มในกฎ · เปลี่ยนชื่อ = ชื่อในพนักงานและกฎทุกฉบับเปลี่ยนตาม',
      'data-dg-add',
      'เพิ่มกลุ่ม / ฝ่าย',
    )}
    ${groupsReady ? '' : alertBox({ tone: 'warning', body: 'ยังแก้ไม่ได้ — ต้องรัน migration backend/sql/014_dept_groups.sql ก่อน (ตอนนี้ใช้รายการตั้งต้นในระบบ)' })}
    <div class="table-wrap org-table-wrap">
      <table class="table org-table">
        <thead><tr><th>ชื่อกลุ่ม / ฝ่าย</th><th class="num">พนักงาน</th><th class="num">กฎชุดฟอร์ม</th>${canEditOrg && groupsReady ? html`<th></th>` : ''}</tr></thead>
        <tbody>
          ${groups.length
            ? groups.map((g) => {
                const blocked = blockedBy(g, [['employeeCount', 'พนักงาน'], ['ruleCount', 'กฎชุดฟอร์ม']]);
                return html`<tr>
                  <td>${g.name}</td>
                  <td class="num">${g.employeeCount === null ? html`<span class="muted">–</span>` : num(g.employeeCount)}</td>
                  <td class="num">${g.ruleCount === null ? html`<span class="muted">–</span>` : num(g.ruleCount)}</td>
                  ${groupsReady ? actions('dg', g.id, g.name, blocked) : ''}
                </tr>`;
              })
            : html`<tr><td colspan="4">${emptyState({ iconName: 'users', title: 'ยังไม่มีกลุ่ม / ฝ่าย' })}</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function openGroup(g = null) {
  editor({
    title: g ? 'เปลี่ยนชื่อกลุ่ม / ฝ่าย' : 'เพิ่มกลุ่ม / ฝ่าย',
    description: g ? `ชื่อในพนักงาน ${g.employeeCount} คน และกฎชุดฟอร์มทุกฉบับ (รวมประวัติ) จะเปลี่ยนตาม` : 'กลุ่มใหม่เลือกได้ทันทีในตารางพนักงานและในกฎชุดฟอร์ม',
    body: html`<div class="field" data-field="name">
      <label for="dg-name">ชื่อกลุ่ม / ฝ่าย<span class="req">*</span></label>
      <input class="input" id="dg-name" maxlength="100" value="${g?.name ?? ''}" placeholder="เช่น ฝ่ายบัญชี" />
    </div>`,
    read: (el) => ({ id: g?.id, name: el.querySelector('#dg-name').value.trim() }),
    validate: (v) => validateDeptGroup(v.name, groups, g?.id ?? 0),
    save: async (v) => {
      if (g && v.name === g.name) return;
      await api.saveDeptGroup(v);
      await reload();
      toast.success(g ? 'เปลี่ยนชื่อแล้ว' : 'เพิ่มกลุ่ม / ฝ่ายแล้ว');
    },
  });
}

// ===================== โหลด / วาด =====================
let root = null;
let current = 'companies';

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
/** โหลดใหม่ทั้งสามส่วน (จำนวนที่ใช้ข้ามกัน เช่น ลบบริษัท → ประเภทที่จำกัดบริษัท) + แจ้งทั้งระบบ */
async function reload() {
  const [cs] = await Promise.all([api.listCompanies({ usage: true }), loadTypes(), loadGroups()]);
  companies = cs;
  await refreshCatalog();
  draw();
}

function draw() {
  if (!root) return;
  render(root, html`<div class="org-panel">${current === 'companies' ? companiesView() : current === 'types' ? typesView() : groupsView()}</div>`);
}

/** แสดงแท็บ (companies | types | groups) ใน el — โหลดครั้งแรกเมื่อเปิดแท็บ */
export async function showOrgTab(el, tab) {
  const first = root === null;
  root = el;
  current = tab;
  if (!first) return draw();
  render(root, loader({ text: 'กำลังโหลด' }));
  wire(el);
  try {
    await reload();
  } catch (e) {
    render(root, html`<div class="panel-pad">${errorState(e)}</div>`);
  }
}

function wire(el) {
  on(el, 'click', '[data-co-add]', () => openCompany());
  on(el, 'click', '[data-co-edit]', (_e, b) => openCompany(companies.find((c) => c.code === b.dataset.coEdit)));
  on(el, 'click', '[data-co-up]', (_e, b) => moveCompany(Number(b.dataset.coUp), -1));
  on(el, 'click', '[data-co-down]', (_e, b) => moveCompany(Number(b.dataset.coDown), 1));
  on(el, 'click', '[data-co-del]', async (_e, b) => {
    const c = companies.find((x) => x.code === b.dataset.coDel);
    if (await ask(`ลบบริษัท ${c.code}?`, `${c.name} — ลบแล้วเลือกบริษัทนี้ไม่ได้อีก (ประวัติเก่าเก็บรหัสไว้ในตัว)`, () => api.deleteCompany(c.code), `ลบบริษัท ${c.code} แล้ว`)) await reload();
  });
  on(el, 'click', '[data-ty-add]', () => openType());
  on(el, 'click', '[data-ty-edit]', (_e, b) => openType(types.find((t) => t.code === b.dataset.tyEdit)));
  on(el, 'click', '[data-ty-del]', async (_e, b) => {
    const t = types.find((x) => x.code === b.dataset.tyDel);
    if (await ask(`ลบประเภท “${t.name}”?`, 'ลบแล้วเลือกประเภทนี้ไม่ได้อีก — ประวัติกฎเก่าที่เคยใช้ยังเก็บไว้', () => api.deleteEmployeeType(t.code), `ลบประเภท ${t.name} แล้ว`)) await reload();
  });
  on(el, 'click', '[data-dg-add]', () => openGroup());
  on(el, 'click', '[data-dg-edit]', (_e, b) => openGroup(groups.find((g) => g.id === Number(b.dataset.dgEdit))));
  on(el, 'click', '[data-dg-del]', async (_e, b) => {
    const g = groups.find((x) => x.id === Number(b.dataset.dgDel));
    if (await ask(`ลบกลุ่ม / ฝ่าย “${g.name}”?`, 'ลบแล้วเลือกกลุ่มนี้ไม่ได้อีก — ประวัติกฎเก่าที่เคยใช้ชื่อนี้ยังเก็บชื่อไว้', () => api.deleteDeptGroup(g.id), `ลบ “${g.name}” แล้ว`)) await reload();
  });
}
