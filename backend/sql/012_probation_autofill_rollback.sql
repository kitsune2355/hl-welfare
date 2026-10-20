-- ============================================================
--  012_probation_autofill_rollback.sql — ล้างวันผ่านทดลองงานที่ 012 เติมให้
--  เฉพาะแถวที่ยังไม่มีใครแก้หลังจากนั้น (updated_by ยังเป็น migration-012)
-- ============================================================

SET NAMES utf8;

UPDATE `employees`
SET `probation_pass_date` = NULL
WHERE `updated_by` = 'migration-012' AND `probation_pass_date` = DATE_ADD(`start_date`, INTERVAL 119 DAY);
