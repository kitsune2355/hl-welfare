<?php
/* ============================================================
 *  backend/lib/settings.php — ค่าตั้งระบบ: ตาราง system_settings ทับ backend/config.php ทีละ key
 *
 *  sys_setting('session_idle_minutes')  → ค่าจาก DB ถ้ามี · ไม่มี → config.php · ไม่มีอีก → ค่าเริ่มต้นใน sys_setting_defs
 *  แก้ได้จากหน้า admin.html (แท็บตั้งค่าระบบ — api/admin.php) เฉพาะ key ใน sys_setting_defs
 *  ค่าที่อยู่ใน config.php เท่านั้น: ฐานข้อมูล, cookie_secure, timezone, today_override (ผิดแล้วอาจเข้าระบบไม่ได้ / ต้องแก้ที่เครื่อง)
 *  ยังไม่ได้รัน migration 006 (ไม่มีตาราง) → ใช้ config.php ทั้งหมด ไม่ error
 *  อ่านจาก DB ครั้งเดียวต่อคำขอ (api_handle ล้าง cache ทุกคำขอ)
 * ============================================================ */

/**
 * key ที่แก้จากหน้าเว็บได้
 * type: int (min/max) | url | secret (ไม่ส่งค่ากลับหน้าเว็บ) · default = ใช้เมื่อ config.php ไม่มี key นี้
 */
function sys_setting_defs()
{
    return array(
        /* ---------- สต็อก Uniform (stock_hr/api/welfare.php) ---------- */
        'stock_api_url' => array('group' => 'stock', 'type' => 'url', 'label' => 'URL ของ API สต็อก',
            'hint' => 'เช่น https://develophpg.net/stock_hr/api/welfare.php', 'default' => ''),
        'stock_api_secret' => array('group' => 'stock', 'type' => 'secret', 'label' => 'กุญแจเซ็นคำขอ (HMAC)',
            'hint' => 'ต้องตรงกับ stock_hr/config_ctrl/welfare_key.php · อย่างน้อย 32 ตัว', 'default' => '', 'min' => 32, 'max' => 200),
        'stock_connect_timeout' => array('group' => 'stock', 'type' => 'int', 'label' => 'รอเชื่อมต่อ', 'unit' => 'วินาที',
            'min' => 1, 'max' => 30, 'default' => 5),
        'stock_timeout' => array('group' => 'stock', 'type' => 'int', 'label' => 'รอคำตอบทั้งหมด', 'unit' => 'วินาที',
            'min' => 5, 'max' => 120, 'default' => 20),
        /* ---------- การเข้าสู่ระบบ (สเปกข้อ 10.9.1) ---------- */
        'session_idle_minutes' => array('group' => 'auth', 'type' => 'int', 'label' => 'session หมดเมื่อไม่ใช้งาน', 'unit' => 'นาที',
            'min' => 5, 'max' => 480, 'default' => 30),
        'session_absolute_hours' => array('group' => 'auth', 'type' => 'int', 'label' => 'session อายุสูงสุด', 'unit' => 'ชั่วโมง',
            'min' => 1, 'max' => 72, 'default' => 12),
        'refresh_days' => array('group' => 'auth', 'type' => 'int', 'label' => '“จดจำฉัน” อยู่ได้', 'unit' => 'วัน',
            'hint' => 'นับใหม่ทุกครั้งที่ใช้', 'min' => 1, 'max' => 365, 'default' => 30),
        'login_max_fails_per_user' => array('group' => 'auth', 'type' => 'int', 'label' => 'ล็อกเมื่อรหัสผิด (ต่อชื่อผู้ใช้)', 'unit' => 'ครั้ง',
            'min' => 3, 'max' => 50, 'default' => 5),
        'login_max_fails_per_ip' => array('group' => 'auth', 'type' => 'int', 'label' => 'ล็อกเมื่อรหัสผิด (ต่อ IP)', 'unit' => 'ครั้ง',
            'min' => 5, 'max' => 500, 'default' => 20),
        'login_window_minutes' => array('group' => 'auth', 'type' => 'int', 'label' => 'ช่วงนับครั้งที่ผิด / เวลาล็อก', 'unit' => 'นาที',
            'min' => 1, 'max' => 1440, 'default' => 15),
        /* ---------- ติดตามระบบ ---------- */
        'stock_stuck_days' => array('group' => 'monitor', 'type' => 'int', 'label' => 'เตือนใบเบิกค้างในขั้นเดิมเกิน', 'unit' => 'วัน',
            'min' => 1, 'max' => 90, 'default' => 7),
        'cleanup_days' => array('group' => 'monitor', 'type' => 'int', 'label' => 'ล้างข้อมูลการเข้าสู่ระบบที่เก่ากว่า', 'unit' => 'วัน',
            'hint' => 'ค่าเริ่มต้นของปุ่มล้างและ bin/cleanup.php · น้อยสุด = อายุ “จดจำฉัน”', 'min' => 30, 'max' => 3650, 'default' => 90),
    );
}

