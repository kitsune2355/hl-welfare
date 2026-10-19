// ===== ตั้งค่าระบบ (แก้ไฟล์นี้ไฟล์เดียว ไม่ต้อง build) =====
export const CONFIG = {
  /**
   * แหล่งข้อมูล
   *  'http' = PHP backend + ฐานข้อมูล hl_welfare (ใช้งานจริง)
   *  'mock' = ข้อมูลจำลองในเบราว์เซอร์ (localStorage ของแต่ละเครื่อง) — ใช้ทดลอง/เทสต์เท่านั้น
   */
  apiMode: 'http',

  /**
   * URL ของ PHP API — relative จากหน้าเว็บ · ไม่ต้องเปิด mod_rewrite
   * (api/index.php/employees = GET /employees)
   */
  apiBaseUrl: 'api/index.php',

  /**
   * ระบบสต็อก Uniform (stock_hr) — ส่งเบิกชุดฟอร์มให้คลังจ่าย
   * โหมด http: PHP backend คุยกับสต็อกเอง (กุญแจอยู่ใน backend/config.php)
   */
  stock: {
    /** ตัวกลางสำหรับโหมด mock (ต้องเข้าสู่ระบบกับ backend — auth.provider 'server') */
    bridgeUrl: 'api/index.php/stock/bridge',
    /** ลิงก์ใบเบิกในระบบสต็อก ต่อท้ายด้วย doc_id */
    docUrl: 'http://localhost/stock_hr/print_doc.php?doc_id=',
  },

  /** การเข้าสู่ระบบ (หน้า login.html) */
  auth: {
    /** false = ไม่ต้อง login (เข้าระบบเป็น "ผู้ใช้ทั่วไป" อัตโนมัติ) */
    enabled: true,
    /**
     * ใครตรวจรหัสผ่าน
     *  'auto'   = ตาม apiMode (mock → 'mock', http → 'server')
     *  'mock'   = ผู้ใช้จำลองในเบราว์เซอร์ (infrastructure/mock/users.js) — ไม่มีความปลอดภัยจริง
     *  'server' = PHP backend (api/auth/*) แม้ข้อมูลยังเป็น mock — ใช้เมื่อส่งเบิกคลังจริงและต้องรู้ว่าใครขอ
     */
    provider: 'auto',
    /** อายุการเข้าสู่ระบบ (ชั่วโมง) ของโหมด mock — โหมด server ใช้อายุ session ของ backend */
    sessionHours: 12,
    /** แสดงบัญชีทดลองบนหน้า login (เฉพาะโหมด mock) — ผู้ใช้จำลองอยู่ใน infrastructure/mock/users.js */
    showDemoAccounts: true,
    /** ข้อความเมื่อกด "ลืมรหัสผ่าน?" */
    forgotPasswordText: 'กรุณาติดต่อฝ่าย IT หรือ HR Admin เพื่อรีเซ็ตรหัสผ่าน',
  },
};
