<?php
/* ============================================================
 *  backend/lib/http.php — คำขอ / คำตอบ / router ของ API (PHP 5.2)
 *
 *  คำขอ  = array: method, path (/sites/3), query, raw, cookies, headers, ip, https, base
 *  คำตอบ = array: status, body (array หรือ null), headers, cookies (บรรทัด Set-Cookie)
 *  handler รับ ($req, $params) คืนค่า data (→ 200 { data }) หรือ http_response(...)
 *  ไม่มี exit ระหว่างทาง → เทสต์เรียก api_handle() ในโปรเซสเดียวกันได้
 *
 *  รูปแบบ: สำเร็จ { "data": ... } · ผิดพลาด { "error": "ข้อความ", "code"?: "...", "errors"?: {...} }
 * ============================================================ */

/** คำขอจริงจาก Apache: path มาจาก PATH_INFO (api/index.php/sites/3 → /sites/3) */
function http_request_from_globals()
{
    $path = isset($_SERVER['PATH_INFO']) ? $_SERVER['PATH_INFO'] : '/';
    $headers = array();
    foreach ($_SERVER as $k => $v) {
        if (substr($k, 0, 5) === 'HTTP_') {
            $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string)$v;
        }
    }
    if (isset($_SERVER['CONTENT_TYPE'])) { $headers['content-type'] = (string)$_SERVER['CONTENT_TYPE']; }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
          || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
    return array(
        'method'  => strtoupper(isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET'),
        'path'    => rtrim($path, '/') === '' ? '/' : rtrim($path, '/'),
        'query'   => $_GET,
        'raw'     => (string)file_get_contents('php://input'),
        'cookies' => $_COOKIE,
        'headers' => $headers,
        'ip'      => isset($_SERVER['REMOTE_ADDR']) ? (string)$_SERVER['REMOTE_ADDR'] : '',
        'https'   => $https,
        /* URL ของ api/index.php เช่น /hl-welfare/web/api/index.php — ใช้เป็น path ของ cookie */
        'base'    => isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '/api/index.php',
    );
}

function req_header($req, $name)
{
    $n = strtolower($name);
    return isset($req['headers'][$n]) ? $req['headers'][$n] : '';
}

function req_cookie($req, $name)
{
    return isset($req['cookies'][$name]) ? (string)$req['cookies'][$name] : '';
}

function req_query($req, $name, $default = null)
{
    return isset($req['query'][$name]) && $req['query'][$name] !== '' ? $req['query'][$name] : $default;
}

/** body แบบ JSON → array (ว่าง = array()) */
function req_json($req)
{
    if (trim($req['raw']) === '') { return array(); }
    $data = json_decode($req['raw'], true);
    if (!is_array($data)) { throw new ApiError('ข้อมูลที่ส่งมาไม่ใช่ JSON', 400); }
    return $data;
}

function req_user_agent($req)
{
    return substr(req_header($req, 'user-agent'), 0, 255);
}

/* ---------- คำตอบ ---------- */
function http_response($status, $body, $headers = array())
{
    return array('status' => (int)$status, 'body' => $body, 'headers' => $headers, 'cookies' => array());
}

function http_data($data, $status = 200)
{
    return http_response($status, array('data' => $data));
}

function http_no_content()
{
    return http_response(204, null);
}

function http_error_response($e)
{
    $body = array('error' => $e->getMessage());
    if ($e->errorCode !== null) { $body['code'] = $e->errorCode; }
    if ($e->details !== null)   { $body['errors'] = $e->details; }
    return http_response($e->status, $body, $e->headers);
}

/* cookie ที่ handler สั่งตั้ง (เก็บไว้ก่อน แล้วแนบตอนส่ง) */
$GLOBALS['hlw_set_cookies'] = array();

