<?php
declare(strict_types=1);

/*
 * เทสต์การเข้าสู่ระบบแบบ end-to-end: เปิด PHP built-in server จริง + ฐานข้อมูลทดสอบ แล้วยิง HTTP
 *
 *   php backend/tests/auth_test.php
 *
 * ต้องมี MySQL/MariaDB ที่สร้างฐานข้อมูลได้ — ตั้งค่าด้วย env:
 *   TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=3306 TEST_DB_USER=root TEST_DB_PASS= TEST_DB_NAME=hlw_auth_test
 * ฐานข้อมูล TEST_DB_NAME ถูกลบแล้วสร้างใหม่ทุกครั้ง (ห้ามชี้ไปฐานข้อมูลจริง)
 */

$root = dirname(__DIR__, 2);
$php = PHP_BINARY;
$db = [
    'DB_HOST' => getenv('TEST_DB_HOST') ?: '127.0.0.1',
    'DB_PORT' => getenv('TEST_DB_PORT') ?: '3306',
    'DB_USER' => getenv('TEST_DB_USER') ?: 'root',
    'DB_PASS' => getenv('TEST_DB_PASS') ?: '',
    'DB_NAME' => getenv('TEST_DB_NAME') ?: 'hlw_auth_test',
];
if (!preg_match('/test/i', $db['DB_NAME'])) exit("TEST_DB_NAME ต้องมีคำว่า test\n");

// ---------- ฐานข้อมูล ----------
$pdo = new PDO("mysql:host={$db['DB_HOST']};port={$db['DB_PORT']};charset=utf8mb4", $db['DB_USER'], $db['DB_PASS'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdo->exec("DROP DATABASE IF EXISTS `{$db['DB_NAME']}`");
$pdo->exec("CREATE DATABASE `{$db['DB_NAME']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo->exec("USE `{$db['DB_NAME']}`");
$sql = preg_replace('/--[^\n]*/', '', file_get_contents("$root/backend/database/schema.sql"));
foreach (preg_split('/;\s*\n/', $sql) as $stmt) {
    $stmt = trim($stmt);
    if ($stmt === '' || preg_match('/^(CREATE DATABASE|USE)\b/i', $stmt)) continue;
    try {
        $pdo->exec($stmt);
    } catch (PDOException $e) {
        // insurance_batch_items ใช้ PK บน generated column ซึ่ง MariaDB ไม่รองรับ — ไม่เกี่ยวกับเทสต์นี้
        if (!str_contains($stmt, 'insurance_batch_items')) throw $e;
    }
}
$mkUser = $pdo->prepare('INSERT INTO users (username, password_hash, name, emp_code, role) VALUES (?, ?, ?, ?, ?)');
$mkUser->execute(['hr', password_hash('Secret-1234', PASSWORD_DEFAULT), 'สมใจ ใจดี', 'HL-0001', 'HR_ADMIN']);
$mkUser->execute(['payroll', password_hash('Payroll-1234', PASSWORD_DEFAULT), 'วิชัย บัญชีดี', null, 'PAYROLL']);
$mkUser->execute(['victim', password_hash('Victim-1234', PASSWORD_DEFAULT), 'ผู้ใช้ทดสอบ', null, 'HR_ADMIN']);

// ---------- เซิร์ฟเวอร์ ----------
$tmp = sys_get_temp_dir() . '/hlw-auth-test-' . getmypid();
@mkdir($tmp);
$stockLog = "$tmp/stock.log";
$port = 18000 + random_int(0, 999);
$stockPort = $port + 1000;
$env = array_merge(getenv(), $db, [
    'COOKIE_SECURE' => '0', 'APP_BASE_PATH' => '', 'REFRESH_GRACE_SECONDS' => '2',
    'STOCK_API_URL' => "http://127.0.0.1:$stockPort/", 'STOCK_API_SECRET' => 'test-secret', 'FAKE_STOCK_LOG' => $stockLog,
]);
$spawn = static function (array $cmd) use ($env, $tmp, $root) {
    $p = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['file', "$tmp/out.log", 'a'], 2 => ['file', "$tmp/err.log", 'a']],
        $pipes, $root, $env, ['bypass_shell' => true]);
    return $p;
};
$servers = [
    $spawn([$php, '-d', 'session.save_path=' . $tmp, '-S', "127.0.0.1:$port", '-t', "$root/web", "$root/backend/dev-router.php"]),
    $spawn([$php, '-S', "127.0.0.1:$stockPort", "$root/backend/tests/fake_stock_hr.php"]),
];
register_shutdown_function(static function () use ($servers) {
    foreach ($servers as $s) { proc_terminate($s); }
});
for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) usleep(100_000);

