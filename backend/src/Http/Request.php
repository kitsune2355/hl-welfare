<?php
declare(strict_types=1);

namespace App\Http;

final class Request
{
    /**
     * @param array<string,mixed>  $query
     * @param array<string,string> $cookies
     * @param array<string,string> $headers  ชื่อ header ตัวเล็ก
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly string $rawBody,
        public readonly array $cookies,
        public readonly array $headers,
        public readonly string $ip,
        public readonly bool $https,
    ) {}

    /** @param string $basePath path ที่วางระบบ เช่น /hl-welfare — ตัดออกให้เหลือ /api/... */
    public static function fromGlobals(string $basePath = ''): self
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $base = rtrim($basePath, '/');
        if ($base !== '' && str_starts_with($path, $base . '/')) $path = substr($path, strlen($base));
        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string) $v;
        }
        if (isset($_SERVER['CONTENT_TYPE'])) $headers['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            rtrim($path, '/') ?: '/',
            $_GET,
            (string) file_get_contents('php://input'),
            array_map('strval', $_COOKIE),
            $headers,
            (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
            $https,
        );
    }

    public function header(string $name): string
    {
        return $this->headers[strtolower($name)] ?? '';
    }

    public function cookie(string $name): string
    {
        return $this->cookies[$name] ?? '';
    }

    public function userAgent(): string
    {
        return mb_substr($this->header('user-agent'), 0, 255);
    }

    /** @return array<string,mixed> body แบบ JSON (ว่าง = []) */
    public function json(): array
    {
        if (trim($this->rawBody) === '') return [];
        $data = json_decode($this->rawBody, true);
        if (!is_array($data)) throw new HttpError('ข้อมูลที่ส่งมาไม่ใช่ JSON', 400);
        return $data;
    }
}
