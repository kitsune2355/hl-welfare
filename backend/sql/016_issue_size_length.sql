-- ============================================================
--  016_issue_size_length.sql — ไซซ์ที่แจกเก็บได้หลายไซซ์ต่อรายการ
--
--  บันทึกแจกเอง เลือกไซซ์แยกรายตัวแล้ว (เสื้อ 2 ตัวคนละไซซ์ได้) — uniform_issues.size เก็บเป็นข้อความสรุป
--  เช่น "เสื้อช่าง M, L · กางเกงช่าง L×2 · โปโลสีน้ำเงิน M×2 · รองเท้า Safety 42" → ขยาย 100 → 255 ตัวอักษร
--  ขยายอย่างเดียว ข้อมูลเดิมไม่เปลี่ยน
--
--  วิธีรัน: mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/016_issue_size_length.sql
--  ย้อนกลับ: backend/sql/016_issue_size_length_rollback.sql (ไซซ์ที่ยาวเกิน 100 ตัวอักษรจะถูกตัด)
-- ============================================================

SET NAMES utf8;

ALTER TABLE `uniform_issues` MODIFY `size` VARCHAR(255) NOT NULL;
