<?php
declare(strict_types=1);

/*
 * front controller ของ API (สเปกข้อ 12.2) — ทุก endpoint (ยกเว้น login/refresh/logout) ต้องมี session
 * ตอนนี้มีเฉพาะการเข้าสู่ระบบ + ตัวกลางระบบสต็อก · endpoint ข้อมูลอื่น (ข้อ 8) เพิ่มที่ $r ตามลำดับ
 */

use App\Application\AppError;
use App\Container;
use App\Http\CsrfGuard;
use App\Http\HttpError;
use App\Http\Request;
use App\Http\Response;
use App\Http\Router;
use App\Infrastructure\Env;

require dirname(__DIR__) . '/src/bootstrap.php';

$req = Request::fromGlobals((string) Env::get('APP_BASE_PATH', ''));
$c = new Container($req->https);

$corsOrigin = (string) Env::get('CORS_ORIGIN', '');
if ($corsOrigin !== '') {
    header('Access-Control-Allow-Origin: ' . $corsOrigin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Vary: Origin');
    if ($req->method === 'OPTIONS') { http_response_code(204); exit; }
}

$r = new Router();
$r->post('/api/auth/login',    fn (Request $q) => $c->authController()->login($q));
$r->post('/api/auth/refresh',  fn (Request $q) => $c->authController()->refresh($q));
$r->post('/api/auth/logout',   fn (Request $q) => $c->authController()->logout($q));
$r->get('/api/auth/me',        fn (Request $q) => $c->authController()->me($q));
$r->post('/api/auth/password', fn (Request $q) => $c->authController()->changePassword($q));
$r->post('/api/stock/bridge',  fn (Request $q) => $c->stockBridgeController()->forward($q));

try {
    (new CsrfGuard($corsOrigin))->check($req);
    $res = $r->dispatch($req);
} catch (HttpError $e) {
    $res = Response::error($e->getMessage(), $e->status, $e->errorCode, $e->headers);
} catch (AppError $e) {
    $res = Response::error($e->getMessage(), $e->status, $e->errorCode, $e->headers);
} catch (\Throwable $e) {
    error_log((string) $e);
    $res = Response::error('เกิดข้อผิดพลาดภายในระบบ', 500);
}
$res->send();
