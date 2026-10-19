<?php
declare(strict_types=1);

namespace App\Http;

/**
 * กันคำขอข้ามเว็บ (CSRF) ของคำขอที่เปลี่ยนข้อมูล — ใช้ร่วมกับ cookie SameSite=Lax
 * 1) ต้องเป็น Content-Type: application/json (ฟอร์ม HTML ของเว็บอื่นส่งแบบนี้ไม่ได้ถ้าไม่ผ่าน CORS preflight)
 * 2) ถ้าเบราว์เซอร์ส่ง Origin มา ต้องเป็น origin เดียวกับ API หรือ CORS_ORIGIN
 */
final class CsrfGuard
{
    public function __construct(private readonly string $corsOrigin = '') {}

    public function check(Request $req): void
    {
        if (in_array($req->method, ['GET', 'HEAD', 'OPTIONS'], true)) return;
        if (!str_starts_with(strtolower($req->header('content-type')), 'application/json')) {
            throw new HttpError('ต้องส่งข้อมูลแบบ application/json', 415);
        }
        $origin = $req->header('origin');
        if ($origin !== '' && $origin !== 'null') {
            $host = parse_url($origin, PHP_URL_HOST) . (($p = parse_url($origin, PHP_URL_PORT)) ? ":$p" : '');
            if (strcasecmp($host, $req->header('host')) !== 0 && rtrim($origin, '/') !== rtrim($this->corsOrigin, '/')) {
                throw new HttpError('คำขอมาจากเว็บอื่น', 403, 'BAD_ORIGIN');
            }
        } elseif ($req->header('sec-fetch-site') === 'cross-site') {
            throw new HttpError('คำขอมาจากเว็บอื่น', 403, 'BAD_ORIGIN');
        }
    }
}
