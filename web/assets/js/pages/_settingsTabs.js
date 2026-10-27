// แถบแท็บของ "ตั้งค่าสวัสดิการ" — เมนูเดียว ครอบ 3 หน้า: sites.html (องค์กร) · rules.html (เงื่อนไขสวัสดิการ)
//   · welfare-setup.html (สวัสดิการเพิ่มเติมที่ HR สร้างเอง)
//
//   เรียงตามลำดับที่ต้องตั้ง (เลขขั้นตรงกับกล่องอธิบาย — pages/_settingsAbout.js):
//     องค์กร: 1 บริษัท · 2 ประเภทพนักงาน · 3 กลุ่ม/ฝ่าย · 4 หน่วยงาน
//     | เงื่อนไขสวัสดิการ: 5 ประกันกลุ่ม · 6 ชุดฟอร์ม · ค่าตั้งค่า · รอมีผล
//   แท็บของหน้าเดียวกัน = สลับในหน้า (onSelect) · แท็บของอีกหน้า = ลิงก์ไปหน้านั้น
//   แท็บที่บัญชีนี้ไม่มีสิทธิ์ดูหน้า (sites.view / rules.view) ไม่แสดง
import { can } from '../app/auth.js';
import { html, raw } from '../shared/dom.js';
import { icon } from '../shared/icons.js';

/** @type {({group: string} | {value: string, label: string, step?: number, icon?: string, page: 'sites'|'rules'|'welfare-setup', hint: string})[]} */
export const SETTINGS_TABS = [
  { group: 'องค์กร' },
  { value: 'companies', step: 1, label: 'บริษัท', page: 'sites', hint: 'บริษัทในเครือ — รหัสใช้ทั้งระบบ · ตั้งค่าเรียงตามเลขบนแท็บ เริ่มที่นี่' },
  { value: 'types', step: 2, label: 'ประเภทพนักงาน', page: 'sites', hint: 'กลุ่มพนักงานที่ได้สิทธิ์ต่างกัน และพฤติกรรมของแต่ละประเภท' },
  { value: 'groups', step: 3, label: 'กลุ่ม / ฝ่าย', page: 'sites', hint: 'ฝ่ายของพนักงานประเภทที่ใช้ระดับ (เช่น ส่วนกลาง)' },
  { value: 'sites', step: 4, label: 'หน่วยงาน', page: 'sites', hint: 'สำนักงาน / โครงการ / ไซต์ ที่พนักงานประจำ — ดับเบิลคลิกเพื่อแก้ แล้วกด “บันทึก”' },
  { group: 'เงื่อนไขสวัสดิการ' },
  { value: 'insurance', step: 5, label: 'ประกันกลุ่ม', page: 'rules', hint: 'ใครได้ประกันกลุ่ม เมื่อทำงานครบกี่วัน — แก้ได้ทันทีหรือตั้งล่วงหน้าด้วย “วันที่มีผล”' },
  { value: 'uniform', step: 6, label: 'ชุดฟอร์ม', page: 'rules', hint: 'ใครได้ชุดอะไรกี่ตัวในแต่ละรอบ (เริ่มงาน / ผ่านทดลองงาน / ประจำปี)' },
  { value: 'settings', label: 'ค่าตั้งค่า', page: 'rules', hint: 'ตัวเลขที่ใช้ทั้งระบบ เช่น วันรอบแจ้งประกัน และเดือนแจกชุดประจำปี' },
  { value: 'pending', label: 'รอมีผล', page: 'rules', hint: 'การเปลี่ยนที่ตั้งวันที่มีผลไว้ล่วงหน้า — ถึงวันแล้วระบบใช้เอง' },
  { group: 'สวัสดิการเพิ่มเติม' },
  {
    value: 'programs',
    icon: 'gift',
    label: 'สวัสดิการเพิ่มเติม',
    page: 'welfare-setup',
    hint: 'สร้างสวัสดิการใหม่ได้เอง (เช่น ค่าคลอดบุตร ทุนการศึกษา) — เงื่อนไขผู้มีสิทธิ์ รอบการให้ และช่องข้อมูลที่บันทึก · แต่ละอันมีเมนูของตัวเองใน sidebar',
  },
];

// สวัสดิการเพิ่มเติม: ดูได้ด้วยสิทธิ์เดียวกับหน้าเงื่อนไข (rules.view) · สร้าง/แก้ = welfare.manage
const PAGE_CAP = { sites: 'sites.view', rules: 'rules.view', 'welfare-setup': 'rules.view' };
const FIRST_TAB = { sites: 'companies', rules: 'insurance', 'welfare-setup': 'programs' };
const visible = (t) => !t.page || can(PAGE_CAP[t.page]);
const href = (t) => `${t.page}.html${t.value === FIRST_TAB[t.page] ? '' : `?tab=${t.value}`}`;

export const settingsTab = (value) => SETTINGS_TABS.find((t) => t.value === value) ?? null;

/**
 * แถบแท็บ — active = แท็บที่เปิดอยู่ · counts = { [value]: { count, tone } } (ตัวเลขบนแท็บ)
 */
export function settingsTabs(active, counts = {}) {
  // แบ่งเป็นช่วงตามกลุ่ม — หัวกลุ่มเป็นป้ายเล็กเหนือแท็บของกลุ่ม (ไม่ใช่ปุ่ม กดไม่ได้)
  const parts = [];
  for (const t of SETTINGS_TABS) {
    if (t.group) parts.push({ group: t.group, tabs: [] });
    else if (visible(t)) (parts.at(-1)?.group ? parts.at(-1).tabs : (parts.push({ tabs: [] }), parts.at(-1).tabs)).push(t);
  }
  const tab = (t) => {
    const on = t.value === active;
    const c = counts[t.value];
    return html`<a class="tab${on ? ' active' : ''}" role="tab" aria-selected="${on}" href="${href(t)}" data-tab="${t.value}" data-page="${t.page}"
      >${t.icon ? raw(icon(t.icon)) : t.step ? html`<span class="tab-step num">${t.step}</span>` : ''}${t.label}${c?.count !== undefined
        ? html` <span class="count num ${c.tone ? `tone-${c.tone}` : ''}">${c.count}</span>`
        : ''}</a
    >`;
  };
  return html`<nav class="tabs settings-tabs" role="tablist" aria-label="ตั้งค่าสวัสดิการ">
    ${parts
      .filter((p) => p.tabs.length) // ไม่มีสิทธิ์ทั้งกลุ่ม = ไม่แสดงหัวกลุ่ม
      .map((p) =>
        p.group
          ? html`<div class="settings-group" role="presentation">
              <span class="settings-group-label" aria-hidden="true">${p.group}</span>
              <div class="settings-group-tabs">${p.tabs.map(tab)}</div>
            </div>`
          : p.tabs.map(tab),
      )}
  </nav>`;
}

/** เลื่อนแถบแท็บ (แนวนอน) ให้เห็นแท็บที่เลือก — เรียกหลังวาดแถบ */
export function revealActiveTab(el) {
  const nav = el.querySelector('.settings-tabs') ?? el;
  const a = nav.querySelector('.tab.active');
  if (a && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
}

/** คลิกแท็บของหน้านี้ = สลับในหน้า (ไม่โหลดใหม่) · แท็บของอีกหน้า = ปล่อยให้ลิงก์พาไป */
export function wireSettingsTabs(el, page, onSelect) {
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tab]');
    if (!a || a.dataset.page !== page || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    onSelect(a.dataset.tab);
  });
}
