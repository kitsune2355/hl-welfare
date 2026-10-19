<?php
/* ============================================================
 *  backend/lib/db.php — เชื่อมต่อ MySQL + query แบบ prepared statement
 *
 *  ทุก query ที่มีค่าจากผู้ใช้ใช้ prepared statement เท่านั้น (ห้ามต่อ string SQL)
 *  PHP 5.2 ไม่มี mysqli_stmt_get_result จึงอ่านผลด้วย bind_result แบบไดนามิก
 *
 *  ผิดพลาด → โยน DbError (ผู้เรียกตัดสินใจเองว่าจะตอบ HTTP อะไร)
 *  เขียนให้รองรับ PHP 5.2.6 (array(), ไม่มี closure / namespace)
 * ============================================================ */

class DbError extends Exception
{
    public $errno = 0;

    public function __construct($message, $errno = 0)
    {
        parent::__construct($message);
        $this->errno = (int)$errno;
    }
}

/* ---------- connection (ต่อครั้งเดียวต่อคำขอ) ---------- */
function db()
{
    if (isset($GLOBALS['hlw_db']) && $GLOBALS['hlw_db']) {
        return $GLOBALS['hlw_db'];
    }
    $c = $GLOBALS['hlw_config'];
    $conn = @mysqli_connect($c['db_host'], $c['db_user'], $c['db_pass'], $c['db_name'], (int)$c['db_port']);
    if (!$conn) {
        throw new DbError('เชื่อมต่อฐานข้อมูลไม่ได้ (' . mysqli_connect_error() . ')', mysqli_connect_errno());
    }
    /* ต้องตั้งครบ ไม่งั้นภาษาไทยเป็นเครื่องหมายคำถาม (แบบเดียวกับ stock_hr) */
    mysqli_query($conn, "SET NAMES utf8");
    mysqli_query($conn, "SET time_zone = '" . date('P') . "'");
    $GLOBALS['hlw_db'] = $conn;
    return $conn;
}

/* ใช้ในเทสต์: เปลี่ยนฐานข้อมูล */
function db_reset_connection()
{
    if (isset($GLOBALS['hlw_db']) && $GLOBALS['hlw_db']) {
        @mysqli_close($GLOBALS['hlw_db']);
    }
    $GLOBALS['hlw_db'] = null;
}

/* ชนิดพารามิเตอร์จากค่า: int → i, float → d, อื่น ๆ → s (null ส่งเป็น NULL ได้) */
function db_types($params)
{
    $t = '';
    foreach ($params as $p) {
        if (is_int($p) || is_bool($p)) { $t .= 'i'; }
        elseif (is_float($p))          { $t .= 'd'; }
        else                           { $t .= 's'; }
    }
    return $t;
}

/* prepare + bind + execute → statement */
function db_stmt($sql, $params)
{
    $conn = db();
    $stmt = mysqli_prepare($conn, $sql);
    if (!$stmt) {
        throw new DbError('SQL ผิดพลาด: ' . mysqli_error($conn), mysqli_errno($conn));
    }
    if (count($params) > 0) {
        $args = array($stmt, db_types($params));
        $vals = array();
        foreach ($params as $i => $p) {
            $vals[$i] = is_bool($p) ? ($p ? 1 : 0) : $p;
        }
        foreach ($vals as $i => $v) {
            $args[] = &$vals[$i];       // bind_param ต้องการ reference
        }
        call_user_func_array('mysqli_stmt_bind_param', $args);
    }
    if (!mysqli_stmt_execute($stmt)) {
        $errno = mysqli_stmt_errno($stmt);
        $msg = mysqli_stmt_error($stmt);
        mysqli_stmt_close($stmt);
        throw new DbError($msg, $errno);
    }
    return $stmt;
}

/* SELECT → array ของแถว (assoc) */
function db_all($sql, $params = array())
{
    $stmt = db_stmt($sql, $params);
    $meta = mysqli_stmt_result_metadata($stmt);
    if (!$meta) {
        mysqli_stmt_close($stmt);
        return array();
    }
    mysqli_stmt_store_result($stmt);
    $row = array();
    $bind = array($stmt);
    foreach (mysqli_fetch_fields($meta) as $f) {
        $row[$f->name] = null;
        $bind[] = &$row[$f->name];
    }
    call_user_func_array('mysqli_stmt_bind_result', $bind);
    $out = array();
    while (mysqli_stmt_fetch($stmt)) {
        $copy = array();
        foreach ($row as $k => $v) { $copy[$k] = $v; }   // คัดลอกค่า (ตัวแปรเดิมเป็น reference)
        $out[] = $copy;
    }
    mysqli_free_result($meta);
    mysqli_stmt_close($stmt);
    return $out;
}

function db_one($sql, $params = array())
{
    $rows = db_all($sql, $params);
    return count($rows) > 0 ? $rows[0] : null;
}

function db_value($sql, $params = array())
{
    $r = db_one($sql, $params);
    if ($r === null) { return null; }
    foreach ($r as $v) { return $v; }
    return null;
}

/* INSERT/UPDATE/DELETE → array('affected' => n, 'id' => insert id) */
function db_exec($sql, $params = array())
{
    $stmt = db_stmt($sql, $params);
    $res = array('affected' => mysqli_stmt_affected_rows($stmt), 'id' => (int)mysqli_stmt_insert_id($stmt));
    mysqli_stmt_close($stmt);
    return $res;
}

/* ---------- transaction ---------- */
function db_begin()
{
    $GLOBALS['hlw_tx_depth'] = isset($GLOBALS['hlw_tx_depth']) ? $GLOBALS['hlw_tx_depth'] + 1 : 1;
    if ($GLOBALS['hlw_tx_depth'] === 1) { mysqli_autocommit(db(), false); }
}

function db_commit()
{
    $GLOBALS['hlw_tx_depth']--;
    if ($GLOBALS['hlw_tx_depth'] === 0) {
        mysqli_commit(db());
        mysqli_autocommit(db(), true);
    }
}

function db_rollback()
{
    if (!empty($GLOBALS['hlw_tx_depth'])) {
        $GLOBALS['hlw_tx_depth'] = 0;
        mysqli_rollback(db());
        mysqli_autocommit(db(), true);
    }
}

/* เวลาปัจจุบันของแอป (MySQL 5.0: DATETIME ไม่มี DEFAULT — แอปส่งค่าเอง) */
function db_now()
{
    return date('Y-m-d H:i:s', clock_time());
}

/* ข้อความ error ภาษาคน (เหมือน stock_hr/backend/db.php) */
function db_error_message($errno, $context = '')
{
    if ($errno === 1062) { return 'มีข้อมูลนี้อยู่แล้ว กรุณาใช้ค่าอื่น'; }
    if ($errno === 1452) { return 'ไม่พบข้อมูลอ้างอิงที่เลือก กรุณาเลือกใหม่'; }
    if ($errno === 1451) { return $context !== '' ? $context : 'ลบไม่ได้ เพราะยังมีข้อมูลอื่นอ้างถึงรายการนี้อยู่'; }
    return 'ดำเนินการกับฐานข้อมูลไม่สำเร็จ';
}
