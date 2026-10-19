<?php
/* ============================================================
 *  backend/bin/cleanup.php — ล้าง session / refresh token / ประวัติเข้าสู่ระบบ ที่เก่าเกิน N วัน (สเปกข้อ 18)
 *
 *    php backend/bin/cleanup.php            ล้างที่เก่ากว่า cleanup_days (ค่าเริ่มต้น 90 — ตั้งได้ที่หน้า admin)
 *    php backend/bin/cleanup.php 120        ล้างที่เก่ากว่า 120 วัน (น้อยสุด = refresh_days ใน config)
 *    php backend/bin/cleanup.php 90 --dry   ดูจำนวนอย่างเดียว ไม่ลบ
 *
 *  ไม่ลบ audit_log · บันทึกผลลง audit_log (SYSTEM / CLEANUP) — หน้า admin.html แสดงครั้งล่าสุด
 *  ตั้งเวลาด้วย Windows Task Scheduler (แบบ stock_hr/cron/) เช่น ทุกวันอาทิตย์ 03:00:
 *    schtasks /Create /TN "hl-welfare cleanup" /SC WEEKLY /D SUN /ST 03:00
 *      /TR "C:\AppServ\php5\php.exe C:\AppServ\www\hl-welfare\backend\bin\cleanup.php"
 *  เขียนให้รองรับ PHP 5.2.6
 * ============================================================ */

if (PHP_SAPI !== 'cli') { exit(1); }
require dirname(dirname(__FILE__)) . '/bootstrap.php';

$days = (int)sys_setting('cleanup_days');
$dry = false;
foreach (array_slice($argv, 1) as $a) {
    if ($a === '--dry') { $dry = true; }
    elseif (preg_match('/^\d+$/', $a)) { $days = (int)$a; }
    else { fwrite(STDERR, 'ดูวิธีใช้ที่หัวไฟล์ backend/bin/cleanup.php' . PHP_EOL); exit(1); }
}

try {
    if ($dry) {
        $d = admin_cleanup_days($days);
        $n = admin_cleanup_counts(admin_cleanup_cutoff($d));
        echo 'จะลบ (เก่ากว่า ' . $d . ' วัน): session ' . $n['sessions'] . ' · refresh token ' . $n['tokens']
            . ' · ประวัติเข้าสู่ระบบ ' . $n['attempts'] . PHP_EOL;
    } else {
        $r = admin_cleanup_run($days, null, 'cli');
        echo date('Y-m-d H:i:s') . ' ลบแล้ว (เก่ากว่า ' . $r['days'] . ' วัน): session ' . $r['sessions'] . ' · refresh token ' . $r['tokens']
            . ' · ประวัติเข้าสู่ระบบ ' . $r['attempts'] . PHP_EOL;
    }
} catch (Exception $e) {
    fwrite(STDERR, 'ล้างข้อมูลไม่สำเร็จ: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
