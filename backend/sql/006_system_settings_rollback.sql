-- ย้อน 006_system_settings.sql — ค่าที่ตั้งจากหน้า admin หายไป ระบบกลับไปใช้ backend/config.php
-- (ถ้าเคยเปลี่ยน stock_api_secret จากหน้าเว็บ ต้องใส่ค่านั้นใน config.php ก่อน ไม่งั้นต่อสต็อกไม่ได้)
SET NAMES utf8;

DROP TABLE IF EXISTS `system_settings`;
