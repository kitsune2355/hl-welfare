-- ============================================================
--  011_stock_waiting_stage_rollback.sql — ย้อน 011 (เอา stage WAITING ออก)
--  แถวที่ยังรออนุมัติถูกนับเป็น REQUESTED (รอคลังจ่าย) — ซิงก์สถานะครั้งถัดไปจะแก้ให้ตรงกับสต็อกเอง
-- ============================================================

SET NAMES utf8;

UPDATE `uniform_issues` SET `stock_stage` = 'REQUESTED' WHERE `stock_stage` = 'WAITING';

ALTER TABLE `uniform_issues`
  MODIFY `stock_stage` ENUM('REQUESTED','ISSUED','RECEIVED','CANCELLED') NULL;
