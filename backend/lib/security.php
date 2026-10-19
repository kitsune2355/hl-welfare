<?php
/* ============================================================
 *  backend/lib/security.php — สุ่มค่าลับ + hash รหัสผ่าน (PHP 5.2)
 *
 *  PHP 5.2 ไม่มี random_bytes / openssl_random_pseudo_bytes / password_hash
 *  และบน Windows ไม่มี crypt แบบ bcrypt (CRYPT_BLOWFISH = 0) จึงใช้:
 *
 *  สุ่ม:   /dev/urandom (Linux) · Windows ใช้ com_create_guid() (CoCreateGuid → CSPRNG ของ Windows,
 *          สุ่มจริง 122 บิตต่อ GUID) รวม 3 ตัว + ค่าอื่น แล้วกลั่นด้วย SHA-256 ต่อ 32 byte
 *          หาแหล่งสุ่มที่ปลอดภัยไม่ได้ = โยน error (ไม่ถอยไปใช้ mt_rand)
 *
 *  รหัสผ่าน: PBKDF2-HMAC-SHA256 (RFC 8018) salt สุ่ม 16 byte · 60,000 รอบ (~120 ms บนเครื่องพัฒนา)
 *          เก็บเป็น  pbkdf2_sha256$<รอบ>$<salt hex>$<hash hex>
 *          ขึ้น PHP ≥ 5.5 แล้วเปลี่ยนเป็น password_hash ได้: pw_verify รับรูปแบบนี้ต่อ แล้ว pw_needs_rehash บอกให้ hash ใหม่
 * ============================================================ */

define('PW_ITERATIONS', 60000);

function sec_random_bytes($n)
{
    $out = '';
    if (DIRECTORY_SEPARATOR === '/' && is_readable('/dev/urandom')) {
        $f = @fopen('/dev/urandom', 'rb');
        if ($f) {
            $out = fread($f, $n);
            fclose($f);
            if (strlen($out) === $n) { return $out; }
            $out = '';
        }
    }
    if (function_exists('com_create_guid')) {
        $counter = 0;
        while (strlen($out) < $n) {
            $seed = com_create_guid() . com_create_guid() . com_create_guid()
                  . uniqid('', true) . microtime() . getmypid() . ($counter++);
            $out .= hash('sha256', $seed, true);
        }
        return substr($out, 0, $n);
    }
    throw new Exception('ไม่พบแหล่งสุ่มที่ปลอดภัยบนเครื่องนี้');
}

/** ค่าสุ่ม hex (bytes × 2 ตัวอักษร) */
function sec_random_hex($bytes)
{
    return bin2hex(sec_random_bytes($bytes));
}

/** เทียบข้อความแบบเวลาคงที่ (กันเดาด้วยการจับเวลา) */
function sec_equals($a, $b)
{
    $a = (string)$a;
    $b = (string)$b;
    if (strlen($a) !== strlen($b)) { return false; }
    $r = 0;
    for ($i = 0; $i < strlen($a); $i++) { $r |= ord($a[$i]) ^ ord($b[$i]); }
    return $r === 0;
}

/** PBKDF2-HMAC-SHA256 คืนค่าแบบ binary ยาว $len byte */
function pbkdf2_sha256($password, $salt, $iterations, $len = 32)
{
    $blocks = (int)ceil($len / 32);
    $out = '';
    for ($i = 1; $i <= $blocks; $i++) {
        $u = hash_hmac('sha256', $salt . pack('N', $i), $password, true);
        $t = $u;
        for ($j = 1; $j < $iterations; $j++) {
            $u = hash_hmac('sha256', $u, $password, true);
            $t ^= $u;
        }
        $out .= $t;
    }
    return substr($out, 0, $len);
}

function pw_hash($password)
{
    $salt = sec_random_bytes(16);
    return 'pbkdf2_sha256$' . PW_ITERATIONS . '$' . bin2hex($salt) . '$'
         . bin2hex(pbkdf2_sha256($password, $salt, PW_ITERATIONS));
}

function pw_verify($password, $stored)
{
    $p = explode('$', (string)$stored);
    if (count($p) !== 4 || $p[0] !== 'pbkdf2_sha256' || (int)$p[1] < 1000) { return false; }
    $calc = bin2hex(pbkdf2_sha256($password, pack('H*', $p[2]), (int)$p[1]));
    return sec_equals($calc, $p[3]);
}

/** ต้อง hash ใหม่ไหม (จำนวนรอบเปลี่ยน) */
function pw_needs_rehash($stored)
{
    $p = explode('$', (string)$stored);
    return count($p) !== 4 || (int)$p[1] !== PW_ITERATIONS;
}

/** hash หลอกสำหรับเทียบเวลาเมื่อไม่พบชื่อผู้ใช้ (ไม่มีรหัสผ่านใดตรง) */
function pw_dummy_hash()
{
    return 'pbkdf2_sha256$' . PW_ITERATIONS . '$00000000000000000000000000000000$'
         . str_repeat('0', 64);
}
