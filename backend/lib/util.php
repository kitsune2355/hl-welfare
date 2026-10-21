<?php
/* ============================================================
 *  backend/lib/util.php — เครื่องมือทั่วไป (PHP 5.2)
 *
 *  - วันนี้ / เวลาของแอป (เทสต์ตั้งวันที่ได้ทาง config today_override)
 *  - stable_usort: usort ของ PHP ไม่ stable แต่ Array.sort ของ JS stable
 *    ตรรกะที่แปลงจาก JS ต้องได้ลำดับเดียวกันทุกตัว จึงใช้ตัวนี้แทน usort เสมอ
 *  - ApiError: error ที่ตอบเป็น HTTP status + { error, code?, errors? }
 * ============================================================ */

class ApiError extends Exception
{
    public $status = 400;
    public $details = null;     // array('field' => 'ข้อความ') ของ 422
    public $errorCode = null;   // เช่น 'REFRESH_RACE'
    public $headers = array();

    public function __construct($message, $status = 400, $details = null, $errorCode = null, $headers = array())
    {
        parent::__construct($message);
        $this->status = (int)$status;
        $this->details = $details;
        $this->errorCode = $errorCode;
        $this->headers = $headers;
    }
}

/* ---------- เวลา ---------- */
function clock_time()
{
    return time() + $GLOBALS['hlw_clock_offset'];
}

/** วันที่วันนี้ (เขตเวลา APP_TZ) — ตรงกับ todayISO() ของหน้าเว็บ */
function today_iso()
{
    $o = isset($GLOBALS['hlw_config']['today_override']) ? $GLOBALS['hlw_config']['today_override'] : '';
    return $o !== '' ? $o : date('Y-m-d', clock_time());
}

/** "YYYY-MM-DDTHH:mm:ss" (รูปแบบ submittedAt / ActivityLog.at) */
function now_stamp()
{
    return date('Y-m-d\TH:i:s', clock_time());
}

function stamp_from_db($datetime)
{
    return $datetime === null ? null : str_replace(' ', 'T', substr($datetime, 0, 19));
}

/* ---------- เรียงแบบ stable ---------- */
function stable_usort(&$arr, $cmp)
{
    $tmp = array();
    $i = 0;
    foreach ($arr as $v) { $tmp[] = array($v, $i++); }
    $GLOBALS['__stable_cmp'][] = $cmp;
    usort($tmp, '__stable_cmp_wrap');
    array_pop($GLOBALS['__stable_cmp']);
    $arr = array();
    foreach ($tmp as $t) { $arr[] = $t[0]; }
}

function __stable_cmp_wrap($a, $b)
{
    $cmp = end($GLOBALS['__stable_cmp']);
    $r = call_user_func($cmp, $a[0], $b[0]);
    if ($r == 0) { return $a[1] - $b[1]; }
    return $r < 0 ? -1 : 1;
}

/** เทียบข้อความ = String.localeCompare สำหรับข้อความที่ใช้จริง (รหัส ASCII, วันที่ ISO) */
function str_cmp($a, $b)
{
    $r = strcmp((string)$a, (string)$b);
    return $r < 0 ? -1 : ($r > 0 ? 1 : 0);
}

/* ---------- array ---------- */
function arr_get($arr, $key, $default = null)
{
    return (is_array($arr) && array_key_exists($key, $arr)) ? $arr[$key] : $default;
}

/** index ตาม field เช่น by_key($sites, 'id') */
function by_key($list, $field)
{
    $out = array();
    foreach ($list as $x) { $out[$x[$field]] = $x; }
    return $out;
}

/** หาแถวแรกที่ $field === $value */
function find_by($list, $field, $value)
{
    foreach ($list as $x) {
        if (isset($x[$field]) && $x[$field] === $value) { return $x; }
    }
    return null;
}

function str_pad2($n)
{
    return str_pad((string)$n, 2, '0', STR_PAD_LEFT);
}

/** ตัดช่องว่างหัวท้ายแบบรองรับ UTF-8 (ช่องว่างธรรมดา) */
function str_trim($s)
{
    return trim((string)$s);
}

function text_length($s)
{
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen(preg_replace('/[\x80-\xBF]/', '', $s));
}

/** JSON → array (ค่าว่าง / ผิดรูปแบบ = $default) */
function json_in($text, $default = null)
{
    if ($text === null || $text === '') { return $default; }
    $v = json_decode($text, true);
    return $v === null ? $default : $v;
}

/** แปลงค่าเป็น int หรือ null */
function int_or_null($v)
{
    return ($v === null || $v === '') ? null : (int)$v;
}

/** แปลงตัวเลขจาก DB ('15000.00') เป็น number แบบเดียวกับ JS (int ถ้าไม่มีทศนิยม) */
function num($v)
{
    if ($v === null) { return null; }
    $f = (float)$v;
    return ($f == floor($f) && abs($f) < 2147483647) ? (int)$f : $f;
}

/* เทสต์เลื่อนเวลาได้ (เช่น ทดสอบ session หมดอายุ) — ระบบจริงไม่ตั้งค่านี้ */
$GLOBALS['hlw_clock_offset'] = 0;
