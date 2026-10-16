// หน้า: เข้าสู่ระบบ (login.html?next=&bye=1)
import { api, API_MODE } from '../app/api.js';
import { getSession, GUEST, isAuthEnabled, safeNext, saveSession } from '../app/auth.js';
import { CONFIG } from '../config.js';
import { $, esc, getParam } from '../shared/dom.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import { spinner } from '../ui/loading.js';

const next = safeNext(getParam('next'));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ปิดระบบ login (config.auth.enabled = false) หรือเข้าสู่ระบบอยู่แล้ว → ไปหน้าที่ต้องการเลย
if (!isAuthEnabled()) {
  saveSession(GUEST);
  location.replace(next);
} else if (getSession()) {
  location.replace(next);
}

hydrateIcons();
const form = $('#login-form');
const user = $('#username');
const pass = $('#password');
const btn = $('#submit');
const err = $('#error');

// ----- ธีม -----
const themeBtn = $('#theme-btn');
const drawTheme = () => (themeBtn.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'));
themeBtn.onclick = () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  if (dark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  try {
    if (dark) localStorage.setItem('hl-theme', 'dark');
    else localStorage.removeItem('hl-theme');
  } catch {
    /* ignore */
  }
  drawTheme();
};
drawTheme();

// ----- ข้อความแจ้ง -----
const notice = $('#notice');
if (getParam('bye') === '1') {
  notice.textContent = 'ออกจากระบบเรียบร้อยแล้ว 👋';
  notice.classList.remove('hidden');
} else if (getParam('next')) {
  notice.textContent = 'กรุณาเข้าสู่ระบบเพื่อใช้งานต่อ';
  notice.classList.remove('hidden');
}

// ----- บัญชีทดลอง (โหมด mock) -----
const demo = API_MODE === 'mock' && CONFIG.auth.showDemoAccounts ? (api.demoAccounts?.() ?? []) : [];
if (demo.length) {
  $('#demo').classList.remove('hidden');
  $('#demo-list').innerHTML = demo.map(
    (u) => `<button type="button" class="demo-chip" data-u="${esc(u.username)}" data-p="${esc(u.password)}"><code>${esc(u.username)}</code> / ${esc(u.password)} · ${esc(u.role)}</button>`,
  ).join('');
  $('#demo-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-u]');
    if (!b) return;
    user.value = b.dataset.u;
    pass.value = b.dataset.p;
    clearError();
    btn.focus();
  });
}

// ----- แสดง/ซ่อนรหัสผ่าน + Caps Lock -----
$('#toggle-pw').onclick = () => {
  const show = pass.type === 'password';
  pass.type = show ? 'text' : 'password';
  $('#toggle-pw').innerHTML = icon(show ? 'eye-off' : 'eye');
  $('#toggle-pw').setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
  pass.focus();
};
pass.addEventListener('keyup', (e) => $('#caps').classList.toggle('hidden', !e.getModifierState?.('CapsLock')));

$('#forgot').onclick = () => showError(CONFIG.auth.forgotPasswordText, 'info');

// ----- error -----
function showError(msg, kind = 'error') {
  err.textContent = msg;
  err.className = kind === 'info' ? 'lc-notice' : 'lc-error';
  // เริ่ม animation สั่นใหม่ทุกครั้ง
  void err.offsetWidth;
  err.classList.remove('hidden');
}
function clearError() {
  err.classList.add('hidden');
  form.querySelectorAll('.lc-input.invalid').forEach((el) => el.classList.remove('invalid'));
}
function markInvalid(input) {
  const box = input.closest('.lc-input');
  box.classList.remove('invalid');
  void box.offsetWidth;
  box.classList.add('invalid');
}
[user, pass].forEach((i) => i.addEventListener('input', clearError));

function setLoading(on) {
  btn.disabled = on;
  btn.innerHTML = on ? `${spinner({ size: 'sm', onColor: true })}<span class="lc-label">กำลังตรวจสอบ…</span>` : `<span class="lc-label">เข้าสู่ระบบ</span>${icon('arrow-right')}`;
}

// ----- อนิเมชันเมื่อสำเร็จ -----
function playSuccess(name) {
  btn.classList.add('success');
  btn.innerHTML = `${icon('check')}<span class="lc-label">สำเร็จ</span>`;
  const r = btn.getBoundingClientRect();
  const overlay = $('#success');
  overlay.style.setProperty('--x', `${r.left + r.width / 2}px`);
  overlay.style.setProperty('--y', `${r.top + r.height / 2}px`);
  $('#welcome').textContent = `ยินดีต้อนรับ, ${name}`;
  setTimeout(() => (overlay.hidden = false), reduced ? 0 : 350);
  setTimeout(() => location.replace(next), reduced ? 400 : 2200);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  if (!user.value.trim()) {
    markInvalid(user);
    user.focus();
    return showError('กรุณากรอกชื่อผู้ใช้');
  }
  if (!pass.value) {
    markInvalid(pass);
    pass.focus();
    return showError('กรุณากรอกรหัสผ่าน');
  }
  setLoading(true);
  try {
    const u = await api.login(user.value.trim(), pass.value);
    saveSession(u, $('#remember').checked);
    playSuccess(u.name);
  } catch (ex) {
    setLoading(false);
    markInvalid(pass);
    pass.select();
    showError(ex?.status === 401 ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : ex?.message || 'เข้าสู่ระบบไม่สำเร็จ');
  }
});

user.focus();
