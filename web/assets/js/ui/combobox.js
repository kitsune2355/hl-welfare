// Select ที่พิมพ์ค้นหาได้
//
// ทุก <select> ในระบบค้นหาได้อัตโนมัติ — autoEnhanceSelects() (เรียกใน app/shell.js) แปลงทุกตัวในหน้า และตัวที่เกิดใหม่ทีหลัง (popup / วาดใหม่)
//   ยกเว้น <select data-native> และ <select multiple> · select เดิมยังอยู่ (ซ่อน): อ่าน/ตั้ง .value, ฟัง change, เปลี่ยน option ด้วย JS ได้ตามปกติ
//   (ตั้ง .value / .selectedIndex / แก้ option / disabled → หน้าตาอัปเดตเอง ไม่ต้องเรียก refreshCombobox)
//
// วิธีใช้แบบ HTML ล้วน:
//   <select name="company" data-combobox data-placeholder="ทุกบริษัท">
//     <option value="">ทุกบริษัท</option>      ← มี option ค่าว่าง = ล้างค่าได้ (ปุ่ม ×)
//     <option value="HL">HL</option>
//   </select>
//   แล้วเรียก enhanceSelects() — select เดิมยังอยู่ (ซ่อนไว้) อ่านค่า/ฟัง 'change' ได้ตามปกติ
//   data-creatable = พิมพ์ค่าใหม่ที่ไม่มีในรายการได้ · data-size="sm" = ขนาดเล็ก · <option disabled> = ไม่แสดง
//
// select.refreshCombobox() ยังเรียกได้ (ไม่จำเป็นแล้ว)
import { cssRect, esc, html, raw } from '../shared/dom.js';
import { icon } from '../shared/icons.js';

const norm = (s) => String(s).toLowerCase().normalize('NFC');

/**
 * เปิดรายการตัวเลือกใต้ anchor (ใช้ร่วมกันโดย combobox และตาราง Excel)
 * @param {{anchor: HTMLElement, options: {value:string,label:string,hint?:string}[], value: string,
 *   creatable?: boolean, initialQuery?: string, onPick: (value: string) => void, onClose?: (picked: boolean) => void}} o
 */
export function openPicker({ anchor, options, value, creatable = false, initialQuery = '', onPick, onClose }) {
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.innerHTML = `<div class="popover-search">${icon('search')}<input type="text" placeholder="พิมพ์เพื่อค้นหา…" aria-label="ค้นหาตัวเลือก" autocomplete="off"></div><ul class="options" role="listbox"></ul>`;
  document.body.append(pop);
  const input = pop.querySelector('input');
  const list = pop.querySelector('ul');
  let items = [];
  let active = 0;
  let closed = false;

  const place = () => {
    const r = cssRect(anchor); // หน่วย CSS px (รองรับขนาดตัวอักษรของระบบ)
    const width = Math.max(r.width, 220);
    const left = Math.max(8, Math.min(r.left, r.vw - width - 8));
    const below = r.vh - r.bottom;
    pop.style.left = `${left}px`;
    pop.style.width = `${width}px`;
    if (below < 300 && r.top > below) {
      pop.style.top = '';
      pop.style.bottom = `${r.vh - r.top + 4}px`;
    } else {
      pop.style.bottom = '';
      pop.style.top = `${r.bottom + 4}px`;
    }
  };

  const draw = () => {
    const q = norm(input.value.trim());
    const filtered = q ? options.filter((o) => norm(`${o.label} ${o.hint ?? ''} ${o.value}`).includes(q)) : options;
    const canCreate = creatable && q && !options.some((o) => norm(o.label) === q);
    items = canCreate ? [{ value: input.value.trim(), label: `ใช้ “${input.value.trim()}”`, create: true }, ...filtered] : filtered;
    active = Math.min(active, Math.max(0, items.length - 1));
    list.innerHTML = items.length
      ? items
          .map(
            (o, i) =>
              `<li class="option${i === active ? ' active' : ''}${o.create ? ' create' : ''}" role="option" data-i="${i}" aria-selected="${o.value === value && !o.create}">
                <span class="opt-text"><span class="truncate" style="display:block">${esc(o.label)}</span>${o.hint ? `<span class="opt-hint truncate">${esc(o.hint)}</span>` : ''}</span>
                ${o.value === value && !o.create ? icon('check') : ''}
              </li>`,
          )
          .join('')
      : '<li class="empty">ไม่พบตัวเลือก</li>';
    list.querySelector('.active')?.scrollIntoView?.({ block: 'nearest' });
  };

  const close = (picked) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('mousedown', onOutside, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', place);
    pop.remove();
    onClose?.(picked);
  };
  const pick = (o) => {
    onPick(o.value);
    close(true);
  };
  const onOutside = (e) => {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) close(false);
  };
  const onScroll = (e) => {
    if (!pop.contains(e.target)) place();
  };

  input.addEventListener('input', () => {
    active = 0;
    draw();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(items.length - 1, active + 1);
      draw();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
      draw();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[active]) pick(items[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(false);
    } else if (e.key === 'Tab') {
      if (items[active] && input.value) pick(items[active]);
      else close(false);
    }
  });
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) pick(items[Number(li.dataset.i)]);
  });
  list.addEventListener('mousemove', (e) => {
    const li = e.target.closest('[data-i]');
    if (li && Number(li.dataset.i) !== active) {
      active = Number(li.dataset.i);
      draw();
    }
  });

  const idx = options.findIndex((o) => o.value === value);
  active = initialQuery ? 0 : Math.max(0, idx);
  input.value = initialQuery;
  place();
  draw();
  input.focus();
  document.addEventListener('mousedown', onOutside, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', place);
  return { close: () => close(false) };
}

