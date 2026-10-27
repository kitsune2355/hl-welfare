// ชิ้นส่วนที่หลายหน้าใช้ร่วมกัน (ส่งเบิกชุดฟอร์ม, ไทม์ไลน์กิจกรรม)
import { api } from '../app/api.js';
import { can } from '../app/auth.js';
import { refreshCounts } from '../app/shell.js';
import { CONFIG } from '../config.js';
import { html, on, raw, render } from '../shared/dom.js';
import { timeAgo } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { ACTIVITY_ENTITY_LABEL, UNIFORM_EVENT_LABEL, UNIFORM_ITEM_LABEL } from '../shared/labels.js';
import { enhanceSelects } from '../ui/combobox.js';
import { alertBox, badge, emptyState, errorState } from '../ui/components.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';
import { loader } from '../ui/loading.js';

// ===================== แจกชุดฟอร์ม: ส่งเบิกคลังเสมอ (ไม่มีบันทึกแจกเองแล้ว — ต้องผ่านคลัง ตัดสต็อกจริง) =====================

/**
 * ปุ่มของสิทธิ์ที่ค้างแจก — ต้องเรียก wireIssueActions(root, ...) หนึ่งครั้งต่อ container
 * ส่งเบิกคลัง = ออกใบเบิกในระบบสต็อก Uniform ให้คลังจ่าย (ตัดสต็อกจริง)
 */
export function issueAction({ employeeId, entitlementKey, event, qty, name = '', itemQty = null }) {
  if (!can('stock.request')) return html`<span class="small muted">รอแจก</span>`;
  return html`<div class="row" data-issue data-emp="${employeeId}" data-key="${entitlementKey}" data-event="${event}" data-qty="${qty}" data-name="${name}" data-items="${itemQty ? JSON.stringify(itemQty) : ''}" style="justify-content:flex-end;gap:6px">
    <button class="btn btn-primary btn-sm" data-stock-request>${raw(icon('send'))} ส่งเบิกคลัง</button>
  </div>`;
}

/** ยกเลิกการแจก/ส่งเบิกได้ไหม (สิทธิ์ uniform.issue · ใบในสต็อกต้องมี stock.request ด้วย) */
export const canCancelIssue = (isStock) => can('uniform.issue') && (!isStock || can('stock.request'));

export function wireIssueActions(root, { today, onDone }) {
  const ctx = (btn) => {
    const d = btn.closest('[data-issue]').dataset;
    return { employeeId: Number(d.emp), entitlementKey: d.key, event: d.event, qty: Number(d.qty), name: d.name, itemQty: d.items ? JSON.parse(d.items) : null, today, onDone };
  };
  on(root, 'click', '[data-stock-request]', (_e, btn) => openStockRequest(ctx(btn)));
}

/**
 * ทำทีละคนต่อเนื่องกับแถวที่เลือก (ตารางค้างแจก): เปิดกล่องส่งเบิกของคนถัดไปเมื่อปิดกล่องก่อนหน้า
 * กดยกเลิก (ปิดโดยไม่บันทึก) = หยุดทั้งชุด · คืนจำนวนที่ทำสำเร็จ
 * @param {{employeeId:number, entitlementKey:string, event:string, qty:number, name:string, itemQty?:Object<string, number>}[]} items
 */
export async function issueSequence(items, { today, onDone }) {
  let done = 0;
  for (const [i, it] of items.entries()) {
    let saved = false;
    await new Promise((resolve) => {
      const ctx = { ...it, today, step: `${i + 1}/${items.length}`, onDone: () => ((saved = true), done++), onClose: resolve };
      openStockRequest(ctx);
    });
    if (!saved) break;
  }
  if (done) onDone();
  return done;
}

/** เรียกหลัง render ตารางที่มี issueAction (ปุ่มไม่มี select แล้ว คงไว้ให้หน้าที่เรียกอยู่) */
export const enhanceIssueActions = (root) => enhanceSelects(root);

