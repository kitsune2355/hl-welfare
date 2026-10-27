-- ย้อนกลับ 018_active_flags.sql — ที่ปิดใช้งานไว้จะกลับมาเปิดทั้งหมด
SET NAMES utf8;

ALTER TABLE `companies` DROP COLUMN `active`;
ALTER TABLE `employee_types` DROP COLUMN `active`;
ALTER TABLE `dept_groups` DROP COLUMN `active`;
ALTER TABLE `sites` DROP COLUMN `active`;
ALTER TABLE `employees` DROP COLUMN `active`;
