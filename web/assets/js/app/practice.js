// โหมดฝึกใช้งาน — ตอนเปิดคู่มือ (app/tour.js) ระบบสลับไปใช้ "ข้อมูลตัวอย่าง" ในเบราว์เซอร์
//   ข้อมูลจริงไม่ถูกอ่าน/แก้เลย (app/api.js ใช้ MockApi แยกที่เก็บ + ระบบสต็อกปลอม)
//   อยู่ใน sessionStorage = เฉพาะแท็บนี้ · ปิดแท็บ / กด "ออกจากโหมดฝึก" = กลับข้อมูลจริง
// ไฟล์นี้ต้องไม่ import api.js (api.js อ่านค่าจากที่นี่ตอนเริ่ม)

const FLAG = 'hl-practice';
/** ที่เก็บข้อมูลตัวอย่าง (localStorage) — แยกจากข้อมูลจำลองของโหมด mock */
export const PRACTICE_STORAGE_KEY = 'hl-welfare-practice-v1';

export function isPractice() {
  try {
    return sessionStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

/** เข้าโหมดฝึก — ข้อมูลตัวอย่างชุดใหม่ทุกครั้ง (ไม่ค้างจากการฝึกครั้งก่อน) */
export function enterPractice() {
  try {
    localStorage.removeItem(PRACTICE_STORAGE_KEY);
    sessionStorage.removeItem('hl-catalog-practice');
    sessionStorage.setItem(FLAG, '1');
  } catch {
    /* sessionStorage ใช้ไม่ได้ — คู่มือทำงานกับหน้าปัจจุบันแทน */
  }
}

/**
 * ออกจากโหมดฝึก แล้วโหลดหน้าเดิม (หรือ href) ด้วยข้อมูลจริง
 * keepGuide = คงคู่มือที่กำลังเริ่มไว้ (คู่มือที่ใช้ข้อมูลจริง เช่น ผู้ดูแลระบบ)
 */
export function exitPractice({ keepGuide = false, href = '' } = {}) {
  try {
    sessionStorage.removeItem(FLAG);
    if (!keepGuide) sessionStorage.removeItem('hl-guide');
    sessionStorage.removeItem('hl-catalog-practice');
    localStorage.removeItem(PRACTICE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  location.href = href ? new URL(href, location.href).toString() : realPageUrl(location.href);
}

/**
 * หน้าเดิมแบบที่ใช้กับข้อมูลจริงได้ — ค่าที่ชี้ข้อมูลตัวอย่าง (id / คำค้น / เลขหน้า) ไม่มีในข้อมูลจริง
 * หน้ารายละเอียดพนักงานตัวอย่าง → หน้ารายชื่อพนักงาน (ไม่งั้นขึ้น "ไม่พบพนักงาน")
 */
export function realPageUrl(href) {
  const url = new URL(href);
  if (/\/employee\.html$/.test(url.pathname)) url.pathname = url.pathname.replace(/employee\.html$/, 'employees.html');
  for (const k of ['tour', 'id', 'q', 'page', 'batch']) url.searchParams.delete(k);
  return url.toString();
}

/**
 * ระบบสัญญาจ้างตัวอย่างของโหมดฝึก (รูปแบบคำตอบเดียวกับ backend/api/job_db.php) — ไม่ต่อฐาน hr-pro / job_db_cns จริง
 * กด "บันทึกที่เลือก" = ตอบจำนวนเฉย ๆ ไม่เพิ่มรายชื่อ
 */
export function practiceJobDb() {
  const company = { cns: 'CNS', pro: 'PRO' };
  const site = { cns: 'FM-AV-1 หน่วยงานตัวอย่าง', pro: 'PRO-01 โครงการตัวอย่าง' };
  const code = { cns: 'CN9', pro: 'PR9' };
  const row = (source, n, action, name, extra = {}) => ({
    empCode: `${code[source]}${n}`, name, position: 'ตำแหน่งตัวอย่าง', siteName: site[source], siteExists: false, action, reasons: [], warnings: [], changes: [], ...extra,
  });
  return {
    preview(source) {
      const rows = [
        row(source, '001', 'new', 'มานะ ตัวอย่าง'),
        row(source, '002', 'new', 'มานี ตัวอย่าง'),
        row(source, '003', 'update', 'ปิติ ตัวอย่าง', { siteExists: true, changes: [{ field: 'phone', label: 'เบอร์โทร', from: '0810000001', to: '0810000002' }] }),
        row(source, '004', 'skip', 'ชูใจ ตัวอย่าง', { reasons: ['รหัสนี้เป็นพนักงานบริษัทอื่นอยู่แล้ว — ตรวจรหัสในระบบสัญญาจ้าง'] }),
      ];
      return { source, system: source, company: company[source], rows, summary: { total: 5, new: 2, update: 1, same: 1, skip: 1 }, missingSites: [site[source]], canCreateSites: true };
    },
    import({ create = [], update = [] }) {
      return { created: create.length, updated: update.length, sitesCreated: 0, failed: [] };
    },
  };
}

/**
 * ระบบสต็อกปลอมของโหมดฝึก — ส่งเบิกได้เหมือนจริงแต่ไม่ออกใบในระบบสต็อกจริง
 * (รูปแบบคำตอบเดียวกับ web/api/stock_bridge.php)
 */
export function practiceStock() {
  const docs = new Map();
  let next = 1;
  const status = (ref) => {
    const d = docs.get(ref);
    return { doc_id: d.id, doc_no: d.no, stage: d.stage, issued_at: null, received_at: null, cancel_note: d.note ?? '', items: d.items };
  };
  const SIZES = ['S', 'M', 'L', 'XL', '2XL'];
  return {
    async catalog({ items }) {
      return {
        department: { department_id: 1, department_name: 'หน่วยงานตัวอย่าง', company_name: 'ตัวอย่าง' },
        // แบบผู้ชาย / ผู้หญิง เหมือนระบบคลังจริง (คู่มือสอนการเลือกแบบได้)
        items: items.map((code, i) => ({
          item_code: code,
          variants: ['ผู้ชาย', 'ผู้หญิง'].map((label, v) => ({
            sub_category_id: i * 10 + v + 1,
            sub_category_name: `${code} ${label} (ตัวอย่าง)`,
            variant_label: label,
            products: SIZES.map((size, k) => ({ product_id: i * 100 + v * 10 + k + 1, product_code: `${code}-${v ? 'F' : 'M'}-${size}`, product_name: `${code} ${label} ไซซ์ ${size}`, size, on_hand: 20 - k * 3 })),
          })),
        })),
      };
    },
    async submit(p) {
      const ref = `${p.employee_id}:${p.entitlement_key}`;
      const id = next++;
      const no = `ตัวอย่าง-${String(id).padStart(4, '0')}`;
      docs.set(ref, { id, no, stage: 'REQUESTED', items: p.lines.map((l) => ({ product_id: l.product_id, product_name: l.item_code, size: '', qty: l.qty })) });
      return { doc_id: id, doc_no: no, duplicate: false, status: { [ref]: status(ref) } };
    },
    async status(refs) {
      return Object.fromEntries(refs.filter((r) => docs.has(r)).map((r) => [r, status(r)]));
    },
    async cancel(ref) {
      if (docs.has(ref)) docs.get(ref).stage = 'CANCELLED';
      return { ok: true };
    },
  };
}
