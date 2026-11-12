// หน้า: ผู้ดูแลระบบ (admin.html?tab=…) — 3 เมนูในหัวข้อ "ผู้ดูแลระบบ" ของ sidebar
//   ผู้ใช้ระบบ (users.manage)       = สร้าง / แก้ชื่อ-บทบาท-รหัสพนักงาน / ปิด-เปิดบัญชี / ตั้งรหัสผ่านใหม่ / ออกจากระบบทุกอุปกรณ์
//   กำหนดสิทธิ์การใช้งาน (SUPER_ADMIN) = ตารางบทบาท × สิทธิ์ (เห็นหน้า / ทำรายการ)
//   ระบบ & ความปลอดภัย — แท็บที่มีสิทธิ์:
//     การเข้าสู่ระบบ (security.view) = ที่ถูกล็อก (ปลดล็อก) · session · อุปกรณ์ที่จดจำ · ประวัติ login
//     สถานะระบบ (system.health)      = DB / migration / ค่าตั้ง / ping สต็อก Uniform · ใบเบิกค้าง · ล้างข้อมูลเก่า
//     ตั้งค่าระบบ (system.settings)  = URL/กุญแจ/เวลารอ ของสต็อก Uniform (ทดสอบก่อนบันทึก) · การเข้าสู่ระบบ · เกณฑ์ติดตาม
//     บันทึกการใช้งาน (audit.view)   = audit_log ทุก entity (รวม USER / STOCK_REQUEST / SYSTEM)
// เซิร์ฟเวอร์ตรวจสิทธิ์ทุก endpoint (backend/api/admin.php) · บัญชี SUPER_ADMIN แก้ได้เฉพาะ SUPER_ADMIN (ปุ่มซ่อน + 403 PROTECTED)
import { adminApi } from '../app/api.js';
import { can, getSession } from '../app/auth.js';
import { initPage } from '../app/shell.js';
import { exposeForTour, startTourIfNew } from '../app/tour.js';
import { $, debounce, getParam, html, on, raw, render, setParams } from '../shared/dom.js';
import { clock, int, thaiDate, thaiDateTime, timeAgo } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { ACTIVITY_ENTITY_LABEL } from '../shared/labels.js';
import { alertBox, badge, emptyState, infoList, skeletonLines, tabs } from '../ui/components.js';
import { busy } from '../ui/loading.js';
import { confirmAction, errorMessage, openModal, toast } from '../ui/overlay.js';
import { ExcelGrid } from '../ui/datagrid.js';
import { DataTable } from '../ui/table.js';
import { activityAction, ENTITY_ICON } from './_shared.js';

const me = getSession();
const isSuper = me?.roleCode === 'SUPER_ADMIN';

/** แท็บ → สิทธิ์ที่ต้องมี */
const TAB_CAN = {
  users: () => can('users.manage'),
  permissions: () => isSuper,
  access: () => can('security.view'),
  health: () => can('system.health'),
  settings: () => can('system.settings'),
  audit: () => can('audit.view'),
};
const TAB_LABEL = { access: 'การเข้าสู่ระบบ', health: 'สถานะระบบ', settings: 'ตั้งค่าระบบ', audit: 'บันทึกการใช้งาน' };
/** เมนู sidebar (id ใน app/shell.js) → แท็บในหน้านี้ */
const GROUPS = {
  users: { nav: 'admin-users', title: 'ผู้ใช้ระบบ', subtitle: 'เพิ่ม · แก้ไข · ปิดบัญชี · ตั้งรหัสผ่านใหม่ · ออกจากระบบทุกอุปกรณ์', tabs: ['users'] },
  permissions: {
    nav: 'admin-permissions',
    title: 'กำหนดสิทธิ์การใช้งาน',
    subtitle: 'บทบาทไหนเห็นเมนูใด และทำรายการอะไรได้บ้าง — เมนูและปุ่มที่ไม่มีสิทธิ์จะถูกซ่อน',
    tabs: ['permissions'],
  },
  system: {
    nav: 'admin-system',
    title: 'ระบบ & ความปลอดภัย',
    subtitle: 'การเข้าสู่ระบบ · สถานะระบบ · ตั้งค่าระบบ · บันทึกการใช้งาน',
    tabs: ['access', 'health', 'settings', 'audit'],
  },
};
const ALL_TABS = Object.values(GROUPS).flatMap((g) => g.tabs);
const groupKeyOf = (t) => Object.keys(GROUPS).find((k) => GROUPS[k].tabs.includes(t));

// ?tab= ชื่อแท็บ หรือ system (= แท็บแรกที่มีสิทธิ์) · ไม่มีสิทธิ์แท็บที่ขอ → แท็บอื่นในเมนูเดียวกัน
const asked = getParam('tab') || 'users';
const group = GROUPS[groupKeyOf(asked) ?? (GROUPS[asked] ? asked : 'users')];
let tab = TAB_CAN[asked]?.() ? asked : (group.tabs.find((t) => TAB_CAN[t]()) ?? group.tabs[0]);
initPage(group.nav, { tour: () => `admin-${tab}` }); // ไม่มีสิทธิ์เมนูนี้เลย → shell พาไปหน้าที่เปิดได้ · แนะนำการใช้งานต่อแท็บ (tour/guides.js)

render($('#title'), group.title);
render($('#subtitle'), group.subtitle);
document.title = `${group.title} · HL Welfare`;
const loaded = new Set();
const state = { roles: [], companies: [], counts: {} };

const ago = (s) => (s ? html`<time datetime="${s}" title="${thaiDateTime(s)}">${timeAgo(s)}</time>` : html`<span class="muted">–</span>`);
const when = (s) => (s ? thaiDateTime(s) : '–');
const userCell = (r) => html`<span class="two-line"><b>${r.name}</b><span class="sub">${r.username} · ${r.roleLabel}</span></span>`;
/** รหัสผ่านตั้งต้นที่ผู้ดูแลตั้ง/รีเซ็ตให้ (= AUTH_DEFAULT_PASSWORD ใน backend/auth.php) — ผู้ใช้ถูกบังคับเปลี่ยนเองตอนเข้าสู่ระบบ */
const DEFAULT_PASSWORD = '4123';

