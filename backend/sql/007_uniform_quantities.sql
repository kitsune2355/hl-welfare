-- ============================================================
--  007_uniform_quantities.sql — ชุดฟอร์มแบบจำนวนต่อรายการ + หน่วยงานตั้งทับกฎ + คำตอบของ HR (19 ต.ค. 69)
--
--  1) uniform_rules.quantities  จำนวนต่อรายการต่อรอบ (JSON)
--       {"START":{"TECH_SHIRT":2,"POLO_BLACK":1},"PROBATION":{...},"ANNUAL":{...}}
--     qty_start / qty_probation / qty_annual เหลือเป็นจำนวนรวมของรอบ (แอปคำนวณจาก quantities ตอนบันทึก)
--     qty_start_label ("2+1") ไม่ใช้แล้ว — ตั้งเป็น NULL
--  2) site_uniform_overrides    หน่วยงานตั้งชุดฟอร์มทับกฎข้อไหนก็ได้ (แทนจำนวนของกฎทั้งชุด)
--  3) กฎมีวันที่มีผล (แก้ผ่านหน้าเงื่อนไขสวัสดิการ)
--       insurance_rules / uniform_rules: 1 แถว = 1 ฉบับของกฎ
--         rule_key       รหัสกฎ คงที่ทุกฉบับ (แถวเดิม = id ของตัวเอง) — แอปเรียกกฎด้วยรหัสนี้
--         effective_from ใช้ตั้งแต่วันที่ (กฎเดิม = 2000-01-01)
--         is_deleted     ฉบับที่ "ลบกฎ" — ตั้งแต่วันนั้นกฎนี้ไม่มีผล
--       กฎที่ใช้ ณ วันที่ d = ฉบับล่าสุดที่ effective_from <= d ของแต่ละ rule_key (domain/rule_versions.php)
--       settings: เพิ่ม effective_from — ค่าตั้งค่าก็มีวันที่มีผลได้ (PK = key + effective_from)
--  4) คำตอบของ HR
--       - พนักงานรายวัน CNS / CIC / PRO ได้ประกันกลุ่ม 120 วัน (กฎประกัน 3 = ทุกบริษัท)
--       - ระดับ "6 ขึ้นไป" สูงสุดระดับ 9 (level_max = 9)
--       - CIC ระดับ 6–9 ได้ 1 ตัว (กฎ 19 ใหม่)
--       - ช่างทีมโมบาย "2+1" = ชุดช่าง 2 + โปโล 1 (กฎ 16 รอบเริ่มงาน)
--     ค่าสร้างจาก web/assets/js/infrastructure/mock/rules.js ณ วันที่สร้างไฟล์
--     รันครั้งเดียว: กฎที่ HR แก้ทีหลังจะถูกเขียนทับถ้ารันซ้ำ
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/007_uniform_quantities.sql
--  ย้อนกลับ: backend/sql/007_uniform_quantities_rollback.sql
-- ============================================================

SET NAMES utf8;

ALTER TABLE `uniform_rules`
  ADD COLUMN `quantities` TEXT NULL COMMENT 'JSON จำนวนต่อรายการต่อรอบ' AFTER `polo_by_site`,
  ADD COLUMN `rule_key` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'รหัสกฎ คงที่ทุกฉบับ' AFTER `id`,
  ADD COLUMN `effective_from` DATE NOT NULL DEFAULT '2000-01-01' COMMENT 'ฉบับนี้ใช้ตั้งแต่วันที่' AFTER `rule_key`,
  ADD COLUMN `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = ฉบับที่ลบกฎ' AFTER `effective_from`,
  ADD KEY `idx_uniform_rule_version` (`rule_key`, `effective_from`);
UPDATE `uniform_rules` SET `rule_key` = `id` WHERE `rule_key` = 0;

ALTER TABLE `insurance_rules`
  ADD COLUMN `rule_key` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'รหัสกฎ คงที่ทุกฉบับ' AFTER `id`,
  ADD COLUMN `effective_from` DATE NOT NULL DEFAULT '2000-01-01' COMMENT 'ฉบับนี้ใช้ตั้งแต่วันที่' AFTER `rule_key`,
  ADD COLUMN `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = ฉบับที่ลบกฎ' AFTER `effective_from`,
  ADD KEY `idx_insurance_rule_version` (`rule_key`, `effective_from`);
UPDATE `insurance_rules` SET `rule_key` = `id` WHERE `rule_key` = 0;

ALTER TABLE `settings`
  ADD COLUMN `effective_from` DATE NOT NULL DEFAULT '2000-01-01' COMMENT 'ค่านี้ใช้ตั้งแต่วันที่' AFTER `value`,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`key`, `effective_from`);

