-- ============================================================
--  020_employee_transfers.sql — โอนย้ายพนักงาน (ประวัติสังกัด + วันที่มีผล)
--
--  employee_transfers  1 แถว = การย้าย 1 ครั้ง (บริษัท / หน่วยงาน / ประเภท / กลุ่ม-ฝ่าย / ตำแหน่ง / ระดับ)
--    status PENDING   = ตั้งล่วงหน้า ยังไม่ถึงวันที่มีผล — ข้อมูลพนักงานยังเป็นค่าเดิม
--           APPLIED   = มีผลแล้ว — ค่า to_* ถูกเขียนลง employees (ระบบทำเองเมื่อถึงวัน: transfers_apply_due)
--           CANCELLED = ยกเลิกก่อนถึงวันที่มีผล
--    from_*           = สังกัดเดิม ณ วันที่ย้ายมีผล (ใช้ทำประวัติ "เคยอยู่ที่ไหน ตั้งแต่วันไหนถึงวันไหน")
--    reset_wait       = 1 → นับวันรอสิทธิ์ใหม่จากวันที่ย้าย (employees.benefit_start_date = effective_date)
--  employees.benefit_start_date  วันเริ่มนับวันรอสิทธิ์ (NULL = ใช้วันเริ่มงาน)
--
--  เพิ่มตาราง/คอลัมน์อย่างเดียว · backend ใช้ได้ก่อนรัน (ไม่มีประวัติการย้าย — ปุ่มโอนย้ายตอบ 503)
--  วิธีรัน: mysql -u root -p --default-character-set=utf8 hl_welfare < backend/sql/020_employee_transfers.sql
--  ย้อนกลับ: backend/sql/020_employee_transfers_rollback.sql (ประวัติการย้ายหายทั้งหมด · สังกัดปัจจุบันของพนักงานไม่เปลี่ยน)
-- ============================================================

SET NAMES utf8;

ALTER TABLE `employees` ADD COLUMN `benefit_start_date` DATE NULL AFTER `probation_pass_date`;

CREATE TABLE IF NOT EXISTS `employee_transfers` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`         INT UNSIGNED NOT NULL,
  `effective_date`      DATE NOT NULL,
  `status`              ENUM('PENDING','APPLIED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `from_company_code`   VARCHAR(10)  NOT NULL,
  `from_site_id`        INT UNSIGNED NOT NULL,
  `from_employee_type`  VARCHAR(30)  NOT NULL,
  `from_dept_group`     VARCHAR(100) NULL,
  `from_position`       VARCHAR(100) NULL,
  `from_level`          TINYINT UNSIGNED NULL,
  `to_company_code`     VARCHAR(10)  NOT NULL,
  `to_site_id`          INT UNSIGNED NOT NULL,
  `to_employee_type`    VARCHAR(30)  NOT NULL,
  `to_dept_group`       VARCHAR(100) NULL,
  `to_position`         VARCHAR(100) NULL,
  `to_level`            TINYINT UNSIGNED NULL,
  `reset_wait`          TINYINT(1) NOT NULL DEFAULT 0,
  `note`                VARCHAR(500) NULL,
  `applied_at`          DATETIME NULL,
  `requested_by_name`   VARCHAR(150) NOT NULL COMMENT 'ผู้บันทึกการย้าย (ชื่อที่แสดง)',
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_transfer_employee` (`employee_id`, `effective_date`),
  KEY `idx_transfer_due` (`status`, `effective_date`),
  CONSTRAINT `fk_transfer_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
