import { ApiError } from '../../application/errors.js';

/**
 * ระบบสต็อก Uniform ผ่านตัวกลาง web/api/stock_bridge.php (ตัวกลางเซ็นคำขอด้วยกุญแจลับ)
 * หรือ backend `api/stock/bridge` — ตัวกลางที่ตรวจ session ใส่ชื่อผู้ขอเบิกจาก session เอง
 * (requested_by_name ที่ส่งจากที่นี่ใช้เฉพาะโหมดสาธิตที่ไม่ได้ตรวจผู้ใช้)
 * สัญญาของแต่ละคำสั่งดูที่หัวไฟล์ stock_hr/api/welfare.php
 */
export class StockGateway {
  url;
  /** @type {import('./serverAuth.js').ServerAuth | null} มี = ได้ 401 แล้วต่ออายุ session ให้ */
  auth;
  constructor(url, auth = null) {
    this.url = url;
    this.auth = auth;
  }
  call(action, payload = {}) {
    return this.auth ? this.auth.authorized(() => this.send(action, payload)) : this.send(action, payload);
  }
  async send(action, payload) {
    let res;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...payload, action }),
      });
    } catch {
      throw new ApiError('เชื่อมต่อระบบสต็อกไม่ได้', 0);
    }
    const body = await res.json().catch(() => null);
    if (!body) throw new ApiError(`ระบบสต็อกตอบกลับผิดรูปแบบ (HTTP ${res.status})`, 502);
    if (!res.ok || !body.ok) throw new ApiError(body.message ?? body.error ?? `HTTP ${res.status}`, res.status >= 400 ? res.status : 422);
    return body;
  }
  /** event = START → ได้ชุดของพนักงานใหม่ (kit) และ doc_kind = new_staff มาด้วย */
  catalog({ items, logo, siteId, event }) {
    return this.call('catalog', { items, logo, site_id: siteId, event });
  }
  submit(payload) {
    return this.call('submit', payload);
  }
  /** คืน { [ref]: status } — PHP ส่ง [] เมื่อว่าง */
  async status(refs) {
    const b = await this.call('status', { refs });
    return Array.isArray(b.status) ? {} : b.status;
  }
  cancel(ref, reason, byName) {
    return this.call('cancel', { ref, reason, requested_by_name: byName });
  }
}
