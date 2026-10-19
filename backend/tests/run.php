<?php
/* ============================================================
 *  backend/tests/run.php — เทสต์ backend ทั้งหมด (PHP 5.2 CLI แบบเดียวกับ stock_hr)
 *
 *      C:\AppServ\php5\php.exe backend\tests\run.php
 *
 *  1) สร้างฐานข้อมูล hl_welfare_test ใหม่จาก backend/sql/001–003 (ลบของเดิมทิ้งทุกครั้ง)
 *  2) golden: ทุก endpoint อ่านข้อมูลต้องตอบเหมือน MockApi ทุกตัว
 *     (fixtures/golden.json สร้างโดย node scripts/export-seed.mjs จาก seed วันเดียวกัน)
 *  3) การเข้าสู่ระบบ / refresh token / สิทธิ์ / การเขียนข้อมูล / ส่งเบิกสต็อก (สต็อกตัวปลอม)
 *  เรียก api_handle() ตรง ๆ ในโปรเซสเดียว (ไม่ต้องเปิด Apache) — cookie จัดการด้วย jar ของเทสต์เอง
 * ============================================================ */

error_reporting(E_ALL ^ E_NOTICE);
$root = dirname(dirname(dirname(__FILE__)));
$golden = json_decode(file_get_contents($root . '/backend/tests/fixtures/golden.json'), true);
if (!$golden) { die("อ่าน fixtures/golden.json ไม่ได้ — รัน node scripts/export-seed.mjs ก่อน\n"); }

/* ใช้ค่าเชื่อมต่อจาก config.php แต่เปลี่ยนเป็นฐานข้อมูลทดสอบ + วันที่ของ seed */
include $root . '/backend/config.php';
$hlw_config['db_name'] = getenv('HLW_TEST_DB') ? getenv('HLW_TEST_DB') : 'hl_welfare_test';
if (strpos($hlw_config['db_name'], 'test') === false) { die("ฐานข้อมูลทดสอบต้องมีคำว่า test\n"); }
$hlw_config['today_override'] = $golden['today'];
$hlw_config['cookie_secure'] = false;
$GLOBALS['hlw_config'] = $hlw_config;
require $root . '/backend/bootstrap.php';

/* ---------- สร้างฐานข้อมูลใหม่ ---------- */
$c = $hlw_config;
$admin = mysqli_connect($c['db_host'], $c['db_user'], $c['db_pass'], '', (int)$c['db_port']) or die("ต่อ MySQL ไม่ได้\n");
mysqli_query($admin, 'DROP DATABASE IF EXISTS `' . $c['db_name'] . '`');
mysqli_query($admin, 'CREATE DATABASE `' . $c['db_name'] . '` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci');
mysqli_select_db($admin, $c['db_name']);
foreach (array('001_schema', '002_seed_master', '003_seed_demo', '004_super_admin') as $f) {
    $sql = file_get_contents($root . '/backend/sql/' . $f . '.sql');
    if (!mysqli_multi_query($admin, $sql)) { die("$f: " . mysqli_error($admin) . "\n"); }
    do {
        if ($r = mysqli_store_result($admin)) { mysqli_free_result($r); }
        if (mysqli_errno($admin)) { die("$f: " . mysqli_error($admin) . "\n"); }
    } while (mysqli_more_results($admin) && mysqli_next_result($admin));
    if (mysqli_errno($admin)) { die("$f: " . mysqli_error($admin) . "\n"); }
}
mysqli_close($admin);

/* ---------- ตัวช่วย ---------- */
$GLOBALS['pass'] = 0;
$GLOBALS['fail'] = 0;
function check($name, $ok, $detail = '')
{
    if ($ok) { $GLOBALS['pass']++; } else { $GLOBALS['fail']++; }
    echo ($ok ? '  ok   ' : '  FAIL ') . $name . (($ok || $detail === '') ? '' : "\n         → " . $detail) . "\n";
}
/** สถานะ HTTP (PHP 5.2 เขียน f()['x'] ไม่ได้) */
function S($res) { return $res['status']; }
function section($t) { echo "\n" . $t . "\n"; }

/** cookie jar ต่อ "เบราว์เซอร์" */
class Browser
{
    public $cookies = array();
    public $ip;
    function Browser($ip = '10.0.0.1') { $this->ip = $ip; }

