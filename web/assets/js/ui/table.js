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
// ปุ่ม "Excel" มุมขวาบนของทุกตาราง: ส่งออกทุกแถวตามตัวกรอง · ปิดด้วย exportable: false · ชื่อไฟล์ exportName (ไม่ใส่ = ชื่อหน้า)
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
import { exportButton, wireExport } from './exportExcel.js';

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

/** แสดงช่อง "ไปหน้า" บน desktop เมื่อมีหน้ามากกว่านี้ (มือถือใช้ช่องเลขหน้าตรงกลางแทน) */
const JUMP_FROM_PAGES = 8;

/**
 * HTML ของแถบแบ่งหน้า
 *   ซ้าย: ช่วงที่แสดง + แถบตำแหน่ง · กลาง: ⟪ ‹ 1 … 4 5 6 … 20 › ⟫ (มือถือ: ‹ หน้า [n] / N ›) · ขวา: แถวต่อหน้า + ไปหน้า
 *   ปุ่มเปลี่ยนหน้ามี data-page · ปุ่มจำนวนต่อหน้ามี data-page-size · ช่องกรอกเลขหน้ามี data-page-input
 */
export function pagerHtml({ page, pageSize, total }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const fmt = (n) => n.toLocaleString('th-TH');
  const multi = pages > 1;
  const nav = (p, ic, label, off, cls = '') =>
    html`<button type="button" class="page-btn page-step${cls}" data-page="${p}" ${off ? 'disabled' : ''} aria-label="${label}" title="${label}">${raw(icon(ic))}</button>`;
  const sizes = [...new Set([...PAGE_SIZES, pageSize])].sort((a, b) => a - b);
  // แถบตำแหน่ง: ช่วงที่กำลังดูเทียบกับทั้งหมด
  const bar = total ? { left: ((from - 1) / total) * 100, width: Math.max(2, ((to - from + 1) / total) * 100) } : { left: 0, width: 0 };
  const pageInput = (cls) =>
    html`<input class="page-input${cls}" data-page-input type="text" inputmode="numeric" value="${page}" aria-label="ไปหน้า (1–${pages})" autocomplete="off" />`;

  return html`<nav class="pager${multi ? '' : ' single'}" aria-label="เปลี่ยนหน้า" data-pages="${pages}">
    <div class="pager-info">
      <span class="num"><b>${fmt(from)}–${fmt(to)}</b> จาก <b>${fmt(total)}</b> รายการ</span>
      ${multi ? html`<span class="pager-track" aria-hidden="true"><i style="left:${bar.left}%;width:${bar.width}%"></i></span>` : ''}
    </div>
    ${multi
      ? html`<div class="pager-pages">
          ${nav(1, 'chevrons-left', 'หน้าแรก', page <= 1, ' edge')}
          ${nav(page - 1, 'chevron-left', 'หน้าก่อนหน้า', page <= 1)}
          <span class="page-nums">
            ${pageList(page, pages).map((p) =>
              p === '…'
                ? html`<span class="ellipsis" aria-hidden="true">…</span>`
                : html`<button type="button" class="page-btn page-num${p === page ? ' current' : ''}" data-page="${p}" ${p === page ? raw('aria-current="page"') : ''} aria-label="หน้า ${p}">${p}</button>`,
            )}
          </span>
          <label class="page-mobile num">หน้า ${pageInput('')} / ${pages}</label>
          ${nav(page + 1, 'chevron-right', 'หน้าถัดไป', page >= pages)}
          ${nav(pages, 'chevrons-right', 'หน้าสุดท้าย', page >= pages, ' edge')}
        </div>`
      : ''}
    <div class="pager-tools">
      <div class="page-sizes" role="group" aria-label="แถวต่อหน้า">
        <span class="muted">แถวต่อหน้า</span>
        <span class="seg">
          ${sizes.map((s) => html`<button type="button" class="seg-btn${s === pageSize ? ' on' : ''}" data-page-size="${s}" aria-pressed="${s === pageSize ? 'true' : 'false'}">${s}</button>`)}
        </span>
      </div>
      ${pages >= JUMP_FROM_PAGES ? html`<label class="page-jump">ไปหน้า ${pageInput(' sm')}</label>` : ''}
    </div>
  </nav>`;
}

/** ผูก event ของแถบแบ่งหน้า (เรียกหลัง render ทุกครั้ง) */
export function wirePager(root, { onPage, onSize }) {
  enhanceSelects(root);
  const pager = root.querySelector('.pager');
  if (!pager) return;
  const pages = Number(pager.dataset.pages) || 1;
  /** focusSel: ตัวเลือกที่จะโฟกัสหลัง render (คั่นด้วย | = ลองตามลำดับ) */
  const goPage = (p, focusSel) => {
    const keepFocus = pager.contains(document.activeElement);
    onPage(p);
    // render ใหม่แล้ว: คืนโฟกัสให้แถบแบ่งหน้า (ผู้ใช้คีย์บอร์ด) · ถ้ารายการเลื่อนพ้นจอ (มือถือ) ให้กลับไปต้นรายการ
    if (keepFocus) focusSel.split('|').map((s) => root.querySelector(`.pager ${s}`)).find(Boolean)?.focus({ preventScroll: true });
    if (root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  pager.querySelectorAll('[data-page]').forEach((b) => {
    const sel = b.classList.contains('page-num') ? '.page-num.current' : `[aria-label="${b.getAttribute('aria-label')}"]:not(:disabled)|.page-num.current`;
    b.onclick = () => goPage(Number(b.dataset.page), sel);
  });
  pager.querySelectorAll('[data-page-size]').forEach((b) => (b.onclick = () => !b.classList.contains('on') && onSize(Number(b.dataset.pageSize))));
  // ช่องกรอกเลขหน้า: Enter / ออกจากช่อง = ไปหน้านั้น (ปัดให้อยู่ในช่วง 1–pages)
  pager.querySelectorAll('[data-page-input]').forEach((input) => {
    const current = Number(input.value);
    const go = () => {
      const n = Math.min(pages, Math.max(1, Math.round(Number(input.value.replace(/[^\d]/g, '')) || current)));
      input.value = String(n);
      if (n !== current) goPage(n, input.classList.contains('sm') ? '.page-jump input' : '.page-mobile input');
    };
    input.onfocus = () => input.select();
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        go();
      } else if (e.key === 'Escape') {
        input.value = String(current);
        input.blur();
      }
    };
    input.onchange = go;
  });
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
   *   rowNumbers?: boolean, rowClass?: (row:any)=>string, onRender?: (root: HTMLElement)=>void,
   *   exportable?: boolean, exportName?: string}} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.o = { rowNumbers: true, exportable: true, ...opts };
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
    // ส่งออก Excel: คอลัมน์ที่มีชื่อหัว (ไม่รวมคอลัมน์ปุ่ม) · ทุกแถวตามตัวกรอง/การเรียง
    wireExport(root, () => ({
      name: this.o.exportName,
      columns: this.o.columns.filter((c) => typeof c.header === 'string' && c.header !== '').map((c) => ({ header: c.header, text: (r) => this.textOf(r, c.key) })),
      rows: this.filtered(),
    }));
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
      html`${this.o.exportable
        ? html`<div class="tbl-tools">${filterSummary(this.filter, (k) => this.col(k).header)}<span class="tbl-tools-end">${exportButton(loading || !total)}</span></div>`
        : filterSummary(this.filter, (k) => this.col(k).header)}${table}${cards}${noMatch
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
