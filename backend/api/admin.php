<?php
/* ============================================================
 *  backend/api/admin.php — หน้าผู้ดูแลระบบ (web/admin.html) · ตรวจสิทธิ์ทุก endpoint (backend/permissions.php):
 *    users.manage (ค่าเริ่มต้น HR Admin) · security.view · system.health · system.settings · audit.view
 *    ตั้งสิทธิ์ (/admin/permissions) = SUPER_ADMIN เท่านั้น · บัญชี SUPER_ADMIN แก้ได้เฉพาะ SUPER_ADMIN (admin_guard_target)
 *
 *    /admin/users          ผู้ใช้: สร้าง แก้ชื่อ/บทบาท/รหัสพนักงาน ปิด-เปิดบัญชี ตั้งรหัสผ่านใหม่ ออกจากระบบทุกอุปกรณ์
 *    /admin/sessions       session ที่ใช้อยู่ + อุปกรณ์ที่ "จดจำฉัน" (เพิกถอนได้)
 *    /admin/login-attempts ประวัติการเข้าสู่ระบบ · /admin/lockouts ที่ถูกล็อกอยู่ (ปลดล็อกได้)
 *    /admin/audit          บันทึกการใช้งานทุก entity (รวม USER / STOCK_REQUEST / SYSTEM)
 *    /admin/health         สถานะระบบ: ฐานข้อมูล migration ค่าตั้ง สต็อก Uniform ใบเบิกค้าง ข้อมูลที่ล้างได้
 *    /admin/cleanup        ล้าง session / refresh token / ประวัติ login เก่า (เหมือน bin/cleanup.php)
 *    /admin/settings       ค่าตั้งระบบ + การเชื่อมต่อสต็อก (lib/settings.php) · /admin/permissions สิทธิ์รายบทบาท (permissions.php)
 *
 *  กันผู้ดูแลล็อกตัวเอง: แก้บทบาท / ปิดบัญชี / ตั้งรหัสผ่าน / ออกจากระบบทุกอุปกรณ์ ของตัวเองไม่ได้
 *  (จึงมี SUPER_ADMIN ที่ใช้งานได้อย่างน้อย 1 คนเสมอ)
 * ============================================================ */


function admin_require($req)
{
    return auth_require_role($req, array('SUPER_ADMIN'));
}

/**
 * บัญชี SUPER_ADMIN แก้ได้เฉพาะ SUPER_ADMIN — ผู้จัดการผู้ใช้บทบาทอื่น (เช่น HR Admin ที่ได้สิทธิ์ users.manage) ห้ามแตะเด็ดขาด
 * (แก้ข้อมูล ปิดบัญชี ตั้งรหัสผ่าน ออกจากระบบ จบ session เลิกจดจำ ปลดล็อก และตั้งบทบาทใครให้เป็น SUPER_ADMIN)
 */
function admin_guard_target($me, $role)
{
    if ($role === 'SUPER_ADMIN' && $me['role'] !== 'SUPER_ADMIN') {
        throw new ApiError('บัญชีผู้ดูแลระบบสูงสุด (SUPER_ADMIN) แก้ไขได้เฉพาะผู้ดูแลระบบสูงสุดเท่านั้น', 403, null, 'PROTECTED');
    }
}

/** บทบาทที่ผู้ใช้นี้กำหนดให้คนอื่นได้ */
function admin_assignable_roles($me)
{
    $out = array();
    foreach ($GLOBALS['hlw_role_labels'] as $code => $label) {
        if ($code !== 'SUPER_ADMIN' || $me['role'] === 'SUPER_ADMIN') { $out[$code] = $label; }
    }
    return $out;
}

function admin_stamp($v)
{
    return $v === null ? null : stamp_from_db($v);
}

/* ============================================================
 *  ผู้ใช้
 * ============================================================ */
function admin_role_label($role)
{
    $labels = $GLOBALS['hlw_role_labels'];
    return isset($labels[$role]) ? $labels[$role] : $role;
}

/** array(user_id => n) */
function admin_count_by_user($sql, $args)
{
    $out = array();
    foreach (db_all($sql, $args) as $r) { $out[(int)$r['user_id']] = (int)$r['n']; }
    return $out;
}

function admin_live_session_sql()
{
    return 'FROM auth_sessions s JOIN users u ON u.id = s.user_id AND u.session_version = s.session_version AND u.is_active = 1
            WHERE s.revoked_at IS NULL AND s.expires_at > ? AND s.last_seen_at >= ?';
}

function admin_live_session_args()
{
    return array(db_now(), date('Y-m-d H:i:s', clock_time() - auth_cfg('session_idle_minutes') * 60));
}

function admin_map_user($r, $sessions, $devices, $locked)
{
    $id = (int)$r['id'];
    return array(
        'id' => $id,
        'username' => $r['username'],
        'name' => $r['name'],
        'role' => $r['role'],
        'roleLabel' => admin_role_label($r['role']),
        'empCode' => $r['emp_code'],
        'companyCode' => scoped_role($r['role']) ? $r['company_code'] : null,
        'isActive' => (bool)$r['is_active'],
        'lastLoginAt' => admin_stamp($r['last_login_at']),
        'passwordChangedAt' => admin_stamp($r['password_changed_at']),
        'createdAt' => admin_stamp($r['created_at']),
        'createdBy' => $r['created_by'],
        'activeSessions' => isset($sessions[$id]) ? $sessions[$id] : 0,
        'devices' => isset($devices[$id]) ? $devices[$id] : 0,
        'locked' => in_array($r['username'], $locked, true),
        'mustChangePassword' => !empty($r['must_change_password']),
    );
}

