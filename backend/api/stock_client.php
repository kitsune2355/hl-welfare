<?php
/* ============================================================
 *  backend/api/stock_client.php — เรียกสต็อก Uniform (stock_hr/api/welfare.php) แบบเซ็นคำขอ
 *
 *    X-Welfare-Timestamp: <unix time>
 *    X-Welfare-Signature: hex(HMAC-SHA256(กุญแจ, "<timestamp>.<body>"))
 *
 *  สัญญาของแต่ละคำสั่งดูที่หัวไฟล์ stock_hr/api/welfare.php
 *  ผิดพลาด (เชื่อมต่อไม่ได้ / { ok: false }) → ApiError แบบเดียวกับ StockGateway ของหน้าเว็บ
 *  เทสต์แทนตัวจริงได้ด้วย $GLOBALS['hlw_stock_fake'] = 'ชื่อฟังก์ชัน' (รับ payload คืน array(status, body))
 * ============================================================ */

/** @return array คำตอบ { ok, message, ... } ของ stock_hr (ok = true เท่านั้น) */
function stock_call($payload)
{
    $res = stock_raw($payload);
    $body = $res[1];
    if (!is_array($body)) {
        throw new ApiError('ระบบสต็อกตอบกลับผิดรูปแบบ (HTTP ' . $res[0] . ')', 502);
    }
    if ($res[0] >= 400 || empty($body['ok'])) {
        $msg = isset($body['message']) ? $body['message'] : 'HTTP ' . $res[0];
        throw new ApiError($msg, $res[0] >= 400 ? ($res[0] === 401 ? 502 : $res[0]) : 422);
    }
    return $body;
}

/** @return array(status, body|null) */
function stock_raw($payload)
{
    if (!empty($GLOBALS['hlw_stock_fake'])) {
        return call_user_func($GLOBALS['hlw_stock_fake'], $payload);
    }
    $url = $GLOBALS['hlw_config']['stock_api_url'];
    $secret = $GLOBALS['hlw_config']['stock_api_secret'];
    if ($url === '' || $secret === '') {
        throw new ApiError('ยังไม่ได้ตั้งค่าการเชื่อมต่อระบบสต็อก (stock_api_url / stock_api_secret ใน backend/config.php)', 503);
    }
    $body = json_encode($payload);
    $ts = (string)time();
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        'Content-Type: application/json',
        'X-Welfare-Timestamp: ' . $ts,
        'X-Welfare-Signature: ' . hash_hmac('sha256', $ts . '.' . $body, $secret),
    ));
    $out = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($out === false) {
        throw new ApiError('เชื่อมต่อระบบสต็อกไม่ได้ (' . $error . ')', 502);
    }
    return array($status ? $status : 200, json_decode($out, true));
}

/* ---------- คำสั่ง (เหมือน StockGateway ของหน้าเว็บ) ---------- */
function stock_catalog($items, $logo, $siteId, $event)
{
    return stock_call(array('action' => 'catalog', 'items' => $items, 'logo' => $logo, 'site_id' => $siteId, 'event' => $event));
}

/** คืน array(ref => status) — PHP 5.2 ฝั่งสต็อกส่ง [] เมื่อว่าง */
function stock_status($refs)
{
    $b = stock_call(array('action' => 'status', 'refs' => $refs));
    return (isset($b['status']) && is_array($b['status'])) ? $b['status'] : array();
}

function stock_cancel($ref, $reason, $actor)
{
    $p = array('action' => 'cancel', 'ref' => $ref, 'reason' => $reason);
    foreach (stock_actor_fields($actor) as $k => $v) { $p[$k] = $v; }
    return stock_call($p);
}
