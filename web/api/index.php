<?php
/* ============================================================
 *  web/api/index.php — ทางเข้าของ API ทั้งหมด (สเปกข้อ 8)
 *
 *  path ต่อท้ายไฟล์นี้ (PATH_INFO) ไม่ต้องเปิด mod_rewrite:
 *      api/index.php/employees/5/benefits   →   GET /employees/5/benefits
 *  หน้าเว็บตั้งไว้ที่ config.js → apiBaseUrl: 'api/index.php'
 *
 *  โค้ดอยู่ใน backend/ (นอกโฟลเดอร์ web) — ไฟล์นี้แค่ส่งต่อ
 * ============================================================ */

require dirname(dirname(dirname(__FILE__))) . '/backend/bootstrap.php';

http_send(api_handle(http_request_from_globals()));
