// แบบฟอร์ม Excel ที่อัปโหลด: เดาตำแหน่ง → ล้างข้อมูลบุคคล → เติมข้อมูลตอนส่งออก (ใช้ ExcelJS ตัวเดียวกับในเว็บ)
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { expect } from './_expect.js';

const root = new URL('../web/', import.meta.url);
// โหลด ExcelJS (UMD) จาก vendor ของเว็บ
const mod = { exports: {} };
new Function('module', 'exports', 'define', fs.readFileSync(new URL('assets/vendor/exceljs/exceljs.min.js', root), 'utf8'))(mod, mod.exports, undefined);
const ExcelJS = mod.exports;

const { useExcelLibs } = await import('../web/assets/js/shared/excel.js');
useExcelLibs({ ExcelJS });
const T = await import('../web/assets/js/app/excelTemplate.js');
const { detectLayout, suggestSource } = await import('../web/assets/js/application/usecases/templateDetect.js');
const { validateInsurerForm, blankInsurerForm } = await import('../web/assets/js/application/insurerFormRules.js');
const { MockApi } = await import('../web/assets/js/infrastructure/mock/mockApi.js');

const TODAY = '2026-10-15';
const CYCLE = '2026-11-05';
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const seed = (name) => ab(fs.readFileSync(new URL(`assets/templates/${name}.xlsx`, root)));
const allText = (g) => {
  const out = [];
  for (let r = 1; r <= g.nRows; r++) for (let c = 1; c <= g.nCols; c++) out.push(g.text(r, c));
  return out.join('|');
};

/** ไฟล์ทดลองแบบที่ HR อัปโหลด: ชีตสรุป + ชีตบริษัทพร้อมข้อมูลสมมติ */
async function demoUpload() {
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet('สรุป');
  sum.mergeCells('A2:G2');
  sum.getCell('A2').value = 'สรุปข้อมูลประกันชีวิตกลุ่ม';
  sum.mergeCells('A3:G3');
  sum.getCell('A3').value = 'ประจำเดือน มกราคม 2569';
  ['ลำดับ', 'สังกัดบริษัท', 'ตัวย่อ', 'แจ้งเข้าใหม่', 'แจ้งออก', 'โอนย้าย/เปลี่ยนแปลง', 'รวม'].forEach((h, i) => (sum.getCell(4, i + 1).value = h));
  [[1, 'บ.สมมติ จำกัด', 'HL', 1, '-', '-', 1]].forEach((r, i) => r.forEach((v, c) => (sum.getCell(5 + i, c + 1).value = v)));
  sum.getCell('A6').value = 'รวม';
  sum.getCell('D6').value = 1;
  const ws = wb.addWorksheet('HL');
  ws.getCell('A2').value = 'บริษัท ประกันตัวอย่าง จำกัด (มหาชน)';
  ws.getCell('A4').value = 'เลขที่กรมธรรม์ :';
  ws.getCell('C4').value = 'X-999';
  ws.getCell('E4').value = 'ประจำเดือน';
  ws.getCell('F4').value = 'มกราคม 2569';
  ws.mergeCells('D6:E6');
  ws.getCell('D6').value = 'เข้าใหม่';
  ['A6:A7', 'B6:B7', 'C6:C7', 'F6:F7'].forEach((m) => ws.mergeCells(m));
  Object.entries({ A6: 'ลำดับ', B6: 'รหัสพนักงาน', C6: 'ชื่อ - สกุล', D7: 'วันเกิด', E7: 'เลขที่บัตรประชาชน', F6: 'ลาออก' }).forEach(([a, v]) => (ws.getCell(a).value = v));
  ws.getCell('A7').border = { top: { style: 'thin' } };
  [
    [1, 'E001', 'นายสมมติ ทดสอบ', '01/01/2533', '1101700230708', ''],
    [2, 'E002', 'นางสาวจำลอง ทดสอบ', '02/02/2534', '1101700230716', ''],
    [3, 'E003', 'นายลาออก ทดสอบ', '', '', 'P'],
  ].forEach((r, i) => r.forEach((v, c) => (ws.getCell(8 + i, c + 1).value = v)));
  ws.getCell('A13').value = 'หมายเหตุ : แจ้งภายในวันที่ 5';
  ws.getCell('D14').value = 'ผู้แจ้ง';
  ws.getCell('E14').value = 'คนแจ้ง สมมติ';
  ws.getCell('D15').value = 'โทรศัพท์ติดต่อ';
  ws.getCell('E15').value = '090-000-0000';
  return wb.xlsx.writeBuffer();
}

