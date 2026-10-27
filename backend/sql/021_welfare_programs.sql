-- ============================================================
--  021_welfare_programs.sql — สวัสดิการเพิ่มเติมที่ HR สร้างเอง (เมนูของตัวเองใน sidebar)
--
--  welfare_programs  1 แถว = สวัสดิการ 1 อย่าง (เช่น ค่าคลอดบุตร ทุนการศึกษา เงินช่วยเหลืองานศพ)
--    config (JSON)   รอบการให้ (frequency) · เริ่มนับจาก (waitFrom) · หน่วย (unit)
--                    เงื่อนไขผู้มีสิทธิ (rules[]) · ช่องข้อมูลที่บันทึกตอนให้ (fields[]) — ดู web/assets/js/domain/welfare.js
--    active = 0      ซ่อนจากเมนู ไม่คำนวณสิทธิ์ · ประวัติการให้ยังอยู่ (ไม่มีการลบ)
--  welfare_records   การให้สิทธิ์ 1 ครั้ง — period_key = รอบ (ONCE / Y-2026 / M-2026-03)
--    data (JSON)     ค่าของช่องข้อมูลที่สวัสดิการนั้นกำหนด
--
--  เพิ่มตารางอย่างเดียว · backend ใช้ได้ก่อนรัน (ไม่มีสวัสดิการเพิ่มเติม — สร้างใหม่ตอบ 503)
--  วิธีรัน: mysql -u root -p --default-character-set=utf8 hl_welfare < backend/sql/021_welfare_programs.sql
--  ย้อนกลับ: backend/sql/021_welfare_programs_rollback.sql (สวัสดิการเพิ่มเติมและประวัติการให้หายทั้งหมด)
-- ============================================================

SET NAMES utf8;

CREATE TABLE IF NOT EXISTS `welfare_programs` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(100) NOT NULL,
  `icon`         VARCHAR(40)  NOT NULL DEFAULT 'gift',
  `description`  VARCHAR(500) NULL,
  `config`       TEXT NOT NULL,
  `active`       TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order`   INT NOT NULL DEFAULT 0,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_welfare_program_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `welfare_records` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `program_id`    INT UNSIGNED NOT NULL,
  `employee_id`   INT UNSIGNED NOT NULL,
  `period_key`    VARCHAR(20) NOT NULL,
  `record_date`   DATE NOT NULL,
  `amount`        DECIMAL(12,2) NULL,
  `data`          TEXT NULL,
  `note`          VARCHAR(500) NULL,
  `recorded_by_name` VARCHAR(150) NOT NULL,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_welfare_record_program` (`program_id`, `employee_id`, `period_key`),
  KEY `idx_welfare_record_employee` (`employee_id`),
  CONSTRAINT `fk_welfare_record_program` FOREIGN KEY (`program_id`) REFERENCES `welfare_programs` (`id`),
  CONSTRAINT `fk_welfare_record_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- สิทธิ์ใหม่ (ตาราง role_capabilities จาก 008) — ค่าเริ่มต้นเหมือน perm_defs() ใน backend/permissions.php
--   welfare.view / welfare.record = ทุกบทบาท · welfare.manage = เฉพาะ HR Admin
INSERT IGNORE INTO `role_capabilities` (`role`, `capability`, `allowed`, `created_at`, `created_by`, `updated_by`)
SELECT r.role, c.cap, c.cap <> 'welfare.manage' OR r.role = 'HR_ADMIN', NOW(), 'migration-021', 'migration-021'
FROM (SELECT 'HR_ADMIN' AS role UNION ALL SELECT 'HR_COMPANY' UNION ALL SELECT 'PAYROLL' UNION ALL SELECT 'STOCK' UNION ALL SELECT 'EXECUTIVE') r,
     (SELECT 'welfare.view' AS cap UNION ALL SELECT 'welfare.record' UNION ALL SELECT 'welfare.manage') c;
