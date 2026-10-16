// แบบฟอร์ม Excel ที่อัปโหลด: เดาตำแหน่ง → ล้างข้อมูลบุคคล → เติมข้อมูลตอนส่งออก (ใช้ ExcelJS ตัวเดียวกับในเว็บ)
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { expect } from './_expect.js';

const root = new URL('../web/', import.meta.url);
// โหลด ExcelJS (UMD) จาก vendor ของเว็บ
const mod = { exports: {} };
new Function('module', 'exports', 'define', fs.readFileSync(new URL('assets/vendor/exceljs/exceljs.min.js', root), 'utf8'))(mod, mod.exports, undefined);
const ExcelJS = mod.exports;
const zmod = { exports: {} };
new Function('module', 'exports', 'define', fs.readFileSync(new URL('assets/vendor/jszip/jszip.min.js', root), 'utf8'))(zmod, zmod.exports, undefined);
const JSZip = zmod.exports;

const { useExcelLibs } = await import('../web/assets/js/shared/excel.js');
useExcelLibs({ ExcelJS, JSZip });
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

/** grid จำลองจากตาราง { 'A1': 'ข้อความ' } + merges ['A1:B2'] */
function gridOf(cells, merges = [], nRows = 30, nCols = 15) {
  const ms = merges.map((m) => {
    const [a, b] = m.split(':');
    const p = T.parseAddr(a);
    const q = T.parseAddr(b);
    return { top: p.r, left: p.c, bottom: q.r, right: q.c };
  });
  const text = (r, c) => {
    const m = ms.find((x) => r >= x.top && r <= x.bottom && c >= x.left && c <= x.right);
    return cells[T.addr(m ? m.top : r, m ? m.left : c)] ?? '';
  };
  return { nRows, nCols, text, merges: ms };
}

