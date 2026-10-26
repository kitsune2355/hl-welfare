// ชิ้นส่วนที่หลายหน้าใช้ร่วมกัน (บันทึกแจกชุด, ไทม์ไลน์กิจกรรม)
import { api } from '../app/api.js';
import { can } from '../app/auth.js';
import { refreshCounts } from '../app/shell.js';
import { CONFIG } from '../config.js';
import { html, on, raw, render } from '../shared/dom.js';
import { sizeSummary, timeAgo } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { ACTIVITY_ENTITY_LABEL, SHOE_SIZES, SIZES, UNIFORM_EVENT_LABEL, UNIFORM_ITEM_LABEL } from '../shared/labels.js';
import { enhanceSelects } from '../ui/combobox.js';
import { alertBox, emptyState, errorState } from '../ui/components.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';
import { loader } from '../ui/loading.js';

// ===================== แจกชุดฟอร์ม: ส่งเบิกคลัง (หลัก) / บันทึกแจกเอง (รอง) =====================

/**
 * ปุ่มของสิทธิ์ที่ค้างแจก — ต้องเรียก wireIssueActions(root, ...) หนึ่งครั้งต่อ container
 * ส่งเบิกคลัง = ออกใบเบิกในระบบสต็อก Uniform ให้คลังจ่าย (ตัดสต็อกจริง)
 * บันทึกแจกเอง = กรณีแจกนอกระบบไปแล้ว หรือระบบสต็อกใช้งานไม่ได้ (ไม่ตัดสต็อก)
 */
