<?php
declare(strict_types=1);

namespace App\Application\Port;

use App\Domain\User;

/** ตาราง audit_log (= ActivityLog) — ผู้กระทำมาจาก session เสมอ (user_id + ชื่อ ณ ตอนนั้น) */
interface AuditLog
{
    public function write(string $entity, string $entityId, string $action, string $summary, ?User $actor,
        ?int $employeeId = null, ?array $before = null, ?array $after = null, ?string $actorNameFallback = null): void;
}
