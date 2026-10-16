// ===== ตั้งค่า "แนะนำการใช้งาน" (driver.js) — dev ปรับได้ที่ไฟล์นี้ไฟล์เดียว =====
// เนื้อหาของแต่ละหน้าอยู่ที่ tour/steps.js · ธีมสี/ฟอนต์อยู่ใน app.css หัวข้อ "Tour"
// เอกสาร driver.js: https://driverjs.com/docs/configuration

export const TOUR_CONFIG = {
  /** ปิดทั้งระบบ = false (ปุ่ม ? จะหายไปด้วย) */
  enabled: true,

  /** เปิดแนะนำอัตโนมัติเมื่อผู้ใช้เข้าหน้านั้นครั้งแรก */
  autoStart: true,

  /** รอ (ms) หลังข้อมูลในหน้าโหลดเสร็จ ก่อนเริ่มแนะนำอัตโนมัติ */
  autoStartDelay: 600,

  /** รอข้อมูลในหน้าโหลด (selector `ready` ใน steps.js) ได้นานสุดกี่ ms */
  readyTimeout: 6000,

  /**
   * เวอร์ชันของเนื้อหาแนะนำ — แก้ steps.js แล้วอยากให้ผู้ใช้ทุกคนเห็นใหม่อีกครั้ง ให้เพิ่มเลขนี้
   * (ระบบจำว่า "เคยดูแล้ว" แยกต่อหน้า ใน localStorage: `${storageKey}:${หน้า}` = version)
   */
  version: 1,
  storageKey: 'hl-tour-seen',

  /** แสดงปุ่ม ? (แนะนำการใช้งาน) ที่แถบด้านบน */
  showHelpButton: true,

  /** ที่อยู่ไฟล์ driver.js (โหลดเมื่อใช้งานจริงเท่านั้น ไม่ทำให้หน้าช้า) */
  vendorPath: 'assets/vendor/driver.js/',

  /**
   * ค่าที่ส่งให้ driver.js ตรง ๆ — ดูตัวเลือกทั้งหมด: https://driverjs.com/docs/configuration
   * (สีของกล่องแนะนำปรับที่ app.css → .driver-popover.hl-tour)
   */
  driver: {
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'ถัดไป',
    prevBtnText: 'ย้อนกลับ',
    doneBtnText: 'เข้าใจแล้ว',
    showButtons: ['next', 'previous', 'close'],
    allowClose: true, // กด Esc / ปุ่ม × / คลิกพื้นหลัง เพื่อปิด
    overlayClickBehavior: 'close',
    allowKeyboardControl: true, // ← → เปลี่ยนขั้น, Esc ปิด
    overlayColor: '#0f172a',
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 10,
    popoverOffset: 12,
    smoothScroll: true,
    animate: true,
    disableActiveInteraction: true, // ระหว่างแนะนำ ห้ามคลิกส่วนที่ไฮไลต์ (กันกดบันทึกโดยไม่ตั้งใจ)
    popoverClass: 'hl-tour',
  },
};

/*
 * ตัวช่วยสำหรับ dev / ผู้ทดสอบ (พิมพ์ใน Console ของเบราว์เซอร์ F12):
 *   localStorage.setItem('hl-tour-disabled', '1')   → ปิดการแนะนำอัตโนมัติในเครื่องนี้ (เช่น ตอนทดสอบอัตโนมัติ)
 *   localStorage.removeItem('hl-tour-disabled')     → เปิดกลับ
 *   Object.keys(localStorage).filter(k => k.startsWith('hl-tour-seen')).forEach(k => localStorage.removeItem(k))
 *                                                   → ให้แนะนำอัตโนมัติทุกหน้าอีกครั้ง
 * หรือเปิดหน้าด้วย ?tour=1 เพื่อเริ่มแนะนำทันที เช่น employees.html?tour=1
 */
