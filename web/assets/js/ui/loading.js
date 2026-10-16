// Loading กลางของทั้งระบบ
//
//   progress.start() / progress.done()   แถบ gradient บนสุดของจอ — api ทุกตัวเรียกให้อัตโนมัติ (app/api.js)
//   progress.track(promise)              เริ่ม + จบให้เองเมื่อ promise เสร็จ
//   spinner({ size, onColor })           วงแหวนหมุน (sm 16 · md 28 · lg 44) — onColor = ใช้สีตัวอักษร (บนปุ่มสี)
//   loader({ text, size, logo })         spinner + ข้อความ จัดกึ่งกลาง (ใช้แทนเนื้อหาระหว่างโหลด) · logo = มีโลโก้ตรงกลาง
//   busy(button, fn, { label })          ปุ่มเป็นสถานะกำลังทำงานระหว่างรอ fn() แล้วคืนค่าเดิม
//   installNavigationProgress()          คลิกลิงก์ไปหน้าอื่น → แถบวิ่งทันที (shell เรียกให้)
//
// ตารางยังใช้ skeleton (เห็นโครงก่อนข้อมูลมา) — loader ใช้กับพื้นที่ที่ไม่รู้รูปร่างล่วงหน้า เช่น modal
import { html, raw } from '../shared/dom.js';

/** แสดงแถบหลังรอเกินนี้ (ms) — งานที่เสร็จเร็วกว่านี้ไม่กระพริบ */
const SHOW_AFTER = 80;
/** เดินแถบช้าลงเรื่อย ๆ แต่ไม่ถึง 100% จนกว่าจะเสร็จ */
const TRICKLE_MS = 250;
const MAX_BEFORE_DONE = 0.9;

let bar = null;
let pending = 0;
let width = 0;
let showTimer = null;
let trickleTimer = null;
let hideTimer = null;

function ensureBar() {
  if (bar) return bar;
  bar = document.createElement('div');
  bar.className = 'top-progress';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<i></i>';
  document.body.append(bar);
  return bar;
}

function setWidth(w) {
  width = w;
  ensureBar().firstElementChild.style.transform = `scaleX(${w})`;
}

function show() {
  clearTimeout(hideTimer);
  ensureBar().classList.add('active');
  document.documentElement.setAttribute('aria-busy', 'true');
  setWidth(Math.max(width, 0.08));
  clearInterval(trickleTimer);
  trickleTimer = setInterval(() => setWidth(width + (MAX_BEFORE_DONE - width) * 0.12), TRICKLE_MS);
}

function finish() {
  clearTimeout(showTimer);
  clearInterval(trickleTimer);
  showTimer = null;
  document.documentElement.removeAttribute('aria-busy');
  if (!bar?.classList.contains('active')) return;
  setWidth(1);
  hideTimer = setTimeout(() => {
    bar.classList.remove('active');
    hideTimer = setTimeout(() => setWidth(0), 250);
  }, 220);
}

export const progress = {
  start() {
    pending++;
    if (pending === 1 && !showTimer) showTimer = setTimeout(show, SHOW_AFTER);
  },
  done() {
    pending = Math.max(0, pending - 1);
    if (pending === 0) finish();
  },
  /** @template T @param {Promise<T>} p @returns {Promise<T>} */
  track(p) {
    progress.start();
    return Promise.resolve(p).finally(() => progress.done());
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

/** คลิกลิงก์ภายในระบบ → แถบวิ่งทันที (หน้าใหม่ยังโหลดไม่เสร็จ) · กลับมาด้วยปุ่ม Back → ปิดแถบ */
export function installNavigationProgress() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
    progress.start();
  });
  window.addEventListener('pageshow', () => {
    pending = 0;
    finish();
  });
}
