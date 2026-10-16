// ตรวจแบบฟอร์ม Excel ของบริษัทประกันก่อนบันทึก — คืน { field: ข้อความ } (ว่าง = ผ่าน)
import { COLUMN_SOURCES, DATE_ERA_LABEL, DATE_FORMATS } from '../domain/insurerForm.js';

/**
 * @param {import('../domain/types.js').InsurerForm} f
 * @param {import('../domain/types.js').InsurerForm[]} others  แบบฟอร์มอื่นทั้งหมด (ใช้ตรวจบริษัทซ้ำ)
 */
export function validateInsurerForm(f, others = []) {
  const err = {};
  if (!f.name?.trim()) err.name = 'กรุณาระบุชื่อบริษัทประกัน';
  if (!f.shortName?.trim()) err.shortName = 'กรุณาระบุชื่อย่อ (ใช้ในชื่อไฟล์)';
  if (!DATE_FORMATS[f.dateFormat]) err.dateFormat = 'รูปแบบวันที่ไม่ถูกต้อง';
  if (!DATE_ERA_LABEL[f.dateEra]) err.dateEra = 'กรุณาเลือก พ.ศ. / ค.ศ.';

  const codes = (f.companies ?? []).map((c) => c.companyCode);
  if (new Set(codes).size !== codes.length) err.companies = 'มีบริษัทซ้ำในแบบฟอร์มนี้';
  else if (f.active) {
    // บริษัทหนึ่งส่งแจ้งได้กับบริษัทประกันเดียว (ในแบบฟอร์มที่เปิดใช้)
    const clash = others
      .filter((o) => o.id !== f.id && o.active)
      .flatMap((o) => o.companies.filter((c) => codes.includes(c.companyCode)).map((c) => `${c.companyCode} (${o.name})`));
    if (clash.length) err.companies = `บริษัทนี้ผูกกับแบบฟอร์มที่เปิดใช้อื่นอยู่แล้ว: ${clash.join(', ')} — ปิดแบบฟอร์มนั้นหรือเอาบริษัทออกก่อน`;
  }

  const cols = f.columns ?? [];
  if (!cols.length) err.columns = 'ต้องมีอย่างน้อย 1 คอลัมน์';
  else {
    const bad = cols.findIndex((c) => !COLUMN_SOURCES[c.source] || !String(c.header ?? '').trim() || !(c.width >= 3 && c.width <= 80));
    if (bad >= 0) err.columns = `คอลัมน์ที่ ${bad + 1}: ต้องมีหัวคอลัมน์ แหล่งข้อมูล และความกว้าง 3–80`;
  }
  return err;
}

/** แบบฟอร์มว่างสำหรับ "เพิ่มแบบฟอร์ม" */
export function blankInsurerForm() {
  return {
    id: 0,
    name: '',
    shortName: '',
    active: true,
    companies: [],
    dateFormat: 'DD/MM/YYYY',
    dateEra: 'BE',
    inMark: 'P',
    outMark: 'P',
    sheetName: '{companyCode}',
    fileName: 'แจ้งเข้า-ออก {insurer} {cycleDate}',
    headerLines: [
      { text: '{insurer}', align: 'center', bold: true, size: 14 },
      { text: 'แบบฟอร์มแจ้งสมาชิก เข้าใหม่ / ลาออก', align: 'center', bold: true, size: 12 },
      { text: 'ชื่อผู้ถือกรมธรรม์ : {companyName}    เลขที่กรมธรรม์ : {policyNo}    ประจำเดือน {month}', align: 'left', bold: false, size: 11 },
    ],
    columns: [
      { source: 'seq', header: 'ลำดับ', group: '', width: 6, only: '' },
      { source: 'empCode', header: 'รหัสพนักงาน', group: '', width: 12, only: '' },
      { source: 'titleFullName', header: 'ชื่อ - สกุล', group: '', width: 30, only: '' },
      { source: 'birthDate', header: 'วันเกิด', group: '', width: 12, only: 'IN' },
      { source: 'nationalId', header: 'เลขบัตรประชาชน', group: '', width: 17, only: 'IN' },
      { source: 'inMark', header: 'เข้าใหม่', group: '', width: 9, only: '' },
      { source: 'outMark', header: 'ลาออก', group: '', width: 9, only: '' },
      { source: 'effectiveDate', header: 'วันที่มีผลบังคับ', group: '', width: 13, only: '' },
      { source: 'blank', header: 'หมายเหตุ', group: '', width: 20, only: '' },
    ],
    totalsLine: 'เข้าใหม่ {in} คน    ลาออก {out} คน    รวมทั้งหมด {total} คน',
    footerLines: ['ผู้แจ้ง {signerName}    {signerDept}    โทร {signerPhone}    วันที่แจ้ง {exportDate}'],
    summarySheet: true,
    summaryTitle: 'สรุปข้อมูลประกันชีวิตกลุ่ม สำหรับพนักงานกลุ่มบริษัทในเครือแฮปปี้แลนด์',
    includeEmptySheets: true,
    signer: { name: '', department: '', phone: '' },
  };
}
