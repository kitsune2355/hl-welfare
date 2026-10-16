// จุดเดียวที่เลือกแหล่งข้อมูล — ทุกหน้า import { api } จากไฟล์นี้
// (หน้าจอห้าม import MockApi/HttpApi ตรง ๆ เพื่อให้สลับ mock ↔ PHP ได้โดยไม่แก้หน้าจอ)
import { CONFIG } from '../config.js';
import { HttpApi } from '../infrastructure/http/httpApi.js';
import { MockApi } from '../infrastructure/mock/mockApi.js';
import { progress } from '../ui/loading.js';

export const API_MODE = CONFIG.apiMode === 'http' ? 'http' : 'mock';

const raw = API_MODE === 'http' ? new HttpApi(CONFIG.apiBaseUrl) : new MockApi();

/**
 * ทุกคำสั่งที่คืน Promise → แสดง loading กลางจอให้อัตโนมัติเมื่อรอนาน (ui/loading.js)
 * หน้าจอไม่ต้องเรียก progress เอง
 * @type {import('../application/ports.js').WelfareApi}
 */
export const api = new Proxy(raw, {
  get(target, key) {
    const v = Reflect.get(target, key);
    if (typeof v !== 'function') return v;
    return (...args) => {
      const r = v.apply(target, args);
      return r && typeof r.then === 'function' ? progress.track(r) : r;
    };
  },
});
