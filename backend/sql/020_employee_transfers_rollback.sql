-- ย้อนกลับ 020_employee_transfers.sql — ประวัติการย้ายหายทั้งหมด · สังกัดปัจจุบันของพนักงานไม่เปลี่ยน
--   วันเริ่มนับวันรอสิทธิ์ที่ตั้งจากการย้ายหาย → กลับไปนับจากวันเริ่มงาน
SET NAMES utf8;

DROP TABLE IF EXISTS `employee_transfers`;
ALTER TABLE `employees` DROP COLUMN `benefit_start_date`;
