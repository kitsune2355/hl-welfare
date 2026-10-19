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

/* true = ยอมให้เครื่องอื่นเรียกตัวกลางนี้เมื่อไม่ได้ตั้ง $stock_bridge_auth_url (ไม่มีการตรวจผู้ใช้ ระวังเปิดทิ้งไว้) */
$stock_bridge_allow_remote = false;

/* ตรวจผู้ใช้กับ backend (PHP 8.2+): URL ของ GET /api/auth/me — ตั้งแล้วต้องเข้าสู่ระบบก่อนถึงส่งเบิกได้
 * และชื่อผู้ขอเบิกมาจาก backend (ไม่เชื่อค่าจากเบราว์เซอร์) · ว่าง = โหมดสาธิต (รับเฉพาะเครื่องนี้) */
$stock_bridge_auth_url = '';
