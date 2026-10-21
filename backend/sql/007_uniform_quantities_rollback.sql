-- ============================================================
--  007_uniform_quantities_rollback.sql — ย้อน 007
--
--  สิ่งที่หายไปตอนย้อน (โครงเดิมเก็บไม่ได้):
--    - ชุดฟอร์มของหน่วยงานที่ตั้งทับกฎ (site_uniform_overrides)
--    - ฉบับแก้ไขของกฎและค่าตั้งค่าที่บันทึกผ่านหน้าเงื่อนไขสวัสดิการ (เหลือฉบับแรกของแต่ละกฎ)
--  กฎกลับเป็นจำนวนรวมต่อรอบแบบเดิม (qty_start/qty_probation/qty_annual ที่ 007 คำนวณไว้ยังอยู่)
--  ต้องย้อนโค้ดก่อนรันไฟล์นี้
-- ============================================================

SET NAMES utf8;

DROP TABLE IF EXISTS `site_uniform_overrides`;

-- ฉบับที่เพิ่มทีหลัง (ฉบับแรกของแต่ละกฎมี id = rule_key)
DELETE FROM `uniform_rules` WHERE `id` <> `rule_key`;
DELETE FROM `insurance_rules` WHERE `id` <> `rule_key`;
DELETE FROM `settings` WHERE `effective_from` <> '2000-01-01';

ALTER TABLE `uniform_rules`
  DROP KEY `idx_uniform_rule_version`,
  DROP COLUMN `is_deleted`, DROP COLUMN `effective_from`, DROP COLUMN `rule_key`, DROP COLUMN `quantities`;
ALTER TABLE `insurance_rules`
  DROP KEY `idx_insurance_rule_version`,
  DROP COLUMN `is_deleted`, DROP COLUMN `effective_from`, DROP COLUMN `rule_key`;
ALTER TABLE `settings`
  DROP PRIMARY KEY,
  DROP COLUMN `effective_from`,
  ADD PRIMARY KEY (`key`);

-- คำตอบของ HR ที่ 007 ใส่ไว้
DELETE FROM `uniform_rules` WHERE `id` = 19 AND `created_by` = 'migration-007';
UPDATE `uniform_rules` SET `level_max` = NULL, `updated_by` = 'rollback-007' WHERE `level_min` = 6 AND `level_max` = 9;
UPDATE `uniform_rules` SET `qty_start_label` = '2+1', `qty_start` = 3, `updated_by` = 'rollback-007' WHERE `id` = 16;
UPDATE `insurance_rules` SET `companies` = '["HL","AS"]', `note` = 'พนักงานรายวัน HL, AS', `updated_by` = 'rollback-007' WHERE `id` = 3;