/** บัญชี SUPER_ADMIN — คนที่ไม่ใช่ SUPER_ADMIN แตะไม่ได้ */
const isProtected = (role) => role === 'SUPER_ADMIN' && !isSuper;
const protectedMark = () => html`<span class="small muted row" style="gap:4px" title="บัญชีผู้ดูแลระบบสูงสุด แก้ไขได้เฉพาะผู้ดูแลระบบสูงสุด">${raw(icon('lock'))} ป้องกัน</span>`;

/** Mozilla/5.0 (Windows NT 10.0; …) Chrome/141 … → "Chrome · Windows" */
function device(ua) {
  if (!ua) return '–';
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'อื่น ๆ';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} · ${os}` : b;
}

// ===================== แท็บ (เฉพาะเมนูระบบ & ความปลอดภัย ที่มีหลายแท็บ) =====================
function drawTabs() {
  const c = state.counts;
  const COUNT = {
    access: { count: c.locks || undefined, tone: 'danger' },
    health: { count: c.problems || undefined, tone: c.errors ? 'danger' : 'warning' },
  };
  const visible = group.tabs.filter((t) => TAB_CAN[t]());
  $('#tabs').classList.toggle('hidden', visible.length < 2);
  if (visible.length > 1) render($('#tabs'), tabs(visible.map((t) => ({ value: t, label: TAB_LABEL[t], ...COUNT[t] })), tab));
  for (const t of ALL_TABS) $(`#tab-${t}`).classList.toggle('hidden', t !== tab);
}

on($('#tabs'), 'click', '[data-tab]', (_e, b) => {
  if (b.dataset.tab === tab) return;
  if (tab === 'permissions' && !leavePermissionsOk()) return;
  tab = b.dataset.tab;
  setParams({ tab });
  drawTabs();
  load(tab);
  startTourIfNew(`admin-${tab}`);
});

const LOADERS = { users: loadUsers, permissions: loadPermissions, access: loadAccess, health: loadHealth, settings: loadSettings, audit: loadAudit };
async function load(t, force = false) {
  if (loaded.has(t) && !force) return;
  loaded.add(t);
  try {
    await LOADERS[t]();
    render($('#updated'), `อัปเดต ${clock(new Date())}`);
  } catch (e) {
    loaded.delete(t);
    if (e?.status === 403 && e?.code !== 'PROTECTED') return blocked(errorMessage(e));
    toast.error(errorMessage(e));
  }
}

function blocked(message) {
  render(
    $('#blocked'),
    alertBox({ tone: 'danger', title: message, body: 'ขอสิทธิ์ได้จากผู้ดูแลระบบสูงสุด (เมนูกำหนดสิทธิ์การใช้งาน) · หน้านี้ต้องเชื่อมต่อ PHP backend' }),
  );
  $('#blocked').classList.remove('hidden');
  $('#tabs').classList.add('hidden');
  for (const t of ALL_TABS) $(`#tab-${t}`).classList.add('hidden');
  $('#refresh').disabled = true;
}

$('#refresh').addEventListener('click', () => {
  if (tab === 'permissions' && !leavePermissionsOk()) return;
  load(tab, true);
});

// ===================== ผู้ใช้ =====================
const isMe = (u) => u.id === me?.id;
/** ป้ายบทบาท — แถวที่เพิ่ง/ยังไม่บันทึกอ่านจากรายการบทบาท */
const roleLabelOf = (u) => state.roles.find((r) => r.value === u.role)?.label ?? u.roleLabel ?? u.role;
/** ทำรายการกับผู้ใช้ได้ไหม (ไม่ใช่ตัวเอง · ไม่ใช่ผู้ดูแลระบบสูงสุดที่ป้องกันไว้) */
const editableUser = (u) => !isMe(u) && !isProtected(u.role);
const names = (rows) => rows.map((u) => u.username).slice(0, 6).join(', ') + (rows.length > 6 ? ` และอีก ${rows.length - 6} คน` : '');
/** ทีละคน — คนที่ไม่สำเร็จแจ้งรวมท้าย · โหลดรายชื่อใหม่ */
async function eachUser(rows, fn, label) {
  const failed = [];
  for (const u of rows) {
    try {
      await fn(u);
    } catch (e) {
      failed.push(`${u.username}: ${errorMessage(e)}`);
    }
  }
  reloadAccessToo();
  if (failed.length) toast.error(`${label}ไม่สำเร็จ ${failed.length} คน — ${failed.join(' · ')}`);
  return rows.length > failed.length ? `${label}แล้ว ${rows.length - failed.length} คน` : '';
}
const scopedRole = (role) => !!state.roles.find((r) => r.value === role)?.scoped;
/** แก้ช่องของแถวนี้ได้ไหม — แถวใหม่ได้เสมอ · บัญชีผู้ดูแลระบบสูงสุดแก้ได้เฉพาะผู้ดูแลระบบสูงสุด */
const editableRow = (u) => !!u.__new || !isProtected(u.role);

/** ตรวจก่อนบันทึก — ข้อความเดียวกับ backend (api_admin_user_create) */
function validateUser(u) {
  const e = {};
  if (u.__new) {
    if (!/^[a-z0-9._-]{2,50}$/.test(u.username)) e.username = 'ใช้ a-z 0-9 . _ - ยาว 2–50 ตัว';
    else if (state.users.some((x) => x.username === u.username)) e.username = `มีชื่อผู้ใช้ ${u.username} อยู่แล้ว`;
  }
  if (!u.name.trim()) e.name = 'กรุณาระบุชื่อ-สกุล';
  if (scopedRole(u.role) && !u.companyCode) e.companyCode = 'HR บริษัทต้องเลือกบริษัทที่ดูแล';
  if ((u.empCode ?? '').length > 20) e.empCode = 'รหัสพนักงานยาวเกิน 20 ตัวอักษร';
  return e;
}

