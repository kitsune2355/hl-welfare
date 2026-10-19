<?php
declare(strict_types=1);

namespace App\Application\Service;

use App\Application\AppError;
use App\Application\Port\AuditLog;
use App\Application\Port\Clock;
use App\Application\Port\LoginAttemptRepository;
use App\Application\Port\RefreshTokenRepository;
use App\Application\Port\UserRepository;
use App\Domain\User;

/**
 * เข้าสู่ระบบ / ต่ออายุด้วย refresh token / ออกจากระบบ / เปลี่ยนรหัสผ่าน (สเปกข้อ 10.9.1)
 *
 * ไม่แตะ $_SESSION หรือ cookie — ชั้น Http (AuthController + SessionGuard) เป็นคนจัดการ
 * ที่นี่คืนค่า refresh token ตัวจริง (ส่งให้เบราว์เซอร์ครั้งเดียว) แต่เก็บลงฐานข้อมูลเฉพาะ SHA-256
 */
final class AuthService
{
    /** ใช้ password_verify กับ hash นี้เมื่อไม่พบผู้ใช้ เพื่อให้เวลาตอบเท่ากัน (เดาชื่อผู้ใช้จากเวลาไม่ได้) */
    private const DUMMY_HASH = '$2y$10$6GRKF9aIdwTPMDNVBnJUzuu.dwAuJ1Ybs16jc7Rmr3h22wTluEBWO';

    public const BAD_LOGIN = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';

    public function __construct(
        private readonly UserRepository $users,
        private readonly RefreshTokenRepository $tokens,
        private readonly LoginAttemptRepository $attempts,
        private readonly AuditLog $audit,
        private readonly Clock $clock,
        private readonly AuthConfig $config,
    ) {}

    /**
     * @param ?string $previousRefresh refresh token เดิมในเบราว์เซอร์ (ถ้ามี) — เพิกถอนทิ้งเสมอ
     * @return array{user: User, refreshToken: ?string}
     */
    public function login(string $username, string $password, bool $remember, string $ip, string $userAgent,
        ?string $previousRefresh = null): array
    {
        $username = mb_strtolower(trim($username));
        $now = $this->clock->now();
        if ($username === '' || $password === '') throw new AppError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 422);
        if (strlen($password) > 4096) throw new AppError(self::BAD_LOGIN, 401);

        $since = $now->modify("-{$this->config->loginWindowMinutes} minutes");
        if ($this->attempts->failuresForUsername($username, $since) >= $this->config->maxFailuresPerUsername
            || $this->attempts->failuresForIp($ip, $since) >= $this->config->maxFailuresPerIp) {
            throw new AppError(
                "ลองเข้าสู่ระบบผิดหลายครั้ง กรุณารอ {$this->config->loginWindowMinutes} นาทีแล้วลองใหม่",
                429, 'RATE_LIMITED', ['Retry-After' => (string) ($this->config->loginWindowMinutes * 60)]);
        }

        $user = $this->users->findByUsername($username);
        $ok = password_verify($password, $user?->passwordHash ?? self::DUMMY_HASH) && $user !== null && $user->isActive;
        $this->attempts->record($username, $ip, $ok, $now);
        if (!$ok) throw new AppError(self::BAD_LOGIN, 401);

        if (password_needs_rehash($user->passwordHash, PASSWORD_DEFAULT)) {
            $this->users->updatePasswordHash($user->id, password_hash($password, PASSWORD_DEFAULT), $user->username);
        }
        $this->users->touchLastLogin($user->id, $now);
        if ($previousRefresh) $this->revokeByRaw($previousRefresh, 'LOGOUT', $user->username);

