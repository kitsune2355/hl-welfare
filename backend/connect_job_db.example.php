<?php
/* ============================================================
 *  backend/connect_job_db.example.php — การเชื่อมต่อฐานข้อมูลระบบสัญญาจ้าง (job_db_cns)
 *
 *  คัดลอกเป็น connect_job_db.php แล้วกรอกค่า (อยู่ใน .gitignore — มีรหัสผ่าน ห้ามขึ้น repo)
 *      copy backend\connect_job_db.example.php backend\connect_job_db.php
 *
 *  แต่ละเครื่อง / โฮสต์มีไฟล์ของตัวเอง — ย้ายขึ้นโฮสต์ แก้ไฟล์นี้ไฟล์เดียว
 *  ระบบอ่านอย่างเดียว ใช้ผู้ใช้ที่มีสิทธิ์แค่ SELECT:
 *      GRANT SELECT ON `ชื่อฐาน`.`tb_resume_contact_info` TO 'ผู้ใช้'@'IP เครื่องเว็บ' IDENTIFIED BY 'รหัสผ่าน';
 *      GRANT SELECT ON `ชื่อฐาน`.`tb_resume_contract` TO 'ผู้ใช้'@'IP เครื่องเว็บ';
 *      GRANT SELECT ON `ชื่อฐาน`.`tb_agency` TO 'ผู้ใช้'@'IP เครื่องเว็บ';
 *      FLUSH PRIVILEGES;
 * ============================================================ */

$hlw_job_db = array(
    'host' => '192.168.10.21',
    'port' => 3306,
    'user' => 'root',
    'pass' => '1234',
    'name' => 'developh_bigcns2',
);
