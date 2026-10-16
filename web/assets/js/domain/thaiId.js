// เลขประจำตัวประชาชน 13 หลัก — ตรวจ check digit ตามสูตรกรมการปกครอง

/** เหลือเฉพาะตัวเลข (รับได้ทั้ง "1-2345-67890-12-3" และ "1 2345 67890 12 3") */
export const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '');

/** true = 13 หลักและ check digit ถูกต้อง */
export function isValidThaiId(id) {
  const d = digitsOnly(id);
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

/** check digit ของเลข 12 หลักแรก (ใช้สร้างข้อมูลจำลอง) */
export function thaiIdCheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return (11 - (sum % 11)) % 10;
}

/** รูปแบบที่อ่านง่าย 1-2345-67890-12-3 (ไม่ครบ 13 หลัก = คืนค่าเดิม) */
export function formatThaiId(id) {
  const d = digitsOnly(id);
  return d.length === 13 ? `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}` : String(id ?? '');
}