export function issueAction({ employeeId, entitlementKey, event, qty, name = '', itemQty = null }) {
  const manual = can('uniform.issue');
  const stock = can('stock.request');
  if (!manual && !stock) return html`<span class="small muted">รอแจก</span>`;
  return html`<div class="row" data-issue data-emp="${employeeId}" data-key="${entitlementKey}" data-event="${event}" data-qty="${qty}" data-name="${name}" data-items="${itemQty ? JSON.stringify(itemQty) : ''}" style="justify-content:flex-end;gap:6px">
    ${manual ? html`<button class="btn-icon sm" data-issue-manual title="บันทึกแจกเอง (แจกนอกระบบสต็อกไปแล้ว)" aria-label="บันทึกแจกเอง">${raw(icon('pencil'))}</button>` : ''}
    ${stock ? html`<button class="btn btn-primary btn-sm" data-stock-request>${raw(icon('send'))} ส่งเบิกคลัง</button>` : ''}
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
  on(root, 'click', '[data-issue-manual]', (_e, btn) => openManualIssue(ctx(btn)));
}

/**
 * ทำทีละคนต่อเนื่องกับแถวที่เลือก (ตารางค้างแจก): เปิดกล่องส่งเบิก / บันทึกแจกเอง ของคนถัดไปเมื่อปิดกล่องก่อนหน้า
 * กดยกเลิก (ปิดโดยไม่บันทึก) = หยุดทั้งชุด · คืนจำนวนที่ทำสำเร็จ
 * @param {'stock'|'manual'} kind
 * @param {{employeeId:number, entitlementKey:string, event:string, qty:number, name:string, itemQty?:Object<string, number>}[]} items
 */
export async function issueSequence(kind, items, { today, onDone }) {
  let done = 0;
  for (const [i, it] of items.entries()) {
    let saved = false;
    await new Promise((resolve) => {
      const ctx = { ...it, today, step: `${i + 1}/${items.length}`, onDone: () => ((saved = true), done++), onClose: resolve };
      (kind === 'stock' ? openStockRequest : openManualIssue)(ctx);
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
 * บันทึกแจกเอง — เลือกไซซ์แยกรายตัวของแต่ละรายการ (เสื้อ 2 ตัวคนละไซซ์ได้) แล้วบันทึกว่าแจกแล้ว (ไม่ผ่านคลัง)
 * ไซซ์เก็บเป็นข้อความสรุป เช่น "เสื้อช่าง M, L · กางเกงช่าง L×2" · สิทธิ์ที่ไม่มีจำนวนต่อรายการ (รุ่นก่อน) = เลือกไซซ์เดียว
 */
function openManualIssue({ employeeId, entitlementKey, event, qty, name, itemQty = null, today, onDone, onClose, step = '' }) {
  const perItem = Object.entries(itemQty ?? {}).filter(([, n]) => n > 0);
  const lines = perItem.length
    ? perItem.map(([code, n]) => ({ code, n, label: UNIFORM_ITEM_LABEL[code] ?? code, unit: code === 'SAFETY_SHOES' ? 'คู่' : 'ตัว', options: code === 'SAFETY_SHOES' ? SHOE_SIZES : SIZES }))
    : [{ code: '', n: 1, label: 'ไซซ์ที่แจก', unit: '', options: SIZES }];
  const m = openModal({
    onClose,
    title: `บันทึกแจกเอง${step ? ` (${step})` : ''}`,
    description: `${name ? `${name} · ` : ''}${roundLabel(event, entitlementKey)} · ${qty} ตัว`,
    body: html`${alertBox({ tone: 'warning', body: 'ใช้เมื่อแจกนอกระบบสต็อกไปแล้วเท่านั้น — ไม่ออกใบเบิกและไม่ตัดยอดในคลัง ถ้ายังไม่ได้แจก ให้ใช้ “ส่งเบิกคลัง”' })}
      <div style="display:grid;gap:14px;margin-top:16px">
        ${lines.map(
          (l, li) => html`<div class="field">
            <label>${l.label}${l.unit ? html` <span class="muted small">(${l.n} ${l.unit})</span>` : ''}<span class="req">*</span></label>
            <div class="row wrap" style="gap:8px">
              ${Array.from(
                { length: l.n },
                (_, k) => html`<select class="input" data-size="${li}" style="width:auto;min-width:104px" aria-label="${l.label}${l.n > 1 ? ` ตัวที่ ${k + 1}` : ''}">
                  <option value="">${l.n > 1 ? `ตัวที่ ${k + 1}` : 'เลือกไซซ์'}</option>
                  ${l.options.map((s) => html`<option value="${s}">${s}</option>`)}
                </select>`,
              )}
            </div>
          </div>`,
        )}
        ${lines.some((l) => l.n > 1) ? html`<span class="hint">เลือกตัวแรกแล้ว ตัวที่ยังว่างของรายการเดียวกันจะใช้ไซซ์เดียวกัน — เปลี่ยนรายตัวได้</span>` : ''}
      </div>`,
    footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" data-ok data-label="บันทึกแจก" disabled>บันทึกแจก</button>`,
  });
  const ok = m.el.querySelector('[data-ok]');
  const selectsOf = (li) => [...m.el.querySelectorAll(`[data-size="${li}"]`)];
  const all = () => [...m.el.querySelectorAll('[data-size]')];
  m.el.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-size]');
    if (!sel) return;
    const same = selectsOf(sel.dataset.size);
    // ตัวแรกของรายการ → เติมตัวที่ยังว่างให้ (ส่วนใหญ่ไซซ์เดียวกันทั้งรายการ)
    if (sel === same[0] && sel.value) same.forEach((s) => s.value || (s.value = sel.value));
    ok.disabled = all().some((s) => !s.value);
  });
  all()[0]?.focus();
  const summary = () => (lines[0].code === '' ? all()[0].value : sizeSummary(lines.map((l, li) => ({ label: l.label, sizes: selectsOf(li).map((s) => s.value) }))));
  ok.onclick = async () => {
    m.busy(true, ok);
    try {
      const size = summary();
      await api.createUniformIssue({ employeeId, entitlementKey, event, qty, size, issuedAt: today });
      toast.success(`บันทึกแจกชุดฟอร์ม (${UNIFORM_EVENT_LABEL[event]}) แล้ว — ${size}`);
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

/** ส่งเบิกคลัง — เลือกแบบ (ชาย/หญิง) ไซซ์ และจำนวนของแต่ละรายการ จากสินค้าในระบบสต็อก */
async function openStockRequest({ employeeId, entitlementKey, event, name, onDone, onClose, step = '' }) {
  const m = openModal({
    onClose,
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
  // สิ่งที่ผู้ใช้เลือก — index ของแบบ + สินค้า (ไซซ์) + จำนวน ต่อรายการ
  const picks = opt.items.map((it) => ({ variant: it.variantIndex, productId: 0, qty: it.qty }));

  const productsOf = (i) => opt.items[i].variants[picks[i].variant]?.products ?? [];
  const lineHtml = (it, i) => {
    const p = picks[i];
    const chosen = productsOf(i).find((x) => x.productId === p.productId);
    const short = chosen && chosen.onHand < p.qty;
    return html`<div class="form-grid stock-line" data-line="${i}" style="grid-template-columns:1fr 1fr 84px;align-items:start;padding:12px 0;border-bottom:1px solid var(--border)">
      <div class="field">
        <label>${UNIFORM_ITEM_LABEL[it.itemCode] ?? it.itemCode}</label>
        ${it.variants.length > 1
          ? html`<select class="input" data-variant aria-label="แบบ">
              ${it.variants.map((v, vi) => html`<option value="${vi}" ${vi === p.variant ? raw('selected') : ''}>${v.label}</option>`)}
            </select>`
          : html`<span class="small muted" style="min-height:40px;display:flex;align-items:center">${it.variants[0]?.name ?? '–'}</span>`}
      </div>
      <div class="field">
        <label>ไซซ์<span class="req">*</span></label>
        <select class="input" data-product aria-label="ไซซ์">
          <option value="">เลือกไซซ์</option>
          ${productsOf(i).map((x) => html`<option value="${x.productId}" ${x.productId === p.productId ? raw('selected') : ''}>${x.size} (คงเหลือ ${x.onHand})</option>`)}
        </select>
        ${chosen ? html`<span class="${short ? 'error' : 'hint'}">${short ? `สต็อกไม่พอ (มี ${chosen.onHand})` : `คงเหลือ ${chosen.onHand}`}</span>` : ''}
      </div>
      <div class="field">
        <label>จำนวน</label>
        <input class="input num" type="number" min="1" step="1" data-qty value="${p.qty}" aria-label="จำนวน" />
      </div>
    </div>`;
  };
  const draw = () => {
    const d = opt.department;
    const newStaff = opt.docKind === 'new_staff';
    render(
      body,
      html`${opt.blockers.length
          ? alertBox({ tone: 'danger', title: 'ยังส่งเบิกไม่ได้', body: html`${opt.blockers.join(' · ')} — แจ้งผู้ดูแลระบบสต็อกให้จับคู่ก่อน` })
          : alertBox({
              tone: 'info',
              // <strong> ไม่ใช่ <b> — .alert-body b เป็นหัวข้อ (display: block)
              body: html`${newStaff ? html`ออกเป็น<strong>ใบเบิกพนักงานใหม่</strong> (อยู่ใน “รายการใบเบิก” ของระบบสต็อก) ` : 'ใบเบิก'}ลงหน่วยงาน <strong>${d.name}</strong>${d.company ? ` (${d.company})` : ''} แล้วรอ<strong>ผู้อนุมัติของหน่วยงานในระบบสต็อกกดอนุมัติ</strong> — อนุมัติแล้วคลังจ่าย สถานะในระบบนี้อัปเดตเอง · ไม่อนุมัติ = กลับเป็นค้างแจก พร้อมเหตุผล`,
            })}
        <p class="small muted" style="margin:12px 0 0">${opt.style} · สิทธิ์ ${opt.qtyLabel} ตัว · ของไม่พอก็ส่งเบิกได้ คลังจะจ่ายเมื่อมีของ</p>
        <div>${opt.items.map(lineHtml)}</div>
        ${newStaff && opt.kit.length
          ? html`<div class="field" style="margin-top:16px">
              <label>ชุดของพนักงานใหม่ (ระบบสต็อกใส่ให้ในใบเดียวกัน)</label>
              <ul class="small muted" style="margin:0;padding-left:18px">
                ${opt.kit.map((k) => html`<li>${k.name} × ${k.qty}${k.mustReturn ? ' · ต้องคืนเมื่อพ้นสภาพ' : ''}</li>`)}
              </ul>
            </div>`
          : ''}`,
    );
    ok.disabled = opt.blockers.length > 0 || picks.some((p) => !p.productId || !(Number.isInteger(p.qty) && p.qty > 0));
  };
  draw();

  body.addEventListener('change', (e) => {
    const line = e.target.closest('[data-line]');
    if (!line) return;
    const p = picks[Number(line.dataset.line)];
    if (e.target.matches('[data-variant]')) {
      p.variant = Number(e.target.value);
      p.productId = 0; // ไซซ์เป็นสินค้าของแต่ละแบบ เปลี่ยนแบบแล้วต้องเลือกใหม่
    } else if (e.target.matches('[data-product]')) p.productId = Number(e.target.value);
    else if (e.target.matches('[data-qty]')) p.qty = Number(e.target.value);
    draw();
  });

  ok.onclick = async () => {
    m.busy(true, ok);
    try {
      const lines = opt.items.map((it, i) => ({ itemCode: it.itemCode, productId: picks[i].productId, qty: picks[i].qty }));
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
