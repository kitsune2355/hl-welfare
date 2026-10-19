<?php
declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use App\Application\Port\LoginAttemptRepository;
use PDO;

final class PdoLoginAttemptRepository implements LoginAttemptRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function record(string $username, string $ip, bool $succeeded, \DateTimeImmutable $at): void
    {
        $t = $at->format('Y-m-d H:i:s');
        $this->pdo->prepare("INSERT INTO auth_login_attempts (username, ip, succeeded, created_at, created_by, updated_at, updated_by)
            VALUES (?, ?, ?, ?, 'system', ?, 'system')")
            ->execute([mb_substr($username, 0, 50), $ip, $succeeded ? 1 : 0, $t, $t]);
    }

    public function failuresForUsername(string $username, \DateTimeImmutable $since): int
    {
        // นับเฉพาะครั้งที่ผิดหลังการเข้าสำเร็จครั้งล่าสุด
        $st = $this->pdo->prepare("SELECT COUNT(*) FROM auth_login_attempts a
            WHERE a.username = ? AND a.succeeded = 0 AND a.created_at >= ?
              AND a.id > COALESCE((SELECT MAX(s.id) FROM auth_login_attempts s
                                   WHERE s.username = a.username AND s.succeeded = 1), 0)");
        $st->execute([mb_substr($username, 0, 50), $since->format('Y-m-d H:i:s')]);
        return (int) $st->fetchColumn();
    }

    public function failuresForIp(string $ip, \DateTimeImmutable $since): int
    {
        $st = $this->pdo->prepare('SELECT COUNT(*) FROM auth_login_attempts WHERE ip = ? AND succeeded = 0 AND created_at >= ?');
        $st->execute([$ip, $since->format('Y-m-d H:i:s')]);
        return (int) $st->fetchColumn();
    }
}