/** array(key => value string) จากตาราง — ไม่มีตาราง (ยังไม่รัน 006) = array() */
function sys_setting_overrides()
{
    if (isset($GLOBALS['hlw_sys_settings']) && is_array($GLOBALS['hlw_sys_settings'])) { return $GLOBALS['hlw_sys_settings']; }
    $out = array();
    try {
        foreach (db_all('SELECT `key`, `value` FROM system_settings') as $r) { $out[$r['key']] = $r['value']; }
    } catch (DbError $e) {
        if ($e->errno !== 1146) { throw $e; }       // 1146 = ไม่มีตาราง
    }
    $GLOBALS['hlw_sys_settings'] = $out;
    return $out;
}

function sys_settings_reset_cache()
{
    $GLOBALS['hlw_sys_settings'] = null;
}

/** ค่าจาก config.php (หรือค่าเริ่มต้นของ def) — ไม่สน DB */
function sys_setting_base($key)
{
    if (array_key_exists($key, $GLOBALS['hlw_config'])) { return $GLOBALS['hlw_config'][$key]; }
    $defs = sys_setting_defs();
    return isset($defs[$key]) ? $defs[$key]['default'] : null;
}

/** 'db' | 'config' */
function sys_setting_source($key)
{
    $o = sys_setting_overrides();
    return array_key_exists($key, $o) ? 'db' : 'config';
}

function sys_setting($key)
{
    $defs = sys_setting_defs();
    if (isset($defs[$key])) {
        $o = sys_setting_overrides();
        if (array_key_exists($key, $o)) { return $defs[$key]['type'] === 'int' ? (int)$o[$key] : $o[$key]; }
    }
    return sys_setting_base($key);
}

/** ตรวจค่าใหม่ 1 key → ค่าที่เก็บ (string) · ผิด → ข้อความ (โยนรวมทีหลัง) */
function sys_setting_validate($key, $value, &$error)
{
    $defs = sys_setting_defs();
    $d = $defs[$key];
    $error = null;
    if ($d['type'] === 'int') {
        if (!(is_int($value) || (is_string($value) && preg_match('/^\d+$/', trim($value))))) { $error = 'ต้องเป็นจำนวนเต็ม'; return null; }
        $n = (int)$value;
        if ($n < $d['min'] || $n > $d['max']) { $error = 'ต้องอยู่ระหว่าง ' . $d['min'] . '–' . $d['max']; return null; }
        return (string)$n;
    }
    $s = trim((string)$value);
    if ($d['type'] === 'url') {
        if ($s === '') { return ''; }
        $p = @parse_url($s);
        if (!preg_match('#^https?://#i', $s) || !$p || empty($p['host']) || strlen($s) > 255) { $error = 'URL ต้องขึ้นต้นด้วย http:// หรือ https://'; return null; }
        return $s;
    }
    /* secret */
    if (strlen($s) < $d['min'] || strlen($s) > $d['max']) { $error = 'ต้องยาว ' . $d['min'] . '–' . $d['max'] . ' ตัวอักษร'; return null; }
    if (!preg_match('/^[\x21-\x7e]+$/', $s)) { $error = 'ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และสัญลักษณ์ (ไม่มีช่องว่าง)'; return null; }
    return $s;
}

/** กุญแจสำหรับแสดง: ไม่ส่งค่าจริง */
function sys_secret_info($s)
{
    $s = (string)$s;
    return array('set' => $s !== '', 'length' => strlen($s), 'last4' => strlen($s) >= 12 ? substr($s, -4) : '');
}
