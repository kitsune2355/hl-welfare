<?php
declare(strict_types=1);

namespace App\Http;

final class HttpError extends \RuntimeException
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
