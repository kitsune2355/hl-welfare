-- ย้อนกลับ 021 — ลบประวัติโอนย้าย / เปลี่ยนรหัส และรายการแจ้งประกันที่เกิดจากการเปลี่ยนแปลง
--
--  ⚠ ข้อมูลหาย: ประวัติการเปลี่ยนแปลงทั้งหมด · รายการแจ้งที่ change_id <> 0 (แจ้งออก/เข้าตอนย้าย · แจ้งเปลี่ยนแปลง)
--    ข้อมูลพนักงาน (บริษัท/หน่วยงาน/รหัสปัจจุบัน) ไม่ถูกแก้ — คงค่าล่าสุด
SET NAMES utf8;

DELETE FROM `insurance_batch_items` WHERE `change_id` <> 0 OR `type` = 'CHANGE';

ALTER TABLE `insurance_batch_items` ADD UNIQUE KEY `uq_emp_direction` (`employee_id`, `direction`);
ALTER TABLE `insurance_batch_items` DROP INDEX `uq_emp_direction_change`;
ALTER TABLE `insurance_batch_items` DROP PRIMARY KEY, ADD PRIMARY KEY (`batch_id`, `employee_id`, `direction`);
ALTER TABLE `insurance_batch_items`
  DROP COLUMN `change_id`,
  MODIFY `type` ENUM('IN','OUT','URGENT') NOT NULL,
  MODIFY `direction` ENUM('IN','OUT') NOT NULL COMMENT 'แอปคำนวณ: URGENT นับเป็น OUT';

DROP TABLE IF EXISTS `employee_changes`;