const roundLabel = (event, key) => `${UNIFORM_EVENT_LABEL[event]}${event === 'ANNUAL' ? ` ${Number(key.slice(7)) + 543}` : ''}`;

/** ลิงก์ใบเบิกในระบบสต็อก Uniform */
export const stockDocLink = (stock) =>
  html`<a class="num" href="${CONFIG.stock.docUrl}${stock.docId}" target="_blank" rel="noopener" title="เปิดใบเบิกในระบบสต็อก">${stock.docNo} ${raw(icon('external-link'))}</a>`;

/** ป้ายสถานะใบเบิกในคลัง */
export const STOCK_STAGE = {
  WAITING: { label: 'รอผู้อนุมัติ', tone: 'warning' },
  REQUESTED: { label: 'รอคลังจ่าย', tone: 'warning' },
  ISSUED: { label: 'คลังจ่ายแล้ว', tone: 'info' },
  RECEIVED: { label: 'เซ็นรับแล้ว', tone: 'success' },
};

/**
 * ส่งเบิกคลัง — เลือกแบบ (ชาย/หญิง) แล้วแบ่งจำนวนเป็นไซซ์ของแต่ละรายการ จากสินค้าในระบบสต็อก
 * 1 รายการแบ่งได้หลายไซซ์ (เสื้อ 2 ตัว = M 1 + L 1) — ส่งเป็นหลายบรรทัดของรายการเดียวกัน (ไซซ์ = สินค้าคนละตัวในสต็อก)
 */
