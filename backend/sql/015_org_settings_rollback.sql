-- ============================================================
--  015_org_settings_rollback.sql — กลับไปใช้ประเภทพนักงาน 4 แบบที่ฝังในโค้ด
--  ต้องไม่มีพนักงาน / กฎที่ใช้ประเภทที่เพิ่มเอง (ALTER กลับเป็น ENUM จะล้มถ้ามีค่าอื่น)
--  บริษัทที่เพิ่มเองยังอยู่ — แต่โค้ดรุ่นก่อนรู้จักแค่ HL PRO CNS CIC AS
-- ============================================================

SET NAMES utf8;

ALTER TABLE `employees`       MODIFY `employee_type` ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL;
ALTER TABLE `insurance_rules` MODIFY `employee_type` ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL;
ALTER TABLE `uniform_rules`   MODIFY `employee_type` ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL;
DROP TABLE IF EXISTS `employee_types`;
DELETE FROM `role_capabilities` WHERE `capability` = 'org.edit';
ALTER TABLE `companies` DROP COLUMN `color`;
