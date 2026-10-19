<?php
/* ============================================================
 *  web/api/stock_bridge.php — ตัวกลางส่งคำขอเบิกชุดฟอร์มไประบบสต็อก Uniform (stock_hr)
 *
 *  หน้าเว็บเรียกไฟล์นี้ (infrastructure/http/stockGateway.js) ไฟล์นี้เซ็นคำขอ
 *  ด้วยกุญแจลับแล้วส่งต่อไป stock_hr/api/welfare.php กุญแจจึงไม่หลุดไปถึงเบราว์เซอร์
 *
 *    เบราว์เซอร์ --JSON--> stock_bridge.php --JSON + HMAC--> stock_hr/api/welfare.php
 *
 *  body: { "action": "catalog" | "submit" | "status" | "cancel", ...ข้อมูลของคำสั่งนั้น }
 *  สัญญาของแต่ละคำสั่งดูที่หัวไฟล์ stock_hr/api/welfare.php
 *
 *  ค่าตั้งอยู่ใน stock_bridge.config.php (ไม่ขึ้น repo — ดู .example)
 *
 *  เฟส 1 (mock) ยังไม่มีระบบล็อกอินฝั่ง PHP ไฟล์นี้จึงรับเฉพาะคำขอจากเครื่องตัวเอง
 *  (ตั้ง $stock_bridge_allow_remote = true ได้ถ้าจำลองข้ามเครื่อง)
 *  เฟส 2 ให้ย้ายงานนี้เข้า PHP backend ที่ตรวจ session ก่อน แล้วลบไฟล์นี้ทิ้ง
 *
 *  เขียนให้รองรับ PHP 5.2.6 (AppServ) — ใช้ curl
 * ============================================================ */

error_reporting(E_ALL ^ E_NOTICE);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function bridge_fail($message, $status = 400)
{
    $text = array(400 => 'Bad Request', 403 => 'Forbidden', 405 => 'Method Not Allowed', 502 => 'Bad Gateway', 503 => 'Service Unavailable');
    header('HTTP/1.1 ' . $status . ' ' . (isset($text[$status]) ? $text[$status] : 'Error'));
    echo json_encode(array('ok' => false, 'message' => $message));
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    bridge_fail('รองรับเฉพาะการส่งแบบ POST', 405);
}

$stock_api_url = '';
$stock_api_secret = '';
$stock_bridge_allow_remote = false;
$config = dirname(__FILE__) . '/stock_bridge.config.php';
if (!is_file($config)) {
    bridge_fail('ยังไม่ได้ตั้งค่าการเชื่อมต่อระบบสต็อก (web/api/stock_bridge.config.php)', 503);
}
include $config;

$remote = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
if (!$stock_bridge_allow_remote && $remote !== '127.0.0.1' && $remote !== '::1') {
    bridge_fail('ตัวกลางระบบสต็อกรับเฉพาะคำขอจากเครื่องนี้', 403);
}

/* ---------- ตรวจคำสั่งก่อนส่งต่อ ----------
 * แปลงแล้วเข้ารหัส JSON ใหม่ ส่งไปเฉพาะ JSON ที่ถูกต้อง และคำสั่งที่รู้จัก */
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    bridge_fail('ข้อมูลที่ส่งมาไม่ใช่ JSON');
}
$action = isset($input['action']) ? $input['action'] : '';
if (!in_array($action, array('catalog', 'submit', 'status', 'cancel'))) {
    bridge_fail('ไม่รู้จักคำสั่งที่ส่งมา');
}

$body = json_encode($input);
$ts   = (string)time();
$sign = hash_hmac('sha256', $ts . '.' . $body, $stock_api_secret);

$ch = curl_init($stock_api_url);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 20);
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
    'Content-Type: application/json',
    'X-Welfare-Timestamp: ' . $ts,
    'X-Welfare-Signature: ' . $sign
));
$out    = curl_exec($ch);
$status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error  = curl_error($ch);
curl_close($ch);

if ($out === false) {
    bridge_fail('เชื่อมต่อระบบสต็อกไม่ได้ (' . $error . ')', 502);
}

/* ระบบสต็อกตอบ JSON { ok, message, ... } เสมอ ถ้าไม่ใช่ = ปลายทางพัง/ตั้ง URL ผิด */
$reply = json_decode($out, true);
if (!is_array($reply)) {
    bridge_fail('ระบบสต็อกตอบกลับผิดรูปแบบ (HTTP ' . $status . ')', 502);
}

if ($status >= 400) {
    header('HTTP/1.1 ' . $status . ' Error');
}
echo $out;
