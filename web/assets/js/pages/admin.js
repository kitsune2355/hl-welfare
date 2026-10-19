// หน้า: ผู้ดูแลระบบ (admin.html?tab=users|access|health|audit) — SUPER_ADMIN เท่านั้น
//   ผู้ใช้          = สร้าง / แก้ชื่อ-บทบาท-รหัสพนักงาน / ปิด-เปิดบัญชี / ตั้งรหัสผ่านใหม่ / ออกจากระบบทุกอุปกรณ์
//   การเข้าสู่ระบบ = ที่ถูกล็อก (ปลดล็อก) · session · อุปกรณ์ที่จดจำ · ประวัติ login
//   สถานะระบบ     = DB / migration / ค่าตั้ง / ping สต็อก Uniform · ใบเบิกค้าง · ล้างข้อมูลเก่า
//   ตั้งค่าระบบ    = URL/กุญแจ/เวลารอ ของสต็อก Uniform (ทดสอบก่อนบันทึก) · การเข้าสู่ระบบ · เกณฑ์ติดตาม (ทับ config.php)
//   บันทึกการใช้งาน = audit_log ทุก entity (รวม USER / STOCK_REQUEST / SYSTEM)
// เซิร์ฟเวอร์ตรวจสิทธิ์ทุก endpoint (backend/api/admin.php) — เมนูซ่อนจากบทบาทอื่นใน app/shell.js
import { adminApi } from '../app/api.js';
import { getSession } from '../app/auth.js';
import { initPage } from '../app/shell.js';
import { $, debounce, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { clock, int, thaiDate, thaiDateTime, timeAgo } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { ACTIVITY_ENTITY_LABEL } from '../shared/labels.js';
import { alertBox, badge, emptyState, errorState, infoList, skeletonCards, skeletonLines, tabs } from '../ui/components.js';
import { busy } from '../ui/loading.js';
import { confirmAction, errorMessage, openModal, toast } from '../ui/overlay.js';
import { DataTable } from '../ui/table.js';
import { activityAction, ENTITY_ICON } from './_shared.js';

initPage('admin');

const TABS = ['users', 'access', 'health', 'settings', 'audit'];
let tab = TABS.includes(getParam('tab')) ? getParam('tab') : 'users';
const me = getSession();
const loaded = new Set();
const state = { roles: [], counts: {} };

const ago = (s) => (s ? html`<time datetime="${s}" title="${thaiDateTime(s)}">${timeAgo(s)}</time>` : html`<span class="muted">–</span>`);
const when = (s) => (s ? thaiDateTime(s) : '–');
const userCell = (r) => html`<span class="two-line"><b>${r.name}</b><span class="sub">${r.username} · ${r.roleLabel}</span></span>`;

/** Mozilla/5.0 (Windows NT 10.0; …) Chrome/141 … → "Chrome · Windows" */
function device(ua) {
  if (!ua) return '–';
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'อื่น ๆ';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} · ${os}` : b;
}

// ===================== แท็บ =====================
function drawTabs() {
  const c = state.counts;
  render(
    $('#tabs'),
    tabs(
      [
        { value: 'users', label: 'ผู้ใช้', count: c.users },
        { value: 'access', label: 'การเข้าสู่ระบบ', count: c.locks || undefined, tone: 'danger' },
        { value: 'health', label: 'สถานะระบบ', count: c.problems || undefined, tone: c.errors ? 'danger' : 'warning' },
        { value: 'settings', label: 'ตั้งค่าระบบ' },
        { value: 'audit', label: 'บันทึกการใช้งาน' },
      ],
      tab,
    ),
  );
  for (const t of TABS) $(`#tab-${t}`).classList.toggle('hidden', t !== tab);
}

on($('#tabs'), 'click', '[data-tab]', (_e, b) => {
  tab = b.dataset.tab;
  setParams({ tab: tab === 'users' ? '' : tab });
  drawTabs();
  load(tab);
});

const LOADERS = { users: loadUsers, access: loadAccess, health: loadHealth, settings: loadSettings, audit: loadAudit };
async function load(t, force = false) {
  if (loaded.has(t) && !force) return;
  loaded.add(t);
  try {
    await LOADERS[t]();
    render($('#updated'), `อัปเดต ${clock(new Date())}`);
  } catch (e) {
    loaded.delete(t);
    if (e?.status === 403) return blocked('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ');
    toast.error(errorMessage(e));
  }
}

function blocked(message) {
  render($('#blocked'), alertBox({ tone: 'danger', title: message, body: 'หน้านี้ใช้ได้เฉพาะบทบาท “ผู้ดูแลระบบ” (SUPER_ADMIN) บน PHP backend' }));
  $('#blocked').classList.remove('hidden');
  $('#tabs').classList.add('hidden');
  for (const t of TABS) $(`#tab-${t}`).classList.add('hidden');
  $('#refresh').disabled = true;
}

$('#refresh').addEventListener('click', () => load(tab, true));

