import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { ApiError } from '../web/assets/js/application/errors.js';
import { validateInsurerForm } from '../web/assets/js/application/insurerFormRules.js';
import { buildInsurerExport, buildSheetModel, exportCsvRows, formatFormDate, headerLayout } from '../web/assets/js/application/usecases/insurerExport.js';
import { isValidThaiId, thaiIdCheckDigit } from '../web/assets/js/domain/thaiId.js';
import { defaultInsurers } from '../web/assets/js/infrastructure/mock/insurers.js';
import { MockApi } from '../web/assets/js/infrastructure/mock/mockApi.js';
import { buildSeed } from '../web/assets/js/infrastructure/mock/seed.js';

const TODAY = '2026-10-15';
const CYCLE = '2026-11-05';
const [THAI_LIFE, MUANG_THAI] = defaultInsurers();

describe('เลขบัตรประชาชน', () => {
  it('ตรวจ check digit', () => {
    const first12 = '110170023070';
    const ok = first12 + thaiIdCheckDigit(first12);
    expect(isValidThaiId(ok)).toBe(true);
    expect(isValidThaiId(`${ok.slice(0, 12)}${(Number(ok[12]) + 1) % 10}`)).toBe(false);
    expect(isValidThaiId('1-1017-00230-70-' + ok[12])).toBe(true);
    expect(isValidThaiId('12345')).toBe(false);
  });
});

describe('แบบฟอร์มบริษัทประกัน', () => {
  it('ตั้งต้น 2 แบบฟอร์มผ่านการตรวจ', () => {
    const forms = defaultInsurers();
    for (const f of forms) expect(validateInsurerForm(f, forms)).toEqual({});
  });
  it('เปิดใช้แบบฟอร์มที่บริษัทซ้ำกับแบบฟอร์มอื่น → error companies', () => {
    const forms = defaultInsurers();
    const err = validateInsurerForm({ ...forms[1], active: true }, forms);
    expect(err.companies.includes('HL')).toBe(true);
  });
  it('ต้องมีชื่อ / คอลัมน์ / ความกว้างถูกต้อง', () => {
    const err = validateInsurerForm({ ...THAI_LIFE, id: 9, active: false, name: '', columns: [{ source: 'seq', header: 'ลำดับ', width: 1 }] }, []);
    expect(Object.keys(err).sort()).toEqual(['columns', 'name']);
  });
  it('หัวตาราง 2 ชั้น (เมืองไทย): กลุ่ม merge แนวนอน หัวที่ไม่มีกลุ่ม merge แนวตั้ง', () => {
    const h = headerLayout(MUANG_THAI.columns);
    expect(h.depth).toBe(3);
    const has = (m) => h.merges.some((x) => x.join() === m.join());
    expect(has([0, 3, 0, 11])).toBe(true); // ประกันชีวิตกลุ่ม... ครอบ เข้าใหม่+ยกเลิก+เปลี่ยนแปลง
    expect(has([1, 3, 1, 7])).toBe(true); // เข้าใหม่ 5 คอลัมน์
    expect(has([1, 9, 1, 11])).toBe(true); // เปลี่ยนแปลง 3 คอลัมน์
    expect(has([0, 0, 2, 0])).toBe(true); // ลำดับ ยืด 3 แถว
    expect(has([1, 13, 2, 13])).toBe(true); // ใต้กลุ่ม "หมายเหตุ" ยืด 2 แถว
    expect(h.cells.find((c) => c.r === 1 && c.c === 8).v).toBe('ยกเลิก');
  });
  it('รูปแบบวันที่', () => {
    expect(formatFormDate('2026-02-05', 'DD/MM/YYYY', 'BE')).toBe('05/02/2569');
    expect(formatFormDate('2026-02-05', 'D/M/YYYY', 'BE')).toBe('5/2/2569');
    expect(formatFormDate('1997-07-18', 'DD/MM/YYYY', 'CE')).toBe('18/07/1997');
    expect(formatFormDate('2026-02-05', 'D/M/YY', 'BE')).toBe('5/2/69');
  });
});