async function openStockRequest({ employeeId, entitlementKey, event, name, onDone, onClose, step = '' }) {
  const m = openModal({
    onClose,
    size: 'md',
    title: `ส่งเบิกชุดฟอร์มไปคลัง${step ? ` (${step})` : ''}`,
    description: `${name ? `${name} · ` : ''}${roundLabel(event, entitlementKey)}`,
    body: html`<div data-stock-body>${loader({ text: 'กำลังโหลดรายการจากระบบสต็อก' })}</div>`,
    footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" data-ok data-label="ส่งเบิกคลัง" disabled>ส่งเบิกคลัง</button>`,
  });
  const body = m.el.querySelector('[data-stock-body]');
  const ok = m.el.querySelector('[data-ok]');
  let opt;
  try {
    opt = await api.getUniformStockOptions(employeeId, entitlementKey);
  } catch (err) {
    render(body, errorState(err));
    return;
  }
  // สิ่งที่ผู้ใช้เลือก ต่อรายการ — index ของแบบ + แถวไซซ์ (สินค้า + จำนวน)
  const picks = opt.items.map((it) => ({ variant: it.variantIndex, rows: [{ productId: 0, qty: it.qty }] }));
  const unitOf = (it) => (it.itemCode === 'SAFETY_SHOES' ? 'คู่' : 'ตัว');
  const total = (p) => p.rows.reduce((s, r) => s + (Number.isInteger(r.qty) && r.qty > 0 ? r.qty : 0), 0);
  const productsOf = (i) => opt.items[i].variants[picks[i].variant]?.products ?? [];

  // แถวไซซ์: ไซซ์ · จำนวน · หน่วย · ✕ (ไม่มีป้ายซ้ำทุกแถว — หัวคอลัมน์อยู่บนแถวแรก)
  const sizeRow = (i, r, ri, rowCount, unit) => {
    const chosen = productsOf(i).find((x) => x.productId === r.productId);
    const short = chosen && chosen.onHand < r.qty;
    return html`<div class="size-row" data-row="${ri}">
      <select class="input" data-product aria-label="ไซซ์${rowCount > 1 ? ` แถวที่ ${ri + 1}` : ''}">
        <option value="">เลือกไซซ์</option>
        ${productsOf(i).map((x) => html`<option value="${x.productId}" ${x.productId === r.productId ? raw('selected') : ''}>${x.size} · คงเหลือ ${x.onHand}</option>`)}
      </select>
      <input class="input num" type="number" min="1" step="1" data-qty value="${r.qty}" aria-label="จำนวน" />
      <span class="size-unit muted">${unit}</span>
      ${rowCount > 1
        ? html`<button type="button" class="btn-icon sm" data-remove-row title="เอาไซซ์นี้ออก" aria-label="เอาไซซ์นี้ออก">${raw(icon('x'))}</button>`
        : html`<span></span>`}
      ${short ? html`<span class="size-short error">สต็อกไม่พอ (มี ${chosen.onHand}) — ส่งเบิกได้ คลังจ่ายเมื่อมีของ</span>` : ''}
    </div>`;
  };
  // 1 รายการ = การ์ดเล็ก: หัว (ชื่อ · แบบ · รวม/สิทธิ์) + แถวไซซ์ + เพิ่มไซซ์ (เฉพาะรายการที่มี 2 ชิ้นขึ้นไป)
  const lineHtml = (it, i) => {
    const p = picks[i];
    const sum = total(p);
    const unit = unitOf(it);
    const splittable = it.qty > 1 || p.rows.length > 1;
    return html`<section class="stock-line" data-line="${i}">
      <div class="stock-line-head">
        <b>${UNIFORM_ITEM_LABEL[it.itemCode] ?? it.itemCode}</b>
        ${it.variants.length > 1
          ? html`<select class="input stock-variant" data-variant aria-label="แบบ">
              ${it.variants.map((v, vi) => html`<option value="${vi}" ${vi === p.variant ? raw('selected') : ''}>${v.label}</option>`)}
            </select>`
          : it.variants[0]?.name && it.variants[0].name !== (UNIFORM_ITEM_LABEL[it.itemCode] ?? it.itemCode)
            ? html`<span class="muted small truncate">${it.variants[0].name}</span>`
            : ''}
        <span class="stock-line-total">${badge(`${sum} / ${it.qty} ${unit}`, sum === it.qty ? 'success' : 'warning', { dot: false })}</span>
      </div>
      ${p.rows.map((r, ri) => sizeRow(i, r, ri, p.rows.length, unit))}
      ${splittable ? html`<button type="button" class="link-btn" data-add-row>${raw(icon('plus'))} เพิ่มไซซ์</button>` : ''}
    </section>`;
  };
  const draw = () => {
    const d = opt.department;
    const newStaff = opt.docKind === 'new_staff';
    render(
      body,
      html`${opt.blockers.length
          ? alertBox({ tone: 'danger', title: 'ยังส่งเบิกไม่ได้', body: html`${opt.blockers.join(' · ')} — แจ้งผู้ดูแลระบบสต็อกให้จับคู่ก่อน` })
          : html`<p class="stock-route">
              ${raw(icon('send'))}
              <span>${newStaff ? html`<strong>ใบเบิกพนักงานใหม่</strong> ` : 'ใบเบิก'}ลง <strong>${d.name}</strong>${d.company ? html` <span class="muted">(${d.company})</span>` : ''} → ผู้อนุมัติของหน่วยงานในระบบสต็อก → คลังจ่าย · ไม่อนุมัติ = กลับเป็นค้างแจก</span>
            </p>`}
        <p class="stock-style small muted">${opt.style} · สิทธิ์ ${opt.qtyLabel} ตัว</p>
        <div class="stock-lines">${opt.items.map(lineHtml)}</div>
        ${newStaff && opt.kit.length
          ? html`<div class="stock-kit small">
              <b>ชุดของพนักงานใหม่</b> <span class="muted">(ระบบสต็อกใส่ให้ในใบเดียวกัน)</span>
              <ul>${opt.kit.map((k) => html`<li>${k.name} × ${k.qty}${k.mustReturn ? ' · ต้องคืนเมื่อพ้นสภาพ' : ''}</li>`)}</ul>
            </div>`
          : ''}`,
    );
    ok.disabled = opt.blockers.length > 0 || picks.some((p) => p.rows.some((r) => !r.productId || !(Number.isInteger(r.qty) && r.qty > 0)));
  };
  draw();

  const at = (e) => {
    const line = e.target.closest('[data-line]');
    if (!line) return null;
    const p = picks[Number(line.dataset.line)];
    const row = e.target.closest('[data-row]');
    return { p, ri: row ? Number(row.dataset.row) : -1 };
  };
  body.addEventListener('change', (e) => {
    const c = at(e);
    if (!c) return;
    if (e.target.matches('[data-variant]')) {
      c.p.variant = Number(e.target.value);
      for (const r of c.p.rows) r.productId = 0; // ไซซ์เป็นสินค้าของแต่ละแบบ เปลี่ยนแบบแล้วต้องเลือกใหม่
    } else if (e.target.matches('[data-product]')) c.p.rows[c.ri].productId = Number(e.target.value);
    else if (e.target.matches('[data-qty]')) c.p.rows[c.ri].qty = Number(e.target.value);
    draw();
  });
  body.addEventListener('click', (e) => {
    const c = at(e);
    if (!c) return;
    if (e.target.closest('[data-add-row]')) {
      // แบ่ง 1 ชิ้นจากแถวท้ายสุดที่มีมากกว่า 1 → รวมยังเท่าสิทธิ์ เลือกแค่ไซซ์ของแถวใหม่
      const from = [...c.p.rows].reverse().find((r) => r.qty > 1);
      if (from) from.qty--;
      c.p.rows.push({ productId: 0, qty: 1 });
    } else if (e.target.closest('[data-remove-row]')) {
      const [gone] = c.p.rows.splice(c.ri, 1);
      // คืนจำนวนให้แถวก่อนหน้า (แถวแรกถูกเอาออก = ให้แถวถัดไป) → รวมไม่หาย
      const to = c.p.rows[Math.max(0, c.ri - 1)];
      if (Number.isInteger(gone.qty) && gone.qty > 0) to.qty = (Number.isInteger(to.qty) && to.qty > 0 ? to.qty : 0) + gone.qty;
    } else return;
    draw();
  });

  ok.onclick = async () => {
    m.busy(true, ok);
    try {
      // 1 บรรทัดต่อ (รายการ, ไซซ์) — เลือกไซซ์เดียวกันซ้ำ = รวมจำนวน
      const lines = [];
      opt.items.forEach((it, i) => {
        for (const r of picks[i].rows) {
          const same = lines.find((l) => l.itemCode === it.itemCode && l.productId === r.productId);
          if (same) same.qty += r.qty;
          else lines.push({ itemCode: it.itemCode, productId: r.productId, qty: r.qty });
        }
      });
      const issue = await api.requestUniformFromStock({ employeeId, entitlementKey, lines });
      toast.success(`ส่งเบิกแล้ว ใบ ${issue.stock.docNo} — ${STOCK_STAGE[issue.stock.stage]?.label ?? 'รอผู้อนุมัติ'}`);
      m.busy(false, ok);
      m.close();
      refreshCounts();
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
      m.busy(false, ok);
    }
  };
}

