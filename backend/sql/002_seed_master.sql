-- ============================================================
--  002_seed_master.sql — บริษัท หน่วยงาน กฎสวัสดิการ ตั้งค่า แบบฟอร์มประกัน
--  สร้างโดย scripts/export-seed.mjs 2026-10-19 (ห้ามแก้มือ — แก้ที่ web/assets/js/infrastructure/mock/ แล้วสร้างใหม่)
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/002_seed_master.sql
-- ============================================================

SET NAMES utf8;

INSERT INTO `companies` (`code`, `name`, `legal_name`, `sort_order`, `created_at`, `created_by`, `updated_by`) VALUES
  ('HL', 'แฮปปี้แลนด์ (HL)', 'บริษัท แฮปปี้แลนด์ จำกัด', 1, '2026-10-19 00:00:00', 'system', 'system'),
  ('PRO', 'PRO', 'บริษัท โปรแอ็คทีฟ แมเนจเม้นท์ จำกัด', 2, '2026-10-19 00:00:00', 'system', 'system'),
  ('CNS', 'CNS', 'บริษัท คลีนนิ่ง โซลูชั่น จำกัด', 3, '2026-10-19 00:00:00', 'system', 'system'),
  ('CIC', 'CIC', 'บริษัท คอน.อิน.คอน จำกัด', 4, '2026-10-19 00:00:00', 'system', 'system'),
  ('AS', 'AS', 'บริษัท อาเชี่ยน คอนสตรั๊คชั่น จำกัด', 5, '2026-10-19 00:00:00', 'system', 'system');

INSERT INTO `sites` (`id`, `company_code`, `name`, `has_group_insurance`, `polo_color`, `created_at`, `created_by`, `updated_by`) VALUES
  (1, 'HL', 'สำนักงานใหญ่ HL', 1, 'BLACK', '2026-10-19 00:00:00', 'system', 'system'),
  (2, 'HL', 'คลังสินค้า HL', 1, 'BLACK', '2026-10-19 00:00:00', 'system', 'system'),
  (3, 'PRO', 'สำนักงาน PRO', 1, 'BLACK', '2026-10-19 00:00:00', 'system', 'system'),
  (4, 'PRO', 'Pro Site — โครงการพระราม 9', 1, 'BLACK', '2026-10-19 00:00:00', 'system', 'system'),
  (5, 'PRO', 'Pro Site — โครงการบางนา', 1, 'NAVY', '2026-10-19 00:00:00', 'system', 'system'),
  (6, 'CNS', 'สำนักงาน CNS', 1, 'BLACK', '2026-10-19 00:00:00', 'system', 'system'),
  (7, 'CNS', 'หน่วยงาน อาคารสีลม', 1, 'BLACK', '2026-10-19 00:00:00', 'system', 'system'),
  (8, 'CNS', 'หน่วยงาน โรงพยาบาลรามอินทรา', 0, 'BLACK', '2026-10-19 00:00:00', 'system', 'system'),
  (9, 'CIC', 'สำนักงาน CIC', 1, 'BLACK', '2026-10-19 00:00:00', 'system', 'system'),
  (10, 'AS', 'สำนักงาน AS', 1, 'BLACK', '2026-10-19 00:00:00', 'system', 'system'),
  (11, 'AS', 'ไซต์ก่อสร้าง AS', 1, 'BLACK', '2026-10-19 00:00:00', 'system', 'system');

INSERT INTO `insurance_rules` (`id`, `employee_type`, `companies`, `wait_days`, `exclude_contracts`, `require_site_insurance`, `note`, `created_at`, `created_by`, `updated_by`) VALUES
  (1, 'CENTRAL', NULL, 30, '[]', 0, 'พนักงานส่วนกลางทุกบริษัท', '2026-10-19 00:00:00', 'system', 'system'),
  (2, 'PRO_SITE', '["PRO"]', 30, '["SHORT_3PCT"]', 0, 'สัญญา 3% ระยะสั้น ไม่ได้รับประกันกลุ่ม', '2026-10-19 00:00:00', 'system', 'system'),
  (3, 'DAILY', '["HL","AS","CNS","CIC","PRO"]', 120, '[]', 0, 'พนักงานรายวันทุกบริษัท (HR ยืนยัน CNS / CIC / PRO ได้ด้วย)', '2026-10-19 00:00:00', 'system', 'system'),
  (4, 'MAID_CNS', '["CNS"]', 120, '[]', 1, 'เฉพาะหน่วยงานที่ระบุว่าได้รับประกันกลุ่ม', '2026-10-19 00:00:00', 'system', 'system');

