<?php
/* ============================================================
 *  backend/bin/user.php — จัดการผู้ใช้จาก command line (ยังไม่มีหน้าจอจัดการผู้ใช้)
 *
 *    php backend/bin/user.php create <username> "<ชื่อ-สกุล>" [ROLE] [EMP_CODE]
 *    php backend/bin/user.php password <username>      ตั้งรหัสผ่านใหม่ (ออกจากระบบทุกอุปกรณ์)
 *    php backend/bin/user.php disable <username>       ปิดบัญชี (ออกจากระบบทุกอุปกรณ์)
 *    php backend/bin/user.php list
 *
 *  รหัสผ่านอ่านจากบรรทัดแรกของ stdin เช่น  echo รหัสผ่าน | php backend/bin/user.php create hr "Somjai Jaidee"
 *  ชื่อภาษาไทย: PHP 5.2 บน Windows อ่านภาษาไทยจาก argument ไม่ได้ → ใส่ชื่อเป็นบรรทัดที่สองของ stdin (ไฟล์ UTF-8)
 *      php backend/bin/user.php create hr - HR_ADMIN HL-0001 < hr.txt      (hr.txt: บรรทัด 1 = รหัสผ่าน, บรรทัด 2 = ชื่อ)
 *  ROLE: HR_ADMIN (ค่าเริ่มต้น) | HR_COMPANY | PAYROLL | STOCK | EXECUTIVE
 *  username ควรตรงกับบัญชีใน stock_hr (tb_user.username) — สต็อกใช้ส่งลิงก์เซ็นรับให้ผู้ขอเบิก
 *  เขียนให้รองรับ PHP 5.2.6:  C:\AppServ\php5\php.exe backend\bin\user.php ...
 * ============================================================ */

if (PHP_SAPI !== 'cli') { exit(1); }
require dirname(dirname(__FILE__)) . '/bootstrap.php';

function out($s) { fwrite(STDOUT, $s . PHP_EOL); }
function fail($s) { fwrite(STDERR, $s . PHP_EOL); exit(1); }
function read_password() { return rtrim((string)fgets(STDIN), "\r\n"); }

$cmd = isset($argv[1]) ? $argv[1] : '';
$username = isset($argv[2]) ? strtolower(trim($argv[2])) : '';

try {
    if ($cmd === 'list') {
        foreach (db_all('SELECT username, name, role, emp_code, is_active, last_login_at FROM users ORDER BY username') as $r) {
            out(sprintf('%-15s %-8s %-11s %-10s %s  %s', $r['username'], $r['is_active'] ? 'ใช้งาน' : 'ปิด', $r['role'],
                (string)$r['emp_code'], $r['name'], (string)$r['last_login_at']));
        }
        exit(0);
    }
    if ($username === '' || !in_array($cmd, array('create', 'password', 'disable'))) { fail('ดูวิธีใช้ที่หัวไฟล์ backend/bin/user.php'); }
    $u = user_by_username($username);
    if ($cmd === 'create') {
        if ($u) { fail('มีผู้ใช้ ' . $username . ' อยู่แล้ว'); }
        if (!preg_match('/^[a-z0-9._-]{2,50}$/', $username)) { fail('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - (2–50 ตัว)'); }
        $role = strtoupper(isset($argv[4]) ? $argv[4] : 'HR_ADMIN');
        if (!isset($GLOBALS['hlw_role_labels'][$role])) { fail('ไม่รู้จักบทบาท ' . $role); }
        $password = read_password();
        assert_strong_password($password, $username);
        $name = (isset($argv[3]) && $argv[3] !== '-') ? trim($argv[3]) : trim(read_password());
        if ($name === '' || !preg_match('//u', $name)) {
            fail('ชื่อว่างหรืออ่านไม่ได้ — ชื่อภาษาไทยให้ส่งเป็นบรรทัดที่สองของ stdin (ดูหัวไฟล์)');
        }
        db_exec("INSERT INTO users (username, password_hash, name, emp_code, role, created_at, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, 'cli', 'cli')",
            array($username, pw_hash($password), $name, isset($argv[5]) ? $argv[5] : null, $role, db_now()));
        out('สร้างผู้ใช้ ' . $username . ' แล้ว');
    } elseif (!$u) {
        fail('ไม่พบผู้ใช้ ' . $username);
    } elseif ($cmd === 'password') {
        $password = read_password();
        assert_strong_password($password, $username);
        auth_set_password($u, $password, 'cli');
        out('ตั้งรหัสผ่านใหม่ให้ ' . $username . ' แล้ว (ออกจากระบบทุกอุปกรณ์)');
    } else {
        db_exec("UPDATE users SET is_active = 0, session_version = session_version + 1, updated_by = 'cli' WHERE id = ?", array($u['id']));
        auth_revoke_all($u['id'], 'ADMIN', 'cli');
        out('ปิดบัญชี ' . $username . ' แล้ว');
    }
} catch (ApiError $e) {
    fail($e->getMessage());
} catch (DbError $e) {
    fail('ฐานข้อมูล: ' . $e->getMessage());
}
