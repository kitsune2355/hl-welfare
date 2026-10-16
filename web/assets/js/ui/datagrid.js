// ตารางแบบ Excel — คลิกเพื่อสร้าง/แก้ไขในตาราง
//
//   คลิกเซลล์ = เลือก · ดับเบิลคลิก / Enter / F2 / พิมพ์ = แก้ไข
//   Enter = ยืนยันค่าแล้วลงล่าง · Tab = ไปขวา · Esc = ยกเลิก · ลูกศร = เลื่อนเซลล์
//
//   การเปลี่ยนแปลงยังไม่บันทึกจนกว่าจะกด "บันทึก" (หรือ Ctrl+S) — แสดงสีให้เห็นชัด:
//     แถวใหม่ = เขียว · แถวที่แก้ = เหลือง (เซลล์ที่เปลี่ยนมีขีดด้านซ้าย) · แถวที่จะลบ = แดง ขีดฆ่า
//   แถบ "ยังไม่บันทึก" บอกจำนวน เพิ่ม / แก้ไข / ลบ + ปุ่มยกเลิกทั้งหมด / บันทึก · ปิดหน้าขณะมีงานค้าง = ถามก่อน
//
//   const grid = new ExcelGrid(el, {
//     columns: [{ key: 'name', header: 'ชื่อ', width: 160, editor: 'text', required: true,
//                 value: (r) => r.name, set: (r, v) => ({ ...r, name: v }) }],
//     rowKey: (r) => r.id,
//     validate: (r) => (r.name ? {} : { name: 'กรุณากรอกชื่อ' }),
//     onSave: async (row, isNew) => api.save(row),   // ต้องคืนแถวที่บันทึกแล้ว
//     onRemove: async (row) => api.delete(row.id),   // ลบจริงตอนกดบันทึก (ไม่ใส่ = ลบไม่ได้)
//     rowLabel: (row) => row.name,                   // ชื่อแถวในกล่องยืนยันการลบ
//     onSaved: ({ added, edited, deleted }) => {},   // หลังบันทึกครบ
//     newRow: () => ({ id: 0, name: '' }),
//   });
//   grid.setRows(rows);
//
// editor: 'text' | 'number' | 'date' | 'select' | 'switch' · ไม่ใส่ = อ่านอย่างเดียว
// options(row) สำหรับ select · editable(row) = แก้ได้เฉพาะบางแถว · display(row) = HTML ที่แสดง
// กรองคอลัมน์ที่หัวตาราง: เปิดอัตโนมัติ · filter: false = ปิด · text(row) = ข้อความที่ใช้กรอง (ไม่ใส่ = ข้อความที่แสดง)
// มือถือ (<768px): ใส่ mobileCard(row) => HTML เพื่อแสดงเป็นการ์ดแทนตาราง (แตะการ์ด = onOpen)
//   และ mobileAddHref = ลิงก์ของปุ่ม "เพิ่ม" บนมือถือ เพราะการกรอกในเซลล์บนจอเล็กไม่สะดวก
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
import { confirmAction, errorMessage, toast } from './overlay.js';
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
    this.drafts = new Map(); // key → แถวที่แก้แล้วแต่ยังไม่บันทึก
    this.newRows = []; // { key, row } — แถวใหม่ที่ยังไม่บันทึก
    this.deleted = new Set(); // key ของแถวที่จะลบตอนบันทึก
    this.saving = false;
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
    // ปิด/ออกจากหน้าขณะมีการเปลี่ยนแปลงที่ยังไม่บันทึก → เบราว์เซอร์ถามก่อน
    window.addEventListener('beforeunload', (e) => {
      if (this.hasPending()) e.preventDefault();
    });
    this.render();
  }

  /** จำนวนการเปลี่ยนแปลงที่ยังไม่บันทึก */
  pendingCounts() {
    const edited = [...this.drafts.keys()].filter((k) => !this.deleted.has(k)).length;
    return { added: this.newRows.length, edited, deleted: this.deleted.size, total: this.newRows.length + edited + this.deleted.size };
  }

  hasPending() {
    return this.pendingCounts().total > 0;
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
    this.deleted.delete(String(key));
    this.status.delete(String(key));
    this.active = null;
    this.render();
  }

  rowByKey(key) {
    return this.rows?.find((r) => String(this.o.rowKey(r)) === key) ?? null;
  }

  /** ค่าทุกคอลัมน์เท่าเดิม = ไม่นับว่าแก้ */
  sameRow(a, b) {
    return this.allCols.every((c) => fmt(c.value(a)) === fmt(c.value(b)));
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
        const draft = this.drafts.get(key);
        return { key, row: draft ?? r, orig: r, isNew: false, isEdited: !!draft, isDeleted: this.deleted.has(key) };
      }),
    ];
  }

  errorsOf(row) {
    return this.o.validate?.(row) ?? {};
  }

  canEdit(col, row) {
    return !!col.editor && !!col.set && (col.editable ? col.editable(row) : true);
  }

  /** บันทึกการเปลี่ยนแปลงทั้งหมด: ลบ → แก้ไข → เพิ่ม · แถวที่ไม่ผ่านยังค้างอยู่พร้อมสาเหตุ */
  async saveAll() {
    if (this.saving || this.editing || !this.hasPending()) return;
    const edits = [...this.drafts].filter(([k]) => !this.deleted.has(k));
    const invalid = [...this.newRows.map((n) => [n.key, n.row]), ...edits].filter(([, row]) => Object.keys(this.errorsOf(row)).length);
    if (invalid.length) {
      for (const [k, row] of invalid) this.status.set(k, { state: 'error', message: Object.values(this.errorsOf(row)).join(' · ') });
      this.render();
      toast.error(`ข้อมูลยังไม่ครบ ${invalid.length} แถว — แก้ช่องที่ขึ้นสีแดงก่อนบันทึก`);
      return;
    }
    const dels = [...this.deleted].map((k) => [k, this.rowByKey(k)]).filter(([, row]) => row);
    if (dels.length) {
      const label = this.o.rowLabel ?? ((r) => String(this.o.rowKey(r)));
      const ok = await confirmAction({
        title: `ลบ ${dels.length} รายการ?`,
        body: html`<ul class="gp-del-list">${dels.map(([, r]) => html`<li>${label(r)}</li>`)}</ul>`,
        confirmLabel: 'ลบและบันทึก',
        action: async () => {},
      });
      if (!ok) return;
    }
    this.saving = true;
    this.active = null;
    const done = { added: 0, edited: 0, deleted: 0 };
    let failed = 0;
    const fail = (k, e) => {
      failed++;
      this.status.set(k, { state: 'error', message: errorMessage(e) });
    };
    const mark = (k) => this.status.set(k, { state: 'saving' });
    [...dels.map(([k]) => k), ...edits.map(([k]) => k), ...this.newRows.map((n) => n.key)].forEach(mark);
    this.render();
    for (const [k, row] of dels) {
      try {
        await this.o.onRemove(row);
        this.rows = this.rows.filter((r) => String(this.o.rowKey(r)) !== k);
        this.deleted.delete(k);
        this.drafts.delete(k);
        this.status.delete(k);
        done.deleted++;
      } catch (e) {
        fail(k, e);
      }
    }
    for (const [k, row] of edits) {
      try {
        const saved = (await this.o.onSave(row, false)) ?? row;
        this.rows = this.rows.map((r) => (String(this.o.rowKey(r)) === k ? saved : r));
        this.drafts.delete(k);
        this.pinned.add(k);
        this.status.set(k, { state: 'saved' });
        done.edited++;
      } catch (e) {
        fail(k, e);
      }
    }
    for (const n of [...this.newRows].reverse()) {
      try {
        const saved = (await this.o.onSave(n.row, true)) ?? n.row;
        this.newRows = this.newRows.filter((x) => x.key !== n.key);
        this.rows = [saved, ...(this.rows ?? [])];
        this.status.delete(n.key);
        const key = String(this.o.rowKey(saved));
        this.pinned.add(key);
        this.status.set(key, { state: 'saved' });
        done.added++;
      } catch (e) {
        fail(n.key, e);
      }
    }
    this.saving = false;
    setTimeout(() => {
      for (const [k, s] of this.status) if (s.state === 'saved') this.status.delete(k);
      if (!this.editing) this.render();
    }, 2000);
    this.render();
    const parts = [done.added && `เพิ่ม ${done.added}`, done.edited && `แก้ไข ${done.edited}`, done.deleted && `ลบ ${done.deleted}`].filter(Boolean).join(' · ');
    if (parts) toast.success(`บันทึกแล้ว — ${parts}`);
    if (failed) toast.error(`บันทึกไม่สำเร็จ ${failed} แถว — ดูสาเหตุที่แถวสีแดง`);
    this.o.onSaved?.(done);
  }

  /** ยกเลิกการเปลี่ยนแปลงทั้งหมดที่ยังไม่บันทึก */
  discardAll() {
    this.newRows = [];
    this.drafts.clear();
    this.deleted.clear();
    for (const [k, s] of this.status) if (s.state === 'error') this.status.delete(k);
    this.active = null;
    this.render();
  }

  commit(r, c, rawValue) {
    const entry = this.entries()[r];
    const col = this.cols[c];
    if (!entry || !col.set || entry.isDeleted) return;
    if (fmt(col.value(entry.row)) === fmt(rawValue)) return;
    const value = col.editor === 'number' ? (rawValue === '' || rawValue === null ? null : Number(rawValue)) : rawValue;
    const next = col.set(entry.row, value);
    if (entry.isNew) this.newRows = this.newRows.map((n) => (n.key === entry.key ? { ...n, row: next } : n));
    else if (this.sameRow(next, entry.orig)) this.drafts.delete(entry.key); // แก้กลับเป็นค่าเดิม = ไม่นับว่าแก้
    else this.drafts.set(entry.key, next);
    if (this.status.get(entry.key)?.state === 'error') this.status.delete(entry.key);
    if (!this.editing) this.render();
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
    if (!entry || entry.isDeleted || this.saving || !this.canEdit(col, entry.row)) return;
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
        if (act === 'save-all') return this.saveAll();
        if (act === 'discard-all') return this.discardAll();
        const entry = this.entries().find((x) => x.key === btn.dataset.key);
        if (!entry || this.saving) return;
        if (act === 'discard') {
          this.newRows = this.newRows.filter((n) => n.key !== entry.key);
          this.status.delete(entry.key);
          this.active = null;
          return this.render();
        }
        if (act === 'open') return this.o.onOpen?.(entry.row);
        if (act === 'delete') {
          // ลบ = ทำเครื่องหมายไว้ ลบจริงตอนกดบันทึก (ไม่มี onRemove → ใช้ onDelete แบบเดิม)
          if (!this.o.onRemove) return this.o.onDelete?.(entry.row);
          this.deleted.add(entry.key);
          this.status.delete(entry.key);
          return this.render();
        }
        if (act === 'undo') {
          // คืนค่าเดิม: ยกเลิกการลบ / ยกเลิกการแก้ไขของแถวนี้
          if (this.deleted.has(entry.key)) this.deleted.delete(entry.key);
          else this.drafts.delete(entry.key);
          this.status.delete(entry.key);
          return this.render();
        }
      }
      const td = e.target.closest('td[data-r]');
      if (!td || this.editing) return;
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      const col = this.cols[c];
      const entry = this.entries()[r];
      if (!entry || entry.isDeleted || this.saving || !this.canEdit(col, entry.row)) return;
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
      // Ctrl/⌘ + S = บันทึกทั้งหมด
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !this.editing) {
        e.preventDefault();
        return this.saveAll();
      }
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
    if (entry.isNew) return html`<span class="chg-tag add">ใหม่</span>`;
    if (entry.isDeleted) return html`<span class="chg-tag del">ลบ</span>`;
    if (entry.isEdited) return html`<span class="chg-tag edit">แก้ไข</span>`;
    return html`<span class="num">${index}</span>`;
  }

  /** แถบการเปลี่ยนแปลงที่ยังไม่บันทึก (หรือคำอธิบายสีเมื่อไม่มี) */
  pendingBar() {
    const p = this.pendingCounts();
    const errors = [...this.status.values()].filter((s) => s.state === 'error').length;
    if (!p.total)
      return html`<span class="gp-legend" aria-hidden="true"><i class="add"></i>เพิ่ม <i class="edit"></i>แก้ไข <i class="del"></i>ลบ</span>`;
    return html`<div class="grid-pending" role="status">
      <span class="gp-title">${raw(icon('alert-circle'))} ยังไม่บันทึก</span>
      ${p.added ? html`<span class="chg-tag add">เพิ่ม ${p.added}</span>` : ''}
      ${p.edited ? html`<span class="chg-tag edit">แก้ไข ${p.edited}</span>` : ''}
      ${p.deleted ? html`<span class="chg-tag del">ลบ ${p.deleted}</span>` : ''}
      ${errors ? html`<span class="gp-error">${raw(icon('alert-triangle'))} มีปัญหา ${errors} แถว</span>` : ''}
      <span class="gp-actions">
        <button type="button" class="btn btn-sm btn-ghost" data-grid-act="discard-all" ${this.saving ? 'disabled' : ''}>ยกเลิกทั้งหมด</button>
        <button type="button" class="btn btn-sm btn-primary" data-grid-act="save-all" ${this.saving ? 'disabled' : ''} title="Ctrl + S">${this.saving ? spinner({ size: 'sm', onColor: true }) : raw(icon('save'))} บันทึก (${p.total})</button>
      </span>
    </div>`;
  }

  render() {
    if (this.editing) return;
    const { rowKey, onOpen, onDelete, newRow, addLabel, toolbar, empty } = this.o;
    const entries = this.entries();
    const hasActions = !!(onOpen || onDelete || this.o.onRemove);
    const width = 52 + this.cols.reduce((s, c) => s + c.width, 0) + (hasActions ? 76 : 0);
    const offset = this.size ? (this.page - 1) * this.size : 0;
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
          // แถวใหม่/แถวที่แก้: ตรวจข้อมูลทันที (เห็นช่องที่ยังไม่ครบก่อนกดบันทึก)
          const errs = !entry.isDeleted && (entry.isNew || entry.isEdited || st?.state === 'error') ? this.errorsOf(entry.row) : {};
          const rowCls = [entry.isNew ? 'is-new' : '', entry.isEdited && !entry.isDeleted ? 'is-edited' : '', entry.isDeleted ? 'is-deleted' : '', st?.state === 'error' ? 'has-error' : ''].join(' ');
          return html`<tr class="${rowCls}">
            <td class="stick-left">${this.statusCell(entry, offset + r - this.newRows.length + 1)}</td>
            ${this.cols.map((col, c) => {
              const editable = !entry.isDeleted && this.canEdit(col, entry.row);
              const err = errs[col.key];
              const isActive = this.active?.r === r && this.active?.c === c;
              const changed = entry.isEdited && fmt(col.value(entry.row)) !== fmt(col.value(entry.orig));
              const cls = [editable ? 'editable' : col.editor ? 'locked' : 'muted', err ? 'invalid' : '', isActive ? 'active' : '', changed ? 'changed' : ''].join(' ') + pinCls(col);
              let content;
              if (col.editor === 'switch') {
                content = html`<span class="switch sm" aria-checked="${!!col.value(entry.row)}" aria-hidden="true"></span>`;
              } else if (col.display) {
                content = col.display(entry.row);
              } else {
                const v = fmt(col.value(entry.row));
                content = v ? html`<span class="truncate ${col.editor === 'number' ? 'num' : ''}">${v}</span>` : err ? html`<span class="must">ต้องกรอก</span>` : '';
              }
              const tip = err ? err : changed ? `เดิม: ${this.textOf(entry.orig, col.key) || '(ว่าง)'}` : '';
              return html`<td data-r="${r}" data-c="${c}" data-col="${col.key}" class="${cls}" style="${pinStyle(col, 2)}" role="gridcell" ${tip ? raw(`title="${esc(tip)}"`) : ''}>
                <div class="cell ${col.align ?? ''}">${content}</div>
              </td>`;
            })}
            ${hasActions
              ? html`<td class="stick-right">
                  <div class="row-actions">
                    ${entry.isNew
                      ? html`<button class="btn-icon sm danger" data-grid-act="discard" data-key="${entry.key}" title="ทิ้งแถวใหม่" aria-label="ทิ้งแถวใหม่">${raw(icon('x'))}</button>`
                      : entry.isDeleted || entry.isEdited
                        ? html`<button class="btn-icon sm" data-grid-act="undo" data-key="${entry.key}" title="${entry.isDeleted ? 'ยกเลิกการลบ' : 'คืนค่าเดิม'}" aria-label="${entry.isDeleted ? 'ยกเลิกการลบ' : 'คืนค่าเดิม'}">${raw(icon('undo-2'))}</button>
                            ${!entry.isDeleted && (onDelete || this.o.onRemove) ? html`<button class="btn-icon sm danger" data-grid-act="delete" data-key="${entry.key}" title="ลบ" aria-label="ลบ">${raw(icon('trash-2'))}</button>` : ''}`
                        : html`${onOpen ? html`<button class="btn-icon sm" data-grid-act="open" data-key="${entry.key}" title="เปิดรายละเอียด" aria-label="เปิดรายละเอียด">${raw(icon('external-link'))}</button>` : ''}
                            ${onDelete || this.o.onRemove ? html`<button class="btn-icon sm danger" data-grid-act="delete" data-key="${entry.key}" title="ลบ" aria-label="ลบ">${raw(icon('trash-2'))}</button>` : ''}`}
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
        <span class="help">ดับเบิลคลิก / Enter / พิมพ์ = แก้ไข · Esc = ยกเลิก · ←↑↓→ เลื่อนเซลล์ · Ctrl+S = บันทึก</span>
        ${this.pendingBar()}
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