INSERT INTO `uniform_items` (`code`, `name`, `sort_order`, `created_at`, `created_by`, `updated_by`) VALUES
  ('POLO_BLACK', 'โปโลสีดำ', 1, '2026-10-19 00:00:00', 'system', 'system'),
  ('POLO_NAVY', 'โปโลสีน้ำเงิน', 2, '2026-10-19 00:00:00', 'system', 'system'),
  ('TECH_SHIRT', 'เสื้อช่าง', 3, '2026-10-19 00:00:00', 'system', 'system'),
  ('TECH_PANTS', 'กางเกงช่าง', 4, '2026-10-19 00:00:00', 'system', 'system'),
  ('SAFETY_SHOES', 'รองเท้า Safety', 5, '2026-10-19 00:00:00', 'system', 'system');

INSERT INTO `uniform_rules` (`id`, `employee_type`, `companies`, `dept_groups`, `position`, `level_min`, `level_max`, `style`, `logo`, `items`, `polo_by_site`, `qty_start`, `qty_start_label`, `qty_probation`, `qty_annual`, `note`, `created_at`, `created_by`, `updated_by`) VALUES
  (1, 'CENTRAL', '["HL","PRO","CNS","CIC"]', '["Support Line"]', NULL, 1, 5, 'โปโลสีดำ โลโก้ HL', 'HL', '["POLO_BLACK"]', 0, 0, NULL, 4, 2, '', '2026-10-19 00:00:00', 'system', 'system'),
  (2, 'CENTRAL', '["HL","PRO","CNS","CIC"]', '["Support Line"]', NULL, 6, 9, 'โปโลสีดำ โลโก้ HL', 'HL', '["POLO_BLACK"]', 0, 0, NULL, 2, 1, '', '2026-10-19 00:00:00', 'system', 'system'),
  (3, 'CENTRAL', '["HL","PRO","CNS","CIC"]', '["การตลาด"]', NULL, NULL, NULL, 'โปโลสีดำ โลโก้ HL', 'HL', '["POLO_BLACK"]', 0, 0, NULL, 2, 1, '', '2026-10-19 00:00:00', 'system', 'system'),
  (4, 'CENTRAL', '["PRO"]', '["BU ส่วนกลาง"]', NULL, 1, 5, 'โปโลสีดำ โลโก้ PRO', 'PRO', '["POLO_BLACK"]', 0, 0, NULL, 4, 2, '', '2026-10-19 00:00:00', 'system', 'system'),
  (5, 'CENTRAL', '["PRO"]', '["BU ส่วนกลาง"]', NULL, 6, 9, 'โปโลสีดำ โลโก้ PRO', 'PRO', '["POLO_BLACK"]', 0, 0, NULL, 2, 1, '', '2026-10-19 00:00:00', 'system', 'system'),
  (6, 'CENTRAL', '["PRO"]', '["ฝ่ายขาย"]', NULL, NULL, NULL, 'โปโลสีดำ โลโก้ PRO', 'PRO', '["POLO_BLACK"]', 0, 0, NULL, 2, 1, '', '2026-10-19 00:00:00', 'system', 'system'),
  (7, 'CENTRAL', '["CNS"]', '["BU ส่วนกลาง"]', NULL, 1, 5, 'โปโลสีดำ โลโก้ CNS', 'CNS', '["POLO_BLACK"]', 0, 0, NULL, 4, 2, '', '2026-10-19 00:00:00', 'system', 'system'),
  (8, 'CENTRAL', '["CNS"]', '["BU ส่วนกลาง"]', NULL, 6, 9, 'โปโลสีดำ โลโก้ CNS', 'CNS', '["POLO_BLACK"]', 0, 0, NULL, 2, 1, '', '2026-10-19 00:00:00', 'system', 'system'),
  (9, 'CENTRAL', '["CNS"]', '["ฝ่ายขาย"]', NULL, NULL, NULL, 'โปโลสีดำ โลโก้ CNS', 'CNS', '["POLO_BLACK"]', 0, 0, NULL, 2, 1, '', '2026-10-19 00:00:00', 'system', 'system'),
  (10, 'CENTRAL', '["AS"]', '["BU ส่วนกลาง"]', NULL, 1, 5, 'โปโลสีดำ โลโก้ AS', 'AS', '["POLO_BLACK"]', 0, 0, NULL, 4, 2, '', '2026-10-19 00:00:00', 'system', 'system'),
  (11, 'CENTRAL', '["AS"]', '["BU ส่วนกลาง"]', NULL, 6, 9, 'โปโลสีดำ โลโก้ AS', 'AS', '["POLO_BLACK"]', 0, 0, NULL, 2, 1, '', '2026-10-19 00:00:00', 'system', 'system'),
  (12, 'CENTRAL', '["AS"]', '["ฝ่ายขาย"]', NULL, NULL, NULL, 'โปโลสีดำ โลโก้ AS', 'AS', '["POLO_BLACK"]', 0, 0, NULL, 2, 1, '', '2026-10-19 00:00:00', 'system', 'system'),
  (13, 'CENTRAL', '["AS"]', '["วิศวกรรมและการออกแบบ"]', NULL, NULL, NULL, 'โปโลสีดำ โลโก้ AS', 'AS', '["POLO_BLACK"]', 0, 0, NULL, 2, 1, '', '2026-10-19 00:00:00', 'system', 'system'),
  (14, 'CENTRAL', '["CIC"]', '["BU ส่วนกลาง","บริหารห้องเช่าและพื้นที่เช่า"]', NULL, 1, 5, 'โปโลสีดำ โลโก้ HL', 'HL', '["POLO_BLACK"]', 0, 3, NULL, 1, 2, '', '2026-10-19 00:00:00', 'system', 'system'),
  (15, 'PRO_SITE', '["PRO"]', NULL, 'ช่างเทคนิค', NULL, NULL, 'ชุดช่าง + รองเท้า Safety', 'PRO', '["TECH_SHIRT","TECH_PANTS","SAFETY_SHOES"]', 0, 5, NULL, 3, 5, '', '2026-10-19 00:00:00', 'system', 'system'),
  (16, 'PRO_SITE', '["PRO"]', NULL, 'ช่างทีมโมบาย', NULL, NULL, 'ชุดช่าง + โปโล + รองเท้า Safety', 'PRO', '["POLO_BLACK","TECH_SHIRT","TECH_PANTS","SAFETY_SHOES"]', 1, 6, NULL, 4, 7, '', '2026-10-19 00:00:00', 'system', 'system'),
  (17, 'PRO_SITE', '["PRO"]', NULL, 'หัวหน้าช่างเทคนิค, วิศวกร', NULL, NULL, 'โปโล + รองเท้า Safety', 'PRO', '["POLO_BLACK","SAFETY_SHOES"]', 1, 4, NULL, 2, 3, '', '2026-10-19 00:00:00', 'system', 'system'),
  (18, 'PRO_SITE', '["PRO"]', NULL, 'ตำแหน่งอื่นๆ', NULL, NULL, 'ชุดช่าง + โปโล', 'PRO', '["TECH_SHIRT","TECH_PANTS","POLO_NAVY"]', 1, 9, NULL, 3, 6, '', '2026-10-19 00:00:00', 'system', 'system'),
  (19, 'CENTRAL', '["CIC"]', '["BU ส่วนกลาง","บริหารห้องเช่าและพื้นที่เช่า"]', NULL, 6, 9, 'โปโลสีดำ โลโก้ HL', 'HL', '["POLO_BLACK"]', 0, 0, NULL, 1, 1, '', '2026-10-19 00:00:00', 'system', 'system');

