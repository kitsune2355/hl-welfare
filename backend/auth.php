<?php
/* ============================================================
 *  backend/auth.php — เข้าสู่ระบบ / session / refresh token (สเปกข้อ 10.9.1)
 *
 *  session  : cookie HLW_SESSION = ค่าสุ่ม 256 บิต · ตาราง auth_sessions เก็บเฉพาะ SHA-256
 *             หมดเมื่อไม่ใช้งาน session_idle_minutes หรือครบ session_absolute_hours
 *             ทุกคำขออ่านผู้ใช้ใหม่: ปิดบัญชี / เปลี่ยนรหัสผ่าน (session_version) → หลุดทันที
 *  จดจำฉัน : cookie HLW_REFRESH (path = <api>/auth) = ค่าสุ่ม 256 บิต · auth_refresh_tokens เก็บ SHA-256
 *             หมุนทุกครั้งที่ใช้ · ใช้ตัวที่หมุนแล้วซ้ำ = รั่ว → เพิกถอนทั้ง family
 *  cookie ทั้งสอง: HttpOnly + SameSite=Lax + Secure (config cookie_secure) — JS อ่านไม่ได้
 *
 *  PHP 5.2: ไม่ใช้ PHP session ในตัว (ใส่ SameSite / strict mode ไม่ได้) จึงจัดการ cookie + ตารางเอง
 * ============================================================ */

define('SESSION_COOKIE', 'HLW_SESSION');
define('REFRESH_COOKIE', 'HLW_REFRESH');

$GLOBALS['hlw_role_labels'] = array('SUPER_ADMIN' => 'ผู้ดูแลระบบ', 'HR_ADMIN' => 'HR Admin', 'HR_COMPANY' => 'HR บริษัท', 'PAYROLL' => 'Payroll',
    'STOCK' => 'ผู้ดูแลสต็อก', 'EXECUTIVE' => 'ผู้บริหาร');

/** ค่าตั้งการเข้าสู่ระบบ — ผู้ดูแลแก้ได้จาก admin.html (lib/settings.php) ไม่งั้นใช้ config.php */
function auth_cfg($key)
{
    return sys_setting($key);
}

function map_user($r)
{
    return array('id' => (int)$r['id'], 'username' => $r['username'], 'name' => $r['name'], 'role' => $r['role'],
        'empCode' => $r['emp_code'], 'isActive' => (bool)$r['is_active'], 'sessionVersion' => (int)$r['session_version'],
        'passwordHash' => $r['password_hash']);
}

/** AuthUser ที่ส่งให้หน้าเว็บ (ไม่มี hash) */
function user_public($u)
{
    $labels = $GLOBALS['hlw_role_labels'];
    return array('id' => $u['id'], 'username' => $u['username'], 'name' => $u['name'],
        'role' => isset($labels[$u['role']]) ? $labels[$u['role']] : $u['role'], 'roleCode' => $u['role'], 'empCode' => $u['empCode']);
}

function user_by_id($id)
{
    $r = db_one('SELECT * FROM users WHERE id = ?', array((int)$id));
    return $r ? map_user($r) : null;
}

function user_by_username($username)
{
    $r = db_one('SELECT * FROM users WHERE username = ?', array(strtolower(trim($username))));
    return $r ? map_user($r) : null;
}

function token_hash($raw)
{
    return hash('sha256', $raw);
}

function looks_like_token($raw)
{
    return (bool)preg_match('/^[0-9a-f]{64}$/', (string)$raw);
}

/* ---------- cookie ---------- */
function auth_secure($req)
{
    $v = auth_cfg('cookie_secure');
    return $v === 'auto' ? $req['https'] : (bool)$v;
}

/** path ของ session cookie = โฟลเดอร์ของหน้าเว็บ (เช่น /hl-welfare/web/) */
function session_cookie_path($req)
{
    return rtrim(dirname(dirname($req['base'])), '/\\') . '/';
}

