// ตารางแสดงข้อมูล (อ่านอย่างเดียว) — เส้นตารางแบบ Excel + เลขแถว + แบ่งหน้า + การ์ดบนมือถือ
//
//   const table = new DataTable(document.getElementById('list'), {
//     columns: [{ key: 'name', header: 'ชื่อ', cell: (r) => r.name }],
//     rowKey: (r) => r.id,
//     pageSize: 25,
//   });
//   table.setRows(rows);
//
// กรองคอลัมน์ที่หัวตาราง: เปิดอัตโนมัติทุกคอลัมน์ที่มีชื่อหัว · ปิดด้วย filter: false
// text(row) = ข้อความที่ใช้กรอง · sort(row) = ค่าที่ใช้เรียง (เช่น วันที่ ISO) เมื่อค่าที่แสดงเรียงไม่ถูก
//
// ปุ่มในเซลล์: ใส่ data-action="..." แล้วดักด้วย on(container, 'click', '[data-action="..."]', fn)
import { html, raw } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import {
  FilterState,
  filterSummary,
  headerFilterButton,
  loadPins,
  openColumnFilter,
  orderByPins,
  pinMark,
  savePins,
  stripHtml,
  tableId,
} from './columnFilter.js';
import { enhanceSelects } from './combobox.js';

