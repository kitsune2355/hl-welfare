// กระดิ่งแจ้งเตือนบนแถบบน (ทุกหน้า — shell เรียก initNotifications) · แนวเดียวกับกระดิ่งของระบบสต็อก Uniform
//
//   - ตัวเลขเรื่องที่ยังไม่อ่าน · ถามใหม่ทุก 90 วินาที และทันทีที่กลับมาที่แท็บนี้ (เงียบ ไม่ขึ้น loading กลางจอ)
//   - กดกระดิ่ง → รายการล่าสุด 10 เรื่อง จัดกลุ่มตามวัน · เลื่อนลงใกล้ท้าย = โหลดเพิ่มทีละ 10 (เก่ากว่า id สุดท้าย)
//   - กดรายการ = อ่านแล้ว + ไปหน้าปลายทาง (employee.html?id= เปิดเป็น popup ตามปกติของระบบ) · "อ่านทั้งหมด"
//   - สวิตช์ "แจ้งเตือนนอกหน้าเว็บ" (Web Notifications API) — เด้งที่มุมจอแม้สลับไปทำอย่างอื่น
//     ต้องเปิดหน้าระบบค้างไว้ในแท็บใดแท็บหนึ่ง (ปิดเบราว์เซอร์แล้วไม่เด้ง — ต้องใช้ push server + https)
//     เบราว์เซอร์อนุญาตเฉพาะ https หรือ localhost · สวิตช์เก็บต่อเครื่อง/ต่อผู้ใช้ (localStorage) เพราะสิทธิ์เป็นของเบราว์เซอร์
import { api } from './api.js';
import { getSession } from './auth.js';
import { NOTICE_LOOK } from '../application/usecases/notifications.js';
import { esc, html, raw } from '../shared/dom.js';
import { thaiDate, timeAgo } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { progress } from '../ui/loading.js';
import { toast } from '../ui/overlay.js';

const POLL_MS = 90_000;
const PAGE_SIZE = 10;
/** เด้งนอกหน้าเว็บทีละเรื่องได้ไม่เกินนี้ — เกินรวบเป็นกล่องเดียว */
const DESKTOP_MAX = 3;

// ---------- แจ้งเตือนนอกหน้าเว็บ ----------
const userKey = () => getSession()?.username ?? 'guest';
const store = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {
    /* โหมดส่วนตัว / ถูกบล็อก */
  }
  return null;
};
const keyOn = () => `hl-desktop-noti:${userKey()}`;
const keySeen = () => `hl-desktop-seen:${userKey()}`;

/** unsupported | insecure | denied | default | granted */
function desktopState() {
  if (typeof window.Notification === 'undefined') return 'unsupported';
  if (window.isSecureContext === false) return 'insecure';
  return Notification.permission;
}
const desktopOn = () => store(keyOn()) === '1' && desktopState() === 'granted';

function desktopHint() {
  const s = desktopState();
  if (s === 'unsupported') return 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนนอกหน้าเว็บ';
  if (s === 'insecure') return 'ใช้ไม่ได้เพราะไม่ได้เปิดผ่าน https (เบราว์เซอร์อนุญาตเฉพาะ https หรือ localhost)';
  if (s === 'denied') return 'เคยกดไม่อนุญาตไว้ — เปิดได้ที่รูปแม่กุญแจข้างที่อยู่เว็บ › การแจ้งเตือน';
  if (desktopOn()) return 'เปิดอยู่ — เด้งที่มุมจอเมื่อมีเรื่องใหม่ (ต้องเปิดหน้าระบบค้างไว้ในแท็บใดแท็บหนึ่ง)';
  return 'ปิดอยู่ — เห็นได้จากกระดิ่งนี้เท่านั้น';
}

const seenId = () => Number(store(keySeen())) || 0;
const setSeen = (id) => id > seenId() && store(keySeen(), String(id));