/**
 * ดึงสถานะใบเบิกจากระบบสต็อกก่อนแสดงผล — ระบบสต็อกล่มต้องไม่ทำให้หน้าเปิดไม่ได้
 * คืนข้อความเตือน หรือ '' ถ้าสำเร็จ
 */
export async function syncStockQuietly() {
  try {
    const { changed } = await api.syncUniformStock();
    if (changed) {
      refreshCounts();
      window.dispatchEvent(new Event('hl:notifications-refresh')); // สถานะเปลี่ยน = อาจมีแจ้งเตือนใหม่
    }
    return '';
  } catch (err) {
    return `ดึงสถานะจากระบบสต็อกไม่ได้ (${errorMessage(err)}) — แสดงสถานะล่าสุดที่บันทึกไว้`;
  }
}

// ===================== ไทม์ไลน์บันทึกกิจกรรม =====================

/** action ของ audit_log — ตัวที่ไม่รู้จัก (backend เพิ่มใหม่) ใช้ OTHER_ACTION */
export const ACTIVITY_ACTION = {
  CREATE: { icon: 'plus', tone: 'success', label: 'สร้าง' },
  UPDATE: { icon: 'pencil', tone: 'info', label: 'แก้ไข' },
  DELETE: { icon: 'trash-2', tone: 'danger', label: 'ลบ' },
  CANCEL: { icon: 'ban', tone: 'warning', label: 'ยกเลิก' },
  LOGIN: { icon: 'log-in', tone: 'neutral', label: 'เข้าสู่ระบบ' },
  LOGOUT: { icon: 'log-out', tone: 'neutral', label: 'ออกจากระบบ' },
  PASSWORD_CHANGE: { icon: 'lock', tone: 'info', label: 'เปลี่ยนรหัสผ่าน' },
  PASSWORD_RESET: { icon: 'lock', tone: 'warning', label: 'ตั้งรหัสผ่านใหม่' },
  TOKEN_REUSE: { icon: 'shield-alert', tone: 'danger', label: 'ใช้โทเคนซ้ำ' },
  SIGNOUT_ALL: { icon: 'user-x', tone: 'warning', label: 'ออกทุกอุปกรณ์' },
  SESSION_REVOKE: { icon: 'user-minus', tone: 'warning', label: 'จบ session' },
  DEVICE_REVOKE: { icon: 'user-minus', tone: 'warning', label: 'เลิกจดจำอุปกรณ์' },
  UNLOCK: { icon: 'shield-check', tone: 'info', label: 'ปลดล็อก' },
  CLEANUP: { icon: 'trash-2', tone: 'neutral', label: 'ล้างข้อมูลเก่า' },
  SETTINGS: { icon: 'pencil', tone: 'info', label: 'ตั้งค่าระบบ' },
  TRANSFER: { icon: 'arrow-left-right', tone: 'info', label: 'โอนย้าย' },
};
const OTHER_ACTION = { icon: 'activity', tone: 'neutral', label: '' };
export const activityAction = (code) => ACTIVITY_ACTION[code] ?? { ...OTHER_ACTION, label: code };
export const ENTITY_ICON = {
  EMPLOYEE: 'user',
  SITE: 'building-2',
  INSURANCE_BATCH: 'shield-plus',
  INSURER_FORM: 'file-spreadsheet',
  DEPT_GROUP: 'users',
  COMPANY: 'building-2',
  EMPLOYEE_TYPE: 'users',
  UNIFORM_ISSUE: 'shirt',
  STOCK_REQUEST: 'package-check',
  WELFARE: 'gift',
  WELFARE_PROGRAM: 'gift',
  USER: 'users',
  SYSTEM: 'activity',
};

export function activityFeed(items, { linkEmployee = true } = {}) {
  if (!items.length) return emptyState({ title: 'ยังไม่มีกิจกรรม', description: 'การเพิ่ม/แก้ไข/ลบข้อมูลทุกครั้งจะแสดงที่นี่' });
  return html`<ol class="feed">
    ${items.map((a) => {
      const act = activityAction(a.action);
      return html`<li>
        <span class="dot tone-${act.tone}" title="${act.label}">${raw(icon(act.icon))}</span>
        <div class="body">
          <p>${linkEmployee && a.employeeId ? html`<a href="employee.html?id=${a.employeeId}">${a.summary}</a>` : a.summary}</p>
          <p class="meta">
            <span class="row" style="gap:4px">${raw(icon(ENTITY_ICON[a.entity] ?? 'activity'))} ${ACTIVITY_ENTITY_LABEL[a.entity] ?? a.entity}</span> · <span>${a.user}</span> ·
            <time datetime="${a.at}" title="${a.at.replace('T', ' ')}">${timeAgo(a.at)}</time>
          </p>
        </div>
      </li>`;
    })}
  </ol>`;
}
