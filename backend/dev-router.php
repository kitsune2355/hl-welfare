<?php
/*
 * ทดสอบทั้งระบบบนเครื่องด้วย PHP built-in server (หน้าเว็บ + API อยู่ origin เดียวกัน เหมือน host จริง)
 *
 *   php -S localhost:8000 -t web backend/dev-router.php      (รันที่โฟลเดอร์ hl-welfare)
 *   เปิด http://localhost:8000/login.html · ตั้ง config.js → apiMode 'http' หรือ auth.provider 'server'
 *
 * /api/* → backend/public/index.php · ที่เหลือ = ไฟล์ใน web/
 * (cookie Secure ส่งผ่าน http://localhost ได้ใน Chrome/Firefox แต่ curl ไม่ส่ง — ทดสอบด้วย curl ให้ตั้ง COOKIE_SECURE=0)
 */
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if (str_starts_with($path, '/api/') && $path !== '/api/stock_bridge.php') {
    require __DIR__ . '/public/index.php';
    return true;
}
return false;
