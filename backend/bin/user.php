<?php
declare(strict_types=1);

/*
 * จัดการผู้ใช้จาก command line (ยังไม่มีหน้าจอจัดการผู้ใช้)
 *
 *   php bin/user.php create <username> "<ชื่อ-สกุล>" [ROLE] [EMP_CODE]   รหัสผ่านอ่านจาก stdin หรือถามบนจอ
 *   php bin/user.php password <username>                                 ตั้งรหัสผ่านใหม่ (เพิกถอนทุกโทเคน + session)
 *   php bin/user.php disable <username>                                  ปิดบัญชี (เพิกถอนทุกโทเคน)
 *
 * ROLE: HR_ADMIN (ค่าเริ่มต้น) | HR_COMPANY | PAYROLL | STOCK | EXECUTIVE
 */

use App\Application\AppError;
use App\Application\Service\AuthService;
use App\Container;
use App\Domain\User;
use App\Infrastructure\Database;

require dirname(__DIR__) . '/src/bootstrap.php';

if (PHP_SAPI !== 'cli') exit(1);

function readPassword(): string
{
    if (!stream_isatty(STDIN)) {
        return rtrim((string) fgets(STDIN), "\r\n");
    }
    fwrite(STDERR, 'รหัสผ่าน: ');
    if (PHP_OS_FAMILY !== 'Windows') system('stty -echo');
    $p = rtrim((string) fgets(STDIN), "\r\n");
    if (PHP_OS_FAMILY !== 'Windows') system('stty echo');
    fwrite(STDERR, PHP_EOL);
    return $p;
}

[$cmd, $username] = [$argv[1] ?? '', mb_strtolower(trim($argv[2] ?? ''))];
if ($username === '' || !in_array($cmd, ['create', 'password', 'disable'], true)) {
    fwrite(STDERR, "ดูวิธีใช้ที่หัวไฟล์ bin/user.php\n");
    exit(2);
}

$c = new Container();
$pdo = Database::pdo();
$auth = $c->authService();
$user = $c->users()->findByUsername($username);

try {
    if ($cmd === 'create') {
        if ($user) throw new AppError("มีผู้ใช้ $username อยู่แล้ว");
        $role = strtoupper($argv[4] ?? 'HR_ADMIN');
        if (!isset(User::ROLE_LABELS[$role])) throw new AppError("ไม่รู้จักบทบาท $role");
        $password = readPassword();
        AuthService::assertStrongPassword($password, $username);
        $pdo->prepare("INSERT INTO users (username, password_hash, name, emp_code, role, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, 'cli', 'cli')")
            ->execute([$username, password_hash($password, PASSWORD_DEFAULT), trim($argv[3] ?? $username), $argv[5] ?? null, $role]);
        echo "สร้างผู้ใช้ $username แล้ว\n";
    } elseif (!$user) {
        throw new AppError("ไม่พบผู้ใช้ $username");
    } elseif ($cmd === 'password') {
        $password = readPassword();
        AuthService::assertStrongPassword($password, $username);
        $auth->setPassword($user, $password, 'cli');
        echo "ตั้งรหัสผ่านใหม่ให้ $username แล้ว (ออกจากระบบทุกอุปกรณ์)\n";
    } else {
        $pdo->prepare("UPDATE users SET is_active = 0, session_version = session_version + 1, updated_by = 'cli' WHERE id = ?")
            ->execute([$user->id]);
        $pdo->prepare("UPDATE auth_refresh_tokens SET revoked_at = NOW(), revoked_reason = 'ADMIN', updated_by = 'cli'
            WHERE user_id = ? AND revoked_at IS NULL")->execute([$user->id]);
        echo "ปิดบัญชี $username แล้ว\n";
    }
} catch (AppError $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    exit(1);
}