/**
 * สร้าง combobox ใน container
 * @param {HTMLElement} container
 * @param {{options: {value:string,label:string,hint?:string}[], value?: string, placeholder?: string, clearable?: boolean,
 *   creatable?: boolean, size?: 'sm'|'md', ariaLabel?: string, disabled?: boolean, onChange: (v: string) => void}} o
 */
export function createCombobox(container, o) {
  let value = o.value ?? '';
  let options = o.options;
  container.classList.add('combo');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `combo-btn${o.size === 'sm' ? ' sm' : ''}`;
  btn.setAttribute('role', 'combobox');
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if (o.ariaLabel) btn.setAttribute('aria-label', o.ariaLabel);
  if (o.id) btn.id = o.id;
  container.append(btn);
  let picker = null;

  const draw = () => {
    const sel = options.find((x) => x.value === value);
    const text = sel?.label ?? (value || o.placeholder || 'เลือก…');
    btn.innerHTML = String(
      html`<span class="value ${!sel && !value ? 'placeholder' : ''}">${text}</span>${o.clearable && value && !btn.disabled
        ? html`<span class="combo-clear" role="button" aria-label="ล้างค่า" data-clear>${raw(icon('x'))}</span>`
        : ''}${raw(icon('chevron-down'))}`,
    );
  };

  const set = (v, fire = true) => {
    value = v;
    draw();
    if (fire) o.onChange(v);
  };

  const open = (initialQuery = '') => {
    if (btn.disabled || picker) return;
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    picker = openPicker({
      anchor: btn,
      options,
      value,
      creatable: o.creatable,
      initialQuery,
      onPick: (v) => set(v),
      onClose: () => {
        picker = null;
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
      },
    });
  };

  btn.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) {
      e.stopPropagation();
      set('');
      return;
    }
    if (picker) picker.close();
    else open();
  });
  btn.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'Enter', ' ', 'F2'].includes(e.key)) {
      e.preventDefault();
      open();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      open(e.key);
    }
  });

  btn.disabled = !!o.disabled;
  draw();
  return {
    el: btn,
    get value() {
      return value;
    },
    setValue: (v) => set(v, false),
    setOptions(next) {
      options = next;
      draw();
    },
    setDisabled(d) {
      btn.disabled = d;
      draw();
    },
    setInvalid(bad) {
      if (bad) btn.setAttribute('aria-invalid', 'true');
      else btn.removeAttribute('aria-invalid');
    },
  };
}

/** select ที่ยังไม่ได้แปลง (ยกเว้น data-native / multiple) */
const TODO = 'select:not([data-enhanced]):not([data-native]):not([multiple])';

/** แปลงทุก <select> ใน root (รวม root เอง) เป็น combobox ที่ค้นหาได้ */
export function enhanceSelects(root = document) {
  if (root.matches?.(TODO)) enhanceSelect(root);
  root.querySelectorAll?.(TODO).forEach(enhanceSelect);
}

let watcher = null;
/** แปลงทุก select ในหน้า + ตัวที่เพิ่มเข้ามาทีหลัง (popup, ตารางวาดใหม่) — เรียกครั้งเดียวต่อหน้า */
export function autoEnhanceSelects() {
  enhanceSelects(document);
  if (watcher || typeof MutationObserver === 'undefined') return;
  watcher = new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) enhanceSelects(n);
  });
  watcher.observe(document.body, { childList: true, subtree: true });
}