// ---------- HTTP client แบบเบราว์เซอร์ (มี cookie jar ของตัวเอง) ----------
final class Browser
{
    /** @var array<string,array{value:string,path:string,raw:string}> */
    public array $cookies = [];
    public function __construct(private string $base) {}

    /** @return array{status:int, body:mixed, headers:array<string,list<string>>} */
    public function req(string $method, string $path, ?array $json = null, array $headers = []): array
    {
        $send = [];
        foreach ($this->cookies as $name => $c) {
            if (str_starts_with($path, rtrim($c['path'], '/')) || $c['path'] === '/') $send[] = "$name={$c['value']}";
        }
        $h = ['Accept: application/json'];
        $custom = (bool) preg_grep('/^content-type:/i', $headers);
        if ($method !== 'GET' && !$custom) $h[] = 'Content-Type: application/json';
        if ($send) $h[] = 'Cookie: ' . implode('; ', $send);
        $resHeaders = [];
        $ch = curl_init($this->base . $path);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => array_merge($h, $headers),
            CURLOPT_HEADERFUNCTION => static function ($ch, $line) use (&$resHeaders) {
                if (str_contains($line, ':')) {
                    [$k, $v] = explode(':', $line, 2);
                    $resHeaders[strtolower(trim($k))][] = trim($v);
                }
                return strlen($line);
            },
        ]);
        if ($method !== 'GET') curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($json ?? []));
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        foreach ($resHeaders['set-cookie'] ?? [] as $sc) {
            [$pair] = explode(';', $sc, 2);
            [$name, $value] = explode('=', $pair, 2);
            preg_match('/;\s*path=([^;]+)/i', $sc, $m);
            $expired = preg_match('/expires=([^;]+)/i', $sc, $e) && strtotime($e[1]) < time();
            if ($value === '' || $value === 'deleted' || $expired) unset($this->cookies[$name]);
            else $this->cookies[$name] = ['value' => $value, 'path' => $m[1] ?? '/', 'raw' => $sc];
        }
        return ['status' => $status, 'body' => json_decode((string) $body, true), 'headers' => $resHeaders];
    }
}

$pass = 0;
$fail = 0;
function check(string $name, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    $ok ? $pass++ : $fail++;
    echo ($ok ? "  ✔ " : "  ✘ ") . $name . ($ok || $detail === '' ? '' : "  → $detail") . "\n";
}
$base = "http://127.0.0.1:$port";
$q = static fn (string $sql, array $a = []) => (function () use ($pdo, $sql, $a) { $s = $pdo->prepare($sql); $s->execute($a); return $s->fetchAll(); })();