/** บันทึกแถว — ผู้ใช้ใหม่ไม่ส่งรหัสผ่าน: backend ตั้งเป็นรหัสตั้งต้นและบังคับเปลี่ยนเอง · แถวเดิมส่งเฉพาะที่เปลี่ยน */
async function saveUser(u, isNew) {
  try {
    if (isNew) return await adminApi.createUser({ username: u.username, name: u.name, role: u.role, empCode: u.empCode ?? '', companyCode: scopedRole(u.role) ? u.companyCode : '' });
    const was = userById(u.id);
    const patch = {};
    if (u.name !== was.name) patch.name = u.name;
    if ((u.empCode ?? '') !== (was.empCode ?? '')) patch.empCode = u.empCode ?? '';
    if (u.role !== was.role) patch.role = u.role;
    if (scopedRole(u.role) && (u.companyCode !== was.companyCode || patch.role)) patch.companyCode = u.companyCode;
    return await adminApi.updateUser(u.id, patch);
  } catch (e) {
    throw e?.details ? new Error(Object.values(e.details)[0]) : e; // แสดงสาเหตุจริงที่แถว (422/409 มีรายช่อง)
  }
}

const users = new ExcelGrid($('#users'), {
  rowKey: (u) => u.id,
  pageSize: 25,
  exportName: 'ผู้ใช้ระบบ',
  addLabel: 'เพิ่มผู้ใช้',
  newRow: () => ({
    id: 0, __new: true, username: '', name: '', role: state.roles.some((r) => r.value === 'HR_ADMIN') ? 'HR_ADMIN' : state.roles[0]?.value ?? '', roleLabel: '', companyCode: null, empCode: '',
    isActive: true, locked: false, mustChangePassword: true, activeSessions: 0, devices: 0, lastLoginAt: null, passwordChangedAt: null,
  }),
  validate: validateUser,
  onSave: saveUser,
  onSaved: ({ added }) => {
    if (added) toast.success(`แจ้งผู้ใช้ใหม่ว่ารหัสเริ่มต้นคือ ${DEFAULT_PASSWORD} (ต้องตั้งรหัสเองตอนเข้าครั้งแรก)`);
    reloadAccessToo();
  },
  rowClass: (u) => (u.isActive ? '' : 'is-off'),
  rowLabel: (u) => u.username,
  columns: [
    {
      key: 'username',
      header: 'ชื่อผู้ใช้',
      width: 150,
      required: true,
      hint: 'a-z 0-9 . _ - ตั้งตอนเพิ่มเท่านั้น · ควรตรงกับบัญชีใน stock_hr',
      editor: 'text',
      editable: (u) => !!u.__new,
      value: (u) => u.username,
      set: (u, v) => ({ ...u, username: String(v ?? '').trim().toLowerCase() }),
    },
    {
      key: 'name',
      header: 'ชื่อ-สกุล',
      width: 190,
      required: true,
      editor: 'text',
      editable: editableRow,
      value: (u) => u.name,
      display: (u) => html`<b style="font-weight:500">${u.name}${isMe(u) ? ' (คุณ)' : ''}</b>`,
      set: (u, v) => ({ ...u, name: String(v ?? '').trim() }),
    },
    {
      key: 'role',
      header: 'บทบาท',
      width: 170,
      required: true,
      hint: 'เปลี่ยนบทบาทของตัวเองไม่ได้',
      editor: 'select',
      editable: (u) => editableRow(u) && !isMe(u),
      value: (u) => u.role,
      text: (u) => roleLabelOf(u),
      display: (u) => badge(roleLabelOf(u), u.role === 'SUPER_ADMIN' ? 'danger' : 'info'),
      options: () => state.roles.map((r) => ({ value: r.value, label: r.label })),
      set: (u, v) => ({ ...u, role: String(v), companyCode: scopedRole(String(v)) ? u.companyCode : null }),
    },
    {
      key: 'companyCode',
      header: 'บริษัทที่ดูแล',
      width: 130,
      hint: 'เฉพาะ HR บริษัท — เห็นและทำรายการได้เฉพาะพนักงานของบริษัทนี้',
      editor: 'select',
      editable: (u) => editableRow(u) && scopedRole(u.role),
      value: (u) => u.companyCode ?? '',
      display: (u) => u.companyCode ?? html`<span class="muted">${scopedRole(u.role) ? 'เลือกบริษัท' : '–'}</span>`,
      options: () => state.companies.map((c) => ({ value: c.value, label: c.label })),
      set: (u, v) => ({ ...u, companyCode: v ? String(v) : null }),
    },
    {
      key: 'empCode',
      header: 'รหัสพนักงาน',
      width: 120,
      hint: 'ส่งให้สต็อกเป็นผู้ขอเบิก',
      editor: 'text',
      editable: editableRow,
      value: (u) => u.empCode ?? '',
      set: (u, v) => ({ ...u, empCode: String(v ?? '').trim() }),
    },
    {
      key: 'status',
      header: 'สถานะ',
      width: 170,
      value: (u) => u.isActive,
      text: (u) => (u.isActive ? (u.locked ? 'ถูกล็อก' : u.mustChangePassword ? 'รอตั้งรหัสเอง' : 'ใช้งาน') : 'ปิดบัญชี'),
      display: (u) =>
        u.__new
          ? badge(`รหัสเริ่มต้น ${DEFAULT_PASSWORD}`, 'warning', { dot: false })
          : u.isActive
          ? html`${u.locked ? badge('ถูกล็อก', 'danger') : badge('ใช้งาน', 'success')}
              ${u.mustChangePassword ? html` ${badge('รอตั้งรหัสเอง', 'warning', { dot: false })}` : ''}`
          : badge('ปิดบัญชี', 'neutral'),
    },
    { key: 'online', header: 'ออนไลน์ / จดจำ', width: 120, align: 'center', value: (u) => u.activeSessions, text: (u) => `${u.activeSessions} / ${u.devices}`, display: (u) => html`<span class="num">${u.activeSessions} / ${u.devices}</span>` },
    { key: 'last', header: 'เข้าล่าสุด', width: 130, value: (u) => u.lastLoginAt ?? '', text: (u) => when(u.lastLoginAt), display: (u) => ago(u.lastLoginAt) },
    { key: 'pw', header: 'เปลี่ยนรหัสล่าสุด', width: 140, value: (u) => u.passwordChangedAt ?? '', text: (u) => when(u.passwordChangedAt), display: (u) => ago(u.passwordChangedAt) },
    {
      key: 'actions',
      header: '',
      width: 140,
      filter: false,
      value: () => '',
      display: (u) =>
        u.__new
          ? ''
          : isProtected(u.role)
          ? protectedMark()
          : html`<span class="row-actions">
        ${isMe(u)
          ? ''
          : html`<button class="btn btn-ghost btn-sm" data-action="password" data-id="${u.id}" title="รีเซ็ตรหัสผ่านเป็น ${DEFAULT_PASSWORD}" aria-label="รีเซ็ตรหัสผ่านของ ${u.username} เป็น ${DEFAULT_PASSWORD}">${raw(icon('lock'))}</button>
              <button class="btn btn-ghost btn-sm" data-action="signout" data-id="${u.id}" title="ออกจากระบบทุกอุปกรณ์" aria-label="ให้ ${u.username} ออกจากระบบทุกอุปกรณ์" ${u.activeSessions + u.devices ? '' : 'disabled'}>${raw(icon('log-out'))}</button>
              <button class="btn btn-ghost btn-sm" data-action="toggle" data-id="${u.id}" title="${u.isActive ? 'ปิดบัญชี' : 'เปิดใช้บัญชี'}" aria-label="${u.isActive ? 'ปิดบัญชี' : 'เปิดใช้บัญชี'} ${u.username}">${raw(icon(u.isActive ? 'user-x' : 'user-plus'))}</button>`}
      </span>`,
    },
  ],
  // เลือกหลายคน → ทำพร้อมกัน (ข้ามบัญชีของตัวเองและบัญชีผู้ดูแลระบบสูงสุด)
  bulkActions: [
    {
      id: 'disable',
      label: 'ปิดบัญชี',
      icon: 'user-x',
      tone: 'danger',
      when: (u) => editableUser(u) && u.isActive,
      confirm: (rows) => ({ title: `ปิดบัญชี ${rows.length} คน?`, description: `${names(rows)} — หลุดจากทุกอุปกรณ์ทันทีและเข้าสู่ระบบไม่ได้ (ประวัติยังอยู่ครบ)` }),
      run: (rows) => eachUser(rows, (u) => adminApi.updateUser(u.id, { isActive: false }), 'ปิดบัญชี'),
    },
    {
      id: 'enable',
      label: 'เปิดใช้บัญชี',
      icon: 'user-plus',
      when: (u) => editableUser(u) && !u.isActive,
      run: (rows) => eachUser(rows, (u) => adminApi.updateUser(u.id, { isActive: true }), 'เปิดใช้บัญชี'),
    },
    {
      id: 'signout',
      label: 'ออกจากระบบทุกอุปกรณ์',
      icon: 'log-out',
      when: (u) => editableUser(u) && u.activeSessions + u.devices > 0,
      confirm: (rows) => ({ title: `ให้ ${rows.length} คนออกจากระบบทุกอุปกรณ์?`, description: `${names(rows)} — ต้องเข้าสู่ระบบใหม่ด้วยรหัสผ่าน`, confirmLabel: 'ออกจากระบบทุกอุปกรณ์' }),
      run: (rows) => eachUser(rows, (u) => adminApi.signOutEverywhere(u.id), 'ออกจากระบบ'),
    },
    {
      id: 'reset',
      label: `รีเซ็ตรหัสเป็น ${DEFAULT_PASSWORD}`,
      icon: 'lock',
      tone: 'danger',
      when: editableUser,
      confirm: (rows) => ({ title: `รีเซ็ตรหัสผ่าน ${rows.length} คนเป็น ${DEFAULT_PASSWORD}?`, description: `${names(rows)} — ออกจากระบบทุกอุปกรณ์ทันที เข้าด้วย ${DEFAULT_PASSWORD} แล้วต้องตั้งรหัสของตัวเอง` }),
      run: (rows) => eachUser(rows, (u) => adminApi.resetPassword(u.id, ''), 'รีเซ็ตรหัสผ่าน'),
    },
  ],
  empty: emptyState({ iconName: 'users', title: 'ยังไม่มีผู้ใช้' }),
});
exposeForTour('users', users); // คู่มือ "จัดการผู้ใช้ระบบ" เพิ่ม/ทิ้งแถวตัวอย่าง
async function loadUsers() {
  if (!state.users) render($('#users'), html`<div class="card-body">${raw(String(skeletonLines(5)))}</div>`);
  const d = await adminApi.listUsers();
  state.roles = d.roles;
  state.companies = d.companies ?? [];
  state.counts.users = d.users.filter((u) => u.isActive).length;
  state.users = d.users;
  users.setRows(d.users);
  drawTabs();
}
const userById = (id) => state.users.find((u) => u.id === Number(id));