const SELECT_PROTO = typeof HTMLSelectElement === 'undefined' ? null : HTMLSelectElement.prototype; // ไม่มีใน Node (เทสต์)
const SELECT_VALUE = SELECT_PROTO && Object.getOwnPropertyDescriptor(SELECT_PROTO, 'value');
const SELECT_INDEX = SELECT_PROTO && Object.getOwnPropertyDescriptor(SELECT_PROTO, 'selectedIndex');

/** @param {HTMLSelectElement} select */
export function enhanceSelect(select) {
  select.dataset.enhanced = '1';
  // option ที่ disabled จะไม่แสดงในรายการ
  const readOptions = () => [...select.options].filter((op) => op.value !== '' && !op.disabled).map((op) => ({ value: op.value, label: op.textContent.trim(), hint: op.dataset.hint }));
  const blankOf = () => [...select.options].find((op) => op.value === '');
  const placeholderOf = () => select.dataset.placeholder ?? blankOf()?.textContent.trim() ?? 'เลือก…';
  const wrap = document.createElement('div');
  // คลาสของ select ไปที่ตัวครอบ (ยกเว้น input — ปุ่ม combobox มีกรอบของตัวเองแล้ว) · ความกว้างที่ตั้งไว้ตามไปด้วย
  wrap.className = [...select.classList].filter((k) => k !== 'input' && k !== 'hidden').join(' ');
  wrap.style.cssText = select.style.cssText;
  if (select.style.width === 'auto') wrap.style.minWidth = '170px'; // ช่องกรองที่กว้างตามเนื้อหา — ปุ่มไม่มีเนื้อหาให้วัด
  select.classList.add('hidden');
  select.after(wrap);
  const label = select.id ? document.querySelector(`label[for="${select.id}"]`) : null;
  // option มักเติมทีหลัง (วาดใหม่ / โหลดจาก API) → ข้อความว่าง + ปุ่มล้าง คำนวณใหม่ทุกครั้งที่ refresh
  const cfg = {
    options: readOptions(),
    value: select.value,
    placeholder: placeholderOf(),
    clearable: !!blankOf(),
    creatable: select.hasAttribute('data-creatable'),
    size: select.dataset.size === 'sm' ? 'sm' : 'md',
    ariaLabel: select.getAttribute('aria-label') ?? label?.textContent.trim(),
    disabled: select.disabled,
    onChange: (v) => {
      if (v && ![...select.options].some((op) => op.value === v)) select.add(new Option(v, v)); // ค่าที่พิมพ์ใหม่
      select.value = v;
      // เหมือน select ปกติ: input แล้วตามด้วย change (บางหน้าฟัง input ของฟอร์ม เช่น ตัวกรองบันทึกการใช้งาน)
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };
  const combo = createCombobox(wrap, cfg);
  if (select.id) {
    combo.el.id = `${select.id}__combo`;
    label?.setAttribute('for', combo.el.id);
  }
  /** เรียกหลังเปลี่ยน option/ค่า/disabled ของ select ด้วย JS */
  select.refreshCombobox = () => {
    cfg.placeholder = placeholderOf();
    cfg.clearable = !!blankOf();
    combo.setOptions(readOptions());
    combo.setValue(select.value);
    combo.setDisabled(select.disabled);
    combo.setInvalid(select.getAttribute('aria-invalid') === 'true');
  };
  // โค้ดเดิมเปลี่ยน select ตรง ๆ (ตั้งค่า / เปลี่ยน option / disabled) → หน้าตาตาม (รวบเป็นครั้งเดียวต่อรอบ)
  let queued = false;
  const sync = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      select.refreshCombobox();
    });
  };
  Object.defineProperty(select, 'value', { configurable: true, get: () => SELECT_VALUE.get.call(select), set: (v) => (SELECT_VALUE.set.call(select, v), sync()) });
  Object.defineProperty(select, 'selectedIndex', { configurable: true, get: () => SELECT_INDEX.get.call(select), set: (v) => (SELECT_INDEX.set.call(select, v), sync()) });
  select.form?.addEventListener('reset', () => setTimeout(sync)); // form.reset() คืนค่าเดิมโดยไม่มีเหตุการณ์
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'aria-invalid'] });
  return combo;
}
