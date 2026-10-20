-- ============================================================
--  011_stock_waiting_stage.sql — ใบเบิกชุดฟอร์มต้องรอผู้อนุมัติในสต็อก Uniform
--
--  เดิมสต็อกออกใบ "อนุมัติแล้ว" ทันที (stage แรก = REQUESTED รอคลังจ่าย)
--  ตอนนี้ออกเป็น "รออนุมัติ" — ผู้อนุมัติของหน่วยงานในระบบสต็อกต้องกดอนุมัติเอง
--  stage ใหม่ WAITING = ส่งเบิกแล้ว รอผู้อนุมัติ (ไม่อนุมัติ = CANCELLED สิทธิ์กลับเป็นค้างแจก)
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/011_stock_waiting_stage.sql
--  ย้อนกลับ: backend/sql/011_stock_waiting_stage_rollback.sql
-- ============================================================

SET NAMES utf8;

ALTER TABLE `uniform_issues`
  MODIFY `stock_stage` ENUM('WAITING','REQUESTED','ISSUED','RECEIVED','CANCELLED') NULL;
