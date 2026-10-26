// โครงหน้าที่ใช้ร่วมกันทุกหน้า: sidebar (เมนู + ตัวนับงานค้าง), topbar (ค้นหา + สลับธีม), drawer บนมือถือ
//
// ทุกหน้าเรียก:  import { initPage } from './app/shell.js';  initPage('employees');
// แล้วใส่เนื้อหาใน <main id="page" class="page"> ของไฟล์ HTML
import { getParam, html, raw, setParams } from '../shared/dom.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import { enhanceSelects } from '../ui/combobox.js';
import { avatar, emptyState } from '../ui/components.js';
import { toast } from '../ui/overlay.js';
import { API_MODE, api } from './api.js';
import './catalog.js'; // บริษัท + ประเภทพนักงานที่ตั้งค่าไว้ — โหลดก่อนหน้าเริ่มวาด (top-level await)
import { can, isAuthEnabled, logout, refreshSessionUser, requireSession } from './auth.js';
import { installNavigationProgress, progress } from '../ui/loading.js';
import { initTour } from './tour.js';
import { initNotifications } from './notifications.js';
import { applyFontSize, getFontSize } from './fontSize.js';

const MENU = [
  { id: 'dashboard', href: 'index.html', label: 'ภาพรวม & ติดตามงาน', icon: 'layout-dashboard', cap: 'dashboard.view' },
  { id: 'employees', href: 'employees.html', label: 'พนักงาน', icon: 'users', cap: 'employees.view' },
  { id: 'insurance', href: 'insurance.html', label: 'ประกันกลุ่ม', icon: 'shield-plus', cap: 'insurance.view', count: (d) => d.urgentPending, tone: 'danger' },
  { id: 'uniform', href: 'uniform.html', label: 'ชุดฟอร์ม', icon: 'shirt', cap: 'uniform.view', count: (d) => d.uniformPending, tone: 'warning' },
];
// "ตั้งค่าสวัสดิการ" = เมนูเดียวของ 2 หน้า (sites.html = เริ่มต้นตั้งค่า + องค์กร · rules.html = เงื่อนไขสวัสดิการ)
//   แถบแท็บร่วมกัน (pages/_settingsTabs.js) · สิทธิ์ยังแยกหน้า: sites.view / rules.view — มีอย่างใดอย่างหนึ่งก็เห็นเมนู
//   pages = id ของหน้าที่ไฮไลต์เมนูนี้ · hidden = มีไว้ตรวจสิทธิ์ของหน้า (guardPage) ไม่แสดงในเมนู
const SETTINGS = [
  { id: 'settings', href: 'sites.html', label: 'ตั้งค่าสวัสดิการ', icon: 'building-2', anyCap: ['sites.view', 'rules.view'], pages: ['sites', 'rules'] },
  { id: 'sites', href: 'sites.html', label: 'ตั้งค่าสวัสดิการ (องค์กร)', cap: 'sites.view', hidden: true },
  { id: 'rules', href: 'rules.html', label: 'ตั้งค่าสวัสดิการ (เงื่อนไข)', cap: 'rules.view', hidden: true },
  { id: 'insurers', href: 'insurers.html', label: 'แบบฟอร์มประกัน', icon: 'file-spreadsheet', cap: 'insurers.view' },
];
// cap = สิทธิ์ที่ต้องมีจึงเห็นเมนู/เปิดหน้าได้ (ตั้งที่ “กำหนดสิทธิ์การใช้งาน”) · anyCap = มีอย่างใดอย่างหนึ่ง · roles = เฉพาะบทบาทเหล่านี้
// SUPER_ADMIN เห็นทุกเมนู · เซิร์ฟเวอร์ตรวจสิทธิ์ซ้ำทุกคำขอ
const ADMIN = [
  { id: 'admin-users', href: 'admin.html?tab=users', label: 'ผู้ใช้ระบบ', icon: 'users', cap: 'users.manage' },
  { id: 'admin-permissions', href: 'admin.html?tab=permissions', label: 'กำหนดสิทธิ์การใช้งาน', icon: 'shield-check', roles: ['SUPER_ADMIN'] },
  {
    id: 'admin-system',
    href: 'admin.html?tab=system',
    label: 'ระบบ & ความปลอดภัย',
    icon: 'activity',
    anyCap: ['security.view', 'system.health', 'system.settings', 'audit.view'],
  },
];

/** HR บริษัท: บอกบริษัทที่ดูแล (เห็นข้อมูลเฉพาะบริษัทนั้น) */
const scopeText = (user) => (user.companyCode === '' ? ' · ยังไม่ได้กำหนดบริษัท' : user.companyCode ? ` · ${user.companyCode}` : '');

