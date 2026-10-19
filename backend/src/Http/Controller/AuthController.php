<?php
declare(strict_types=1);

namespace App\Http\Controller;

use App\Application\AppError;
use App\Application\Service\AuthService;
use App\Http\Auth\SessionGuard;
use App\Http\Request;
use App\Http\Response;

/**
 * POST /api/auth/login    {username, password, remember}  → ผู้ใช้ + session cookie (+ refresh cookie เมื่อ remember)
 * POST /api/auth/refresh  (refresh cookie)                → ผู้ใช้ + session ใหม่ + refresh cookie ตัวใหม่
 * POST /api/auth/logout                                   → 204 (เพิกถอนโทเคน ลบ cookie)
 * GET  /api/auth/me                                       → ผู้ใช้ปัจจุบัน / 401
 * POST /api/auth/password {currentPassword, newPassword}  → ผู้ใช้ (ออกจากระบบทุกอุปกรณ์อื่น)
 */
final class AuthController
{
    public function __construct(private readonly AuthService $auth, private readonly SessionGuard $guard) {}

    public function login(Request $req): Response
    {
        $b = $req->json();
        $r = $this->auth->login((string) ($b['username'] ?? ''), (string) ($b['password'] ?? ''), !empty($b['remember']),
            $req->ip, $req->userAgent(), $req->cookie(SessionGuard::REFRESH_COOKIE) ?: null);
        $this->guard->establish($r['user']);
        if ($r['refreshToken'] !== null) $this->guard->setRefreshCookie($r['refreshToken']);
        elseif ($req->cookie(SessionGuard::REFRESH_COOKIE) !== '') $this->guard->clearRefreshCookie();
        return Response::json($r['user']->toPublic());
    }

    public function refresh(Request $req): Response
    {
        try {
            $r = $this->auth->refresh($req->cookie(SessionGuard::REFRESH_COOKIE), $req->ip, $req->userAgent());
        } catch (AppError $e) {
            if ($e->status === 401) {           // REFRESH_RACE (409) ไม่ลบ cookie — อีกแท็บเพิ่งได้ตัวใหม่
                $this->guard->clearRefreshCookie();
                $this->guard->destroy();
            }
            throw $e;
        }
        $this->guard->establish($r['user']);
        $this->guard->setRefreshCookie($r['refreshToken']);
        return Response::json($r['user']->toPublic());
    }

    public function logout(Request $req): Response
    {
        $user = $this->guard->user($req);
        $this->auth->logout($req->cookie(SessionGuard::REFRESH_COOKIE) ?: null, $user, $req->ip);
        $this->guard->destroy();
        $this->guard->clearRefreshCookie();
        return Response::noContent();
    }

    public function me(Request $req): Response
    {
        return Response::json($this->guard->require($req)->toPublic());
    }

    public function changePassword(Request $req): Response
    {
        $user = $this->guard->require($req);
        $b = $req->json();
        $updated = $this->auth->changePassword($user, (string) ($b['currentPassword'] ?? ''), (string) ($b['newPassword'] ?? ''));
        $this->guard->establish($updated);          // session_version ใหม่ — เครื่องนี้ยังอยู่ในระบบ เครื่องอื่นหลุด
        $this->guard->clearRefreshCookie();         // โทเคนทุกตัวถูกเพิกถอนแล้ว
        return Response::json($updated->toPublic());
    }
}