/** Set-Cookie แบบเขียนเอง — PHP 5.2 setcookie() ใส่ SameSite ไม่ได้ */
function http_set_cookie($name, $value, $path, $expires, $secure)
{
    $c = $name . '=' . rawurlencode($value) . '; Path=' . $path;
    if ($expires !== 0) {
        $c .= '; Expires=' . gmdate('D, d M Y H:i:s', $expires) . ' GMT; Max-Age=' . max(0, $expires - time());
    }
    if ($secure) { $c .= '; Secure'; }
    $c .= '; HttpOnly; SameSite=Lax';
    $GLOBALS['hlw_set_cookies'][] = $c;
}

function http_send($res)
{
    $text = array(200 => 'OK', 201 => 'Created', 204 => 'No Content', 400 => 'Bad Request', 401 => 'Unauthorized',
        403 => 'Forbidden', 404 => 'Not Found', 405 => 'Method Not Allowed', 409 => 'Conflict', 415 => 'Unsupported Media Type',
        422 => 'Unprocessable Entity', 429 => 'Too Many Requests', 500 => 'Internal Server Error', 502 => 'Bad Gateway',
        503 => 'Service Unavailable');
    $s = $res['status'];
    header('HTTP/1.1 ' . $s . ' ' . (isset($text[$s]) ? $text[$s] : 'Error'));
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    foreach ($res['headers'] as $k => $v) { header($k . ': ' . $v); }
    foreach ($res['cookies'] as $c) { header('Set-Cookie: ' . $c, false); }
    if ($res['body'] !== null) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($res['body']);
    }
}

/* ---------- router ---------- */
/** $public = false → ต้องมี session (เรียก $GLOBALS['hlw_route_guard'] ก่อน handler) */
function router_add(&$routes, $method, $pattern, $handler, $public = false)
{
    $re = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
    $routes[] = array($method, $re, $handler, $public);
}

function router_dispatch($routes, $req)
{
    $pathMatched = false;
    foreach ($routes as $r) {
        if (!preg_match($r[1], $req['path'], $m)) { continue; }
        $pathMatched = true;
        if ($r[0] !== $req['method']) { continue; }
        $params = array();
        foreach ($m as $k => $v) {
            if (is_string($k)) { $params[$k] = $v; }
        }
        if (!$r[3] && !empty($GLOBALS['hlw_route_guard'])) { call_user_func($GLOBALS['hlw_route_guard'], $req); }
        $out = call_user_func($r[2], $req, $params);
        return (is_array($out) && isset($out['status']) && array_key_exists('body', $out) && isset($out['cookies']))
            ? $out : http_data($out);
    }
    throw $pathMatched ? new ApiError('ไม่รองรับ method นี้', 405) : new ApiError('ไม่พบ endpoint', 404);
}

/**
 * กัน CSRF ของคำขอที่เปลี่ยนข้อมูล (ใช้ร่วมกับ cookie SameSite=Lax)
 *  1) ต้องเป็น Content-Type: application/json  2) ถ้ามี Origin ต้องเป็นเว็บเดียวกัน
 */
function csrf_check($req)
{
    if (in_array($req['method'], array('GET', 'HEAD', 'OPTIONS'))) { return; }
    if (strpos(strtolower(req_header($req, 'content-type')), 'application/json') !== 0) {
        throw new ApiError('ต้องส่งข้อมูลแบบ application/json', 415);
    }
    $origin = req_header($req, 'origin');
    if ($origin !== '' && $origin !== 'null') {
        $p = parse_url($origin);
        $host = (isset($p['host']) ? $p['host'] : '') . (isset($p['port']) ? ':' . $p['port'] : '');
        if (strcasecmp($host, req_header($req, 'host')) !== 0) {
            throw new ApiError('คำขอมาจากเว็บอื่น', 403, null, 'BAD_ORIGIN');
        }
    } elseif (req_header($req, 'sec-fetch-site') === 'cross-site') {
        throw new ApiError('คำขอมาจากเว็บอื่น', 403, null, 'BAD_ORIGIN');
    }
}
