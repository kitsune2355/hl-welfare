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

  /** ชื่อผู้ใช้ที่แสดงในบันทึกกิจกรรม (เฟส 3 จะมาจากการ login) */
  currentUser: 'HR (mock)',
};
