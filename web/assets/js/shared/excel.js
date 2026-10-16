// ไลบรารี Excel (โหลดเมื่อใช้ครั้งแรกเท่านั้น) + ดาวน์โหลดไฟล์
//   ExcelJS (MIT, ~950KB)    อ่าน/เขียน .xlsx พร้อมรูปแบบ (เส้นขอบ ตัวอักษร merge ความกว้าง)
//   SheetJS (Apache-2.0)     แปลงไฟล์ .xls (Excel 97-2003) → .xlsx ก่อนให้ ExcelJS อ่าน
// ใน Node (ทดสอบ) ส่งไลบรารีเข้ามาเองได้ด้วย useExcelLibs({ ExcelJS, XLSX })

const VENDOR = { ExcelJS: 'assets/vendor/exceljs/exceljs.min.js', XLSX: 'assets/vendor/sheetjs/xlsx.full.min.js' };
const libs = {};
const loading = {};

function loadScript(name) {
  if (libs[name]) return Promise.resolve(libs[name]);
  if (typeof window !== 'undefined' && window[name]) return Promise.resolve((libs[name] = window[name]));
  loading[name] ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = VENDOR[name];
    s.onload = () => resolve((libs[name] = window[name]));
    s.onerror = () => {
      loading[name] = null;
      reject(new Error(name === 'XLSX' ? 'โหลดตัวแปลงไฟล์ .xls ไม่สำเร็จ' : 'โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ'));
    };
    document.head.append(s);
  });
  return loading[name];
}

/** ใช้ไลบรารีที่ส่งเข้ามา (Node / ทดสอบ) แทนการโหลดจาก vendor */
export function useExcelLibs(given) {
  Object.assign(libs, given);
}
export const loadExcelJs = () => loadScript('ExcelJS');
export const loadSheetJs = () => loadScript('XLSX');

/** ดาวน์โหลด Blob เป็นไฟล์ */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** ArrayBuffer ↔ base64 (เก็บไฟล์แบบฟอร์มใน JSON) */
export function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBuffer(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}
