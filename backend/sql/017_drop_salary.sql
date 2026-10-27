-- ============================================================
--  017_drop_salary.sql — เอาข้อมูลเงินเดือนออกจากระบบ
--
--  ระบบสวัสดิการไม่ใช้เงินเดือน (ไม่มีช่องให้กรอก ไม่ใช้คำนวณสิทธิ) — ไม่เก็บข้อมูลส่วนบุคคลที่ไม่จำเป็น
--  1) ลบคอลัมน์ employees.salary (ข้อมูลเงินเดือนเดิมหายถาวร)
--  2) แบบฟอร์มประกันที่ผูกคอลัมน์ "เงินเดือน" (source salary) → เปลี่ยนเป็นช่องว่างให้กรอกเอง (blank)
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/017_drop_salary.sql
--  ย้อนกลับ: backend/sql/017_drop_salary_rollback.sql (เพิ่มคอลัมน์กลับเป็น 0 — ข้อมูลเดิมไม่กลับมา)
--  backend ใช้ได้ทั้งก่อนและหลังรันไฟล์นี้ (ไม่อ่าน/เขียนคอลัมน์ salary แล้ว)
-- ============================================================

SET NAMES utf8;

ALTER TABLE `employees` DROP COLUMN `salary`;

UPDATE `insurer_forms`
   SET `form_json` = REPLACE(REPLACE(`form_json`, '"source":"salary","only":"IN"', '"source":"blank"'), '"source":"salary"', '"source":"blank"')
 WHERE `form_json` LIKE '%"source":"salary"%';