// ===================== ผู้ใช้ =====================
const isMe = (u) => u.id === me?.id;
const users = new DataTable($('#users'), {
  rowKey: (u) => u.id,
  pageSize: 25,
  exportName: 'ผู้ใช้ระบบ',
  rowClass: (u) => (u.isActive ? '' : 'muted'),
  columns: [
    { key: 'name', header: 'ผู้ใช้', text: (u) => `${u.name} ${u.username}`, cell: (u) => html`<span class="two-line"><b>${u.name}${isMe(u) ? ' (คุณ)' : ''}</b><span class="sub">${u.username}</span></span>` },
    { key: 'role', header: 'บทบาท', text: (u) => u.roleLabel, cell: (u) => badge(u.roleLabel, u.role === 'SUPER_ADMIN' ? 'danger' : 'info') },
    { key: 'empCode', header: 'รหัสพนักงาน', text: (u) => u.empCode ?? '', cell: (u) => u.empCode ?? html`<span class="muted">–</span>` },
    {
      key: 'status',
      header: 'สถานะ',
      text: (u) => (u.isActive ? (u.locked ? 'ถูกล็อก' : 'ใช้งาน') : 'ปิดบัญชี'),
      cell: (u) => (u.isActive ? (u.locked ? badge('ถูกล็อก', 'danger') : badge('ใช้งาน', 'success')) : badge('ปิดบัญชี', 'neutral')),
    },
    { key: 'online', header: 'ออนไลน์ / จดจำ', align: 'center', text: (u) => `${u.activeSessions} / ${u.devices}`, cell: (u) => html`<span class="num">${u.activeSessions} / ${u.devices}</span>` },
    { key: 'last', header: 'เข้าล่าสุด', sort: (u) => u.lastLoginAt ?? '', text: (u) => when(u.lastLoginAt), cell: (u) => ago(u.lastLoginAt) },
    { key: 'pw', header: 'เปลี่ยนรหัสล่าสุด', hideOnMobile: true, sort: (u) => u.passwordChangedAt ?? '', text: (u) => when(u.passwordChangedAt), cell: (u) => ago(u.passwordChangedAt) },
    {
      key: 'actions',
      header: '',
      filter: false,
      cell: (u) => html`<span class="row-actions">
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${u.id}" title="แก้ไข">${raw(icon('pencil'))} แก้ไข</button>
        ${isMe(u)
          ? ''
          : html`<button class="btn btn-ghost btn-sm" data-action="password" data-id="${u.id}" title="ตั้งรหัสผ่านใหม่">${raw(icon('lock'))}</button>
              <button class="btn btn-ghost btn-sm" data-action="signout" data-id="${u.id}" title="ออกจากระบบทุกอุปกรณ์" ${u.activeSessions + u.devices ? '' : 'disabled'}>${raw(icon('log-out'))}</button>
              <button class="btn btn-ghost btn-sm" data-action="toggle" data-id="${u.id}" title="${u.isActive ? 'ปิดบัญชี' : 'เปิดใช้บัญชี'}">${raw(icon(u.isActive ? 'user-x' : 'user-plus'))}</button>`}
      </span>`,
    },
  ],
  empty: emptyState({ iconName: 'users', title: 'ยังไม่มีผู้ใช้' }),
});

async function loadUsers() {
  render($('#users'), html`<div class="card-body">${raw(String(skeletonLines(5)))}</div>`);
  const d = await adminApi.listUsers();
  state.roles = d.roles;
  state.counts.users = d.users.filter((u) => u.isActive).length;
  state.users = d.users;
  users.setRows(d.users);
  drawTabs();
}
const userById = (id) => state.users.find((u) => u.id === Number(id));

function field(name, label, input, { required = false, hint = '' } = {}) {
  return html`<div class="field" data-field="${name}">
    <label>${label}${required ? html` <span class="req">*</span>` : ''}</label>
    ${input}
    ${hint ? html`<span class="hint">${hint}</span>` : ''}
    <span class="error"></span>
  </div>`;
}

/** รหัสผ่านสุ่ม 14 ตัว (ตัด 0 O 1 l I ออก อ่านง่ายเวลาบอกต่อ) */
function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => chars[n % chars.length]).join('');
}

function passwordInput() {
  return html`<div class="row" style="gap:6px">
      <input class="input" name="password" type="text" autocomplete="new-password" spellcheck="false" style="font-family:var(--font-mono, monospace)" />
      <button type="button" class="btn btn-sm" data-gen>สุ่ม</button>
    </div>`;
}

/**
 * modal ฟอร์ม — save(values) โยน ApiError 422/409 ที่มี details → แสดงใต้ช่อง
 * @returns {Promise<void>}
 */
function formModal({ title, description = '', fields, values = {}, okLabel = 'บันทึก', save }) {
  const m = openModal({
    title,
    description,
    body: html`<form class="form-grid" style="grid-template-columns:1fr" novalidate>${fields}</form>`,
    footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" data-ok data-label="${okLabel}">${okLabel}</button>`,
  });
  const form = m.el.querySelector('form');
  for (const [k, v] of Object.entries(values)) if (form.elements[k]) form.elements[k].value = v ?? '';
  form.querySelector('[data-gen]')?.addEventListener('click', () => (form.elements.password.value = randomPassword()));
  form.querySelector('input:not([readonly]), select')?.focus();
  const ok = m.el.querySelector('[data-ok]');
  const submit = async (e) => {
    e?.preventDefault();
    form.querySelectorAll('.field').forEach((f) => {
      f.querySelector('.error').textContent = '';
      f.querySelector('.input')?.removeAttribute('aria-invalid');
    });
    m.busy(true, ok);
    try {
      await save(Object.fromEntries(new FormData(form)));
      m.busy(false, ok);
      m.close();
    } catch (err) {
      m.busy(false, ok);
      const details = err?.details ?? {};
      for (const [k, msg] of Object.entries(details)) {
        const f = form.querySelector(`[data-field="${k}"]`);
        if (!f) continue;
        f.querySelector('.error').textContent = msg;
        f.querySelector('.input')?.setAttribute('aria-invalid', 'true');
      }
      toast.error(Object.keys(details).length ? Object.values(details)[0] : errorMessage(err));
    }
  };
  ok.onclick = submit;
  form.addEventListener('submit', submit);
}

const roleSelect = (disabled = false) =>
  html`<select class="input" name="role" ${disabled ? 'disabled' : ''}>${state.roles.map((r) => html`<option value="${r.value}">${r.label}</option>`)}</select>`;