/** เมนูที่ผู้ใช้นี้เห็น */
/** บัญชีของฉัน — ทุกคนที่ login (หน้า account.html) */
const ACCOUNT = [
  { id: 'account-password', href: 'account.html#password', label: 'เปลี่ยนรหัสผ่าน', icon: 'key-round' },
  { id: 'account-font', href: 'account.html#font', label: 'ขนาดตัวอักษร', icon: 'type' },
];

const allowedFor = (user) => (m) =>
  (!m.roles || m.roles.includes(user.roleCode)) && (!m.cap || can(m.cap)) && (!m.anyCap || m.anyCap.some((c) => can(c)));
const PAGES = [...MENU, ...SETTINGS, ...ADMIN];

/**
 * ไม่มีสิทธิ์เปิดหน้านี้ → ไปหน้าแรกที่เปิดได้ (?denied=หน้าเดิม แจ้งเตือนที่นั่น) · ไม่มีหน้าไหนเลย → แสดงข้อความในหน้า
 * โยน error เพื่อหยุดสคริปต์ของหน้าที่เปิดไม่ได้ (ไม่ให้ยิง API ต่อ)
 */
function guardPage(active, user) {
  const page = PAGES.find((m) => m.id === active);
  if (!page || allowedFor(user)(page)) return;
  const first = PAGES.find(allowedFor(user));
  if (first) location.replace(`${first.href}?denied=${encodeURIComponent(page.label)}`);
  else
    document.getElementById('page').innerHTML = String(
      emptyState({ iconName: 'lock', title: 'บัญชีนี้ยังไม่มีสิทธิ์ใช้หน้าใดเลย', description: 'ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์' }),
    );
  throw new Error(`ไม่มีสิทธิ์เปิดหน้า ${page.label}`);
}

/** เมนูด้านล่าง (มือถือ <768px) — 4 หน้าหลัก + "เพิ่มเติม" (เปิดเมนูเต็ม: เงื่อนไข, หน่วยงาน, แบบฟอร์มประกัน, ผู้ใช้) */
const BOTTOM_NAV = ['dashboard', 'employees', 'insurance', 'uniform'];
const BOTTOM_LABEL = { dashboard: 'ภาพรวม', employees: 'พนักงาน', insurance: 'ประกัน', uniform: 'ชุดฟอร์ม' };

/**
 * มือถือ: ปัดขึ้น (เลื่อนอ่านต่อลงไป) = ซ่อนเมนูด้านล่าง · ปัดลง = แสดงกลับ
 * ฟังการเลื่อนแบบ capture จึงใช้ได้ทั้ง window, .page และกล่องที่เลื่อนภายใน
 * ปรับความไวได้ที่ HIDE_AFTER (เลื่อนพ้นด้านบนกี่ px ถึงเริ่มซ่อน) และ MIN_DELTA (ต้องเลื่อนอย่างน้อยกี่ px ต่อครั้ง)
 */
function autoHideBottomNav() {
  const HIDE_AFTER = 56;
  const MIN_DELTA = 8;
  const lastTop = new WeakMap();
  const setHidden = (hide) => document.body.classList.toggle('bn-hide', hide);
  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target === document ? document.scrollingElement : e.target;
      if (!(el instanceof Element)) return;
      const top = el.scrollTop;
      const prev = lastTop.get(el);
      if (prev === undefined) return lastTop.set(el, top);
      const dy = top - prev;
      if (Math.abs(dy) < MIN_DELTA) return; // เลื่อนแนวนอน / ขยับนิดเดียว ไม่นับ
      lastTop.set(el, top);
      if (document.body.classList.contains('drawer-open')) return;
      setHidden(dy > 0 && top > HIDE_AFTER);
    },
    { capture: true, passive: true },
  );
  // เปลี่ยนหน้า/แท็บ (เช่น กดย้อนกลับ) → แสดงเมนูเสมอ
  window.addEventListener('pageshow', () => setHidden(false));
}

