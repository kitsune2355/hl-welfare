-- ============================================================
--  019_fixed_term_type.sql — ประเภทพนักงาน "สัญญาแบบมีกำหนดระยะเวลา" (FIXED_TERM)
--
--  เพิ่มแถวเดียว (INSERT IGNORE — รันซ้ำได้ · ไม่แตะข้อมูลเดิม) · ยังไม่มีกฎประกัน/ชุดฟอร์ม
--  = พนักงานประเภทนี้ยังไม่ได้สิทธิจนกว่า HR จะเพิ่มกฎที่ ตั้งค่าสวัสดิการ › 5 / 6
--
--  ต้องรันหลัง 015 (ตาราง employee_types) และ 018 (คอลัมน์ active)
--  วิธีรัน: mysql -u root -p --default-character-set=utf8 hl_welfare < backend/sql/019_fixed_term_type.sql
--  ย้อนกลับ: backend/sql/019_fixed_term_type_rollback.sql
-- ============================================================

SET NAMES utf8;

INSERT IGNORE INTO `employee_types` (`code`, `name`, `description`, `companies`, `uses_dept_group`, `uses_position`, `daily_cycle`, `tone`, `sort_order`, `active`, `created_at`, `created_by`, `updated_by`)
SELECT 'FIXED_TERM', 'สัญญาแบบมีกำหนดระยะเวลา', 'พนักงานสัญญาจ้างที่มีวันสิ้นสุดสัญญา', NULL, 0, 0, 0, 'success', COALESCE(MAX(`sort_order`), 0) + 10, 1, NOW(), 'migration', 'migration'
FROM `employee_types`;
