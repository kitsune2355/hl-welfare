<?php
declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use App\Application\Port\RefreshTokenRepository;
use PDO;

final class PdoRefreshTokenRepository implements RefreshTokenRepository
{
    public function __construct(private readonly PDO $pdo) {}

    public function insert(int $userId, string $tokenHash, string $familyId, \DateTimeImmutable $expiresAt,
        string $ip, string $userAgent, string $by): int
    {
        $this->pdo->prepare('INSERT INTO auth_refresh_tokens
            (user_id, token_hash, family_id, expires_at, created_ip, user_agent, created_at, created_by, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), ?)')
            ->execute([$userId, $tokenHash, $familyId, $expiresAt->format('Y-m-d H:i:s'), $ip, $userAgent, $by, $by]);
        return (int) $this->pdo->lastInsertId();
    }

    public function findByHashForUpdate(string $tokenHash): ?array
    {
        $st = $this->pdo->prepare('SELECT * FROM auth_refresh_tokens WHERE token_hash = ? FOR UPDATE');
        $st->execute([$tokenHash]);
        return $st->fetch() ?: null;
    }

    public function markRotated(int $id, int $replacedBy, \DateTimeImmutable $at, string $by): void
    {
        $this->pdo->prepare("UPDATE auth_refresh_tokens SET revoked_at = ?, revoked_reason = 'ROTATED', replaced_by = ?,
            updated_at = NOW(), updated_by = ? WHERE id = ?")
            ->execute([$at->format('Y-m-d H:i:s'), $replacedBy, $by, $id]);
    }

    public function revokeFamily(string $familyId, string $reason, \DateTimeImmutable $at, string $by): int
    {
        $st = $this->pdo->prepare('UPDATE auth_refresh_tokens SET revoked_at = ?, revoked_reason = ?, updated_at = NOW(), updated_by = ?
            WHERE family_id = ? AND revoked_at IS NULL');
        $st->execute([$at->format('Y-m-d H:i:s'), $reason, $by, $familyId]);
        return $st->rowCount();
    }

    public function revokeAllForUser(int $userId, string $reason, \DateTimeImmutable $at, string $by): int
    {
        $st = $this->pdo->prepare('UPDATE auth_refresh_tokens SET revoked_at = ?, revoked_reason = ?, updated_at = NOW(), updated_by = ?
            WHERE user_id = ? AND revoked_at IS NULL');
        $st->execute([$at->format('Y-m-d H:i:s'), $reason, $by, $userId]);
        return $st->rowCount();
    }

    public function transaction(callable $fn): mixed
    {
        if ($this->pdo->inTransaction()) return $fn();
        $this->pdo->beginTransaction();
        try {
            $r = $fn();
            $this->pdo->commit();
            return $r;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