function showDesktop(title, body, url) {
  try {
    const n = new Notification(title, { body: body || '', icon: 'favicon.svg', tag: `hl-welfare-${url}` });
    n.onclick = () => {
      window.focus();
      location.href = url;
      n.close();
    };
    setTimeout(() => n.close(), 20_000);
  } catch {
    /* เด้งไม่ได้ต้องไม่ทำให้หน้าพัง */
  }
}

/** เด้งเรื่องที่ใหม่กว่าที่เคยเด้ง (เก่า → ใหม่) */
function pushDesktop(items) {
  if (!desktopOn() || !items?.length) return;
  // ยังไม่มีจุดตั้งต้น (เพิ่งเปิดสวิตช์/เครื่องใหม่) → นับเรื่องที่มีอยู่ว่าเห็นแล้ว ไม่เด้งย้อนหลัง
  if (!store(keySeen())) return setSeen(items[0].id);
  const fresh = items.filter((n) => n.id > seenId()).reverse();
  if (!fresh.length) return;
  if (fresh.length > DESKTOP_MAX) showDesktop(`มีแจ้งเตือนใหม่ ${fresh.length} เรื่อง`, fresh[fresh.length - 1].title, location.href);
  else for (const n of fresh) showDesktop(n.title, n.message, n.link || location.href);
  setSeen(fresh[fresh.length - 1].id);
}

// ---------- กระดิ่ง ----------
const DAY = (at) => at.slice(0, 10);
function dayLabel(at) {
  const d = DAY(at);
  const now = new Date();
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d === iso(now)) return 'วันนี้';
  if (d === iso(y)) return 'เมื่อวาน';
  return thaiDate(d);
}

function rowHtml(n) {
  const look = NOTICE_LOOK[n.type] ?? { icon: 'bell', tone: 'info' };
  return html`<a class="noti-row${n.read ? '' : ' unread'}" href="${n.link || '#'}" data-noti-id="${n.id}" data-read="${n.read ? '1' : '0'}">
    <span class="noti-ic tone-${look.tone}">${raw(icon(look.icon))}</span>
    <span class="noti-txt">
      <b>${n.title}</b>
      <span>${n.message}</span>
      <time datetime="${n.at}">${timeAgo(n.at)}</time>
    </span>
    ${n.read ? '' : raw('<span class="noti-dot" aria-label="ยังไม่ได้อ่าน"></span>')}
  </a>`;
}

/**
 * ใส่กระดิ่งในปุ่ม #noti-btn (shell สร้างไว้บนแถบบน)
 * @param {HTMLButtonElement} btn
 */
