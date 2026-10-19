<?php
declare(strict_types=1);

namespace App\Application\Port;

/** ระบบสต็อก HR (stock_hr/api/welfare.php) — คำขอเซ็นด้วย HMAC */
interface StockClient
{
    /** @return array{status:int, body:array} body = { ok, message, ... } ตามที่ stock_hr ตอบ */
    public function call(array $payload): array;
}
