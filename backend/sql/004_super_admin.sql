-- ============================================================
--  004_super_admin.sql — เพิ่มบทบาท SUPER_ADMIN (ผู้ดูแลระบบ — ทำได้ทุกอย่าง รวมถึงส่งเบิก/ยกเลิกใบเบิกคลัง)
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/004_super_admin.sql
--  ย้อนกลับ: backend/sql/004_super_admin_rollback.sql
-- ============================================================

SET NAMES utf8;

ALTER TABLE `users`
  MODIFY `role` ENUM('SUPER_ADMIN','HR_ADMIN','HR_COMPANY','PAYROLL','STOCK','EXECUTIVE') NOT NULL DEFAULT 'HR_ADMIN';
