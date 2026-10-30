// ===== ตั้งค่า "คู่มือทีละขั้น" (driver.js) — dev ปรับได้ที่ไฟล์นี้ไฟล์เดียว =====
// เนื้อหาอยู่ที่ tour/guides.js · ธีมสี/ฟอนต์อยู่ใน app.css หัวข้อ "Tour"
// เอกสาร driver.js: https://driverjs.com/docs/configuration

export const TOUR_CONFIG = {
  /** ปิดทั้งระบบ = false (ปุ่ม ? จะหายไปด้วย) */
  enabled: true,

  /** เข้าหน้า/แท็บครั้งแรก → การ์ดเล็กมุมขวาล่างเสนอคู่มือของหน้านั้น (ไม่เปิดคู่มือเอง) */
  autoStart: true,

  /** รอ (ms) ก่อนแสดงการ์ดเสนอคู่มือ */
  autoStartDelay: 600,

  /** รอข้อมูลในหน้าโหลด (element ของขั้น) ได้นานสุดกี่ ms */
  readyTimeout: 6000,

  /**
   * เพิ่มเลขนี้ = เสนอคู่มือใหม่อีกครั้งทุกหน้า (ระบบจำว่า "เสนอแล้ว" แยกต่อหน้า ใน localStorage: `${storageKey}:${หน้า}`)
   */
  version: 1,
  storageKey: 'hl-guide-offer',

  /** แสดงปุ่ม ? (คู่มือ) ที่แถบด้านบน */
  showHelpButton: true,

  /** ที่อยู่ไฟล์ driver.js (โหลดเมื่อใช้งานจริงเท่านั้น ไม่ทำให้หน้าช้า) */
  vendorPath: 'assets/vendor/driver.js/',

  /**
   * ค่าที่ส่งให้ driver.js ตรง ๆ — ดูตัวเลือกทั้งหมด: https://driverjs.com/docs/configuration
   * (สีของกล่องแนะนำปรับที่ app.css → .driver-popover.hl-tour)
   */
  driver: {
    showProgress: true,
    progressText: 'ขั้น {{current}} จาก {{total}}',
    nextBtnText: 'ถัดไป',
    prevBtnText: 'ย้อนกลับ',
    doneBtnText: 'เสร็จ',
    showButtons: ['next', 'previous', 'close'],
    allowClose: true, // กด Esc / ปุ่ม × เพื่อปิด
    overlayClickBehavior: () => {}, // คลิกพื้นหลังโดยไม่ตั้งใจ = ไม่ปิด (ผู้ใช้มือใหม่)
    allowKeyboardControl: true, // ← → เปลี่ยนขั้น, Esc ปิด
    overlayColor: '#0f172a',
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 10,
    popoverOffset: 12,
    smoothScroll: false, // เลื่อนทันที — ตำแหน่งไฮไลต์ถูกต้องเสมอ (หน้าในระบบเลื่อนภายในกล่อง ไม่ใช่หน้าต่าง)
    animate: true,
    disableActiveInteraction: true, // ระหว่างแนะนำ ห้ามคลิกส่วนที่ไฮไลต์ (กันกดบันทึกโดยไม่ตั้งใจ)
    popoverClass: 'hl-tour',
  },
};

/*
 * ตัวช่วยสำหรับ dev / ผู้ทดสอบ (พิมพ์ใน Console ของเบราว์เซอร์ F12):
 *   localStorage.setItem('hl-tour-disabled', '1')   → ไม่เสนอคู่มืออัตโนมัติในเครื่องนี้ (เช่น ตอนทดสอบอัตโนมัติ)
 *   localStorage.removeItem('hl-tour-disabled')     → เปิดกลับ
 *   Object.keys(localStorage).filter(k => k.startsWith('hl-guide-offer')).forEach(k => localStorage.removeItem(k))
 *                                                   → เสนอคู่มือทุกหน้าอีกครั้ง
 * หรือเปิดหน้าด้วย ?tour=1 เพื่อเริ่มคู่มือของหน้านั้นทันที เช่น employees.html?tour=1
 */
