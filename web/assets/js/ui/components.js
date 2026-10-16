// ชิ้นส่วน UI ที่ใช้ซ้ำ — ทุกฟังก์ชันคืนค่า HTML (ใช้ใน html`...` ได้ทันที)
import { html, raw } from '../shared/dom.js';
import { icon } from '../shared/icons.js';

/** tone: success | warning | danger | info | neutral | primary */
export function badge(text, tone = 'neutral', { dot = true, lg = false } = {}) {
  return html`<span class="badge tone-${tone}${dot ? ' dot' : ''}${lg ? ' lg' : ''}">${text}</span>`;
}

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export function avatar(name, { lg = false } = {}) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // ตัวอักษรแรกที่ไม่ใช่สระ/วรรณยุกต์ไทย
  const initial = [...name.trim()].find((c) => /\p{L}/u.test(c) && !/[ะ-๎]/.test(c)) ?? '?';
  return html`<span class="avatar${lg ? ' lg' : ''}" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}" aria-hidden="true"
    >${initial}</span
  >`;
}

/** Avatar + ชื่อ + รหัส (link = ลิงก์ไปหน้ารายละเอียด) */
export function employeeCell(e, { link = false } = {}) {
  const name = `${e.firstName} ${e.lastName}`;
  return html`<div class="emp">
    ${avatar(e.firstName)}
    <div style="min-width:0">
      ${link ? html`<a class="name" href="employee.html?id=${e.id}">${name}</a>` : html`<span class="name">${name}</span>`}
      <span class="code">${e.empCode}</span>
    </div>
  </div>`;
}

export function statCard({ label, value, hint = '', iconName = '', tone = 'primary', href = '', attrs = '' }) {
  const inner = html`<div class="stat-top">
      <span class="stat-label">${label}</span>
      ${iconName ? html`<span class="stat-icon tone-${tone}">${raw(icon(iconName))}</span>` : ''}
    </div>
    <div class="stat-value">${value}</div>
    ${hint ? html`<div class="stat-hint">${hint}</div>` : ''}`;
  return href ? html`<a class="stat" href="${href}" ${raw(attrs)}>${inner}</a>` : html`<div class="stat" ${raw(attrs)}>${inner}</div>`;
}

export function emptyState({ iconName = '', title, description = '', action = '' }) {
  return html`<div class="empty">
    ${iconName ? html`<div class="empty-icon">${raw(icon(iconName))}</div>` : ''}
    <b>${title}</b>
    ${description ? html`<p>${description}</p>` : ''} ${action}
  </div>`;
}

const ALERT_ICON = { info: 'info', success: 'check-circle-2', warning: 'alert-triangle', danger: 'alert-circle' };

export function alertBox({ tone = 'info', title = '', body = '', action = '' }) {
  return html`<div class="alert tone-${tone}" role="${tone === 'danger' ? 'alert' : 'status'}">
    ${raw(icon(ALERT_ICON[tone]))}
    <div class="alert-body">${title ? html`<b>${title}</b>` : ''}${body}</div>
    ${action}
  </div>`;
}

export function errorState(error) {
  const msg = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
  return alertBox({
    tone: 'danger',
    title: 'โหลดข้อมูลไม่สำเร็จ',
    body: msg,
    action: html`<button class="btn btn-sm" onclick="location.reload()">${raw(icon('rotate-cw'))} ลองใหม่</button>`,
  });
}

export function skeletonCards(n = 4) {
  return html`${Array.from({ length: n }, () => html`<div class="skeleton sk-card"></div>`)}`;
}

export function skeletonLines(n = 5) {
  return html`<div style="display:grid;gap:14px;padding:20px">
    ${Array.from({ length: n }, () => html`<div class="skeleton sk-line"></div>`)}
  </div>`;
}

/** การ์ดมาตรฐาน (head + body) */
export function card({ title, description = '', iconName = '', actions = '', body = '', padded = true, cls = '' }) {
  return html`<section class="card ${cls}">
    ${title
      ? html`<header class="card-head">
          <div class="card-title">
            ${iconName ? html`<span class="card-icon">${raw(icon(iconName))}</span>` : ''}
            <div style="min-width:0">
              <h2>${title}</h2>
              ${description ? html`<p>${description}</p>` : ''}
            </div>
          </div>
          ${actions ? html`<div class="row wrap">${actions}</div>` : ''}
        </header>`
      : ''}
    <div class="${padded ? 'card-body' : ''}">${body}</div>
  </section>`;
}

/** แท็บ — items: { value, label, count?, tone? } · tone = สีของป้ายตัวเลข (danger/warning/info/success…) */
export function tabs(items, value) {
  return html`<div class="tabs" role="tablist">
    ${items.map(
      (t) =>
        html`<button class="tab${t.value === value ? ' active' : ''}" role="tab" aria-selected="${t.value === value}" data-tab="${t.value}">
          ${t.label} ${t.count !== undefined ? html`<span class="count num ${t.tone ? `tone-${t.tone}` : ''}">${t.count}</span>` : ''}
        </button>`,
    )}
  </div>`;
}

export function progress(value, tone = '') {
  const v = Math.max(0, Math.min(100, value));
  return html`<div class="progress ${tone}" role="progressbar" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100">
    <span style="width:${v}%"></span>
  </div>`;
}

export function infoList(items, cols = 4) {
  return html`<dl class="info${cols !== 4 ? ` cols-${cols}` : ''}">
    ${items.map((i) => html`<div><dt>${i.label}</dt><dd>${i.value}</dd></div>`)}
  </dl>`;
}

export function switchButton({ checked, label, attrs = '' }) {
  return html`<button type="button" class="switch" role="switch" aria-checked="${!!checked}" aria-label="${label}" ${raw(attrs)}></button>`;
}
