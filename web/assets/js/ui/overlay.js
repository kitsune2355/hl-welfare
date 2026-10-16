// Toast + Modal + ยืนยันก่อนทำรายการ
import { html, raw } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { spinner } from './loading.js';

// ===================== Toast =====================
function toastHost() {
  let host = document.querySelector('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  return host;
}

function push(kind, message) {
  const host = toastHost();
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = String(
    html`${raw(icon(kind === 'success' ? 'check-circle-2' : 'x-circle'))}
      <p>${message}</p>
      <button class="btn-icon sm" aria-label="ปิด">${raw(icon('x'))}</button>`,
  );
  el.querySelector('button').onclick = () => el.remove();
  host.append(el);
  while (host.children.length > 4) host.firstElementChild.remove();
  setTimeout(() => el.remove(), 4000);
}

export const toast = {
  success: (m) => push('success', m),
  error: (m) => push('error', m),
};

export const errorMessage = (e) => (e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ');

// ===================== Modal =====================
/**
 * เปิด modal — คืน { el, close }
 * @param {{title: string, description?: string, body?: any, footer: any, onClose?: () => void, size?: 'lg'}} opts  size lg = กว้าง 760px เนื้อหาเลื่อนภายใน
 */
export function openModal({ title, description = '', body = '', footer, onClose, size = '' }) {
  const prev = document.activeElement;
  const layer = document.createElement('div');
  layer.className = 'modal-layer';
  layer.innerHTML = String(html`<div class="backdrop" data-close></div>
    <div class="modal${size ? ` modal-${size}` : ''}" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal-head">
        <div>
          <h2>${title}</h2>
          ${description ? html`<p>${description}</p>` : ''}
        </div>
        <button class="btn-icon sm" data-close aria-label="ปิด">${raw(icon('x'))}</button>
      </div>
      ${body ? html`<div class="modal-body">${body}</div>` : ''}
      <div class="modal-foot">${footer}</div>
    </div>`);
  document.body.append(layer);

  let locked = false;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    layer.remove();
    prev?.focus?.();
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && !locked) close();
    if (e.key !== 'Tab') return;
    const els = [...layer.querySelectorAll('button:not([disabled]), [href], input, select, textarea')];
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKey);
  layer.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => !locked && close()));
  (layer.querySelector('.modal-foot .btn-primary, .modal-foot .btn-danger') ?? layer.querySelector('button'))?.focus();

  return {
    el: layer,
    close,
    /** ล็อกระหว่างบันทึก — ปิดไม่ได้ ปุ่มแสดง spinner */
    busy(on, button) {
      locked = on;
      layer.querySelectorAll('.modal-foot button').forEach((b) => (b.disabled = on));
      if (button) button.innerHTML = on ? `${spinner({ size: 'sm', onColor: true })} ${button.dataset.label}` : button.dataset.label;
    },
  };
}

/**
 * ยืนยันก่อนทำรายการ แล้วรัน action — แสดง Toast ทั้งสำเร็จและล้มเหลว
 * @returns {Promise<boolean>} true = ทำสำเร็จ
 */
export function confirmAction({ title, description = '', body = '', confirmLabel = 'ยืนยัน', danger = true, successMessage, action }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title,
      description,
      body,
      footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok data-label="${confirmLabel}">${confirmLabel}</button>`,
      onClose: () => resolve(done),
    });
    m.el.querySelector('[data-close].btn').onclick = () => m.close();
    const ok = m.el.querySelector('[data-ok]');
    ok.onclick = async () => {
      m.busy(true, ok);
      try {
        await action();
        done = true;
        if (successMessage) toast.success(successMessage);
        m.busy(false, ok);
        m.close();
      } catch (e) {
        toast.error(errorMessage(e));
        m.busy(false, ok);
      }
    };
  });
}
