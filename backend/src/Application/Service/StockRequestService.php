<?php
declare(strict_types=1);

namespace App\Application\Service;

use App\Application\AppError;
use App\Application\Port\AuditLog;
use App\Application\Port\StockClient;
use App\Domain\User;

/**
 * ส่งคำสั่งไประบบสต็อก HR แทนผู้ใช้ที่เข้าสู่ระบบ (แทน web/api/stock_bridge.php)
 *
 * ผู้ขอเบิก/ผู้ยกเลิกมาจาก session เสมอ — ค่า requested_by_* ที่เบราว์เซอร์ส่งมาถูกทิ้ง
 * ทุกใบที่ออกหรือยกเลิกสำเร็จเขียน audit_log (ผู้ใช้ + เลขใบ) อีกชั้น
 */
final class StockRequestService
{
    public const ACTIONS = ['catalog', 'submit', 'status', 'cancel'];
    private const ACTOR_FIELDS = ['requested_by_name', 'requested_by_user', 'requested_by_user_id', 'requested_by_emp_code'];

    public function __construct(
        private readonly StockClient $stock,
        private readonly AuditLog $audit,
    ) {}

    /** @return array{status:int, body:array} */
    public function forward(array $input, User $actor): array
    {
        $action = is_string($input['action'] ?? null) ? $input['action'] : '';
        if (!in_array($action, self::ACTIONS, true)) throw new AppError('ไม่รู้จักคำสั่งที่ส่งมา', 400);

        foreach (self::ACTOR_FIELDS as $f) unset($input[$f]);
        if ($action === 'submit' || $action === 'cancel') $input += self::actorFields($actor);

        $res = $this->stock->call($input);
        if ($res['status'] < 400 && !empty($res['body']['ok'])) $this->record($action, $input, $res['body'], $actor);
        return $res;
    }

    /** ชื่อ ณ ตอนนั้น + ผู้ใช้ + รหัสพนักงาน — stock_hr บันทึกลง tb_doc_welfare */
    public static function actorFields(User $actor): array
    {
        return [
            'requested_by_name' => $actor->name,
            'requested_by_user' => $actor->username,
            'requested_by_user_id' => $actor->id,
            'requested_by_emp_code' => $actor->empCode ?? '',
        ];
    }

    private function record(string $action, array $input, array $body, User $actor): void
    {
        if ($action === 'submit') {
            $ref = (int) ($input['employee_id'] ?? 0) . ':' . (string) ($input['entitlement_key'] ?? '');
            $doc = (string) ($body['doc_no'] ?? '');
            $dup = !empty($body['duplicate']) ? ' (ใบเดิม — ส่งซ้ำ)' : '';
            $this->audit->write('STOCK_REQUEST', $ref, 'CREATE',
                "ส่งเบิกชุดฟอร์ม {$input['entitlement_key']} ใบ $doc ให้ " . ($input['employee_name'] ?? "#{$input['employee_id']}") . $dup,
                $actor, after: ['docId' => $body['doc_id'] ?? null, 'docNo' => $doc, 'lines' => $input['lines'] ?? []]);
        } elseif ($action === 'cancel') {
            $this->audit->write('STOCK_REQUEST', (string) ($input['ref'] ?? ''), 'CANCEL',
                'ยกเลิกใบเบิกชุดฟอร์ม ' . ($input['ref'] ?? '') . (($input['reason'] ?? '') !== '' ? " — {$input['reason']}" : ''),
                $actor, after: ['docId' => $body['doc_id'] ?? null]);
        }
    }
}
