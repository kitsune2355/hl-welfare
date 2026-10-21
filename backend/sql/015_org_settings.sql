-- ============================================================
--  015_org_settings.sql — ตั้งค่าองค์กรจากหน้าจอ (sites.html แท็บ บริษัท / ประเภทพนักงาน)
--
--  1) ประเภทพนักงานแก้ / เพิ่ม / ลบได้ — เดิมเป็น ENUM ในตาราง + เช็กรหัสในโค้ด
--     ตาราง employee_types เก็บพฤติกรรมของแต่ละประเภทแทนการเช็กรหัส:
--       companies        JSON ["PRO"] = ใช้ได้เฉพาะบริษัทเหล่านี้ · NULL = ทุกบริษัท   (เดิม: Pro Site ต้องเป็น PRO)
--       uses_dept_group  1 = ต้องมีกลุ่ม / ฝ่าย + ระดับ                               (เดิม: ส่วนกลาง)
--       uses_position    1 = เก็บตำแหน่ง (ใช้จับกฎชุดฟอร์มตามตำแหน่ง)                (เดิม: Pro Site)
--       daily_cycle      1 = แจ้งประกันรอบรายวัน (ค่าตั้ง insuranceCycleDayDaily)     (เดิม: รายวัน)
--     employees / insurance_rules / uniform_rules.employee_type: ENUM → VARCHAR(20) (ค่าเดิมไม่เปลี่ยน)
--  2) บริษัทเพิ่ม / ลบได้ (ตาราง companies มีอยู่แล้ว) + สีของบริษัท (แถบพนักงานหน้าภาพรวม)
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/015_org_settings.sql
--  ย้อนกลับ: backend/sql/015_org_settings_rollback.sql (ต้องไม่มีประเภทที่เพิ่มเองค้างในพนักงาน/กฎ)
-- ============================================================

SET NAMES utf8;

CREATE TABLE IF NOT EXISTS `employee_types` (
  `code`             VARCHAR(20)  NOT NULL,
  `name`             VARCHAR(100) NOT NULL,
  `description`      VARCHAR(255) NOT NULL DEFAULT '',
  `companies`        TEXT NULL COMMENT 'JSON · NULL = ทุกบริษัท',
  `uses_dept_group`  TINYINT(1) NOT NULL DEFAULT 0,
  `uses_position`    TINYINT(1) NOT NULL DEFAULT 0,
  `daily_cycle`      TINYINT(1) NOT NULL DEFAULT 0,
  `tone`             VARCHAR(20) NOT NULL DEFAULT 'neutral' COMMENT 'สีป้าย: primary info success warning danger neutral',
  `sort_order`       INT NOT NULL DEFAULT 0,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `employee_types` (`code`, `name`, `description`, `companies`, `uses_dept_group`, `uses_position`, `daily_cycle`, `tone`, `sort_order`, `created_at`, `created_by`, `updated_by`) VALUES
('CENTRAL',  'ส่วนกลาง',   'พนักงานสำนักงาน — มีกลุ่ม / ฝ่าย และระดับ', NULL, 1, 0, 0, 'primary', 10, NOW(), 'migration', 'migration'),
('PRO_SITE', 'Pro Site',   'พนักงานประจำโครงการของ PRO — แยกชุดฟอร์มตามตำแหน่ง', '["PRO"]', 0, 1, 0, 'info', 20, NOW(), 'migration', 'migration'),
('DAILY',    'รายวัน',     'พนักงานรายวัน — แจ้งประกันรอบรายวัน', NULL, 0, 0, 1, 'warning', 30, NOW(), 'migration', 'migration'),
('MAID_CNS', 'แม่บ้าน CNS', 'แม่บ้านของ CNS — ประกันกลุ่มตามหน่วยงาน', NULL, 0, 0, 0, 'neutral', 40, NOW(), 'migration', 'migration');

ALTER TABLE `employees`       MODIFY `employee_type` VARCHAR(20) NOT NULL;
ALTER TABLE `insurance_rules` MODIFY `employee_type` VARCHAR(20) NOT NULL;
ALTER TABLE `uniform_rules`   MODIFY `employee_type` VARCHAR(20) NOT NULL;

ALTER TABLE `companies` ADD COLUMN `color` VARCHAR(7) NOT NULL DEFAULT '' COMMENT '#rrggbb · ว่าง = สีตามลำดับ' AFTER `legal_name`;
UPDATE `companies` SET `color` = '#2563eb' WHERE `code` = 'HL'  AND `color` = '';
UPDATE `companies` SET `color` = '#0891b2' WHERE `code` = 'PRO' AND `color` = '';
UPDATE `companies` SET `color` = '#10b981' WHERE `code` = 'CNS' AND `color` = '';
UPDATE `companies` SET `color` = '#f59e0b' WHERE `code` = 'CIC' AND `color` = '';
UPDATE `companies` SET `color` = '#8b5cf6' WHERE `code` = 'AS'  AND `color` = '';

-- สิทธิ์ใหม่ org.edit (ตั้งค่าบริษัท / ประเภท / กลุ่ม-ฝ่าย) — ค่าเริ่มต้นเฉพาะ HR Admin (ตาราง role_capabilities จาก 008)
INSERT IGNORE INTO `role_capabilities` (`role`, `capability`, `allowed`, `created_at`, `created_by`, `updated_by`)
SELECT r.role, 'org.edit', r.role = 'HR_ADMIN', NOW(), 'migration-015', 'migration-015'
FROM (SELECT 'HR_ADMIN' AS role UNION ALL SELECT 'HR_COMPANY' UNION ALL SELECT 'PAYROLL' UNION ALL SELECT 'STOCK' UNION ALL SELECT 'EXECUTIVE') r;
