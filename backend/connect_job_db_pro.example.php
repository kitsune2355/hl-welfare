<?php
/* ============================================================
 *  backend/connect_job_db_pro.example.php — การเชื่อมต่อฐานข้อมูล hr-pro (developh_bigpro)
 *
 *  คัดลอกเป็น connect_job_db_pro.php แล้วกรอกค่า (อยู่ใน .gitignore — มีรหัสผ่าน ห้ามขึ้น repo)
 *      copy backend\connect_job_db_pro.example.php backend\connect_job_db_pro.php
 *
 *  ระบบอ่านอย่างเดียว ใช้ผู้ใช้ที่มีสิทธิ์แค่ SELECT:
 *      GRANT SELECT ON `developh_bigpro`.`tb_resume_contact_info` TO 'ผู้ใช้'@'IP เครื่องเว็บ' IDENTIFIED BY 'รหัสผ่าน';
 *      GRANT SELECT ON `developh_bigpro`.`tb_resume_contract` TO 'ผู้ใช้'@'IP เครื่องเว็บ';
 *      GRANT SELECT ON `developh_bigpro`.`tb_position` TO 'ผู้ใช้'@'IP เครื่องเว็บ';
 *      GRANT SELECT ON `developh_bigpro`.`tb_agency` TO 'ผู้ใช้'@'IP เครื่องเว็บ';
 *      FLUSH PRIVILEGES;
 * ============================================================ */

$hlw_job_db = array(
    'host' => 'localhost',
    'port' => 3306,
    'user' => 'root',
    'pass' => '1234',
    'name' => 'developh_bigpro',
);
