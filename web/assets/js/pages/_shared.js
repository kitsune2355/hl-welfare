// ชิ้นส่วนที่หลายหน้าใช้ร่วมกัน (บันทึกแจกชุด, ไทม์ไลน์กิจกรรม)
import { api } from '../app/api.js';
import { refreshCounts } from '../app/shell.js';
import { html, on, raw } from '../shared/dom.js';
import { timeAgo } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { ACTIVITY_ENTITY_LABEL, SIZES, UNIFORM_EVENT_LABEL } from '../shared/labels.js';
import { enhanceSelects } from '../ui/combobox.js';
import { emptyState } from '../ui/components.js';
import { errorMessage, toast } from '../ui/overlay.js';
import { spinner } from '../ui/loading.js';

// ===================== บันทึกแจกชุดฟอร์ม (เลือกไซซ์ + ปุ่ม) =====================

/** HTML ของช่องไซซ์ + ปุ่มบันทึกแจก — ต้องเรียก wireIssueActions(root, ...) หนึ่งครั้งต่อ container */
export function issueAction({ employeeId, entitlementKey, event, qty }) {
  return html`<div class="row" data-issue data-emp="${employeeId}" data-key="${entitlementKey}" data-event="${event}" data-qty="${qty}" style="justify-content:flex-end">
    <select data-combobox data-size="sm" aria-label="ไซซ์" class="combo" style="width:96px">
      <option value="">ไซซ์</option>
      ${SIZES.map((s) => html`<option value="${s}">${s}</option>`)}
    </select>
    <button class="btn btn-primary btn-sm" data-issue-save disabled>บันทึกแจก</button>
  </div>`;
}

export function wireIssueActions(root, { today, onDone }) {
  root.addEventListener('change', (e) => {
    const box = e.target.closest('[data-issue]');
    if (box && e.target.matches('select')) box.querySelector('[data-issue-save]').disabled = !e.target.value;
  });
  on(root, 'click', '[data-issue-save]', async (_e, btn) => {
    const box = btn.closest('[data-issue]');
    const size = box.querySelector('select').value;
    const event = box.dataset.event;
    btn.disabled = true;
    btn.innerHTML = `${spinner({ size: 'sm', onColor: true })} บันทึกแจก`;
    try {
      await api.createUniformIssue({
        employeeId: Number(box.dataset.emp),
        entitlementKey: box.dataset.key,
        event,
        qty: Number(box.dataset.qty),
        size,
        issuedAt: today,
      });
      toast.success(`บันทึกแจกชุดฟอร์ม (${UNIFORM_EVENT_LABEL[event]}) ไซซ์ ${size} แล้ว`);
      refreshCounts();
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
      btn.disabled = false;
      btn.textContent = 'บันทึกแจก';
    }
  });
}

/** เรียกหลัง render ตารางที่มี issueAction */
export const enhanceIssueActions = (root) => enhanceSelects(root);

// ===================== ไทม์ไลน์บันทึกกิจกรรม =====================

const ACTION = {
  CREATE: { icon: 'plus', tone: 'success', label: 'สร้าง' },
  UPDATE: { icon: 'pencil', tone: 'info', label: 'แก้ไข' },
  DELETE: { icon: 'trash-2', tone: 'danger', label: 'ลบ' },
  CANCEL: { icon: 'ban', tone: 'warning', label: 'ยกเลิก' },
};
const ENTITY_ICON = { EMPLOYEE: 'user', SITE: 'building-2', INSURANCE_BATCH: 'shield-plus', INSURER_FORM: 'file-spreadsheet', UNIFORM_ISSUE: 'shirt' };

export function activityFeed(items, { linkEmployee = true } = {}) {
  if (!items.length) return emptyState({ title: 'ยังไม่มีกิจกรรม', description: 'การเพิ่ม/แก้ไข/ลบข้อมูลทุกครั้งจะแสดงที่นี่' });
  return html`<ol class="feed">
    ${items.map((a) => {
      const act = ACTION[a.action];
      return html`<li>
        <span class="dot tone-${act.tone}" title="${act.label}">${raw(icon(act.icon))}</span>
        <div class="body">
          <p>${linkEmployee && a.employeeId ? html`<a href="employee.html?id=${a.employeeId}">${a.summary}</a>` : a.summary}</p>
          <p class="meta">
            <span class="row" style="gap:4px">${raw(icon(ENTITY_ICON[a.entity]))} ${ACTIVITY_ENTITY_LABEL[a.entity]}</span> · <span>${a.user}</span> ·
            <time datetime="${a.at}" title="${a.at.replace('T', ' ')}">${timeAgo(a.at)}</time>
          </p>
        </div>
      </li>`;
    })}
  </ol>`;
}
