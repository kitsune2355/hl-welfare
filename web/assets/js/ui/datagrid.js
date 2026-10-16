// ตารางแบบ Excel — คลิกเพื่อสร้าง/แก้ไขในตาราง
//
//   คลิกเซลล์ = เลือก · ดับเบิลคลิก / Enter / F2 / พิมพ์ = แก้ไข
//   Enter = บันทึกแล้วลงล่าง · Tab = บันทึกแล้วไปขวา · Esc = ยกเลิก · ลูกศร = เลื่อนเซลล์
//   "+ เพิ่มแถว" = แถวใหม่ด้านบน บันทึกอัตโนมัติเมื่อกรอกครบ (ผ่าน validate)
//
//   const grid = new ExcelGrid(el, {
//     columns: [{ key: 'name', header: 'ชื่อ', width: 160, editor: 'text', required: true,
//                 value: (r) => r.name, set: (r, v) => ({ ...r, name: v }) }],
//     rowKey: (r) => r.id,
//     validate: (r) => (r.name ? {} : { name: 'กรุณากรอกชื่อ' }),
//     onSave: async (row, isNew) => api.save(row),   // ต้องคืนแถวที่บันทึกแล้ว
//     newRow: () => ({ id: 0, name: '' }),
//   });
//   grid.setRows(rows);
//
// editor: 'text' | 'number' | 'date' | 'select' | 'switch' · ไม่ใส่ = อ่านอย่างเดียว
// options(row) สำหรับ select · editable(row) = แก้ได้เฉพาะบางแถว · display(row) = HTML ที่แสดง
// กรองคอลัมน์ที่หัวตาราง: เปิดอัตโนมัติ · filter: false = ปิด · text(row) = ข้อความที่ใช้กรอง (ไม่ใส่ = ข้อความที่แสดง)
// มือถือ (<768px): ใส่ mobileCard(row) => HTML เพื่อแสดงเป็นการ์ดแทนตาราง (แตะการ์ด = onOpen)
//   และ mobileAddHref = ลิงก์ของปุ่ม "เพิ่ม" บนมือถือ (เช่น ฟอร์มเต็ม) เพราะการกรอกในเซลล์บนจอเล็กไม่สะดวก
import { esc, html, raw } from '../shared/dom.js';
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
import { openPicker } from './combobox.js';
import { spinner } from './loading.js';
import { pagerHtml, wirePager } from './table.js';

const fmt = (v) => (v === null || v === undefined || v === '' ? '' : String(v));

export class ExcelGrid {
  constructor(root, opts) {
    this.root = root;
    this.o = { addLabel: 'เพิ่มแถว', ...opts };
    this.allCols = opts.columns;
    this.tid = tableId(root, opts);
    this.pins = loadPins(this.tid); // คอลัมน์ที่ผู้ใช้ตรึงไว้ด้านซ้าย
    this.cols = orderByPins(this.allCols, this.pins);
    this.rows = null;
    this.drafts = new Map(); // key → แถวที่แก้แล้วแต่ยังไม่บันทึก/บันทึกไม่ผ่าน
    this.newRows = []; // { key, row }
    this.status = new Map(); // key → { state: 'saving'|'saved'|'error', message? }
    this.active = null; // { r, c }
    this.editing = false;
    this.page = opts.page ?? 1;
    this.size = opts.pageSize ?? 0;
    this.seq = 0;
    this.filter = new FilterState();
    this.pinned = new Set(); // แถวที่เพิ่งแก้ — แสดงต่อแม้ไม่ตรงตัวกรอง (ไม่หายระหว่างแก้)
    this.handled = false;
    if (opts.mobileCard) root.classList.add('has-mobile-cards');
    this.bind();
    this.render();
  }

  // ---------- public ----------
  setRows(rows) {
    this.rows = rows;
    this.render();
  }

  getRows() {
    return this.rows ?? [];
  }

