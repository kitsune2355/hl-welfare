<?php
declare(strict_types=1);

namespace App\Application\Service;

use App\Infrastructure\Env;

/** ค่าตั้งของการเข้าสู่ระบบ (อ่านจาก .env — ดู .env.example) */
final class AuthConfig
{
    public function __construct(
        public readonly int $sessionIdleMinutes = 30,
        public readonly int $sessionAbsoluteHours = 12,
        public readonly int $refreshDays = 30,
        public readonly int $refreshGraceSeconds = 10,
        public readonly int $maxFailuresPerUsername = 5,
        public readonly int $maxFailuresPerIp = 20,
        public readonly int $loginWindowMinutes = 15,
    ) {}

    public static function fromEnv(): self
    {
        return new self(
            Env::int('SESSION_IDLE_MINUTES', 30),
            Env::int('SESSION_ABSOLUTE_HOURS', 12),
            Env::int('REFRESH_TOKEN_DAYS', 30),
            Env::int('REFRESH_GRACE_SECONDS', 10),
            Env::int('LOGIN_MAX_FAILS_PER_USER', 5),
            Env::int('LOGIN_MAX_FAILS_PER_IP', 20),
            Env::int('LOGIN_WINDOW_MINUTES', 15),
        );
    }
}
