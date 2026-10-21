-- ============================================================
--  009_must_change_password.sql — บังคับเปลี่ยนรหัสผ่านหลังผู้ดูแลตั้ง/รีเซ็ตให้
--
--  ผู้ดูแลสร้างผู้ใช้ หรือรีเซ็ตรหัสผ่าน (ค่าเริ่มต้น 4123 — AUTH_DEFAULT_PASSWORD ใน backend/auth.php) → 1
--  ผู้ใช้ตั้งรหัสผ่านเองที่ "บัญชีของฉัน" → 0 · ระหว่างเป็น 1 ทุก API ตอบ 403 PASSWORD_CHANGE_REQUIRED
--  ยกเว้น /auth/me และ /auth/password (หน้าเว็บขึ้นกล่องให้เปลี่ยนรหัสก่อนใช้งาน)
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/009_must_change_password.sql
--  ย้อนกลับ: backend/sql/009_must_change_password_rollback.sql
-- ============================================================

SET NAMES utf8;

ALTER TABLE `users`
  ADD COLUMN `must_change_password` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = ผู้ดูแลตั้งรหัสให้ (เช่น 4123) ต้องเปลี่ยนเองก่อนใช้งาน' AFTER `session_version`;
