<?php
/*
 * stock_hr/api/welfare.php ตัวปลอมสำหรับ tests/auth_test.php
 * ตรวจลายเซ็นแบบเดียวกับของจริง แล้วเขียน body ที่ได้รับลงไฟล์ FAKE_STOCK_LOG ให้เทสต์อ่าน
 */
header('Content-Type: application/json');
$raw = file_get_contents('php://input');
$ts = $_SERVER['HTTP_X_WELFARE_TIMESTAMP'] ?? '';
$sig = $_SERVER['HTTP_X_WELFARE_SIGNATURE'] ?? '';
if (!hash_equals(hash_hmac('sha256', $ts . '.' . $raw, getenv('STOCK_API_SECRET')), $sig) || abs(time() - (int) $ts) > 300) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'message' => 'bad signature']);
    return;
}
file_put_contents(getenv('FAKE_STOCK_LOG'), $raw . "\n", FILE_APPEND);
$in = json_decode($raw, true);
echo json_encode(match ($in['action']) {
    'submit' => ['ok' => true, 'message' => 'ok', 'doc_id' => 77, 'doc_no' => 'WRQ-0077', 'duplicate' => false, 'status' => []],
    'cancel' => ['ok' => true, 'message' => 'ok', 'doc_id' => 77],
    default => ['ok' => true, 'message' => 'ok', 'status' => []],
});
