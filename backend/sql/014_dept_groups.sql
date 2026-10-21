-- ============================================================
--  014_dept_groups.sql — กลุ่ม / ฝ่ายของพนักงานส่วนกลาง (แก้ได้ที่หน้าเงื่อนไขสวัสดิการ แท็บ "ค่าตั้งค่า")
--
--  เดิมรายชื่อฝังในโค้ด (shared/labels.js DEPT_GROUPS) · ใช้ที่:
--    - employees.dept_group     กลุ่ม/ฝ่ายของพนักงาน (เก็บเป็นชื่อ — เปลี่ยนชื่อกลุ่ม = แก้ทุกแถวให้ใน API)
--    - uniform_rules.dept_groups กฎชุดฟอร์มส่วนกลางแยกจำนวนตามกลุ่ม/ฝ่าย (JSON ของชื่อ)
--  ตั้งต้น = 6 กลุ่มเดิม + ชื่อที่พนักงานใช้อยู่แต่ไม่อยู่ในรายการ (ข้อมูลเดิมยังเลือกได้)
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/014_dept_groups.sql
--  ย้อนกลับ: backend/sql/014_dept_groups_rollback.sql (หน้าเว็บกลับไปใช้รายการในโค้ด — ชื่อในพนักงาน/กฎไม่เปลี่ยน)
-- ============================================================

SET NAMES utf8;

CREATE TABLE IF NOT EXISTS `dept_groups` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(100) NOT NULL,
  `sort_order`  INT NOT NULL DEFAULT 0,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dept_groups_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `dept_groups` (`name`, `sort_order`, `created_at`, `created_by`, `updated_by`) VALUES
('Support Line', 10, NOW(), 'migration', 'migration'),
('การตลาด', 20, NOW(), 'migration', 'migration'),
('BU ส่วนกลาง', 30, NOW(), 'migration', 'migration'),
('ฝ่ายขาย', 40, NOW(), 'migration', 'migration'),
('วิศวกรรมและการออกแบบ', 50, NOW(), 'migration', 'migration'),
('บริหารห้องเช่าและพื้นที่เช่า', 60, NOW(), 'migration', 'migration');

INSERT IGNORE INTO `dept_groups` (`name`, `sort_order`, `created_at`, `created_by`, `updated_by`)
SELECT DISTINCT TRIM(`dept_group`), 1000, NOW(), 'migration', 'migration'
FROM `employees`
WHERE `dept_group` IS NOT NULL AND TRIM(`dept_group`) <> '';
