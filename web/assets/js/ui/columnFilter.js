// ตัวกรองคอลัมน์ที่หัวตาราง (แบบ Excel AutoFilter) — ใช้ร่วมกันโดย DataTable และ ExcelGrid
//
// คลิกไอคอนกรวยที่หัวคอลัมน์ → เรียง น้อย→มาก / มาก→น้อย · ค้นหาค่า · ติ๊กเลือกค่าที่ต้องการแสดง
// คอลัมน์ที่ไม่ต้องการให้กรอง: ใส่ filter: false ในนิยามคอลัมน์
// ค่าที่ใช้กรอง: text(row) ถ้ามี · ไม่มี = ข้อความที่แสดงในเซลล์
// ค่าที่ใช้เรียง: sort(row) ถ้ามี (เช่น วันที่ ISO, ตัวเลข) · ไม่มี = ค่าที่ใช้กรอง
import { esc, html, raw } from '../shared/dom.js';
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

/** ปุ่มกรวยในหัวคอลัมน์ */
export function headerFilterButton(key, label, state) {
  const on = state.filters.has(key);
  const sorted = state.sort?.key === key ? state.sort.dir : 0;
  const ic = sorted === 1 ? 'arrow-up-narrow-wide' : sorted === -1 ? 'arrow-down-wide-narrow' : 'funnel';
  return html`<button type="button" class="th-filter${on || sorted ? ' on' : ''}" data-col-filter="${key}" aria-label="กรอง/เรียง ${label}" title="กรอง / เรียง">
    ${raw(icon(on && sorted ? 'funnel' : ic))}
  </button>`;
}

/** แถบสรุปตัวกรองที่ใช้อยู่ + ปุ่มล้าง (แสดงเหนือตาราง) */
export function filterSummary(state, labelOf) {
  if (!state.active) return '';
  const parts = [...state.filters.keys()].map((k) => labelOf(k));
  return html`<div class="filter-bar">
    ${raw(icon('funnel'))}
    <span
      >${parts.length ? html`กรอง: <b>${parts.join(', ')}</b>` : ''}${parts.length && state.sort ? ' · ' : ''}${state.sort
        ? html`เรียง: <b>${labelOf(state.sort.key)} ${state.sort.dir === 1 ? '↑' : '↓'}</b>`
        : ''}</span
    >
    <button type="button" class="btn btn-ghost btn-sm" data-clear-col-filters>ล้างตัวกรองคอลัมน์</button>
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
  const r = anchor.getBoundingClientRect();
  const width = 260;
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`;
  pop.style.top = `${Math.min(r.bottom + 4, window.innerHeight - 420)}px`;

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