describe('อ่านโครงไฟล์จริงของ HR (กรณีที่พบ)', () => {
  // โครงตามชีต AS ของไฟล์เมืองไทย: "เปลี่ยนแปลง" อยู่เซลล์เดียว (ไม่ merge) แต่ครอบ K–M · ช่องจำนวนเข้าใหม่ว่าง · ป้ายผู้แจ้งซ้ำ 2 คอลัมน์
  const g = gridOf(
    {
      A9: 'ลำดับ', B9: 'รหัสพนักงาน', C9: 'ชื่อ - สกุล สมาชิก', D9: 'ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม',
      D10: 'เข้าใหม่', I10: 'ยกเลิก', J10: 'เปลี่ยนแปลง',
      D11: 'แผนประกัน', E11: 'วันที่มีผลบังคับ', F11: 'ว/ด/ป/ เกิด', G11: 'เลขที่บัตร', H11: 'เงินเดือน', I11: 'วันที่มีผลบังคับ', J11: 'ความคุ้มครอง', L11: 'วันที่มีผลบังคับ',
      G12: 'ประชาชน', J12: 'จากแผน', K12: 'เป็นแผน',
      A13: '1', B13: 'X1', C13: 'นายตัวอย่าง',
      B18: 'เข้าใหม่', E18: 'คน', F18: 'ลาออก', G18: '2', H18: 'คน', K18: 'รวมทั้งหมด', L18: '2', M18: 'คน',
      B20: 'ลงชื่อผู้แจ้ง', C20: 'ลงชื่อผู้แจ้ง', D20: 'ชื่อ สกุล',
      B21: 'แผนก', C21: 'ฝ่าย', D21: 'สวัสดิการ',
      B23: 'โทร', C23: 'โทร', D23: '02-000-0000',
    },
    ['A9:A12', 'B9:B12', 'C9:C12', 'D9:L9', 'D10:H10', 'D11:D12', 'E11:E12', 'F11:F12', 'H11:H12', 'I11:I12', 'J11:K11', 'L11:L12'],
  );
  const l = detectLayout(g, 'company');
  it('หัวตาราง 4 แถว · กลุ่ม "เปลี่ยนแปลง" ที่ไม่ได้ merge ครอบถึงคอลัมน์ L', () => {
    expect([l.headerRow, l.headerEnd, l.dataRow]).toEqual([9, 12, 13]);
    const src = Object.fromEntries(l.columns.map((c) => [T.addr(1, c.col).replace('1', ''), c.source]));
    expect(src).toEqual({ A: 'seq', B: 'empCode', C: 'titleFullName', D: 'plan', E: 'inEffectiveDate', F: 'birthDate', G: 'nationalId', H: 'salary', I: 'outEffectiveDate', J: 'blank', K: 'blank', L: 'blank' });
  });
  it('ช่องจำนวนว่าง → ใช้ช่องว่างแรกหลังป้าย · ป้ายซ้ำ → ข้ามไปหาค่า', () => {
    expect(l.cells).toEqual({ C18: '{in}', G18: '{out}', L18: '{total}', D20: '{signerName}', D21: '{signerDept}', D23: '{signerPhone}' });
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
      expect(cns.text(11 + i, row.type === 'IN' ? 14 : 15)).toBe('✓');
    });
    const foot = 11 + rows.length + 1; // แถวว่างคั่น 1 แถว แล้วตามด้วยหมายเหตุ
    expect(cns.text(foot, 1).startsWith('หมายเหตุ')).toBe(true);
    expect(cns.text(foot + 2, 14)).toBe('16/10/2026'); // วันที่แจ้ง
    const sum = grids[0].grid;
    const total = d.companies.reduce((n, x) => n + x.in.length + x.out.length, 0);
    expect(Number(sum.text(5 + d.companies.length, 7))).toBe(total);
  });
  it('ช่องเครื่องหมายที่ใช้ฟอนต์ Wingdings 2 → เขียน ✓ เป็น "P" ของฟอนต์นั้น', async () => {
    const api = new MockApi(() => TODAY);
    const d = await api.exportInsurance({ cycleDate: CYCLE, insurerId: 1 });
    const t = d.insurer.template;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(seed('thai-life'));
    const mark = wb.getWorksheet(t.sheet).getCell(t.dataRow, 14); // คอลัมน์เข้าใหม่
    mark.style = { ...mark.style, font: { name: 'Wingdings 2', size: 12 } }; // style ใหม่ (ไม่แก้ style ที่ใช้ร่วมกับเซลล์อื่น)
    const out = await T.fillTemplate(await wb.xlsx.writeBuffer(), d, { exportDate: '2026-10-16' });
    const cns = (await T.gridsOf(out)).find((g) => g.name === 'CNS').grid;
    const c = d.companies.find((x) => x.companyCode === 'CNS');
    [...c.in, ...c.out].forEach((row, i) => expect(cns.text(11 + i, row.type === 'IN' ? 14 : 15)).toBe(row.type === 'IN' ? 'P' : '✓'));
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

describe('ไฟล์ส่งออกเหมือนแบบฟอร์มต้นฉบับ (รูปภาพ กล่องข้อความ จานสี)', () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const sheetPath = async (zip, name) => {
    const wb = await zip.file('xl/workbook.xml').async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const rid = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`name="${name}"`)).match(/r:id="([^"]+)"/)[1];
    const target = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`Id="${rid}"`)).match(/Target="([^"]+)"/)[1];
    return `xl/${target.replace(/^\/?xl\//, '')}`;
  };
  const anchor = (row, inner) =>
    `<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>${inner}<xdr:clientData/></xdr:twoCellAnchor>`;
  /** ใส่โลโก้ (ส่วนบน) + กล่องข้อความ (ส่วนท้าย) + จานสีของไฟล์ ลงแบบฟอร์มตั้งต้น */
  async function decorated(t) {
    const zip = await JSZip.loadAsync(seed('thai-life'));
    const p = await sheetPath(zip, t.sheet);
    const pic = `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`;
    const sp = `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="3" name="Note"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr><xdr:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1400" b="1"/><a:t>ส่งภายใน 30 วัน</a:t></a:r></a:p></xdr:txBody></xdr:sp>`;
    zip.file('xl/drawings/drawing1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchor(0, pic)}${anchor(t.footerRow - 1, sp)}</xdr:wsDr>`);
    zip.file('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>`);
    zip.file('xl/media/logo.png', PNG, { base64: true });
    const relsPath = p.replace(/([^/]+)$/, '_rels/$1.rels');
    const rels = (await zip.file(relsPath)?.async('string')) ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    zip.file(relsPath, rels.replace('</Relationships>', '<Relationship Id="rIdDr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>'));
    const xml = await zip.file(p).async('string');
    zip.file(p, xml.replace('</worksheet>', '<drawing r:id="rIdDr"/></worksheet>').replace(/<worksheet\b(?![^>]*xmlns:r=)/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'));
    let types = await zip.file('[Content_Types].xml').async('string');
    types = types.replace('</Types>', '<Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
    zip.file('[Content_Types].xml', types);
    const styles = await zip.file('xl/styles.xml').async('string');
    zip.file('xl/styles.xml', styles.replace('</styleSheet>', '<colors><indexedColors><rgbColor rgb="FF000000"/><rgbColor rgb="FF123456"/></indexedColors></colors></styleSheet>'));
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  it('รูปภาพ/กล่องข้อความไปอยู่ทุกชีตบริษัท · ที่อยู่ในส่วนท้ายเลื่อนตามจำนวนคน · จานสีของไฟล์ตามไปด้วย', async () => {
    const api = new MockApi(() => TODAY);
    const d = await api.exportInsurance({ cycleDate: CYCLE, insurerId: 1 });
    const t = d.insurer.template;
    const out = await T.fillTemplate(await decorated(t), d, { exportDate: '2026-10-16' });
    const zip = await JSZip.loadAsync(out);
    const c = d.companies.find((x) => x.companyCode === 'CNS');
    const n = c.in.length + c.out.length;
    const p = await sheetPath(zip, 'CNS');
    const rels = await zip.file(p.replace(/([^/]+)$/, '_rels/$1.rels')).async('string');
    const drawing = await zip.file(`xl/drawings/${rels.match(/drawings\/(drawing\d+\.xml)/)[1]}`).async('string');
    expect((await zip.file(p).async('string')).includes('<drawing r:id=')).toBe(true);
    expect(drawing.includes('ส่งภายใน 30 วัน')).toBe(true);
    const rows = [...drawing.matchAll(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/g)].map((m) => Number(m[1]));
    expect(rows).toEqual([0, t.footerRow - 1 + (n - (t.footerRow - t.dataRow))]); // โลโก้อยู่ที่เดิม · กล่องข้อความเลื่อนตามส่วนท้าย
    expect(Object.keys(zip.files).some((f) => /^xl\/media\/.+\.png$/.test(f))).toBe(true);
    expect((await zip.file('xl/styles.xml').async('string')).includes('rgb="FF123456"')).toBe(true);
    // ตัวอย่างในหน้าเว็บเห็นรูปภาพ/กล่องข้อความด้วย
    const grids = await T.gridsOf(out);
    const g = grids.find((x) => x.name === 'CNS').grid;
    expect(g.drawings.map((x) => x.kind)).toEqual(['pic', 'shape']);
    expect(g.indexed[1]).toBe('123456');
  });

  it('merge แนวตั้งในหัวตารางคงเส้นขอบล่างของเซลล์ล่างสุด', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ฟอร์ม');
    ws.getCell('A1').value = 'ลำดับ';
    ws.getCell('B1').value = 'รหัสพนักงาน';
    ws.getCell('C1').value = 'ชื่อ - สกุล';
    ws.getCell('D1').value = 'เลขบัตรประชาชน';
    ws.mergeCells('A1:A2');
    ws.getCell('A2').border = { bottom: { style: 'medium' } };
    ws.getCell('A3').value = 1;
    ws.getCell('A5').value = 'หมายเหตุ';
    const grid = (await T.gridsOf(await wb.xlsx.writeBuffer()))[0].grid;
    const layout = detectLayout(grid, 'company');
    const clean = await T.sanitizeTemplate(await wb.xlsx.writeBuffer(), { sheet: 'ฟอร์ม', ...layout, summary: null });
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(clean);
    expect(back.getWorksheet('ฟอร์ม').getCell('A2').border?.bottom?.style).toBe('medium');
  });
});
