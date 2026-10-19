<?php
declare(strict_types=1);

namespace App\Http;

/**
 * คำตอบของ API — Controller สร้างแล้วคืนค่า, public/index.php เป็นคนส่งจริง (send)
 * สำเร็จ { "data": ... } · ผิดพลาด { "error": "ข้อความ", "code"?: "..." }
 * (cookie ตั้งด้วย setcookie() ใน SessionGuard — PHP ส่งออกพร้อม header ตอน send)
 */
final class Response
{
    /** @param array<string,string> $headers */
    private function __construct(
        public readonly int $status,
        public readonly ?string $body,
        public array $headers = [],
    ) {}

    public static function json(mixed $data, int $status = 200): self
    {
        return new self($status, json_encode(['data' => $data], JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION));
    }

    /** ส่ง JSON ตามที่ได้รับ (ใช้กับตัวกลางระบบสต็อกที่ตอบ { ok, message, ... }) */
    public static function raw(array $payload, int $status = 200): self
    {
        return new self($status, json_encode($payload, JSON_UNESCAPED_UNICODE));
    }

    /** @param array<string,string> $headers */
    public static function error(string $message, int $status = 400, ?string $code = null, array $headers = []): self
    {
        $body = ['error' => $message];
        if ($code !== null) $body['code'] = $code;
        return new self($status, json_encode($body, JSON_UNESCAPED_UNICODE), $headers);
    }

    public static function noContent(): self
    {
        return new self(204, null);
    }

    public function send(): void
    {
        http_response_code($this->status);
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        if ($this->body !== null) header('Content-Type: application/json; charset=utf-8');
        foreach ($this->headers as $k => $v) header("$k: $v");
        if ($this->body !== null) echo $this->body;
    }
}
