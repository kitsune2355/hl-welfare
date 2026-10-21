// ตรวจแบบฟอร์มบริษัทประกันก่อนบันทึก — คืน { field: ข้อความ } (ว่าง = ผ่าน)
import { DATE_ERA_LABEL, DATE_FORMATS } from '../domain/insurerForm.js';

/** ตำแหน่งในไฟล์แบบฟอร์ม (ชีตบริษัท / ชีตสรุป) สมเหตุสมผลไหม */
function layoutError(l, label) {
  if (!l?.sheet) return `${label}: ยังไม่ได้เลือกชีต`;
  if (!(l.headerRow >= 1 && l.headerEnd >= l.headerRow)) return `${label}: แถวหัวตารางไม่ถูกต้อง`;
  if (!(l.dataRow > l.headerEnd)) return `${label}: แถวข้อมูลต้องอยู่ใต้หัวตาราง`;
  if (!(l.footerRow > l.dataRow)) return `${label}: ส่วนท้ายต้องอยู่ใต้แถวข้อมูล`;
  if (!(l.columns ?? []).some((c) => c.source !== 'blank')) return `${label}: ยังไม่ได้ระบุว่าคอลัมน์ไหนใส่ข้อมูลอะไร`;
  return '';
}

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

  if (!f.template) {
    if (f.active) err.template = 'ต้องอัปโหลดไฟล์แบบฟอร์ม Excel ก่อนเปิดใช้';
  } else {
    const e = layoutError(f.template, 'ชีตบริษัท') || (f.template.summary ? layoutError(f.template.summary, 'ชีตสรุป') : '');
    if (e) err.template = e;
  }

  const codes = (f.companies ?? []).map((c) => c.companyCode);
  if (new Set(codes).size !== codes.length) err.companies = 'มีบริษัทซ้ำในแบบฟอร์มนี้';
  else if (f.active) {
    // บริษัทหนึ่งส่งแจ้งได้กับบริษัทประกันเดียว (ในแบบฟอร์มที่เปิดใช้)
    const clash = others
      .filter((o) => o.id !== f.id && o.active)
      .flatMap((o) => o.companies.filter((c) => codes.includes(c.companyCode)).map((c) => `${c.companyCode} (${o.shortName})`));
    if (clash.length) err.companies = `บริษัทนี้ผูกกับบริษัทประกันอื่นที่เปิดใช้อยู่แล้ว: ${clash.join(', ')}`;
  }
  return err;
}

/**
 * ตรวจการผูกบริษัท ↔ บริษัทประกัน
 * @param {{companyCode:string, insurerId:number|null}[]} bindings
 */
export function validateBindings(bindings, forms) {
  const err = {};
  for (const b of bindings) {
    if (!b.insurerId) continue;
    const f = forms.find((x) => x.id === b.insurerId);
    if (!f) err[b.companyCode] = 'ไม่พบบริษัทประกันที่เลือก';
  }
  return err;
}

/** บริษัทประกันใหม่ (ยังไม่มีไฟล์แบบฟอร์ม) */
export function blankInsurerForm() {
  return {
    id: 0,
    name: '',
    shortName: '',
    active: false,
    companies: [],
    dateFormat: 'DD/MM/YYYY',
    dateEra: 'BE',
    inMark: '✓',
    outMark: '✓',
    fileName: 'แจ้งเข้า-ออก {insurer} {cycleDate}',
    sheetName: '{companyCode}',
    includeEmptySheets: true,
    signer: { name: '', department: '', phone: '' },
    template: null,
  };
}
