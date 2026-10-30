// ตัวขับเคลื่อน "คู่มือทีละขั้น" (driver.js) — ปกติไม่ต้องแก้ไฟล์นี้
// เนื้อหา: tour/guides.js · ตั้งค่า: tour/tour.config.js · ธีม: app.css หัวข้อ "Tour" · โหมดฝึก: app/practice.js
//
//   ปุ่ม ?  → เมนู "อยากทำอะไร?" (เรื่องของหน้านี้อยู่บนสุด) → เลือก → เข้าโหมดฝึก (ข้อมูลตัวอย่าง) → พาทำทีละขั้น
//   ขั้นที่อยู่อีกหน้า → จำว่าถึงขั้นไหน (sessionStorage) แล้วไปหน้านั้น → หน้านั้นทำต่อเอง
//   เข้าหน้าครั้งแรก → การ์ดเล็กมุมขวาล่าง "มีคู่มือเรื่อง …" (ไม่เปิดเอง — ผู้ใช้เลือกเอง)
import { getParam, html, raw } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { TOUR_CONFIG as C } from '../tour/tour.config.js';
import { GUIDES } from '../tour/guides.js';
import { openModal, toast } from '../ui/overlay.js';
import { api, PRACTICE } from './api.js';
import { can } from './auth.js';
import { enterPractice, exitPractice } from './practice.js';

/**
 * @typedef {{page: string, href?: string | ((h: object) => Promise<string>), before?: (h: object) => any,
 *   element?: string, title: string, text: string, side?: string, align?: string}} GuideStep
 * @typedef {{id: string, title: string, summary: string, icon: string, minutes: number, pages: string[],
 *   practice?: boolean, need?: string, steps: GuideStep[]}} Guide
 */

const STATE_KEY = 'hl-guide'; // sessionStorage: { id, i } — คู่มือที่ทำค้างอยู่ (ข้ามหน้า)
let loading = null;
let active = null;
let currentPage = () => '';
const exposed = new Map();

/** หน้าเว็บส่งของที่คู่มือต้องใช้ (เช่น ตาราง) — exposeForTour('grid', grid) */
export function exposeForTour(name, obj) {
  exposed.set(name, obj);
}

