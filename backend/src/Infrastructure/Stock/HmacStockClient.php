<?php
declare(strict_types=1);

namespace App\Infrastructure\Stock;

use App\Application\AppError;
use App\Application\Port\StockClient;

/**
 * เรียก stock_hr/api/welfare.php พร้อมลายเซ็น
 *   X-Welfare-Timestamp: <unix time>
 *   X-Welfare-Signature: hex(HMAC-SHA256(secret, "<timestamp>.<body>"))
 */
final class HmacStockClient implements StockClient
{
    public function __construct(private readonly string $url, private readonly string $secret) {}

    public function call(array $payload): array
    {
        if ($this->url === '' || $this->secret === '') {
            throw new AppError('ยังไม่ได้ตั้งค่าการเชื่อมต่อระบบสต็อก (STOCK_API_URL / STOCK_API_SECRET ใน backend/.env)', 503);
        }
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $ts = (string) time();
        $ch = curl_init($this->url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-Welfare-Timestamp: ' . $ts,
                'X-Welfare-Signature: ' . hash_hmac('sha256', $ts . '.' . $body, $this->secret),
            ],
        ]);
        $out = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);

        if ($out === false) throw new AppError("เชื่อมต่อระบบสต็อกไม่ได้ ($error)", 502);
        $reply = json_decode((string) $out, true);
        if (!is_array($reply)) throw new AppError("ระบบสต็อกตอบกลับผิดรูปแบบ (HTTP $status)", 502);
        return ['status' => $status ?: 200, 'body' => $reply];
    }
}