    function req($method, $path, $body = null, $headers = array())
    {
        $h = array('host' => 'localhost', 'user-agent' => 'test');
        if ($method !== 'GET') { $h['content-type'] = 'application/json'; }
        foreach ($headers as $k => $v) { $h[strtolower($k)] = $v; }
        $parts = explode('?', $path, 2);
        $query = array();
        if (isset($parts[1])) { parse_str($parts[1], $query); }
        $send = array();
        foreach ($this->cookies as $name => $ck) {
            if (strpos($parts[0], $this->apiPath($ck['path'])) === 0 || $ck['path'] === '/hl-welfare/web/') { $send[$name] = $ck['value']; }
        }
        $res = api_handle(array('method' => $method, 'path' => $parts[0], 'query' => $query,
            'raw' => $body === null ? '' : json_encode($body), 'cookies' => $send, 'headers' => $h, 'ip' => $this->ip,
            'https' => false, 'base' => '/hl-welfare/web/api/index.php'));
        foreach ($res['cookies'] as $line) {
            $seg = explode(';', $line);
            $kv = explode('=', $seg[0], 2);
            $path = '/';
            $expired = false;
            foreach ($seg as $s) {
                $s = trim($s);
                if (stripos($s, 'Path=') === 0) { $path = substr($s, 5); }
                if (stripos($s, 'Max-Age=') === 0 && (int)substr($s, 8) <= 0) { $expired = true; }
            }
            if ($kv[1] === '' || $expired) { unset($this->cookies[$kv[0]]); }
            else { $this->cookies[$kv[0]] = array('value' => rawurldecode($kv[1]), 'path' => $path, 'raw' => $line); }
        }
        $res['json'] = $res['body'] === null ? null : json_decode(json_encode($res['body']), true);
        return $res;
    }

    /** path ของ cookie → path ของ API (ตัด /hl-welfare/web/api/index.php ออก) */
    function apiPath($cookiePath)
    {
        $base = '/hl-welfare/web/api/index.php';
        return strpos($cookiePath, $base) === 0 ? (substr($cookiePath, strlen($base)) === '' ? '/' : substr($cookiePath, strlen($base))) : "\0";
    }
}

/** เทียบค่าแบบ JSON: ลำดับ key ไม่สำคัญ · ตัวเลข 1 == 1.0 · key ที่ไม่มี == null */
function diff_json($a, $b, $path = '$')
{
    if (is_array($a) && is_array($b)) {
        $keys = array_unique(array_merge(array_keys($a), array_keys($b)));
        foreach ($keys as $k) {
            $va = array_key_exists($k, $a) ? $a[$k] : null;
            $vb = array_key_exists($k, $b) ? $b[$k] : null;
            $d = diff_json($va, $vb, $path . '.' . $k);
            if ($d !== null) { return $d; }
        }
        return null;
    }
    if (is_array($a) && count($a) === 0 && $b === null) { return null; }
    if (is_array($b) && count($b) === 0 && $a === null) { return null; }
    if ((is_int($a) || is_float($a)) && (is_int($b) || is_float($b))) {
        return abs($a - $b) < 1e-9 ? null : "$path: " . var_export($a, true) . ' ≠ ' . var_export($b, true);
    }
    return $a === $b ? null : "$path: " . substr(json_encode($a), 0, 120) . ' ≠ ' . substr(json_encode($b), 0, 120);
}

/** golden ของ mock: การแจกจากข้อมูลตั้งต้นไม่มี source (= MANUAL) */
function normalize_golden($v)
{
    if (!is_array($v)) { return $v; }
    if (array_key_exists('entitlementKey', $v) && array_key_exists('issuedBy', $v) && !array_key_exists('source', $v)) {
        $v['source'] = 'MANUAL';
    }
    foreach ($v as $k => $x) { $v[$k] = normalize_golden($x); }
    return $v;
}

function same_as_golden($name, $res, $expected)
{
    $d = $res['status'] === 200 ? diff_json($res['json']['data'], normalize_golden($expected)) : 'HTTP ' . $res['status'] . ' ' . json_encode($res['json']);
    check($name, $d === null, (string)$d);
}

function make_user($username, $password, $name, $role, $empCode = null)
{
    db_exec("INSERT INTO users (username, password_hash, name, emp_code, role, created_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, 'test', 'test')", array($username, pw_hash($password), $name, $empCode, $role, db_now()));
}

/* ---------- สต็อกตัวปลอม (แทน stock_hr/api/welfare.php) ---------- */
$GLOBALS['stock_log'] = array();
$GLOBALS['stock_status'] = array();
function fake_stock($p)
{
    $GLOBALS['stock_log'][] = $p;
    if ($p['action'] === 'catalog') {
        return array(200, array('ok' => true, 'department' => array('department_id' => 9, 'department_name' => 'คลัง', 'company_name' => 'PRO'),
            'items' => array(array('item_code' => 'POLO_BLACK', 'variants' => array(
                array('sub_category_id' => 1, 'variant_label' => 'ชาย', 'sub_category_name' => 'โปโลชาย',
                    'products' => array(array('product_id' => 31, 'product_code' => 'P31', 'product_name' => 'โปโล L', 'size' => 'L', 'on_hand' => 5))),
                array('sub_category_id' => 2, 'variant_label' => 'หญิง', 'sub_category_name' => 'โปโลหญิง', 'products' => array()))))));
    }
    if ($p['action'] === 'submit') {
        $ref = $p['employee_id'] . ':' . $p['entitlement_key'];
        return array(200, array('ok' => true, 'message' => 'ok', 'doc_id' => 77, 'doc_no' => 'WRQ-0077', 'duplicate' => false,
            'status' => array($ref => array('doc_id' => 77, 'doc_no' => 'WRQ-0077', 'stage' => 'REQUESTED', 'issued_at' => null,
                'received_at' => null, 'items' => array(array('product_id' => 31, 'product_name' => 'โปโล L', 'size' => 'L', 'qty' => 2, 'uniform' => true))))));
    }
    if ($p['action'] === 'status') { return array(200, array('ok' => true, 'status' => $GLOBALS['stock_status'])); }
    if ($p['action'] === 'cancel') { return array(200, array('ok' => true, 'message' => 'ok', 'doc_id' => 77)); }
    return array(400, array('ok' => false, 'message' => 'bad'));
}
$GLOBALS['hlw_stock_fake'] = 'fake_stock';

