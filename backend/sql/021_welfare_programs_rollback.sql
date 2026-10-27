-- ย้อนกลับ 021_welfare_programs.sql — สวัสดิการเพิ่มเติมและประวัติการให้หายทั้งหมด (เมนูใน sidebar หายตาม)
SET NAMES utf8;

DROP TABLE IF EXISTS `welfare_records`;
DROP TABLE IF EXISTS `welfare_programs`;
DELETE FROM `role_capabilities` WHERE `capability` IN ('welfare.view', 'welfare.record', 'welfare.manage');