// ปุ่มอยู่ในเซลล์ของตาราง — จับก่อนตารางจะถือว่าเป็นการคลิกเพื่อเลือกเซลล์
on($('#users'), 'click', '[data-action]', async (e, b) => {
  e.stopPropagation();
  const u = userById(b.dataset.id);
  if (!u) return;
  const act = b.dataset.action;
  if (act === 'password') {
    if (
      await confirmAction({
        title: `รีเซ็ตรหัสผ่านของ ${u.username} เป็น ${DEFAULT_PASSWORD}?`,
        description: `${u.name} จะออกจากระบบทุกอุปกรณ์ทันที · เข้าด้วย ${DEFAULT_PASSWORD} แล้วต้องตั้งรหัสของตัวเองก่อนใช้งาน`,
        confirmLabel: `รีเซ็ตเป็น ${DEFAULT_PASSWORD}`,
        successMessage: `รีเซ็ตแล้ว — แจ้ง ${u.username} ให้เข้าด้วย ${DEFAULT_PASSWORD}`,
        action: () => adminApi.resetPassword(u.id, ''),
      })
    )
      reloadAccessToo();
    return;
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
}, { capture: true });

/** เปลี่ยนผู้ใช้แล้ว session/อุปกรณ์เปลี่ยนตาม */
function reloadAccessToo() {
  loaded.delete('access');
  loadUsers().catch((e) => toast.error(errorMessage(e)));
}

// ===================== กำหนดสิทธิ์การใช้งาน (SUPER_ADMIN) =====================
// ตาราง capability × บทบาท · ติ๊ก "ทำรายการ" → ติ๊ก "เห็นหน้า" ของกลุ่มเดียวกันให้ · เอา "เห็นหน้า" ออก → เอารายการของกลุ่มนั้นออกด้วย
const perm = { data: null, saved: new Map(), draft: new Map(), mobileRole: '' };
const KIND_LABEL = { view: 'เห็นหน้า', action: 'ทำรายการ' };

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const permDirty = () => perm.data && perm.data.caps.some((c) => !sameSet(perm.saved.get(c.key), perm.draft.get(c.key)));

function leavePermissionsOk() {
  return !permDirty() || confirm('มีสิทธิ์ที่แก้แล้วยังไม่บันทึก — ออกโดยไม่บันทึก?');
}
window.addEventListener('beforeunload', (e) => {
  if (permDirty()) e.preventDefault();
});

function setPermData(d) {
  perm.data = d;
  if (!perm.mobileRole) perm.mobileRole = d.roles[0]?.value ?? '';
  perm.saved = new Map(d.caps.map((c) => [c.key, new Set(c.roles)]));
  perm.draft = new Map(d.caps.map((c) => [c.key, new Set(c.roles)]));
}

function drawPermissions() {
  const d = perm.data;
  // วาดใหม่ทั้งตาราง → คงตำแหน่งเลื่อนเดิม (ไม่เด้งกลับบนสุดทุกครั้งที่ติ๊ก)
  const wrap = $('#perm .perm-wrap');
  const scroll = wrap ? [wrap.scrollTop, wrap.scrollLeft, $('#perm').scrollTop] : null;
  const groups = [...new Set(d.caps.map((c) => c.group))];
  const changed = d.caps.filter((c) => !sameSet(perm.saved.get(c.key), perm.draft.get(c.key))).length;
  $('#perm-save').disabled = !changed || !d.ready;
  $('#perm-undo').disabled = !changed;
  $('#perm-save').dataset.label = changed ? `บันทึกสิทธิ์ (${changed})` : 'บันทึกสิทธิ์';
  $('#perm-save').innerHTML = `${icon('save')} ${$('#perm-save').dataset.label}`;
  render(
    $('#perm'),
    html`${d.ready ? '' : alertBox({ tone: 'warning', title: 'ยังไม่ได้รัน migration 008_role_capabilities.sql', body: 'แสดงค่าเริ่มต้นในโค้ด — รัน migration แล้วจึงบันทึกได้' })}
      <label class="field perm-role-pick">
        <span>แสดงสิทธิ์ของบทบาท</span>
        <select class="input" id="perm-role">${d.roles.map((r) => html`<option value="${r.value}" ${r.value === perm.mobileRole ? 'selected' : ''}>${r.label} (${r.users} คน)</option>`)}</select>
      </label>
      <div class="perm-wrap">
        <table class="perm-table">
          <thead>
            <tr>
              <th scope="col" class="perm-cap">สิทธิ์</th>
              ${d.roles.map((r) => html`<th scope="col" class="perm-col${r.value === perm.mobileRole ? ' on' : ''}"><span>${r.label}</span><small>${r.users} คน</small></th>`)}
              <th scope="col" class="perm-super"><span>ผู้ดูแลระบบสูงสุด</span><small>ทุกอย่างเสมอ</small></th>
            </tr>
          </thead>
          <tbody>
            ${groups.map(
              (g) => html`<tr class="perm-group"><th colspan="${d.roles.length + 2}" scope="rowgroup">${g}</th></tr>
                ${d.caps
                  .filter((c) => c.group === g)
                  .map((c) => {
                    const on = perm.draft.get(c.key);
                    const was = perm.saved.get(c.key);
                    return html`<tr>
                      <th scope="row" class="perm-cap">
                        <span>${c.label}</span>
                        ${badge(KIND_LABEL[c.kind], c.kind === 'view' ? 'info' : 'neutral', { dot: false })}
                      </th>
                      ${d.roles.map((r) => {
                        const checked = on.has(r.value);
                        // สิทธิ์ที่มีผลทุกบริษัท — บทบาทที่ดูแลบริษัทเดียว (HR บริษัท) ให้ไม่ได้
                        if (c.lockedRoles?.includes(r.value)) {
                          return html`<td class="perm-col${r.value === perm.mobileRole ? ' on' : ''}">
                            <span class="perm-cell perm-locked" title="${r.label} ดูแลบริษัทเดียว — สิทธิ์นี้มีผลกับทุกบริษัท จึงให้ไม่ได้">${raw(icon('lock'))}</span>
                          </td>`;
                        }
                        return html`<td class="perm-col${r.value === perm.mobileRole ? ' on' : ''}${checked !== was.has(r.value) ? ' perm-changed' : ''}">
                          <label class="perm-cell" title="${r.label} · ${c.label}">
                            <input type="checkbox" data-cap="${c.key}" data-role="${r.value}" ${checked ? 'checked' : ''} ${d.ready ? '' : 'disabled'}
                              aria-label="${r.label}: ${c.label}" />
                          </label>
                        </td>`;
                      })}
                      <td class="perm-super"><span title="ผู้ดูแลระบบสูงสุดทำได้ทุกอย่างเสมอ">${raw(icon('check'))}</span></td>
                    </tr>`;
                  })}`,
            )}
          </tbody>
        </table>
      </div>
      <p class="small muted admin-note">
        ช่องสีเหลือง = แก้แล้วยังไม่บันทึก ·
        “เห็นหน้า” ซ่อนเมนูและปิดหน้านั้น · “ทำรายการ” ซ่อนปุ่ม — เซิร์ฟเวอร์ตรวจซ้ำทุกคำขอ ·
        บัญชีผู้ดูแลระบบสูงสุดแก้ไขได้เฉพาะผู้ดูแลระบบสูงสุดเสมอ ${d.updatedAt ? `· บันทึกล่าสุด ${thaiDateTime(d.updatedAt)}` : ''}
      </p>`,
  );
  if (scroll) {
    const w = $('#perm .perm-wrap');
    [w.scrollTop, w.scrollLeft, $('#perm').scrollTop] = scroll;
  }
}

async function loadPermissions() {
  render($('#perm'), skeletonLines(8));
  setPermData(await adminApi.getPermissions());
  drawPermissions();
}

on($('#perm'), 'change', 'input[data-cap]', (_e, box) => {
  const { cap, role } = box.dataset;
  const c = perm.data.caps.find((x) => x.key === cap);
  const set = (key, v) => (v ? perm.draft.get(key).add(role) : perm.draft.get(key).delete(role));
  set(cap, box.checked);
  const sameGroup = perm.data.caps.filter((x) => x.group === c.group && x.key !== cap);
  if (box.checked && c.kind === 'action') {
    // ทำรายการได้ต้องเห็นหน้าด้วย
    for (const v of sameGroup.filter((x) => x.kind === 'view')) set(v.key, true);
  }
  if (!box.checked && c.kind === 'view') {
    const off = sameGroup.filter((x) => x.kind === 'action' && perm.draft.get(x.key).has(role));
    for (const a of off) set(a.key, false);
    if (off.length) toast.success(`เอาสิทธิ์ทำรายการในกลุ่ม “${c.group}” ออกด้วย (${off.length} รายการ) — ไม่เห็นหน้าแล้วทำรายการไม่ได้`);
  }
  drawPermissions();
  $(`#perm input[data-cap="${cap}"][data-role="${role}"]`)?.focus({ preventScroll: true });
});

// มือถือ: แสดงทีละบทบาท (ตารางทั้งหมดกว้างเกินจอ)
on($('#perm'), 'change', '#perm-role', (_e, sel) => {
  perm.mobileRole = sel.value;
  drawPermissions();
});

$('#perm-defaults').addEventListener('click', () => {
  for (const c of perm.data.caps) perm.draft.set(c.key, new Set(c.defaultRoles));
  drawPermissions();
  toast.success('ติ๊กตามค่าเริ่มต้นแล้ว — กด “บันทึกสิทธิ์” เพื่อใช้งาน');
});

$('#perm-undo').addEventListener('click', () => {
  for (const c of perm.data.caps) perm.draft.set(c.key, new Set(perm.saved.get(c.key)));
  drawPermissions();
});

$('#perm-save').addEventListener('click', async () => {
  const matrix = {};
  for (const c of perm.data.caps) {
    if (!sameSet(perm.saved.get(c.key), perm.draft.get(c.key))) matrix[c.key] = [...perm.draft.get(c.key)];
  }
  const n = Object.keys(matrix).length;
  if (!n) return;
  await confirmAction({
    title: `บันทึกสิทธิ์ ${n} รายการ?`,
    description: 'มีผลทันทีกับผู้ใช้ทุกคนในบทบาทเหล่านั้น — เมนูและปุ่มจะเปลี่ยนเมื่อผู้ใช้เปิดหน้าใหม่',
    confirmLabel: 'บันทึกสิทธิ์',
    danger: false,
    action: async () => {
      const d = await adminApi.savePermissions(matrix);
      setPermData(d);
      drawPermissions();
      toast.success(`บันทึกแล้ว ${d.changed} การเปลี่ยนแปลง`);
    },
  });
});

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
      cell: (s) => (s.current ? '' : isProtected(s.role) ? protectedMark() : html`<button class="btn btn-ghost btn-sm" data-session="${s.id}">${raw(icon('user-minus'))} จบ session</button>`),
    },
  ],
  bulkActions: [
    {
      id: 'revoke',
      label: 'จบ session ที่เลือก',
      icon: 'user-minus',
      tone: 'danger',
      when: (x) => !x.current && !isProtected(x.role),
      confirm: (rows) => ({ title: `จบ ${rows.length} session?`, description: 'เครื่องที่เลือก “จดจำฉัน” ไว้ เข้าใหม่ได้เอง — ใช้ “เลิกจดจำ” เพื่อบังคับกรอกรหัส', confirmLabel: 'จบ session' }),
      run: (rows) => eachAccess(rows, (x) => adminApi.revokeSession(x.id), 'จบ session'),
    },
  ],
  empty: emptyState({ iconName: 'log-in', title: 'ไม่มี session ที่ใช้งานอยู่' }),
});
/** ทีละรายการ (session / อุปกรณ์) แล้วโหลดแท็บใหม่ */
async function eachAccess(rows, fn, label) {
  let failed = 0;
  for (const x of rows) {
    try {
      await fn(x);
    } catch {
      failed++;
    }
  }
  load('access', true);
  if (failed) toast.error(`${label}ไม่สำเร็จ ${failed} รายการ`);
  return rows.length > failed ? `${label}แล้ว ${rows.length - failed} รายการ` : '';
}

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
    { key: 'actions', header: '', filter: false, cell: (d) => (isProtected(d.role) ? protectedMark() : html`<button class="btn btn-ghost btn-sm" data-device="${d.familyId}">${raw(icon('user-minus'))} เลิกจดจำ</button>`) },
  ],
  bulkActions: [
    {
      id: 'forget',
      label: 'เลิกจดจำที่เลือก',
      icon: 'user-minus',
      tone: 'danger',
      when: (d) => !isProtected(d.role),
      confirm: (rows) => ({ title: `เลิกจดจำ ${rows.length} อุปกรณ์?`, description: 'เมื่อ session ปัจจุบันหมด เครื่องเหล่านั้นต้องกรอกรหัสผ่านใหม่', confirmLabel: 'เลิกจดจำ' }),
      run: (rows) => eachAccess(rows, (d) => adminApi.revokeDevice(d.familyId), 'เลิกจดจำ'),
    },
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
const STAGE_LABEL = { WAITING: 'รอผู้อนุมัติ', REQUESTED: 'รอคลังจ่าย', ISSUED: 'จ่ายแล้ว รอเซ็นรับ', RECEIVED: 'เซ็นรับแล้ว' };

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
      (c) => html`<div class="check-item">
        <span class="card-icon tone-${CHECK_TONE[c.status]}" title="${c.status === 'ok' ? 'ปกติ' : c.status === 'warn' ? 'ควรดู' : 'ต้องแก้'}">${raw(icon(CHECK_ICON[c.status]))}</span>
        <div><b>${c.label}</b><p class="small muted">${c.detail}</p></div>
      </div>`,
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
    html`<p class="small muted">ข้อมูลที่ใช้ไม่ได้แล้ว (หมดอายุ / ถูกเพิกถอน) ในตารางที่มีป้าย “ล้างได้” — ไม่กระทบผู้ที่ใช้งานอยู่</p>
      ${infoList(
        [
          { label: 'session', value: int(e.sessions) },
          { label: 'refresh token', value: int(e.tokens) },
          { label: 'ประวัติเข้าสู่ระบบ', value: int(e.attempts) },
        ],
        3,
      )}
      <p class="small muted">จำนวนที่เก่ากว่า ${c.days} วัน · ล้างครั้งล่าสุด:
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
      )}`,
  );
  render($('#db-tables'), tablesTable(h.tables));
  drawTabs();
}

