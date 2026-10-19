<?php
declare(strict_types=1);

namespace App;

use App\Application\Service\AuthConfig;
use App\Application\Service\AuthService;
use App\Application\Service\StockRequestService;
use App\Http\Auth\SessionGuard;
use App\Http\Controller\AuthController;
use App\Http\Controller\StockBridgeController;
use App\Infrastructure\Database;
use App\Infrastructure\Env;
use App\Infrastructure\Persistence\PdoAuditLog;
use App\Infrastructure\Persistence\PdoLoginAttemptRepository;
use App\Infrastructure\Persistence\PdoRefreshTokenRepository;
use App\Infrastructure\Persistence\PdoUserRepository;
use App\Infrastructure\Stock\HmacStockClient;
use App\Infrastructure\SystemClock;

/** ประกอบ dependency จุดเดียว (สเปกข้อ 12.5) — Controller/Service ไม่ new ของเอง */
final class Container
{
    private array $cache = [];

    public function __construct(private readonly bool $https = false) {}

    private function once(string $key, callable $make): mixed
    {
        return $this->cache[$key] ??= $make();
    }

    public function basePath(): string
    {
        return rtrim((string) Env::get('APP_BASE_PATH', ''), '/');
    }

    public function authConfig(): AuthConfig
    {
        return $this->once('cfg', fn () => AuthConfig::fromEnv());
    }

    public function users(): PdoUserRepository
    {
        return $this->once('users', fn () => new PdoUserRepository(Database::pdo()));
    }

    public function audit(): PdoAuditLog
    {
        return $this->once('audit', fn () => new PdoAuditLog(Database::pdo()));
    }

    public function authService(): AuthService
    {
        return $this->once('auth', fn () => new AuthService(
            $this->users(),
            new PdoRefreshTokenRepository(Database::pdo()),
            new PdoLoginAttemptRepository(Database::pdo()),
            $this->audit(),
            new SystemClock(),
            $this->authConfig(),
        ));
    }

    public function guard(): SessionGuard
    {
        // COOKIE_SECURE=1 บน production (HTTPS) · auto = ตาม HTTPS ของคำขอ · 0 = ทดสอบบน http เท่านั้น
        return $this->once('guard', fn () => new SessionGuard(
            $this->users(), $this->authConfig(), $this->basePath(), Env::bool('COOKIE_SECURE') ?? $this->https));
    }

    public function authController(): AuthController
    {
        return new AuthController($this->authService(), $this->guard());
    }

    public function stockBridgeController(): StockBridgeController
    {
        return new StockBridgeController(
            new StockRequestService(
                new HmacStockClient((string) Env::get('STOCK_API_URL', ''), (string) Env::get('STOCK_API_SECRET', '')),
                $this->audit(),
            ),
            $this->guard(),
        );
    }
}
