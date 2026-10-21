// AdminApi (หน้า admin.html): path / method / query string ตรงกับ backend/api/routes.php · 422 ส่ง details ต่อให้ฟอร์ม
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdminApi } from '../web/assets/js/infrastructure/http/adminApi.js';
import { ServerAuth } from '../web/assets/js/infrastructure/http/serverAuth.js';

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

function fakeFetch(respond) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ key: `${init.method ?? 'GET'} ${url}`, body: init.body ? JSON.parse(init.body) : undefined });
    return respond(url, init);
  };
  return calls;
}

test('ทุกคำสั่งเรียก endpoint /admin/* ที่ถูกต้อง', async () => {
  const calls = fakeFetch(() => json(200, { data: {} }));
  const a = new AdminApi(new ServerAuth('api'));
  await a.listUsers();
  await a.createUser({ username: 'x' });
  await a.updateUser(5, { isActive: false });
  await a.resetPassword(5, 'Secret-1234');
  await a.signOutEverywhere(5);
  await a.listSessions();
  await a.revokeSession(9);
  await a.revokeDevice('ab'.repeat(16));
  await a.listLoginAttempts('failed');
  await a.clearLockout('USER', 'hr');
  await a.getHealth({ ping: false });
  await a.cleanup(90);
  await a.getSettings();
  await a.saveSettings({ stock_timeout: '30' }, ['refresh_days']);
  await a.testStock({ url: 'https://x/api/welfare.php' });
  await a.getPermissions();
  await a.savePermissions({ 'employees.edit': ['HR_ADMIN'] });
  assert.deepEqual(calls.map((c) => c.key), [
    'GET api/admin/users',
    'POST api/admin/users',
    'PATCH api/admin/users/5',
    'POST api/admin/users/5/password',
    'POST api/admin/users/5/signout',
    'GET api/admin/sessions',
    'DELETE api/admin/sessions/9',
    `DELETE api/admin/devices/${'ab'.repeat(16)}`,
    'GET api/admin/login-attempts?result=failed',
    'POST api/admin/lockouts/clear',
    'GET api/admin/health?ping=0',
    'POST api/admin/cleanup',
    'GET api/admin/settings',
    'PUT api/admin/settings',
    'POST api/admin/stock/test',
    'GET api/admin/permissions',
    'PUT api/admin/permissions',
  ]);
  assert.deepEqual(calls[16].body, { matrix: { 'employees.edit': ['HR_ADMIN'] } });
  assert.deepEqual(calls[13].body, { values: { stock_timeout: '30' }, reset: ['refresh_days'] });
  assert.deepEqual(calls[14].body, { url: 'https://x/api/welfare.php', secret: '' });
  assert.deepEqual(calls[3].body, { password: 'Secret-1234' });
  assert.deepEqual(calls[9].body, { kind: 'USER', key: 'hr' });
  assert.deepEqual(calls[11].body, { days: 90 });
});

test('listAudit: ข้ามตัวกรองว่าง · encode ค่าภาษาไทย', async () => {
  const calls = fakeFetch(() => json(200, { data: { rows: [] } }));
  await new AdminApi(new ServerAuth('api')).listAudit({ entity: 'USER', action: '', q: 'สมใจ', from: '2026-10-01', to: undefined });
  assert.equal(calls[0].key, `GET api/admin/audit?entity=USER&q=${encodeURIComponent('สมใจ')}&from=2026-10-01`);
});

test('422 → ApiError พร้อม details ของแต่ละช่อง', async () => {
  fakeFetch(() => json(422, { error: 'กรุณาตรวจสอบข้อมูล', errors: { username: 'ชื่อผู้ใช้ผิดรูปแบบ' } }));
  await assert.rejects(new AdminApi(new ServerAuth('api')).createUser({}), (e) => e.status === 422 && e.details.username === 'ชื่อผู้ใช้ผิดรูปแบบ');
});