/** ตารางในฐานข้อมูล → ชื่อที่คนอ่านเข้าใจ + เก็บอะไร (กลุ่มตามหน้าที่) · clean = ล้างของเก่าได้ด้วยปุ่ม "ล้างตอนนี้" */
const TABLE_GROUPS = [
  {
    label: 'ข้อมูลหลัก',
    tables: {
      employees: { name: 'พนักงาน', desc: 'ทะเบียนพนักงานทุกบริษัทในเครือ — ข้อมูลส่วนตัว วันเริ่มงาน สถานะ ใช้คำนวณสิทธิทั้งหมด' },
      sites: { name: 'หน่วยงาน', desc: 'หน่วยงาน / ไซต์งาน — ได้ประกันกลุ่มไหม สีโปโล และจำนวนชุดที่หน่วยงานตั้งเอง' },
      insurer_forms: { name: 'แบบฟอร์มประกัน', desc: 'บริษัทประกัน + ไฟล์แบบฟอร์ม Excel (ล้างรายชื่อแล้ว) และบริษัทในเครือที่ผูกไว้' },
    },
  },
  {
    label: 'งานสวัสดิการ',
    tables: {
      insurance_batches: { name: 'ประวัติส่งออกไฟล์ประกัน', desc: '1 แถว = ส่งออกไฟล์แจ้งบริษัทประกัน 1 ครั้ง (รายชื่อในครั้งนั้นอยู่ในตารางย่อย)' },
      uniform_issues: { name: 'การแจกชุดฟอร์ม', desc: 'แจกเอง / ส่งเบิกคลัง ทีละรอบสิทธิ — ไซซ์ จำนวน เลขใบเบิกในสต็อก สถานะ' },
    },
  },
  {
    label: 'ผู้ใช้ & ความปลอดภัย',
    tables: {
      users: { name: 'ผู้ใช้ระบบ', desc: 'บัญชีที่เข้าระบบได้ — ชื่อผู้ใช้ บทบาท บริษัทที่ดูแล เปิด/ปิดใช้งาน' },
      audit_log: { name: 'บันทึกการใช้งาน', desc: 'ใครเพิ่ม/แก้/ลบอะไร เมื่อไร — เก็บถาวร ไม่ถูกล้าง' },
      employee_types: { name: 'ประเภทพนักงาน', desc: 'ประเภทพนักงานและพฤติกรรม (บริษัทที่ใช้ได้ · กลุ่ม/ฝ่าย+ระดับ · ตำแหน่ง · รอบแจ้งรายวัน) — แก้ที่ ตั้งค่าสวัสดิการ' },
      dept_groups: { name: 'กลุ่ม / ฝ่าย', desc: 'กลุ่ม/ฝ่ายของพนักงานส่วนกลาง — ใช้เลือกในตารางพนักงานและแยกจำนวนชุดฟอร์มในกฎ (แก้ที่ ตั้งค่าสวัสดิการ)' },
      notifications: { name: 'การแจ้งเตือน', desc: 'รายการในกระดิ่งของผู้ใช้แต่ละคน — ผลอนุมัติ/คลังจ่ายใบเบิกชุดฟอร์ม, พนักงานที่ต้องแจ้งออกประกันทันที' },
      auth_sessions: { name: 'การเข้าสู่ระบบ', desc: 'session ที่เปิดอยู่ของแต่ละเครื่อง — หมดอายุแล้วไม่มีประโยชน์', clean: true },
      auth_refresh_tokens: { name: 'กุญแจ “จดจำฉัน”', desc: 'ให้เบราว์เซอร์เข้าระบบต่อได้โดยไม่ต้องพิมพ์รหัสใหม่ — หมดอายุ/เพิกถอนแล้วล้างได้', clean: true },
      auth_login_attempts: { name: 'ประวัติพยายามเข้าระบบ', desc: 'สำเร็จ/ไม่สำเร็จ ใช้ล็อกบัญชีเมื่อเดารหัสผิดหลายครั้ง', clean: true },
    },
  },
];