$('#add-user').addEventListener('click', () =>
  formModal({
    title: 'เพิ่มผู้ใช้',
    description: 'ใช้ชื่อผู้ใช้เดียวกับ stock_hr ถ้ามีบัญชีที่นั่น · แจ้งรหัสผ่านให้ผู้ใช้แล้วให้เปลี่ยนเองภายหลัง',
    fields: html`${field('username', 'ชื่อผู้ใช้', html`<input class="input" name="username" autocomplete="off" spellcheck="false" />`, { required: true, hint: 'a-z 0-9 . _ - (2–50 ตัว)' })}
      ${field('name', 'ชื่อ-สกุล', html`<input class="input" name="name" />`, { required: true })}
      ${field('role', 'บทบาท', roleSelect(), { required: true })}
      ${field('empCode', 'รหัสพนักงาน', html`<input class="input" name="empCode" />`, { hint: 'ส่งให้สต็อกเป็นผู้ขอเบิก' })}
      ${field('password', 'รหัสผ่านเริ่มต้น', passwordInput(), { required: true, hint: 'อย่างน้อย 8 ตัว' })}`,
    values: { role: 'HR_ADMIN', password: randomPassword() },
    okLabel: 'เพิ่มผู้ใช้',
    save: async (v) => {
      const u = await adminApi.createUser(v);
      toast.success(`เพิ่มผู้ใช้ ${u.username} แล้ว`);
      await loadUsers();
    },
  }),
);

on($('#users'), 'click', '[data-action]', async (_e, b) => {
  const u = userById(b.dataset.id);
  if (!u) return;
  const act = b.dataset.action;
  if (act === 'edit') {
    return formModal({
      title: `แก้ไขผู้ใช้ ${u.username}`,
      description: isMe(u) ? 'บทบาทของตัวเองเปลี่ยนไม่ได้ — ให้ผู้ดูแลระบบคนอื่นเปลี่ยนให้' : 'เปลี่ยนบทบาทมีผลกับคำขอถัดไปทันที',
      fields: html`${field('name', 'ชื่อ-สกุล', html`<input class="input" name="name" />`, { required: true })}
        ${field('role', 'บทบาท', roleSelect(isMe(u)), { required: true })}
        ${field('empCode', 'รหัสพนักงาน', html`<input class="input" name="empCode" />`)}`,
      values: { name: u.name, role: u.role, empCode: u.empCode },
      save: async (v) => {
        const patch = { name: v.name, empCode: v.empCode };
        if (!isMe(u)) patch.role = v.role;
        await adminApi.updateUser(u.id, patch);
        toast.success('บันทึกแล้ว');
        await loadUsers();
      },
    });
  }
  if (act === 'password') {
    return formModal({
      title: `ตั้งรหัสผ่านใหม่ให้ ${u.username}`,
      description: `${u.name} จะออกจากระบบทุกอุปกรณ์ แล้วต้องเข้าด้วยรหัสใหม่`,
      fields: field('password', 'รหัสผ่านใหม่', passwordInput(), { required: true, hint: 'คัดลอกไว้ก่อนกดบันทึก — ระบบไม่เก็บรหัสที่อ่านได้' }),
      values: { password: randomPassword() },
      okLabel: 'ตั้งรหัสผ่าน',
      save: async (v) => {
        await adminApi.resetPassword(u.id, v.password);
        toast.success(`ตั้งรหัสผ่านใหม่ให้ ${u.username} แล้ว`);
        await loadUsers();
      },
    });
  }
  if (act === 'signout') {
    if (await confirmAction({
      title: `ให้ ${u.username} ออกจากระบบทุกอุปกรณ์?`,
      description: 'เพิกถอนทุก session และ “จดจำฉัน” — ผู้ใช้ต้องเข้าสู่ระบบใหม่ด้วยรหัสผ่าน',
      confirmLabel: 'ออกจากระบบทุกอุปกรณ์',
      successMessage: 'เพิกถอนแล้ว',
      action: () => adminApi.signOutEverywhere(u.id),
    })) reloadAccessToo();
  }
  if (act === 'toggle') {
    if (await confirmAction({
      title: u.isActive ? `ปิดบัญชี ${u.username}?` : `เปิดใช้บัญชี ${u.username}?`,
      description: u.isActive ? 'ผู้ใช้จะหลุดจากทุกอุปกรณ์ทันทีและเข้าสู่ระบบไม่ได้ (ประวัติยังอยู่ครบ)' : 'ผู้ใช้เข้าสู่ระบบด้วยรหัสผ่านเดิมได้อีกครั้ง',
      confirmLabel: u.isActive ? 'ปิดบัญชี' : 'เปิดใช้',
      danger: u.isActive,
      successMessage: u.isActive ? 'ปิดบัญชีแล้ว' : 'เปิดใช้บัญชีแล้ว',
      action: () => adminApi.updateUser(u.id, { isActive: !u.isActive }),
    })) reloadAccessToo();
  }
});

/** เปลี่ยนผู้ใช้แล้ว session/อุปกรณ์เปลี่ยนตาม */
function reloadAccessToo() {
  loaded.delete('access');
  loadUsers().catch((e) => toast.error(errorMessage(e)));
}

// ===================== การเข้าสู่ระบบ =====================
const sessions = new DataTable($('#sessions'), {
  rowKey: (s) => s.id,
  pageSize: 10,
  exportName: 'session ที่ใช้งานอยู่',
  columns: [
    { key: 'user', header: 'ผู้ใช้', text: (s) => `${s.name} ${s.username}`, cell: (s) => html`${userCell(s)}${s.current ? html` ${badge('เครื่องนี้', 'primary')}` : ''}` },
    { key: 'ip', header: 'IP', cell: (s) => html`<span class="num">${s.ip}</span>` },
    { key: 'device', header: 'เบราว์เซอร์', text: (s) => device(s.userAgent), cell: (s) => html`<span title="${s.userAgent}">${device(s.userAgent)}</span>` },
    { key: 'seen', header: 'ใช้งานล่าสุด', sort: (s) => s.lastSeenAt, text: (s) => when(s.lastSeenAt), cell: (s) => ago(s.lastSeenAt) },
    { key: 'start', header: 'เริ่ม', hideOnMobile: true, sort: (s) => s.createdAt, text: (s) => when(s.createdAt), cell: (s) => ago(s.createdAt) },
    { key: 'exp', header: 'หมดอายุสูงสุด', hideOnMobile: true, sort: (s) => s.expiresAt, text: (s) => when(s.expiresAt), cell: (s) => when(s.expiresAt) },
    {
      key: 'actions',
      header: '',
      filter: false,
      cell: (s) => (s.current ? '' : html`<button class="btn btn-ghost btn-sm" data-session="${s.id}">${raw(icon('user-minus'))} จบ session</button>`),
    },
  ],
  empty: emptyState({ iconName: 'log-in', title: 'ไม่มี session ที่ใช้งานอยู่' }),
});

