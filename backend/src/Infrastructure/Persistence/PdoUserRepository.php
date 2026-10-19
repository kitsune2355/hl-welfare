<?php
declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use App\Application\Port\UserRepository;
use App\Domain\User;
use PDO;

final class PdoUserRepository implements UserRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function findById(int $id): ?User
    {
        return $this->one('SELECT * FROM users WHERE id = ?', [$id]);
    }

    public function findByUsername(string $username): ?User
    {
        return $this->one('SELECT * FROM users WHERE username = ?', [mb_strtolower(trim($username))]);
    }

    public function updatePasswordHash(int $userId, string $hash, string $by): void
    {
        $this->pdo->prepare('UPDATE users SET password_hash = ?, updated_at = NOW(), updated_by = ? WHERE id = ?')
            ->execute([$hash, $by, $userId]);
    }

    public function changePassword(int $userId, string $hash, string $by): void
    {
        $this->pdo->prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1,
            password_changed_at = NOW(), updated_at = NOW(), updated_by = ? WHERE id = ?')
            ->execute([$hash, $by, $userId]);
    }

    public function touchLastLogin(int $userId, \DateTimeImmutable $at): void
    {
        $this->pdo->prepare('UPDATE users SET last_login_at = ? WHERE id = ?')->execute([$at->format('Y-m-d H:i:s'), $userId]);
    }

    private function one(string $sql, array $args): ?User
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($args);
        $r = $st->fetch();
        return $r ? new User((int) $r['id'], $r['username'], $r['name'], $r['role'], $r['emp_code'],
            (bool) $r['is_active'], (int) $r['session_version'], $r['password_hash']) : null;
    }
}
