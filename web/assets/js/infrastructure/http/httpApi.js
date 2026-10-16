import { ApiError } from '../../application/errors.js';

/** WelfareApi ผ่าน REST → PHP backend (สเปกข้อ 8) */
export class HttpApi {
  baseUrl;
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }
  async req(path, init) {
    let res;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
        credentials: 'include',
      });
    } catch {
      throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 0);
    }
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok || body.error !== undefined) throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body.errors);
    return body.data;
  }
  send(method, path, data) {
    return this.req(path, { method, body: JSON.stringify(data) });
  }
  async del(path) {
    await this.req(path, { method: 'DELETE' });
  }
  // ---------- เข้าสู่ระบบ (PHP ใช้ session cookie) ----------
  login(username, password) {
    return this.send('POST', '/auth/login', { username, password });
  }
  logout() {
    return this.send('POST', '/auth/logout', {});
  }
  setActor() {
    /* PHP ใช้ผู้ใช้จาก session เอง */
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
  listPvdMembers() {
    return this.req('/pvd/members');
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
  getWorkQueue() {
    return this.req('/monitor/tasks');
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
