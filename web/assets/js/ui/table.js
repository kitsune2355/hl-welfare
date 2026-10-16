// ตารางแสดงข้อมูล (อ่านอย่างเดียว) — เส้นตารางแบบ Excel + เลขแถว + แบ่งหน้า + การ์ดบนมือถือ
//
//   const table = new DataTable(document.getElementById('list'), {
//     columns: [{ key: 'name', header: 'ชื่อ', cell: (r) => r.name }],
//     rowKey: (r) => r.id,
//     pageSize: 25,
//   });
//   table.setRows(rows);
//
// ปุ่มในเซลล์: ใส่ data-action="..." แล้วดักด้วย on(container, 'click', '[data-action="..."]', fn)
import { html, raw } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
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
   *   hideOnMobile?: boolean, mobile?: 'lead'|'title'|'aside'|'field'|'footer'}[], rowKey:(row:any)=>any,
   *   onRowClick?: (row:any)=>void, empty?: any, pageSize?: number, page?: number, onPageChange?: (p:number)=>void,
   *   rowNumbers?: boolean, rowClass?: (row:any)=>string, onRender?: (root: HTMLElement)=>void}} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.o = { rowNumbers: true, ...opts };
    this.rows = null;
    this.page = opts.page ?? 1;
    this.size = opts.pageSize ?? 0;
    root.addEventListener('click', (e) => {
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

  visible() {
    if (!this.rows) return [];
    if (!this.size) return this.rows;
    const pages = Math.max(1, Math.ceil(this.rows.length / this.size));
    this.page = Math.min(Math.max(1, this.page), pages);
    return this.rows.slice((this.page - 1) * this.size, this.page * this.size);
  }

  render() {
    const { columns, rowKey, onRowClick, rowNumbers, rowClass, empty } = this.o;
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
            ${rowNumbers ? html`<th class="rownum">#</th>` : ''} ${columns.map((c) => html`<th class="${align(c)} ${c.cls ?? ''}">${c.header}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${loading
            ? Array.from(
                { length: 6 },
                () => html`<tr>
                  ${rowNumbers ? html`<td class="rownum"></td>` : ''} ${columns.map(() => html`<td><div class="skeleton sk-line"></div></td>`)}
                </tr>`,
              )
            : rows.map(
                (r, i) => html`<tr data-key="${rowKey(r)}" class="${onRowClick ? 'clickable' : ''} ${rowClass?.(r) ?? ''}">
                  ${rowNumbers ? html`<td class="rownum num">${offset + i + 1}</td>` : ''}
                  ${columns.map((c) => html`<td class="${align(c)} ${c.cls ?? ''}">${c.cell(r)}</td>`)}
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

    const showPager = this.size && this.rows && this.rows.length > 0;
    this.root.innerHTML = String(
      html`${table}${cards}${!loading && rows.length === 0 ? (empty ?? '') : ''}${showPager
        ? pagerHtml({ page: this.page, pageSize: this.size, total: this.rows.length })
        : ''}`,
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
    this.o.onRender?.(this.root); // เช่น แปลง <select data-combobox> ในเซลล์
  }
}
