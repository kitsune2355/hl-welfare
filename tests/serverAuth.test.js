// ServerAuth / HttpApi: ได้ 401 → refresh ครั้งเดียวแล้วลองใหม่ · refresh ไม่ได้ → onUnauthorized (fetch ปลอม)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServerAuth } from '../web/assets/js/infrastructure/http/serverAuth.js';
import { HttpApi } from '../web/assets/js/infrastructure/http/httpApi.js';

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

/** routes: { 'METHOD /path': [response, ...] } — ใช้ตามลำดับ ตัวสุดท้ายซ้ำได้ */
function fakeFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`;
    calls.push({ key, init });
    const list = routes[key];
    if (!list) throw new Error(`unexpected ${key}`);
    return list.length > 1 ? list.shift() : list[0];
  };
  return calls;
}

test('401 → refresh → ลองคำขอเดิมใหม่สำเร็จ', async () => {
  const calls = fakeFetch({
    'GET api/sites': [json(401, { error: 'กรุณาเข้าสู่ระบบ' }), json(200, { data: [{ id: 1 }] })],
    'POST api/auth/refresh': [json(200, { data: { username: 'hr' } })],
  });
  let kicked = 0;
  const api = new HttpApi('api');
  api.auth.onUnauthorized = () => kicked++;
  assert.deepEqual(await api.listSites(), [{ id: 1 }]);
  assert.deepEqual(calls.map((c) => c.key), ['GET api/sites', 'POST api/auth/refresh', 'GET api/sites']);
  assert.equal(calls[0].init.credentials, 'include');
  assert.equal(kicked, 0);
});

test('refresh ไม่ได้ → onUnauthorized + ApiError 401 (ไม่วนซ้ำ)', async () => {
  const calls = fakeFetch({
    'GET api/sites': [json(401, { error: 'x' })],
    'POST api/auth/refresh': [json(401, { error: 'กรุณาเข้าสู่ระบบใหม่', code: 'REFRESH_REUSED' })],
  });
  let kicked = 0;
  const api = new HttpApi('api');
  api.auth.onUnauthorized = () => kicked++;
  await assert.rejects(api.listSites(), (e) => e.status === 401);
  assert.equal(kicked, 1);
  assert.equal(calls.filter((c) => c.key === 'POST api/auth/refresh').length, 1);
});

test('คำขอพร้อมกันหลายตัวได้ 401 → refresh ครั้งเดียว', async () => {
  let n = 0;
  const calls = fakeFetch({
    'GET api/sites': [json(401, {}), json(401, {}), json(200, { data: [] })],
    'GET api/companies': [json(200, { data: [] })],
    'POST api/auth/refresh': [json(200, { data: {} })],
  });
  const api = new HttpApi('api');
  api.auth.onUnauthorized = () => n++;
  await Promise.all([api.listSites(), api.listSites()]);
  assert.equal(calls.filter((c) => c.key === 'POST api/auth/refresh').length, 1);
  assert.equal(n, 0);
});

test('refresh ชนกับอีกแท็บ (409 REFRESH_RACE) → ถาม me แล้วลองคำขอเดิมใหม่', async () => {
  const calls = fakeFetch({
    'GET api/sites': [json(401, {}), json(200, { data: ['ok'] })],
    'POST api/auth/refresh': [json(409, { error: 'race', code: 'REFRESH_RACE' })],
    'GET api/auth/me': [json(200, { data: { username: 'hr' } })],
  });
  const api = new HttpApi('api');
  assert.deepEqual(await api.listSites(), ['ok']);
  assert.ok(calls.some((c) => c.key === 'GET api/auth/me'));
});

test('error อื่นไม่ refresh · 422 ส่ง details ต่อ', async () => {
  const calls = fakeFetch({ 'POST api/sites': [json(422, { error: 'ข้อมูลไม่ครบ', errors: { name: 'ต้องกรอก' } })] });
  const api = new HttpApi('api');
  await assert.rejects(api.createSite({}), (e) => e.status === 422 && e.details.name === 'ต้องกรอก');
  assert.equal(calls.length, 1);
});

test('login ส่ง remember · restore ใช้ refresh เมื่อไม่มี session', async () => {
  const calls = fakeFetch({
    'POST api/auth/login': [json(200, { data: { username: 'hr' } })],
    'GET api/auth/me': [json(401, {})],
    'POST api/auth/refresh': [json(200, { data: { username: 'hr', name: 'สมใจ' } })],
  });
  const auth = new ServerAuth('api');
  await auth.login('hr', 'pw', true);
  assert.deepEqual(JSON.parse(calls[0].init.body), { username: 'hr', password: 'pw', remember: true });
  assert.equal((await auth.restore()).name, 'สมใจ');
});

test('restore: ไม่มี session และไม่ได้จดจำ → null', async () => {
  fakeFetch({ 'GET api/auth/me': [json(401, {})], 'POST api/auth/refresh': [json(401, {})] });
  assert.equal(await new ServerAuth('api').restore(), null);
});
