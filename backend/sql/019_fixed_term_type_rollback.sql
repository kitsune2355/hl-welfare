-- ย้อนกลับ 019 — ลบประเภท FIXED_TERM เฉพาะเมื่อยังไม่มีพนักงาน/กฎที่ใช้ (มีแล้ว = ไม่ลบ ให้ปิดใช้งานแทน)
SET NAMES utf8;

DELETE FROM `employee_types`
WHERE `code` = 'FIXED_TERM'
  AND NOT EXISTS (SELECT 1 FROM `employees` WHERE `employee_type` = 'FIXED_TERM')
  AND NOT EXISTS (SELECT 1 FROM `insurance_rules` WHERE `employee_type` = 'FIXED_TERM')
  AND NOT EXISTS (SELECT 1 FROM `uniform_rules` WHERE `employee_type` = 'FIXED_TERM');
