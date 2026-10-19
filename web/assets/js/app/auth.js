// การเข้าสู่ระบบฝั่งหน้าเว็บ — เก็บ "ข้อมูลผู้ใช้สำหรับแสดงผล" (ชื่อ/บทบาท) ไว้นำทาง ไม่ใช่กุญแจ
//  - mock: sessionStorage หรือ localStorage เมื่อเลือก "จดจำฉัน"
//  - server: sessionStorage เท่านั้น · ความปลอดภัยจริงอยู่ที่ cookie HttpOnly ของ PHP (JS อ่านไม่ได้)
//    "จดจำฉัน" = refresh cookie ฝั่งเซิร์ฟเวอร์ → เปิดเบราว์เซอร์ใหม่ หน้า login ต่ออายุให้เอง (restore)
import { CONFIG } from '../config.js';
import { api, authApi, AUTH_PROVIDER, UNAUTHORIZED_EVENT } from './api.js';

const KEY = 'hl-session';
const GUEST = { username: 'guest', name: 'ผู้ใช้ทั่วไป', role: 'Guest' };

function read(store) {
  try {
    const s = JSON.parse(store.getItem(KEY) ?? 'null');
    return s && s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/** session ปัจจุบัน หรือ null */
export function getSession() {
  return read(sessionStorage) ?? read(localStorage);
}

export function saveSession(user, remember = false) {
  const s = { ...user, at: Date.now(), expiresAt: Date.now() + CONFIG.auth.sessionHours * 3_600_000 };
  try {
    clearSession();
    (remember && AUTH_PROVIDER === 'mock' ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  return s;
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** รับเฉพาะชื่อไฟล์ .html ในโฟลเดอร์เดียวกัน (กันลิงก์พาไปเว็บอื่น) */
export function safeNext(next) {
  return /^[a-z0-9-]+\.html(\?[^#]*)?$/i.test(next ?? '') ? next : 'index.html';
}

export function loginUrl() {
  const here = `${location.pathname.split('/').pop() || 'index.html'}${location.search}`;
  return `login.html?next=${encodeURIComponent(here)}`;
}

/** ใช้ในทุกหน้า (ผ่าน shell) — ยังไม่ login → ไปหน้า login */
export function requireSession() {
  if (!CONFIG.auth.enabled) return getSession() ?? saveSession(GUEST);
  const s = getSession();
  if (!s) {
    location.replace(loginUrl());
    return null;
  }
  api.setActor?.(s.name);
  return s;
}

export async function logout() {
  try {
    await authApi.logout?.();
  } catch {
    /* ออกจากระบบฝั่งหน้าเว็บต่อแม้ API ล้มเหลว */
  }
  clearSession();
  location.replace('login.html?bye=1');
}

export const isAuthEnabled = () => CONFIG.auth.enabled;
export const isServerAuth = () => AUTH_PROVIDER === 'server';

// session ฝั่งเซิร์ฟเวอร์หมดและต่ออายุไม่ได้ → ล้างข้อมูลแสดงผลแล้วไปหน้า login (กลับมาหน้าเดิมหลังเข้าใหม่)
if (typeof window !== 'undefined') {
  window.addEventListener(UNAUTHORIZED_EVENT, () => {
    clearSession();
    if (!/login\.html$/.test(location.pathname)) location.replace(loginUrl());
  });
}
export { GUEST };
