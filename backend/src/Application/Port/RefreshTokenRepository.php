<?php
declare(strict_types=1);

namespace App\Application\Port;

/**
 * ตาราง auth_refresh_tokens — เก็บเฉพาะ SHA-256 ของโทเคน (ไม่เคยเก็บค่าจริง)
 * แถว: id, user_id, token_hash, family_id, expires_at, revoked_at, revoked_reason, replaced_by
 */
interface RefreshTokenRepository
{
    public function insert(int $userId, string $tokenHash, string $familyId, \DateTimeImmutable $expiresAt,
        string $ip, string $userAgent, string $by): int;

    /** อ่านพร้อมล็อกแถว (SELECT … FOR UPDATE) — เรียกภายใน transaction เท่านั้น */
    public function findByHashForUpdate(string $tokenHash): ?array;

    public function markRotated(int $id, int $replacedBy, \DateTimeImmutable $at, string $by): void;

    /** เพิกถอนทุกโทเคนที่ยังใช้ได้ใน family @return int จำนวนแถว */
    public function revokeFamily(string $familyId, string $reason, \DateTimeImmutable $at, string $by): int;

    /** เพิกถอนทุกโทเคนของผู้ใช้ (เปลี่ยนรหัสผ่าน / ปิดบัญชี) */
    public function revokeAllForUser(int $userId, string $reason, \DateTimeImmutable $at, string $by): int;

    /** @template T @param callable():T $fn @return T */
    public function transaction(callable $fn): mixed;
}