INSERT INTO `settings` (`key`, `value`, `created_at`, `created_by`, `updated_by`) VALUES
  ('insuranceMaxAge', '65', '2026-10-19 00:00:00', 'system', 'system'),
  ('insuranceCycleDay', '5', '2026-10-19 00:00:00', 'system', 'system'),
  ('insuranceCycleDayDaily', '6', '2026-10-19 00:00:00', 'system', 'system'),
  ('absentExtraDays', '7', '2026-10-19 00:00:00', 'system', 'system'),
  ('uniformAnnualMonth', '1', '2026-10-19 00:00:00', 'system', 'system');

INSERT INTO `insurer_forms` (`id`, `name`, `short_name`, `active`, `form_json`, `created_at`, `created_by`, `updated_by`) VALUES
  (1, 'บริษัท ไทยประกันชีวิต จำกัด (มหาชน)', 'ไทยประกันชีวิต', 1, '{"companies":[{"companyCode":"AS","policyNo":"","holderName":"บริษัท อาเชี่ยน คอนสตรั๊คชั่น จำกัด","plan":"1"},{"companyCode":"CIC","policyNo":"จี3-7998","holderName":"บริษัท คอน.อิน.คอน จำกัด","plan":"1"},{"companyCode":"CNS","policyNo":"จี3-8002","holderName":"บริษัท คลีนนิ่ง โซลูชั่น จำกัด","plan":"1"},{"companyCode":"HL","policyNo":"","holderName":"บริษัท แฮปปี้แลนด์ จำกัด","plan":"1"},{"companyCode":"PRO","policyNo":"จี3-8001","holderName":"บริษัท โปรแอ็คทีฟ แมเนจเม้นท์ จำกัด","plan":"1"}],"dateFormat":"DD/MM/YYYY","dateEra":"CE","inMark":"✓","outMark":"✓","fileName":"แจ้งเข้า-ออก {insurer} {cycleDate}","sheetName":"{companyCode}","includeEmptySheets":true,"signer":{"name":"","department":"สวัสดิการ สรรหา และฝึกอบรม","phone":""},"template":{"fileName":"แจ้งเข้า-ออก ไทยประกันชีวิต (แบบฟอร์มตั้งต้น).xlsx","url":"assets/templates/thai-life.xlsx","uploadedAt":null,"uploadedBy":"ระบบ (แบบฟอร์มตั้งต้น)","converted":false,"sheet":"AS","headerRow":8,"headerEnd":10,"dataRow":11,"footerRow":12,"columns":[{"col":1,"header":"ลำดับที่ (No)","group":"","source":"seq","only":""},{"col":2,"header":"รหัสพนักงาน (Emp. Code)","group":"","source":"empCode","only":""},{"col":3,"header":"รายชื่อผู้เอาประกัน (Insured Name)","group":"","source":"titleFullName","only":""},{"col":4,"header":"เพศ (Sex)","group":"","source":"gender","only":"IN"},{"col":5,"header":"สถานะ พนักงาน (E)","group":"","source":"blank","only":""},{"col":6,"header":"วันเดือนปีเกิด (Date of Birth)","group":"","source":"birthDate","only":"IN"},{"col":7,"header":"ตำแหน่ง (Position)","group":"","source":"position","only":"IN"},{"col":8,"header":"เลขที่ บัตรประชาชน (ID card No.)","group":"","source":"nationalId","only":"IN"},{"col":9,"header":"ธนาคาร (Bank)","group":"","source":"blank","only":""},{"col":10,"header":"เลขที่บัญชี (Account No.)","group":"","source":"blank","only":""},{"col":11,"header":"หมายเลข โทรศัพท์มือถือ (Telephone number)","group":"","source":"phone","only":"IN"},{"col":12,"header":"อีเมล์ (E-Mail)","group":"","source":"email","only":"IN"},{"col":13,"header":"แผนประกัน (Plan)","group":"","source":"plan","only":"IN"},{"col":14,"header":"เข้าใหม่ (New)","group":"","source":"inMark","only":""},{"col":15,"header":"ลาออก (Retire)","group":"","source":"outMark","only":""},{"col":16,"header":"เปลี่ยนแปลง (Changed)","group":"","source":"blank","only":""},{"col":17,"header":"มรณกรรม (Death)","group":"","source":"blank","only":""},{"col":18,"header":"วันที่มีผลบังคับ (Effective date) วัน / เดือน / ปี (DD/MM/YYYY)","group":"","source":"cycleDate","only":""},{"col":19,"header":"ใบคำขอ เอาประกันภัย (Application Form)","group":"","source":"blank","only":""},{"col":20,"header":"หมายเหตุ (Remark)","group":"","source":"blank","only":""}],"cells":{"C6":"{policyNo}","H6":"{companyName}","T6":"{month}","N13":"{signerName}","N14":"{signerPhone}","N15":"{exportDate}"},"summary":{"sheet":"สรุป","headerRow":4,"headerEnd":4,"dataRow":5,"footerRow":6,"columns":[{"col":1,"header":"ลำดับ","group":"","source":"seq","only":""},{"col":2,"header":"สังกัดบริษัท","group":"","source":"companyName","only":""},{"col":3,"header":"ตัวย่อ","group":"","source":"companyCode","only":""},{"col":4,"header":"แจ้งเข้าใหม่","group":"","source":"in","only":""},{"col":5,"header":"แจ้งออก","group":"","source":"out","only":""},{"col":6,"header":"โอนย้าย/เปลี่ยนแปลง","group":"","source":"change","only":""},{"col":7,"header":"รวม","group":"","source":"total","only":""}],"cells":{"A3":"ประจำเดือน  {month}","D6":"{in}","E6":"{out}","F6":"0","G6":"{total}"}}}}', '2026-10-19 00:00:00', 'system', 'system'),
  (2, 'บริษัท เมืองไทยประกันชีวิต จำกัด (มหาชน)', 'เมืองไทยประกันชีวิต', 0, '{"companies":[],"dateFormat":"D/M/YYYY","dateEra":"BE","inMark":"✓","outMark":"✓","fileName":"PMAV-แจ้งเข้า ยกเลิก {insurer} {cycleDate}","sheetName":"{companyCode}","includeEmptySheets":true,"signer":{"name":"","department":"สวัสดิการ สรรหา และฝึกอบรม","phone":""},"template":{"fileName":"PMAV-แจ้งเข้า ยกเลิก (แบบฟอร์มตั้งต้น).xlsx","url":"assets/templates/muang-thai.xlsx","uploadedAt":null,"uploadedBy":"ระบบ (แบบฟอร์มตั้งต้น)","converted":false,"sheet":"AS","headerRow":8,"headerEnd":11,"dataRow":12,"footerRow":13,"columns":[{"col":1,"header":"ลำดับ","group":"","source":"seq","only":""},{"col":2,"header":"รหัสพนักงาน","group":"","source":"empCode","only":""},{"col":3,"header":"ชื่อ - สกุล สมาชิก","group":"","source":"titleFullName","only":""},{"col":4,"header":"แผนประกัน","group":"ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เข้าใหม่","source":"plan","only":"IN"},{"col":5,"header":"วันที่มีผลบังคับ","group":"ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เข้าใหม่","source":"inEffectiveDate","only":""},{"col":6,"header":"ว/ด/ป/ เกิด","group":"ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เข้าใหม่","source":"birthDate","only":"IN"},{"col":7,"header":"เงินเดือน","group":"ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เข้าใหม่","source":"blank"},{"col":8,"header":"เลขที่บัตรประชาชน","group":"ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เข้าใหม่","source":"nationalId","only":"IN"},{"col":9,"header":"ยกเลิก วันที่มีผลบังคับ","group":"ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม","source":"outEffectiveDate","only":""},{"col":10,"header":"จากแผน","group":"เปลี่ยนแปลง > ความคุ้มครอง","source":"blank","only":""},{"col":11,"header":"เป็นแผน","group":"เปลี่ยนแปลง > ความคุ้มครอง","source":"blank","only":""},{"col":12,"header":"วันที่มีผลบังคับ","group":"ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เปลี่ยนแปลง","source":"blank","only":""},{"col":13,"header":"หมายเลขบัญชี","group":"","source":"blank","only":""},{"col":14,"header":"หมายเหตุ เปลี่ยนแปลงอื่นๆ (ระบุ) เช่น เลขที่บัญชี","group":"","source":"blank","only":""}],"cells":{"B4":"{exportDate}","A5":"ชื่อนายจ้าง / ผู้ถือกรรมธรรม์  {companyName}","A6":"เลขที่กรมธรรม์ : ชีวิตกลุ่ม {policyNo}","C15":"{in}","F15":"0","I15":"{out}","L15":"{total}","C17":"{signerName}","C18":"{signerDept}","C20":"{signerPhone}","C21":"{exportDate}"},"summary":{"sheet":"สรุป","headerRow":4,"headerEnd":4,"dataRow":5,"footerRow":6,"columns":[{"col":1,"header":"ลำดับ","group":"","source":"seq","only":""},{"col":2,"header":"สังกัดบริษัท","group":"","source":"companyName","only":""},{"col":3,"header":"ตัวย่อ","group":"","source":"companyCode","only":""},{"col":4,"header":"แจ้งเข้าใหม่","group":"","source":"in","only":""},{"col":5,"header":"แจ้งออก","group":"","source":"out","only":""},{"col":6,"header":"โอนย้าย/เปลี่ยนแปลง","group":"","source":"change","only":""},{"col":7,"header":"รวม","group":"","source":"total","only":""}],"cells":{"A3":"ประจำเดือน  {month}","D6":"{in}","E6":"{out}","F6":"0","G6":"{total}"}}}}', '2026-10-19 00:00:00', 'system', 'system');

