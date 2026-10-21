-- ย้อน 001_schema.sql — ลบทุกตาราง (ข้อมูลหายทั้งหมด)
SET NAMES utf8;
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `audit_log`, `uniform_issues`, `insurance_batch_items`, `insurance_batches`,
  `auth_login_attempts`, `auth_refresh_tokens`, `auth_sessions`, `users`, `insurer_forms`, `settings`,
  `uniform_rules`, `uniform_items`, `insurance_rules`, `employees`, `sites`, `companies`;
SET FOREIGN_KEY_CHECKS = 1;
