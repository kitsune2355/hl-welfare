<?php
declare(strict_types=1);

namespace App\Infrastructure;

use App\Application\Port\Clock;

final class SystemClock implements Clock
{
    public function now(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now');
    }
}