/* ============================================================ */
make_user('hr', 'Secret-1234', 'สมใจ ใจดี', 'HR_ADMIN', 'HL-0001');
make_user('payroll', 'Payroll-1234', 'วิชัย บัญชีดี', 'PAYROLL');
make_user('victim', 'Victim-1234', 'ผู้ใช้ทดสอบ', 'HR_ADMIN');

section('ไลบรารี');
check('PBKDF2-HMAC-SHA256 ตรง test vector (RFC 7914)',
    bin2hex(pbkdf2_sha256('passwd', 'salt', 1, 64)) === '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783');
$h = pw_hash('รหัสผ่าน ไทย 123');
check('pw_hash / pw_verify (รองรับภาษาไทย)', pw_verify('รหัสผ่าน ไทย 123', $h) && !pw_verify('รหัสผ่าน ไทย 124', $h) && strpos($h, 'pbkdf2_sha256$') === 0);
$a = sec_random_hex(32); $b = sec_random_hex(32);
check('ค่าสุ่ม 256 บิต ไม่ซ้ำ', strlen($a) === 64 && $a !== $b && preg_match('/^[0-9a-f]{64}$/', $a));
$arr = array(array('k' => 1, 'i' => 0), array('k' => 0, 'i' => 1), array('k' => 1, 'i' => 2), array('k' => 0, 'i' => 3));
function __cmp_k($x, $y) { return $x['k'] - $y['k']; }
stable_usort($arr, '__cmp_k');
check('stable_usort คงลำดับเดิมเมื่อเท่ากัน', $arr[0]['i'] === 1 && $arr[1]['i'] === 3 && $arr[2]['i'] === 0 && $arr[3]['i'] === 2);

section('ต้องเข้าสู่ระบบ');
$anon = new Browser();
$r = $anon->req('GET', '/dashboard');
check('GET /dashboard ไม่มี session → 401', $r['status'] === 401 && $r['json']['code'] === 'UNAUTHENTICATED');
check('endpoint ที่ไม่มี → 404', S($anon->req('GET', '/nope')) === 404 || S($anon->req('GET', '/nope')) === 401);

$hr = new Browser();
$r = $hr->req('POST', '/auth/login', array('username' => 'HR', 'password' => 'Secret-1234'));
check('login (ชื่อผู้ใช้ไม่สนตัวพิมพ์)', $r['status'] === 200 && $r['json']['data']['name'] === 'สมใจ ใจดี' && $r['json']['data']['role'] === 'HR Admin', json_encode($r['json']));

section('golden: ตอบเหมือน MockApi ทุกตัว (วันที่ ' . $golden['today'] . ')');
$g = $golden['reads'];
same_as_golden('GET /dashboard', $hr->req('GET', '/dashboard'), $g['dashboard']);
same_as_golden('GET /monitor/tasks', $hr->req('GET', '/monitor/tasks'), $g['workQueue']);
same_as_golden('GET /companies', $hr->req('GET', '/companies'), $g['companies']);
same_as_golden('GET /sites', $hr->req('GET', '/sites'), $g['sites']);
same_as_golden('GET /employees', $hr->req('GET', '/employees'), $g['employees']);
same_as_golden('GET /employees?q=สม&company=HL', $hr->req('GET', '/employees?q=' . urlencode('สม') . '&company=HL'), $g['employees?q=สม&company=HL']);
same_as_golden('GET /employees?type=DAILY&status=ACTIVE', $hr->req('GET', '/employees?type=DAILY&status=ACTIVE'), $g['employees?type=DAILY&status=ACTIVE']);
same_as_golden('GET /rules', $hr->req('GET', '/rules'), $g['rules']);
$bad = array();
foreach ($golden['benefits'] as $id => $exp) {
    $res = $hr->req('GET', '/employees/' . $id . '/benefits');
    $d = diff_json($res['json']['data'], normalize_golden($exp));
    if ($d !== null) { $bad[] = "#$id $d"; }
}
check('GET /employees/{id}/benefits — ทั้ง ' . count($golden['benefits']) . ' คน', !count($bad), implode("\n           ", array_slice($bad, 0, 3)));
foreach ($golden['cycles'] as $date => $exp) {
    same_as_golden('GET /insurance/cycles/' . $date, $hr->req('GET', '/insurance/cycles/' . $date), $exp);
}
same_as_golden('GET /insurance/batches', $hr->req('GET', '/insurance/batches'), $g['batches']);
foreach ($golden['batchDetail'] as $id => $exp) {
    same_as_golden('GET /insurance/batches/' . $id, $hr->req('GET', '/insurance/batches/' . $id), $exp);
}
$lastBatch = max(array_keys($golden['batchDetail']));
same_as_golden('GET /insurance/batches/' . $lastBatch . '/export', $hr->req('GET', '/insurance/batches/' . $lastBatch . '/export'), $g['batchExport:last']);
same_as_golden('GET /insurers', $hr->req('GET', '/insurers'), $g['insurers']);
$exp = $g['export:2026-11-05:1'];
same_as_golden('POST /insurance/exports (ไม่บันทึก) 2026-11-05', $hr->req('POST', '/insurance/exports', array('cycleDate' => '2026-11-05', 'insurerId' => 1, 'record' => false)), $exp);
same_as_golden('POST /insurance/exports (ไม่บันทึก) 2026-10-05', $hr->req('POST', '/insurance/exports', array('cycleDate' => '2026-10-05', 'insurerId' => 1, 'record' => false)), $g['export:2026-10-05:1']);
same_as_golden('GET /uniform/issues', $hr->req('GET', '/uniform/issues'), $g['issues']);
same_as_golden('GET /uniform/issues?employeeId=1', $hr->req('GET', '/uniform/issues?employeeId=1'), $g['issues?employeeId=1']);
same_as_golden('GET /uniform/pending', $hr->req('GET', '/uniform/pending'), $g['pending']);
/* กิจกรรม: เทียบเฉพาะของ seed (login ข้างบนเขียน USER/LOGIN เพิ่ม) */
$res = $hr->req('GET', '/activity?entity=UNIFORM_ISSUE&limit=15');
same_as_golden('GET /activity?entity=UNIFORM_ISSUE&limit=15', $res, $g['activity?entity=UNIFORM_ISSUE&limit=15']);
same_as_golden('GET /activity?employeeId=30', $hr->req('GET', '/activity?employeeId=30'), $g['activity?employeeId=30']);