const devices = new DataTable($('#devices'), {
  rowKey: (d) => d.familyId,
  pageSize: 10,
  exportName: 'อุปกรณ์ที่จดจำ',
  columns: [
    { key: 'user', header: 'ผู้ใช้', text: (d) => `${d.name} ${d.username}`, cell: userCell },
    { key: 'ip', header: 'IP ล่าสุด', cell: (d) => html`<span class="num">${d.ip}</span>` },
    { key: 'device', header: 'เบราว์เซอร์', text: (d) => device(d.userAgent), cell: (d) => html`<span title="${d.userAgent}">${device(d.userAgent)}</span>` },
    { key: 'used', header: 'ใช้ล่าสุด', sort: (d) => d.lastUsedAt, text: (d) => when(d.lastUsedAt), cell: (d) => ago(d.lastUsedAt) },
    { key: 'first', header: 'จดจำตั้งแต่', hideOnMobile: true, sort: (d) => d.firstAt, text: (d) => when(d.firstAt), cell: (d) => when(d.firstAt) },
    { key: 'exp', header: 'หมดอายุ', hideOnMobile: true, sort: (d) => d.expiresAt, text: (d) => when(d.expiresAt), cell: (d) => when(d.expiresAt) },
    { key: 'actions', header: '', filter: false, cell: (d) => html`<button class="btn btn-ghost btn-sm" data-device="${d.familyId}">${raw(icon('user-minus'))} เลิกจดจำ</button>` },
  ],
  empty: emptyState({ iconName: 'lock', title: 'ไม่มีอุปกรณ์ที่จดจำไว้' }),
});

const attempts = new DataTable($('#attempts'), {
  rowKey: (a) => a.id,
  pageSize: 25,
  exportName: 'ประวัติการเข้าสู่ระบบ',
  columns: [
    { key: 'at', header: 'เวลา', sort: (a) => a.at, text: (a) => when(a.at), cell: (a) => ago(a.at) },
    { key: 'username', header: 'ชื่อผู้ใช้ที่กรอก', cell: (a) => html`${a.username}${a.knownUser ? '' : html` <span class="small muted">(ไม่มีบัญชีนี้)</span>`}` },
    { key: 'ip', header: 'IP', cell: (a) => html`<span class="num">${a.ip}</span>` },
    {
      key: 'result',
      header: 'ผล',
      text: (a) => (a.succeeded ? 'สำเร็จ' : a.cleared ? 'ไม่สำเร็จ (ปลดล็อกแล้ว)' : 'ไม่สำเร็จ'),
      cell: (a) => (a.succeeded ? badge('สำเร็จ', 'success') : badge(a.cleared ? 'ผิด · ปลดล็อกแล้ว' : 'ผิด', a.cleared ? 'neutral' : 'danger')),
    },
  ],
  empty: emptyState({ iconName: 'history', title: 'ไม่มีประวัติ' }),
});

function drawLockouts(list) {
  state.counts.locks = list.length;
  if (!list.length) return render($('#lockouts'), alertBox({ tone: 'success', title: 'ไม่มีบัญชีหรือ IP ที่ถูกล็อก' }));
  render(
    $('#lockouts'),
    alertBox({
      tone: 'danger',
      title: `ถูกล็อกจากการกรอกรหัสผิด ${list.length} รายการ`,
      body: html`<ul class="stack" style="gap:6px;margin-top:8px;padding:0;list-style:none">
        ${list.map(
          (l) => html`<li class="row" style="gap:8px;flex-wrap:wrap">
            ${badge(l.kind === 'USER' ? 'ชื่อผู้ใช้' : 'IP', l.kind === 'USER' ? 'warning' : 'info')}
            <b class="num">${l.key}</b>
            <span class="small">ผิด ${l.fails} ครั้ง · ล่าสุด ${timeAgo(l.lastAt)} · ปลดเองไม่เกิน ${thaiDateTime(l.untilAt)}</span>
            <button class="btn btn-sm" data-unlock-kind="${l.kind}" data-unlock-key="${l.key}">${raw(icon('shield-check'))} ปลดล็อก</button>
          </li>`,
        )}
      </ul>`,
    }),
  );
}

async function loadAccess() {
  render($('#lockouts'), skeletonLines(2));
  const [s, a] = await Promise.all([adminApi.listSessions(), adminApi.listLoginAttempts($('#attempt-result').value)]);
  sessions.setRows(s.sessions);
  devices.setRows(s.devices);
  attempts.setRows(a.attempts);
  const p = a.policy;
  render($('#policy'), `ล่าสุด ${int(a.attempts.length)} ครั้ง · ล็อกเมื่อผิด ${p.maxFailsPerUser} ครั้งต่อชื่อผู้ใช้ หรือ ${p.maxFailsPerIp} ครั้งต่อ IP ภายใน ${p.windowMinutes} นาที`);
  drawLockouts(a.lockouts);
  drawTabs();
}

$('#attempt-result').addEventListener('change', () => load('access', true));