/** path ของ refresh cookie = <api>/auth (เช่น /hl-welfare/web/api/index.php/auth) — ส่งไปเฉพาะ endpoint ของ auth */
function refresh_cookie_path($req)
{
    return $req['base'] . '/auth';
}

function set_session_cookie($req, $raw)
{
    http_set_cookie(SESSION_COOKIE, $raw, session_cookie_path($req), 0, auth_secure($req));
}

function clear_session_cookie($req)
{
    http_set_cookie(SESSION_COOKIE, '', session_cookie_path($req), time() - 3600, auth_secure($req));
}

function set_refresh_cookie($req, $raw)
{
    http_set_cookie(REFRESH_COOKIE, $raw, refresh_cookie_path($req), time() + auth_cfg('refresh_days') * 86400, auth_secure($req));
}

function clear_refresh_cookie($req)
{
    http_set_cookie(REFRESH_COOKIE, '', refresh_cookie_path($req), time() - 3600, auth_secure($req));
}

/* ---------- session ---------- */
/** ผู้ใช้ของคำขอนี้ หรือ null (ผลจำไว้ต่อคำขอ) */
function auth_user($req)
{
    if (array_key_exists('hlw_auth_user', $GLOBALS)) { return $GLOBALS['hlw_auth_user']; }
    $GLOBALS['hlw_auth_user'] = null;
    $GLOBALS['hlw_auth_session_id'] = 0;
    $raw = req_cookie($req, SESSION_COOKIE);
    if (!looks_like_token($raw)) { return null; }
    $s = db_one('SELECT * FROM auth_sessions WHERE token_hash = ?', array(token_hash($raw)));
    if (!$s || $s['revoked_at'] !== null) { return null; }
    $now = clock_time();
    if (strtotime($s['expires_at']) <= $now || $now - strtotime($s['last_seen_at']) > auth_cfg('session_idle_minutes') * 60) {
        return null;
    }
    $u = user_by_id($s['user_id']);
    if (!$u || !$u['isActive'] || $u['sessionVersion'] !== (int)$s['session_version']) { return null; }
    if ($now - strtotime($s['last_seen_at']) >= 60) {       // ไม่เขียนทุกคำขอ — ทุก 1 นาทีพอ
        db_exec('UPDATE auth_sessions SET last_seen_at = ?, updated_by = ? WHERE id = ?', array(db_now(), $u['username'], (int)$s['id']));
    }
    $GLOBALS['hlw_auth_user'] = $u;
    $GLOBALS['hlw_auth_session_id'] = (int)$s['id'];
    return $u;
}

function auth_require($req)
{
    $u = auth_user($req);
    if (!$u) { throw new ApiError('กรุณาเข้าสู่ระบบ', 401, null, 'UNAUTHENTICATED'); }
    return $u;
}

function auth_require_role($req, $roles)
{
    $u = auth_require($req);
    if (!in_array($u['role'], $roles, true)) { throw new ApiError('บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้', 403, null, 'FORBIDDEN'); }
    return $u;
}

/** เริ่ม session ใหม่ (login / refresh / เปลี่ยนรหัสผ่าน) — ค่าใหม่ทุกครั้ง กัน session fixation */
function auth_establish($req, $u)
{
    $old = req_cookie($req, SESSION_COOKIE);
    if (looks_like_token($old)) {
        db_exec('UPDATE auth_sessions SET revoked_at = ?, updated_by = ? WHERE token_hash = ? AND revoked_at IS NULL',
            array(db_now(), $u['username'], token_hash($old)));
    }
    $raw = sec_random_hex(32);
    $now = db_now();
    db_exec('INSERT INTO auth_sessions (user_id, token_hash, session_version, last_seen_at, expires_at, ip, user_agent,
             created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        array($u['id'], token_hash($raw), $u['sessionVersion'], $now,
            date('Y-m-d H:i:s', clock_time() + auth_cfg('session_absolute_hours') * 3600), $req['ip'], req_user_agent($req),
            $now, $u['username'], $u['username']));
    set_session_cookie($req, $raw);
    $GLOBALS['hlw_auth_user'] = $u;
}

