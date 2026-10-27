// กรอกวันที่แบบเลือกปีได้ — พ.ศ. หรือ ค.ศ. (ตาราง Excel: editor 'date')
//
//   พิมพ์ วว/ดด/ปปปป (คั่นด้วย / - . หรือเว้นวรรค · พิมพ์ติดกัน 8 หลักก็ได้) · ปี 2 หลัก = ปีของยุคที่เลือก
//   ปีที่ชัดว่าเป็นอีกยุค (≥ 2400 = พ.ศ. · < 2200 = ค.ศ.) แปลงให้เองไม่ว่าจะเลือกยุคไหน — กรอกผิดยุคก็ไม่ผิดวัน
//   ยุคที่เลือกจำไว้ในเครื่อง (ใช้กับทุกตาราง) · ปุ่มปฏิทินเปิดปฏิทินของเบราว์เซอร์
import { cssRect } from '../shared/dom.js';
import { thaiDateLong } from '../shared/format.js';
import { icon } from '../shared/icons.js';

const ERA_KEY = 'hl-date-era';
const pad = (n) => String(n).padStart(2, '0');

/** @returns {'BE'|'CE'} */
export function dateEra() {
  try {
    return localStorage.getItem(ERA_KEY) === 'CE' ? 'CE' : 'BE';
  } catch {
    return 'BE';
  }
}
function setDateEra(era) {
  try {
    localStorage.setItem(ERA_KEY, era);
  } catch {
    /* เก็บไม่ได้ = ใช้ค่าเริ่มต้นครั้งหน้า */
  }
}

/** ISO → ข้อความในช่อง (วว/ดด/ปปปป ตามยุค) */
export function formatDateInput(iso, era) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${pad(d)}/${pad(m)}/${era === 'BE' ? y + 543 : y}`;
}

/**
 * ข้อความที่พิมพ์ → ISO · '' = ล้างค่า · null = อ่านไม่ได้ / ไม่มีวันนี้
 * @param {string} text
 * @param {'BE'|'CE'} era
 */
export function parseDateInput(text, era) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  let d, m, y;
  const digits = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  const parts = s.split(/[/.\-\s]+/);
  if (digits) [, d, m, y] = digits;
  else if (parts.length === 3 && parts[0].length === 4) [y, m, d] = parts; // ปปปป-ดด-วว
  else if (parts.length === 3) [d, m, y] = parts;
  else return null;
  if (![d, m, y].every((x) => /^\d+$/.test(x)) || y.length === 3) return null;
  let year = Number(y);
  if (y.length <= 2) year += era === 'BE' ? 2500 : 2000;
  if (year >= 2400) year -= 543;
  if (year < 1900 || year >= 2200) return null;
  const dt = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== Number(m) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${year}-${pad(Number(m))}-${pad(Number(d))}`;
}

/**
 * เปิดกล่องกรอกวันที่ใต้ anchor
 * @param {{anchor: HTMLElement, value: string, initial?: string, label?: string, onPick: (iso: string) => void, onClose?: (picked: boolean, move?: [number, number]) => void}} o
 *   onPick ได้ ISO หรือ '' (ล้างค่า) · onClose(picked, move) — move = [แถว, คอลัมน์] ที่ควรเลื่อนต่อ (Enter = ลง · Tab = ขวา)
 */