on($('#lockouts'), 'click', '[data-unlock-kind]', async (_e, b) => {
  const { unlockKind: kind, unlockKey: key } = b.dataset;
  if (await confirmAction({
    title: `ปลดล็อก ${kind === 'USER' ? 'ชื่อผู้ใช้' : 'IP'} ${key}?`,
    description: 'ครั้งที่ผิดในช่วงล็อกจะไม่ถูกนับ (ยังเก็บในประวัติ) — ถ้าไม่แน่ใจว่าเป็นเจ้าของบัญชี ให้ตั้งรหัสผ่านใหม่แทน',
    confirmLabel: 'ปลดล็อก',
    danger: false,
    successMessage: 'ปลดล็อกแล้ว',
    action: () => adminApi.clearLockout(kind, key),
  })) {
    loaded.delete('users');
    load('access', true);
  }
});

on($('#sessions'), 'click', '[data-session]', async (_e, b) => {
  if (await confirmAction({
    title: 'จบ session นี้?',
    description: 'ถ้าเครื่องนั้นเลือก “จดจำฉัน” ไว้ จะเข้าใหม่ได้เองโดยไม่ต้องกรอกรหัส — ใช้ “เลิกจดจำ” หรือ “ออกจากระบบทุกอุปกรณ์” เพื่อบังคับ',
    confirmLabel: 'จบ session',
    successMessage: 'จบ session แล้ว',
    action: () => adminApi.revokeSession(b.dataset.session),
  })) load('access', true);
});

on($('#devices'), 'click', '[data-device]', async (_e, b) => {
  if (await confirmAction({
    title: 'เลิกจดจำอุปกรณ์นี้?',
    description: 'เมื่อ session ปัจจุบันหมด เครื่องนั้นต้องกรอกรหัสผ่านใหม่',
    confirmLabel: 'เลิกจดจำ',
    successMessage: 'เลิกจดจำแล้ว',
    action: () => adminApi.revokeDevice(b.dataset.device),
  })) load('access', true);
});

// ===================== สถานะระบบ =====================
const CHECK_TONE = { ok: 'success', warn: 'warning', error: 'danger' };
const CHECK_ICON = { ok: 'circle-check', warn: 'alert-triangle', error: 'alert-octagon' };
const STAGE_LABEL = { REQUESTED: 'รอคลังจ่าย', ISSUED: 'จ่ายแล้ว รอเซ็นรับ', RECEIVED: 'เซ็นรับแล้ว' };

const stuck = new DataTable($('#stuck'), {
  rowKey: (s) => s.id,
  pageSize: 10,
  exportName: 'ใบเบิกค้าง',
  columns: [
    { key: 'doc', header: 'ใบเบิก', cell: (s) => html`<b class="num">${s.docNo ?? '–'}</b>` },
    {
      key: 'emp',
      header: 'พนักงาน',
      text: (s) => `${s.empCode} ${s.employeeName}`,
      cell: (s) => html`<a class="two-line" href="employee.html?id=${s.employeeId}"><b>${s.employeeName}</b><span class="sub">${s.empCode} · ${s.entitlementKey}</span></a>`,
    },
    { key: 'stage', header: 'ขั้น', text: (s) => STAGE_LABEL[s.stage], cell: (s) => badge(STAGE_LABEL[s.stage], s.stage === 'ISSUED' ? 'info' : 'warning') },
    { key: 'days', header: 'ค้างมา', align: 'right', sort: (s) => s.days, text: (s) => `${s.days} วัน`, cell: (s) => html`<span class="num">${s.days} วัน</span><span class="sub"> ตั้งแต่ ${thaiDate(s.since)}</span>` },
    { key: 'by', header: 'ผู้ขอเบิก', hideOnMobile: true, cell: (s) => s.requestedBy },
  ],
  empty: emptyState({ iconName: 'package-check', title: 'ไม่มีใบเบิกค้าง' }),
});

function drawHealth(h) {
  const errors = h.checks.filter((c) => c.status === 'error').length;
  state.counts.errors = errors;
  state.counts.problems = errors + h.checks.filter((c) => c.status === 'warn').length;
  render(
    $('#checks'),
    html`${h.checks.map(
      (c) => html`<section class="card"><div class="card-body row" style="align-items:flex-start;gap:12px">
        <span class="card-icon tone-${CHECK_TONE[c.status]}">${raw(icon(CHECK_ICON[c.status]))}</span>
        <div style="min-width:0"><b>${c.label}</b><p class="small muted" style="margin:2px 0 0;overflow-wrap:anywhere">${c.detail}</p></div>
      </div></section>`,
    )}`,
  );

  const st = h.stock;
  render($('#stock-note'), `ใบที่ค้างอยู่ในขั้นเดิมเกิน ${st.stuckDays} วัน — ตามคลัง หรือกด “ดึงสถานะจากสต็อก” ที่หน้าชุดฟอร์ม`);
  render(
    $('#stages'),
    html`<div class="row" style="gap:8px;flex-wrap:wrap">
      ${Object.entries(STAGE_LABEL).map(([k, label]) => badge(`${label} ${int(st.byStage[k] ?? 0)}`, k === 'RECEIVED' ? 'success' : k === 'ISSUED' ? 'info' : 'warning', { lg: true }))}
    </div>`,
  );
  stuck.setRows(st.stuck);

  const c = h.cleanup;
  const e = c.eligible;
  render(
    $('#cleanup'),
    html`${infoList(
        [
          { label: 'session', value: int(e.sessions) },
          { label: 'refresh token', value: int(e.tokens) },
          { label: 'ประวัติเข้าสู่ระบบ', value: int(e.attempts) },
        ],
        3,
      )}
      <p class="small muted">ที่เก่ากว่า ${c.days} วัน (หมดอายุ / ถูกเพิกถอนแล้ว) · ครั้งล่าสุด:
        ${c.lastRunAt ? html`${thaiDateTime(c.lastRunAt)} โดย ${c.lastRunBy}` : 'ยังไม่เคยล้าง'}</p>
      <div class="row" style="gap:8px">
        <label class="row small">เก่ากว่า <input class="input num" type="number" id="cleanup-days" min="${c.minDays}" max="3650" value="${c.days}" style="width:90px" /> วัน</label>
        <button class="btn btn-sm" id="cleanup-btn" ${e.sessions + e.tokens + e.attempts ? '' : 'disabled'}>${raw(icon('trash-2'))} ล้างตอนนี้</button>
      </div>`,
  );

  const i = h.info;
  render(
    $('#info'),
    html`${infoList(
        [
          { label: 'PHP', value: i.php },
          { label: 'MySQL', value: i.mysql },
          { label: 'ฐานข้อมูล', value: i.db },
          { label: 'เวลาเซิร์ฟเวอร์', value: `${thaiDateTime(i.serverTime)} (${i.timezone})` },
          { label: 'session ไม่ใช้งาน', value: `${i.sessionIdleMinutes} นาที` },
          { label: 'session สูงสุด', value: `${i.sessionAbsoluteHours} ชม.` },
          { label: 'จดจำฉัน', value: `${i.refreshDays} วัน` },
          { label: 'วันนี้ของระบบ', value: thaiDate(i.today) },
        ],
        2,
      )}
      <table class="table mt" style="width:100%">
        <thead><tr><th>ตาราง</th><th style="text-align:right">แถว</th></tr></thead>
        <tbody>${h.tables.map((t) => html`<tr><td class="num">${t.name}</td><td class="num" style="text-align:right">${int(t.rows)}</td></tr>`)}</tbody>
      </table>`,
  );
  drawTabs();
}

