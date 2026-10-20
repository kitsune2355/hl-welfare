-- ============================================================
--  013_notifications.sql — การแจ้งเตือน (กระดิ่งบนแถบบน)
--
--  1 แถว = แจ้งเตือน 1 เรื่องถึงผู้ใช้ 1 คน (ส่งหลายคน = หลายแถว — อ่านแล้วของแต่ละคนแยกกัน)
--  สร้างโดย backend/usecases/notifications.php เมื่อ:
--    - ใบเบิกชุดฟอร์มในสต็อก Uniform เปลี่ยนสถานะ (อนุมัติ / ไม่อนุมัติ / ยกเลิก / คลังจ่าย / เซ็นรับ) → HR ที่ส่งเบิก
--    - บันทึกพ้นสภาพแบบต้องแจ้งออกประกันทันที (เลิกจ้าง / กระทำผิด) → HR ที่แจ้งประกันของบริษัทนั้นได้
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/013_notifications.sql
--  ย้อนกลับ: backend/sql/013_notifications_rollback.sql
-- ============================================================

SET NAMES utf8;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED NOT NULL COMMENT 'ผู้รับ (users.id)',
  `type`         VARCHAR(40)  NOT NULL COMMENT 'stock_approved | stock_rejected | stock_cancelled | stock_issued | stock_received | insurance_urgent',
  `title`        VARCHAR(200) NOT NULL,
  `message`      VARCHAR(500) NOT NULL DEFAULT '',
  `link`         VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'หน้าปลายทาง เช่น employee.html?id=5 (relative จาก web/)',
  `employee_id`  INT UNSIGNED NULL,
  `is_read`      TINYINT(1)   NOT NULL DEFAULT 0,
  `read_at`      DATETIME     NULL,
  `created_at`   DATETIME     NOT NULL,
  `created_by`   VARCHAR(50)  NOT NULL,
  `updated_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`   VARCHAR(50)  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_noti_user` (`user_id`, `id`),
  KEY `idx_noti_unread` (`user_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
