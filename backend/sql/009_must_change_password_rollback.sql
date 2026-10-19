-- ย้อน 009_must_change_password.sql — ไม่บังคับเปลี่ยนรหัสผ่านอีก (ผู้ใช้ที่ยังใช้ 4123 อยู่จะใช้ต่อได้ — ควรรีเซ็ตเป็นรหัสอื่นก่อนย้อน)
SET NAMES utf8;

ALTER TABLE `users` DROP COLUMN `must_change_password`;
