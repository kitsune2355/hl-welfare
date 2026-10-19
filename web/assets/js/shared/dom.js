// ตัวช่วยจัดการ DOM — ใช้แทน framework
//
//   html`<b>${name}</b>`  → ค่าใน ${} ถูก escape อัตโนมัติ (กัน XSS) — ใช้ raw() เมื่อแน่ใจว่าเป็น HTML ที่เราสร้างเอง
//   render(el, html`...`) → ใส่ลงในหน้า
//   on(root, 'click', '[data-action="x"]', fn) → event delegation (ผูกครั้งเดียว ใช้ได้กับ element ที่ render ใหม่)

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

/** ข้อความที่เป็น HTML อยู่แล้ว (ไม่ escape ซ้ำ) */
export const raw = (s) => new SafeHtml(String(s ?? ''));

export function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function part(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}

/** template HTML ที่ escape ค่าอัตโนมัติ — array ใน ${} จะถูกต่อกัน */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += part(v) + strings[i + 1];
  });
  return new SafeHtml(out);
}

export function render(el, content) {
  if (el) el.innerHTML = String(content);
}

/**
 * ขนาดตัวอักษรของระบบ (app/fontSize.js) ใช้ CSS zoom ที่ <html> — ค่าจาก getBoundingClientRect / innerWidth เป็นพิกเซลจอ
 * ต้องหารด้วยค่านี้ก่อนใส่ใน style ของกล่อง position: fixed (popover)
 */
export const uiZoom = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;

/** ตำแหน่ง/ขนาดของ element และขนาดจอ เป็นหน่วย CSS px (หักค่า zoom แล้ว) */
export function cssRect(el) {
  const z = uiZoom();
  const r = el.getBoundingClientRect();
  return { left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z, vw: window.innerWidth / z, vh: window.innerHeight / z };
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** event delegation: handler(event, matchedElement) */
export function on(root, type, selector, handler, options) {
  root.addEventListener(
    type,
    (e) => {
      const target = e.target instanceof Element ? e.target.closest(selector) : null;
      if (target && root.contains(target)) handler(e, target);
    },
    options,
  );
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ----- query string (เก็บตัวกรอง/แท็บ/หน้า ใน URL เพื่อให้แชร์ลิงก์และกด back ได้) -----

export function getParam(name, fallback = '') {
  return new URLSearchParams(location.search).get(name) ?? fallback;
}

/** แก้ query string โดยไม่โหลดหน้าใหม่ — ค่าว่าง = ลบ */
export function setParams(changes, { push = false } = {}) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v === '' || v === null || v === undefined) p.delete(k);
    else p.set(k, String(v));
  }
  const qs = p.toString();
  const url = `${location.pathname}${qs ? `?${qs}` : ''}`;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

/** โหลดข้อมูลหลายอย่างพร้อมกัน แล้วคืนเป็น object */
export async function loadAll(map) {
  const keys = Object.keys(map);
  const values = await Promise.all(keys.map((k) => map[k]()));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}
