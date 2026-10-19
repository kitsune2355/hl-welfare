import { ApiError } from '../../application/errors.js';

/**
 * เข้าสู่ระบบกับ PHP backend (สเปกข้อ 10.9.1)
 *
 * - session cookie (HttpOnly) อายุสั้น + "จดจำฉัน" = refresh cookie (HttpOnly, path /api/auth) — JS อ่านโทเคนไม่ได้
 *   และไม่เก็บโทเคนใน localStorage/sessionStorage เด็ดขาด
 * - authorized(): คำขอได้ 401 → ต่ออายุด้วย /auth/refresh ครั้งเดียวแล้วลองใหม่ · ไม่สำเร็จ → onUnauthorized()
 * - หลายคำขอได้ 401 พร้อมกัน → เรียก refresh ครั้งเดียว (ใช้ Promise ร่วมกัน)
 */
export class ServerAuth {
  baseUrl;
  /** เรียกเมื่อต่ออายุไม่ได้ (หน้าเว็บพาไป login.html) */
  onUnauthorized = () => {};
  #refreshing = null;

  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /** fetch + แปลงคำตอบ { data } / { error, code } → ค่า หรือ ApiError (ไม่ลองต่ออายุ) */
  async call(path, init = {}) {
    let res;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
        credentials: 'include',
      });
    } catch {
      throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 0);
    }
    if (res.status === 204) return undefined;
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok || body.error !== undefined) {
      const e = new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body.errors);
      e.code = body.code;
      throw e;
    }
    return body.data;
  }

  /**
   * รันคำขอ (fn คืน Promise) — ได้ 401 → refresh แล้วลองใหม่ 1 ครั้ง
   * refresh ตอบ 409 REFRESH_RACE = อีกแท็บเพิ่งต่ออายุ (cookie ใหม่มาแล้ว) → ลองคำขอเดิมใหม่ได้เลย
   */
  async authorized(fn) {
    try {
      return await fn();
    } catch (e) {
      if (e?.status !== 401) throw e;
    }
    if (!(await this.tryRefresh())) {
      this.onUnauthorized();
      throw new ApiError('กรุณาเข้าสู่ระบบใหม่', 401);
    }
    try {
      return await fn();
    } catch (e) {
      if (e?.status === 401) this.onUnauthorized();
      throw e;
    }
  }

  /** @returns {Promise<object|null>} ผู้ใช้ เมื่อต่ออายุสำเร็จ */
  tryRefresh() {
    this.#refreshing ??= this.call('/auth/refresh', { method: 'POST', body: '{}' })
      .catch((e) => (e?.code === 'REFRESH_RACE' ? this.call('/auth/me') : null))
      .catch(() => null)
      .finally(() => setTimeout(() => (this.#refreshing = null), 0));
    return this.#refreshing;
  }

  login(username, password, remember = false) {
    return this.call('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, remember }) });
  }

  logout() {
    return this.call('/auth/logout', { method: 'POST', body: '{}' });
  }

  me() {
    return this.authorized(() => this.call('/auth/me'));
  }

  /** เปิดหน้า login ใหม่: มี session อยู่ หรือ "จดจำฉัน" ไว้ → ได้ผู้ใช้คืนโดยไม่ต้องกรอกรหัส · ไม่มี → null */
  async restore() {
    try {
      return await this.call('/auth/me');
    } catch (e) {
      if (e?.status !== 401) throw e;
    }
    return this.tryRefresh();
  }

  changePassword(currentPassword, newPassword) {
    return this.authorized(() =>
      this.call('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
    );
  }
}