        $raw = $remember ? $this->issue($user, bin2hex(random_bytes(16)), $ip, $userAgent) : null;
        $this->audit->write('USER', (string) $user->id, 'LOGIN',
            'เข้าสู่ระบบ' . ($remember ? ' (จดจำฉัน)' : '') . " จาก $ip", $user);
        return ['user' => $user, 'refreshToken' => $raw];
    }

    /**
     * หมุนโทเคน: ใช้ได้ครั้งเดียว ได้ตัวใหม่ใน family เดิม
     * ใช้ตัวที่ถูกหมุนไปแล้วซ้ำ = โทเคนรั่ว → เพิกถอนทั้ง family (ยกเว้นภายใน grace วินาทีแรก = แท็บแข่งกันต่ออายุ)
     * @return array{user: User, refreshToken: string}
     */
    public function refresh(string $raw, string $ip, string $userAgent): array
    {
        if (!self::looksLikeToken($raw)) throw new AppError('กรุณาเข้าสู่ระบบใหม่', 401, 'REFRESH_INVALID');
        $now = $this->clock->now();

        // คืนผลแทนการโยน error ใน transaction — การเพิกถอน family ต้อง commit ด้วย
        $result = $this->tokens->transaction(function () use ($raw, $ip, $userAgent, $now) {
            $row = $this->tokens->findByHashForUpdate(self::hash($raw));
            if ($row === null) return ['error' => 'REFRESH_INVALID'];

            if ($row['revoked_at'] !== null) {
                // ถูกเพิกถอนด้วยเหตุอื่น (logout / เปลี่ยนรหัสผ่าน / ตรวจพบไปแล้ว) — family ตายแล้ว ไม่ต้องแจ้งซ้ำ
                if ($row['revoked_reason'] !== 'ROTATED') return ['error' => 'REFRESH_INVALID'];
                $age = $now->getTimestamp() - (new \DateTimeImmutable($row['revoked_at']))->getTimestamp();
                if ($row['revoked_reason'] === 'ROTATED' && $age <= $this->config->refreshGraceSeconds) {
                    return ['error' => 'REFRESH_RACE'];
                }
                $n = $this->tokens->revokeFamily($row['family_id'], 'REUSE', $now, 'system');
                return ['error' => 'REFRESH_REUSED', 'userId' => (int) $row['user_id'], 'revoked' => $n];
            }
            if (new \DateTimeImmutable($row['expires_at']) <= $now) return ['error' => 'REFRESH_EXPIRED'];

            $user = $this->users->findById((int) $row['user_id']);
            if ($user === null || !$user->isActive) {
                $this->tokens->revokeFamily($row['family_id'], 'ADMIN', $now, 'system');
                return ['error' => 'REFRESH_INVALID'];
            }
            $next = bin2hex(random_bytes(32));
            $newId = $this->tokens->insert($user->id, self::hash($next), $row['family_id'],
                $now->modify("+{$this->config->refreshDays} days"), $ip, $userAgent, $user->username);
            $this->tokens->markRotated((int) $row['id'], $newId, $now, $user->username);
            return ['user' => $user, 'refreshToken' => $next];
        });

        if (isset($result['error'])) {
            if ($result['error'] === 'REFRESH_REUSED') {
                $victim = $this->users->findById($result['userId']);
                $this->audit->write('USER', (string) $result['userId'], 'TOKEN_REUSE',
                    "พบการใช้ refresh token ซ้ำจาก $ip — เพิกถอนการจดจำของอุปกรณ์นี้ ({$result['revoked']} รายการ)",
                    null, actorNameFallback: $victim?->name ?? 'system');
            }
            if ($result['error'] === 'REFRESH_RACE') {
                throw new AppError('มีการต่ออายุจากอีกแท็บพร้อมกัน — ลองคำขอเดิมอีกครั้ง', 409, 'REFRESH_RACE');
            }
            throw new AppError('กรุณาเข้าสู่ระบบใหม่', 401, $result['error']);
        }
        return $result;
    }

    /** ออกจากระบบ: เพิกถอน family ของโทเคนในเบราว์เซอร์นี้ */
    public function logout(?string $raw, ?User $user, string $ip): void
    {
        if ($raw) $this->revokeByRaw($raw, 'LOGOUT', $user?->username ?? 'system');
        if ($user) $this->audit->write('USER', (string) $user->id, 'LOGOUT', "ออกจากระบบ จาก $ip", $user);
    }

    /** เปลี่ยนรหัสผ่าน → เพิกถอนทุกโทเคน + session ทุกเครื่อง (session_version +1) */
    public function changePassword(User $user, string $current, string $new): User
    {
        if (!password_verify($current, $user->passwordHash)) throw new AppError('รหัสผ่านปัจจุบันไม่ถูกต้อง', 422);
        self::assertStrongPassword($new, $user->username);
        $this->setPassword($user, $new, $user->username);
        $this->audit->write('USER', (string) $user->id, 'PASSWORD_CHANGE', 'เปลี่ยนรหัสผ่าน (ออกจากระบบทุกอุปกรณ์)', $user);
        return $this->users->findById($user->id) ?? $user;
    }

    /** ตั้งรหัสผ่านใหม่ (ใช้ทั้งผู้ใช้เปลี่ยนเองและ bin/user.php ของผู้ดูแล) */
    public function setPassword(User $user, string $new, string $by): void
    {
        $this->users->changePassword($user->id, password_hash($new, PASSWORD_DEFAULT), $by);
        $this->tokens->revokeAllForUser($user->id, 'PASSWORD_CHANGE', $this->clock->now(), $by);
    }

    public static function assertStrongPassword(string $password, string $username): void
    {
        if (mb_strlen($password) < 8) throw new AppError('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร', 422);
        if (strlen($password) > 4096) throw new AppError('รหัสผ่านยาวเกินไป', 422);
        if (mb_strtolower($password) === mb_strtolower($username)) throw new AppError('รหัสผ่านต้องไม่เหมือนชื่อผู้ใช้', 422);
    }

    public static function hash(string $raw): string
    {
        return hash('sha256', $raw);
    }

    /** โทเคน = 256 บิตสุ่ม เขียนเป็น hex 64 ตัว */
    public static function looksLikeToken(string $raw): bool
    {
        return (bool) preg_match('/^[0-9a-f]{64}$/', $raw);
    }

    private function issue(User $user, string $familyId, string $ip, string $userAgent): string
    {
        $raw = bin2hex(random_bytes(32));
        $this->tokens->insert($user->id, self::hash($raw), $familyId,
            $this->clock->now()->modify("+{$this->config->refreshDays} days"), $ip, $userAgent, $user->username);
        return $raw;
    }

    private function revokeByRaw(string $raw, string $reason, string $by): void
    {
        if (!self::looksLikeToken($raw)) return;
        $this->tokens->transaction(function () use ($raw, $reason, $by) {
            $row = $this->tokens->findByHashForUpdate(self::hash($raw));
            if ($row !== null) $this->tokens->revokeFamily($row['family_id'], $reason, $this->clock->now(), $by);
        });
    }
}