function auth_destroy_session($req)
{
    $raw = req_cookie($req, SESSION_COOKIE);
    if (looks_like_token($raw)) {
        db_exec('UPDATE auth_sessions SET revoked_at = ?, updated_by = ? WHERE token_hash = ? AND revoked_at IS NULL',
            array(db_now(), 'system', token_hash($raw)));
    }
    clear_session_cookie($req);
    $GLOBALS['hlw_auth_user'] = null;
}

/* ---------- refresh token ---------- */
function refresh_issue($u, $familyId, $req)
{
    $raw = sec_random_hex(32);
    $now = db_now();
    $res = db_exec('INSERT INTO auth_refresh_tokens (user_id, token_hash, family_id, expires_at, created_ip, user_agent,
                    created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        array($u['id'], token_hash($raw), $familyId, date('Y-m-d H:i:s', clock_time() + auth_cfg('refresh_days') * 86400),
            $req['ip'], req_user_agent($req), $now, $u['username'], $u['username']));
    return array($raw, $res['id']);
}

function refresh_revoke_family($familyId, $reason, $by)
{
    $r = db_exec('UPDATE auth_refresh_tokens SET revoked_at = ?, revoked_reason = ?, updated_by = ?
                  WHERE family_id = ? AND revoked_at IS NULL', array(db_now(), $reason, $by, $familyId));
    return $r['affected'];
}

function refresh_revoke_raw($raw, $reason, $by)
{
    if (!looks_like_token($raw)) { return; }
    $row = db_one('SELECT family_id FROM auth_refresh_tokens WHERE token_hash = ?', array(token_hash($raw)));
    if ($row) { refresh_revoke_family($row['family_id'], $reason, $by); }
}

/** เพิกถอนทุกอย่างของผู้ใช้: refresh token + session ทุกเครื่อง */
function auth_revoke_all($userId, $reason, $by)
{
    $now = db_now();
    db_exec('UPDATE auth_refresh_tokens SET revoked_at = ?, revoked_reason = ?, updated_by = ? WHERE user_id = ? AND revoked_at IS NULL',
        array($now, $reason, $by, (int)$userId));
    db_exec('UPDATE auth_sessions SET revoked_at = ?, updated_by = ? WHERE user_id = ? AND revoked_at IS NULL',
        array($now, $by, (int)$userId));
}

/* ---------- รหัสผ่าน ---------- */
function assert_strong_password($password, $username)
{
    if (text_length($password) < 8) { throw new ApiError('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร', 422); }
    if (strlen($password) > 1024) { throw new ApiError('รหัสผ่านยาวเกินไป', 422); }
    if (strtolower($password) === strtolower($username)) { throw new ApiError('รหัสผ่านต้องไม่เหมือนชื่อผู้ใช้', 422); }
}

/** ตั้งรหัสผ่านใหม่ + session_version +1 + เพิกถอนทุก token/session (ผู้ใช้เปลี่ยนเอง หรือผู้ดูแลผ่าน bin/user.php) */
function auth_set_password($u, $password, $by)
{
    db_exec('UPDATE users SET password_hash = ?, session_version = session_version + 1, password_changed_at = ?, updated_by = ?
             WHERE id = ?', array(pw_hash($password), db_now(), $by, $u['id']));
    auth_revoke_all($u['id'], 'PASSWORD_CHANGE', $by);
}

/* ============================================================
 *  endpoint: /auth/*
 * ============================================================ */
define('BAD_LOGIN', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

/** POST /auth/login {username, password, remember} */
function api_auth_login($req, $params)
{
    $b = req_json($req);
    $username = strtolower(trim((string)arr_get($b, 'username', '')));
    $password = (string)arr_get($b, 'password', '');
    if ($username === '' || $password === '') { throw new ApiError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 422); }
    if (strlen($password) > 1024) { throw new ApiError(BAD_LOGIN, 401); }

    $window = auth_cfg('login_window_minutes');
    $since = date('Y-m-d H:i:s', clock_time() - $window * 60);
    $lastOk = (int)db_value('SELECT COALESCE(MAX(id), 0) FROM auth_login_attempts WHERE username = ? AND succeeded = 1', array($username));
    /* cleared_at = ผู้ดูแลปลดล็อกแล้ว (หน้า admin.html) — ไม่นับ */
    $userFails = (int)db_value('SELECT COUNT(*) FROM auth_login_attempts WHERE username = ? AND succeeded = 0 AND cleared_at IS NULL
        AND created_at >= ? AND id > ?', array($username, $since, $lastOk));
    $ipFails = (int)db_value('SELECT COUNT(*) FROM auth_login_attempts WHERE ip = ? AND succeeded = 0 AND cleared_at IS NULL AND created_at >= ?',
        array($req['ip'], $since));
    if ($userFails >= auth_cfg('login_max_fails_per_user') || $ipFails >= auth_cfg('login_max_fails_per_ip')) {
        throw new ApiError('ลองเข้าสู่ระบบผิดหลายครั้ง กรุณารอ ' . $window . ' นาทีแล้วลองใหม่', 429, null, 'RATE_LIMITED',
            array('Retry-After' => (string)($window * 60)));
    }

    $u = user_by_username($username);
    $ok = pw_verify($password, $u ? $u['passwordHash'] : pw_dummy_hash()) && $u && $u['isActive'];
    $now = db_now();
    db_exec("INSERT INTO auth_login_attempts (username, ip, succeeded, created_at, created_by, updated_by) VALUES (?, ?, ?, ?, 'system', 'system')",
        array(substr($username, 0, 50), $req['ip'], $ok ? 1 : 0, $now));
    if (!$ok) { throw new ApiError(BAD_LOGIN, 401); }

    if (pw_needs_rehash($u['passwordHash'])) {
        db_exec('UPDATE users SET password_hash = ?, updated_by = ? WHERE id = ?', array(pw_hash($password), $u['username'], $u['id']));
    }
    db_exec('UPDATE users SET last_login_at = ? WHERE id = ?', array($now, $u['id']));
    $old = req_cookie($req, REFRESH_COOKIE);
    if ($old !== '') { refresh_revoke_raw($old, 'LOGOUT', $u['username']); }

    auth_establish($req, $u);
    $remember = !empty($b['remember']);
    if ($remember) {
        $t = refresh_issue($u, sec_random_hex(16), $req);
        set_refresh_cookie($req, $t[0]);
    } elseif ($old !== '') {
        clear_refresh_cookie($req);
    }
    audit_write('USER', $u['id'], 'LOGIN', 'เข้าสู่ระบบ' . ($remember ? ' (จดจำฉัน)' : '') . ' จาก ' . $req['ip'], null, $u);
    return user_public($u);
}

/** POST /auth/refresh — หมุนโทเคน แล้วเริ่ม session ใหม่ */
function api_auth_refresh($req, $params)
{
    $raw = req_cookie($req, REFRESH_COOKIE);
    if (!looks_like_token($raw)) { return auth_refresh_fail($req, 'REFRESH_INVALID'); }
    db_begin();
    try {
        $row = db_one('SELECT * FROM auth_refresh_tokens WHERE token_hash = ? FOR UPDATE', array(token_hash($raw)));
        $fail = null;
        $u = null;
        if (!$row) {
            $fail = 'REFRESH_INVALID';
        } elseif ($row['revoked_at'] !== null) {
            if ($row['revoked_reason'] !== 'ROTATED') {
                $fail = 'REFRESH_INVALID';            // family ตายแล้ว (logout / เปลี่ยนรหัสผ่าน / ตรวจพบไปแล้ว)
            } elseif (clock_time() - strtotime($row['revoked_at']) <= auth_cfg('refresh_grace_seconds')) {
                db_commit();
                throw new ApiError('มีการต่ออายุจากอีกแท็บพร้อมกัน — ลองคำขอเดิมอีกครั้ง', 409, null, 'REFRESH_RACE');
            } else {
                $n = refresh_revoke_family($row['family_id'], 'REUSE', 'system');
                $victim = user_by_id($row['user_id']);
                audit_write('USER', $row['user_id'], 'TOKEN_REUSE', 'พบการใช้ refresh token ซ้ำจาก ' . $req['ip']
                    . ' — เพิกถอนการจดจำของอุปกรณ์นี้ (' . $n . ' รายการ)', null, null, $victim ? $victim['name'] : 'system');
                $fail = 'REFRESH_REUSED';
            }
        } elseif (strtotime($row['expires_at']) <= clock_time()) {
            $fail = 'REFRESH_EXPIRED';
        } else {
            $u = user_by_id($row['user_id']);
            if (!$u || !$u['isActive']) {
                refresh_revoke_family($row['family_id'], 'ADMIN', 'system');
                $fail = 'REFRESH_INVALID';
            }
        }
        if ($fail !== null) {
            db_commit();
            return auth_refresh_fail($req, $fail);
        }
        $t = refresh_issue($u, $row['family_id'], $req);
        db_exec("UPDATE auth_refresh_tokens SET revoked_at = ?, revoked_reason = 'ROTATED', replaced_by = ?, updated_by = ? WHERE id = ?",
            array(db_now(), $t[1], $u['username'], (int)$row['id']));
        db_commit();
    } catch (Exception $e) {
        db_rollback();
        throw $e;
    }
    auth_establish($req, $u);
    set_refresh_cookie($req, $t[0]);
    return user_public($u);
}

function auth_refresh_fail($req, $code)
{
    clear_refresh_cookie($req);
    auth_destroy_session($req);
    throw new ApiError('กรุณาเข้าสู่ระบบใหม่', 401, null, $code);
}

/** POST /auth/logout */
function api_auth_logout($req, $params)
{
    $u = auth_user($req);
    refresh_revoke_raw(req_cookie($req, REFRESH_COOKIE), 'LOGOUT', $u ? $u['username'] : 'system');
    if ($u) { audit_write('USER', $u['id'], 'LOGOUT', 'ออกจากระบบ จาก ' . $req['ip'], null, $u); }
    auth_destroy_session($req);
    clear_refresh_cookie($req);
    return http_no_content();
}

/** GET /auth/me */
function api_auth_me($req, $params)
{
    return user_public(auth_require($req));
}

/** POST /auth/password {currentPassword, newPassword} — ออกจากระบบทุกอุปกรณ์อื่น */
function api_auth_password($req, $params)
{
    $u = auth_require($req);
    $b = req_json($req);
    if (!pw_verify((string)arr_get($b, 'currentPassword', ''), $u['passwordHash'])) {
        throw new ApiError('รหัสผ่านปัจจุบันไม่ถูกต้อง', 422);
    }
    $new = (string)arr_get($b, 'newPassword', '');
    assert_strong_password($new, $u['username']);
    auth_set_password($u, $new, $u['username']);
    audit_write('USER', $u['id'], 'PASSWORD_CHANGE', 'เปลี่ยนรหัสผ่าน (ออกจากระบบทุกอุปกรณ์)', null, $u);
    $fresh = user_by_id($u['id']);
    auth_establish($req, $fresh);          // เครื่องนี้อยู่ต่อด้วย session ใหม่ (session_version ใหม่)
    clear_refresh_cookie($req);            // ทุกโทเคนถูกเพิกถอนแล้ว
    return user_public($fresh);
}
