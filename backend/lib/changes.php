<?php
/* ============================================================
 *  backend/lib/changes.php — เวอร์ชันข้อมูล (หน้าภาพรวมรู้ว่ามีข้อมูลใหม่) + cache ผลคำนวณภาพรวม
 *
 *  เวอร์ชัน = id ล่าสุดของ audit_log ที่เปลี่ยน "ข้อมูลงาน"
 *    ไม่นับ entity USER / SYSTEM (เข้า-ออกระบบ จัดการผู้ใช้ ล้างข้อมูลเก่า) — ไม่ทำให้ภาพรวมเปลี่ยน
 *  audit_write → changes_note(id) → เขียนลงไฟล์ var/data-version-<db>.txt ตอน commit (ไม่ใช่กลาง transaction
 *    — ไม่งั้นหน้าเว็บโหลดใหม่ก่อนข้อมูลเข้าฐานจริง) · ยกเลิก transaction = ไม่เขียน
 *  api_monitor_changes ระหว่างรอ อ่านไฟล์นี้ (ไม่แตะฐานข้อมูล ปล่อยการเชื่อมต่อ) และถามฐานข้อมูลเป็นระยะ
 *    เผื่อมีเครื่องอื่นเขียนฐานเดียวกัน / ไฟล์เขียนไม่ได้
 *  เขียนให้รองรับ PHP 5.2 (ไม่มี closure)
 * ============================================================ */

/** โฟลเดอร์เก็บไฟล์ชั่วคราวของระบบ (ค่าตั้ง var_dir · ค่าเริ่มต้น backend/var — ไม่ขึ้น repo) */
function changes_dir()
{
    $c = $GLOBALS['hlw_config'];
    return isset($c['var_dir']) && $c['var_dir'] !== '' ? $c['var_dir'] : dirname(dirname(__FILE__)) . '/var';
}

function changes_file()
{
    return changes_dir() . '/data-version-' . preg_replace('/[^A-Za-z0-9_]/', '_', $GLOBALS['hlw_config']['db_name']) . '.txt';
}

/** entity ที่ไม่นับเป็นการเปลี่ยนข้อมูลงาน */
function changes_ignored($entity)
{
    return in_array($entity, array('USER', 'SYSTEM'), true);
}

/** เลขมากกว่า (สตริงตัวเลข — ไม่แปลงเป็น int กันล้นบน PHP 32 บิต) */
function changes_max($a, $b)
{
    if ($a === null || $a === '') { return $b === null || $b === '' ? '0' : $b; }
    if ($b === null || $b === '') { return $a; }
    if (strlen($a) !== strlen($b)) { return strlen($a) > strlen($b) ? $a : $b; }
    return strcmp($a, $b) >= 0 ? $a : $b;
}

/** audit_write เรียก — นอก transaction เขียนทันที · ใน transaction รอ commit (changes_flush) */
function changes_note($id)
{
    $GLOBALS['hlw_changes_pending'] = changes_max(isset($GLOBALS['hlw_changes_pending']) ? $GLOBALS['hlw_changes_pending'] : null, (string)$id);
    if (empty($GLOBALS['hlw_tx_depth'])) { changes_flush(); }
}

/** db_commit (ชั้นนอกสุด) เรียก · db_rollback = ทิ้ง */
function changes_flush()
{
    if (empty($GLOBALS['hlw_changes_pending'])) { return; }
    $v = $GLOBALS['hlw_changes_pending'];
    $GLOBALS['hlw_changes_pending'] = null;
    $f = changes_file();
    if (!is_dir(dirname($f))) { @mkdir(dirname($f), 0775, true); }
    @file_put_contents($f, changes_max(changes_read_file(), $v), LOCK_EX);
}

function changes_discard()
{
    $GLOBALS['hlw_changes_pending'] = null;
}

/** เวอร์ชันจากไฟล์ (null = ยังไม่มี/อ่านไม่ได้) */
function changes_read_file()
{
    clearstatcache();
    $f = changes_file();
    if (!is_file($f)) { return null; }
    $v = trim((string)@file_get_contents($f));
    return preg_match('/^\d+$/', $v) ? $v : null;
}

/** เวอร์ชันจากฐานข้อมูล — ไล่จาก id ท้ายสุด (PK) หาแถวแรกที่ไม่ใช่ USER/SYSTEM */
function changes_db_version()
{
    $v = db_value("SELECT id FROM audit_log WHERE entity NOT IN ('USER', 'SYSTEM') ORDER BY id DESC LIMIT 1");
    return $v === null ? '0' : (string)$v;
}

/* ---------- cache ผลคำนวณภาพรวม (ทุกคนที่เปิดภาพรวมโหลดพร้อมกันหลังมีการเปลี่ยนแปลง → คำนวณรอบเดียว) ---------- */

/** อายุสูงสุดของ cache (วินาที) — กันกรณีข้อมูลเปลี่ยนโดยไม่เขียน audit_log */
function changes_cache_ttl() { return 60; }

/**
 * ผลของ $fn ($args) — ใช้ซ้ำได้ถ้าเวอร์ชันข้อมูล + วันที่ + ขอบเขตบริษัท เท่าเดิม และยังไม่เกิน TTL
 * ไฟล์ละ 1 ชื่อ+ขอบเขต (เขียนทับ) ไม่สะสม · เขียนไม่ได้ = คำนวณสด
 */
function changes_cached($name, $scope, $fn, $args)
{
    $key = changes_db_version() . '|' . today_iso() . '|' . (string)$scope;
    $f = changes_dir() . '/cache-' . preg_replace('/[^A-Za-z0-9_]/', '_', $GLOBALS['hlw_config']['db_name'] . '-' . $name . '-' . ($scope === null ? 'all' : $scope)) . '.ser';
    clearstatcache();
    if (is_file($f) && time() - filemtime($f) < changes_cache_ttl()) {
        $hit = @unserialize((string)@file_get_contents($f));
        if (is_array($hit) && isset($hit['key']) && $hit['key'] === $key) { return $hit['data']; }
    }
    $data = call_user_func_array($fn, $args);
    if (!is_dir(dirname($f))) { @mkdir(dirname($f), 0775, true); }
    @file_put_contents($f, serialize(array('key' => $key, 'data' => $data)), LOCK_EX);
    return $data;
}
