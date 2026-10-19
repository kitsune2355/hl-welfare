import { ServerAuth } from './serverAuth.js';

/**
 * หน้าผู้ดูแลระบบ (admin.html) → PHP backend/api/admin.php · SUPER_ADMIN เท่านั้น (เซิร์ฟเวอร์ตรวจเอง → 403)
 * มีเฉพาะโหมด server — โหมด mock ไม่มีตารางผู้ใช้/session จริง
 */
export class AdminApi {
  /** @param {ServerAuth} auth */
  constructor(auth) {
    this.auth = auth;
  }
  req(path, init) {
    return this.auth.authorized(() => this.auth.call(path, init));
  }
  send(method, path, data = {}) {
    return this.req(path, { method, body: JSON.stringify(data) });
  }
  // ---------- ผู้ใช้ ----------
  listUsers() {
    return this.req('/admin/users');
  }
  createUser(input) {
    return this.send('POST', '/admin/users', input);
  }
  updateUser(id, patch) {
    return this.send('PATCH', `/admin/users/${id}`, patch);
  }
  resetPassword(id, password) {
    return this.send('POST', `/admin/users/${id}/password`, { password });
  }
  signOutEverywhere(id) {
    return this.send('POST', `/admin/users/${id}/signout`);
  }
  // ---------- session / อุปกรณ์ / การเข้าสู่ระบบ ----------
  listSessions() {
    return this.req('/admin/sessions');
  }
  revokeSession(id) {
    return this.req(`/admin/sessions/${id}`, { method: 'DELETE' });
  }
  revokeDevice(familyId) {
    return this.req(`/admin/devices/${familyId}`, { method: 'DELETE' });
  }
  listLoginAttempts(result = '') {
    return this.req(`/admin/login-attempts${result ? `?result=${result}` : ''}`);
  }
  clearLockout(kind, key) {
    return this.send('POST', '/admin/lockouts/clear', { kind, key });
  }
  // ---------- บันทึกการใช้งาน / สถานะระบบ ----------
  /** @param {{entity?: string, action?: string, user?: string, q?: string, from?: string, to?: string, limit?: number}} filter */
  listAudit(filter = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    return this.req(`/admin/audit${s ? `?${s}` : ''}`);
  }
  getHealth({ ping = true } = {}) {
    return this.req(`/admin/health${ping ? '' : '?ping=0'}`);
  }
  cleanup(days) {
    return this.send('POST', '/admin/cleanup', { days });
  }
  // ---------- ตั้งค่าระบบ (system_settings ทับ backend/config.php) ----------
  getSettings() {
    return this.req('/admin/settings');
  }
  /** values = { key: ค่าใหม่ } (กุญแจว่าง = ไม่เปลี่ยน) · reset = [key] กลับไปใช้ config.php */
  saveSettings(values = {}, reset = []) {
    return this.send('PUT', '/admin/settings', { values, reset });
  }
  // ---------- สิทธิ์การใช้งาน (SUPER_ADMIN) ----------
  getPermissions() {
    return this.req('/admin/permissions');
  }
  /** matrix = { capability: [role, …] } — ส่งเฉพาะที่เปลี่ยน */
  savePermissions(matrix) {
    return this.send('PUT', '/admin/permissions', { matrix });
  }
  /** ทดสอบสต็อกด้วย url/secret ที่ยังไม่บันทึก (ไม่ส่ง = ค่าที่บันทึกไว้) */
  testStock({ url = '', secret = '' } = {}) {
    return this.send('POST', '/admin/stock/test', { url, secret });
  }
}
