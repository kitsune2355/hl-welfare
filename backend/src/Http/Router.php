<?php
declare(strict_types=1);

namespace App\Http;

/** จับคู่ method + path (รองรับ {param}) → callable(Request, array $params): Response */
final class Router
{
    /** @var list<array{string,string,callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $this->routes[] = [$method, $pattern, $handler];
    }

    public function get(string $p, callable $h): void { $this->add('GET', $p, $h); }
    public function post(string $p, callable $h): void { $this->add('POST', $p, $h); }

    public function dispatch(Request $req): Response
    {
        $pathMatched = false;
        foreach ($this->routes as [$method, $pattern, $handler]) {
            $re = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
            if (!preg_match($re, $req->path, $m)) continue;
            $pathMatched = true;
            if ($method !== $req->method) continue;
            return $handler($req, array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY));
        }
        throw $pathMatched ? new HttpError('ไม่รองรับ method นี้', 405) : new HttpError('ไม่พบ endpoint', 404);
    }
}
