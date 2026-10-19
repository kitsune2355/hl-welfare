<?php
declare(strict_types=1);

namespace App\Infrastructure;

/** อ่านค่าตั้งจาก .env (KEY=value, # = หมายเหตุ) — ตัวแปร environment จริงมีสิทธิ์ก่อน */
final class Env
{
    /** @var array<string,string> */
    private static array $values = [];

    public static function load(string $file): void
    {
        if (!is_file($file)) return;
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
            [$k, $v] = array_map('trim', explode('=', $line, 2));
            $v = preg_replace('/\s+#.*$/', '', $v) ?? $v;          // หมายเหตุท้ายบรรทัด
            self::$values[$k] = trim($v, "\"'");
        }
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        $env = getenv($key);
        if ($env !== false && $env !== '') return $env;
        return self::$values[$key] ?? $default;
    }

    public static function int(string $key, int $default): int
    {
        $v = self::get($key);
        return $v === null || $v === '' ? $default : (int) $v;
    }

    /** ค่าจริง/เท็จ — คืน null เมื่อไม่ได้ตั้ง หรือเป็น 'auto' */
    public static function bool(string $key): ?bool
    {
        $v = strtolower((string) self::get($key, ''));
        if ($v === '' || $v === 'auto') return null;
        return in_array($v, ['1', 'true', 'yes', 'on'], true);
    }
}
