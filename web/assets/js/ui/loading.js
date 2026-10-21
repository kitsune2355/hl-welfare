// Loading กลางของทั้งระบบ
//
//   progress.start() / progress.done()   loading กลางจอ (โลโก้ + วงแหวนหมุน) — api ทุกตัวเรียกให้อัตโนมัติ (app/api.js)
//                                        แสดงเมื่อรอเกิน 250ms · ระหว่างแสดงกดหน้าจอไม่ได้ (กันกดซ้ำ)
//   progress.track(promise)              เริ่ม + จบให้เองเมื่อ promise เสร็จ
//   progress.quiet(fn)                   งานเบื้องหลัง (รีเฟรชอัตโนมัติ ตัวนับในเมนู) — ไม่ขึ้น loading
//   spinner({ size, onColor })           วงแหวนหมุน (sm 16 · md 28 · lg 44) — onColor = ใช้สีตัวอักษร (บนปุ่มสี)
//   loader({ text, size, logo })         spinner + ข้อความ จัดกึ่งกลาง (ใช้แทนเนื้อหาระหว่างโหลด) · logo = มีโลโก้ตรงกลาง
//   busy(button, fn, { label })          ปุ่มเป็นสถานะกำลังทำงานระหว่างรอ fn() แล้วคืนค่าเดิม
//   installNavigationProgress()          คลิกลิงก์ไปหน้าอื่น → loading กลางจอระหว่างรอหน้าใหม่ (shell เรียกให้)
//
// ตารางยังใช้ skeleton (เห็นโครงก่อนข้อมูลมา) — loader ใช้กับพื้นที่ที่ไม่รู้รูปร่างล่วงหน้า เช่น modal
import { html, raw } from '../shared/dom.js';

/** แสดงหลังรอเกินนี้ (ms) — งานที่เสร็จเร็วกว่านี้ไม่กระพริบ */
const SHOW_AFTER = 250;
/** แสดงแล้วต้องอยู่อย่างน้อยเท่านี้ (ms) — ไม่วูบหายจนมองไม่ทัน */
const MIN_VISIBLE = 400;

let overlay = null;
let pending = 0;
let quiet = 0;
let showTimer = null;
let finishTimer = null;
let shownAt = 0;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'ld-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = String(html`<div class="ld-card">
    <span class="ld-mark">${spinner({ size: 'lg' })}<img src="favicon.svg" alt="" class="ld-logo" /></span>
    <span class="ld-text">กำลังโหลด<span class="ld-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>
  </div>`);
  document.body.append(overlay);
  return overlay;
}

function show() {
  showTimer = null;
  // หน้าล็อกอินมี animation ของตัวเอง (ปุ่มหมุน + เครื่องหมายถูก) — ไม่แสดง loading กลางจอเลย
  if (document.body.classList.contains('login-body')) return;
  clearTimeout(finishTimer);
  shownAt = performance.now();
  ensureOverlay().classList.add('active');
  document.documentElement.setAttribute('aria-busy', 'true');
}

function finish() {
  clearTimeout(showTimer);
  showTimer = null;
  if (!overlay?.classList.contains('active')) {
    document.documentElement.removeAttribute('aria-busy');
    return;
  }
  // แสดงมาไม่ถึงขั้นต่ำ → รอให้ครบก่อนค่อยหาย
  const wait = MIN_VISIBLE - (performance.now() - shownAt);
  if (wait > 0) {
    clearTimeout(finishTimer);
    finishTimer = setTimeout(() => pending === 0 && finish(), wait);
    return;
  }
  document.documentElement.removeAttribute('aria-busy');
  overlay.classList.remove('active');
}

export const progress = {
  start() {
    pending++;
    clearTimeout(finishTimer);
    if (pending === 1 && !showTimer && !overlay?.classList.contains('active')) showTimer = setTimeout(show, SHOW_AFTER);
  },
  done() {
    pending = Math.max(0, pending - 1);
    if (pending === 0) finish();
  },
  /** @template T @param {Promise<T>} p @returns {Promise<T>} */
  track(p) {
    if (quiet > 0) return p; // งานเบื้องหลัง (รีเฟรชอัตโนมัติ / ตัวนับในเมนู) ไม่ขึ้น loading
    progress.start();
    return Promise.resolve(p).finally(() => progress.done());
  },
  /** ทำ fn เงียบ ๆ — api ที่เรียกระหว่างนี้ไม่แสดง loading กลางจอ */
  async quiet(fn) {
    quiet++;
    try {
      return await fn();
    } finally {
      quiet--;
    }
  },
};

const SIZES = { sm: 16, md: 28, lg: 44 };

/** วงแหวนหมุน gradient */
export function spinner({ size = 'md', onColor = false } = {}) {
  const px = SIZES[size] ?? size;
  return html`<span class="ld-ring${onColor ? ' on-color' : ''}" style="--ld:${px}px" role="presentation"></span>`;
}

/** spinner + ข้อความ จัดกึ่งกลางพื้นที่ (role=status ให้โปรแกรมอ่านหน้าจอประกาศ) */
export function loader({ text = 'กำลังโหลด', size = 'md', logo = false, compact = false } = {}) {
  return html`<div class="ld-block${compact ? ' compact' : ''}" role="status" aria-live="polite">
    <span class="ld-mark">
      ${spinner({ size: logo ? 'lg' : size })}
      ${logo ? raw('<img src="favicon.svg" alt="" class="ld-logo" />') : ''}
    </span>
    <span class="ld-text">${text}<span class="ld-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>
  </div>`;
}

/**
 * ปุ่มเป็นสถานะกำลังทำงานระหว่าง fn() — ปิดการกดซ้ำ, ใส่ spinner, aria-busy · เสร็จแล้วคืนหน้าตาเดิม
 * @template T @param {HTMLButtonElement} button @param {() => Promise<T>} fn @param {{label?: string}} [o]
 * @returns {Promise<T>}
 */
export async function busy(button, fn, { label } = {}) {
  if (!button) return fn();
  const before = button.innerHTML;
  const wasDisabled = button.disabled;
  const onColor = /btn-(primary|danger)/.test(button.className);
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.classList.add('is-busy');
  const text = label ?? button.dataset.label ?? button.textContent.trim();
  button.innerHTML = `${spinner({ size: 'sm', onColor })}<span>${text}</span>`;
  try {
    return await fn();
  } finally {
    // ปุ่มอาจถูก render ใหม่ไปแล้ว (หลุดจาก DOM) — คืนค่าก็ไม่เสียหาย
    button.innerHTML = before;
    button.disabled = wasDisabled;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-busy');
  }
}

/** คลิกลิงก์ภายในระบบ → loading กลางจอ (หน้าใหม่ยังโหลดไม่เสร็จ) · กลับมาด้วยปุ่ม Back → ปิด */
export function installNavigationProgress() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
    progress.start();
  });
  // กลับมาด้วยปุ่ม Back (หน้าจาก bfcache) → loading ที่เริ่มตอนคลิกลิงก์ค้างอยู่ ให้ปิด
  // (โหลดหน้าปกติไม่ต้องรีเซ็ต — api ของหน้ายังทำงานอยู่)
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    pending = 0;
    finish();
  });
}
