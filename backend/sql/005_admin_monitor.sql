-- ============================================================
--  005_admin_monitor.sql — หน้าผู้ดูแลระบบ (admin.html, SUPER_ADMIN เท่านั้น)
--
--  ปลดล็อกการเดารหัสผ่าน: ผู้ดูแลกด "ปลดล็อก" → ใส่ cleared_at ให้ครั้งที่ผิดในช่วงล็อก
--  (เก็บประวัติไว้ ไม่ลบ) · auth.php นับเฉพาะแถวที่ cleared_at IS NULL
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/005_admin_monitor.sql
--  ย้อนกลับ: backend/sql/005_admin_monitor_rollback.sql
-- ============================================================

SET NAMES utf8;

ALTER TABLE `auth_login_attempts`
  ADD COLUMN `cleared_at` DATETIME NULL COMMENT 'ผู้ดูแลปลดล็อก (ไม่นับครั้งนี้) · ผู้ปลด = updated_by' AFTER `succeeded`;

-- ล้างข้อมูลเก่า (bin/cleanup.php) ลบตามวันที่
ALTER TABLE `auth_login_attempts` ADD KEY `idx_attempt_at` (`created_at`);
ALTER TABLE `auth_sessions` ADD KEY `idx_session_expires` (`expires_at`);
