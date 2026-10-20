-- ============================================================
--  012_probation_autofill.sql — วันผ่านทดลองงานคำนวณให้อัตโนมัติ
--
--  วันผ่านทดลองงาน = วันเริ่มงาน + 119 วัน (backend/domain/date.php probation_due_date)
--  ตั้งแต่นี้บันทึกพนักงานที่วันผ่านทดลองงานว่าง ระบบเติมให้เอง — ไฟล์นี้เติมให้แถวเดิมที่ยังว่าง
--  แถวที่ HR กรอกเองแล้ว (เช่น ขยายทดลองงาน) ไม่ถูกแตะ
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/012_probation_autofill.sql
--  ย้อนกลับ: backend/sql/012_probation_autofill_rollback.sql
-- ============================================================

SET NAMES utf8;

UPDATE `employees`
SET `probation_pass_date` = DATE_ADD(`start_date`, INTERVAL 119 DAY), `updated_by` = 'migration-012'
WHERE `probation_pass_date` IS NULL;