export const PAGE_SIZES = [10, 25, 50, 100];

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = [...new Set([1, pages, page - 1, page, page + 1])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out = [];
  keep.forEach((p, i) => {
    if (i > 0 && p - keep[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

/** HTML ของแถบแบ่งหน้า — ปุ่มมี data-page, ตัวเลือกจำนวนต่อหน้ามี data-page-size */
export function pagerHtml({ page, pageSize, total }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const fmt = (n) => n.toLocaleString('th-TH');
  return html`<nav class="pager" aria-label="เปลี่ยนหน้า">
    <div class="pager-left">
      <span class="num">แสดง <b>${fmt(from)}–${fmt(to)}</b> จาก <b>${fmt(total)}</b></span>
      <label class="pager-size row"
        >ต่อหน้า
        <select data-page-size data-combobox data-size="sm" aria-label="จำนวนต่อหน้า" class="combo">
          ${[...new Set([...PAGE_SIZES, pageSize])].sort((a, b) => a - b).map((s) => html`<option value="${s}" ${s === pageSize ? 'selected' : ''}>${s}</option>`)}
        </select></label
      >
    </div>
    ${pages > 1
      ? html`<div class="pager-pages">
          <button class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="หน้าก่อนหน้า">${raw(icon('chevron-left'))}</button>
          <span class="page-mobile num">หน้า ${page} / ${pages}</span>
          ${pageList(page, pages).map((p) =>
            p === '…'
              ? html`<span class="ellipsis">…</span>`
              : html`<button class="page-btn page-num${p === page ? ' current' : ''}" data-page="${p}" ${p === page ? 'aria-current="page"' : ''}>${p}</button>`,
          )}
          <button class="page-btn" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="หน้าถัดไป">${raw(icon('chevron-right'))}</button>
        </div>`
      : ''}
  </nav>`;
}

/** ผูก event ของแถบแบ่งหน้า (เรียกหลัง render ทุกครั้ง) */
export function wirePager(root, { onPage, onSize }) {
  enhanceSelects(root);
  root.querySelectorAll('.pager [data-page]').forEach((b) => (b.onclick = () => onPage(Number(b.dataset.page))));
  const size = root.querySelector('.pager [data-page-size]');
  if (size) size.onchange = () => onSize(Number(size.value));
}

function slotOf(c, i) {
  if (c.mobile) return c.mobile;
  if (i === 0) return 'title';
  if (c.header === '') return 'footer';
  return 'field';
}

export class DataTable {
  /**
   * @param {HTMLElement} root
   * @param {{columns: {key:string, header:string, cell:(row:any)=>any, align?:'left'|'right'|'center', cls?:string,
   *   hideOnMobile?: boolean, mobile?: 'lead'|'title'|'aside'|'field'|'footer',
   *   filter?: boolean, text?: (row:any)=>string, sort?: (row:any)=>any}[], rowKey:(row:any)=>any,
   *   onRowClick?: (row:any)=>void, empty?: any, pageSize?: number, page?: number, onPageChange?: (p:number)=>void,
   *   rowNumbers?: boolean, rowClass?: (row:any)=>string, onRender?: (root: HTMLElement)=>void}} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.o = { rowNumbers: true, ...opts };
    this.rows = null;
    this.page = opts.page ?? 1;
    this.size = opts.pageSize ?? 0;
    this.filter = new FilterState();
    this.tid = tableId(root, opts);
    this.pins = loadPins(this.tid); // คอลัมน์ที่ผู้ใช้ตรึงไว้ด้านซ้าย
    root.addEventListener('click', (e) => {
      const fb = e.target.closest('[data-col-filter]');
      if (fb) return this.openFilter(fb);
      if (e.target.closest('[data-clear-col-filters]')) {
        this.filter.clear();
        this.page = 1;
        return this.render();
      }
      if (!this.o.onRowClick) return;
      if (e.target.closest('a, button, input, select, .combo')) return;
      const tr = e.target.closest('[data-key]');
      const row = tr && this.visible().find((r) => String(this.o.rowKey(r)) === tr.dataset.key);
      if (row) this.o.onRowClick(row);
    });
    this.render();
  }

  setRows(rows) {
    this.rows = rows;
    this.render();
  }

  setPage(p) {
    this.page = p;
    this.render();
  }

  // ----- กรองคอลัมน์ -----
  col(key) {
    return this.o.columns.find((c) => c.key === key);
  }

  canFilter(c) {
    return c.filter !== false && typeof c.header === 'string' && c.header !== '';
  }

  textOf = (row, key) => {
    const c = this.col(key);
    return c.text ? String(c.text(row) ?? '') : stripHtml(c.cell(row));
  };

  sortOf = (row, key) => {
    const c = this.col(key);
    return c.sort ? c.sort(row) : this.textOf(row, key);
  };

  /** แถวหลังกรอง/เรียง (ทุกหน้า) */
  filtered() {
    return this.rows ? this.filter.apply(this.rows, this.textOf, this.sortOf) : [];
  }

  openFilter(btn) {
    const key = btn.dataset.colFilter;
    const c = this.col(key);
    const base = this.filter.apply(this.rows ?? [], this.textOf, this.sortOf, undefined, key);
    openColumnFilter({
      anchor: btn.closest('th') ?? btn,
      label: c.header,
      values: base.map((r) => this.textOf(r, key)),
      selected: this.filter.filters.get(key) ?? null,
      sortDir: this.filter.sort?.key === key ? this.filter.sort.dir : 0,
      onApply: ({ selected, sortDir }) => {
        if (selected) this.filter.filters.set(key, selected);
        else this.filter.filters.delete(key);
        if (sortDir) this.filter.sort = { key, dir: sortDir };
        else if (this.filter.sort?.key === key) this.filter.sort = null;
        this.page = 1;
        this.render();
      },
      pinned: this.pins.has(key),
      onPin: () => {
        if (this.pins.has(key)) this.pins.delete(key);
        else this.pins.add(key);
        savePins(this.tid, this.pins);
        this.render();
      },
    });
  }

  /** ตรึงคอลัมน์: วัดความกว้างจริงหลัง render แล้วตั้ง sticky left ให้ทุกเซลล์ของคอลัมน์นั้น */
  applyPins() {
    const table = this.root.querySelector('.table');
    if (!table) return;
    const keys = this.o.columns.filter((c) => this.pins.has(c.key)).map((c) => c.key);
    let left = 0;
    const rownums = table.querySelectorAll('.rownum');
    if (keys.length && rownums.length) {
      rownums.forEach((el) => el.classList.add('pinned'));
      rownums.forEach((el) => (el.style.left = '0px'));
      left = rownums[0].offsetWidth;
    }
    keys.forEach((key, i) => {
      const cells = table.querySelectorAll(`[data-col="${key}"]`);
      const w = cells[0]?.offsetWidth ?? 0;
      cells.forEach((el) => {
        el.classList.add('pinned');
        el.classList.toggle('pin-edge', i === keys.length - 1);
        el.style.left = `${left}px`;
      });
      left += w;
    });
  }

  visible() {
    if (!this.rows) return [];
    const rows = this.filtered();
    if (!this.size) return rows;
    const pages = Math.max(1, Math.ceil(rows.length / this.size));
    this.page = Math.min(Math.max(1, this.page), pages);
    return rows.slice((this.page - 1) * this.size, this.page * this.size);
  }

  render() {
    const { rowKey, onRowClick, rowNumbers, rowClass, empty } = this.o;
    const columns = orderByPins(this.o.columns, this.pins);
    const rows = this.visible();
    const offset = this.size ? (this.page - 1) * this.size : 0;
    const align = (c) => (c.align && c.align !== 'left' ? c.align : '');
    const loading = this.rows === null;
    const slots = columns.map((c, i) => ({ c, slot: slotOf(c, i) })).filter((x) => !x.c.hideOnMobile);
    const by = (s) => slots.filter((x) => x.slot === s).map((x) => x.c);

    const table = html`<div class="table-wrap has-cards">
      <table class="table">
        <thead>
          <tr>
            ${rowNumbers ? html`<th class="rownum">#</th>` : ''}
            ${columns.map(
              (c) =>
                html`<th class="${align(c)} ${c.cls ?? ''}" data-col="${c.key}">
                  ${this.canFilter(c) && !loading
                    ? html`<span class="th-inner"><span>${pinMark(this.pins.has(c.key))}${c.header}</span>${headerFilterButton(c.key, c.header, this.filter)}</span>`
                    : c.header}
                </th>`,
            )}
          </tr>
        </thead>
        <tbody>
          ${loading
            ? Array.from(
                { length: 6 },
                () => html`<tr>
                  ${rowNumbers ? html`<td class="rownum"></td>` : ''} ${columns.map((c) => html`<td data-col="${c.key}"><div class="skeleton sk-line"></div></td>`)}
                </tr>`,
              )
            : rows.map(
                (r, i) => html`<tr data-key="${rowKey(r)}" class="${onRowClick ? 'clickable' : ''} ${rowClass?.(r) ?? ''}">
                  ${rowNumbers ? html`<td class="rownum num">${offset + i + 1}</td>` : ''}
                  ${columns.map((c) => html`<td class="${align(c)} ${c.cls ?? ''}" data-col="${c.key}">${c.cell(r)}</td>`)}
                </tr>`,
              )}
        </tbody>
      </table>
    </div>`;

    const cards = html`<ul class="cards">
      ${loading
        ? html`<li><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div></li>`
        : rows.map(
            (r) => html`<li data-key="${rowKey(r)}" class="${onRowClick ? 'clickable' : ''} ${rowClass?.(r) ?? ''}">
              <div class="card-row">
                ${by('lead').map((c) => c.cell(r))}
                <div class="grow">${by('title').map((c) => c.cell(r))}</div>
                ${by('aside').map((c) => c.cell(r))}
              </div>
              ${by('field').length
                ? html`<dl>
                    ${by('field').map((c) => html`<div><dt>${c.header}</dt><dd>${c.cell(r)}</dd></div>`)}
                  </dl>`
                : ''}
              ${by('footer').map((c) => html`<div>${c.cell(r)}</div>`)}
            </li>`,
          )}
    </ul>`;

    const total = this.filtered().length;
    const showPager = this.size && this.rows && total > 0;
    const noMatch = !loading && this.rows.length > 0 && total === 0;
    this.root.innerHTML = String(
      html`${filterSummary(this.filter, (k) => this.col(k).header)}${table}${cards}${noMatch
        ? html`<div class="empty" style="padding:32px"><b>ไม่มีแถวที่ตรงกับตัวกรองคอลัมน์</b></div>`
        : !loading && rows.length === 0
          ? (empty ?? '')
          : ''}${showPager ? pagerHtml({ page: this.page, pageSize: this.size, total }) : ''}`,
    );
    if (showPager) {
      wirePager(this.root, {
        onPage: (p) => {
          this.page = p;
          this.o.onPageChange?.(p);
          this.render();
        },
        onSize: (s) => {
          this.size = s;
          this.page = 1;
          this.o.onPageChange?.(1);
          this.render();
        },
      });
    }
    this.applyPins();
    this.o.onRender?.(this.root); // เช่น แปลง <select data-combobox> ในเซลล์
  }
}