function admin_user_rows($where = '', $args = array())
{
    $sessions = admin_count_by_user('SELECT s.user_id, COUNT(*) AS n ' . admin_live_session_sql() . ' GROUP BY s.user_id',
        admin_live_session_args());
    $devices = admin_count_by_user('SELECT user_id, COUNT(DISTINCT family_id) AS n FROM auth_refresh_tokens
        WHERE revoked_at IS NULL AND expires_at > ? GROUP BY user_id', array(db_now()));
    $locked = array();
    foreach (admin_lockouts() as $l) {
        if ($l['kind'] === 'USER') { $locked[] = $l['key']; }
    }
    $out = array();
    foreach (db_all('SELECT * FROM users' . $where . ' ORDER BY is_active DESC, username', $args) as $r) {
        $out[] = admin_map_user($r, $sessions, $devices, $locked);
    }
    return $out;
}

function admin_user($id)
{
    $rows = admin_user_rows(' WHERE id = ?', array((int)$id));
    return count($rows) ? $rows[0] : null;
}

/** GET /admin/users */
function api_admin_users($req, $params)
{
    $me = cap_require($req, 'users.manage');
    $roles = array();
    foreach (admin_assignable_roles($me) as $code => $label) {
        $roles[] = array('value' => $code, 'label' => $label, 'scoped' => scoped_role($code));
    }
    $companies = array();
    foreach (repo_companies() as $c) {
        $companies[] = array('value' => $c['code'], 'label' => $c['code'] . ' · ' . (!empty($c['legalName']) ? $c['legalName'] : $c['name']));
    }
    return array('users' => admin_user_rows(), 'roles' => $roles, 'companies' => $companies);
}

/**
 * ตรวจ name / role / empCode / companyCode (ส่งมาเฉพาะที่จะแก้) → array ของคอลัมน์ · ผิด → 422 + errors
 * $current = ผู้ใช้เดิม (ตอนแก้) — HR บริษัทต้องมีบริษัท · บทบาทอื่นล้างบริษัทออก (เห็นทุกบริษัท)
 */
function admin_user_fields($b, $creating, $me, $current = null)
{
    $errors = array();
    $set = array();
    if ($creating || array_key_exists('name', $b)) {
        $name = trim((string)arr_get($b, 'name', ''));
        if ($name === '') { $errors['name'] = 'กรุณาระบุชื่อ-สกุล'; }
        elseif (text_length($name) > 150) { $errors['name'] = 'ชื่อยาวเกิน 150 ตัวอักษร'; }
        $set['name'] = $name;
    }
    if ($creating || array_key_exists('role', $b)) {
        $role = strtoupper((string)arr_get($b, 'role', ''));
        if (!isset($GLOBALS['hlw_role_labels'][$role])) { $errors['role'] = 'กรุณาเลือกบทบาท'; }
        else { admin_guard_target($me, $role); }
        $set['role'] = $role;
    }
    if ($creating || array_key_exists('empCode', $b)) {
        $code = trim((string)arr_get($b, 'empCode', ''));
        if (strlen($code) > 20) { $errors['empCode'] = 'รหัสพนักงานยาวเกิน 20 ตัวอักษร'; }
        $set['emp_code'] = $code === '' ? null : $code;
    }
    $role = isset($set['role']) ? $set['role'] : ($current ? $current['role'] : '');
    if (scoped_role($role)) {
        $company = array_key_exists('companyCode', $b) ? strtoupper(trim((string)$b['companyCode']))
            : ($current ? (string)$current['companyCode'] : '');
        if ($company === '' || !db_value('SELECT code FROM companies WHERE code = ?', array($company))) {
            $errors['companyCode'] = 'HR บริษัทต้องเลือกบริษัทที่ดูแล';
        }
        $set['company_code'] = $company;
    } elseif (isset($set['role'])) {
        $set['company_code'] = null;
    }
    if (count($errors)) { throw new ApiError('กรุณาตรวจสอบข้อมูล', 422, $errors); }
    return $set;
}

/** POST /admin/users {username, name, role, empCode, password?} — ไม่ใส่รหัส = 4123 · ผู้ใช้ใหม่ต้องเปลี่ยนรหัสเองก่อนใช้งาน */
function api_admin_user_create($req, $params)
{
    $me = cap_require($req, 'users.manage');
    $b = req_json($req);
    $username = strtolower(trim((string)arr_get($b, 'username', '')));
    if (!preg_match('/^[a-z0-9._-]{2,50}$/', $username)) {
        throw new ApiError('กรุณาตรวจสอบข้อมูล', 422, array('username' => 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - (2–50 ตัว)'));
    }
    $set = admin_user_fields($b, true, $me);
    $password = admin_given_password($b, $username);
    if (user_by_username($username)) {
        throw new ApiError('กรุณาตรวจสอบข้อมูล', 409, array('username' => 'มีชื่อผู้ใช้ ' . $username . ' อยู่แล้ว'));
    }
    db_begin();
    $res = db_exec('INSERT INTO users (username, password_hash, must_change_password, name, emp_code, role, company_code, created_at, created_by, updated_by)
                    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)',
        array($username, pw_hash($password), $set['name'], $set['emp_code'], $set['role'], isset($set['company_code']) ? $set['company_code'] : null,
            db_now(), $me['username'], $me['username']));
    audit_write('USER', $res['id'], 'CREATE', 'สร้างผู้ใช้ ' . $username . ' (' . $set['name'] . ') บทบาท ' . admin_role_label($set['role'])
        . (empty($set['company_code']) ? '' : ' บริษัท ' . $set['company_code']), null, $me);
    db_commit();
    return http_data(admin_user($res['id']), 201);
}

/**
 * รหัสผ่านที่ผู้ดูแลตั้งให้ ({password}) — ว่าง = รหัสตั้งต้น AUTH_DEFAULT_PASSWORD (4123)
 * รหัสตั้งต้นยกเว้นความยาวขั้นต่ำได้คนเดียว (ผู้ใช้ถูกบังคับเปลี่ยนเองตอนเข้าสู่ระบบ) · รหัสอื่นต้องผ่าน assert_strong_password
 */
function admin_given_password($b, $username)
{
    $password = (string)arr_get($b, 'password', '');
    if ($password === '' || $password === AUTH_DEFAULT_PASSWORD) { return AUTH_DEFAULT_PASSWORD; }
    try {
        assert_strong_password($password, $username);
    } catch (ApiError $e) {
        throw new ApiError('กรุณาตรวจสอบข้อมูล', 422, array('password' => $e->getMessage()));
    }
    return $password;
}

function admin_target($params)
{
    return find_or_404(user_by_id(param_id($params)), 'ไม่พบผู้ใช้');
}

function admin_not_self($me, $u, $message)
{
    if ($me['id'] === $u['id']) { throw new ApiError($message, 422, null, 'SELF'); }
}

/** PATCH /admin/users/{id} {name?, role?, empCode?, isActive?} */
function api_admin_user_update($req, $params)
{
    $me = cap_require($req, 'users.manage');
    $u = admin_target($params);
    admin_guard_target($me, $u['role']);
    $b = req_json($req);
    $set = admin_user_fields($b, false, $me, $u);
    $changes = array();
    if (isset($set['name']) && $set['name'] !== $u['name']) { $changes[] = 'ชื่อ ' . $u['name'] . ' → ' . $set['name']; }
    if (isset($set['role']) && $set['role'] !== $u['role']) {
        admin_not_self($me, $u, 'เปลี่ยนบทบาทของตัวเองไม่ได้ — ให้ผู้ดูแลระบบคนอื่นเปลี่ยนให้');
        $changes[] = 'บทบาท ' . admin_role_label($u['role']) . ' → ' . admin_role_label($set['role']);
    }
    if (array_key_exists('emp_code', $set) && $set['emp_code'] !== $u['empCode']) {
        $changes[] = 'รหัสพนักงาน ' . ($u['empCode'] === null ? '-' : $u['empCode']) . ' → ' . ($set['emp_code'] === null ? '-' : $set['emp_code']);
    }
    if (array_key_exists('company_code', $set) && $set['company_code'] !== $u['companyCode']) {
        $changes[] = 'บริษัทที่ดูแล ' . ($u['companyCode'] ? $u['companyCode'] : 'ทุกบริษัท') . ' → ' . ($set['company_code'] ? $set['company_code'] : 'ทุกบริษัท');
    }
    $active = array_key_exists('isActive', $b) ? (bool)$b['isActive'] : $u['isActive'];
    if ($active !== $u['isActive']) {
        if (!$active) { admin_not_self($me, $u, 'ปิดบัญชีของตัวเองไม่ได้'); }
        $changes[] = $active ? 'เปิดใช้บัญชี' : 'ปิดบัญชี (ออกจากระบบทุกอุปกรณ์)';
    }
    if (!count($changes)) { return admin_user($u['id']); }

    db_begin();
    $cols = array();
    $args = array();
    foreach ($set as $k => $v) { $cols[] = $k . ' = ?'; $args[] = $v; }
    if ($active !== $u['isActive']) {
        $cols[] = 'is_active = ?';
        $args[] = $active ? 1 : 0;
        if (!$active) { $cols[] = 'session_version = session_version + 1'; }
    }
    $cols[] = 'updated_by = ?';
    $args[] = $me['username'];
    $args[] = $u['id'];
    db_exec('UPDATE users SET ' . implode(', ', $cols) . ' WHERE id = ?', $args);
    if (!$active && $u['isActive']) { auth_revoke_all($u['id'], 'ADMIN', $me['username']); }
    audit_write('USER', $u['id'], 'UPDATE', 'แก้ไขผู้ใช้ ' . $u['username'] . ': ' . implode(' · ', $changes), null, $me);
    db_commit();
    return admin_user($u['id']);
}

/** POST /admin/users/{id}/password {password?} — ตั้งรหัสผ่านใหม่ (ว่าง = รีเซ็ตเป็น 4123) + ออกจากระบบทุกอุปกรณ์ + บังคับเปลี่ยนเอง */
function api_admin_user_password($req, $params)
{
    $me = cap_require($req, 'users.manage');
    $u = admin_target($params);
    admin_guard_target($me, $u['role']);
    admin_not_self($me, $u, 'รหัสผ่านของตัวเองให้เปลี่ยนด้วยรหัสผ่านปัจจุบัน (เมนูเปลี่ยนรหัสผ่าน)');
    $password = admin_given_password(req_json($req), $u['username']);
    db_begin();
    auth_set_password($u, $password, $me['username'], true);   // ผู้ใช้ต้องเปลี่ยนเองก่อนใช้งาน
    audit_write('USER', $u['id'], 'PASSWORD_RESET', ($password === AUTH_DEFAULT_PASSWORD ? 'รีเซ็ตรหัสผ่านเป็นรหัสตั้งต้น ให้ ' : 'ผู้ดูแลตั้งรหัสผ่านใหม่ให้ ')
        . $u['username'] . ' (ออกจากระบบทุกอุปกรณ์ · ต้องเปลี่ยนรหัสเองก่อนใช้งาน)', null, $me);
    db_commit();
    return admin_user($u['id']);
}

/** POST /admin/users/{id}/signout — เพิกถอนทุก session + จดจำฉัน ของผู้ใช้ */
function api_admin_user_signout($req, $params)
{
    $me = cap_require($req, 'users.manage');
    $u = admin_target($params);
    admin_guard_target($me, $u['role']);
    admin_not_self($me, $u, 'ออกจากระบบของตัวเองใช้ปุ่มออกจากระบบ');
    db_begin();
    db_exec('UPDATE users SET session_version = session_version + 1, updated_by = ? WHERE id = ?', array($me['username'], $u['id']));
    auth_revoke_all($u['id'], 'ADMIN', $me['username']);
    audit_write('USER', $u['id'], 'SIGNOUT_ALL', 'ผู้ดูแลสั่งให้ ' . $u['username'] . ' ออกจากระบบทุกอุปกรณ์', null, $me);
    db_commit();
    return admin_user($u['id']);
}

/* ============================================================
 *  session / อุปกรณ์ที่จดจำ
 * ============================================================ */
/** GET /admin/sessions → { sessions, devices } */
function api_admin_sessions($req, $params)
{
    cap_require($req, 'security.view');
    $current = isset($GLOBALS['hlw_auth_session_id']) ? $GLOBALS['hlw_auth_session_id'] : 0;
    $sessions = array();
    foreach (db_all('SELECT s.*, u.username, u.name, u.role ' . admin_live_session_sql() . ' ORDER BY s.last_seen_at DESC, s.id DESC',
        admin_live_session_args()) as $r) {
        $sessions[] = array('id' => (int)$r['id'], 'userId' => (int)$r['user_id'], 'username' => $r['username'], 'name' => $r['name'],
            'role' => $r['role'], 'roleLabel' => admin_role_label($r['role']), 'ip' => $r['ip'], 'userAgent' => $r['user_agent'],
            'createdAt' => admin_stamp($r['created_at']), 'lastSeenAt' => admin_stamp($r['last_seen_at']),
            'expiresAt' => admin_stamp($r['expires_at']), 'current' => (int)$r['id'] === $current);
    }
    $devices = array();
    foreach (db_all('SELECT t.family_id, t.user_id, t.created_ip, t.user_agent, t.created_at, t.expires_at, u.username, u.name, u.role,
            (SELECT MIN(f.created_at) FROM auth_refresh_tokens f WHERE f.family_id = t.family_id) AS first_at
            FROM auth_refresh_tokens t JOIN users u ON u.id = t.user_id
            WHERE t.revoked_at IS NULL AND t.expires_at > ? ORDER BY t.created_at DESC, t.id DESC', array(db_now())) as $r) {
        $devices[] = array('familyId' => $r['family_id'], 'userId' => (int)$r['user_id'], 'username' => $r['username'], 'name' => $r['name'],
            'role' => $r['role'], 'roleLabel' => admin_role_label($r['role']), 'ip' => $r['created_ip'], 'userAgent' => $r['user_agent'],
            'firstAt' => admin_stamp($r['first_at']), 'lastUsedAt' => admin_stamp($r['created_at']), 'expiresAt' => admin_stamp($r['expires_at']));
    }
    return array('sessions' => $sessions, 'devices' => $devices);
}

/** DELETE /admin/sessions/{id} — จบ session (เครื่องที่จดจำฉันไว้จะต่ออายุเองได้ — ใช้ signout เพื่อบังคับ) */
function api_admin_session_revoke($req, $params)
{
    $me = cap_require($req, 'security.view');
    $id = param_id($params);
    if (isset($GLOBALS['hlw_auth_session_id']) && $GLOBALS['hlw_auth_session_id'] === $id) {
        throw new ApiError('นี่คือ session ที่คุณใช้อยู่ — ใช้ปุ่มออกจากระบบแทน', 422, null, 'SELF');
    }
    $s = find_or_404(db_one('SELECT s.id, s.ip, u.id AS uid, u.username, u.role FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?',
        array($id)), 'ไม่พบ session');
    admin_guard_target($me, $s['role']);
    db_begin();
    db_exec('UPDATE auth_sessions SET revoked_at = ?, updated_by = ? WHERE id = ? AND revoked_at IS NULL', array(db_now(), $me['username'], $id));
    audit_write('USER', $s['uid'], 'SESSION_REVOKE', 'ผู้ดูแลจบ session ของ ' . $s['username'] . ' (IP ' . $s['ip'] . ')', null, $me);
    db_commit();
    return http_no_content();
}

/** DELETE /admin/devices/{familyId} — เลิกจดจำอุปกรณ์ (refresh token ทั้ง family) */
function api_admin_device_revoke($req, $params)
{
    $me = cap_require($req, 'security.view');
    $fid = isset($params['familyId']) ? (string)$params['familyId'] : '';
    if (!preg_match('/^[0-9a-f]{32}$/', $fid)) { throw new ApiError('ไม่พบอุปกรณ์', 404); }
    $t = find_or_404(db_one('SELECT t.created_ip, u.id AS uid, u.username, u.role FROM auth_refresh_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.family_id = ? ORDER BY t.id DESC LIMIT 1', array($fid)), 'ไม่พบอุปกรณ์');
    admin_guard_target($me, $t['role']);
    db_begin();
    $n = refresh_revoke_family($fid, 'ADMIN', $me['username']);
    audit_write('USER', $t['uid'], 'DEVICE_REVOKE', 'ผู้ดูแลเลิกจดจำอุปกรณ์ของ ' . $t['username'] . ' (IP ' . $t['created_ip'] . ', ' . $n . ' โทเคน)', null, $me);
    db_commit();
    return http_no_content();
}

/* ============================================================
 *  การเข้าสู่ระบบ / การล็อก
 * ============================================================ */
/** ชื่อผู้ใช้ / IP ที่ถูกล็อกอยู่ตอนนี้ (เกณฑ์เดียวกับ api_auth_login) */
function admin_lockouts()
{
    $window = auth_cfg('login_window_minutes');
    $since = date('Y-m-d H:i:s', clock_time() - $window * 60);
    $out = array();
    $users = db_all('SELECT a.username AS k, COUNT(*) AS n, MAX(a.created_at) AS last_at FROM auth_login_attempts a
        WHERE a.succeeded = 0 AND a.cleared_at IS NULL AND a.created_at >= ?
          AND a.id > (SELECT COALESCE(MAX(b.id), 0) FROM auth_login_attempts b WHERE b.username = a.username AND b.succeeded = 1)
        GROUP BY a.username HAVING COUNT(*) >= ? ORDER BY last_at DESC', array($since, (int)auth_cfg('login_max_fails_per_user')));
    $ips = db_all('SELECT ip AS k, COUNT(*) AS n, MAX(created_at) AS last_at FROM auth_login_attempts
        WHERE succeeded = 0 AND cleared_at IS NULL AND created_at >= ? GROUP BY ip HAVING COUNT(*) >= ? ORDER BY last_at DESC',
        array($since, (int)auth_cfg('login_max_fails_per_ip')));
    foreach (array('USER' => $users, 'IP' => $ips) as $kind => $rows) {
        foreach ($rows as $r) {
            $out[] = array('kind' => $kind, 'key' => $r['k'], 'fails' => (int)$r['n'], 'lastAt' => admin_stamp($r['last_at']),
                /* ปลดเองเมื่อครั้งที่ผิดพ้นช่วง — ช้าสุด = ครั้งล่าสุด + ช่วงเวลา */
                'untilAt' => stamp_from_db(date('Y-m-d H:i:s', strtotime($r['last_at']) + $window * 60)));
        }
    }
    return $out;
}

/** GET /admin/login-attempts?result=failed|ok&limit= → { attempts, lockouts, policy } */
function api_admin_login_attempts($req, $params)
{
    cap_require($req, 'security.view');
    $where = array();
    $result = req_query($req, 'result');
    if ($result === 'failed') { $where[] = 'a.succeeded = 0'; }
    if ($result === 'ok') { $where[] = 'a.succeeded = 1'; }
    $limit = max(1, min((int)req_query($req, 'limit', 500), 2000));
    $attempts = array();
    foreach (db_all('SELECT a.*, u.id AS uid FROM auth_login_attempts a LEFT JOIN users u ON u.username = a.username'
        . (count($where) ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY a.id DESC LIMIT ' . $limit) as $r) {
        $attempts[] = array('id' => (int)$r['id'], 'at' => admin_stamp($r['created_at']), 'username' => $r['username'], 'ip' => $r['ip'],
            'succeeded' => (bool)$r['succeeded'], 'cleared' => $r['cleared_at'] !== null, 'knownUser' => $r['uid'] !== null);
    }
    return array('attempts' => $attempts, 'lockouts' => admin_lockouts(), 'policy' => array(
        'maxFailsPerUser' => (int)auth_cfg('login_max_fails_per_user'), 'maxFailsPerIp' => (int)auth_cfg('login_max_fails_per_ip'),
        'windowMinutes' => (int)auth_cfg('login_window_minutes')));
}

/** POST /admin/lockouts/clear {kind: USER|IP, key} — ไม่นับครั้งที่ผิดในช่วงล็อก (เก็บประวัติไว้) */
function api_admin_lockout_clear($req, $params)
{
    $me = cap_require($req, 'security.view');
    $b = req_json($req);
    $kind = (string)arr_get($b, 'kind', '');
    $key = trim((string)arr_get($b, 'key', ''));
    if (!in_array($kind, array('USER', 'IP'), true) || $key === '') { throw new ApiError('ระบุสิ่งที่จะปลดล็อกไม่ถูกต้อง', 422); }
    $since = date('Y-m-d H:i:s', clock_time() - auth_cfg('login_window_minutes') * 60);
    db_begin();
    $r = db_exec('UPDATE auth_login_attempts SET cleared_at = ?, updated_by = ? WHERE succeeded = 0 AND cleared_at IS NULL AND created_at >= ? AND '
        . ($kind === 'USER' ? 'username = ?' : 'ip = ?'), array(db_now(), $me['username'], $since, $kind === 'USER' ? strtolower($key) : $key));
    if ($kind === 'USER') {
        $u = user_by_username($key);
        if ($u) { admin_guard_target($me, $u['role']); }
        audit_write('USER', $u ? $u['id'] : $key, 'UNLOCK', 'ปลดล็อกการเข้าสู่ระบบของชื่อผู้ใช้ ' . strtolower($key) . ' (' . $r['affected'] . ' ครั้งที่ผิด)', null, $me);
    } else {
        audit_write('SYSTEM', $key, 'UNLOCK', 'ปลดล็อกการเข้าสู่ระบบจาก IP ' . $key . ' (' . $r['affected'] . ' ครั้งที่ผิด)', null, $me);
    }
    db_commit();
    return array('cleared' => $r['affected']);
}

/* ============================================================
 *  บันทึกการใช้งาน
 * ============================================================ */
/** GET /admin/audit?entity=&action=&user=&q=&from=&to=&limit= → { rows, total, limit, facets } */
function api_admin_audit($req, $params)
{
    cap_require($req, 'audit.view');
    $where = array();
    $args = array();
    foreach (array('entity' => 'entity', 'action' => 'action', 'user' => 'user_name', 'entityId' => 'entity_id') as $q => $col) {
        if (req_query($req, $q) !== null) { $where[] = $col . ' = ?'; $args[] = (string)req_query($req, $q); }
    }
    if (req_query($req, 'q') !== null) {
        $like = '%' . str_replace(array('\\', '%', '_'), array('\\\\', '\\%', '\\_'), (string)req_query($req, 'q')) . '%';
        $where[] = '(summary LIKE ? OR entity_id LIKE ? OR user_name LIKE ?)';
        array_push($args, $like, $like, $like);
    }
    if (req_query($req, 'from') !== null) { $where[] = 'at >= ?'; $args[] = assert_iso_date(req_query($req, 'from')) . ' 00:00:00'; }
    if (req_query($req, 'to') !== null) { $where[] = 'at <= ?'; $args[] = assert_iso_date(req_query($req, 'to')) . ' 23:59:59'; }
    $sqlWhere = count($where) ? ' WHERE ' . implode(' AND ', $where) : '';
    $limit = max(1, min((int)req_query($req, 'limit', 1000), 5000));
    $rows = array();
    foreach (db_all('SELECT * FROM audit_log' . $sqlWhere . ' ORDER BY at DESC, id DESC LIMIT ' . $limit, $args) as $r) {
        $a = map_activity($r);
        $a['userId'] = int_or_null($r['user_id']);
        $rows[] = $a;
    }
    $facets = array();
    foreach (array('entities' => 'entity', 'actions' => 'action', 'users' => 'user_name') as $k => $col) {
        $facets[$k] = array();
        foreach (db_all('SELECT DISTINCT ' . $col . ' AS v FROM audit_log ORDER BY ' . $col) as $f) { $facets[$k][] = $f['v']; }
    }
    return array('rows' => $rows, 'total' => (int)db_value('SELECT COUNT(*) FROM audit_log' . $sqlWhere, $args), 'limit' => $limit,
        'facets' => $facets);
}

/* ============================================================
 *  สถานะระบบ
 * ============================================================ */
function admin_check($key, $label, $status, $detail)
{
    return array('key' => $key, 'label' => $label, 'status' => $status, 'detail' => $detail);
}

/** ชนิดคอลัมน์ หรือ null (MySQL 5.0 ใช้ SHOW ใน prepared statement ไม่ได้ → information_schema) */
function admin_column_type($table, $column)
{
    return db_value('SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        array($table, $column));
}

/** ping สต็อก Uniform: status ที่ไม่มี ref (อ่านอย่างเดียว) · ระบุ url/secret = ทดสอบค่าที่ยังไม่บันทึก */
function admin_stock_ping($url = null, $secret = null)
{
    $t = microtime(true);
    try {
        $res = stock_raw_to(array('action' => 'status', 'refs' => array()),
            $url === null ? sys_setting('stock_api_url') : $url, $secret === null ? sys_setting('stock_api_secret') : $secret);
        $ms = (int)round((microtime(true) - $t) * 1000);
        if ($res[0] === 401) { return admin_check('stock', 'เชื่อมต่อสต็อก Uniform', 'error', 'สต็อกไม่รับลายเซ็น (HTTP 401) — กุญแจไม่ตรงกับ stock_hr/config_ctrl/welfare_key.php หรือเวลาเครื่องไม่ตรงกัน'); }
        if (!is_array($res[1]) || empty($res[1]['ok'])) {
            $msg = is_array($res[1]) && isset($res[1]['message']) ? $res[1]['message'] : 'ตอบกลับผิดรูปแบบ';
            return admin_check('stock', 'เชื่อมต่อสต็อก Uniform', 'error', 'HTTP ' . $res[0] . ' — ' . $msg);
        }
        return admin_check('stock', 'เชื่อมต่อสต็อก Uniform', $ms > 3000 ? 'warn' : 'ok', 'ตอบใน ' . $ms . ' ms');
    } catch (ApiError $e) {
        return admin_check('stock', 'เชื่อมต่อสต็อก Uniform', 'error', $e->getMessage());
    }
}

/** ใบเบิกชุดฟอร์มในสต็อก: จำนวนตามขั้น + ที่ค้างนาน */
function admin_stock_monitor()
{
    $byStage = array('WAITING' => 0, 'REQUESTED' => 0, 'ISSUED' => 0, 'RECEIVED' => 0);
    foreach (db_all("SELECT stock_stage, COUNT(*) AS n FROM uniform_issues WHERE source = 'STOCK' GROUP BY stock_stage") as $r) {
        $byStage[(string)$r['stock_stage']] = (int)$r['n'];
    }
    $todayTs = strtotime(today_iso());
    $stuck = array();
    foreach (db_all("SELECT i.*, e.emp_code, e.first_name, e.last_name FROM uniform_issues i JOIN employees e ON e.id = i.employee_id
            WHERE i.source = 'STOCK' AND i.stock_stage IN ('WAITING', 'REQUESTED', 'ISSUED') ORDER BY i.issued_at, i.id") as $r) {
        $since = $r['stock_stage'] === 'ISSUED' && $r['stock_issued_at'] ? substr($r['stock_issued_at'], 0, 10) : $r['issued_at'];
        $days = (int)floor(($todayTs - strtotime($since)) / 86400);
        if ($days < sys_setting('stock_stuck_days')) { continue; }
        $stuck[] = array('id' => (int)$r['id'], 'docNo' => $r['stock_doc_no'], 'stage' => $r['stock_stage'], 'since' => $since, 'days' => $days,
            'employeeId' => (int)$r['employee_id'], 'empCode' => $r['emp_code'], 'employeeName' => $r['first_name'] . ' ' . $r['last_name'],
            'entitlementKey' => $r['entitlement_key'], 'requestedBy' => $r['issued_by_name']);
    }
    return array('byStage' => $byStage, 'stuck' => $stuck, 'stuckDays' => sys_setting('stock_stuck_days'));
}

/** GET /admin/health?ping=0 (ไม่ ping สต็อก) */
function api_admin_health($req, $params)
{
    cap_require($req, 'system.health');
    $cfg = $GLOBALS['hlw_config'];
    $checks = array();
    $mysql = (string)db_value('SELECT VERSION()');
    $checks[] = admin_check('db', 'ฐานข้อมูล', 'ok', $cfg['db_name'] . ' · MySQL ' . $mysql);
    $checks[] = admin_check('php', 'PHP', version_compare(PHP_VERSION, '7.0', '<') ? 'warn' : 'ok', 'PHP ' . PHP_VERSION
        . (version_compare(PHP_VERSION, '7.0', '<') ? ' — หมดอายุซัพพอร์ตแล้ว (ไม่มีแพตช์ความปลอดภัย) ควรวางแผนย้ายพร้อม stock_hr' : ''));
    $missing = array();
    foreach (array('mysqli', 'curl', 'hash', 'json', 'mbstring') as $ext) {
        if (!extension_loaded($ext)) { $missing[] = $ext; }
    }
    $checks[] = admin_check('ext', 'ส่วนขยาย PHP', count($missing) ? 'error' : 'ok',
        count($missing) ? 'ไม่มี ' . implode(', ', $missing) : 'mysqli, curl, hash, json, mbstring');

    $migrations = array(
        '004_super_admin' => strpos((string)admin_column_type('users', 'role'), 'SUPER_ADMIN') !== false,
        '005_admin_monitor' => admin_column_type('auth_login_attempts', 'cleared_at') !== null,
        '006_system_settings' => admin_column_type('system_settings', 'value') !== null,
        '007_uniform_quantities' => admin_column_type('uniform_rules', 'rule_key') !== null,
        '008_role_capabilities' => admin_column_type('role_capabilities', 'allowed') !== null,
        '009_must_change_password' => admin_column_type('users', 'must_change_password') !== null,
        '011_stock_waiting_stage' => strpos((string)admin_column_type('uniform_issues', 'stock_stage'), 'WAITING') !== false,
    );
    $pending = array();
    foreach ($migrations as $m => $ok) {
        if (!$ok) { $pending[] = $m; }
    }
    $checks[] = admin_check('migrations', 'Migration (backend/sql)', count($pending) ? 'error' : 'ok',
        count($pending) ? 'ยังไม่ได้รัน ' . implode(', ', $pending) : 'ครบถึง 011');

    $cfgIssues = array();
    $cfgError = false;
    if ($cfg['today_override'] !== '') { $cfgIssues[] = 'today_override = ' . $cfg['today_override'] . ' (ระบบจริงต้องว่าง)'; $cfgError = true; }
    if ($cfg['cookie_secure'] !== true) {
        $cfgIssues[] = 'cookie_secure = ' . var_export($cfg['cookie_secure'], true) . ($req['https'] ? '' : ' · เข้าผ่าน http') . ' (เซิร์ฟเวอร์จริงต้อง true + HTTPS)';
    }
    if (sys_setting('stock_api_url') === '' || sys_setting('stock_api_secret') === '') { $cfgIssues[] = 'ยังไม่ได้ตั้ง URL / กุญแจ ของสต็อก (แท็บตั้งค่าระบบ)'; $cfgError = true; }
    elseif (strlen(sys_setting('stock_api_secret')) < 32) { $cfgIssues[] = 'stock_api_secret สั้นกว่า 32 ตัว'; }
    $checks[] = admin_check('config', 'ค่าตั้ง (backend/config.php)', $cfgError ? 'error' : (count($cfgIssues) ? 'warn' : 'ok'),
        count($cfgIssues) ? implode(' · ', $cfgIssues) : 'ครบ');

    if (req_query($req, 'ping') !== '0') { $checks[] = admin_stock_ping(); }

    $stock = admin_stock_monitor();
    $checks[] = admin_check('stock_stuck', 'ใบเบิกชุดฟอร์มค้าง', count($stock['stuck']) ? 'warn' : 'ok', count($stock['stuck'])
        ? count($stock['stuck']) . ' ใบค้างในขั้นเดิมเกิน ' . sys_setting('stock_stuck_days') . ' วัน' : 'ไม่มีใบค้างเกิน ' . sys_setting('stock_stuck_days') . ' วัน');

    $locks = $migrations['005_admin_monitor'] ? admin_lockouts() : array();
    $checks[] = admin_check('lockouts', 'บัญชี / IP ที่ถูกล็อก', count($locks) ? 'warn' : 'ok', count($locks) ? count($locks) . ' รายการ' : 'ไม่มี');
    $reuse = (int)db_value("SELECT COUNT(*) FROM audit_log WHERE action = 'TOKEN_REUSE' AND at >= ?",
        array(date('Y-m-d H:i:s', clock_time() - 7 * 86400)));
    $checks[] = admin_check('token_reuse', 'ใช้ refresh token ซ้ำ (7 วัน)', $reuse ? 'warn' : 'ok',
        $reuse ? $reuse . ' ครั้ง — อาจมีคนได้ cookie ไป ดูบันทึกการใช้งาน (TOKEN_REUSE)' : 'ไม่พบ');
    $admins = (int)db_value("SELECT COUNT(*) FROM users WHERE role = 'SUPER_ADMIN' AND is_active = 1");
    $checks[] = admin_check('admins', 'ผู้ดูแลระบบที่ใช้งานได้', $admins < 2 ? 'warn' : 'ok',
        $admins . ' คน' . ($admins < 2 ? ' — ควรมีอย่างน้อย 2 คน กันลืมรหัสผ่าน' : ''));

    $tables = array();
    foreach (array('users', 'employees', 'sites', 'uniform_issues', 'insurance_batches', 'insurer_forms', 'audit_log',
        'auth_sessions', 'auth_refresh_tokens', 'auth_login_attempts') as $t) {
        $tables[] = array('name' => $t, 'rows' => (int)db_value('SELECT COUNT(*) FROM `' . $t . '`'));
    }
    $last = db_one("SELECT at, user_name, summary FROM audit_log WHERE entity = 'SYSTEM' AND action = 'CLEANUP' ORDER BY id DESC LIMIT 1");
    $days = admin_cleanup_days(sys_setting('cleanup_days'));
    return array(
        'checks' => $checks,
        'info' => array('php' => PHP_VERSION, 'mysql' => $mysql, 'db' => $cfg['db_name'], 'serverTime' => now_stamp(),
            'timezone' => $cfg['timezone'], 'today' => today_iso(), 'sessionIdleMinutes' => (int)sys_setting('session_idle_minutes'),
            'sessionAbsoluteHours' => (int)sys_setting('session_absolute_hours'), 'refreshDays' => (int)sys_setting('refresh_days')),
        'tables' => $tables,
        'stock' => $stock,
        'cleanup' => array('days' => $days, 'minDays' => admin_cleanup_days(0), 'eligible' => admin_cleanup_counts(admin_cleanup_cutoff($days)),
            'lastRunAt' => $last ? admin_stamp($last['at']) : null, 'lastRunBy' => $last ? $last['user_name'] : null,
            'lastSummary' => $last ? $last['summary'] : null),
    );
}

/* ============================================================
 *  ล้างข้อมูลเก่า (หน้า admin + bin/cleanup.php)
 *  ลบ: session ที่หมด/ถูกเพิกถอนก่อน cutoff · refresh token ทั้ง family ที่ใช้ไม่ได้แล้วก่อน cutoff · ประวัติ login ก่อน cutoff
 *  ไม่ลบ audit_log (ห้ามแก้/ลบ)
 * ============================================================ */
/** อย่างน้อย = อายุ refresh token (ตรวจการใช้โทเคนซ้ำได้ตลอดอายุ) */
function admin_cleanup_days($days)
{
    return max((int)$days, (int)auth_cfg('refresh_days'));
}

function admin_cleanup_cutoff($days)
{
    return date('Y-m-d H:i:s', clock_time() - $days * 86400);
}

function admin_dead_families($cutoff)
{
    $out = array();
    foreach (db_all('SELECT family_id FROM auth_refresh_tokens GROUP BY family_id HAVING MAX(COALESCE(revoked_at, expires_at)) < ?',
        array($cutoff)) as $r) {
        $out[] = $r['family_id'];
    }
    return $out;
}

function admin_cleanup_counts($cutoff)
{
    $fams = admin_dead_families($cutoff);
    $tokens = 0;
    foreach (array_chunk($fams, 200) as $chunk) {
        $tokens += (int)db_value('SELECT COUNT(*) FROM auth_refresh_tokens WHERE family_id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')', $chunk);
    }
    return array(
        'sessions' => (int)db_value('SELECT COUNT(*) FROM auth_sessions WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR expires_at < ?',
            array($cutoff, $cutoff)),
        'tokens' => $tokens,
        'attempts' => (int)db_value('SELECT COUNT(*) FROM auth_login_attempts WHERE created_at < ?', array($cutoff)),
    );
}

/** @return array(sessions, tokens, attempts, days) ที่ลบ */
function admin_cleanup_run($days, $actor, $actorName = null)
{
    $days = admin_cleanup_days($days);
    $cutoff = admin_cleanup_cutoff($days);
    db_begin();
    try {
        $s = db_exec('DELETE FROM auth_sessions WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR expires_at < ?', array($cutoff, $cutoff));
        $tokens = 0;
        foreach (array_chunk(admin_dead_families($cutoff), 200) as $chunk) {
            $in = implode(',', array_fill(0, count($chunk), '?'));
            /* replaced_by ชี้ภายใน family เดียวกัน — ตัด FK ก่อนลบ */
            db_exec('UPDATE auth_refresh_tokens SET replaced_by = NULL WHERE family_id IN (' . $in . ')', $chunk);
            $r = db_exec('DELETE FROM auth_refresh_tokens WHERE family_id IN (' . $in . ')', $chunk);
            $tokens += $r['affected'];
        }
        $a = db_exec('DELETE FROM auth_login_attempts WHERE created_at < ?', array($cutoff));
        $out = array('sessions' => $s['affected'], 'tokens' => $tokens, 'attempts' => $a['affected'], 'days' => $days);
        audit_write('SYSTEM', 'cleanup', 'CLEANUP', 'ล้างข้อมูลเก่ากว่า ' . $days . ' วัน: session ' . $out['sessions'] . ' · refresh token '
            . $out['tokens'] . ' · ประวัติเข้าสู่ระบบ ' . $out['attempts'], null, $actor, $actorName);
        db_commit();
    } catch (Exception $e) {
        db_rollback();
        throw $e;
    }
    return $out;
}

/** POST /admin/cleanup {days} */
function api_admin_cleanup($req, $params)
{
    $me = cap_require($req, 'system.health');
    $days = (int)arr_get(req_json($req), 'days', sys_setting('cleanup_days'));
    if ($days < 1 || $days > 3650) { throw new ApiError('จำนวนวันต้องอยู่ระหว่าง 1–3650', 422); }
    return admin_cleanup_run($days, $me);
}

/* ============================================================
 *  ตั้งค่าระบบ (lib/settings.php) — ค่าในตาราง system_settings ทับ config.php
 * ============================================================ */
function admin_settings_table_ready()
{
    return admin_column_type('system_settings', 'value') !== null;
}

function admin_settings_view()
{
    $groups = array(
        'stock' => array('key' => 'stock', 'label' => 'การเชื่อมต่อสต็อก Uniform', 'items' => array()),
        'auth' => array('key' => 'auth', 'label' => 'การเข้าสู่ระบบ', 'items' => array()),
        'monitor' => array('key' => 'monitor', 'label' => 'การติดตามระบบ', 'items' => array()),
    );
    $ready = admin_settings_table_ready();
    $meta = array();
    if ($ready) {
        foreach (db_all('SELECT `key`, updated_at, updated_by FROM system_settings') as $r) { $meta[$r['key']] = $r; }
    }
    foreach (sys_setting_defs() as $k => $d) {
        $item = array('key' => $k, 'label' => $d['label'], 'type' => $d['type'], 'unit' => arr_get($d, 'unit', ''),
            'hint' => arr_get($d, 'hint', ''), 'min' => arr_get($d, 'min'), 'max' => arr_get($d, 'max'), 'source' => sys_setting_source($k),
            'updatedAt' => isset($meta[$k]) ? admin_stamp($meta[$k]['updated_at']) : null,
            'updatedBy' => isset($meta[$k]) ? $meta[$k]['updated_by'] : null);
        if ($d['type'] === 'secret') {
            $item['secret'] = sys_secret_info(sys_setting($k));       // ไม่ส่งค่าจริงกลับหน้าเว็บ
            $item['baseSecret'] = sys_secret_info(sys_setting_base($k));
        } else {
            $item['value'] = sys_setting($k);
            $item['base'] = sys_setting_base($k);
        }
        $groups[$d['group']]['items'][] = $item;
    }
    $cfg = $GLOBALS['hlw_config'];
    $fixed = array(
        array('label' => 'ฐานข้อมูล', 'value' => $cfg['db_user'] . '@' . $cfg['db_host'] . ':' . $cfg['db_port'] . ' / ' . $cfg['db_name']),
        array('label' => 'cookie_secure', 'value' => var_export($cfg['cookie_secure'], true)),
        array('label' => 'timezone', 'value' => $cfg['timezone']),
        array('label' => 'today_override', 'value' => $cfg['today_override'] === '' ? '(ว่าง)' : $cfg['today_override']),
        array('label' => 'refresh_grace_seconds', 'value' => (string)$cfg['refresh_grace_seconds']),
    );
    return array('ready' => $ready, 'groups' => array_values($groups), 'fixed' => $fixed);
}

/** GET /admin/settings */
function api_admin_settings($req, $params)
{
    cap_require($req, 'system.settings');
    return admin_settings_view();
}

function admin_setting_text($d, $v)
{
    return $d['type'] === 'int' ? $v . (isset($d['unit']) ? ' ' . $d['unit'] : '') : ($v === '' ? '(ว่าง)' : $v);
}

/** PUT /admin/settings {values: {key: value}, reset: [key]} — secret ว่าง = ไม่เปลี่ยน · reset = กลับไปใช้ config.php */
function api_admin_settings_save($req, $params)
{
    $me = cap_require($req, 'system.settings');
    if (!admin_settings_table_ready()) {
        throw new ApiError('ยังไม่ได้รัน migration backend/sql/006_system_settings.sql — แก้ค่าที่ backend/config.php แทน', 409, null, 'MIGRATION_MISSING');
    }
    $b = req_json($req);
    $defs = sys_setting_defs();
    $values = is_array(arr_get($b, 'values')) ? $b['values'] : array();
    $reset = is_array(arr_get($b, 'reset')) ? $b['reset'] : array();
    $errors = array();
    $write = array();
    foreach ($values as $k => $v) {
        if (!isset($defs[$k])) { $errors[$k] = 'แก้ค่านี้จากหน้าเว็บไม่ได้'; continue; }
        if ($defs[$k]['type'] === 'secret' && trim((string)$v) === '') { continue; }
        $err = null;
        $clean = sys_setting_validate($k, $v, $err);
        if ($err !== null) { $errors[$k] = $err; continue; }
        if ($clean !== (string)sys_setting($k) || sys_setting_source($k) !== 'db') { $write[$k] = $clean; }
    }
    foreach ($reset as $k) {
        if (!isset($defs[$k])) { $errors[(string)$k] = 'แก้ค่านี้จากหน้าเว็บไม่ได้'; }
        elseif (isset($write[$k])) { $errors[$k] = 'ส่งทั้งค่าใหม่และคืนค่าเดิมพร้อมกันไม่ได้'; }
    }
    if (count($errors)) { throw new ApiError('กรุณาตรวจสอบข้อมูล', 422, $errors); }

    $changes = array();
    db_begin();
    foreach ($write as $k => $v) {
        $d = $defs[$k];
        $changes[] = $d['type'] === 'secret' ? $d['label'] . ' เปลี่ยนใหม่ (…' . substr($v, -4) . ')'
            : $d['label'] . ' ' . admin_setting_text($d, (string)sys_setting($k)) . ' → ' . admin_setting_text($d, $v);
        db_exec('INSERT INTO system_settings (`key`, `value`, created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_by = VALUES(updated_by)',
            array($k, $v, db_now(), $me['username'], $me['username']));
    }
    foreach ($reset as $k) {
        $r = db_exec('DELETE FROM system_settings WHERE `key` = ?', array($k));
        if ($r['affected']) { $changes[] = $defs[$k]['label'] . ' กลับไปใช้ค่าใน config.php'; }
    }
    if (count($changes)) { audit_write('SYSTEM', 'settings', 'SETTINGS', 'ตั้งค่าระบบ: ' . implode(' · ', $changes), null, $me); }
    db_commit();
    sys_settings_reset_cache();
    $out = admin_settings_view();
    $out['changed'] = count($changes);
    return $out;
}

/** POST /admin/stock/test {url?, secret?} — ทดสอบค่าใหม่ก่อนบันทึก (ไม่ส่ง = ใช้ค่าที่บันทึกไว้) */
function api_admin_stock_test($req, $params)
{
    cap_require($req, 'system.settings');
    $b = req_json($req);
    $url = trim((string)arr_get($b, 'url', ''));
    $secret = trim((string)arr_get($b, 'secret', ''));
    $errors = array();
    foreach (array('stock_api_url' => $url, 'stock_api_secret' => $secret) as $k => $v) {
        if ($v === '') { continue; }
        $err = null;
        sys_setting_validate($k, $v, $err);
        if ($err !== null) { $errors[$k] = $err; }
    }
    if (count($errors)) { throw new ApiError('กรุณาตรวจสอบข้อมูล', 422, $errors); }
    $c = admin_stock_ping($url === '' ? null : $url, $secret === '' ? null : $secret);
    return array('ok' => $c['status'] !== 'error', 'status' => $c['status'], 'detail' => $c['detail'],
        'url' => $url === '' ? sys_setting('stock_api_url') : $url, 'usedSavedSecret' => $secret === '');
}

/* ============================================================
 *  สิทธิ์การใช้งาน (permissions.php) — ตาราง role_capabilities ทับค่าเริ่มต้นในโค้ด
 * ============================================================ */
function admin_perm_view()
{
    $ready = admin_column_type('role_capabilities', 'allowed') !== null;
    $caps = array();
    foreach (perm_defs() as $key => $d) {
        $allowed = array();
        foreach (perm_roles() as $role => $label) {
            if (cap_allowed($role, $key)) { $allowed[] = $role; }
        }
        $locked = array();
        if (!empty($d['allCompanies'])) {
            foreach (perm_roles() as $role => $label) {
                if (scoped_role($role)) { $locked[] = $role; }
            }
        }
        $defaults = array();
        foreach ($d['roles'] as $role) {
            if (!in_array($role, $locked, true)) { $defaults[] = $role; }
        }
        $caps[] = array('key' => $key, 'group' => $d['group'], 'kind' => $d['kind'], 'label' => $d['label'],
            'page' => arr_get($d, 'page'), 'defaultRoles' => $defaults, 'roles' => $allowed, 'lockedRoles' => $locked);
    }
    $roles = array();
    foreach (perm_roles() as $code => $label) {
        $roles[] = array('value' => $code, 'label' => $label,
            'users' => (int)db_value('SELECT COUNT(*) FROM users WHERE role = ? AND is_active = 1', array($code)));
    }
    $last = $ready ? db_one('SELECT MAX(updated_at) AS at FROM role_capabilities') : null;
    return array('ready' => $ready, 'caps' => $caps, 'roles' => $roles,
        'updatedAt' => $last && $last['at'] ? admin_stamp($last['at']) : null);
}

/** GET /admin/permissions */
function api_admin_permissions($req, $params)
{
    admin_require($req);
    return admin_perm_view();
}

/** PUT /admin/permissions {matrix: {capability: [role, …]}} — capability ที่ไม่ส่งมา = ไม่เปลี่ยน */
function api_admin_permissions_save($req, $params)
{
    $me = admin_require($req);
    if (admin_column_type('role_capabilities', 'allowed') === null) {
        throw new ApiError('ยังไม่ได้รัน migration backend/sql/008_role_capabilities.sql', 409, null, 'MIGRATION_MISSING');
    }
    $matrix = arr_get(req_json($req), 'matrix');
    if (!is_array($matrix)) { throw new ApiError('ข้อมูลสิทธิ์ไม่ถูกต้อง', 422); }
    $defs = perm_defs();
    $roles = perm_roles();
    $errors = array();
    foreach ($matrix as $cap => $list) {
        if (!isset($defs[$cap])) { $errors[$cap] = 'ไม่รู้จักสิทธิ์นี้'; continue; }
        if (!is_array($list)) { $errors[$cap] = 'ต้องเป็นรายการบทบาท'; continue; }
        foreach ($list as $role) {
            if (!isset($roles[$role])) { $errors[$cap] = 'ไม่รู้จักบทบาท ' . $role; }
        }
    }
    if (count($errors)) { throw new ApiError('กรุณาตรวจสอบข้อมูล', 422, $errors); }

    $changes = array();
    db_begin();
    foreach ($matrix as $cap => $list) {
        $on = array();
        $off = array();
        foreach ($roles as $role => $label) {
            $allowed = in_array($role, $list, true) && !(scoped_role($role) && !empty($defs[$cap]['allCompanies']));
            if ($allowed !== cap_allowed($role, $cap)) {
                if ($allowed) { $on[] = $label; } else { $off[] = $label; }
            }
            db_exec('INSERT INTO role_capabilities (role, capability, allowed, created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), updated_by = VALUES(updated_by)',
                array($role, $cap, $allowed ? 1 : 0, db_now(), $me['username'], $me['username']));
        }
        if (count($on)) { $changes[] = $defs[$cap]['label'] . ': เพิ่ม ' . implode(', ', $on); }
        if (count($off)) { $changes[] = $defs[$cap]['label'] . ': เอาออก ' . implode(', ', $off); }
    }
    if (count($changes)) { audit_write('SYSTEM', 'permissions', 'PERMISSIONS', 'สิทธิ์การใช้งาน — ' . implode(' · ', $changes), null, $me); }
    db_commit();
    perm_reset_cache();
    $out = admin_perm_view();
    $out['changed'] = count($changes);
    return $out;
}
