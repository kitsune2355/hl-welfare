-- ย้อนกลับ 020 — กลับเป็นเหตุผล 4 ข้อเดิม และลบคอลัมน์หมายเหตุ
--
--  ⚠ ข้อมูลหาย: หมายเหตุทั้งหมดถูกลบ · เหตุผลใหม่แปลงเป็นค่าเดิมที่ใกล้ที่สุด
--    สิ้นสุดระยะเวลาการจ้าง / เกษียณอายุ / โอนย้ายสังกัดบริษัท → ลาออก (แจ้งออกตามรอบ เหมือนเดิม)
--    เสียชีวิต → เลิกจ้าง (แจ้งออกทันที เหมือนเดิม)
--    เลิกจ้าง + หมายเหตุ "กระทำผิด" → กระทำผิด
SET NAMES utf8;

ALTER TABLE `employees`
  MODIFY `end_reason` ENUM('RESIGN','ABSENT_3D','CONTRACT_END','TERMINATED','RETIRED','DECEASED','TRANSFERRED','MISCONDUCT') NULL;

UPDATE `employees` SET `end_reason` = 'MISCONDUCT', `updated_by` = 'rollback' WHERE `end_reason` = 'TERMINATED' AND `note` = 'กระทำผิด';
UPDATE `employees` SET `end_reason` = 'RESIGN', `updated_by` = 'rollback' WHERE `end_reason` IN ('CONTRACT_END', 'RETIRED', 'TRANSFERRED');
UPDATE `employees` SET `end_reason` = 'TERMINATED', `updated_by` = 'rollback' WHERE `end_reason` = 'DECEASED';

ALTER TABLE `employees`
  MODIFY `end_reason` ENUM('RESIGN','ABSENT_3D','TERMINATED','MISCONDUCT') NULL;

ALTER TABLE `employees` DROP COLUMN `note`;