describe('อ่านโครงแบบฟอร์ม (เดาตำแหน่ง)', () => {
  it('เดาข้อมูลของคอลัมน์จากหัวคอลัมน์', () => {
    expect(suggestSource(['เลขที่ บัตรประชาชน (ID card No.)'])).toEqual({ source: 'nationalId', only: 'IN' });
    expect(suggestSource(['ประกันชีวิตกลุ่ม', 'เข้าใหม่', 'วันที่มีผลบังคับ'])).toEqual({ source: 'inEffectiveDate' });
    expect(suggestSource(['ประกันชีวิตกลุ่ม', 'ยกเลิก วันที่มีผลบังคับ'])).toEqual({ source: 'outEffectiveDate' });
    expect(suggestSource(['เปลี่ยนแปลง', 'ความคุ้มครอง', 'จากแผน'])).toEqual({ source: 'blank' });
    expect(suggestSource(['เข้าใหม่ (New)'])).toEqual({ source: 'inMark' });
    expect(suggestSource(['ตัวย่อ'], 'summary')).toEqual({ source: 'companyCode' });
  });
  it('ไฟล์อัปโหลด: หัวตาราง 2 ชั้น · แถวข้อมูล · ส่วนท้าย · เซลล์ที่ระบบเติม', async () => {
    const buf = await demoUpload();
    const r = await T.readTemplateFile({ name: 'demo.xlsx', arrayBuffer: async () => buf });
    const a = T.analyzeTemplate(r.sheets);
    expect(a.sheet).toBe('HL');
    // แถวว่างระหว่างข้อมูลกับหมายเหตุ (11–12) นับเป็นส่วนท้าย
    expect([a.layout.headerRow, a.layout.headerEnd, a.layout.dataRow, a.layout.footerRow]).toEqual([6, 7, 8, 11]);
    expect(a.layout.columns.map((c) => c.source)).toEqual(['seq', 'empCode', 'titleFullName', 'birthDate', 'nationalId', 'outMark']);
    expect(a.layout.columns[3].group).toBe('เข้าใหม่');
    expect(a.layout.cells).toEqual({ C4: '{policyNo}', F4: '{month}', E14: '{signerName}', E15: '{signerPhone}' });
    expect(a.summary.sheet).toBe('สรุป');
    expect([a.summary.dataRow, a.summary.footerRow]).toEqual([5, 6]);
    expect(a.summary.cells.A3).toBe('ประจำเดือน  {month}');
  });
  it('ล้างข้อมูลบุคคลก่อนเก็บ: เหลือแถวต้นแบบ 1 แถว · เซลล์ที่ระบบเติมว่าง · เฉพาะชีตที่ใช้', async () => {
    const buf = await demoUpload();
    const r = await T.readTemplateFile({ name: 'demo.xlsx', arrayBuffer: async () => buf });
    const a = T.analyzeTemplate(r.sheets);
    const clean = await T.sanitizeTemplate(r.buffer, { sheet: a.sheet, ...a.layout, summary: a.summary });
    const grids = await T.gridsOf(clean);
    expect(grids.map((g) => g.name)).toEqual(['สรุป', 'HL']);
    const text = grids.map((g) => allText(g.grid)).join('\n');
    expect(/สมมติ|ทดสอบ|1101700230|X-999|090-000|มกราคม/.test(text)).toBe(false);
    expect(text.includes('หมายเหตุ : แจ้งภายในวันที่ 5')).toBe(true); // ข้อความส่วนท้ายยังอยู่
    const l = T.sanitizedLayout(a.layout);
    expect([l.dataRow, l.footerRow]).toEqual([8, 9]);
    expect(l.cells.E12).toBe('{signerName}'); // ข้อมูลตัวอย่าง 3 แถวเหลือ 1 → ส่วนท้ายเลื่อนขึ้น 2 แถว
  });
});

