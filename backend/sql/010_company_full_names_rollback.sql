-- ============================================================
--  010_company_full_names_rollback.sql — ย้อน 010 (ชื่อบริษัทกลับเป็นแบบ "บ.…")
--  สต็อก Uniform ไม่ย้อนตาม — ส่ง sync_master อีกครั้งหลังย้อน ถ้าต้องการให้สต็อกเป็นชื่อแบบเดิมด้วย
-- ============================================================

SET NAMES utf8;

UPDATE `companies` SET `legal_name` = 'บ.แฮปปี้แลนด์ จำกัด', `updated_by` = 'rollback-010' WHERE `code` = 'HL' AND `legal_name` = 'บริษัท แฮปปี้แลนด์ จำกัด';
UPDATE `companies` SET `legal_name` = 'บ.โปรแอ็คทีฟ แมเนจเม้นท์ จำกัด', `updated_by` = 'rollback-010' WHERE `code` = 'PRO' AND `legal_name` = 'บริษัท โปรแอ็คทีฟ แมเนจเม้นท์ จำกัด';
UPDATE `companies` SET `legal_name` = 'บ.คลีนนิ่ง โซลูชั่น จำกัด', `updated_by` = 'rollback-010' WHERE `code` = 'CNS' AND `legal_name` = 'บริษัท คลีนนิ่ง โซลูชั่น จำกัด';
UPDATE `companies` SET `legal_name` = 'บ.คอน.อิน.คอน จำกัด', `updated_by` = 'rollback-010' WHERE `code` = 'CIC' AND `legal_name` = 'บริษัท คอน.อิน.คอน จำกัด';
UPDATE `companies` SET `legal_name` = 'บ.อาเชี่ยน คอนสตรั๊คชั่น จำกัด', `updated_by` = 'rollback-010' WHERE `code` = 'AS' AND `legal_name` = 'บริษัท อาเชี่ยน คอนสตรั๊คชั่น จำกัด';
