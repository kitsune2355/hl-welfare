// ตัวขับเคลื่อน "แนะนำการใช้งาน" (driver.js) — ปกติไม่ต้องแก้ไฟล์นี้
// ตั้งค่า: tour/tour.config.js · เนื้อหา: tour/steps.js · ธีม: app.css หัวข้อ "Tour"
import { getParam } from '../shared/dom.js';
import { TOUR_CONFIG as C } from '../tour/tour.config.js';
import { TOUR_STEPS } from '../tour/steps.js';

let loading = null;
let active = null;

/** โหลด driver.js + css เมื่อใช้งานครั้งแรก (ไม่โหลดถ้าผู้ใช้ไม่เปิดแนะนำ) */
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

const seenKey = (page) => `${C.storageKey}:${page}`;

function hasSeen(page) {
  try {
    return localStorage.getItem(seenKey(page)) === String(C.version) || localStorage.getItem('hl-tour-disabled') === '1';
  } catch {
    return true; // อ่าน localStorage ไม่ได้ → ไม่เปิดอัตโนมัติ (กันเปิดซ้ำทุกครั้ง)
  }
}

function markSeen(page) {
  try {
    localStorage.setItem(seenKey(page), String(C.version));
  } catch {
    /* ignore */
  }
}

/** element ต้องมีอยู่ มองเห็น และอยู่ในจอแนวนอน (เช่น sidebar ที่ถูกซ่อนบนมือถือจะถูกข้าม) */
function visible(el) {
  if (!el || !el.getClientRects().length) return false;
  const s = getComputedStyle(el);
  if (s.visibility === 'hidden' || s.display === 'none') return false;
  const r = el.getBoundingClientRect();
  return r.right > 0 && r.left < window.innerWidth;
}

/** รอจนข้อมูลในหน้าโหลด (selector ready) หรือหมดเวลา */
function waitFor(selector, timeout) {
  if (!selector) return Promise.resolve();
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (document.querySelector(selector) || Date.now() - t0 > timeout) resolve();
      else setTimeout(tick, 100);
    };
    tick();
  });
}

export function hasTour(page) {
  return C.enabled && !!TOUR_STEPS[page]?.steps?.length;
}

/** เริ่มแนะนำการใช้งานของหน้า */
export async function startTour(page) {
  const def = TOUR_STEPS[page];
  if (!hasTour(page) || active?.isActive?.()) return;
  await Promise.all([loadDriver(), waitFor(def.ready, C.readyTimeout)]);

  const steps = def.steps
    .map((s) => {
      const el = s.element ? document.querySelector(s.element) : null;
      if (s.element && !visible(el)) return null; // ไม่มีในหน้า/ถูกซ่อน → ข้าม
      return {
        element: el ?? undefined,
        popover: { title: s.title, description: s.text, side: s.side, align: s.align },
      };
    })
    .filter(Boolean);
  if (!steps.length) return;

  active = window.driver.js.driver({
    ...C.driver,
    steps,
    onDestroyed: () => {
      active = null;
    },
  });
  active.drive();
  markSeen(page); // จำตั้งแต่เริ่ม — ผู้ใช้เปลี่ยนหน้ากลางคันก็จะไม่เด้งซ้ำ (เปิดเองได้ที่ปุ่ม ?)
}

/** เรียกจาก shell: ผูกปุ่ม ? และเปิดอัตโนมัติครั้งแรก */
export function initTour(page, helpButton) {
  if (!hasTour(page)) {
    helpButton?.remove();
    return;
  }
  if (helpButton) {
    if (!C.showHelpButton) helpButton.remove();
    else helpButton.onclick = () => startTour(page);
  }
  const forced = getParam('tour') === '1';
  if (forced || (C.autoStart && !hasSeen(page))) {
    waitFor(TOUR_STEPS[page].ready, C.readyTimeout).then(() =>
      setTimeout(() => {
        // ไม่เปิดทับ modal ที่ผู้ใช้เปิดอยู่
        if (!document.querySelector('.modal-layer')) startTour(page);
      }, C.autoStartDelay),
    );
  }
}