async function loadHealth() {
  render($('#checks'), skeletonCards(6));
  drawHealth(await adminApi.getHealth());
}

on($('#cleanup'), 'click', '#cleanup-btn', async () => {
  const days = Number($('#cleanup-days').value);
  await confirmAction({
    title: `ล้างข้อมูลเก่ากว่า ${days} วัน?`,
    description: 'ลบ session / refresh token ที่ใช้ไม่ได้แล้ว และประวัติเข้าสู่ระบบเก่า — ไม่กระทบผู้ที่ใช้งานอยู่ และไม่ลบบันทึกการใช้งาน',
    confirmLabel: 'ล้างข้อมูล',
    action: async () => {
      const r = await adminApi.cleanup(days);
      toast.success(`ลบแล้ว: session ${r.sessions} · token ${r.tokens} · ประวัติ ${r.attempts}`);
    },
  });
  load('health', true);
});

// ===================== ตั้งค่าระบบ =====================
// ค่าในตาราง system_settings ทับ backend/config.php · กุญแจสต็อกไม่ถูกส่งกลับมา (เห็นแค่ 4 ตัวท้าย)
const cfg = { data: null, tested: null };
const allItems = () => cfg.data.groups.flatMap((g) => g.items);
const itemOf = (key) => allItems().find((i) => i.key === key);
const sourceBadge = (it) => (it.source === 'db' ? badge('ตั้งจากหน้านี้', 'primary', { dot: false }) : badge('config.php', 'neutral', { dot: false }));

function settingHint(it, base) {
  return html`${it.hint ? `${it.hint} · ` : ''}${base}${it.source === 'db' && it.updatedBy ? ` · แก้ล่าสุดโดย ${it.updatedBy} ${timeAgo(it.updatedAt)}` : ''}
    ${it.source === 'db' ? html` · <a href="#" data-reset="${it.key}">ใช้ค่าใน config.php</a>` : ''}`;
}

function intField(it) {
  return html`<div class="field" data-field="${it.key}">
    <label>${it.label} ${sourceBadge(it)}</label>
    <span class="row" style="gap:6px">
      <input class="input num" type="number" name="${it.key}" min="${it.min}" max="${it.max}" value="${it.value}" style="width:110px" ${cfg.data.ready ? '' : 'disabled'} />
      <span class="small muted">${it.unit}</span>
    </span>
    <span class="hint">${settingHint(it, `${it.min}–${it.max} · config.php = ${it.base} ${it.unit}`)}</span>
    <span class="error"></span>
  </div>`;
}

const saveButton = (label = 'บันทึก') =>
  html`<div class="row" style="gap:8px;justify-content:flex-end;margin-top:12px">
    <button type="submit" class="btn btn-primary btn-sm" data-label="${label}" ${cfg.data.ready ? '' : 'disabled'}>${raw(icon('save'))} ${label}</button>
  </div>`;

function groupForm(key) {
  const g = cfg.data.groups.find((x) => x.key === key);
  return html`<form class="form-grid" style="grid-template-columns:1fr" data-settings novalidate>${g.items.map(intField)}${saveButton()}</form>`;
}

function secretText(s) {
  return s.set ? `ตั้งแล้ว · ${s.length} ตัว${s.last4 ? ` · ลงท้าย …${s.last4}` : ''}` : 'ยังไม่ได้ตั้ง';
}

