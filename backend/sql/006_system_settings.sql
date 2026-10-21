-- ============================================================
--  006_system_settings.sql — ค่าตั้งระบบที่ผู้ดูแลแก้จากหน้า admin.html (แท็บ "ตั้งค่าระบบ")
--
--  แถวในตารางนี้ "ทับ" ค่าใน backend/config.php ทีละ key (ไม่มีแถว = ใช้ค่าจาก config.php)
--  key ที่แก้ได้กำหนดใน backend/lib/settings.php (sys_setting_defs) — ค่าอื่น (ฐานข้อมูล, cookie_secure) อยู่ใน config.php เท่านั้น
--  ไม่ใช่ตาราง `settings` (ค่ากฎสวัสดิการ ที่ /rules ส่งให้หน้าเว็บ)
--  stock_api_secret เก็บที่นี่ได้ (ต้องใช้เซ็น HMAC จึงเข้ารหัสทางเดียวไม่ได้) — API ไม่ส่งค่ากลับไปหน้าเว็บ
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/006_system_settings.sql
--  ย้อนกลับ: backend/sql/006_system_settings_rollback.sql (กลับไปใช้ config.php ทั้งหมด)
-- ============================================================

SET NAMES utf8;

CREATE TABLE `system_settings` (
  `key`         VARCHAR(50)  NOT NULL,
  `value`       VARCHAR(500) NOT NULL,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
