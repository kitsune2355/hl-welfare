// แถบแท็บของ "ตั้งค่าสวัสดิการ" — เมนูเดียว ครอบ 2 หน้า: sites.html (เริ่มต้นตั้งค่า + องค์กร) และ rules.html (เงื่อนไขสวัสดิการ)
//
//   เรียงตามลำดับที่ต้องตั้ง (เลขขั้นตรงกับการ์ดในแท็บเริ่มต้นตั้งค่า — pages/_orgSetup.js):
//     เริ่มต้นตั้งค่า | องค์กร: 1 บริษัท · 2 ประเภทพนักงาน · 3 กลุ่ม/ฝ่าย · 4 หน่วยงาน
//                     | เงื่อนไขสวัสดิการ: 5 ประกันกลุ่ม · 6 ชุดฟอร์ม · ค่าตั้งค่า · รอมีผล
//   แท็บของหน้าเดียวกัน = สลับในหน้า (onSelect) · แท็บของอีกหน้า = ลิงก์ไปหน้านั้น
//   แท็บที่บัญชีนี้ไม่มีสิทธิ์ดูหน้า (sites.view / rules.view) ไม่แสดง
import { can } from '../app/auth.js';
import { html, raw } from '../shared/dom.js';
import { icon } from '../shared/icons.js';

/** @type {({group: string} | {value: string, label: string, step?: number, page: 'sites'|'rules', hint: string})[]} */
export const SETTINGS_TABS = [
  { value: 'setup', label: 'เริ่มต้นตั้งค่า', page: 'sites', icon: 'list-checks', hint: 'ตั้งค่าตามลำดับขั้น — แต่ละขั้นบอกว่าทำแล้วหรือยัง ขาดอะไร และปุ่มไปตั้งค่า' },
  { group: 'องค์กร' },
  { value: 'companies', step: 1, label: 'บริษัท', page: 'sites', hint: 'บริษัทในเครือ — รหัสใช้ทั้งระบบ · ทำเป็นอย่างแรก' },
  { value: 'types', step: 2, label: 'ประเภทพนักงาน', page: 'sites', hint: 'กลุ่มพนักงานที่ได้สิทธิ์ต่างกัน และพฤติกรรมของแต่ละประเภท' },
  { value: 'groups', step: 3, label: 'กลุ่ม / ฝ่าย', page: 'sites', hint: 'ฝ่ายของพนักงานประเภทที่ใช้ระดับ (เช่น ส่วนกลาง)' },
  { value: 'sites', step: 4, label: 'หน่วยงาน', page: 'sites', hint: 'สำนักงาน / โครงการ / ไซต์ ที่พนักงานประจำ — ดับเบิลคลิกเพื่อแก้ แล้วกด “บันทึก”' },
  { group: 'เงื่อนไขสวัสดิการ' },
  { value: 'insurance', step: 5, label: 'ประกันกลุ่ม', page: 'rules', hint: 'ใครได้ประกันกลุ่ม เมื่อทำงานครบกี่วัน — แก้ได้ทันทีหรือตั้งล่วงหน้าด้วย “วันที่มีผล”' },
  { value: 'uniform', step: 6, label: 'ชุดฟอร์ม', page: 'rules', hint: 'ใครได้ชุดอะไรกี่ตัวในแต่ละรอบ (เริ่มงาน / ผ่านทดลองงาน / ประจำปี)' },
  { value: 'settings', label: 'ค่าตั้งค่า', page: 'rules', hint: 'ตัวเลขที่ใช้ทั้งระบบ เช่น วันรอบแจ้งประกัน และเดือนแจกชุดประจำปี' },
  { value: 'pending', label: 'รอมีผล', page: 'rules', hint: 'การเปลี่ยนที่ตั้งวันที่มีผลไว้ล่วงหน้า — ถึงวันแล้วระบบใช้เอง' },
];

const PAGE_CAP = { sites: 'sites.view', rules: 'rules.view' };
const visible = (t) => !t.page || can(PAGE_CAP[t.page]);
const href = (t) => `${t.page}.html${t.value === (t.page === 'sites' ? 'setup' : 'insurance') ? '' : `?tab=${t.value}`}`;

export const settingsTab = (value) => SETTINGS_TABS.find((t) => t.value === value) ?? null;

/**
 * แถบแท็บ — active = แท็บที่เปิดอยู่ · counts = { [value]: { count, tone } } (ตัวเลขบนแท็บ)
 */
export function settingsTabs(active, counts = {}) {
  const items = SETTINGS_TABS.filter((t) => t.group || visible(t));
  // หัวกลุ่มแสดงเมื่อมีแท็บที่เห็นต่อท้าย (ไม่มีสิทธิ์ทั้งกลุ่ม = ไม่มีหัวกลุ่มลอย ๆ)
  const shown = items.filter((t, i) => !t.group || (items[i + 1] && !items[i + 1].group));
  return html`<nav class="tabs settings-tabs" role="tablist" aria-label="ตั้งค่าสวัสดิการ">
    ${shown.map((t) => {
      if (t.group) return html`<span class="settings-group" aria-hidden="true">${t.group}</span>`;
      const on = t.value === active;
      const c = counts[t.value];
      return html`<a class="tab${on ? ' active' : ''}" role="tab" aria-selected="${on}" href="${href(t)}" data-tab="${t.value}" data-page="${t.page}"
        >${t.icon ? raw(icon(t.icon)) : t.step ? html`<span class="tab-step num">${t.step}</span>` : ''}${t.label}${c?.count !== undefined
          ? html` <span class="count num ${c.tone ? `tone-${c.tone}` : ''}">${c.count}</span>`
          : ''}</a
      >`;
    })}
  </nav>`;
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