echo "login / me\n";
$b = new Browser($base);
$r = $b->req('POST', '/api/auth/login', ['username' => 'hr', 'password' => 'wrong']);
check('รหัสผ่านผิด → 401', $r['status'] === 401 && $r['body']['error'] === 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', json_encode($r));
$r = $b->req('POST', '/api/auth/login', ['username' => 'nobody', 'password' => 'wrong']);
check('ไม่มีผู้ใช้ → 401 ข้อความเดียวกัน', $r['status'] === 401 && $r['body']['error'] === 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
check('ยังไม่ login → me 401', $b->req('GET', '/api/auth/me')['status'] === 401);
$r = $b->req('POST', '/api/auth/login', ['username' => 'HR', 'password' => 'Secret-1234']);
check('login สำเร็จ (ชื่อผู้ใช้ไม่สนตัวพิมพ์)', $r['status'] === 200 && $r['body']['data']['name'] === 'สมใจ ใจดี' && $r['body']['data']['role'] === 'HR Admin', json_encode($r['body']));
$sc = $b->cookies['HLW_SESSION']['raw'] ?? '';
check('session cookie HttpOnly + SameSite=Lax', stripos($sc, 'httponly') !== false && stripos($sc, 'samesite=lax') !== false, $sc);
check('ไม่เลือกจดจำฉัน → ไม่มี refresh cookie', !isset($b->cookies['HLW_REFRESH']));
$r = $b->req('GET', '/api/auth/me');
check('me → ผู้ใช้ปัจจุบัน', $r['status'] === 200 && $r['body']['data']['username'] === 'hr' && !isset($r['body']['data']['passwordHash']));

echo "CSRF\n";
$r = $b->req('POST', '/api/auth/logout', null, ['Content-Type: text/plain']);
check('POST ที่ไม่ใช่ JSON → 415', $r['status'] === 415);
$r = $b->req('POST', '/api/auth/logout', [], ['Origin: https://evil.example']);
check('Origin เว็บอื่น → 403', $r['status'] === 403);
check('ยังอยู่ในระบบหลังคำขอที่ถูกปฏิเสธ', $b->req('GET', '/api/auth/me')['status'] === 200);

echo "จดจำฉัน + หมุนโทเคน\n";
$a = new Browser($base);
$r = $a->req('POST', '/api/auth/login', ['username' => 'hr', 'password' => 'Secret-1234', 'remember' => true]);
$rc = $a->cookies['HLW_REFRESH'] ?? null;
check('มี refresh cookie path=/api/auth HttpOnly', $rc && $rc['path'] === '/api/auth' && stripos($rc['raw'], 'httponly') !== false
    && stripos($rc['raw'], 'samesite=lax') !== false, json_encode($rc));
$t1 = $rc['value'] ?? '';
check('โทเคน 256 บิต (hex 64 ตัว)', (bool) preg_match('/^[0-9a-f]{64}$/', $t1));
$rows = $q('SELECT * FROM auth_refresh_tokens');
check('ฐานข้อมูลเก็บเฉพาะ SHA-256', count($rows) === 1 && $rows[0]['token_hash'] === hash('sha256', $t1)
    && !str_contains(json_encode($rows), $t1));
check('อายุ ~30 วัน', abs(strtotime($rows[0]['expires_at']) - (time() + 30 * 86400)) < 120);
check('ไม่มี session → API ส่ง 401 (หน้าเว็บจะเรียก refresh)', (new Browser($base))->req('GET', '/api/auth/me')['status'] === 401);

$c = new Browser($base);                          // เบราว์เซอร์ที่เปิดใหม่: มีแค่ refresh cookie
$c->cookies['HLW_REFRESH'] = $rc;
$r = $c->req('POST', '/api/auth/refresh');
$t2 = $c->cookies['HLW_REFRESH']['value'] ?? '';
check('refresh → 200 + session ใหม่', $r['status'] === 200 && isset($c->cookies['HLW_SESSION']), json_encode($r['body']));
check('ได้โทเคนใหม่ (หมุน)', $t2 !== '' && $t2 !== $t1);
check('session ใหม่ใช้ได้', $c->req('GET', '/api/auth/me')['status'] === 200);
$old = $q('SELECT * FROM auth_refresh_tokens WHERE token_hash = ?', [hash('sha256', $t1)])[0];
$new = $q('SELECT * FROM auth_refresh_tokens WHERE token_hash = ?', [hash('sha256', $t2)])[0];
check('ตัวเก่า ROTATED → replaced_by ตัวใหม่ (family เดิม)', $old['revoked_reason'] === 'ROTATED'
    && (int) $old['replaced_by'] === (int) $new['id'] && $old['family_id'] === $new['family_id']);

$race = new Browser($base);
$race->cookies['HLW_REFRESH'] = $rc;               // ตัวเก่า ภายใน grace (2 วินาที)
$r = $race->req('POST', '/api/auth/refresh');
check('ใช้ตัวเก่าซ้ำทันที (แท็บแข่งกัน) → 409 REFRESH_RACE', $r['status'] === 409 && ($r['body']['code'] ?? '') === 'REFRESH_RACE', json_encode($r));
check('…และไม่เพิกถอน family', $q('SELECT revoked_at FROM auth_refresh_tokens WHERE id = ?', [$new['id']])[0]['revoked_at'] === null);

sleep(3);
$thief = new Browser($base);
$thief->cookies['HLW_REFRESH'] = $rc;
$r = $thief->req('POST', '/api/auth/refresh');
check('ใช้ตัวเก่าซ้ำหลัง grace → 401 REFRESH_REUSED', $r['status'] === 401 && ($r['body']['code'] ?? '') === 'REFRESH_REUSED', json_encode($r));
$fam = $q('SELECT revoked_reason FROM auth_refresh_tokens WHERE family_id = ? AND id = ?', [$new['family_id'], $new['id']]);
check('ทั้ง family ถูกเพิกถอน (REUSE)', ($fam[0]['revoked_reason'] ?? '') === 'REUSE');
$r = $c->req('POST', '/api/auth/refresh');
check('เจ้าของตัวจริงก็ต้อง login ใหม่', $r['status'] === 401);
check('audit_log บันทึก TOKEN_REUSE', count($q("SELECT id FROM audit_log WHERE action = 'TOKEN_REUSE'")) === 1);
check('refresh cookie ปลอม → 401', (function () use ($base) {
    $x = new Browser($base);
    $x->cookies['HLW_REFRESH'] = ['value' => str_repeat('a', 64), 'path' => '/api/auth', 'raw' => ''];
    return $x->req('POST', '/api/auth/refresh')['status'] === 401;
})());

echo "logout\n";
$d = new Browser($base);
$d->req('POST', '/api/auth/login', ['username' => 'hr', 'password' => 'Secret-1234', 'remember' => true]);
$dTok = $d->cookies['HLW_REFRESH'];
$r = $d->req('POST', '/api/auth/logout');
check('logout → 204 + ลบ cookie', $r['status'] === 204 && !isset($d->cookies['HLW_REFRESH']) && !isset($d->cookies['HLW_SESSION']));
check('โทเคนถูกเพิกถอน (LOGOUT)', $q('SELECT revoked_reason FROM auth_refresh_tokens WHERE token_hash = ?',
    [hash('sha256', $dTok['value'])])[0]['revoked_reason'] === 'LOGOUT');
$d->cookies['HLW_REFRESH'] = $dTok;
check('ใช้โทเคนหลัง logout ไม่ได้', $d->req('POST', '/api/auth/refresh')['status'] === 401);

echo "เปลี่ยนรหัสผ่าน\n";
$p1 = new Browser($base);
$p2 = new Browser($base);
$p1->req('POST', '/api/auth/login', ['username' => 'victim', 'password' => 'Victim-1234', 'remember' => true]);
$p2->req('POST', '/api/auth/login', ['username' => 'victim', 'password' => 'Victim-1234', 'remember' => true]);
$p2Tok = $p2->cookies['HLW_REFRESH'];
$r = $p1->req('POST', '/api/auth/password', ['currentPassword' => 'nope', 'newPassword' => 'Victim-5678']);
check('รหัสผ่านปัจจุบันผิด → 422', $r['status'] === 422);
$r = $p1->req('POST', '/api/auth/password', ['currentPassword' => 'Victim-1234', 'newPassword' => 'short']);
check('รหัสผ่านใหม่สั้นเกิน → 422', $r['status'] === 422);
$r = $p1->req('POST', '/api/auth/password', ['currentPassword' => 'Victim-1234', 'newPassword' => 'Victim-5678']);
check('เปลี่ยนรหัสผ่าน → 200', $r['status'] === 200, json_encode($r['body']));
check('ทุกโทเคนของผู้ใช้ถูกเพิกถอน', count($q("SELECT t.id FROM auth_refresh_tokens t JOIN users u ON u.id = t.user_id
    WHERE u.username = 'victim' AND t.revoked_at IS NULL")) === 0);
check('เครื่องที่เปลี่ยนยังอยู่ในระบบ', $p1->req('GET', '/api/auth/me')['status'] === 200);
check('อีกเครื่อง session หลุด', $p2->req('GET', '/api/auth/me')['status'] === 401);
$p2->cookies['HLW_REFRESH'] = $p2Tok;
check('อีกเครื่อง refresh ไม่ได้', $p2->req('POST', '/api/auth/refresh')['status'] === 401);
check('รหัสผ่านใหม่ใช้ login ได้', (new Browser($base))->req('POST', '/api/auth/login',
    ['username' => 'victim', 'password' => 'Victim-5678'])['status'] === 200);

echo "ปิดบัญชี\n";
$pdo->exec("UPDATE users SET is_active = 0 WHERE username = 'victim'");
check('session ของบัญชีที่ถูกปิดหลุดทันที', $p1->req('GET', '/api/auth/me')['status'] === 401);
check('login บัญชีที่ปิดไม่ได้', (new Browser($base))->req('POST', '/api/auth/login',
    ['username' => 'victim', 'password' => 'Victim-5678'])['status'] === 401);

echo "ตัวกลางระบบสต็อก (ผู้ขอเบิกจาก session)\n";
$anon = new Browser($base);
check('ไม่ login → 401', $anon->req('POST', '/api/stock/bridge', ['action' => 'catalog'])['status'] === 401);
$pay = new Browser($base);
$pay->req('POST', '/api/auth/login', ['username' => 'payroll', 'password' => 'Payroll-1234']);
check('Payroll ดูแคตตาล็อกได้', $pay->req('POST', '/api/stock/bridge', ['action' => 'catalog', 'items' => ['POLO_BLACK']])['status'] === 200);
check('Payroll ส่งเบิกไม่ได้ → 403', $pay->req('POST', '/api/stock/bridge', ['action' => 'submit'])['status'] === 403);
check('คำสั่งที่ไม่รู้จัก → 400', $b->req('POST', '/api/stock/bridge', ['action' => 'drop'])['status'] === 400);
@unlink($stockLog);
$r = $b->req('POST', '/api/stock/bridge', [
    'action' => 'submit', 'employee_id' => 12, 'employee_code' => 'PRO-0012', 'employee_name' => 'สมชาย ทดสอบ',
    'entitlement_key' => 'ANNUAL-2026', 'event' => 'ANNUAL', 'lines' => [['item_code' => 'POLO_BLACK', 'product_id' => 31, 'qty' => 2]],
    'requested_by_name' => 'คนปลอม', 'requested_by_user' => 'admin', 'requested_by_emp_code' => 'X',
]);
check('HR ส่งเบิก → 200 (ส่งต่อคำตอบของ stock_hr)', $r['status'] === 200 && ($r['body']['doc_no'] ?? '') === 'WRQ-0077', json_encode($r));
$sent = json_decode(trim((string) @file_get_contents($stockLog)), true) ?? [];
check('stock_hr ได้ชื่อจาก session ไม่ใช่จาก body', ($sent['requested_by_name'] ?? '') === 'สมใจ ใจดี'
    && ($sent['requested_by_user'] ?? '') === 'hr' && ($sent['requested_by_emp_code'] ?? '') === 'HL-0001'
    && is_int($sent['requested_by_user_id'] ?? null), json_encode($sent, JSON_UNESCAPED_UNICODE));
$log = $q("SELECT a.*, u.username FROM audit_log a JOIN users u ON u.id = a.user_id WHERE a.entity = 'STOCK_REQUEST'");
check('audit_log: STOCK_REQUEST มี user_id + ชื่อ', count($log) === 1 && $log[0]['username'] === 'hr'
    && $log[0]['user_name'] === 'สมใจ ใจดี' && $log[0]['entity_id'] === '12:ANNUAL-2026' && str_contains($log[0]['summary'], 'WRQ-0077'));
@unlink($stockLog);
$b->req('POST', '/api/stock/bridge', ['action' => 'cancel', 'ref' => '12:ANNUAL-2026', 'reason' => 'ผิดไซซ์', 'requested_by_name' => 'คนปลอม']);
$sent = json_decode(trim((string) @file_get_contents($stockLog)), true) ?? [];
check('ยกเลิก: ชื่อจาก session', ($sent['requested_by_name'] ?? '') === 'สมใจ ใจดี');

echo "จำกัดการเดารหัสผ่าน\n";
$e = new Browser($base);
for ($i = 0; $i < 5; $i++) $e->req('POST', '/api/auth/login', ['username' => 'payroll', 'password' => "bad$i"]);
$r = $e->req('POST', '/api/auth/login', ['username' => 'payroll', 'password' => 'Payroll-1234']);
check('ผิด 5 ครั้ง → 429 แม้รหัสถูก + Retry-After', $r['status'] === 429 && isset($r['headers']['retry-after']), json_encode($r['body']));
check('ผู้ใช้อื่นยัง login ได้', (new Browser($base))->req('POST', '/api/auth/login',
    ['username' => 'hr', 'password' => 'Secret-1234'])['status'] === 200);
check('audit_log: LOGIN มี user_id', count($q("SELECT id FROM audit_log WHERE action = 'LOGIN' AND user_id IS NOT NULL")) > 0);

$err = trim((string) @file_get_contents("$tmp/err.log"));
$phpErrors = array_filter(explode("\n", $err), static fn ($l) => preg_match('/PHP (Warning|Fatal|Notice|Deprecated)/', $l));
check('ไม่มี PHP warning/error ใน log ของเซิร์ฟเวอร์', !$phpErrors, implode("\n", array_slice($phpErrors, 0, 5)));

echo "\nผ่าน $pass · ไม่ผ่าน $fail\n";
exit($fail ? 1 : 0);