function stockForm() {
  const url = itemOf('stock_api_url');
  const sec = itemOf('stock_api_secret');
  const off = cfg.data.ready ? '' : 'disabled';
  return html`<form class="form-grid" data-settings data-stock novalidate>
    <div class="field full" data-field="stock_api_url">
      <label>${url.label} ${sourceBadge(url)}</label>
      <input class="input" type="url" name="stock_api_url" value="${url.value}" spellcheck="false" ${off} />
      <span class="hint">${settingHint(url, `config.php = ${url.base || '(ว่าง)'}`)}</span>
      <span class="error"></span>
    </div>
    <div class="field full" data-field="stock_api_secret">
      <label>${sec.label} ${sourceBadge(sec)}</label>
      <span class="row" style="gap:8px;flex-wrap:wrap">
        ${badge(secretText(sec.secret), sec.secret.set ? 'success' : 'danger')}
        <button type="button" class="btn btn-sm" data-secret-edit ${off}>${raw(icon('lock'))} เปลี่ยนกุญแจ</button>
      </span>
      <span class="row hidden" style="gap:6px;margin-top:8px" data-secret-box>
        <input class="input" name="stock_api_secret" type="text" autocomplete="off" spellcheck="false" placeholder="ว่าง = ใช้กุญแจเดิม"
          style="font-family:var(--font-mono, monospace)" />
        <button type="button" class="btn btn-sm" data-secret-gen>สุ่ม</button>
        <button type="button" class="btn btn-sm" data-secret-copy>คัดลอก</button>
      </span>
      <span class="hint">${settingHint(sec, `config.php: ${secretText(sec.baseSecret)}`)} · เปลี่ยนแล้วต้องใส่ค่าเดียวกันใน stock_hr ก่อน แล้วกด “ทดสอบ” ให้ผ่านก่อนบันทึก</span>
      <span class="error"></span>
    </div>
    ${intField(itemOf('stock_connect_timeout'))}
    ${intField(itemOf('stock_timeout'))}
    <div class="full" id="stock-test-result"></div>
    <div class="row full" style="gap:8px;justify-content:flex-end">
      <button type="button" class="btn btn-sm" data-stock-test data-label="ทดสอบการเชื่อมต่อ">${raw(icon('zap'))} ทดสอบการเชื่อมต่อ</button>
      <button type="submit" class="btn btn-primary btn-sm" data-label="บันทึก" ${off}>${raw(icon('save'))} บันทึก</button>
    </div>
  </form>`;
}

function drawSettings(d) {
  cfg.data = d;
  render(
    $('#settings-alert'),
    d.ready ? '' : html`<div class="mb">${alertBox({ tone: 'warning', title: 'ยังไม่ได้รัน migration 006_system_settings.sql', body: 'ตอนนี้แสดงค่าจาก backend/config.php อย่างเดียว — รัน migration แล้วจึงแก้จากหน้านี้ได้' })}</div>`,
  );
  render($('#stock-settings'), stockForm());
  render($('#auth-settings'), groupForm('auth'));
  render($('#monitor-settings'), groupForm('monitor'));
  render($('#fixed-settings'), infoList(d.fixed.map((f) => ({ label: f.label, value: html`<span class="num">${f.value}</span>` })), 2));
}

async function loadSettings() {
  render($('#stock-settings'), skeletonLines(4));
  drawSettings(await adminApi.getSettings());
}

/** ค่าในฟอร์มที่ต่างจากที่บันทึกไว้ (กุญแจ: ส่งเฉพาะเมื่อกรอก) */
function changedValues(form) {
  const values = {};
  for (const el of form.querySelectorAll('[name]')) {
    const it = itemOf(el.name);
    if (!it) continue;
    const v = el.value.trim();
    if (it.type === 'secret') {
      if (v) values[it.key] = v;
    } else if (v !== String(it.value)) values[it.key] = v;
  }
  return values;
}

function showFieldErrors(root, details = {}) {
  root.querySelectorAll('.field').forEach((f) => {
    const e = f.querySelector('.error');
    if (e) e.textContent = details[f.dataset.field] ?? '';
    f.querySelector('.input')?.toggleAttribute('aria-invalid', !!details[f.dataset.field]);
  });
}

const testKey = (url, secret) => `${url}\n${secret}`;

async function saveSettingsForm(form) {
  const values = changedValues(form);
  if (!Object.keys(values).length) return toast.success('ไม่มีค่าที่เปลี่ยน');
  const stockChanged = 'stock_api_url' in values || 'stock_api_secret' in values;
  const key = testKey(form.elements.stock_api_url?.value.trim() ?? '', form.elements.stock_api_secret?.value.trim() ?? '');
  if (stockChanged && cfg.tested !== key) {
    const go = await confirmAction({
      title: 'บันทึกโดยยังไม่ได้ทดสอบ?',
      description: 'ถ้า URL หรือกุญแจไม่ตรงกับ stock_hr การส่งเบิก/ดึงสถานะชุดฟอร์มจะใช้ไม่ได้จนกว่าจะแก้ — แนะนำกด “ทดสอบการเชื่อมต่อ” ให้ผ่านก่อน',
      confirmLabel: 'บันทึกเลย',
      action: async () => {},
    });
    if (!go) return;
  }
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, async () => {
      const d = await adminApi.saveSettings(values);
      toast.success(`บันทึกแล้ว ${d.changed} ค่า`);
      drawSettings(d);
    });
    loaded.delete('health');
  } catch (e) {
    showFieldErrors(form, e?.details);
    toast.error(e?.details ? Object.values(e.details)[0] : errorMessage(e));
  }
}

on($('#tab-settings'), 'submit', 'form[data-settings]', (e, form) => {
  e.preventDefault();
  saveSettingsForm(form);
});

on($('#tab-settings'), 'click', '[data-reset]', async (e, a) => {
  e.preventDefault();
  const it = itemOf(a.dataset.reset);
  if (await confirmAction({
    title: `ใช้ค่าใน config.php สำหรับ “${it.label}”?`,
    description: it.type === 'secret' ? `กุญแจใน config.php: ${secretText(it.baseSecret)} — ต้องตรงกับ stock_hr ด้วย` : `ค่าจะเป็น ${it.base || '(ว่าง)'} ${it.unit}`,
    confirmLabel: 'ใช้ค่าใน config.php',
    danger: it.type === 'secret',
    successMessage: 'คืนค่าแล้ว',
    action: async () => drawSettings(await adminApi.saveSettings({}, [it.key])),
  })) loaded.delete('health');
});

on($('#tab-settings'), 'click', '[data-secret-edit]', (_e, b) => {
  const box = b.closest('.field').querySelector('[data-secret-box]');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) box.querySelector('input').focus();
});

