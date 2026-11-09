-- ============================================================
--  021_employee_changes.sql — ประวัติโอนย้าย / เปลี่ยนรหัสพนักงาน + แจ้งประกันกลุ่มหลายครั้งต่อคน
--
--  employee_changes: ค่าเดิม → ค่าใหม่ (บริษัท / หน่วยงาน / ประเภท / รหัส) + วันที่มีผล + แจ้งบริษัทประกันไหม
--    ประกันกลุ่มนับอายุงานต่อจากวันเริ่มงานเดิม · ย้ายแบบแจ้งประกัน = แจ้งออก (วันก่อนย้าย) + แจ้งเข้า (วันย้าย)
--    เปลี่ยนรหัส + แจ้งประกัน = แถว "แจ้งเปลี่ยนแปลง" (type CHANGE)
--  insurance_batch_items.change_id: รายการที่เกิดจากการเปลี่ยนแปลงไหน (0 = แจ้งเข้าครั้งแรก / แจ้งออกตอนพ้นสภาพ — แบบเดิม)
--    → คนเดียวแจ้งออก/เข้าได้หลายครั้ง (ครั้งละการเปลี่ยนแปลง) · กันแจ้งซ้ำด้วย (employee_id, direction, change_id)
--
--  ⚠ รันครั้งเดียว · ไม่แก้ข้อมูลเดิม (รายการเดิมทั้งหมด change_id = 0)
--  ก่อนรัน: ระบบใช้ได้ตามเดิม — ปุ่มโอนย้าย / เปลี่ยนรหัส ตอบ 503 ให้รันไฟล์นี้ก่อน
--  วิธีรัน: mysql -u root -p --default-character-set=utf8 hl_welfare < backend/sql/021_employee_changes.sql
--  ย้อนกลับ: backend/sql/021_employee_changes_rollback.sql
-- ============================================================

SET NAMES utf8;

CREATE TABLE `employee_changes` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`         INT UNSIGNED NOT NULL,
  `kind`                ENUM('TRANSFER','CODE') NOT NULL COMMENT 'TRANSFER = บริษัท/หน่วยงาน/ประเภทเปลี่ยน · CODE = เปลี่ยนรหัสอย่างเดียว',
  `effective_date`      DATE NOT NULL,
  `from_company_code`   VARCHAR(10)  NOT NULL,
  `from_site_id`        INT UNSIGNED NOT NULL,
  `from_employee_type`  VARCHAR(20)  NOT NULL,
  `from_emp_code`       VARCHAR(20)  NOT NULL,
  `to_company_code`     VARCHAR(10)  NOT NULL,
  `to_site_id`          INT UNSIGNED NOT NULL,
  `to_employee_type`    VARCHAR(20)  NOT NULL,
  `to_emp_code`         VARCHAR(20)  NOT NULL,
  `notify_insurer`      TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = แจ้งบริษัทประกัน (ออก+เข้า / เปลี่ยนแปลง)',
  `note`                VARCHAR(255) NULL,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_change_employee` (`employee_id`, `effective_date`),
  CONSTRAINT `fk_change_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `insurance_batch_items`
  ADD COLUMN `change_id` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'employee_changes.id ที่ทำให้เกิดรายการ · 0 = แจ้งเข้าครั้งแรก / ออกตอนพ้นสภาพ' AFTER `employee_id`,
  MODIFY `type` ENUM('IN','OUT','URGENT','CHANGE') NOT NULL,
  MODIFY `direction` ENUM('IN','OUT','CHANGE') NOT NULL COMMENT 'แอปคำนวณ: URGENT นับเป็น OUT';

-- กันแจ้งซ้ำต่อการเปลี่ยนแปลง (เพิ่มดัชนีใหม่ก่อน — FK ของ employee_id ต้องมีดัชนีอยู่เสมอ)
ALTER TABLE `insurance_batch_items` ADD UNIQUE KEY `uq_emp_direction_change` (`employee_id`, `direction`, `change_id`);
ALTER TABLE `insurance_batch_items` DROP INDEX `uq_emp_direction`;
ALTER TABLE `insurance_batch_items` DROP PRIMARY KEY, ADD PRIMARY KEY (`batch_id`, `employee_id`, `direction`, `change_id`);
