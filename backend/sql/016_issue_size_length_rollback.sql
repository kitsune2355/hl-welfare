-- ย้อนกลับ 016_issue_size_length.sql — ไซซ์ที่ยาวเกิน 100 ตัวอักษรจะถูกตัด
SET NAMES utf8;

ALTER TABLE `uniform_issues` MODIFY `size` VARCHAR(100) NOT NULL;