function tablesTable(tables) {
  const rows = new Map(tables.map((t) => [t.name, t.rows]));
  const known = new Set(TABLE_GROUPS.flatMap((g) => Object.keys(g.tables)));
  const groups = [...TABLE_GROUPS, { label: 'อื่น ๆ', tables: Object.fromEntries(tables.filter((t) => !known.has(t.name)).map((t) => [t.name, { name: t.name, desc: '' }])) }];
  return html`<div class="table-wrap db-tables">
    <table class="table">
      <thead><tr><th>ข้อมูล</th><th class="db-desc">เก็บอะไร</th><th class="right">แถว</th></tr></thead>
      ${groups.map((g) => {
        const list = Object.entries(g.tables).filter(([k]) => rows.has(k));
        if (!list.length) return '';
        return html`<tbody>
          <tr class="db-group"><th colspan="3">${g.label}</th></tr>
          ${list.map(
            ([k, t]) => html`<tr>
              <td><b>${t.name}</b><code class="db-name">${k}</code><span class="db-desc-m">${t.desc} ${t.clean ? badge('ล้างได้', 'neutral', { dot: false }) : ''}</span></td>
              <td class="muted db-desc">${t.desc} ${t.clean ? badge('ล้างได้', 'neutral', { dot: false }) : ''}</td>
              <td class="num right">${int(rows.get(k))}</td>
            </tr>`,
          )}
        </tbody>`;
      })}
    </table>
  </div>`;
}

