// ===== ตั้งค่าระบบ (แก้ไฟล์นี้ไฟล์เดียว ไม่ต้อง build) =====
export const CONFIG = {
  /**
   * แหล่งข้อมูล
   *  'mock' = ข้อมูลจำลองในเบราว์เซอร์ (เก็บใน localStorage ของแต่ละเครื่อง) — ใช้ทดลอง/เดโม
   *  'http' = เรียก PHP backend (เฟส 2)
   */
  apiMode: 'mock',

  /** URL ของ PHP API (ใช้เมื่อ apiMode = 'http') — path แบบ relative จากหน้าเว็บ */
  apiBaseUrl: 'api',

  /** การเข้าสู่ระบบ (หน้า login.html) */
  auth: {
    /** false = ไม่ต้อง login (เข้าระบบเป็น "ผู้ใช้ทั่วไป" อัตโนมัติ) */
    enabled: true,
    /** อายุการเข้าสู่ระบบ (ชั่วโมง) — ครบแล้วต้อง login ใหม่ */
    sessionHours: 12,
    /** แสดงบัญชีทดลองบนหน้า login (เฉพาะโหมด mock) — ผู้ใช้จำลองอยู่ใน infrastructure/mock/users.js */
    showDemoAccounts: true,
    /** ข้อความเมื่อกด "ลืมรหัสผ่าน?" */
    forgotPasswordText: 'กรุณาติดต่อฝ่าย IT หรือ HR Admin เพื่อรีเซ็ตรหัสผ่าน',
  },
};
