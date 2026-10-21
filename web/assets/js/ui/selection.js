// เลือกหลายแถวในตาราง (checkbox ช่องหน้าสุด) + แถบทำรายการกับแถวที่เลือก — ใช้ร่วมกันทั้ง DataTable และ ExcelGrid
//
//   ช่องหน้าสุดของทุกแถว = checkbox (คู่กับเลขแถว) · หัวตาราง = เลือก/เลิกเลือกทั้งหน้า · Shift + คลิก = เลือกเป็นช่วง
//   เลือกแล้วแถบด้านบนตารางขึ้น: "เลือก N รายการ" + ปุ่มทำรายการของหน้านั้น + ส่งออก Excel เฉพาะที่เลือก + ล้างที่เลือก
//
//   bulkActions: [{
//     id, label, icon?, tone?: 'danger',
//     when?: (row) => boolean,          // แถวที่ทำรายการนี้ได้ (ไม่ใส่ = ทุกแถว) — ปุ่มบอกจำนวนที่ทำได้เมื่อไม่ครบ
//     confirm?: (rows) => ({ title, description?, confirmLabel? }),   // ถามก่อนทำ (ไม่ใส่ = ทำทันที)
//     run: async (rows) => string|void, // คืนข้อความ = แสดงเป็น toast สำเร็จ
//   }]
import { html, raw } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { busy } from './loading.js';
import { confirmAction, errorMessage, toast } from './overlay.js';

export class Selection {
  keys = new Set();
  last = null; // key ที่คลิกล่าสุด (Shift + คลิก = ช่วง)

  get size() {
    return this.keys.size;
  }
  has(key) {
    return this.keys.has(String(key));
  }
  clear() {
    this.keys.clear();
    this.last = null;
  }
  /** คลิก checkbox ของแถว · shift = เลือกตั้งแต่แถวที่คลิกล่าสุดถึงแถวนี้ (ตามลำดับที่เห็น) */
  toggle(key, on, { shift = false, order = [] } = {}) {
    const k = String(key);
    const a = order.indexOf(this.last);
    const b = order.indexOf(k);
    if (shift && a >= 0 && b >= 0) {
      for (const x of order.slice(Math.min(a, b), Math.max(a, b) + 1)) on ? this.keys.add(x) : this.keys.delete(x);
    } else on ? this.keys.add(k) : this.keys.delete(k);
    this.last = k;
  }
  setMany(keys, on) {
    for (const k of keys) on ? this.keys.add(String(k)) : this.keys.delete(String(k));
  }
  /** ตัดแถวที่ไม่มีแล้ว (ข้อมูลโหลดใหม่ / ลบไปแล้ว) */
  prune(validKeys) {
    const ok = new Set(validKeys.map(String));
    for (const k of [...this.keys]) if (!ok.has(k)) this.keys.delete(k);
  }
  /** สถานะ checkbox หัวตารางของแถวชุดนี้: none | some | all */
  stateOf(keys) {
    const n = keys.filter((k) => this.keys.has(String(k))).length;
    return n === 0 ? 'none' : n === keys.length ? 'all' : 'some';
  }
}

/** checkbox ของแถว */
export const rowCheck = (key, on, label = '') =>
  html`<input type="checkbox" class="row-check" data-row-check="${key}" ${on ? raw('checked') : ''} aria-label="เลือก${label ? ` ${label}` : 'แถวนี้'}" />`;

/** checkbox หัวตาราง (เลือกทั้งหน้า) — some = ขีดกลาง (ตั้ง indeterminate หลังวาด: applyIndeterminate) */
export const allCheck = (state, disabled = false) =>
  html`<input type="checkbox" class="row-check" data-row-check-all ${state === 'all' ? raw('checked') : ''} data-some="${state === 'some' ? '1' : '0'}" ${disabled ? raw('disabled') : ''} aria-label="เลือกทั้งหน้า" title="เลือกทั้งหน้า" />`;

export function applyIndeterminate(root) {
  root.querySelectorAll('[data-row-check-all][data-some="1"]').forEach((c) => (c.indeterminate = true));
}

/**
 * แถบด้านบนตารางเมื่อเลือกแถวไว้
 * @param {{rows: any[], actions: object[], totalMatching?: number, pageAll?: boolean, exportable?: boolean}} o
 *   pageAll + totalMatching > rows.length → ลิงก์ "เลือกทั้งหมด N รายการตามตัวกรอง"
 */
export function bulkBar({ rows, actions, totalMatching = 0, pageAll = false, exportable = true }) {
  if (!rows.length) return '';
  return html`<div class="bulk-bar" role="region" aria-label="ทำรายการกับแถวที่เลือก">
    <span class="bulk-count">${raw(icon('check-check'))} เลือก <b class="num">${rows.length.toLocaleString('th-TH')}</b> รายการ</span>
    ${pageAll && totalMatching > rows.length
      ? html`<button type="button" class="btn btn-ghost btn-sm" data-bulk-all>เลือกทั้งหมด ${totalMatching.toLocaleString('th-TH')} รายการตามตัวกรอง</button>`
      : ''}
    <span class="bulk-actions">
      ${actions.map((a) => {
        const n = a.when ? rows.filter(a.when).length : rows.length;
        return html`<button type="button" class="btn btn-sm ${a.tone === 'danger' ? 'btn-danger-soft' : ''}" data-bulk="${a.id}" ${n ? '' : raw('disabled')}
          title="${n === rows.length ? a.label : `${a.label} — ทำได้ ${n} จาก ${rows.length} รายการ`}"
          >${a.icon ? raw(icon(a.icon)) : ''} ${a.label}${n !== rows.length ? html` <span class="num muted">(${n})</span>` : ''}</button>`;
      })}
      ${exportable ? html`<button type="button" class="btn btn-sm" data-bulk-export title="ส่งออก Excel เฉพาะแถวที่เลือก">${raw(icon('file-spreadsheet'))} Excel ที่เลือก</button>` : ''}
    </span>
    <button type="button" class="btn btn-ghost btn-sm bulk-clear" data-bulk-clear title="ล้างที่เลือก (Esc)">${raw(icon('x'))} ล้าง</button>
  </div>`;
}

/** ทำรายการกับแถวที่เลือก (เฉพาะแถวที่ทำได้) — button = ปุ่มที่กด (แสดงกำลังทำ) · คืน true เมื่อทำแล้ว */
export async function runBulk(action, rows, button = null) {
  const eligible = action.when ? rows.filter(action.when) : rows;
  if (!eligible.length) return false;
  const work = async () => {
    const msg = await action.run(eligible);
    if (msg) toast.success(msg);
  };
  if (action.confirm) {
    const c = action.confirm(eligible);
    return confirmAction({ title: c.title, description: c.description ?? '', body: c.body ?? '', confirmLabel: c.confirmLabel ?? action.label, danger: action.tone === 'danger', action: work });
  }
  try {
    await busy(button, work, { label: action.label });
    return true;
  } catch (e) {
    toast.error(errorMessage(e));
    return false;
  }
}