describe('เติมข้อมูลลงแบบฟอร์มตอนส่งออก', () => {
  it('ไทยประกันชีวิต: ชีตสรุป + ชีตละบริษัท · ข้อมูลตรงคอลัมน์ · ส่วนท้ายเลื่อนตามจำนวนคน', async () => {
    const api = new MockApi(() => TODAY);
    const d = await api.exportInsurance({ cycleDate: CYCLE, insurerId: 1 });
    const out = await T.fillTemplate(seed('thai-life'), d, { exportDate: '2026-10-16' });
    const grids = await T.gridsOf(out);
    expect(grids.map((g) => g.name)).toEqual(['สรุป', 'AS', 'CIC', 'CNS', 'HL', 'PRO']);
    const cns = grids.find((g) => g.name === 'CNS').grid;
    const c = d.companies.find((x) => x.companyCode === 'CNS');
    const rows = [...c.in, ...c.out];
    expect(cns.text(6, 3)).toBe('จี3-8002'); // เลขกรมธรรม์
    expect(cns.text(6, 20)).toBe('พฤศจิกายน 2569');
    expect(cns.text(8, 1)).toBe('ลำดับที่\n(No)'); // หัวตารางเดิม
    rows.forEach((row, i) => {
      expect(cns.text(11 + i, 2)).toBe(row.employee.empCode);
      expect(cns.text(11 + i, row.type === 'IN' ? 14 : 15)).toBe('P');
    });
    const foot = 11 + rows.length + 1; // แถวว่างคั่น 1 แถว แล้วตามด้วยหมายเหตุ
    expect(cns.text(foot, 1).startsWith('หมายเหตุ')).toBe(true);
    expect(cns.text(foot + 2, 14)).toBe('16/10/2026'); // วันที่แจ้ง
    const sum = grids[0].grid;
    const total = d.companies.reduce((n, x) => n + x.in.length + x.out.length, 0);
    expect(Number(sum.text(5 + d.companies.length, 7))).toBe(total);
  });
  it('บริษัทประกันที่ไม่มีบริษัทผูก → แจ้งว่าสร้างไม่ได้', async () => {
    const api = new MockApi(() => TODAY);
    const d = await api.exportInsurance({ cycleDate: CYCLE, insurerId: 2 });
    let msg = '';
    try {
      await T.fillTemplate(seed('muang-thai'), { ...d, insurer: { ...d.insurer, template: { ...d.insurer.template, summary: null } } }, { exportDate: TODAY });
    } catch (e) {
      msg = e.message;
    }
    expect(msg.includes('ไม่มีบริษัทที่ผูก')).toBe(true);
  });
  it('ผูกบริษัท: HL, PRO → เมืองไทย · ที่เหลือ → ไทยประกัน', async () => {
    const api = new MockApi(() => TODAY);
    const bindings = ['AS', 'CIC', 'CNS', 'HL', 'PRO'].map((code) => ({ companyCode: code, insurerId: ['HL', 'PRO'].includes(code) ? 2 : 1, policyNo: '', holderName: '', plan: '1' }));
    const forms = await api.saveInsurerBindings(bindings);
    expect(forms.find((f) => f.id === 2).companies.map((c) => c.companyCode)).toEqual(['HL', 'PRO']);
    expect(forms.find((f) => f.id === 1).companies.map((c) => c.companyCode)).toEqual(['AS', 'CIC', 'CNS']);
    const d = await api.exportInsurance({ cycleDate: CYCLE, insurerId: 2 });
    const grids = await T.gridsOf(await T.fillTemplate(seed('muang-thai'), d, { exportDate: TODAY }));
    expect(grids.map((g) => g.name)).toEqual(['สรุป', 'HL', 'PRO']);
  });
});

describe('ตรวจแบบฟอร์ม', () => {
  it('เปิดใช้ต้องมีไฟล์แบบฟอร์ม · ตำแหน่งต้องสมเหตุสมผล', () => {
    const f = { ...blankInsurerForm(), name: 'ก', shortName: 'ก', active: true };
    expect(validateInsurerForm(f).template.includes('อัปโหลด')).toBe(true);
    const bad = { ...f, template: { sheet: 'A', headerRow: 5, headerEnd: 5, dataRow: 4, footerRow: 6, columns: [{ col: 1, source: 'seq' }], cells: {} } };
    expect(validateInsurerForm(bad).template.includes('แถวข้อมูล')).toBe(true);
  });
});

// ไม่ใช้ detectLayout ตรง ๆ ในชุดนี้ แต่ import ไว้ให้แน่ใจว่า export ครบ
void detectLayout;
