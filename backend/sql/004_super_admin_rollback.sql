-- ย้อน 004_super_admin.sql — ผู้ใช้ SUPER_ADMIN จะถูกเปลี่ยนเป็น HR_ADMIN ก่อนตัดค่าออกจาก ENUM
SET NAMES utf8;

UPDATE `users` SET `role` = 'HR_ADMIN', `updated_by` = 'rollback-004' WHERE `role` = 'SUPER_ADMIN';
ALTER TABLE `users`
  MODIFY `role` ENUM('HR_ADMIN','HR_COMPANY','PAYROLL','STOCK','EXECUTIVE') NOT NULL DEFAULT 'HR_ADMIN';
