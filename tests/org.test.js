// ตั้งค่าองค์กร — บริษัท / ประเภทพนักงาน (domain/catalog.js · application/orgRules.js · MockApi = backend/api/org.php)
import { afterEach, describe, it } from 'node:test';
import { expect } from './_expect.js';
import { normalizeEmployee, validateEmployee } from '../web/assets/js/application/employeeRules.js';
import { validateCompany, validateEmployeeType } from '../web/assets/js/application/orgRules.js';
import { guessEmployeeType } from '../web/assets/js/application/usecases/employeeImport.js';
import {
  applyCatalog,
  COMPANY_CODES,
  companyColor,
  DEFAULT_COMPANIES,
  DEFAULT_EMPLOYEE_TYPES,
  defaultTypeFor,
  EMPLOYEE_TYPE_LABEL,
  EMPLOYEE_TYPES,
  typesFor,
} from '../web/assets/js/domain/catalog.js';
import { cycleDayOf } from '../web/assets/js/domain/insurance.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';

const make = () => new MockApi(() => '2026-10-16');
const CONTRACT = { code: 'CONTRACT', name: 'สัญญาจ้าง', description: '', companies: ['NW'], usesDeptGroup: false, usesPosition: false, dailyCycle: true, tone: 'success' };
const emp = (over) => ({
  empCode: 'T1', firstName: 'ทดสอบ', lastName: 'ประเภท', companyCode: 'HL', siteId: 1, employeeType: 'CENTRAL',
  deptGroup: 'Support Line', level: 2, birthDate: '1990-01-01', startDate: '2026-01-01', status: 'ACTIVE', ...over,
});
afterEach(() => applyCatalog({ companies: DEFAULT_COMPANIES, employeeTypes: DEFAULT_EMPLOYEE_TYPES }));

describe('ตั้งค่าองค์กร: กฎตรวจ', () => {
  it('บริษัท: รหัสรูปแบบ / ซ้ำ · ชื่อบังคับ · สี #rrggbb · แก้ไม่ตรวจรหัส', () => {
    expect(validateCompany({ code: '1A', name: 'x' }, DEFAULT_COMPANIES, true).code).toBeTruthy();
    expect(validateCompany({ code: 'hl', name: 'x' }, DEFAULT_COMPANIES, true).code).toBe('มีบริษัทรหัสนี้แล้ว');
    expect(validateCompany({ code: 'NW', name: ' ', color: 'red' }, DEFAULT_COMPANIES, true)).toEqual({ name: 'กรุณากรอกชื่อบริษัท', color: 'สีต้องเป็นรูปแบบ #rrggbb' });
    expect(validateCompany({ code: 'HL', name: 'แฮปปี้แลนด์' }, DEFAULT_COMPANIES, false)).toEqual({});
  });
  it('ประเภท: รหัส / ชื่อซ้ำ · บริษัทต้องรู้จัก · ต้องเลือกสี', () => {
    const codes = DEFAULT_COMPANIES.map((c) => c.code);
    expect(validateEmployeeType({ ...CONTRACT, code: 'CENTRAL', companies: null }, DEFAULT_EMPLOYEE_TYPES, codes, true).code).toBe('มีประเภทรหัสนี้แล้ว');
    expect(validateEmployeeType({ ...CONTRACT, name: 'รายวัน', companies: null }, DEFAULT_EMPLOYEE_TYPES, codes, true).name).toBe('มีประเภทชื่อนี้แล้ว');
    expect(validateEmployeeType({ ...CONTRACT }, DEFAULT_EMPLOYEE_TYPES, codes, true).companies).toBeTruthy(); // NW ยังไม่มี
    expect(validateEmployeeType({ ...CONTRACT, companies: [], tone: 'pink' }, DEFAULT_EMPLOYEE_TYPES, codes, true)).toEqual({
      companies: 'เลือกบริษัทอย่างน้อย 1 บริษัท หรือ "ทุกบริษัท"',
      tone: 'เลือกสีป้าย',
    });
    expect(validateEmployeeType({ ...CONTRACT, companies: ['HL'] }, DEFAULT_EMPLOYEE_TYPES, codes, true)).toEqual({});
  });
});

