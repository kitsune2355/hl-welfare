// หน้า: บัญชีของฉัน (account.html#password | #font) — ทุกคนที่เข้าสู่ระบบ
//   เปลี่ยนรหัสผ่าน = POST /auth/password (backend/auth.php) → เครื่องอื่นออกจากระบบทั้งหมด เครื่องนี้ได้ session ใหม่
//   ขนาดตัวอักษร   = app/fontSize.js (localStorage ต่อผู้ใช้ต่อเบราว์เซอร์)
//   ?force=1&next= = ผู้ดูแลตั้ง/รีเซ็ตรหัสให้ (รหัสตั้งต้น 4123) ต้องตั้งรหัสเองก่อน แล้วกลับหน้าเดิม
import { authApi } from '../app/api.js';
import { getSession, safeNext, updateSessionUser } from '../app/auth.js';
import { FONT_LEVELS, getFontSize, setFontSize } from '../app/fontSize.js';
import { initPage } from '../app/shell.js';
import { $, getParam, html, render } from '../shared/dom.js';
import { alertBox } from '../ui/components.js';
import { busy } from '../ui/loading.js';
import { errorMessage, toast } from '../ui/overlay.js';

initPage(location.hash === '#font' ? 'account-font' : 'account-password');

const me = getSession();
const forced = !!me?.mustChangePassword || getParam('force') === '1';
render($('#who'), `${me?.name ?? ''} · ${me?.username ?? ''} · ${me?.role ?? ''}`);

// ===================== เปลี่ยนรหัสผ่าน =====================
if (forced) {
  render(
    $('#force'),
    alertBox({
      tone: 'warning',
      title: 'กรุณาตั้งรหัสผ่านของคุณเองก่อนใช้งาน',
      body: 'รหัสผ่านนี้ผู้ดูแลระบบตั้งให้ (เช่น รหัสตั้งต้น 4123) ซึ่งคนอื่นอาจรู้ — ตั้งรหัสใหม่แล้วจะกลับไปหน้าที่เปิดไว้',
    }),
  );
  $('#force').classList.remove('hidden');
  render($('#current-hint'), 'รหัสที่ผู้ดูแลระบบให้มา (ถ้าไม่ได้บอก = 4123)');
}

const RULES = [
  { test: (v) => [...v].length >= 8, text: 'อย่างน้อย 8 ตัวอักษร' },
  { test: (v) => v !== '' && v.toLowerCase() !== (me?.username ?? '').toLowerCase(), text: 'ไม่เหมือนชื่อผู้ใช้' },
  { test: (v) => v !== '' && v !== '4123' && v !== $('#pw-current').value, text: 'ไม่ใช่รหัสตั้งต้น และไม่ซ้ำรหัสปัจจุบัน' },
  { test: (v) => /[A-Za-zก-๙]/.test(v) && /\d/.test(v), text: 'แนะนำ: มีทั้งตัวอักษรและตัวเลข', soft: true },
];

function drawRules() {
  const v = $('#pw-next').value;
  render(
    $('#pw-rules'),
    html`${RULES.map((r) => {
      const ok = r.test(v);
      return html`<li class="${ok ? 'ok' : r.soft ? 'soft' : ''}">${ok ? '✓' : '•'} ${r.text}</li>`;
    })}`,
  );
}
drawRules();
$('#pw-next').addEventListener('input', drawRules);
$('#pw-current').addEventListener('input', drawRules);
$('#pw-show').addEventListener('change', (e) => {
  for (const id of ['#pw-current', '#pw-next', '#pw-confirm']) $(id).type = e.target.checked ? 'text' : 'password';
});

function showErrors(errors) {
  for (const f of document.querySelectorAll('#pw-form .field')) {
    const msg = errors[f.dataset.field] ?? '';
    f.querySelector('.error').textContent = msg;
    f.querySelector('.input').toggleAttribute('aria-invalid', !!msg);
  }
}

$('#pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = $('#pw-current').value;
  const next = $('#pw-next').value;
  const errors = {};
  if (!current) errors.current = 'กรุณากรอกรหัสผ่านปัจจุบัน';
  const broken = RULES.find((r) => !r.soft && !r.test(next));
  if (broken) errors.next = `รหัสผ่านใหม่ต้อง${broken.text}`;
  if (next !== $('#pw-confirm').value) errors.confirm = 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน';
  showErrors(errors);
  if (Object.keys(errors).length) return $(`#pw-form [data-field="${Object.keys(errors)[0]}"] .input`).focus();
  if (!authApi.changePassword) return toast.error('เปลี่ยนรหัสผ่านได้เมื่อเชื่อมต่อ PHP backend');
  try {
    await busy($('#pw-save'), async () => {
      const user = await authApi.changePassword(current, next);
      updateSessionUser(user);
    });
    $('#pw-form').reset();
    drawRules();
    if (forced) {
      toast.success('ตั้งรหัสผ่านแล้ว — เข้าใช้งานได้ตามปกติ');
      setTimeout(() => location.replace(safeNext(getParam('next'))), 800);
    } else {
      toast.success('เปลี่ยนรหัสผ่านแล้ว — อุปกรณ์อื่นออกจากระบบทั้งหมด (“จดจำฉัน” ต้องเลือกใหม่ตอนเข้าครั้งหน้า)');
    }
  } catch (err) {
    const msg = errorMessage(err);
    showErrors(/ปัจจุบัน/.test(msg) ? { current: msg } : { next: msg });
    toast.error(msg);
  }
});

// ===================== ขนาดตัวอักษร =====================
function drawFont() {
  const now = getFontSize();
  render(
    $('#font-levels'),
    html`${FONT_LEVELS.map(
      (l) => html`<button type="button" class="font-level${l.value === now ? ' active' : ''}" role="radio" aria-checked="${l.value === now}"
        data-font="${l.value}">
        <span class="font-sample" style="font-size:${(14 * l.value) / 100}px">กขค Abc 123</span>
        <b>${l.label}</b>
        <small>${l.value}% · ${l.hint}</small>
      </button>`,
    )}`,
  );
}
drawFont();
$('#font-levels').addEventListener('click', (e) => {
  const b = e.target.closest('[data-font]');
  if (!b) return;
  setFontSize(Number(b.dataset.font));
  drawFont();
  $(`#font-levels [data-font="${b.dataset.font}"]`)?.focus();
  toast.success(`ขนาดตัวอักษร: ${FONT_LEVELS.find((l) => l.value === Number(b.dataset.font)).label}`);
});
// ลูกศรซ้าย/ขวาเลือกระดับ (radiogroup)
$('#font-levels').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const i = FONT_LEVELS.findIndex((l) => l.value === getFontSize());
  const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
  const next = FONT_LEVELS[Math.max(0, Math.min(FONT_LEVELS.length - 1, i + step))];
  setFontSize(next.value);
  drawFont();
  $(`#font-levels [data-font="${next.value}"]`)?.focus();
});

if (location.hash === '#font') $('#font').scrollIntoView({ block: 'start' });
window.addEventListener('hashchange', () => location.reload()); // เมนู sidebar ทั้งสองลิงก์ชี้หน้านี้ — ให้เมนูที่เลือกตรง
