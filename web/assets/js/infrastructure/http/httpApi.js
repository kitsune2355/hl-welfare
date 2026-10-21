import { ServerAuth } from './serverAuth.js';

/**
 * WelfareApi ผ่าน REST → PHP backend (สเปกข้อ 8)
 * ได้ 401 → ต่ออายุ session ด้วย /auth/refresh ครั้งเดียวแล้วลองใหม่ · ไม่สำเร็จ → auth.onUnauthorized (ไปหน้า login)
 */
export class HttpApi {
  baseUrl;
  /** @type {ServerAuth} */
  auth;
  constructor(baseUrl, auth = new ServerAuth(baseUrl)) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.auth = auth;
  }
  req(path, init) {
    return this.auth.authorized(() => this.auth.call(path, init));
  }
  send(method, path, data) {
    return this.req(path, { method, body: JSON.stringify(data) });
  }
  async del(path) {
    await this.req(path, { method: 'DELETE' });
  }
  // ---------- เข้าสู่ระบบ (session cookie + refresh cookie แบบ HttpOnly — ดู serverAuth.js) ----------
  login(username, password, remember = false) {
    return this.auth.login(username, password, remember);
  }
  logout() {
    return this.auth.logout();
  }
  setActor() {
    /* PHP ใช้ผู้ใช้จาก session เอง — ไม่รับชื่อจากหน้าเว็บ */
  }
  getDashboard() {
    return this.req('/dashboard');
  }
  listCompanies() {
    return this.req('/companies');
  }
  listSites() {
    return this.req('/sites');
  }
  createSite(input) {
    return this.send('POST', '/sites', input);
  }
  updateSite(id, patch) {
    return this.send('PATCH', `/sites/${id}`, patch);
  }
  deleteSite(id) {
    return this.del(`/sites/${id}`);
  }
  listEmployees(filter = {}) {
    const qs = new URLSearchParams();
    if (filter.q) qs.set('q', filter.q);
    if (filter.companyCode) qs.set('company', filter.companyCode);
    if (filter.employeeType) qs.set('type', filter.employeeType);
    if (filter.status) qs.set('status', filter.status);
    const s = qs.toString();
    return this.req(`/employees${s ? `?${s}` : ''}`);
  }
  getEmployeeBenefits(id) {
    return this.req(`/employees/${id}/benefits`);
  }
  saveEmployee(emp) {
    return emp.id ? this.send('PUT', `/employees/${emp.id}`, emp) : this.send('POST', '/employees', emp);
  }
  deleteEmployee(id) {
    return this.del(`/employees/${id}`);
  }
  getRules() {
    return this.req('/rules');
  }
  getInsuranceCycle(cycleDate) {
    return this.req(`/insurance/cycles/${cycleDate}`);
  }
  listInsuranceBatches() {
    return this.req('/insurance/batches');
  }
  getInsuranceBatch(id) {
    return this.req(`/insurance/batches/${id}`);
  }
  exportInsuranceBatch(id) {
    return this.req(`/insurance/batches/${id}/export`);
  }
  // ---------- กลุ่ม / ฝ่าย (backend/api/dept_groups.php) ----------
  listDeptGroups() {
    return this.req('/dept-groups');
  }
  saveDeptGroup(input) {
    return input.id ? this.send('PUT', `/dept-groups/${input.id}`, input) : this.send('POST', '/dept-groups', input);
  }
  deleteDeptGroup(id) {
    return this.del(`/dept-groups/${id}`);
  }
  // ---------- แบบฟอร์มบริษัทประกัน + ส่งออกไฟล์ ----------
  listInsurers() {
    return this.req('/insurers');
  }
  saveInsurer(input) {
    return input.id ? this.send('PUT', `/insurers/${input.id}`, input) : this.send('POST', '/insurers', input);
  }
  saveInsurerBindings(bindings) {
    return this.send('PUT', '/insurers/bindings', { bindings });
  }
  deleteInsurer(id) {
    return this.del(`/insurers/${id}`);
  }
  exportInsurance(input) {
    return this.send('POST', '/insurance/exports', input);
  }
  submitInsuranceBatch(input) {
    return this.send('POST', '/insurance/batches', input);
  }
  cancelInsuranceBatch(id) {
    return this.del(`/insurance/batches/${id}`);
  }
  listUniformIssues(employeeId) {
    return this.req(`/uniform/issues${employeeId ? `?employeeId=${employeeId}` : ''}`);
  }
  createUniformIssue(input) {
    return this.send('POST', '/uniform/issues', input);
  }
  listUniformPending() {
    return this.req('/uniform/pending');
  }
  cancelUniformIssue(id) {
    return this.del(`/uniform/issues/${id}`);
  }
  // ---------- แก้เงื่อนไขสวัสดิการ (มีวันที่มีผล) · backend/api/rules_edit.php ----------
  getRuleHistory() {
    return this.req('/rules/history');
  }
  createRule(kind, rule) {
    return this.send('POST', `/rules/${kind}`, rule);
  }
  updateRule(kind, id, rule) {
    return this.send('PUT', `/rules/${kind}/${id}`, rule);
  }
  retireRule(kind, id, effectiveFrom) {
    return this.req(`/rules/${kind}/${id}?effectiveFrom=${encodeURIComponent(effectiveFrom)}`, { method: 'DELETE' });
  }
  cancelRuleRevision(kind, revisionId) {
    return this.req(`/rules/${kind}/revisions/${revisionId}`, { method: 'DELETE' });
  }
  saveRuleSettings(input) {
    return this.send('PUT', '/rules/settings', input);
  }
  cancelSettingChange(key, date) {
    return this.req(`/rules/settings/${encodeURIComponent(key)}/${date}`, { method: 'DELETE' });
  }
  saveSiteUniform(siteId, overrides) {
    return this.send('PUT', `/sites/${siteId}/uniform`, { overrides });
  }
  /** ส่งบริษัท/หน่วยงาน/ชุดฟอร์มรอบเริ่มงานทั้งหมดไปสต็อก Uniform (backend/api/master_sync.php) */
  syncMasterToStock() {
    return this.send('POST', '/stock/sync-master', {});
  }
  // ---------- ส่งเบิกผ่านระบบสต็อก Uniform (PHP เป็นคนเซ็นคำขอและคุยกับ stock_hr) ----------
  getUniformStockOptions(employeeId, entitlementKey) {
    return this.req(`/uniform/stock-options?employeeId=${employeeId}&entitlementKey=${encodeURIComponent(entitlementKey)}`);
  }
  requestUniformFromStock(input) {
    return this.send('POST', '/uniform/stock-requests', input);
  }
  syncUniformStock() {
    return this.send('POST', '/uniform/stock-sync', {});
  }
  getWorkQueue() {
    return this.req('/monitor/tasks');
  }
  // ---------- การแจ้งเตือน (กระดิ่ง) ----------
  listNotifications({ before, limit = 10 } = {}) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (before) qs.set('before', String(before));
    return this.req(`/notifications?${qs}`);
  }
  notificationUnread() {
    return this.req('/notifications/unread');
  }
  readNotification(id) {
    return this.send('POST', `/notifications/${id}/read`, {});
  }
  readAllNotifications() {
    return this.send('POST', '/notifications/read-all', {});
  }
  listActivity(filter = {}) {
    const qs = new URLSearchParams();
    if (filter.entity) qs.set('entity', filter.entity);
    if (filter.employeeId !== undefined) qs.set('employeeId', String(filter.employeeId));
    if (filter.limit) qs.set('limit', String(filter.limit));
    const s = qs.toString();
    return this.req(`/activity${s ? `?${s}` : ''}`);
  }
}
