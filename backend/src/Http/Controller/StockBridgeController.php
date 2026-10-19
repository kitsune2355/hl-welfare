<?php
declare(strict_types=1);

namespace App\Http\Controller;

use App\Application\Service\StockRequestService;
use App\Http\Auth\SessionGuard;
use App\Http\Request;
use App\Http\Response;

/**
 * POST /api/stock/bridge  { action: catalog | submit | status | cancel, ... }
 * แทน web/api/stock_bridge.php: ต้องเข้าสู่ระบบ · ผู้ขอเบิกมาจาก session · ตอบ { ok, message, ... } ตามระบบสต็อก
 */
final class StockBridgeController
{
    /** บทบาทที่ออก/ยกเลิกใบเบิกได้ (ดูอย่างเดียวได้ทุกบทบาท) */
    public const WRITE_ROLES = ['HR_ADMIN', 'HR_COMPANY'];

    public function __construct(private readonly StockRequestService $stock, private readonly SessionGuard $guard) {}

    public function forward(Request $req): Response
    {
        $input = $req->json();
        $write = in_array($input['action'] ?? '', ['submit', 'cancel'], true);
        $user = $write ? $this->guard->requireRole($req, self::WRITE_ROLES) : $this->guard->require($req);
        $res = $this->stock->forward($input, $user);
        return Response::raw($res['body'], $res['status'] >= 400 ? $res['status'] : 200);
    }
}