on($('#tab-settings'), 'click', '[data-secret-gen]', (_e, b) => {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  b.closest('[data-secret-box]').querySelector('input').value = [...buf].map((n) => n.toString(16).padStart(2, '0')).join('');
});

on($('#tab-settings'), 'click', '[data-secret-copy]', async (_e, b) => {
  const v = b.closest('[data-secret-box]').querySelector('input').value;
  if (!v) return toast.error('ยังไม่มีกุญแจใหม่ให้คัดลอก');
  try {
    await navigator.clipboard.writeText(v);
    toast.success('คัดลอกกุญแจแล้ว — นำไปใส่ใน stock_hr/config_ctrl/welfare_key.php');
  } catch {
    toast.error('คัดลอกไม่ได้ — เลือกข้อความแล้วคัดลอกเอง');
  }
});

on($('#tab-settings'), 'click', '[data-stock-test]', async (_e, b) => {
  const form = b.closest('form');
  const url = form.elements.stock_api_url.value.trim();
  const secret = form.elements.stock_api_secret.value.trim();
  showFieldErrors(form);
  try {
    await busy(b, async () => {
      const r = await adminApi.testStock({ url, secret });
      cfg.tested = r.ok ? testKey(url, secret) : null;
      render(
        $('#stock-test-result'),
        alertBox({
          tone: r.ok ? (r.status === 'warn' ? 'warning' : 'success') : 'danger',
          title: r.ok ? 'เชื่อมต่อสต็อก Uniform ได้' : 'เชื่อมต่อสต็อก Uniform ไม่ได้',
          body: `${r.detail} · ${r.url || '(ไม่มี URL)'} · ${r.usedSavedSecret ? 'กุญแจที่บันทึกไว้' : 'กุญแจใหม่ (ยังไม่บันทึก)'}`,
        }),
      );
    });
  } catch (e) {
    showFieldErrors(form, e?.details);
    toast.error(e?.details ? Object.values(e.details)[0] : errorMessage(e));
  }
});

// ===================== บันทึกการใช้งาน =====================
const audit = new DataTable($('#audit'), {
  rowKey: (a) => a.id,
  pageSize: 50,
  exportName: 'บันทึกการใช้งาน',
  columns: [
    { key: 'at', header: 'เวลา', sort: (a) => a.at, text: (a) => when(a.at), cell: (a) => html`<span class="num" title="${a.at.replace('T', ' ')}">${when(a.at)}</span>` },
    {
      key: 'entity',
      header: 'ประเภท',
      text: (a) => ACTIVITY_ENTITY_LABEL[a.entity] ?? a.entity,
      cell: (a) => html`<span class="row" style="gap:4px">${raw(icon(ENTITY_ICON[a.entity] ?? 'activity'))} ${ACTIVITY_ENTITY_LABEL[a.entity] ?? a.entity}</span>`,
    },
    {
      key: 'action',
      header: 'การกระทำ',
      text: (a) => activityAction(a.action).label,
      cell: (a) => {
        const act = activityAction(a.action);
        return badge(act.label, act.tone);
      },
    },
    {
      key: 'summary',
      header: 'รายละเอียด',
      text: (a) => a.summary,
      cell: (a) => (a.employeeId ? html`<a href="employee.html?id=${a.employeeId}">${a.summary}</a>` : a.summary),
    },
    { key: 'user', header: 'ผู้ทำรายการ', cell: (a) => a.user },
    { key: 'ref', header: 'อ้างอิง', hideOnMobile: true, text: (a) => a.entityId, cell: (a) => html`<span class="num small">${a.entityId}</span>` },
  ],
  empty: emptyState({ iconName: 'history', title: 'ไม่พบรายการตามตัวกรอง' }),
});

let facetsDrawn = false;
function drawFacets(f) {
  if (facetsDrawn) return;
  facetsDrawn = true;
  const form = $('#audit-filters');
  const opts = (all, list, label) => html`<option value="">${all}</option>${list.map((v) => html`<option value="${v}">${label(v)}</option>`)}`;
  render(form.elements.entity, opts('ทุกประเภท', f.entities, (v) => ACTIVITY_ENTITY_LABEL[v] ?? v));
  render(form.elements.action, opts('ทุกการกระทำ', f.actions, (v) => activityAction(v).label || v));
  render(form.elements.user, opts('ทุกคน', f.users, (v) => v));
  for (const k of ['entity', 'action', 'user', 'q', 'from', 'to']) form.elements[k].value = getParam(k);
}

async function loadAudit() {
  const form = $('#audit-filters');
  const filter = facetsDrawn ? Object.fromEntries(new FormData(form)) : Object.fromEntries(['entity', 'action', 'user', 'q', 'from', 'to'].map((k) => [k, getParam(k)]));
  const d = await adminApi.listAudit(filter);
  drawFacets(d.facets);
  audit.setRows(d.rows);
  render($('#audit-count'), d.total > d.rows.length ? `แสดง ${int(d.rows.length)} รายการล่าสุดจาก ${int(d.total)}` : `${int(d.total)} รายการ`);
}

const reloadAudit = debounce(() => {
  const v = Object.fromEntries(new FormData($('#audit-filters')));
  setParams(v);
  load('audit', true);
}, 300);
$('#audit-filters').addEventListener('input', reloadAudit);
$('#audit-filters').addEventListener('submit', (e) => e.preventDefault());

// ===================== เริ่ม =====================
if (!adminApi) blocked('หน้านี้ใช้ได้เมื่อเชื่อมต่อ PHP backend (apiMode: http)');
else if (me?.roleCode && me.roleCode !== 'SUPER_ADMIN') blocked('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ');
else {
  drawTabs();
  await load(tab);
  // ตัวนับบนแท็บอื่น (ล็อก / ปัญหาระบบ) — โหลดเบื้องหลังหลังแท็บแรกเสร็จ
  for (const t of ['users', 'access', 'health']) if (t !== tab) load(t);
}