describe('ส่งออกไฟล์แจ้งประกัน', () => {
  const db = buildSeed(TODAY);
  const data = buildInsurerExport({ cycleDate: CYCLE, insurer: THAI_LIFE, ...db });

  it('แยกชีตตามบริษัท · เข้าก่อนออก · ยังไม่ส่งออก', () => {
    expect(data.companies.map((c) => c.companyCode)).toEqual(['AS', 'CIC', 'CNS', 'HL', 'PRO']);
    const all = data.companies.flatMap((c) => [...c.in, ...c.out]);
    expect(all.length > 0).toBe(true);
    expect(all.every((r) => !r.submitted)).toBe(true);
    expect(all.filter((r) => r.type === 'URGENT').map((r) => r.employee.lastName).sort()).toEqual(['ทำผิด', 'เลิกจ้าง']);
  });
  it('เตือนข้อมูลไม่ครบเฉพาะแถวเข้าใหม่', () => {
    for (const m of data.missing) expect(m.fields.length > 0).toBe(true);
    const inIds = new Set(data.companies.flatMap((c) => c.in.map((r) => r.employee.id)));
    expect(data.missing.every((m) => inIds.has(m.employee.id))).toBe(true);
  });
  it('โมเดลชีต: สรุป + ชีตละบริษัท · ค่าในเซลล์ตามแบบฟอร์ม', () => {
    const model = buildSheetModel(data, { exportDate: TODAY });
    expect(model.sheets.map((s) => s.name)).toEqual(['สรุป', 'AS', 'CIC', 'CNS', 'HL', 'PRO']);
    expect(model.fileName).toBe('แจ้งเข้า-ออก ไทยประกันชีวิต 2026-11-05');
    const sheet = model.sheets.find((s) => s.name === data.companies.find((c) => c.in.length).companyCode);
    const first = data.companies.find((c) => c.companyCode === sheet.name).in[0];
    const dataRow = Math.max(...sheet.headerRows) + 1;
    const at = (c) => sheet.cells.find((x) => x.r === dataRow && x.c === c)?.v;
    expect(at(0)).toBe(1);
    expect(at(1)).toBe(first.employee.empCode);
    expect(at(2)).toBe(`${first.employee.title}${first.employee.firstName} ${first.employee.lastName}`);
    expect(at(13)).toBe('P'); // เข้าใหม่
    expect(at(14)).toBe(''); // ลาออก
    expect(at(17)).toBe('05/11/2026'); // วันที่มีผล = วันที่รอบ (ค.ศ.)
    expect(sheet.cells.some((x) => String(x.v).includes('จี3-8002')) || sheet.name !== 'CNS').toBe(true);
    const summary = model.sheets[0];
    const total = summary.cells.filter((x) => x.r === 4 + data.companies.length && x.c === 6)[0].v;
    expect(total).toBe(data.companies.reduce((a, c) => a + c.in.length + c.out.length, 0));
  });
  it('CSV: ตารางเดียว คอลัมน์แรก = บริษัท', () => {
    const csv = exportCsvRows(data);
    expect(csv.header[0]).toBe('บริษัท');
    expect(csv.header.length).toBe(THAI_LIFE.columns.length + 1);
    expect(csv.rows.length).toBe(data.companies.reduce((a, c) => a + c.in.length + c.out.length, 0));
  });
});

describe('MockApi: ส่งออก = บันทึกว่าแจ้งแล้ว', () => {
  it('บันทึก → ไม่ค้าง · ส่งออกซ้ำ = แทนที่ · ยกเลิกได้', async () => {
    const api = new MockApi(() => TODAY);
    const before = await api.listInsuranceBatches();
    const preview = await api.exportInsurance({ cycleDate: CYCLE, insurerId: 1 });
    expect(preview.batches.length).toBe(0);
    expect((await api.listInsuranceBatches()).length).toBe(before.length); // ดาวน์โหลดอย่างเดียว ไม่บันทึก
    const n = preview.companies.reduce((a, c) => a + c.in.length + c.out.length, 0);

    const rec = await api.exportInsurance({ cycleDate: CYCLE, insurerId: 1, record: true });
    expect(rec.batches.every((b) => b.insurerId === 1 && b.cycleDate === CYCLE)).toBe(true);
    expect(rec.batches.reduce((a, b) => a + b.employeeIds.length, 0)).toBe(n);
    expect((await api.getDashboard()).urgentPending).toBe(0);

    const again = await api.exportInsurance({ cycleDate: CYCLE, insurerId: 1, record: true });
    expect(again.companies.reduce((a, c) => a + c.in.length + c.out.length, 0)).toBe(n); // ส่งออกซ้ำได้รายชื่อเดิม
    expect((await api.listInsuranceBatches()).length).toBe(before.length + rec.batches.length); // แทนที่ ไม่เพิ่มซ้ำ

    // รอบถัดไปไม่มีรายการที่ส่งออกแล้วตกค้าง
    const next = await api.exportInsurance({ cycleDate: '2026-12-05', insurerId: 1 });
    const ids = new Set(rec.batches.flatMap((b) => b.employeeIds));
    expect(next.companies.flatMap((c) => [...c.in, ...c.out]).some((r) => ids.has(r.employee.id) && r.type === 'URGENT')).toBe(false);

    for (const b of again.batches) await api.cancelInsuranceBatch(b.id);
    expect((await api.getDashboard()).urgentPending).toBe(2);
  });
  it('CRUD แบบฟอร์ม + ตรวจบริษัทซ้ำ', async () => {
    const api = new MockApi(() => TODAY);
    const [mt] = (await api.listInsurers()).filter((f) => f.id === 2);
    await expect(api.saveInsurer({ ...mt, active: true })).rejects.toBeInstanceOf(ApiError);
    const created = await api.saveInsurer({ ...mt, id: 0, name: 'ทดสอบ', shortName: 'ทดสอบ', active: false });
    expect(created.id).toBe(3);
    const upd = await api.saveInsurer({ ...created, companies: [{ companyCode: 'HL', policyNo: 'X-1', holderName: '', plan: '2' }] });
    expect(upd.companies[0].policyNo).toBe('X-1');
    await api.deleteInsurer(created.id);
    expect((await api.listInsurers()).length).toBe(2);
    await expect(api.exportInsurance({ cycleDate: CYCLE, insurerId: created.id })).rejects.toBeInstanceOf(ApiError);
  });
});
