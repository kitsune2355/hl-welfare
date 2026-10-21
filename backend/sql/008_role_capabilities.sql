-- ============================================================
--  008_role_capabilities.sql — สิทธิ์การใช้งานรายบทบาท (หน้า admin.html แท็บ "สิทธิ์การใช้งาน")
--
--  1 แถว = บทบาทนี้ทำ capability นี้ได้หรือไม่ (allowed 1/0)
--  รายการ capability + ค่าเริ่มต้นอยู่ใน backend/permissions.php (perm_defs) — ไม่มีแถว = ใช้ค่าเริ่มต้นในโค้ด
--  SUPER_ADMIN ไม่มีแถว: ทำได้ทุกอย่างเสมอ (กันผู้ดูแลล็อกตัวเอง)
--  ค่าที่ใส่ด้านล่าง = พฤติกรรมเดิมก่อนมีตารางนี้ (ทุกบทบาททำได้ทุกอย่าง ยกเว้นส่งเบิกคลัง และแก้เงื่อนไขสวัสดิการ)
--  + เมนูผู้ดูแล: จัดการผู้ใช้ = HR Admin · ส่วนอื่นของหน้าผู้ดูแล = SUPER_ADMIN เท่านั้น (เปิดให้บทบาทอื่นได้จากหน้าสิทธิ์)
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/008_role_capabilities.sql
--  ย้อนกลับ: backend/sql/008_role_capabilities_rollback.sql (กลับไปใช้ค่าเริ่มต้นในโค้ด)
-- ============================================================

SET NAMES utf8;

CREATE TABLE `role_capabilities` (
  `role`        VARCHAR(20) NOT NULL COMMENT 'users.role (ไม่รวม SUPER_ADMIN)',
  `capability`  VARCHAR(50) NOT NULL COMMENT 'เช่น employees.edit — ดู perm_defs()',
  `allowed`     TINYINT(1) NOT NULL,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`role`, `capability`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO `role_capabilities` (`role`, `capability`, `allowed`, `created_at`, `created_by`, `updated_by`)
SELECT r.role, c.cap,
       CASE
         WHEN c.cap = 'stock.request' THEN r.role IN ('HR_ADMIN', 'HR_COMPANY')
         WHEN c.cap = 'rules.edit'    THEN r.role = 'HR_ADMIN'
         WHEN c.cap = 'users.manage'  THEN r.role = 'HR_ADMIN'
         WHEN c.cap IN ('security.view', 'system.health', 'system.settings', 'audit.view') THEN 0
         ELSE 1
       END,
       NOW(), 'migration-008', 'migration-008'
FROM (SELECT 'HR_ADMIN' AS role UNION ALL SELECT 'HR_COMPANY' UNION ALL SELECT 'PAYROLL' UNION ALL SELECT 'STOCK' UNION ALL SELECT 'EXECUTIVE') r
CROSS JOIN (
  SELECT 'dashboard.view' AS cap UNION ALL SELECT 'employees.view' UNION ALL SELECT 'employees.edit'
  UNION ALL SELECT 'insurance.view' UNION ALL SELECT 'insurance.export' UNION ALL SELECT 'insurance.submit'
  UNION ALL SELECT 'uniform.view' UNION ALL SELECT 'uniform.issue' UNION ALL SELECT 'stock.request'
  UNION ALL SELECT 'rules.view' UNION ALL SELECT 'rules.edit'
  UNION ALL SELECT 'sites.view' UNION ALL SELECT 'sites.edit'
  UNION ALL SELECT 'insurers.view' UNION ALL SELECT 'insurers.edit'
  UNION ALL SELECT 'users.manage' UNION ALL SELECT 'security.view' UNION ALL SELECT 'system.health'
  UNION ALL SELECT 'system.settings' UNION ALL SELECT 'audit.view'
) c;