  removeRow(key) {
    this.rows = this.rows?.filter((r) => String(this.o.rowKey(r)) !== String(key)) ?? null;
    this.drafts.delete(String(key));
    this.status.delete(String(key));
    this.active = null;
    this.render();
  }

  // ---------- data ----------
  // ----- กรองคอลัมน์ -----
  colByKey(key) {
    return this.cols.find((c) => c.key === key);
  }

  canFilter(c) {
    return c.filter !== false && !!c.header;
  }

  textOf = (row, key) => {
    const c = this.colByKey(key);
    if (c.text) return String(c.text(row) ?? '');
    const v = c.value(row);
    if (c.editor === 'switch') return v ? 'ใช่' : 'ไม่ใช่';
    const opt = c.options?.(row)?.find((o) => o.value === fmt(v));
    if (opt) return opt.label;
    if (c.display) return stripHtml(c.display(row));
    return fmt(v);
  };

  sortOf = (row, key) => this.colByKey(key).value(row);

  filtered() {
    if (!this.rows) return [];
    return this.filter.apply(this.rows, this.textOf, this.sortOf, (r) => this.pinned.has(String(this.o.rowKey(r))));
  }

  openFilter(btn) {
    const key = btn.dataset.colFilter;
    const c = this.colByKey(key);
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
        this.afterFilterChange();
      },
      pinned: this.pins.has(key),
      onPin: () => {
        if (this.pins.has(key)) this.pins.delete(key);
        else this.pins.add(key);
        savePins(this.tid, this.pins);
        this.cols = orderByPins(this.allCols, this.pins);
        this.active = null;
        this.render();
      },
    });
  }

  /** ตำแหน่ง sticky ของคอลัมน์ที่ตรึง: ถัดจากคอลัมน์เลขแถว (52px) เรียงตามความกว้าง */
  pinOffsets() {
    const out = {};
    let left = 52;
    const pinned = this.cols.filter((c) => this.pins.has(c.key));
    pinned.forEach((c, i) => {
      out[c.key] = { left, edge: i === pinned.length - 1 };
      left += c.width;
    });
    return out;
  }

  afterFilterChange() {
    this.pinned.clear();
    this.page = 1;
    this.active = null;
    this.render();
  }

  pageRows() {
    if (!this.rows) return [];
    const rows = this.filtered();
    if (!this.size) return rows;
    const pages = Math.max(1, Math.ceil(rows.length / this.size));
    this.page = Math.min(Math.max(1, this.page), pages);
    return rows.slice((this.page - 1) * this.size, this.page * this.size);
  }

  entries() {
    return [
      ...this.newRows.map((n) => ({ key: n.key, row: n.row, isNew: true })),
      ...this.pageRows().map((r) => {
        const key = String(this.o.rowKey(r));
        return { key, row: this.drafts.get(key) ?? r, isNew: false };
      }),
    ];
  }

  errorsOf(row) {
    return this.o.validate?.(row) ?? {};
  }

  canEdit(col, row) {
    return !!col.editor && !!col.set && (col.editable ? col.editable(row) : true);
  }

  async save(entry, next) {
    const errs = this.errorsOf(next);
    if (Object.keys(errs).length) {
      if (!entry.isNew) this.status.set(entry.key, { state: 'error', message: Object.values(errs).join(' · ') });
      this.render();
      return;
    }
    this.status.set(entry.key, { state: 'saving' });
    this.render();
    try {
      const saved = (await this.o.onSave(next, entry.isNew)) ?? next;
      if (entry.isNew) {
        this.newRows = this.newRows.filter((n) => n.key !== entry.key);
        this.rows = [saved, ...(this.rows ?? [])];
        this.status.delete(entry.key);
        this.status.set(String(this.o.rowKey(saved)), { state: 'saved' });
        if (this.active) this.active.r = Math.max(0, this.active.r - 1);
      } else {
        this.drafts.delete(entry.key);
        this.pinned.add(entry.key);
        this.rows = this.rows.map((r) => (String(this.o.rowKey(r)) === entry.key ? saved : r));
        this.status.set(entry.key, { state: 'saved' });
      }
      setTimeout(() => {
        for (const [k, s] of this.status) if (s.state === 'saved') this.status.delete(k);
        if (!this.editing) this.render();
      }, 2000);
    } catch (e) {
      this.status.set(entry.key, { state: 'error', message: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' });
    }
    if (!this.editing) this.render();
  }

  commit(r, c, rawValue) {
    const entry = this.entries()[r];
    const col = this.cols[c];
    if (!entry || !col.set) return;
    if (fmt(col.value(entry.row)) === fmt(rawValue)) return;
    const value = col.editor === 'number' ? (rawValue === '' || rawValue === null ? null : Number(rawValue)) : rawValue;
    const next = col.set(entry.row, value);
    if (entry.isNew) this.newRows = this.newRows.map((n) => (n.key === entry.key ? { ...n, row: next } : n));
    else this.drafts.set(entry.key, next);
    this.save(entry, next);
  }

  // ---------- interaction ----------
  cellEl(r, c) {
    return this.root.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
  }

  setActive(r, c) {
    const n = this.entries().length;
    if (!n) return;
    r = Math.max(0, Math.min(n - 1, r));
    c = Math.max(0, Math.min(this.cols.length - 1, c));
    this.root.querySelectorAll('td.active').forEach((td) => td.classList.remove('active'));
    this.active = { r, c };
    const td = this.cellEl(r, c);
    td?.classList.add('active');
    td?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.drawErrorBar();
  }

  move(dr, dc) {
    if (!this.active) return this.setActive(0, 0);
    this.setActive(this.active.r + dr, this.active.c + dc);
  }

  focusGrid() {
    this.root.querySelector('.xgrid-wrap')?.focus({ preventScroll: true });
  }

  startEdit(initial) {
    if (!this.active || this.editing) return;
    const { r, c } = this.active;
    const entry = this.entries()[r];
    const col = this.cols[c];
    if (!entry || !this.canEdit(col, entry.row)) return;
    const td = this.cellEl(r, c);

    if (col.editor === 'switch') {
      this.commit(r, c, !col.value(entry.row));
      return;
    }
    this.editing = true;
    td.classList.add('editing');

    if (col.editor === 'select') {
      openPicker({
        anchor: td,
        options: col.options?.(entry.row) ?? [],
        value: fmt(col.value(entry.row)),
        creatable: col.creatable,
        initialQuery: initial ?? '',
        onPick: (v) => {
          this.editing = false;
          this.commit(r, c, v);
        },
        onClose: (picked) => {
          this.editing = false;
          td.classList.remove('editing');
          if (picked) this.move(1, 0);
          this.render();
          this.focusGrid();
        },
      });
      return;
    }

    const type = col.editor === 'number' ? 'number' : col.editor === 'date' ? 'date' : 'text';
    td.innerHTML = '';
    const input = document.createElement('input');
    input.type = type;
    input.className = 'num';
    input.setAttribute('aria-label', col.header);
    input.value = initial ?? fmt(col.value(entry.row));
    if (col.align === 'right') input.style.textAlign = 'right';
    td.append(input);
    input.focus();
    this.handled = false;

    const finish = (value, dr, dc) => {
      this.handled = true;
      this.editing = false;
      if (value !== undefined) this.commit(r, c, value);
      this.render();
      if (dr || dc) this.move(dr, dc);
      this.focusGrid();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(input.value, 1, 0);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        finish(input.value, 0, e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(undefined, 0, 0);
      }
      e.stopPropagation();
    });
    input.addEventListener('blur', () => {
      if (this.handled) return;
      this.handled = true;
      this.editing = false;
      this.commit(r, c, input.value);
      this.render();
    });
  }

  addRow() {
    if (!this.o.newRow) return;
    const key = `new:${++this.seq}`;
    this.newRows = [{ key, row: this.o.newRow() }, ...this.newRows];
    this.render();
    this.setActive(0, 0);
    this.focusGrid();
  }

  bind() {
    const root = this.root;
    root.addEventListener('mousedown', (e) => {
      const td = e.target.closest('td[data-r]');
      if (!td || this.editing) return;
      this.setActive(Number(td.dataset.r), Number(td.dataset.c));
    });
    root.addEventListener('click', (e) => {
      const fb = e.target.closest('[data-col-filter]');
      if (fb) return this.openFilter(fb);
      const card = e.target.closest('[data-card-key]');
      if (card) {
        const entry = this.entries().find((x) => x.key === card.dataset.cardKey);
        return entry && this.o.onOpen?.(entry.row);
      }
      if (e.target.closest('[data-clear-col-filters]')) {
        this.filter.clear();
        return this.afterFilterChange();
      }
      const btn = e.target.closest('[data-grid-act]');
      if (btn) {
        const act = btn.dataset.gridAct;
        if (act === 'add') return this.addRow();
        const entry = this.entries().find((x) => x.key === btn.dataset.key);
        if (!entry) return;
        if (act === 'discard') {
          this.newRows = this.newRows.filter((n) => n.key !== entry.key);
          this.status.delete(entry.key);
          this.active = null;
          return this.render();
        }
        if (act === 'open') return this.o.onOpen?.(entry.row);
        if (act === 'delete') return this.o.onDelete?.(entry.row);
      }
      const td = e.target.closest('td[data-r]');
      if (!td || this.editing) return;
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      const col = this.cols[c];
      const entry = this.entries()[r];
      if (!entry || !this.canEdit(col, entry.row)) return;
      if (col.editor === 'switch') this.commit(r, c, !col.value(entry.row));
      else if (col.editor === 'select' && td.dataset.wasActive === '1') this.startEdit();
    });
    // คลิกครั้งที่ 2 บนเซลล์ select ที่เลือกอยู่แล้ว = เปิดรายการ
    root.addEventListener(
      'mousedown',
      (e) => {
        const td = e.target.closest('td[data-r]');
        if (td) td.dataset.wasActive = td.classList.contains('active') ? '1' : '0';
      },
      true,
    );
    root.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td[data-r]');
      if (!td || this.cols[Number(td.dataset.c)].editor === 'switch') return;
      this.startEdit();
    });
    root.addEventListener('keydown', (e) => {
      if (!e.target.classList?.contains('xgrid-wrap') || this.editing || !this.active) return;
      const k = e.key;
      const ed = this.cols[this.active.c].editor;
      if (k === 'ArrowDown') this.move(1, 0);
      else if (k === 'ArrowUp') this.move(-1, 0);
      else if (k === 'ArrowRight') this.move(0, 1);
      else if (k === 'ArrowLeft') this.move(0, -1);
      else if (k === 'Tab') this.move(0, e.shiftKey ? -1 : 1);
      else if (k === 'Enter' || k === 'F2') this.startEdit();
      else if (k === ' ' && ed === 'switch') this.startEdit();
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (ed === 'text' || ed === 'number') this.startEdit(k);
        else if (ed === 'select') this.startEdit(k);
        else if (ed === 'date') this.startEdit();
        else return;
      } else return;
      e.preventDefault();
    });
  }

  // ---------- render ----------
  drawErrorBar() {
    const bar = this.root.querySelector('.grid-error');
    if (!bar) return;
    const entry = this.active && this.entries()[this.active.r];
    const st = entry && this.status.get(entry.key);
    if (st?.state === 'error') {
      bar.classList.remove('hidden');
      bar.innerHTML = `${icon('alert-triangle')} ${esc(st.message)}`;
    } else bar.classList.add('hidden');
  }

  statusCell(entry, index) {
    const st = this.status.get(entry.key);
    if (st?.state === 'saving') return spinner({ size: 'sm' });
    if (st?.state === 'saved') return raw(`<span class="text-success">${icon('check')}</span>`);
    if (st?.state === 'error') return raw(`<span class="text-danger" title="${esc(st.message)}">${icon('alert-triangle')}</span>`);
    if (entry.isNew) return html`<span class="new-tag">ใหม่</span>`;
    return html`<span class="num">${index}</span>`;
  }

  render() {
    if (this.editing) return;
    const { rowKey, onOpen, onDelete, newRow, addLabel, toolbar, empty } = this.o;
    const entries = this.entries();
    const hasActions = !!(onOpen || onDelete);
    const width = 52 + this.cols.reduce((s, c) => s + c.width, 0) + (hasActions ? 76 : 0);
    const offset = this.size ? (this.page - 1) * this.size : 0;
    const unsaved = this.newRows.length + this.drafts.size;
    const errors = [...this.status.values()].filter((s) => s.state === 'error').length;
    const loading = this.rows === null;
    const pins = this.pinOffsets();
    const pinStyle = (c, z) => (pins[c.key] ? `position:sticky;left:${pins[c.key].left}px;z-index:${z}` : '');
    const pinCls = (c) => (pins[c.key] ? ` pinned${pins[c.key].edge ? ' pin-edge' : ''}` : '');

    const body = loading
      ? Array.from(
          { length: 8 },
          () => html`<tr>
            <td class="stick-left"></td>
            ${this.cols.map((c) => html`<td class="${pinCls(c)}" style="${pinStyle(c, 2)}"><div class="cell"><div class="skeleton sk-line"></div></div></td>`)}
            ${hasActions ? html`<td class="stick-right"></td>` : ''}
          </tr>`,
        )
      : entries.map((entry, r) => {
          const st = this.status.get(entry.key);
          const errs = entry.isNew || st?.state === 'error' ? this.errorsOf(entry.row) : {};
          return html`<tr class="${entry.isNew ? 'is-new' : ''} ${st?.state === 'error' ? 'has-error' : ''}">
            <td class="stick-left">${this.statusCell(entry, offset + r - this.newRows.length + 1)}</td>
            ${this.cols.map((col, c) => {
              const editable = this.canEdit(col, entry.row);
              const err = errs[col.key];
              const isActive = this.active?.r === r && this.active?.c === c;
              const cls = [editable ? 'editable' : col.editor ? 'locked' : 'muted', err ? 'invalid' : '', isActive ? 'active' : ''].join(' ') + pinCls(col);
              let content;
              if (col.editor === 'switch') {
                content = html`<span class="switch sm" aria-checked="${!!col.value(entry.row)}" aria-hidden="true"></span>`;
              } else if (col.display) {
                content = col.display(entry.row);
              } else {
                const v = fmt(col.value(entry.row));
                content = v ? html`<span class="truncate ${col.editor === 'number' ? 'num' : ''}">${v}</span>` : err ? html`<span class="must">ต้องกรอก</span>` : '';
              }
              return html`<td data-r="${r}" data-c="${c}" data-col="${col.key}" class="${cls}" style="${pinStyle(col, 2)}" role="gridcell" ${err ? raw(`title="${esc(err)}"`) : ''}>
                <div class="cell ${col.align ?? ''}">${content}</div>
              </td>`;
            })}
            ${hasActions
              ? html`<td class="stick-right">
                  <div class="row-actions">
                    ${entry.isNew
                      ? html`<button class="btn-icon sm danger" data-grid-act="discard" data-key="${entry.key}" title="ทิ้งแถวใหม่" aria-label="ทิ้งแถวใหม่">${raw(icon('trash-2'))}</button>`
                      : html`${onOpen ? html`<button class="btn-icon sm" data-grid-act="open" data-key="${entry.key}" title="เปิดรายละเอียด" aria-label="เปิดรายละเอียด">${raw(icon('external-link'))}</button>` : ''}
                        ${onDelete ? html`<button class="btn-icon sm danger" data-grid-act="delete" data-key="${entry.key}" title="ลบ" aria-label="ลบ">${raw(icon('trash-2'))}</button>` : ''}`}
                  </div>
                </td>`
              : ''}
          </tr>`;
        });

    const total = this.filtered().length;
    const showPager = this.size && this.rows && total > 0;
    const noMatch = !loading && this.rows.length > 0 && total === 0 && !this.newRows.length;
    const hadFocus = this.root.contains(document.activeElement);
    this.root.innerHTML = String(html`<div class="grid-toolbar">
        ${newRow ? html`<button class="btn btn-primary btn-sm ${this.o.mobileCard ? 'hide-mobile' : ''}" data-grid-act="add">${raw(icon('plus'))} ${addLabel}</button>` : ''}
        ${this.o.mobileAddHref ? html`<a class="btn btn-primary btn-sm show-mobile" href="${this.o.mobileAddHref}">${raw(icon('plus'))} ${this.o.mobileAddLabel ?? addLabel}</a>` : ''} ${toolbar ?? ''}
        <span class="help">ดับเบิลคลิก / Enter / พิมพ์ = แก้ไข · Tab, Enter = บันทึก · Esc = ยกเลิก · ←↑↓→ เลื่อนเซลล์</span>
        ${unsaved || errors ? html`<span class="unsaved ${errors ? 'error' : ''}">${errors ? `มีข้อผิดพลาด ${errors} แถว` : `ยังไม่บันทึก ${unsaved} แถว`}</span>` : ''}
      </div>
      ${filterSummary(this.filter, (k) => this.colByKey(k).header)}
      <div class="xgrid-wrap" tabindex="0" role="grid" aria-rowcount="${entries.length}">
        <table class="xgrid" style="width:${width}px">
          <colgroup>
            <col style="width:52px" />
            ${this.cols.map((c) => html`<col style="width:${c.width}px" />`)} ${hasActions ? html`<col style="width:76px" />` : ''}
          </colgroup>
          <thead>
            <tr>
              <th class="stick-left">#</th>
              ${this.cols.map(
                (c) =>
                  html`<th class="${pinCls(c)}" style="${pinStyle(c, 4)}" data-col="${c.key}">
                    <span class="th-inner" style="justify-content:${c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'space-between'}"
                      ><span class="truncate">${pinMark(this.pins.has(c.key))}${c.header}${c.required ? html`<span class="req">*</span>` : ''}</span>${this.canFilter(c) && !loading
                        ? headerFilterButton(c.key, c.header, this.filter)
                        : ''}</span
                    >
                  </th>`,
              )}
              ${hasActions ? html`<th class="stick-right" aria-label="การทำงาน"></th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
        ${noMatch ? html`<div class="empty" style="padding:32px"><b>ไม่มีแถวที่ตรงกับตัวกรองคอลัมน์</b></div>` : !loading && entries.length === 0 ? (empty ?? '') : ''}
      </div>
      ${this.o.mobileCard
        ? html`<ul class="grid-cards">
            ${loading
              ? html`<li><div class="gc-body"><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div></div></li>`
              : entries
                  .filter((e) => !e.isNew)
                  .map(
                    (e) => html`<li data-card-key="${e.key}" role="button" tabindex="0">
                      <div class="gc-body">${this.o.mobileCard(e.row)}</div>
                      ${raw(icon('chevron-right', 'gc-chev'))}
                    </li>`,
                  )}
          </ul>`
        : ''}
      <div class="grid-error hidden" role="alert"></div>
      ${showPager ? pagerHtml({ page: this.page, pageSize: this.size, total }) : ''}`);

    if (showPager) {
      wirePager(this.root, {
        onPage: (p) => {
          this.page = p;
          this.active = null;
          this.o.onPageChange?.(p);
          this.render();
        },
        onSize: (s) => {
          this.size = s;
          this.page = 1;
          this.active = null;
          this.o.onPageChange?.(1);
          this.render();
        },
      });
    }
    this.drawErrorBar();
    if (hadFocus && this.active) this.focusGrid();
    void rowKey;
  }
}
