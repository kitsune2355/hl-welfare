// ตัวกรองคอลัมน์ที่หัวตาราง (แบบ Excel AutoFilter) — ใช้ร่วมกันโดย DataTable และ ExcelGrid
//
// คลิกไอคอนกรวยที่หัวคอลัมน์ → เรียง น้อย→มาก / มาก→น้อย · ค้นหาค่า · ติ๊กเลือกค่าที่ต้องการแสดง
// คอลัมน์ที่ไม่ต้องการให้กรอง: ใส่ filter: false ในนิยามคอลัมน์
// ค่าที่ใช้กรอง: text(row) ถ้ามี · ไม่มี = ข้อความที่แสดงในเซลล์
// ค่าที่ใช้เรียง: sort(row) ถ้ามี (เช่น วันที่ ISO, ตัวเลข) · ไม่มี = ค่าที่ใช้กรอง
// เรียง: คลิกชื่อหัวคอลัมน์ (headerLabel) วน น้อย→มาก → มาก→น้อย → ไม่เรียง · ลูกศรข้างชื่อ = เรียงอยู่
// ตัวกรองที่ใช้อยู่: chip เหนือตาราง (filterChips) — กด × ที่ chip = เอาตัวกรองนั้นออก
// ตรึงคอลัมน์ไว้ด้านซ้าย: ชี้ที่หัวคอลัมน์ → ไอคอนหมุด (headerPinButton) · จำแยกต่อตาราง/ต่อเครื่อง (localStorage hl-pins:<หน้า>#<id ตาราง>)
// ปรับความกว้างคอลัมน์: ลากขอบขวาของหัวคอลัมน์ (resizeHandle + wireColumnResize) · ดับเบิลคลิกขอบ = กลับเป็นความกว้างเดิม
//   จำต่อตาราง/ต่อเครื่อง (localStorage hl-colw:<หน้า>#<id ตาราง>)
import { cssRect, esc, html, raw } from '../shared/dom.js';
import { icon } from '../shared/icons.js';

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
/** HTML → ข้อความล้วน */
export const stripHtml = (h) =>
  String(h ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENT[m])
    .replace(/\s+/g, ' ')
    .trim();

const EMPTY = '(ว่าง)';

// ----- คอลัมน์ที่ตรึงไว้ด้านซ้าย -----
/** id ของตาราง (ใช้จำการตรึงคอลัมน์) = ชื่อไฟล์หน้า + id ของตาราง/กล่องที่ใกล้ที่สุด */
export function tableId(root, opts = {}) {
  const page = location.pathname.split('/').pop() || 'index.html';
  return `${page}#${opts.id || root.id || root.closest('[id]')?.id || 'table'}`;
}

