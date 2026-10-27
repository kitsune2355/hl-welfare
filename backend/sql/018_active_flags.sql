-- ============================================================
--  018_active_flags.sql — เปิด/ปิดการใช้งาน แทนการลบ
--
--  บริษัท / ประเภทพนักงาน / กลุ่ม-ฝ่าย / หน่วยงาน / พนักงาน ไม่ลบแล้ว (เลิกมี DELETE) — ปิดใช้งานแทน
--    บริษัท / ประเภท / กลุ่ม / หน่วยงาน ที่ปิด: ข้อมูลเดิมที่อ้างอยู่ยังใช้และคำนวณตามเดิม · เลือกใหม่ไม่ได้
--      (หน่วยงานที่ปิด = ปิดแผนกในสต็อก Uniform ด้วย)
--    พนักงานที่ปิด: ไม่อยู่ในการคำนวณใดเลย (ประกัน ชุดฟอร์ม ภาพรวม) — สำหรับแถวที่กรอกผิด · เปิดกลับได้
--  เพิ่มคอลัมน์อย่างเดียว ข้อมูลเดิม = เปิดใช้งานทั้งหมด · backend ใช้ได้ก่อนรัน (ถือว่าเปิดทั้งหมด — แต่ปิดไม่ได้จนกว่าจะรัน)
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/018_active_flags.sql
--  ย้อนกลับ: backend/sql/018_active_flags_rollback.sql (ที่ปิดไว้จะกลับมาเปิดทั้งหมด)
-- ============================================================

SET NAMES utf8;

ALTER TABLE `companies` ADD COLUMN `active` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `employee_types` ADD COLUMN `active` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `dept_groups` ADD COLUMN `active` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `sites` ADD COLUMN `active` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `employees` ADD COLUMN `active` TINYINT(1) NOT NULL DEFAULT 1;