// ----- ธีม: ค่าเริ่มต้น = สว่าง, โหมดมืดเปิดเมื่อผู้ใช้กดเท่านั้น -----
const THEME_KEY = 'hl-theme';
const isDark = () => document.documentElement.dataset.theme === 'dark';
function toggleTheme() {
  const dark = !isDark();
  if (dark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  try {
    if (dark) localStorage.setItem(THEME_KEY, 'dark');
    else localStorage.removeItem(THEME_KEY);
  } catch {
    /* ignore */
  }
  drawThemeButton();
}
function drawThemeButton() {
  const b = document.getElementById('theme-btn');
  if (!b) return;
  b.innerHTML = icon(isDark() ? 'sun' : 'moon');
  b.setAttribute('aria-label', isDark() ? 'โหมดสว่าง' : 'โหมดมืด');
  b.title = b.getAttribute('aria-label');
}

function navLink(item, active) {
  // ตั้งค่าสวัสดิการ: ไม่มีสิทธิ์หน้าองค์กร = เปิดที่หน้าเงื่อนไข
  const hrefOf = item.id === 'settings' && !can('sites.view') ? 'rules.html' : item.href;
  const on = item.id === active || item.pages?.includes(active);
  return html`<a href="${hrefOf}" class="${on ? 'active' : ''}" data-nav="${item.id}"
    >${raw(icon(item.icon))}<span>${item.label}</span><b class="nav-count hidden ${item.tone ?? ''}"></b
  ></a>`;
}

/**
 * สร้าง sidebar + topbar รอบ <main id="page"> แล้วแปลง <i data-icon> และ <select data-combobox> ในหน้า
 * @param {string} active  id ของเมนูที่เลือก
 * @param {{ tour?: string | (() => string) }} [opts]  tour = id ของเนื้อหาแนะนำใน tour/steps.js (ค่าเริ่มต้น = active)
 *   ใส่เป็นฟังก์ชันได้ เมื่อหน้ามีหลายแท็บและแต่ละแท็บมีคำแนะนำของตัวเอง
 */
export function initPage(active, { tour = active } = {}) {
  const user = requireSession(); // ยังไม่ login → ไปหน้า login.html
  if (!user) return;
  applyFontSize(getFontSize()); // หน้าที่ยังไม่มีสคริปต์ใน <head> ก็ได้ขนาดตัวอักษรเหมือนกัน
  // ผู้ดูแลตั้ง/รีเซ็ตรหัสให้ (เช่น 4123) → ต้องเปลี่ยนรหัสเองก่อนใช้หน้าอื่น (เซิร์ฟเวอร์ก็ตอบ 403 ทุก API)
  if (user.mustChangePassword && !active.startsWith('account')) {
    const here = `${location.pathname.split('/').pop() || 'index.html'}${location.search}`;
    location.replace(`account.html?force=1&next=${encodeURIComponent(here)}#password`);
    throw new Error('ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน');
  }
  guardPage(active, user);
  const main = document.getElementById('page');
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.innerHTML = String(html`<div class="brand">
      <img src="favicon.svg" alt="" />
      <div><b>HL Welfare</b><span>ระบบสวัสดิการพนักงาน</span></div>
    </div>
    <nav class="nav" aria-label="เมนูหลัก">
      ${MENU.filter(allowedFor(user)).map((m) => navLink(m, active))}
      ${SETTINGS.some(allowedFor(user)) ? html`<div class="nav-section">ตั้งค่า</div>${SETTINGS.filter((m) => !m.hidden && allowedFor(user)(m)).map((m) => navLink(m, active))}` : ''}
      <div class="nav-section">บัญชีของฉัน</div>
      ${ACCOUNT.map((m) => navLink(m, active))}
      ${ADMIN.some(allowedFor(user)) ? html`<div class="nav-section">ผู้ดูแลระบบ</div>${ADMIN.filter(allowedFor(user)).map((m) => navLink(m, active))}` : ''}
    </nav>
    <div class="sidebar-foot">
      ${API_MODE === 'mock' ? html`<button class="reset-btn" id="reset-btn">${raw(icon('rotate-ccw'))} รีเซ็ตข้อมูลจำลอง</button>` : ''}
      <!-- ผู้ใช้ที่เข้าสู่ระบบ — ยึดล่างสุดของ sidebar -->
      <div class="sidebar-user" title="${user.name} · ${user.role}${scopeText(user)}">
        ${avatar(user.name)}
        <span class="user-text"><b>${user.name}</b><small>${user.role}${scopeText(user)}</small></span>
        ${isAuthEnabled() ? html`<button class="btn-icon sm" id="logout-btn" aria-label="ออกจากระบบ" title="ออกจากระบบ">${raw(icon('log-out'))}</button>` : ''}
      </div>
    </div>`);

  const app = document.createElement('div');
  app.className = 'app';
  app.innerHTML = String(html`<header class="topbar">
    <div class="topbar-start">
      <button class="btn-icon menu-btn" id="menu-btn" aria-label="เปิดเมนู">${raw(icon('menu'))}</button>
      <a class="topbar-logo" href="index.html" aria-label="HL Welfare หน้าแรก"><img src="favicon.svg" alt="" /><span>HL Welfare</span></a>
    </div>
    <div class="topbar-end">
      <button class="btn-icon noti-btn" id="noti-btn" aria-label="การแจ้งเตือน" aria-haspopup="dialog" aria-expanded="false" title="การแจ้งเตือน">${raw(icon('bell'))}<span class="noti-badge" hidden></span></button>
      <button class="btn-icon" id="help-btn" aria-label="แนะนำการใช้งาน" title="แนะนำการใช้งาน">${raw(icon('circle-help'))}</button>
      <button class="btn-icon" id="theme-btn"></button>
    </div>
  </header>`);

  const bottom = document.createElement('nav');
  bottom.className = 'bottom-nav';
  bottom.setAttribute('aria-label', 'เมนูด้านล่าง');
  const inMore = !BOTTOM_NAV.includes(active);
  bottom.innerHTML = String(
    html`${BOTTOM_NAV.filter((id) => allowedFor(user)(MENU.find((x) => x.id === id))).map((id) => {
        const m = MENU.find((x) => x.id === id);
        return html`<a href="${m.href}" class="bn-item${id === active ? ' active' : ''}" data-nav="${id}" ${id === active ? raw('aria-current="page"') : ''}>
          <span class="bn-ico">${raw(icon(m.icon))}<b class="nav-count hidden ${m.tone ?? ''}"></b></span>
          <span>${BOTTOM_LABEL[id]}</span>
        </a>`;
      })}
      <button type="button" class="bn-item${inMore ? ' active' : ''}" id="more-btn" aria-label="เมนูเพิ่มเติม">
        <span class="bn-ico">${raw(icon('layout-grid'))}</span>
        <span>เพิ่มเติม</span>
      </button>`,
  );

  main.before(sidebar);
  main.before(app);
  app.append(main);
  document.body.append(bottom);

  // ----- events -----
  const closeDrawer = () => {
    document.body.classList.remove('drawer-open');
    document.querySelector('body > .backdrop')?.remove();
  };
  const openDrawer = () => {
    if (document.body.classList.contains('drawer-open')) return closeDrawer();
    document.body.classList.add('drawer-open');
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    bd.onclick = closeDrawer;
    document.body.append(bd);
  };
  document.getElementById('menu-btn').onclick = openDrawer;
  document.getElementById('more-btn').onclick = openDrawer;
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());
  autoHideBottomNav();
  document.getElementById('theme-btn').onclick = toggleTheme;
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  drawThemeButton();

  document.getElementById('reset-btn')?.addEventListener('click', async () => {
    if (!confirm('รีเซ็ตข้อมูลจำลองทั้งหมดกลับเป็นค่าตั้งต้น?')) return;
    await api.reset?.();
    toast.success('รีเซ็ตข้อมูลจำลองแล้ว');
    setTimeout(() => location.reload(), 400);
  });

  hydrateIcons(main);
  enhanceSelects(main);
  refreshCounts();
  // ถูกพามาจากหน้าที่ไม่มีสิทธิ์
  if (getParam('denied')) {
    toast.error(`บัญชีนี้ไม่มีสิทธิ์เปิดหน้า “${getParam('denied')}” — ติดต่อผู้ดูแลระบบ`);
    setParams({ denied: '' });
  }
  // บทบาท/สิทธิ์อาจถูกเปลี่ยนหลัง login → อ่านใหม่เงียบ ๆ เปลี่ยนแล้วโหลดหน้าใหม่ (เมนู/ปุ่มตามสิทธิ์ล่าสุด)
  progress.quiet(refreshSessionUser).then((changed) => changed && location.reload(), () => {});
  initTour(tour, document.getElementById('help-btn')); // แนะนำการใช้งาน (driver.js)
  installNavigationProgress(); // คลิกลิงก์ → แถบ loading วิ่งทันที
  installEmployeePopup();
  initNotifications(document.getElementById('noti-btn')); // กระดิ่งแจ้งเตือน (app/notifications.js)
}

