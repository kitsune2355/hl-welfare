-- ============================================================
--  010_company_full_names.sql — ชื่อบริษัทตามทะเบียนแบบเต็ม "บริษัท … จำกัด"
--
--  ระบบสวัสดิการเป็นต้นทางของข้อมูลบริษัท ส่งไปสต็อก Uniform ด้วย sync_master (api/master_sync.php)
--  สต็อกพิมพ์ชื่อบริษัทบนหัวเอกสาร จึงใช้ชื่อเต็มเหมือนกันทั้งสองระบบ (ผู้ใช้เลือก "ชื่อเต็ม")
--  ชื่อย่อ (HL / PRO …) ยังเป็นรหัสบริษัทในตารางของระบบสวัสดิการเหมือนเดิม
--  แก้เฉพาะแถวที่ยังเป็นชื่อแบบเดิม "บ.…" — ชื่อที่ HR แก้เองแล้วไม่ถูกเขียนทับ
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/010_company_full_names.sql
--  ย้อนกลับ: backend/sql/010_company_full_names_rollback.sql
-- ============================================================

SET NAMES utf8;

UPDATE `companies` SET `legal_name` = 'บริษัท แฮปปี้แลนด์ จำกัด', `updated_by` = 'migration-010' WHERE `code` = 'HL' AND `legal_name` = 'บ.แฮปปี้แลนด์ จำกัด';
UPDATE `companies` SET `legal_name` = 'บริษัท โปรแอ็คทีฟ แมเนจเม้นท์ จำกัด', `updated_by` = 'migration-010' WHERE `code` = 'PRO' AND `legal_name` = 'บ.โปรแอ็คทีฟ แมเนจเม้นท์ จำกัด';
UPDATE `companies` SET `legal_name` = 'บริษัท คลีนนิ่ง โซลูชั่น จำกัด', `updated_by` = 'migration-010' WHERE `code` = 'CNS' AND `legal_name` = 'บ.คลีนนิ่ง โซลูชั่น จำกัด';
UPDATE `companies` SET `legal_name` = 'บริษัท คอน.อิน.คอน จำกัด', `updated_by` = 'migration-010' WHERE `code` = 'CIC' AND `legal_name` = 'บ.คอน.อิน.คอน จำกัด';
UPDATE `companies` SET `legal_name` = 'บริษัท อาเชี่ยน คอนสตรั๊คชั่น จำกัด', `updated_by` = 'migration-010' WHERE `code` = 'AS' AND `legal_name` = 'บ.อาเชี่ยน คอนสตรั๊คชั่น จำกัด';