/** โหลด driver.js + css เมื่อใช้งานครั้งแรก */
function loadDriver() {
  if (window.driver?.js?.driver) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${C.vendorPath}driver.css`;
    document.head.prepend(css); // ไว้ก่อน app.css เพื่อให้ธีมของเราทับได้
    const js = document.createElement('script');
    js.src = `${C.vendorPath}driver.js.iife.js`;
    js.onload = () => resolve();
    js.onerror = () => reject(new Error('โหลด driver.js ไม่สำเร็จ'));
    document.head.append(js);
  });
  return loading;
}

const store = {
  get(k, s = sessionStorage) {
    try {
      return JSON.parse(s.getItem(k) ?? 'null');
    } catch {
      return null;
    }
  },
  set(k, v, s = sessionStorage) {
    try {
      if (v === null) s.removeItem(k);
      else s.setItem(k, JSON.stringify(v));
    } catch {
      /* ใช้ storage ไม่ได้ — คู่มือข้ามหน้าไม่ได้ แต่หน้าเดียวยังใช้ได้ */
    }
  },
};
const disabled = () => store.get('hl-tour-disabled', localStorage) === 1;

/** หน้า (id แนะนำของหน้า/แท็บ) ตรงกับขั้นไหม — 'sites' ตรงกับ 'sites-companies' ด้วย */
const onPage = (page) => {
  const cur = currentPage();
  return !page || cur === page || cur.startsWith(`${page}-`);
};
const guideById = (id) => GUIDES.find((g) => g.id === id);
const allowed = (g) => !g.need || can(g.need);

/** element ตัวแรกที่มองเห็น (selector หลายตัวคั่นด้วย ,) */
function find(selector) {
  if (!selector) return undefined;
  for (const el of document.querySelectorAll(selector)) {
    if (!el.getClientRects().length) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.right > 0 && r.left < window.innerWidth) return el;
  }
  return undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = C.readyTimeout) {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < timeout) await sleep(100);
}

/** ตัวช่วยที่ส่งให้ before / href ของแต่ละขั้น (tour/guides.js) */
const helpers = {
  api,
  sleep,
  until,
  get: (name) => exposed.get(name),
  wait: (selector, timeout) => until(() => !!find(selector), timeout),
  click(selector) {
    document.querySelector(selector)?.click();
  },
  /** พิมพ์ในช่อง (ช่องค้นหารอ 250ms ก่อนกรอง) */
  async type(selector, text) {
    const input = document.querySelector(selector);
    if (!input) return;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(450);
  },
  /** กดแท็บ (ui/components.js tabs) แล้วรอวาดใหม่ */
  async clickTab(value) {
    const tab = document.querySelector(`.tab[data-tab="${value}"]`);
    if (tab && !tab.classList.contains('active')) {
      tab.click();
      await sleep(500);
    }
  },
};

async function runBefore(step) {
  try {
    await step.before?.(helpers);
  } catch (err) {
    console.warn('[คู่มือ] ทำขั้นตัวอย่างไม่สำเร็จ', err);
  }
  if (step.element) await helpers.wait(step.element, 2500);
}

/** ไปหน้าของขั้น i (จำไว้ว่าถึงไหน แล้วหน้านั้นทำต่อเอง) */
async function goTo(guide, i) {
  const step = guide.steps[i];
  let href = step.href;
  if (typeof href === 'function') href = await href(helpers).catch(() => null);
  store.set(STATE_KEY, { id: guide.id, i });
  location.href = href || location.href;
}
/** ขั้น i ต้องเปลี่ยนหน้าก่อนไหม */
const needsNav = (step) => !!step.href && (typeof step.href === 'function' || !onPage(step.page));

function finish(guide) {
  store.set(STATE_KEY, null);
  store.set(`hl-guide-done:${guide.id}`, 1, localStorage);
  active?.destroy();
}

/** เริ่ม/ทำต่อคู่มือจากขั้น i บนหน้านี้ */
async function drive(guide, i) {
  if (active?.isActive?.()) active.destroy();
  await loadDriver();
  const steps = guide.steps;
  let busy = false;
  let leaving = false;

  const onAnyScroll = () => active?.refresh();
  document.addEventListener('scroll', onAnyScroll, true);

  const move = async (to) => {
    if (busy) return;
    if (to >= steps.length) return finish(guide);
    busy = true;
    // ระหว่างทำตัวอย่าง/เปลี่ยนหน้า — ปุ่มถัดไปกดไม่ได้ (ผู้ใช้รู้ว่าระบบกำลังทำ)
    const next = document.querySelector('.driver-popover-next-btn');
    if (next) {
      next.disabled = true;
      next.textContent = 'รอสักครู่…';
    }
    if (needsNav(steps[to])) {
      leaving = true;
      return goTo(guide, to);
    }
    await runBefore(steps[to]);
    store.set(STATE_KEY, { id: guide.id, i: to });
    busy = false;
    active.moveTo(to);
  };

  active = window.driver.js.driver({
    ...C.driver,
    steps: steps.map((s, k) => ({
      element: s.element ? () => find(s.element) : undefined,
      popover: {
        title: s.title,
        description: s.text,
        side: s.side,
        align: s.align,
        // ย้อนกลับได้เฉพาะขั้นที่อยู่หน้าเดียวกัน
        showButtons: k > 0 && !needsNav(s) && (steps[k - 1].page ?? s.page) === s.page ? ['next', 'previous', 'close'] : ['next', 'close'],
      },
    })),
    onNextClick: () => move(active.getActiveIndex() + 1),
    onPrevClick: () => {
      const k = active.getActiveIndex();
      if (k > 0 && !busy) active.moveTo(k - 1);
    },
    onHighlightStarted: (el) => el?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'instant' }),
    onDestroyed: () => {
      document.removeEventListener('scroll', onAnyScroll, true);
      active = null;
      if (leaving) return;
      // ปิดกลางทาง (× / Esc) — ไม่ทำต่อเมื่อเปลี่ยนหน้า
      if (store.get(STATE_KEY)) {
        store.set(STATE_KEY, null);
        if (PRACTICE) toast.success('ยังอยู่ในโหมดฝึก — กด “ออกจากโหมดฝึก” ที่แถบสีเหลืองด้านบนเมื่อเสร็จ');
      }
    },
  });
  await runBefore(steps[i]);
  store.set(STATE_KEY, { id: guide.id, i });
  active.drive(i);
}

/** เริ่มคู่มือ — เรื่องที่ใช้ข้อมูลตัวอย่างจะเข้าโหมดฝึกก่อน (โหลดหน้าใหม่) */
export async function startGuide(id) {
  const guide = guideById(id);
  if (!guide || !C.enabled) return;
  const practice = guide.practice !== false;
  if (practice && !PRACTICE) {
    enterPractice();
    return goTo(guide, 0); // โหลดหน้าใหม่ด้วยข้อมูลตัวอย่าง (ขั้นแรกทำต่อเอง)
  }
  if (!practice && PRACTICE) {
    // เรื่องที่ใช้ข้อมูลจริง (เช่น ผู้ดูแลระบบ) — ออกจากโหมดฝึกก่อน
    store.set(STATE_KEY, { id: guide.id, i: 0 });
    const href = guide.steps[0].href;
    return exitPractice({ keepGuide: true, href: typeof href === 'string' ? href : '' });
  }
  if (needsNav(guide.steps[0])) return goTo(guide, 0);
  drive(guide, 0);
}

// ---------- เมนู "อยากทำอะไร?" ----------
export function openGuideMenu() {
  const page = currentPage();
  const list = GUIDES.filter(allowed);
  const here = list.filter((g) => g.pages.some((p) => p === page || page.startsWith(`${p}-`)));
  const others = list.filter((g) => !here.includes(g));
  const item = (g, rec) => html`<button type="button" class="guide-item${rec ? ' rec' : ''}" data-guide="${g.id}">
    <span class="guide-ic">${raw(icon(g.icon))}</span>
    <span class="guide-text"><b>${g.title}</b><small>${g.summary}</small></span>
    <span class="guide-meta">${store.get(`hl-guide-done:${g.id}`, localStorage) ? html`<span class="guide-done">${raw(icon('check'))} เคยดูแล้ว</span>` : ''}<small>${g.minutes} นาที</small></span>
  </button>`;
  const m = openModal({
    title: 'อยากทำอะไร?',
    description: 'เลือกเรื่อง แล้วระบบจะพาทำทีละขั้น — ฝึกกับข้อมูลตัวอย่าง ไม่กระทบข้อมูลจริง',
    size: 'md',
    body: html`<div class="guide-menu">
      ${here.length ? html`<p class="guide-group">แนะนำสำหรับหน้านี้</p>${here.map((g) => item(g, true))}` : ''}
      ${others.length ? html`<p class="guide-group">เรื่องอื่น</p>${others.map((g) => item(g, false))}` : ''}
    </div>`,
    footer: html`${PRACTICE ? html`<button class="btn foot-start" data-exit-practice>${raw(icon('log-out'))} ออกจากโหมดฝึก</button>` : ''}<button class="btn btn-ghost" data-close>ปิด</button>`,
  });
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-guide]');
    if (b) {
      m.close();
      startGuide(b.dataset.guide);
    }
    if (e.target.closest('[data-exit-practice]')) exitPractice();
  });
}

// ---------- การ์ด "มีคู่มือ" เมื่อเข้าหน้าครั้งแรก ----------
function offerKey(page) {
  return `${C.storageKey}:${page}`;
}
/** เข้าหน้า/แท็บครั้งแรก → การ์ดเล็กเสนอคู่มือของหน้านี้ (ไม่เปิดเอง) */
export function startTourIfNew(page, force = false) {
  if (!C.enabled || active?.isActive?.() || store.get(STATE_KEY)) return;
  const guide = GUIDES.filter(allowed).find((g) => g.pages.includes(page));
  if (!guide) return;
  if (force) return startGuide(guide.id);
  if (!C.autoStart || disabled() || PRACTICE || store.get(offerKey(page), localStorage) === C.version) return;
  store.set(offerKey(page), C.version, localStorage);
  document.querySelector('.guide-offer')?.remove();
  const card = document.createElement('div');
  card.className = 'guide-offer';
  card.setAttribute('role', 'status');
  card.innerHTML = String(html`<span class="guide-ic">${raw(icon(guide.icon))}</span>
    <div class="guide-text"><small>ใช้หน้านี้ครั้งแรก? มีคู่มือทีละขั้น</small><b>${guide.title}</b></div>
    <div class="guide-offer-actions">
      <button class="btn btn-primary btn-sm" data-go>ดูวิธีทำ</button>
      <button class="btn btn-ghost btn-sm" data-later>ไม่ต้อง</button>
    </div>`);
  card.querySelector('[data-go]').onclick = () => {
    card.remove();
    startGuide(guide.id);
  };
  card.querySelector('[data-later]').onclick = () => card.remove();
  setTimeout(() => document.body.append(card), C.autoStartDelay);
  setTimeout(() => card.remove(), 20000);
}

// ---------- แถบ "โหมดฝึก" ----------
function practiceBar() {
  const bar = document.createElement('div');
  bar.className = 'practice-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = String(html`${raw(icon('graduation-cap'))}
    <span><b>โหมดฝึกใช้งาน</b> — ข้อมูลในหน้านี้เป็นตัวอย่าง กดหรือแก้อะไรก็ได้ ไม่กระทบข้อมูลจริง</span>
    <button class="btn btn-sm" data-guides>เลือกเรื่องอื่น</button>
    <button class="btn btn-sm btn-primary" data-exit>ออกจากโหมดฝึก</button>`);
  bar.querySelector('[data-guides]').onclick = openGuideMenu;
  bar.querySelector('[data-exit]').onclick = () => exitPractice();
  document.querySelector('.app')?.prepend(bar);
}

/**
 * เรียกจาก shell: ผูกปุ่ม ? · แถบโหมดฝึก · ทำคู่มือที่ค้างต่อ · การ์ดเสนอคู่มือครั้งแรก
 * @param {string | (() => string)} page  id ของหน้า/แท็บ (ฟังก์ชัน = หน้าที่มีหลายแท็บ อ่านค่าตอนใช้)
 */
export function initTour(page, helpButton) {
  currentPage = () => (typeof page === 'function' ? page() : page) || '';
  if (!C.enabled || !C.showHelpButton) helpButton?.remove();
  else if (helpButton) helpButton.onclick = openGuideMenu;
  if (PRACTICE) practiceBar();
  if (!C.enabled) return;

  const state = store.get(STATE_KEY);
  const guide = state && guideById(state.id);
  if (guide && guide.steps[state.i]) {
    const step = guide.steps[state.i];
    // ถูกพามาหน้านี้เพื่อทำขั้นนี้ต่อ (รอข้อมูลในหน้าโหลดก่อน)
    if (guide.practice !== false && !PRACTICE) return startGuide(guide.id);
    if (onPage(step.page)) {
      helpers.wait(step.element || 'body', C.readyTimeout).then(() => setTimeout(() => drive(guide, state.i), 300));
      return;
    }
    store.set(STATE_KEY, null);
  }
  startTourIfNew(currentPage(), getParam('tour') === '1');
}
