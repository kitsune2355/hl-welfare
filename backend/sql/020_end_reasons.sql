-- ============================================================
--  020_end_reasons.sql — เหตุผลพ้นสภาพชุดใหม่ 7 ข้อ + คอลัมน์หมายเหตุของพนักงาน
--
--  เหตุผล: ลาออก (RESIGN) · ขาดงานต่อเนื่องเกิน 3 วัน (ABSENT_3D) · สิ้นสุดระยะเวลาการจ้าง (CONTRACT_END)
--          เลิกจ้าง (TERMINATED) · เกษียณอายุ (RETIRED) · เสียชีวิต (DECEASED) · โอนย้ายสังกัดบริษัท (TRANSFERRED)
--  ไม่มี "กระทำผิด" (MISCONDUCT) แล้ว → ข้อมูลเดิมเปลี่ยนเป็น เลิกจ้าง + หมายเหตุ "กระทำผิด"
--    (ยังแจ้งออกประกันทันทีเหมือนเดิม — แจ้งทันที = เลิกจ้าง / เสียชีวิต)
--
--  ⚠ รันครั้งเดียว (ADD COLUMN ซ้ำไม่ได้) · แก้ข้อมูลพนักงานที่เป็น MISCONDUCT
--  ก่อนรัน: ระบบยังใช้ได้ — อ่าน MISCONDUCT เป็นเลิกจ้าง + หมายเหตุ ให้เอง · บันทึกเหตุผลใหม่ / หมายเหตุ ไม่ได้จนกว่าจะรัน
--  วิธีรัน: mysql -u root -p --default-character-set=utf8 hl_welfare < backend/sql/020_end_reasons.sql
--  ย้อนกลับ: backend/sql/020_end_reasons_rollback.sql
-- ============================================================

SET NAMES utf8;

-- 1) เพิ่มค่าใหม่ (ยังเก็บ MISCONDUCT ไว้ระหว่างแปลง)
ALTER TABLE `employees`
  MODIFY `end_reason` ENUM('RESIGN','ABSENT_3D','CONTRACT_END','TERMINATED','RETIRED','DECEASED','TRANSFERRED','MISCONDUCT') NULL;

-- 2) หมายเหตุ (ไม่บังคับ · แสดงในตารางพนักงาน / Excel)
ALTER TABLE `employees`
  ADD COLUMN `note` VARCHAR(255) NULL COMMENT 'หมายเหตุ' AFTER `end_reason`;

-- 3) กระทำผิด → เลิกจ้าง + หมายเหตุ
UPDATE `employees`
   SET `end_reason` = 'TERMINATED', `note` = 'กระทำผิด', `updated_by` = 'migration'
 WHERE `end_reason` = 'MISCONDUCT';

-- 4) เอา MISCONDUCT ออกจากรายการ
ALTER TABLE `employees`
  MODIFY `end_reason` ENUM('RESIGN','ABSENT_3D','CONTRACT_END','TERMINATED','RETIRED','DECEASED','TRANSFERRED') NULL;
