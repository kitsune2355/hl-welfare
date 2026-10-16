// ตัวช่วยตรวจผลแบบ expect(...).toBe(...) สำหรับ node:test (ไม่ต้องติดตั้งแพ็กเกจ)
import assert from 'node:assert/strict';

const isObj = (v) => v !== null && typeof v === 'object';
function matches(actual, expected) {
  if (!isObj(expected)) return Object.is(actual, expected);
  if (!isObj(actual)) return false;
  return Object.keys(expected).every((k) => matches(actual[k], expected[k]));
}

function matchers(actual) {
  return {
    toBe: (e) => assert.equal(actual, e),
    toEqual: (e) => assert.deepEqual(actual, e),
    toBeNull: () => assert.equal(actual, null),
    toBeTruthy: () => assert.ok(actual),
    toBeGreaterThan: (n) => assert.ok(actual > n, `${actual} ควร > ${n}`),
    toContain: (x) => assert.ok(actual instanceof Set ? actual.has(x) : actual.includes(x), `ไม่พบ ${x}`),
    toMatchObject: (e) => assert.ok(matches(actual, e), `${JSON.stringify(actual)} ไม่ตรงกับ ${JSON.stringify(e)}`),
    toBeInstanceOf: (C) => assert.ok(actual instanceof C, `ไม่ใช่ ${C.name}`),
  };
}

export function expect(actual) {
  return {
    ...matchers(actual),
    rejects: new Proxy(
      {},
      {
        get: (_, name) => async (arg) => {
          try {
            await actual;
          } catch (err) {
            return matchers(err)[name](arg);
          }
          assert.fail('ควรเกิด error แต่ไม่เกิด');
        },
      },
    ),
  };
}