export function openDatePicker({ anchor, value, initial, label = 'วันที่', onPick, onClose }) {
  let era = dateEra();
  const pop = document.createElement('div');
  pop.className = 'popover date-pop';
  pop.innerHTML = `<div class="date-pop-row">
      <input type="text" class="input num" inputmode="numeric" autocomplete="off" aria-label="${label}">
      <button type="button" class="btn-icon sm" data-cal title="เลือกจากปฏิทิน" aria-label="เลือกจากปฏิทิน">${icon('calendar')}</button>
      <input type="date" class="date-pop-native" tabindex="-1" aria-hidden="true">
    </div>
    <div class="date-pop-foot">
      <div class="seg" role="group" aria-label="ปีที่กรอก">
        <button type="button" class="seg-btn" data-era="BE">พ.ศ.</button>
        <button type="button" class="seg-btn" data-era="CE">ค.ศ.</button>
      </div>
      <span class="date-pop-hint" aria-live="polite"></span>
    </div>`;
  document.body.append(pop);
  const input = pop.querySelector('input[type="text"]');
  const native = pop.querySelector('.date-pop-native');
  const hint = pop.querySelector('.date-pop-hint');
  let closed = false;

  const place = () => {
    const r = cssRect(anchor);
    const width = 248;
    pop.style.left = `${Math.max(8, Math.min(r.left, r.vw - width - 8))}px`;
    pop.style.width = `${width}px`;
    if (r.vh - r.bottom < 130 && r.top > r.vh - r.bottom) {
      pop.style.top = '';
      pop.style.bottom = `${r.vh - r.top + 4}px`;
    } else {
      pop.style.bottom = '';
      pop.style.top = `${r.bottom + 4}px`;
    }
  };
  const drawEra = () => {
    pop.querySelectorAll('[data-era]').forEach((b) => {
      b.classList.toggle('on', b.dataset.era === era);
      b.setAttribute('aria-pressed', String(b.dataset.era === era));
    });
    input.placeholder = era === 'BE' ? 'วว/ดด/2569' : 'วว/ดด/2026';
  };
  const check = () => {
    const iso = parseDateInput(input.value, era);
    input.classList.toggle('is-invalid', iso === null);
    hint.classList.toggle('bad', iso === null);
    hint.textContent = iso === null ? 'วันที่ไม่ถูกต้อง' : iso ? thaiDateLong(iso) : '';
    return iso;
  };

  const close = (picked, move) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('mousedown', onOutside, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', place);
    pop.remove();
    onClose?.(picked, move);
  };
  /** ใช้ค่าที่พิมพ์ — อ่านไม่ได้ = ไม่ปิด (ให้แก้ต่อ) */
  const commit = (move) => {
    const iso = check();
    if (iso === null) {
      input.focus();
      return;
    }
    if (iso !== (value || '')) onPick(iso);
    close(true, move);
  };
  const onOutside = (e) => {
    if (pop.contains(e.target) || anchor.contains(e.target)) return;
    // คลิกที่อื่น: ค่าถูกต้อง = ใช้ · ไม่ถูกต้อง = ทิ้ง (เหมือนช่องอื่นของตาราง)
    const iso = parseDateInput(input.value, era);
    if (iso !== null && iso !== (value || '')) onPick(iso);
    close(iso !== null);
  };
  const onScroll = (e) => {
    if (!pop.contains(e.target)) place();
  };

  input.addEventListener('input', check);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commit([1, 0]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commit([0, e.shiftKey ? -1 : 1]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(false);
    }
  });
  pop.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault(); // ปุ่มไม่แย่งโฟกัสจากช่องพิมพ์
  });
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-era]');
    if (b && b.dataset.era !== era) {
      // สลับยุค: ค่าที่อ่านได้แสดงใหม่ในยุคนั้น (วันเดิม)
      const iso = parseDateInput(input.value, era);
      era = b.dataset.era;
      setDateEra(era);
      if (iso) input.value = formatDateInput(iso, era);
      drawEra();
      check();
      input.focus();
    }
    if (e.target.closest('[data-cal]')) {
      native.value = parseDateInput(input.value, era) || value || '';
      try {
        native.showPicker();
      } catch {
        native.focus();
      }
    }
  });
  native.addEventListener('change', () => {
    if (!native.value) return;
    input.value = formatDateInput(native.value, era);
    check();
    input.focus();
  });

  input.value = initial ?? formatDateInput(value, era); // initial = ตัวอักษรแรกที่พิมพ์ในเซลล์
  drawEra();
  check();
  place();
  input.focus();
  if (initial === undefined) input.select();
  document.addEventListener('mousedown', onOutside, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', place);
  return { close: () => close(false) };
}