/**
 * ลิงก์ employee.html?id= ทุกหน้า → เปิดรายละเอียดเป็น popup แทนเปลี่ยนหน้า
 * ฟังแบบ capture จึงทำงานก่อน loading ของการเปลี่ยนหน้า · Ctrl/⌘/กลางเมาส์/target=_blank/data-page = เปิดหน้าเต็มตามปกติ
 */
function installEmployeePopup() {
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('data-page')) return;
      const url = new URL(a.href, location.href);
      const id = Number(url.searchParams.get('id'));
      if (url.origin !== location.origin || !url.pathname.endsWith('/employee.html') || !id) return;
      e.preventDefault();
      import('../pages/_employeeDetail.js').then((m) => m.openEmployeeDetail(id));
    },
    true,
  );
}

/** อัปเดตตัวนับงานค้างในเมนู (เรียกซ้ำหลังบันทึกข้อมูลได้) */
export async function refreshCounts() {
  try {
    const d = await progress.quiet(() => api.getDashboard()); // ตัวนับในเมนู = งานเบื้องหลัง
    for (const m of MENU) {
      if (!m.count) continue;
      const n = m.count(d);
      document.querySelectorAll(`[data-nav="${m.id}"] .nav-count`).forEach((el) => {
        el.textContent = String(n);
        el.classList.toggle('hidden', n === 0);
      });
    }
  } catch {
    /* ตัวนับไม่สำคัญพอจะแจ้ง error */
  }
}
