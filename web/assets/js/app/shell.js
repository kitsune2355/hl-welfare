// โครงหน้าที่ใช้ร่วมกันทุกหน้า: sidebar (เมนู + ตัวนับงานค้าง), topbar (ค้นหา + สลับธีม), drawer บนมือถือ
//
// ทุกหน้าเรียก:  import { initPage } from './app/shell.js';  initPage('employees');
// แล้วใส่เนื้อหาใน <main id="page" class="page"> ของไฟล์ HTML
import { html, raw } from '../shared/dom.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import { enhanceSelects } from '../ui/combobox.js';
import { avatar, badge } from '../ui/components.js';
import { toast } from '../ui/overlay.js';
import { API_MODE, api } from './api.js';
import { isAuthEnabled, logout, requireSession } from './auth.js';
import { initTour } from './tour.js';

const MENU = [
  { id: 'dashboard', href: 'index.html', label: 'ภาพรวม & ติดตามงาน', icon: 'layout-dashboard' },
  { id: 'employees', href: 'employees.html', label: 'พนักงาน', icon: 'users' },
  { id: 'insurance', href: 'insurance.html', label: 'ประกันกลุ่ม', icon: 'shield-plus', count: (d) => d.urgentPending, tone: 'danger' },
  { id: 'pvd', href: 'pvd.html', label: 'กองทุนสำรองฯ', icon: 'piggy-bank' },
  { id: 'uniform', href: 'uniform.html', label: 'ชุดฟอร์ม', icon: 'shirt', count: (d) => d.uniformPending, tone: 'warning' },
];
const SETTINGS = [
  { id: 'rules', href: 'rules.html', label: 'เงื่อนไขสวัสดิการ', icon: 'book-open-text' },
  { id: 'sites', href: 'sites.html', label: 'หน่วยงาน', icon: 'building-2' },
];

/** เมนูด้านล่าง (มือถือ <768px) — 4 หน้าหลัก + "เพิ่มเติม" (เปิดเมนูเต็ม: PVD, เงื่อนไข, หน่วยงาน, ผู้ใช้) */
const BOTTOM_NAV = ['dashboard', 'employees', 'insurance', 'uniform'];
const BOTTOM_LABEL = { dashboard: 'ภาพรวม', employees: 'พนักงาน', insurance: 'ประกัน', uniform: 'ชุดฟอร์ม' };

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
  return html`<a href="${item.href}" class="${item.id === active ? 'active' : ''}" data-nav="${item.id}"
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
  const main = document.getElementById('page');
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.innerHTML = String(html`<div class="brand">
      <img src="favicon.svg" alt="" />
      <div><b>HL Welfare</b><span>ระบบสวัสดิการพนักงาน</span></div>
    </div>
    <nav class="nav" aria-label="เมนูหลัก">
      ${MENU.map((m) => navLink(m, active))}
      <div class="nav-section">ตั้งค่า</div>
      ${SETTINGS.map((m) => navLink(m, active))}
    </nav>
    <div class="sidebar-foot">
      <div class="row">แหล่งข้อมูล ${API_MODE === 'mock' ? badge('Mock data', 'warning') : badge('API', 'success')}</div>
      ${API_MODE === 'mock' ? html`<button class="reset-btn" id="reset-btn">${raw(icon('rotate-ccw'))} รีเซ็ตข้อมูลจำลอง</button>` : ''}
      <!-- ผู้ใช้ที่เข้าสู่ระบบ — ยึดล่างสุดของ sidebar -->
      <div class="sidebar-user" title="${user.name} · ${user.role}">
        ${avatar(user.name)}
        <span class="user-text"><b>${user.name}</b><small>${user.role}</small></span>
        ${isAuthEnabled() ? html`<button class="btn-icon sm" id="logout-btn" aria-label="ออกจากระบบ" title="ออกจากระบบ">${raw(icon('log-out'))}</button>` : ''}
      </div>
    </div>`);

  const app = document.createElement('div');
  app.className = 'app';
  app.innerHTML = String(html`<header class="topbar">
    <div class="topbar-start">
      <button class="btn-icon menu-btn" id="menu-btn" aria-label="เปิดเมนู">${raw(icon('menu'))}</button>
      <a class="topbar-logo" href="index.html" aria-label="HL Welfare หน้าแรก"><img src="favicon.svg" alt="" /></a>
    </div>
    <form class="search" role="search" id="global-search">
      ${raw(icon('search'))}
      <input class="input" name="q" placeholder="ค้นหาพนักงาน…" aria-label="ค้นหาพนักงาน" autocomplete="off" />
      <span class="kbd">/</span>
    </form>
    <div class="topbar-end">
      <button class="btn-icon" id="help-btn" aria-label="แนะนำการใช้งาน" title="แนะนำการใช้งาน">${raw(icon('circle-help'))}</button>
      <button class="btn-icon" id="theme-btn"></button>
    </div>
  </header>`);

  const bottom = document.createElement('nav');
  bottom.className = 'bottom-nav';
  bottom.setAttribute('aria-label', 'เมนูด้านล่าง');
  const inMore = !BOTTOM_NAV.includes(active);
  bottom.innerHTML = String(
    html`${BOTTOM_NAV.map((id) => {
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
  document.getElementById('theme-btn').onclick = toggleTheme;
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  drawThemeButton();

  const search = document.getElementById('global-search');
  search.onsubmit = (e) => {
    e.preventDefault();
    location.href = `employees.html?q=${encodeURIComponent(search.q.value.trim())}`;
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      search.q.focus();
    }
  });

  document.getElementById('reset-btn')?.addEventListener('click', async () => {
    if (!confirm('รีเซ็ตข้อมูลจำลองทั้งหมดกลับเป็นค่าตั้งต้น?')) return;
    await api.reset?.();
    toast.success('รีเซ็ตข้อมูลจำลองแล้ว');
    setTimeout(() => location.reload(), 400);
  });

  hydrateIcons(main);
  enhanceSelects(main);
  refreshCounts();
  initTour(tour, document.getElementById('help-btn')); // แนะนำการใช้งาน (driver.js)
}

/** อัปเดตตัวนับงานค้างในเมนู (เรียกซ้ำหลังบันทึกข้อมูลได้) */
export async function refreshCounts() {
  try {
    const d = await api.getDashboard();
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
