<?php
declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use App\Application\Port\AuditLog;
use App\Domain\User;
use PDO;

final class PdoAuditLog implements AuditLog
{
    public function __construct(private readonly PDO $pdo) {}

    public function write(string $entity, string $entityId, string $action, string $summary, ?User $actor,
        ?int $employeeId = null, ?array $before = null, ?array $after = null, ?string $actorNameFallback = null): void
    {
        $json = static fn (?array $v) => $v === null ? null : json_encode($v, JSON_UNESCAPED_UNICODE);
        $by = $actor?->username ?? 'system';
        $this->pdo->prepare('INSERT INTO audit_log
            (entity, entity_id, action, summary, employee_id, before_json, after_json, user_id, user_name, at,
             created_at, created_by, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, NOW(), ?)')
            ->execute([$entity, $entityId, $action, mb_substr($summary, 0, 500), $employeeId, $json($before), $json($after),
                $actor?->id, $actor?->name ?? $actorNameFallback ?? 'system', $by, $by]);
    }
}