section('CSRF');
$r = $hr->req('POST', '/auth/logout', null, array('content-type' => 'text/plain'));
check('POST ที่ไม่ใช่ JSON → 415', $r['status'] === 415);
$r = $hr->req('POST', '/auth/logout', array(), array('origin' => 'https://evil.example'));
check('Origin เว็บอื่น → 403', $r['status'] === 403);
check('ยังอยู่ในระบบหลังคำขอที่ถูกปฏิเสธ', S($hr->req('GET', '/auth/me')) === 200);

section('login / session');
$x = new Browser();
$r = $x->req('POST', '/auth/login', array('username' => 'hr', 'password' => 'wrong'));
check('รหัสผ่านผิด → 401', $r['status'] === 401 && $r['json']['error'] === 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
$r = $x->req('POST', '/auth/login', array('username' => 'nobody', 'password' => 'wrong'));
check('ไม่มีผู้ใช้ → 401 ข้อความเดียวกัน', $r['status'] === 401 && $r['json']['error'] === 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
$sc = $hr->cookies['HLW_SESSION']['raw'];
check('session cookie HttpOnly + SameSite=Lax + path หน้าเว็บ', stripos($sc, 'HttpOnly') !== false && stripos($sc, 'SameSite=Lax') !== false
    && $hr->cookies['HLW_SESSION']['path'] === '/hl-welfare/web/', $sc);
check('ไม่เลือกจดจำฉัน → ไม่มี refresh cookie', !isset($hr->cookies['HLW_REFRESH']));
$row = db_one('SELECT * FROM auth_sessions ORDER BY id DESC LIMIT 1');
check('auth_sessions เก็บเฉพาะ SHA-256', $row['token_hash'] === hash('sha256', $hr->cookies['HLW_SESSION']['value']));
$GLOBALS['hlw_clock_offset'] = 31 * 60;
check('ไม่ใช้งาน 31 นาที → session หมด (401)', S($hr->req('GET', '/auth/me')) === 401);
$GLOBALS['hlw_clock_offset'] = 0;
$hr->req('POST', '/auth/login', array('username' => 'hr', 'password' => 'Secret-1234'));
check('login ใหม่ได้', S($hr->req('GET', '/auth/me')) === 200);
$GLOBALS['hlw_clock_offset'] = 13 * 3600;
db_exec('UPDATE auth_sessions SET last_seen_at = ?', array(date('Y-m-d H:i:s', time() + 13 * 3600)));
check('ครบ 12 ชม. → session หมดแม้ใช้งานอยู่', S($hr->req('GET', '/auth/me')) === 401);
$GLOBALS['hlw_clock_offset'] = 0;
$hr->req('POST', '/auth/login', array('username' => 'hr', 'password' => 'Secret-1234'));

section('จดจำฉัน + หมุนโทเคน');
$a = new Browser();
$a->req('POST', '/auth/login', array('username' => 'hr', 'password' => 'Secret-1234', 'remember' => true));
$rc = $a->cookies['HLW_REFRESH'];
check('refresh cookie path=<api>/auth HttpOnly SameSite=Lax', $rc['path'] === '/hl-welfare/web/api/index.php/auth'
    && stripos($rc['raw'], 'HttpOnly') !== false && stripos($rc['raw'], 'SameSite=Lax') !== false, $rc['raw']);
$t1 = $rc['value'];
check('โทเคน 256 บิต (hex 64)', (bool)preg_match('/^[0-9a-f]{64}$/', $t1));
$row = db_one('SELECT * FROM auth_refresh_tokens WHERE token_hash = ?', array(hash('sha256', $t1)));
check('DB เก็บเฉพาะ SHA-256 + อายุ ~30 วัน', $row && abs(strtotime($row['expires_at']) - (time() + 30 * 86400)) < 120);
$cB = new Browser();
$cB->cookies['HLW_REFRESH'] = $rc;
$r = $cB->req('POST', '/auth/refresh');
$t2 = isset($cB->cookies['HLW_REFRESH']) ? $cB->cookies['HLW_REFRESH']['value'] : '';
check('refresh → session ใหม่ + โทเคนใหม่', $r['status'] === 200 && isset($cB->cookies['HLW_SESSION']) && $t2 !== '' && $t2 !== $t1, json_encode($r['json']));
check('session ใหม่ใช้ได้', S($cB->req('GET', '/auth/me')) === 200);
$old = db_one('SELECT * FROM auth_refresh_tokens WHERE token_hash = ?', array(hash('sha256', $t1)));
$new = db_one('SELECT * FROM auth_refresh_tokens WHERE token_hash = ?', array(hash('sha256', $t2)));
check('ตัวเก่า ROTATED → replaced_by ตัวใหม่ (family เดิม)', $old['revoked_reason'] === 'ROTATED' && (int)$old['replaced_by'] === (int)$new['id']
    && $old['family_id'] === $new['family_id']);
$race = new Browser();
$race->cookies['HLW_REFRESH'] = $rc;
$r = $race->req('POST', '/auth/refresh');
check('ใช้ตัวเก่าซ้ำทันที → 409 REFRESH_RACE ไม่เพิกถอน', $r['status'] === 409 && $r['json']['code'] === 'REFRESH_RACE'
    && db_value('SELECT revoked_at FROM auth_refresh_tokens WHERE id = ?', array((int)$new['id'])) === null);
$GLOBALS['hlw_clock_offset'] = 20;
$thief = new Browser();
$thief->cookies['HLW_REFRESH'] = $rc;
$r = $thief->req('POST', '/auth/refresh');
check('ใช้ตัวเก่าซ้ำหลัง grace → 401 REFRESH_REUSED', $r['status'] === 401 && $r['json']['code'] === 'REFRESH_REUSED', json_encode($r['json']));
check('ทั้ง family ถูกเพิกถอน (REUSE)', db_value('SELECT revoked_reason FROM auth_refresh_tokens WHERE id = ?', array((int)$new['id'])) === 'REUSE');
check('เจ้าของตัวจริงต้อง login ใหม่', S($cB->req('POST', '/auth/refresh')) === 401);
check('audit_log บันทึก TOKEN_REUSE ครั้งเดียว', (int)db_value("SELECT COUNT(*) FROM audit_log WHERE action = 'TOKEN_REUSE'") === 1);
$GLOBALS['hlw_clock_offset'] = 0;
$fake = new Browser();
$fake->cookies['HLW_REFRESH'] = array('value' => str_repeat('a', 64), 'path' => '/hl-welfare/web/api/index.php/auth', 'raw' => '');
check('refresh cookie ปลอม → 401', S($fake->req('POST', '/auth/refresh')) === 401);

section('logout / เปลี่ยนรหัสผ่าน / ปิดบัญชี');
$d = new Browser();
$d->req('POST', '/auth/login', array('username' => 'hr', 'password' => 'Secret-1234', 'remember' => true));
$dTok = $d->cookies['HLW_REFRESH'];
$r = $d->req('POST', '/auth/logout', array());
check('logout → 204 + ลบ cookie', $r['status'] === 204 && !isset($d->cookies['HLW_REFRESH']) && !isset($d->cookies['HLW_SESSION']));
check('โทเคนถูกเพิกถอน (LOGOUT)', db_value('SELECT revoked_reason FROM auth_refresh_tokens WHERE token_hash = ?', array(hash('sha256', $dTok['value']))) === 'LOGOUT');
$d->cookies['HLW_REFRESH'] = $dTok;
check('ใช้โทเคนหลัง logout ไม่ได้', S($d->req('POST', '/auth/refresh')) === 401);
$p1 = new Browser(); $p2 = new Browser();
$p1->req('POST', '/auth/login', array('username' => 'victim', 'password' => 'Victim-1234', 'remember' => true));
$p2->req('POST', '/auth/login', array('username' => 'victim', 'password' => 'Victim-1234', 'remember' => true));
$p2Tok = $p2->cookies['HLW_REFRESH'];
check('รหัสผ่านปัจจุบันผิด → 422', S($p1->req('POST', '/auth/password', array('currentPassword' => 'x', 'newPassword' => 'Victim-5678'))) === 422);
check('รหัสผ่านใหม่สั้นเกิน → 422', S($p1->req('POST', '/auth/password', array('currentPassword' => 'Victim-1234', 'newPassword' => 'short'))) === 422);
$r = $p1->req('POST', '/auth/password', array('currentPassword' => 'Victim-1234', 'newPassword' => 'Victim-5678'));
check('เปลี่ยนรหัสผ่าน → 200', $r['status'] === 200, json_encode($r['json']));
check('ทุกโทเคนถูกเพิกถอน', (int)db_value("SELECT COUNT(*) FROM auth_refresh_tokens t JOIN users u ON u.id = t.user_id WHERE u.username = 'victim' AND t.revoked_at IS NULL") === 0);
check('เครื่องที่เปลี่ยนอยู่ต่อ · อีกเครื่องหลุด', S($p1->req('GET', '/auth/me')) === 200 && S($p2->req('GET', '/auth/me')) === 401);
$p2->cookies['HLW_REFRESH'] = $p2Tok;
check('อีกเครื่อง refresh ไม่ได้', S($p2->req('POST', '/auth/refresh')) === 401);
db_exec("UPDATE users SET is_active = 0 WHERE username = 'victim'");
check('ปิดบัญชี → session หลุดทันที + login ไม่ได้', S($p1->req('GET', '/auth/me')) === 401
    && S($x->req('POST', '/auth/login', array('username' => 'victim', 'password' => 'Victim-5678'))) === 401);

section('เขียนข้อมูล (ผู้ทำรายการจาก session)');
$emp = $golden['reads']['employees'][0];
$new = $emp;
unset($new['id']);
$new['empCode'] = 'TEST0001';
$new['firstName'] = 'ทดสอบ';
$r = $hr->req('POST', '/employees', $new);
check('เพิ่มพนักงาน → 201', $r['status'] === 201 && $r['json']['data']['empCode'] === 'TEST0001', json_encode($r['json']));
$newId = $r['json']['data']['id'];
check('รหัสพนักงานซ้ำ → 409', S($hr->req('POST', '/employees', $new)) === 409);
$bad = $new; $bad['empCode'] = 'TEST0002'; $bad['nationalId'] = '1234567890123';
$r = $hr->req('POST', '/employees', $bad);
check('เลขบัตรผิด → 422 + errors.nationalId', $r['status'] === 422 && isset($r['json']['errors']['nationalId']));
$bad = $new; $bad['empCode'] = 'TEST0003'; $bad['siteId'] = 3;
check('หน่วยงานไม่ตรงบริษัท → 422', S($hr->req('POST', '/employees', $bad)) === 422);
$upd = $r = $hr->req('GET', '/employees?q=TEST0001');
$e2 = $upd['json']['data'][0];
$e2['status'] = 'INACTIVE'; $e2['endReason'] = 'RESIGN'; $e2['endDate'] = '2026-10-18'; $e2['lastWorkingDate'] = '2026-10-17';
$r = $hr->req('PUT', '/employees/' . $newId, $e2);
check('บันทึกพ้นสภาพ → audit "บันทึกพ้นสภาพ" + ชื่อผู้ใช้', $r['status'] === 200
    && db_value("SELECT user_name FROM audit_log WHERE entity = 'EMPLOYEE' AND entity_id = ? ORDER BY id DESC LIMIT 1", array((string)$newId)) === 'สมใจ ใจดี'
    && strpos(db_value("SELECT summary FROM audit_log WHERE entity = 'EMPLOYEE' AND entity_id = ? ORDER BY id DESC LIMIT 1", array((string)$newId)), 'บันทึกพ้นสภาพ') === 0);
check('ลบพนักงานที่ไม่มีประวัติ → 204', S($hr->req('DELETE', '/employees/' . $newId)) === 204);
check('ลบพนักงานที่มีประวัติ → 409', S($hr->req('DELETE', '/employees/30')) === 409);

$r = $hr->req('POST', '/sites', array('companyCode' => 'HL', 'name' => 'ไซต์ทดสอบ', 'hasGroupInsurance' => true, 'poloColor' => 'NAVY'));
check('เพิ่มหน่วยงาน → 201', $r['status'] === 201 && $r['json']['data']['poloColor'] === 'NAVY');
$sid = $r['json']['data']['id'];
check('ชื่อซ้ำในบริษัท → 409', S($hr->req('POST', '/sites', array('companyCode' => 'HL', 'name' => 'ไซต์ทดสอบ'))) === 409);
$r = $hr->req('PATCH', '/sites/' . $sid, array('hasGroupInsurance' => false));
check('แก้หน่วยงาน', $r['status'] === 200 && $r['json']['data']['hasGroupInsurance'] === false);
check('ลบหน่วยงานที่มีพนักงาน → 409', S($hr->req('DELETE', '/sites/1')) === 409);
check('ลบหน่วยงานว่าง → 204', S($hr->req('DELETE', '/sites/' . $sid)) === 204);

/* แจ้งประกัน: ส่งออกรอบ 2026-11-05 แบบบันทึก แล้วรอบเดิมซ้ำต้องแทนที่ */
$before = $hr->req('POST', '/insurance/exports', array('cycleDate' => '2026-11-05', 'insurerId' => 1, 'record' => false));
$n = 0;
foreach ($before['json']['data']['companies'] as $co) { $n += count($co['in']) + count($co['out']); }
$r = $hr->req('POST', '/insurance/exports', array('cycleDate' => '2026-11-05', 'insurerId' => 1, 'record' => true));
$created = $r['json']['data']['batches'];
check('ส่งออก + บันทึก → batch 1 รายการ ' . $n . ' คน ผู้ส่งจาก session', $r['status'] === 200 && count($created) === 1
    && count($created[0]['items']) === $n && $created[0]['submittedBy'] === 'สมใจ ใจดี'
    && (int)db_value('SELECT submitted_by_user_id FROM insurance_batches WHERE id = ?', array($created[0]['id'])) > 0);
$allSent = true;
foreach ($r['json']['data']['companies'] as $co) {
    foreach (array_merge($co['in'], $co['out']) as $row) { if (!$row['submitted']) { $allSent = false; } }
}
check('หลังบันทึก ทุกแถวเป็น "ส่งออกแล้ว"', $allSent);
$r2 = $hr->req('POST', '/insurance/exports', array('cycleDate' => '2026-11-05', 'insurerId' => 1, 'record' => true));
check('ส่งออกรอบเดิมซ้ำ → แทนที่ batch เดิม (ไม่ซ้อน)', $r2['status'] === 200
    && (int)db_value("SELECT COUNT(*) FROM insurance_batches WHERE cycle_date = '2026-11-05' AND insurer_id = 1") === 1);
$someone = $created[0]['items'][0]['employeeId'];
$type = $created[0]['items'][0]['type'];
$r = $hr->req('POST', '/insurance/batches', array('cycleDate' => '2026-11-05', 'type' => $type, 'employeeIds' => array($someone)));
check('ส่งแจ้งซ้ำ → 409', $r['status'] === 409 && strpos($r['json']['error'], 'ถูกแจ้งไปแล้ว 1 ราย') !== false, json_encode($r['json']));
check('ไม่มีรายการที่เลือก → 422', S($hr->req('POST', '/insurance/batches', array('cycleDate' => '2026-11-05', 'type' => 'IN', 'employeeIds' => array()))) === 422);
$bid = db_value("SELECT id FROM insurance_batches WHERE cycle_date = '2026-11-05'");
check('ยกเลิกการส่งออก → 204 รายการกลับเป็นรอส่ง', S($hr->req('DELETE', '/insurance/batches/' . $bid)) === 204
    && (int)db_value('SELECT COUNT(*) FROM insurance_batch_items WHERE batch_id = ?', array((int)$bid)) === 0);

/* ชุดฟอร์ม */
$pend = $hr->req('GET', '/uniform/pending');
$p = $pend['json']['data'][0];
$r = $hr->req('POST', '/uniform/issues', array('employeeId' => $p['employee']['id'], 'entitlementKey' => $p['entitlementKey'],
    'event' => $p['event'], 'qty' => 2, 'size' => 'L', 'issuedAt' => $golden['today'], 'issuedBy' => 'คนปลอม'));
check('บันทึกแจกชุด → issuedBy จาก session (ไม่ใช่ body)', $r['status'] === 201 && $r['json']['data']['issuedBy'] === 'สมใจ ใจดี', json_encode($r['json']));
$iid = $r['json']['data']['id'];
check('แจกซ้ำ → 409', S($hr->req('POST', '/uniform/issues', array('employeeId' => $p['employee']['id'], 'entitlementKey' => $p['entitlementKey'],
    'event' => $p['event'], 'qty' => 2, 'size' => 'L', 'issuedAt' => $golden['today']))) === 409);
check('ไม่ระบุไซซ์ → 422', S($hr->req('POST', '/uniform/issues', array('employeeId' => 1, 'entitlementKey' => 'X', 'event' => 'START', 'qty' => 1,
    'size' => ' ', 'issuedAt' => $golden['today']))) === 422);
check('ยกเลิกการแจก → 204', S($hr->req('DELETE', '/uniform/issues/' . $iid)) === 204);

section('ส่งเบิกสต็อก Uniform (สต็อกตัวปลอม)');
$p = null;
foreach ($pend['json']['data'] as $row) {
    if (in_array('POLO_BLACK', array('POLO_BLACK'))) { $p = $row; break; }
}
$q = '/uniform/stock-options?employeeId=' . $p['employee']['id'] . '&entitlementKey=' . urlencode($p['entitlementKey']);
$r = $hr->req('GET', $q);
check('ตัวเลือกส่งเบิก (catalog → แบบ/ไซซ์)', $r['status'] === 200 && isset($r['json']['data']['items']) && $r['json']['data']['department']['id'] === 9,
    json_encode($r['json']));
$pay = new Browser();
$pay->req('POST', '/auth/login', array('username' => 'payroll', 'password' => 'Payroll-1234'));
$body = array('employeeId' => $p['employee']['id'], 'entitlementKey' => $p['entitlementKey'],
    'lines' => array(array('itemCode' => 'POLO_BLACK', 'productId' => 31, 'qty' => 2)));
check('Payroll ส่งเบิกไม่ได้ → 403', S($pay->req('POST', '/uniform/stock-requests', $body)) === 403);
$GLOBALS['stock_log'] = array();
$r = $hr->req('POST', '/uniform/stock-requests', $body);
$sent = end($GLOBALS['stock_log']);
check('HR ส่งเบิก → 201 issue STOCK ใบ WRQ-0077', $r['status'] === 201 && $r['json']['data']['source'] === 'STOCK'
    && $r['json']['data']['stock']['docNo'] === 'WRQ-0077' && $r['json']['data']['issuedBy'] === 'สมใจ ใจดี', json_encode($r['json']));
check('stock_hr ได้ requested_by_* จาก session', $sent['requested_by_name'] === 'สมใจ ใจดี' && $sent['requested_by_user'] === 'hr'
    && $sent['requested_by_emp_code'] === 'HL-0001' && is_int($sent['requested_by_user_id']) && $sent['start_date'] === $p['employee']['startDate'],
    json_encode($sent));
check('ส่งเบิกซ้ำ → 409 (รอคลังจ่าย)', S($hr->req('POST', '/uniform/stock-requests', $body)) === 409);
$sid2 = $r['json']['data']['id'];
$ref = $r['json']['data']['stock']['ref'];
$GLOBALS['stock_status'] = array($ref => array('doc_id' => 77, 'doc_no' => 'WRQ-0077', 'stage' => 'ISSUED', 'issued_at' => '2026-10-20 09:00:00',
    'received_at' => null, 'items' => array(array('product_id' => 31, 'product_name' => 'โปโล L', 'size' => 'L', 'qty' => 2, 'uniform' => true))));
$r = $hr->req('POST', '/uniform/stock-sync', array());
check('sync: คลังจ่ายแล้ว → ISSUED', $r['status'] === 200 && $r['json']['data']['changed'] === 1
    && db_value('SELECT stock_stage FROM uniform_issues WHERE id = ?', array($sid2)) === 'ISSUED');
check('ยกเลิกใบที่คลังจ่ายแล้วไม่ได้ → 409', S($hr->req('DELETE', '/uniform/issues/' . $sid2)) === 409);
$GLOBALS['stock_status'] = array($ref => array('doc_id' => 77, 'doc_no' => 'WRQ-0077', 'stage' => 'CANCELLED', 'cancel_note' => 'ของหมด', 'items' => array()));
$r = $hr->req('POST', '/uniform/stock-sync', array());
check('sync: คลังยกเลิก → ลบ issue สิทธิ์กลับเป็นค้างแจก', $r['json']['data']['changed'] === 1
    && db_value('SELECT id FROM uniform_issues WHERE id = ?', array($sid2)) === null);

section('ตัวกลาง /stock/bridge (หน้าเว็บโหมด mock)');
check('ไม่ login → 401', S($anon->req('POST', '/stock/bridge', array('action' => 'catalog'))) === 401);
check('Payroll ดูแคตตาล็อกได้', S($pay->req('POST', '/stock/bridge', array('action' => 'catalog'))) === 200);
check('Payroll ส่งเบิกไม่ได้ → 403', S($pay->req('POST', '/stock/bridge', array('action' => 'submit'))) === 403);
$GLOBALS['stock_log'] = array();
$r = $hr->req('POST', '/stock/bridge', array('action' => 'submit', 'employee_id' => 12, 'entitlement_key' => 'ANNUAL-2026',
    'employee_name' => 'สมชาย', 'requested_by_name' => 'คนปลอม', 'requested_by_user' => 'admin'));
$sent = end($GLOBALS['stock_log']);
check('ส่งต่อคำตอบสต็อก + ชื่อจาก session', $r['status'] === 200 && $r['json']['doc_no'] === 'WRQ-0077'
    && $sent['requested_by_name'] === 'สมใจ ใจดี' && $sent['requested_by_user'] === 'hr');
check('audit_log STOCK_REQUEST มี user_id', (int)db_value("SELECT COUNT(*) FROM audit_log WHERE entity = 'STOCK_REQUEST' AND user_id IS NOT NULL") === 1);

section('จำกัดการเดารหัสผ่าน');
$e = new Browser('10.9.9.9');
for ($i = 0; $i < 5; $i++) { $e->req('POST', '/auth/login', array('username' => 'payroll', 'password' => 'bad' . $i)); }
$r = $e->req('POST', '/auth/login', array('username' => 'payroll', 'password' => 'Payroll-1234'));
check('ผิด 5 ครั้ง → 429 แม้รหัสถูก + Retry-After', $r['status'] === 429 && isset($r['headers']['Retry-After']), json_encode($r['json']));
check('ผู้ใช้อื่นยัง login ได้', (new_browser_login('hr', 'Secret-1234')) === 200);
function new_browser_login($u, $p) { $b = new Browser('10.1.1.1'); $r = $b->req('POST', '/auth/login', array('username' => $u, 'password' => $p)); return $r['status']; }

echo "\nผ่าน " . $GLOBALS['pass'] . ' · ไม่ผ่าน ' . $GLOBALS['fail'] . "\n";
exit($GLOBALS['fail'] ? 1 : 0);
