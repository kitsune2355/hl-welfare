<?php
/* ============================================================
 *  web/api/stock_bridge.config.example.php — ค่าเชื่อมต่อระบบสต็อก Uniform
 *
 *  คัดลอกเป็น stock_bridge.config.php แล้วกรอกค่า
 *      copy web\api\stock_bridge.config.example.php web\api\stock_bridge.config.php
 *
 *  กุญแจต้องตรงกับ stock_hr/config_ctrl/welfare_key.php
 *  stock_bridge.config.php อยู่ใน .gitignore ห้ามเอาขึ้น repo
 * ============================================================ */

/* endpoint ของระบบสต็อก */
$stock_api_url = 'http://localhost/stock_hr/api/welfare.php';

/* กุญแจลับตัวเดียวกับฝั่งสต็อก */
$stock_api_secret = '';

/* true = ยอมให้เครื่องอื่นเรียกตัวกลางนี้ (เฟส 1 ยังไม่มีล็อกอินฝั่ง PHP ระวังเปิดทิ้งไว้) */
$stock_bridge_allow_remote = false;
