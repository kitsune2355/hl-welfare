<?php
declare(strict_types=1);

namespace App\Application;

/** error จากชั้น use-case — public/index.php แปลงเป็น HTTP status + { error, code } */
final class AppError extends \RuntimeException
{
    /** @param array<string,string> $headers */
    public function __construct(
        string $message,
        public readonly int $status = 400,
        public readonly ?string $errorCode = null,
        public readonly array $headers = [],
    ) {
        parent::__construct($message);
    }
}
