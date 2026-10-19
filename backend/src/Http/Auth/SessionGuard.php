<?php
declare(strict_types=1);

namespace App\Http\Auth;

use App\Application\Port\UserRepository;
use App\Application\Service\AuthConfig;
use App\Domain\User;
use App\Http\HttpError;
use App\Http\Request;

/**
 * session ฝั่งเซิร์ฟเวอร์ (PHP session อายุสั้น) + cookie ของ refresh token
 *
 * - session cookie: HttpOnly, SameSite=Lax, Secure, path = APP_BASE_PATH/ · ปิดเบราว์เซอร์ = หมด
 *   หมดอายุเมื่อไม่ใช้งาน SESSION_IDLE_MINUTES หรือครบ SESSION_ABSOLUTE_HOURS นับจาก login/refresh
 * - ทุกคำขออ่านผู้ใช้จากฐานข้อมูลใหม่: ถูกปิดบัญชี หรือเปลี่ยนรหัสผ่าน (session_version เปลี่ยน) → หลุดทันที
 * - refresh cookie: HttpOnly, SameSite=Lax, Secure, path = APP_BASE_PATH/api/auth (ส่งไปเฉพาะ endpoint ของ auth)
 */
final class SessionGuard
{
    public const SESSION_COOKIE = 'HLW_SESSION';
    public const REFRESH_COOKIE = 'HLW_REFRESH';

    private bool $configured = false;
    private ?User $user = null;
    private bool $resolved = false;

    public function __construct(
        private readonly UserRepository $users,
        private readonly AuthConfig $config,
        private readonly string $basePath,
        private readonly bool $secure,
    ) {}

    /** ผู้ใช้ของคำขอนี้ หรือ null */
    public function user(Request $req): ?User
    {
        if ($this->resolved) return $this->user;
        $this->resolved = true;
        if ($req->cookie(self::SESSION_COOKIE) === '' || !$this->start()) return null;

        $s = $_SESSION;
        $now = time();
        $valid = isset($s['uid'], $s['ver'], $s['created'], $s['last'])
            && $now - (int) $s['last'] <= $this->config->sessionIdleMinutes * 60
            && $now - (int) $s['created'] <= $this->config->sessionAbsoluteHours * 3600;
        $user = $valid ? $this->users->findById((int) $s['uid']) : null;
        if ($user === null || !$user->isActive || $user->sessionVersion !== (int) $s['ver']) {
            $this->destroy();
            return null;
        }
        $_SESSION['last'] = $now;
        session_write_close();                      // ไม่ล็อกไฟล์ session ระหว่างทำงาน (คำขอขนานกันได้)
        return $this->user = $user;
    }

    public function require(Request $req): User
    {
        return $this->user($req) ?? throw new HttpError('กรุณาเข้าสู่ระบบ', 401, 'UNAUTHENTICATED');
    }

    /** @param list<string> $roles */
    public function requireRole(Request $req, array $roles): User
    {
        $u = $this->require($req);
        if (!in_array($u->role, $roles, true)) throw new HttpError('บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้', 403, 'FORBIDDEN');
        return $u;
    }

    /** เริ่ม session ใหม่ให้ผู้ใช้ (หลัง login / refresh / เปลี่ยนรหัสผ่าน) — เปลี่ยน session id เสมอ กัน session fixation */
    public function establish(User $user): void
    {
        $this->start();
        session_regenerate_id(true);
        $_SESSION = ['uid' => $user->id, 'ver' => $user->sessionVersion, 'created' => time(), 'last' => time()];
        session_write_close();
        $this->user = $user;
        $this->resolved = true;
    }

    public function destroy(): void
    {
        if ($this->start()) {
            $_SESSION = [];
            session_destroy();
        }
        setcookie(self::SESSION_COOKIE, '', $this->cookieOptions($this->sessionPath(), time() - 3600));
        $this->user = null;
    }

    public function setRefreshCookie(string $raw): void
    {
        setcookie(self::REFRESH_COOKIE, $raw,
            $this->cookieOptions($this->refreshPath(), time() + $this->config->refreshDays * 86400));
    }

    public function clearRefreshCookie(): void
    {
        setcookie(self::REFRESH_COOKIE, '', $this->cookieOptions($this->refreshPath(), time() - 3600));
    }

    private function start(): bool
    {
        if (session_status() === PHP_SESSION_ACTIVE) return true;
        if ($this->configured) return session_start();
        $this->configured = true;
        ini_set('session.use_strict_mode', '1');            // ไม่รับ session id ที่เซิร์ฟเวอร์ไม่ได้ออกให้
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_trans_sid', '0');
        ini_set('session.gc_maxlifetime', (string) ($this->config->sessionIdleMinutes * 60));
        ini_set('session.sid_length', '48');
        ini_set('session.sid_bits_per_character', '6');
        session_name(self::SESSION_COOKIE);
        session_set_cookie_params($this->cookieOptions($this->sessionPath(), 0));
        return session_start();
    }

    private function sessionPath(): string
    {
        return rtrim($this->basePath, '/') . '/';
    }

    private function refreshPath(): string
    {
        return rtrim($this->basePath, '/') . '/api/auth';
    }

    private function cookieOptions(string $path, int $expires): array
    {
        $o = ['path' => $path, 'secure' => $this->secure, 'httponly' => true, 'samesite' => 'Lax'];
        if ($expires !== 0) $o['expires'] = $expires;
        else $o['lifetime'] = 0;
        return $o;
    }
}
