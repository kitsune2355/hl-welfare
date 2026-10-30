// จุดเดียวที่เลือกแหล่งข้อมูล — ทุกหน้า import { api } จากไฟล์นี้
// (หน้าจอห้าม import MockApi/HttpApi ตรง ๆ เพื่อให้สลับ mock ↔ PHP ได้โดยไม่แก้หน้าจอ)
import { CONFIG } from '../config.js';
import { AdminApi } from '../infrastructure/http/adminApi.js';
import { HttpApi } from '../infrastructure/http/httpApi.js';
import { ServerAuth } from '../infrastructure/http/serverAuth.js';
import { StockGateway } from '../infrastructure/http/stockGateway.js';
import { MockApi } from '../infrastructure/mock/mockApi.js';
import { progress } from '../ui/loading.js';
import { isPractice, practiceStock, PRACTICE_STORAGE_KEY } from './practice.js';

export const API_MODE = CONFIG.apiMode === 'http' ? 'http' : 'mock';

/** 'mock' = ตรวจรหัสผ่านในเบราว์เซอร์ · 'server' = PHP backend (api/auth/*) */
export const AUTH_PROVIDER =
  CONFIG.auth.provider === 'server' || CONFIG.auth.provider === 'mock'
    ? CONFIG.auth.provider
    : API_MODE === 'http' ? 'server' : 'mock';

/** ต่ออายุ session ไม่ได้ → แจ้ง app/auth.js ให้พาไปหน้า login (ไม่ import auth.js ตรง ๆ กันวนกัน) */
export const UNAUTHORIZED_EVENT = 'hl:unauthorized';
const serverAuth = AUTH_PROVIDER === 'server' ? new ServerAuth(CONFIG.apiBaseUrl) : null;
if (serverAuth) serverAuth.onUnauthorized = () => window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));

/** โหมดฝึกของคู่มือ (app/practice.js) — ข้อมูลตัวอย่างในเบราว์เซอร์ ไม่แตะข้อมูลจริง/ระบบสต็อกจริง · การเข้าสู่ระบบยังเป็นของจริง */
export const PRACTICE = isPractice();

const raw = PRACTICE
  ? new MockApi(undefined, practiceStock(), { storageKey: PRACTICE_STORAGE_KEY })
  : API_MODE === 'http'
    ? new HttpApi(CONFIG.apiBaseUrl, serverAuth)
    : new MockApi(undefined, new StockGateway(CONFIG.stock.bridgeUrl, serverAuth));

/**
 * ทุกคำสั่งที่คืน Promise → แสดง loading กลางจอให้อัตโนมัติเมื่อรอนาน (ui/loading.js)
 * หน้าจอไม่ต้องเรียก progress เอง
 * @param {object} target
 */
const withProgress = (target) =>
  new Proxy(target, {
    get(t, key) {
      const v = Reflect.get(t, key);
      if (typeof v !== 'function') return v;
      return (...args) => {
        const r = v.apply(t, args);
        return r && typeof r.then === 'function' ? progress.track(r) : r;
      };
    },
  });

/** @type {import('../application/ports.js').WelfareApi} */
export const api = withProgress(raw);

/**
 * การเข้าสู่ระบบ: login(username, password, remember) · logout() · restore()? (เฉพาะ server)
 * โหมด mock ใช้ MockApi (ผู้ใช้จำลอง) · โหมด server ใช้ ServerAuth (cookie HttpOnly)
 */
export const authApi = serverAuth ? withProgress(serverAuth) : api;

/** หน้าผู้ดูแลระบบ (admin.html) — null ในโหมด mock (ไม่มีผู้ใช้/session จริง) */
export const adminApi = serverAuth ? withProgress(new AdminApi(serverAuth)) : null;