export function initNotifications(btn) {
  if (!btn) return;
  const badge = btn.querySelector('.noti-badge');
  const panel = document.createElement('div');
  panel.className = 'noti-panel';
  panel.id = 'noti-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'การแจ้งเตือน');
  panel.innerHTML = String(html`<header class="noti-head">
      <b>การแจ้งเตือน</b><span class="noti-new" hidden></span>
      <button type="button" class="btn btn-ghost btn-sm" data-noti-readall disabled>${raw(icon('check-check'))} อ่านทั้งหมด</button>
    </header>
    <div class="noti-list" tabindex="-1"></div>
    <footer class="noti-foot"></footer>`);
  document.body.append(panel);
  const list = panel.querySelector('.noti-list');
  const foot = panel.querySelector('.noti-foot');
  const newEl = panel.querySelector('.noti-new');
  const readAllBtn = panel.querySelector('[data-noti-readall]');

  let unread = 0;
  let open = false;
  let loading = false;
  let hasMore = false;
  let nextBefore = null;
  let lastDay = '';

  const quiet = (fn) => progress.quiet(fn);

  function setUnread(n) {
    unread = Math.max(0, Number(n) || 0);
    badge.hidden = unread === 0;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    btn.setAttribute('aria-label', unread ? `การแจ้งเตือน (ยังไม่อ่าน ${unread})` : 'การแจ้งเตือน');
    newEl.hidden = unread === 0;
    newEl.textContent = `${unread} ใหม่`;
    readAllBtn.disabled = unread === 0;
  }

  function drawFoot(state) {
    const s = desktopState();
    const on = desktopOn();
    const can = s === 'default' || s === 'granted';
    foot.innerHTML = String(html`${state === 'loading' ? raw('<div class="noti-more">กำลังโหลดเพิ่ม…</div>') : hasMore ? raw('<div class="noti-more">เลื่อนลงเพื่อดูเพิ่ม</div>') : ''}
      <div class="noti-desk">
        <button type="button" class="switch sm" role="switch" aria-checked="${on ? 'true' : 'false'}" data-noti-desktop ${can || on ? '' : 'disabled'} aria-label="แจ้งเตือนนอกหน้าเว็บ"></button>
        <span><b>${raw(icon(on ? 'bell-ring' : 'bell-off'))} แจ้งเตือนนอกหน้าเว็บ</b><small>${desktopHint()}</small></span>
      </div>`);
  }

  function drawItems(items, append) {
    if (!append) {
      lastDay = '';
      if (!items.length) {
        list.innerHTML = String(html`<div class="noti-empty">${raw(icon('bell-off'))}<b>ยังไม่มีการแจ้งเตือน</b>
          <small>ผลอนุมัติ / คลังจ่ายใบเบิกชุดฟอร์มที่คุณส่ง และพนักงานที่ต้องแจ้งออกประกันทันที จะขึ้นที่นี่</small></div>`);
        return;
      }
    }
    let out = '';
    for (const n of items) {
      if (DAY(n.at) !== lastDay) {
        lastDay = DAY(n.at);
        out += `<div class="noti-day">${esc(dayLabel(n.at))}</div>`;
      }
      out += String(rowHtml(n));
    }
    if (append) list.insertAdjacentHTML('beforeend', out);
    else list.innerHTML = out;
  }

  /** more = false → เริ่มใหม่จากเรื่องล่าสุด · true = ต่อจากที่ค้าง (เลื่อนถึงท้าย) */
  async function load(more = false) {
    if (loading || (more && !hasMore)) return;
    loading = true;
    if (more) drawFoot('loading');
    else {
      list.innerHTML = '<div class="noti-msg">กำลังโหลด…</div>';
      hasMore = false;
      nextBefore = null;
    }
    try {
      const page = await quiet(() => api.listNotifications({ before: more ? nextBefore : undefined, limit: PAGE_SIZE }));
      setUnread(page.unread);
      hasMore = page.hasMore;
      nextBefore = page.nextBefore;
      // เพิ่งเปิดสวิตช์: ถือว่าเรื่องที่มีอยู่ตอนนี้ "เห็นแล้ว" ไม่เด้งย้อนหลัง
      if (!more && page.items.length && !store(keySeen())) setSeen(page.items[0].id);
      drawItems(page.items, more);
    } catch (e) {
      if (!more) list.innerHTML = String(html`<div class="noti-msg error">โหลดการแจ้งเตือนไม่สำเร็จ — ${e.message ?? 'ลองใหม่อีกครั้ง'}</div>`);
    } finally {
      loading = false;
      drawFoot();
    }
  }

  function place() {
    const r = btn.getBoundingClientRect();
    const w = panel.offsetWidth || 380;
    panel.style.top = `${r.bottom + 8}px`;
    panel.style.left = `${Math.max(12, Math.min(r.right - w, innerWidth - w - 12))}px`;
  }

  function openPanel() {
    open = true;
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    place();
    load();
  }
  function closePanel() {
    open = false;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (open) closePanel();
    else openPanel();
  });
  document.addEventListener('mousedown', (e) => open && !panel.contains(e.target) && !btn.contains(e.target) && closePanel());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && open && !document.querySelector('.modal-layer') && closePanel());
  addEventListener('resize', () => open && place());

  list.addEventListener('scroll', () => {
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 60) load(true);
  });

  // กดรายการ: อ่านแล้ว แล้วไปตามลิงก์
  //   ลิงก์ employee.html?id= → shell เปิด popup (ไม่เปลี่ยนหน้า) — บันทึกว่าอ่านแบบไม่ต้องรอ
  //   ลิงก์ที่เปลี่ยนหน้า → รอบันทึกก่อน (ไม่เกิน 1.5 วินาที) ไม่งั้นเบราว์เซอร์ตัดคำขอทิ้งตอนออกจากหน้า
  list.addEventListener('click', async (e) => {
    const a = e.target.closest('.noti-row');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href === '#') e.preventDefault();
    const unreadRow = a.dataset.read === '0';
    if (unreadRow) {
      a.dataset.read = '1';
      a.classList.remove('unread');
      a.querySelector('.noti-dot')?.remove();
      setUnread(unread - 1);
    }
    closePanel();
    if (!unreadRow) return;
    const read = quiet(() => api.readNotification(Number(a.dataset.notiId))).catch(() => {});
    const newTab = e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0;
    if (e.defaultPrevented || newTab) return;
    e.preventDefault();
    await Promise.race([read, new Promise((r) => setTimeout(r, 1500))]);
    location.href = href;
  });

  readAllBtn.addEventListener('click', async () => {
    try {
      await quiet(() => api.readAllNotifications());
      setUnread(0);
      list.querySelectorAll('.noti-row.unread').forEach((r) => {
        r.classList.remove('unread');
        r.dataset.read = '1';
        r.querySelector('.noti-dot')?.remove();
      });
    } catch (e) {
      toast.error(e.message ?? 'ทำเครื่องหมายอ่านแล้วไม่สำเร็จ');
    }
  });

  foot.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-noti-desktop]');
    if (!sw || sw.disabled) return;
    if (desktopOn()) {
      store(keyOn(), '0');
      drawFoot();
      return toast.success('ปิดการแจ้งเตือนนอกหน้าเว็บแล้ว');
    }
    const done = (result) => {
      if (result === 'granted') {
        store(keyOn(), '1');
        // เริ่มนับจากเรื่องล่าสุดตอนนี้ — ไม่เด้งของเก่าย้อนหลัง
        quiet(() => api.listNotifications({ limit: 1 }))
          .then((p) => p.items[0] && store(keySeen(), String(Math.max(seenId(), p.items[0].id))))
          .catch(() => {});
        drawFoot();
        toast.success('เปิดการแจ้งเตือนนอกหน้าเว็บแล้ว');
        showDesktop('ทดสอบการแจ้งเตือน', 'ถ้าเห็นข้อความนี้ แปลว่าเปิดใช้งานได้เรียบร้อยแล้ว', location.href);
      } else {
        store(keyOn(), '0');
        drawFoot();
        toast.error('เบราว์เซอร์ยังไม่อนุญาต จึงเปิดใช้ไม่ได้');
      }
    };
    if (desktopState() === 'granted') return done('granted');
    try {
      const p = Notification.requestPermission(done);
      if (p?.then) p.then(done);
    } catch {
      toast.error('ขอสิทธิ์แจ้งเตือนจากเบราว์เซอร์ไม่สำเร็จ');
    }
  });

  // ถามตัวเลขเป็นระยะ — แท็บซ่อนอยู่ก็ถามต่อถ้าเปิดแจ้งเตือนนอกหน้าเว็บ (ช่วงที่มันมีประโยชน์ที่สุด)
  async function poll() {
    const desk = desktopOn();
    if (document.hidden && !desk) return;
    try {
      const before = unread;
      const { unread: n } = await quiet(() => api.notificationUnread());
      setUnread(n);
      if (desk && n > before) {
        const page = await quiet(() => api.listNotifications({ limit: 5 }));
        pushDesktop(page.items);
      }
    } catch {
      /* ออฟไลน์ชั่วคราว — รอบหน้าค่อยถามใหม่ */
    }
  }
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => !document.hidden && poll());
  poll();

  /** หน้าอื่นสั่งรีเฟรชตัวเลขได้ (เช่น หลังซิงก์สถานะสต็อก) */
  window.addEventListener('hl:notifications-refresh', poll);
}