async function loadHealth() {
  render($('#checks'), skeletonLines(6));
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
const sourceBadge = (it) => (it.source === 'db' ? badge('ตั้งจากหน้านี้', 'primary', { dot: false }) : badge(it.baseName, 'neutral', { dot: false }));

function settingHint(it, base) {
  return html`${it.hint ? `${it.hint} · ` : ''}${base}${it.source === 'db' && it.updatedBy ? ` · แก้ล่าสุดโดย ${it.updatedBy} ${timeAgo(it.updatedAt)}` : ''}
    ${it.source === 'db' ? html` · <a href="#" data-reset="${it.key}">ใช้ค่าใน ${it.baseName}</a>` : ''}`;
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
  const doc = itemOf('stock_doc_url');
  const sec = itemOf('stock_api_secret');
  const off = cfg.data.ready ? '' : 'disabled';
  return html`<form class="form-grid" data-settings data-stock novalidate>
    <div class="field full" data-field="stock_api_url">
      <label>${url.label} ${sourceBadge(url)}</label>
      <input class="input" type="url" name="stock_api_url" value="${url.value}" spellcheck="false" ${off} />
      <span class="hint">${settingHint(url, `config.php = ${url.base || '(ว่าง)'}`)}</span>
      <span class="error"></span>
    </div>
    ${doc
      ? html`<div class="field full" data-field="stock_doc_url">
          <label>${doc.label} ${sourceBadge(doc)}</label>
          <input class="input" type="url" name="stock_doc_url" value="${doc.value}" spellcheck="false" placeholder="ว่าง = สร้างจาก URL ของ API" ${off} />
          <span class="hint">${settingHint(doc, `config.php = ${doc.base || '(ไม่ได้ตั้ง)'}`)}</span>
          <span class="error"></span>
        </div>`
      : ''}
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

const JOB_SYSTEM = { cns: 'job_db_cns', pro: 'hr-pro' };
/** ฟอร์มการเชื่อมต่อระบบสัญญาจ้าง — รหัสผ่านไม่ถูกส่งกลับมา เว้นว่าง = ใช้รหัสเดิม */
function jobDbForm(source) {
  const key = (f) => `job_${source}_${f}`;
  const off = cfg.data.ready ? '' : 'disabled';
  const file = (it) => `${it.baseName} = ${it.base === '' ? '(ไม่มี)' : it.base}`;
  const text = (f, extra = '') => {
    const it = itemOf(key(f));
    return html`<div class="field${extra}" data-field="${it.key}">
      <label>${it.label} ${sourceBadge(it)}</label>
      <input class="input" type="text" name="${it.key}" value="${it.value}" autocomplete="off" spellcheck="false" ${off} />
      <span class="hint">${settingHint(it, file(it))}</span>
      <span class="error"></span>
    </div>`;
  };
  const port = itemOf(key('port'));
  const pass = itemOf(key('pass'));
  return html`<form class="form-grid" data-settings novalidate>
    ${text('host')}
    <div class="field" data-field="${port.key}">
      <label>${port.label} ${sourceBadge(port)}</label>
      <input class="input num" type="number" name="${port.key}" min="${port.min}" max="${port.max}" value="${port.value}" ${off} />
      <span class="hint">${settingHint(port, file(port))}</span>
      <span class="error"></span>
    </div>
    ${text('name', ' full')}
    ${text('user')}
    <div class="field" data-field="${pass.key}">
      <label>${pass.label} ${sourceBadge(pass)}</label>
      <input class="input" type="password" name="${pass.key}" autocomplete="new-password" placeholder="${pass.secret.set ? 'ตั้งแล้ว — ว่าง = ใช้รหัสเดิม' : 'ยังไม่ได้ตั้ง'}" ${off} />
      <span class="hint">${settingHint(pass, `${pass.baseName}: ${pass.baseSecret.set ? 'มีรหัสผ่าน' : 'ไม่มีรหัสผ่าน'}`)}</span>
      <span class="error"></span>
    </div>
    <div class="full" data-job-result></div>
    <div class="row full" style="gap:8px;justify-content:flex-end">
      <button type="button" class="btn btn-sm" data-job-test="${source}" data-label="ทดสอบการเชื่อมต่อ">${raw(icon('zap'))} ทดสอบการเชื่อมต่อ</button>
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
  render($('#job-cns-settings'), jobDbForm('cns'));
  render($('#job-pro-settings'), jobDbForm('pro'));
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
    title: `ใช้ค่าใน ${it.baseName} สำหรับ “${it.label}”?`,
    description: it.key.startsWith('job_') && it.type === 'secret' ? `ใน ${it.baseName}: ${it.baseSecret.set ? 'มีรหัสผ่าน' : 'ไม่มีรหัสผ่าน'}` : it.type === 'secret' ? `กุญแจใน config.php: ${secretText(it.baseSecret)} — ต้องตรงกับ stock_hr ด้วย` : `ค่าจะเป็น ${it.base || '(ว่าง)'} ${it.unit}`,
    confirmLabel: `ใช้ค่าใน ${it.baseName}`,
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

on($('#tab-settings'), 'click', '[data-job-test]', async (_e, b) => {
  const form = b.closest('form');
  const source = b.dataset.jobTest;
  const val = (k) => form.elements[`job_${source}_${k}`].value.trim();
  showFieldErrors(form);
  try {
    await busy(b, async () => {
      const r = await adminApi.testJobDb(source, { host: val('host'), port: val('port'), name: val('name'), user: val('user'), pass: val('pass') });
      render(
        form.querySelector('[data-job-result]'),
        alertBox({
          tone: r.ok ? 'success' : r.status === 'warn' ? 'warning' : 'danger',
          title: r.status === 'error' ? `เชื่อมต่อ ${JOB_SYSTEM[source]} ไม่ได้` : `เชื่อมต่อ ${JOB_SYSTEM[source]} ได้`,
          body: `${r.detail}${val('pass') ? '' : ' · ใช้รหัสผ่านที่บันทึกไว้'}`,
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
$('#audit-clear').addEventListener('click', () => {
  $('#audit-filters').reset();
  reloadAudit();
});

// ===================== เริ่ม =====================
if (!adminApi) blocked('หน้านี้ใช้ได้เมื่อเชื่อมต่อ PHP backend (apiMode: http)');
else if (!TAB_CAN[tab]()) blocked('บัญชีนี้ไม่มีสิทธิ์ใช้เมนูนี้');
else {
  drawTabs();
  await load(tab);
  // ตัวนับบนแท็บอื่นของเมนูเดียวกัน (ล็อก / ปัญหาระบบ) — โหลดเบื้องหลังหลังแท็บแรกเสร็จ
  for (const t of ['access', 'health']) if (t !== tab && group.tabs.includes(t) && TAB_CAN[t]()) load(t);
}