CREATE TABLE IF NOT EXISTS `site_uniform_overrides` (
  `site_id`     INT UNSIGNED NOT NULL,
  `rule_id`     INT UNSIGNED NOT NULL COMMENT 'รหัสกฎชุดฟอร์ม (uniform_rules.rule_key) ที่หน่วยงานนี้ตั้งทับ',
  `quantities`  TEXT NOT NULL COMMENT 'JSON แบบเดียวกับ uniform_rules.quantities — แทนของกฎทั้งชุด',
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`site_id`, `rule_id`),
  KEY `idx_override_rule` (`rule_id`),
  CONSTRAINT `fk_override_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='ชุดฟอร์มของหน่วยงานที่ต่างจากกฎกลาง (rule_id = rule_key ไม่ผูก FK เพราะมีหลายฉบับ)';

-- ---------- ประกันกลุ่ม ----------
UPDATE `insurance_rules` SET `companies` = NULL, `wait_days` = 30, `note` = 'พนักงานส่วนกลางทุกบริษัท', `updated_by` = 'migration-007' WHERE `id` = 1;
UPDATE `insurance_rules` SET `companies` = '["PRO"]', `wait_days` = 30, `note` = 'สัญญา 3% ระยะสั้น ไม่ได้รับประกันกลุ่ม', `updated_by` = 'migration-007' WHERE `id` = 2;
UPDATE `insurance_rules` SET `companies` = '["HL","AS","CNS","CIC","PRO"]', `wait_days` = 120, `note` = 'พนักงานรายวันทุกบริษัท (HR ยืนยัน CNS / CIC / PRO ได้ด้วย)', `updated_by` = 'migration-007' WHERE `id` = 3;
UPDATE `insurance_rules` SET `companies` = '["CNS"]', `wait_days` = 120, `note` = 'เฉพาะหน่วยงานที่ระบุว่าได้รับประกันกลุ่ม', `updated_by` = 'migration-007' WHERE `id` = 4;

-- ---------- ชุดฟอร์ม: กฎใหม่ (CIC ระดับ 6–9) ----------
INSERT IGNORE INTO `uniform_rules` (`id`, `rule_key`, `employee_type`, `companies`, `dept_groups`, `position`, `level_min`, `level_max`, `style`, `logo`, `items`, `polo_by_site`, `qty_start`, `qty_start_label`, `qty_probation`, `qty_annual`, `note`, `created_at`, `created_by`, `updated_by`) VALUES
  (19, 19, 'CENTRAL', '["CIC"]', '["BU ส่วนกลาง","บริหารห้องเช่าและพื้นที่เช่า"]', NULL, 6, 9, 'โปโลสีดำ โลโก้ HL', 'HL', '["POLO_BLACK"]', 0, 0, NULL, 1, 1, '', NOW(), 'migration-007', 'migration-007');

-- ---------- ชุดฟอร์ม: จำนวนต่อรายการ + ระดับสูงสุด 9 ----------
UPDATE `uniform_rules` SET `level_min` = 1, `level_max` = 5, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":4},"ANNUAL":{"POLO_BLACK":2}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 4, `qty_annual` = 2, `updated_by` = 'migration-007' WHERE `id` = 1;
UPDATE `uniform_rules` SET `level_min` = 6, `level_max` = 9, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":2},"ANNUAL":{"POLO_BLACK":1}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 2, `qty_annual` = 1, `updated_by` = 'migration-007' WHERE `id` = 2;
UPDATE `uniform_rules` SET `level_min` = NULL, `level_max` = NULL, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":2},"ANNUAL":{"POLO_BLACK":1}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 2, `qty_annual` = 1, `updated_by` = 'migration-007' WHERE `id` = 3;
UPDATE `uniform_rules` SET `level_min` = 1, `level_max` = 5, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":4},"ANNUAL":{"POLO_BLACK":2}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 4, `qty_annual` = 2, `updated_by` = 'migration-007' WHERE `id` = 4;
UPDATE `uniform_rules` SET `level_min` = 6, `level_max` = 9, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":2},"ANNUAL":{"POLO_BLACK":1}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 2, `qty_annual` = 1, `updated_by` = 'migration-007' WHERE `id` = 5;
UPDATE `uniform_rules` SET `level_min` = NULL, `level_max` = NULL, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":2},"ANNUAL":{"POLO_BLACK":1}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 2, `qty_annual` = 1, `updated_by` = 'migration-007' WHERE `id` = 6;
UPDATE `uniform_rules` SET `level_min` = 1, `level_max` = 5, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":4},"ANNUAL":{"POLO_BLACK":2}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 4, `qty_annual` = 2, `updated_by` = 'migration-007' WHERE `id` = 7;
UPDATE `uniform_rules` SET `level_min` = 6, `level_max` = 9, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":2},"ANNUAL":{"POLO_BLACK":1}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 2, `qty_annual` = 1, `updated_by` = 'migration-007' WHERE `id` = 8;
UPDATE `uniform_rules` SET `level_min` = NULL, `level_max` = NULL, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":2},"ANNUAL":{"POLO_BLACK":1}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 2, `qty_annual` = 1, `updated_by` = 'migration-007' WHERE `id` = 9;
UPDATE `uniform_rules` SET `level_min` = 1, `level_max` = 5, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":4},"ANNUAL":{"POLO_BLACK":2}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 4, `qty_annual` = 2, `updated_by` = 'migration-007' WHERE `id` = 10;
UPDATE `uniform_rules` SET `level_min` = 6, `level_max` = 9, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":2},"ANNUAL":{"POLO_BLACK":1}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 2, `qty_annual` = 1, `updated_by` = 'migration-007' WHERE `id` = 11;
UPDATE `uniform_rules` SET `level_min` = NULL, `level_max` = NULL, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":2},"ANNUAL":{"POLO_BLACK":1}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 2, `qty_annual` = 1, `updated_by` = 'migration-007' WHERE `id` = 12;
UPDATE `uniform_rules` SET `level_min` = NULL, `level_max` = NULL, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":2},"ANNUAL":{"POLO_BLACK":1}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 2, `qty_annual` = 1, `updated_by` = 'migration-007' WHERE `id` = 13;
UPDATE `uniform_rules` SET `level_min` = 1, `level_max` = 5, `quantities` = '{"START":{"POLO_BLACK":3},"PROBATION":{"POLO_BLACK":1},"ANNUAL":{"POLO_BLACK":2}}', `qty_start` = 3, `qty_start_label` = NULL, `qty_probation` = 1, `qty_annual` = 2, `updated_by` = 'migration-007' WHERE `id` = 14;
UPDATE `uniform_rules` SET `level_min` = NULL, `level_max` = NULL, `quantities` = '{"START":{"TECH_SHIRT":2,"TECH_PANTS":2,"SAFETY_SHOES":1},"PROBATION":{"TECH_SHIRT":1,"TECH_PANTS":1,"SAFETY_SHOES":1},"ANNUAL":{"TECH_SHIRT":2,"TECH_PANTS":2,"SAFETY_SHOES":1}}', `qty_start` = 5, `qty_start_label` = NULL, `qty_probation` = 3, `qty_annual` = 5, `updated_by` = 'migration-007' WHERE `id` = 15;
UPDATE `uniform_rules` SET `level_min` = NULL, `level_max` = NULL, `quantities` = '{"START":{"POLO_BLACK":1,"TECH_SHIRT":2,"TECH_PANTS":2,"SAFETY_SHOES":1},"PROBATION":{"POLO_BLACK":1,"TECH_SHIRT":1,"TECH_PANTS":1,"SAFETY_SHOES":1},"ANNUAL":{"POLO_BLACK":2,"TECH_SHIRT":2,"TECH_PANTS":2,"SAFETY_SHOES":1}}', `qty_start` = 6, `qty_start_label` = NULL, `qty_probation` = 4, `qty_annual` = 7, `updated_by` = 'migration-007' WHERE `id` = 16;
UPDATE `uniform_rules` SET `level_min` = NULL, `level_max` = NULL, `quantities` = '{"START":{"POLO_BLACK":3,"SAFETY_SHOES":1},"PROBATION":{"POLO_BLACK":1,"SAFETY_SHOES":1},"ANNUAL":{"POLO_BLACK":2,"SAFETY_SHOES":1}}', `qty_start` = 4, `qty_start_label` = NULL, `qty_probation` = 2, `qty_annual` = 3, `updated_by` = 'migration-007' WHERE `id` = 17;
UPDATE `uniform_rules` SET `level_min` = NULL, `level_max` = NULL, `quantities` = '{"START":{"TECH_SHIRT":3,"TECH_PANTS":3,"POLO_NAVY":3},"PROBATION":{"TECH_SHIRT":1,"TECH_PANTS":1,"POLO_NAVY":1},"ANNUAL":{"TECH_SHIRT":2,"TECH_PANTS":2,"POLO_NAVY":2}}', `qty_start` = 9, `qty_start_label` = NULL, `qty_probation` = 3, `qty_annual` = 6, `updated_by` = 'migration-007' WHERE `id` = 18;
UPDATE `uniform_rules` SET `level_min` = 6, `level_max` = 9, `quantities` = '{"START":{"POLO_BLACK":0},"PROBATION":{"POLO_BLACK":1},"ANNUAL":{"POLO_BLACK":1}}', `qty_start` = 0, `qty_start_label` = NULL, `qty_probation` = 1, `qty_annual` = 1, `updated_by` = 'migration-007' WHERE `id` = 19;
