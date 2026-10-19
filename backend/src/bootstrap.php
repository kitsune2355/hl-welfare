<?php
declare(strict_types=1);

/*
 * จุดเริ่มของ backend (ใช้ทั้ง public/index.php, bin/*.php และ tests)
 * - autoload แบบ PSR-4 (App\ → src/) ไม่ต้องพึ่ง composer
 * - อ่าน .env (ถ้ามี vendor/autoload.php จาก composer ก็โหลดด้วย)
 */

spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'App\\')) {
        $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, 4)) . '.php';
        if (is_file($file)) require $file;
    }
});

$vendor = dirname(__DIR__) . '/vendor/autoload.php';
if (is_file($vendor)) require $vendor;

App\Infrastructure\Env::load(dirname(__DIR__) . '/.env');
date_default_timezone_set(App\Infrastructure\Env::get('APP_TZ', 'Asia/Bangkok'));
