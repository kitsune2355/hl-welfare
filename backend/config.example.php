<?php
/* ============================================================
 *  backend/config.example.php — ค่าตั้งของระบบสวัสดิการ
 *
 *  คัดลอกเป็น config.php แล้วกรอกค่า (config.php อยู่ใน .gitignore — มีรหัสผ่าน ห้ามขึ้น repo)
 *      copy backend\config.example.php backend\config.php
 *
 *  ไฟล์เดียวใช้ได้ทั้งเครื่องพัฒนาและเซิร์ฟเวอร์จริง (แบบเดียวกับ stock_hr/config_ctrl/connect.php)
 *
 *  ค่าการเข้าสู่ระบบ + การเชื่อมต่อสต็อก ผู้ดูแลระบบแก้ทับได้จาก admin.html แท็บ "ตั้งค่าระบบ" (ตาราง system_settings,
 *  migration 006) — ค่าในไฟล์นี้คือค่าเริ่มต้นเมื่อยังไม่ได้ตั้งจากหน้าเว็บ (ดู backend/lib/settings.php)
 * ============================================================ */

$cfg_http_host = isset($_SERVER['HTTP_HOST']) ? strtolower($_SERVER['HTTP_HOST']) : '';
$cfg_host_only = preg_replace('/:\d+$/', '', $cfg_http_host);
$cfg_is_local  = $cfg_http_host === ''
    ? (DIRECTORY_SEPARATOR === '\\')
    : in_array($cfg_host_only, array('localhost', '127.0.0.1', '::1')) || substr($cfg_host_only, 0, 8) === '192.168.';

$hlw_config = array(
    /* ---------- ฐานข้อมูล (ฐานแยก hl_welfare บน MySQL เครื่องเดียวกับ stock_hr) ---------- */
    /* ฐานกลางที่ 192.168.10.21 — ใช้ร่วมกับเครื่อง 192.168.10.39 (ผู้ใช้ hlw สิทธิ์เฉพาะ hl_welfare) */
    'db_host' => '192.168.10.21',
    'db_port' => 3306,
    'db_user' => 'hlw',
    'db_pass' => '123456',
    'db_name' => 'hl_welfare',

    'timezone' => 'Asia/Bangkok',

    /* ---------- การเข้าสู่ระบบ (สเปกข้อ 10.9.1) ---------- */
    /* true = cookie ส่งเฉพาะ HTTPS (เซิร์ฟเวอร์จริงต้อง true) · 'auto' = ตามคำขอ (เครื่องพัฒนาที่เป็น http) */
    'cookie_secure'            => $cfg_is_local ? 'auto' : true,
    'session_idle_minutes'     => 30,   // ไม่ใช้งานเกินนี้ session หมด (เลือกจดจำฉัน → ต่ออายุเอง)
    'session_absolute_hours'   => 12,   // session อายุสูงสุดนับจาก login/refresh
    'refresh_days'             => 30,   // อายุ refresh token (นับใหม่ทุกครั้งที่หมุน)
    'refresh_grace_seconds'    => 10,   // ใช้โทเคนที่เพิ่งหมุนซ้ำภายในกี่วินาทีถือว่าแท็บแข่งกัน (409) ไม่ใช่รั่ว
    'login_max_fails_per_user' => 5,
    'login_max_fails_per_ip'   => 20,
    'login_window_minutes'     => 15,

    /* ---------- ระบบสต็อก Uniform (stock_hr) — กุญแจต้องตรงกับ stock_hr/config_ctrl/welfare_key.php ---------- */
    'stock_api_url'    => $cfg_is_local ? 'http://192.168.10.39/stock_hr/api/welfare.php' : 'https://develophpg.net/stock_hr/api/welfare.php',
    'stock_api_secret' => 'd542dc95971ca160b2d3b3ad04d880dd1b2c1889c93141be33ee62fd0b495c83',

    /* เทสต์เท่านั้น: บังคับ "วันนี้" (YYYY-MM-DD) — ระบบจริงต้องว่าง */
    'today_override' => '',
);
