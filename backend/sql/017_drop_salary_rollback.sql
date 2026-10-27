-- ย้อนกลับ 017_drop_salary.sql — เพิ่มคอลัมน์เงินเดือนกลับ (ค่า 0 · ข้อมูลเดิมไม่กลับมา · แบบฟอร์มประกันยังเป็นช่องว่าง)
SET NAMES utf8;

ALTER TABLE `employees` ADD COLUMN `salary` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `level`;