describe('ตั้งค่าองค์กร: พฤติกรรมตามค่าที่ตั้ง (ไม่เช็กรหัส)', () => {
  it('ค่าตั้งต้น = พฤติกรรมเดิม', () => {
    expect(EMPLOYEE_TYPES).toEqual(['CENTRAL', 'PRO_SITE', 'DAILY', 'MAID_CNS']);
    expect(typesFor('HL')).toEqual(['CENTRAL', 'DAILY', 'MAID_CNS']);
    expect(typesFor('PRO')).toEqual(['CENTRAL', 'PRO_SITE', 'DAILY', 'MAID_CNS']);
    expect(cycleDayOf({ employeeType: 'DAILY' }, { insuranceCycleDay: 5, insuranceCycleDayDaily: 6 })).toBe(6);
    expect(validateEmployee(emp({ deptGroup: null })).deptGroup).toBeTruthy();
    expect(validateEmployee(emp({ employeeType: 'PRO_SITE' })).employeeType).toBe('ประเภท Pro Site ใช้กับบริษัทนี้ไม่ได้');
  });
  it('เพิ่มบริษัท + ประเภทใหม่ → ใช้ได้ทันทีทั้งระบบ', () => {
    applyCatalog({
      companies: [...DEFAULT_COMPANIES, { code: 'NW', name: 'นิวเวิลด์', legalName: '', color: '' }],
      employeeTypes: [...DEFAULT_EMPLOYEE_TYPES, CONTRACT],
    });
    expect(COMPANY_CODES.at(-1)).toBe('NW');
    expect(EMPLOYEE_TYPE_LABEL.CONTRACT).toBe('สัญญาจ้าง');
    expect(/^#[0-9a-f]{6}$/.test(companyColor('NW'))).toBe(true);
    expect(typesFor('NW')).toEqual(['CENTRAL', 'DAILY', 'MAID_CNS', 'CONTRACT']);
    // รอบรายวันตามที่ตั้ง
    expect(cycleDayOf({ employeeType: 'CONTRACT' }, { insuranceCycleDay: 5, insuranceCycleDayDaily: 6 })).toBe(6);
    // ไม่ต้องมีกลุ่ม/ฝ่าย · ใช้กับบริษัทอื่นไม่ได้
    expect(validateEmployee(emp({ companyCode: 'NW', employeeType: 'CONTRACT', deptGroup: null, level: null }))).toEqual({});
    expect(validateEmployee(emp({ employeeType: 'CONTRACT' })).employeeType).toBe('ประเภท สัญญาจ้าง ใช้กับบริษัทนี้ไม่ได้');
    // เปลี่ยนบริษัทของพนักงานประเภทที่จำกัดบริษัท → ประเภทแรกที่ใช้ได้ + ล้างกลุ่ม/ฝ่ายตามพฤติกรรม
    const n = normalizeEmployee(emp({ companyCode: 'HL', employeeType: 'CONTRACT', deptGroup: 'x', level: 3 }), []);
    expect([n.employeeType, n.deptGroup, n.level]).toEqual(['CENTRAL', 'x', 3]);
    const m = normalizeEmployee(emp({ companyCode: 'NW', employeeType: 'CONTRACT', deptGroup: 'x', level: 3 }), []);
    expect([m.employeeType, m.deptGroup, m.level]).toEqual(['CONTRACT', null, null]);
    // นำเข้า: กรอกชื่อประเภทใหม่ใน template
    expect(guessEmployeeType({ companyCode: 'NW', typeLabel: 'สัญญาจ้าง', unit: '' })).toBe('CONTRACT');
  });
  it('ลบประเภทส่วนกลาง → ประเภทตั้งต้นของแถวใหม่เป็นประเภทแรกที่เหลือ · การนำเข้าไม่เดาประเภทที่ไม่มีแล้ว', () => {
    applyCatalog({ employeeTypes: DEFAULT_EMPLOYEE_TYPES.filter((t) => t.code !== 'CENTRAL' && t.code !== 'PRO_SITE') });
    expect(defaultTypeFor('HL')).toBe('DAILY');
    expect(guessEmployeeType({ companyCode: 'PRO', typeLabel: '', unit: 'PRO/FM/ไซต์' })).toBe('DAILY');
  });
});

describe('ตั้งค่าองค์กร: MockApi', () => {
  it('บริษัท: เพิ่ม → ต่อท้าย · จัดลำดับ · ปิดใช้งาน (ไม่มีลบ) · ปิดตัวสุดท้ายไม่ได้', async () => {
    const api = make();
    const c = await api.saveCompany({ code: 'nw', name: 'นิวเวิลด์', legalName: '', color: '#EF4444' }, true);
    expect([c.code, c.color, c.siteCount]).toEqual(['NW', '#ef4444', 0]);
    expect((await api.listCompanies()).at(-1).code).toBe('NW');
    const order = ['NW', 'HL', 'PRO', 'CNS', 'CIC', 'AS'];
    await api.saveCompanyOrder(order);
    expect((await api.listCompanies()).map((x) => x.code)).toEqual(order);
    const off = await api.saveCompany({ ...c, active: false }, false);
    expect([off.active, (await api.listCompanies()).find((x) => x.code === 'NW').active]).toEqual([false, false]);
    for (const x of await api.listCompanies({ usage: true })) if (x.code !== 'HL') await api.saveCompany({ ...x, active: false }, false);
    const hl = (await api.listCompanies({ usage: true })).find((x) => x.code === 'HL');
    await expect(api.saveCompany({ ...hl, active: false }, false)).rejects.toMatchObject({ status: 409 }); // ต้องเปิดอย่างน้อย 1
    expect('deleteCompany' in api).toBe(false);
  });
  it('ประเภท: รายการเบา / พร้อมจำนวนที่ใช้ · เพิ่ม · ปิดใช้งาน = เลือกใหม่ไม่ได้ (คนเดิมใช้ต่อ)', async () => {
    const api = make();
    const plain = await api.listEmployeeTypes();
    expect([plain.length, plain[0].employeeCount]).toEqual([4, undefined]);
    const used = await api.listEmployeeTypes({ usage: true });
    expect(used.find((t) => t.code === 'CENTRAL').employeeCount).toBeGreaterThan(0);
    const t = await api.saveEmployeeType({ ...CONTRACT, companies: ['HL'] }, true);
    expect([t.code, t.employeeCount, t.ruleCount]).toEqual(['CONTRACT', 0, 0]);
    const daily = (await api.listEmployeeTypes({ usage: true })).find((x) => x.code === 'DAILY');
    await api.saveEmployeeType({ ...daily, active: false }, false);
    const [d] = await api.listEmployees({ employeeType: 'DAILY' });
    expect((await api.saveEmployee({ ...d, phone: '0822222222' })).employeeType).toBe('DAILY'); // คนเดิมแก้ได้
    const [c] = await api.listEmployees({ employeeType: 'CENTRAL', companyCode: 'HL' });
    await expect(api.saveEmployee({ ...c, employeeType: 'DAILY', deptGroup: null, level: null })).rejects.toMatchObject({ status: 422 });
    expect('deleteEmployeeType' in api).toBe(false);
  });
});
