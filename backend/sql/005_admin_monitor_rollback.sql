-- ย้อน 005_admin_monitor.sql — การปลดล็อกที่เคยทำจะหายไป (ครั้งที่ผิดกลับมานับ จนพ้นช่วง login_window_minutes)
SET NAMES utf8;

ALTER TABLE `auth_sessions` DROP KEY `idx_session_expires`;
ALTER TABLE `auth_login_attempts` DROP KEY `idx_attempt_at`;
ALTER TABLE `auth_login_attempts` DROP COLUMN `cleared_at`;