export function loadPins(id) {
  try {
    return new Set(JSON.parse(localStorage.getItem(`hl-pins:${id}`) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function savePins(id, pins) {
  try {
    if (pins.size) localStorage.setItem(`hl-pins:${id}`, JSON.stringify([...pins]));
    else localStorage.removeItem(`hl-pins:${id}`);
  } catch {
    /* ignore */
  }
}

/** เรียงคอลัมน์: ที่ตรึงไว้มาก่อน (คงลำดับเดิม) */
export const orderByPins = (columns, pins) => [...columns.filter((c) => pins.has(c.key)), ...columns.filter((c) => !pins.has(c.key))];

/** ปุ่มหมุดที่หัวคอลัมน์ — แสดงเมื่อชี้ที่หัวคอลัมน์ · ตรึงอยู่ = แสดงตลอด (สีหลัก) */
export function headerPinButton(key, label, pinned) {
  const t = pinned ? `เลิกตรึง ${label}` : `ตรึง ${label} ไว้ด้านซ้าย`;
  return html`<button type="button" class="th-pinbtn${pinned ? ' on' : ''}" data-col-pin="${key}" aria-pressed="${pinned ? 'true' : 'false'}" aria-label="${t}" title="${t}">${raw(icon('pin'))}</button>`;
}

// ----- ความกว้างคอลัมน์ที่ผู้ใช้ลากไว้ -----
export const MIN_COL_WIDTH = 48;

/** @returns {Record<string, number>} key คอลัมน์ → ความกว้าง (px) */
export function loadWidths(id) {
  try {
    const w = JSON.parse(localStorage.getItem(`hl-colw:${id}`) ?? '{}');
    return w && typeof w === 'object' ? w : {};
  } catch {
    return {};
  }
}

export function saveWidths(id, widths) {
  try {
    if (Object.keys(widths).length) localStorage.setItem(`hl-colw:${id}`, JSON.stringify(widths));
    else localStorage.removeItem(`hl-colw:${id}`);
  } catch {
    /* ignore */
  }
}

/** ที่จับลากขอบขวาของหัวคอลัมน์ (วางใน <th> — th เป็น position: sticky อยู่แล้ว) */
export const resizeHandle = (key) =>
  html`<span class="th-resize" data-col-resize="${key}" title="ลากเพื่อปรับความกว้าง · ดับเบิลคลิก = ความกว้างเดิม" aria-hidden="true"></span>`;

/**
 * ลากที่จับ → onMove(key, width) ระหว่างลาก · ปล่อย → onDone(key, width) · ดับเบิลคลิก → onDone(key, null) (คืนค่าเดิม)
 * @param {HTMLElement} root
 * @param {{onMove: (key:string, w:number)=>void, onDone: (key:string, w:number|null)=>void}} o
 */
export function wireColumnResize(root, { onMove, onDone }) {
  root.addEventListener('pointerdown', (e) => {
    const h = e.target.closest?.('[data-col-resize]');
    if (!h || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const th = h.closest('th');
    const key = h.dataset.colResize;
    const w0 = th.offsetWidth;
    // ขนาดตัวอักษรของระบบ (zoom) ทำให้ระยะเมาส์ ≠ px ของ CSS → แปลงด้วยอัตราส่วนจริง
    const scale = th.getBoundingClientRect().width / (w0 || 1) || 1;
    const x0 = e.clientX;
    let w = w0;
    h.setPointerCapture?.(e.pointerId);
    document.body.classList.add('col-resizing');
    const move = (ev) => {
      w = Math.max(MIN_COL_WIDTH, Math.round(w0 + (ev.clientX - x0) / scale));
      onMove(key, w);
    };
    const up = () => {
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up);
      h.removeEventListener('pointercancel', up);
      document.body.classList.remove('col-resizing');
      if (w !== w0) onDone(key, w);
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  });
  root.addEventListener('dblclick', (e) => {
    const h = e.target.closest?.('[data-col-resize]');
    if (!h) return;
    e.stopPropagation();
    onDone(h.dataset.colResize, null);
  });
}
const collator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' });

export function compareValues(a, b) {
  const na = a === null || a === undefined || a === '';
  const nb = b === null || b === undefined || b === '';
  if (na || nb) return na === nb ? 0 : na ? 1 : -1; // ค่าว่างไว้ท้ายเสมอ
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(b) - Number(a);
  return collator.compare(String(a), String(b));
}

/** สถานะตัวกรองของตาราง 1 ตาราง */
export class FilterState {
  constructor() {
    /** @type {Map<string, Set<string>>} key คอลัมน์ → ค่าที่อนุญาตให้แสดง */
    this.filters = new Map();
    /** @type {{key: string, dir: 1|-1} | null} */
    this.sort = null;
  }

  get active() {
    return this.filters.size > 0 || this.sort !== null;
  }

  clear() {
    this.filters.clear();
    this.sort = null;
  }

  /** คลิกชื่อหัวคอลัมน์: ไม่เรียง → น้อย→มาก → มาก→น้อย → ไม่เรียง */
  cycleSort(key) {
    const dir = this.sort?.key === key ? this.sort.dir : 0;
    this.sort = dir === 0 ? { key, dir: 1 } : dir === 1 ? { key, dir: -1 } : null;
  }

  /**
   * @param {any[]} rows
   * @param {(row:any, key:string)=>string} textOf
   * @param {(row:any, key:string)=>any} sortOf
   * @param {(row:any)=>boolean} [keep]  แถวที่ต้องแสดงเสมอ (เช่น เพิ่งแก้ไข)
   * @param {string} [except]  ไม่ใช้ตัวกรองของคอลัมน์นี้ (ใช้ตอนนับค่าในรายการตัวเลือก)
   */
  apply(rows, textOf, sortOf, keep, except) {
    let out = rows.filter(
      (r) => keep?.(r) || [...this.filters].every(([k, set]) => k === except || set.has(textOf(r, k) || EMPTY)),
    );
    if (this.sort && except === undefined) {
      const { key, dir } = this.sort;
      out = [...out].sort((a, b) => dir * compareValues(sortOf(a, key), sortOf(b, key)));
    }
    return out;
  }
}

/** ปุ่มกรวยในหัวคอลัมน์ (สีหลัก = กรองคอลัมน์นี้อยู่ · การเรียงแสดงที่ลูกศรข้างชื่อแทน) */
export function headerFilterButton(key, label, state) {
  const on = state.filters.has(key);
  return html`<button type="button" class="th-filter${on ? ' on' : ''}" data-col-filter="${key}" aria-label="กรอง/เรียง ${label}" title="กรอง / เรียง">
    ${raw(icon('funnel'))}
  </button>`;
}

/** สถานะการเรียงของคอลัมน์สำหรับ aria-sort ของ <th> */
export const ariaSort = (key, state) => (state.sort?.key === key ? (state.sort.dir === 1 ? 'ascending' : 'descending') : 'none');

/**
 * ชื่อหัวคอลัมน์ที่คลิกแล้วเรียงได้ (ตารางต้องจัดการคลิก [data-col-sort] → state.cycleSort)
 * @param {string} key @param {any} label ชื่อ (HTML ได้) @param {FilterState} state
 * @param {{sortable?: boolean, align?: string}} [o] sortable: false = แสดงชื่ออย่างเดียว
 */
export function headerLabel(key, label, state, { sortable = true, align = '' } = {}) {
  const just = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  if (!sortable) return html`<span class="th-label" style="justify-content:${just}"><span class="truncate">${label}</span></span>`;
  const dir = state.sort?.key === key ? state.sort.dir : 0;
  const next = dir === 0 ? 'เรียงน้อย → มาก' : dir === 1 ? 'เรียงมาก → น้อย' : 'ยกเลิกการเรียง';
  return html`<button type="button" class="th-label th-sort${dir ? ' on' : ''}" style="justify-content:${just}" data-col-sort="${key}" title="คลิกเพื่อ${next}"
    ><span class="truncate">${label}</span><span class="th-sort-ic" aria-hidden="true">${raw(icon(dir === 1 ? 'arrow-up' : dir === -1 ? 'arrow-down' : 'chevrons-up-down'))}</span></button
  >`;
}

/** รายการค่าแบบย่อ: 2 ค่าแรก + "+N" */
const short = (list) => list.slice(0, 2).join(', ') + (list.length > 2 ? ` +${list.length - 2}` : '');

/**
 * ข้อความใน chip: ค่าที่เลือก หรือ "ไม่รวม …" เมื่อค่าที่ตัดออกมีน้อยกว่า (เช่น เอาออกค่าเดียวจาก 40 ค่า)
 * @param {Set<string>} set ค่าที่แสดง · @param {string[]} [all] ค่าทั้งหมดของคอลัมน์ (ไม่ส่ง = แสดงค่าที่เลือก)
 */
function chipValues(set, all) {
  const kept = [...set];
  const dropped = all ? [...new Set(all.map((v) => v || EMPTY))].filter((v) => !set.has(v)) : [];
  if (dropped.length && dropped.length < kept.length) return { text: `ไม่รวม ${short(dropped)}`, title: `ไม่รวม ${dropped.join(', ')}` };
  return { text: short(kept), title: kept.join(', ') };
}

/**
 * chip ตัวกรอง/การเรียงที่ใช้อยู่ (แสดงเหนือตาราง) — × ที่ chip = เอาออกทีละอัน · มีหลายอัน = ปุ่ม "ล้างทั้งหมด"
 * ตารางที่ใช้ต้องจัดการคลิก [data-clear-filter], [data-clear-sort], [data-clear-col-filters]
 * @param {FilterState} state @param {(key:string)=>string} labelOf @param {(key:string)=>string[]} [valuesOf] ค่าทั้งหมดของคอลัมน์ (ก่อนกรอง)
 */
export function filterChips(state, labelOf, valuesOf) {
  if (!state.active) return '';
  return html`<div class="filter-bar" role="region" aria-label="ตัวกรองที่ใช้อยู่">
    <span class="fb-label">${raw(icon('funnel'))} ${state.filters.size ? 'กรองอยู่' : 'เรียงอยู่'}</span>
    ${[...state.filters].map(([k, set]) => {
      const label = labelOf(k);
      const v = chipValues(set, valuesOf?.(k));
      return html`<span class="fchip" title="${label}: ${v.title}">
        <span class="fchip-k">${label}</span><span class="fchip-v">${v.text}</span>
        <button type="button" class="fchip-x" data-clear-filter="${k}" aria-label="เอาตัวกรอง ${label} ออก" title="เอาตัวกรองนี้ออก">${raw(icon('x'))}</button>
      </span>`;
    })}
    ${state.sort
      ? html`<span class="fchip sort">
          ${raw(icon(state.sort.dir === 1 ? 'arrow-up-narrow-wide' : 'arrow-down-wide-narrow'))}
          <span class="fchip-k">เรียง</span><span class="fchip-v">${labelOf(state.sort.key)} ${state.sort.dir === 1 ? 'น้อย → มาก' : 'มาก → น้อย'}</span>
          <button type="button" class="fchip-x" data-clear-sort aria-label="ยกเลิกการเรียง" title="ยกเลิกการเรียง">${raw(icon('x'))}</button>
        </span>`
      : ''}
    ${state.filters.size + (state.sort ? 1 : 0) > 1 ? html`<button type="button" class="btn btn-ghost btn-sm" data-clear-col-filters>ล้างทั้งหมด</button>` : ''}
  </div>`;
}

/**
 * เปิดกล่องกรองใต้หัวคอลัมน์
 * @param {{anchor: HTMLElement, label: string, values: string[], selected: Set<string>|null,
 *   sortDir: 0|1|-1, onApply: (r: {selected: Set<string>|null, sortDir: 0|1|-1}) => void}} o
 */
export function openColumnFilter({ anchor, label, values, selected, sortDir, onApply }) {
  document.querySelector('.popover.col-filter')?.remove();
  const counts = new Map();
  for (const v of values) counts.set(v || EMPTY, (counts.get(v || EMPTY) ?? 0) + 1);
  const all = [...counts.keys()].sort((a, b) => (a === EMPTY ? 1 : b === EMPTY ? -1 : collator.compare(a, b)));
  const checked = new Set(selected ?? all);

  const pop = document.createElement('div');
  pop.className = 'popover col-filter';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', `กรองคอลัมน์ ${label}`);
  pop.innerHTML = String(html`<div class="cf-sort">
      <button type="button" class="cf-btn${sortDir === 1 ? ' on' : ''}" data-sort="1">${raw(icon('arrow-up-narrow-wide'))} เรียงน้อย → มาก</button>
      <button type="button" class="cf-btn${sortDir === -1 ? ' on' : ''}" data-sort="-1">${raw(icon('arrow-down-wide-narrow'))} เรียงมาก → น้อย</button>
    </div>
    <div class="popover-search">${raw(icon('search'))}<input type="text" placeholder="ค้นหาค่าใน ${label}…" aria-label="ค้นหาค่า" autocomplete="off" /></div>
    <label class="cf-item cf-all"><input type="checkbox" data-all /> <span>(เลือกทั้งหมด)</span></label>
    <div class="cf-list"></div>
    <div class="cf-foot">
      <button type="button" class="btn btn-ghost btn-sm" data-reset>ล้าง</button>
      <button type="button" class="btn btn-primary btn-sm" data-ok>ตกลง</button>
    </div>`);
  document.body.append(pop);
  const input = pop.querySelector('input[type="text"]');
  const list = pop.querySelector('.cf-list');
  const allBox = pop.querySelector('[data-all]');

  const shown = () => {
    const q = input.value.trim().toLowerCase();
    return q ? all.filter((v) => v.toLowerCase().includes(q)) : all;
  };
  const draw = () => {
    const vs = shown();
    list.innerHTML = vs.length
      ? vs
          .slice(0, 500)
          .map(
            (v) =>
              `<label class="cf-item"><input type="checkbox" data-v="${esc(v)}" ${checked.has(v) ? 'checked' : ''}> <span class="truncate">${esc(v)}</span><span class="cf-n">${counts.get(v)}</span></label>`,
          )
          .join('')
      : '<div class="empty" style="padding:16px">ไม่พบค่า</div>';
    const n = vs.filter((v) => checked.has(v)).length;
    allBox.checked = n === vs.length && n > 0;
    allBox.indeterminate = n > 0 && n < vs.length;
  };

  // ตำแหน่ง: ใต้หัวคอลัมน์ ไม่ล้นขอบจอ
  const r = cssRect(anchor); // หน่วย CSS px (รองรับขนาดตัวอักษรของระบบ)
  const width = 260;
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.max(8, Math.min(r.left, r.vw - width - 8))}px`;
  pop.style.top = `${Math.min(r.bottom + 4, r.vh - 420)}px`;

  const close = () => {
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    pop.remove();
  };
  const apply = (sort = sortDir) => {
    const everything = all.every((v) => checked.has(v));
    onApply({ selected: everything ? null : new Set(checked), sortDir: sort });
    close();
  };
  const outside = (e) => !pop.contains(e.target) && !anchor.contains(e.target) && close();
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' && pop.contains(document.activeElement)) {
      e.preventDefault();
      apply();
    }
  };

  input.addEventListener('input', draw);
  list.addEventListener('change', (e) => {
    const v = e.target.dataset.v;
    if (e.target.checked) checked.add(v);
    else checked.delete(v);
    draw();
  });
  allBox.addEventListener('change', () => {
    for (const v of shown()) allBox.checked ? checked.add(v) : checked.delete(v);
    draw();
  });
  pop.querySelectorAll('[data-sort]').forEach(
    (b) =>
      (b.onclick = () => {
        const d = Number(b.dataset.sort);
        apply(sortDir === d ? 0 : d); // กดซ้ำ = ยกเลิกการเรียง
      }),
  );
  pop.querySelector('[data-reset]').onclick = () => {
    onApply({ selected: null, sortDir: 0 });
    close();
  };
  pop.querySelector('[data-ok]').onclick = () => {
    if (checked.size === 0) return; // ต้องเลือกอย่างน้อย 1 ค่า
    apply();
  };

  draw();
  input.focus();
  document.addEventListener('mousedown', outside, true);
  document.addEventListener('keydown', onKey, true);
}
