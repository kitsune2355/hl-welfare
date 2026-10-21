<?php
/* ============================================================
 *  backend/usecases/notifications.php — การแจ้งเตือน (กระดิ่งบนแถบบน · ตาราง notifications ของ sql/013)
 *
 *  สร้างแจ้งเตือน
 *    notify_stock_change()      ใบเบิกในสต็อกเปลี่ยนสถานะ → HR ที่ส่งเบิก (ไม่มี = HR ที่ส่งเบิกของบริษัทนั้นได้)
 *    notify_insurance_urgent()  พ้นสภาพแบบเลิกจ้าง/กระทำผิด → HR ที่แจ้งประกันของบริษัทนั้นได้ (ยกเว้นคนที่บันทึก)
 *  ยังไม่ได้รัน 013 (ไม่มีตาราง) → ไม่สร้าง ไม่ error · สร้างไม่สำเร็จต้องไม่ทำให้งานหลักล้ม
 *
 *  API (ทุกคนที่ login — เห็นเฉพาะของตัวเอง)
 *    GET  /notifications?before=<id>&limit=10   รายการเก่ากว่า id (ไม่ส่ง = ล่าสุด) · เลื่อนลงโหลดเพิ่ม
 *    GET  /notifications/unread                 ตัวเลขบนกระดิ่ง (หน้าเว็บถามทุก 90 วินาที)
 *                                               + ดึงสถานะใบเบิกจากสต็อกให้ด้วย ไม่เกินทุก 3 นาที (ต่อขอบเขตบริษัท)
 *    POST /notifications/{id}/read · POST /notifications/read-all
 * ============================================================ */

define('NOTIFY_PAGE_MAX', 30);
define('NOTIFY_STOCK_SYNC_SECONDS', 180);

function notify_ready()
{
    static $ok = null;
    if ($ok === null) {
        try {
            $ok = db_value("SHOW TABLES LIKE 'notifications'") !== null;
        } catch (Exception $e) {
            $ok = false;
        }
    }
    return $ok;
}

/** สร้างแจ้งเตือนถึงผู้ใช้หลายคน (id ซ้ำ/ว่างถูกตัดทิ้ง) */
function notify_users($userIds, $type, $title, $message, $link, $employeeId, $actor)
{
    if (!notify_ready()) { return 0; }
    $by = $actor ? $actor['username'] : 'system';
    $now = db_now();
    $sent = array();
    foreach ($userIds as $uid) {
        $uid = (int)$uid;
        if ($uid <= 0 || isset($sent[$uid])) { continue; }
        $sent[$uid] = true;
        try {
            db_exec('INSERT INTO notifications (user_id, type, title, message, link, employee_id, created_at, created_by, updated_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                array($uid, $type, notify_cut($title, 200), notify_cut($message, 500), $link,
                    $employeeId === null ? null : (int)$employeeId, $now, $by, $by));
        } catch (Exception $e) {
            /* แจ้งเตือนเป็นของเสริม — บันทึกไม่ได้ต้องไม่ทำให้งานหลัก (ซิงก์สต็อก / บันทึกพนักงาน) ล้ม */
        }
    }
    return count($sent);
}

function notify_cut($s, $n)
{
    return function_exists('mb_substr') ? mb_substr((string)$s, 0, $n, 'UTF-8') : (string)$s;
}

/** ผู้ใช้ที่ใช้งานอยู่ มีสิทธิ์ $cap และดูแลบริษัท $companyCode ได้ */
function notify_users_with_cap($cap, $companyCode, $excludeUserId = 0)
{
    $out = array();
    foreach (db_all('SELECT id, role, company_code FROM users WHERE is_active = 1') as $r) {
        if ((int)$r['id'] === (int)$excludeUserId) { continue; }
        if (!cap_allowed($r['role'], $cap)) { continue; }
        if (scoped_role($r['role']) && (string)$r['company_code'] !== (string)$companyCode) { continue; }
        $out[] = (int)$r['id'];
    }
    return $out;
}

/**
 * ใบเบิกชุดฟอร์มในสต็อกเปลี่ยนสถานะ (api_stock_sync) — $kind = APPROVED | CANCELLED | ISSUED | RECEIVED
 * $senderId = uniform_issues.issued_by_user_id (อ่านก่อนลบแถวกรณียกเลิก)
 */
function notify_stock_change($kind, $senderId, $employee, $prevStock, $next, $actor)
{
    if (!notify_ready()) { return 0; }
    $docNo = $next && $next['docNo'] ? $next['docNo'] : $prevStock['docNo'];
    $who = $employee ? full_name($employee) . ' (' . $employee['empCode'] . ')' : 'พนักงาน';
    $empId = $employee ? $employee['id'] : null;
    $link = $empId ? 'employee.html?id=' . $empId : 'uniform.html?tab=waiting';
    if ($kind === 'APPROVED') {
        $type = 'stock_approved';
        $title = 'อนุมัติใบเบิก ' . $docNo . ' แล้ว';
        $message = 'ชุดฟอร์มของ ' . $who . ' — รอคลังจ่าย';
    } elseif ($kind === 'CANCELLED') {
        $note = $next ? (string)$next['cancelNote'] : '';
        $rejected = strpos($note, 'ไม่อนุมัติ') === 0;
        $type = $rejected ? 'stock_rejected' : 'stock_cancelled';
        $title = ($rejected ? 'ไม่อนุมัติใบเบิก ' : 'คลังยกเลิกใบเบิก ') . $docNo;
        $message = $who . ($note !== '' ? ' · ' . $note : '') . ' — กลับเป็นค้างแจก ส่งเบิกใหม่ได้';
    } elseif ($kind === 'ISSUED') {
        $type = 'stock_issued';
        $title = 'คลังจ่ายชุดฟอร์มตามใบ ' . $docNo . ' แล้ว';
        $message = $who . ' — รอพนักงานเซ็นรับ';
    } elseif ($kind === 'RECEIVED') {
        $type = 'stock_received';
        $title = 'เซ็นรับชุดฟอร์มแล้ว — ใบ ' . $docNo;
        $message = $who . ' รับชุดฟอร์มเรียบร้อย';
    } else {
        return 0;
    }
    $to = array();
    if ($senderId) {
        $s = db_one('SELECT id FROM users WHERE id = ? AND is_active = 1', array((int)$senderId));
        if ($s) { $to[] = (int)$s['id']; }
    }
    /* ผู้ส่งไม่มีแล้ว (บัญชีถูกปิด / ใบเก่าก่อนมีระบบผู้ใช้) → HR ที่ส่งเบิกของบริษัทนั้นได้ */
    if (!count($to) && $employee) { $to = notify_users_with_cap('stock.request', $employee['companyCode']); }
    return notify_users($to, $type, $title, $message, $link, $empId, $actor);
}

/** บันทึกพ้นสภาพแบบต้องแจ้งออกประกันทันที (เลิกจ้าง / กระทำผิด) */
function notify_insurance_urgent($employee, $actor)
{
    if (!notify_ready()) { return 0; }
    $reason = label_end_reason($employee['endReason']);
    $to = notify_users_with_cap('insurance.submit', $employee['companyCode'], $actor ? $actor['id'] : 0);
    return notify_users($to, 'insurance_urgent', 'แจ้งออกประกันทันที: ' . full_name($employee) . ' (' . $employee['empCode'] . ')',
        $reason . ($employee['endDate'] ? ' · วันพ้นสภาพ ' . thai_date_short($employee['endDate']) : '') . ' — ไม่ต้องรอรอบ ส่งออกไฟล์แจ้งประกันได้ที่หน้าประกันกลุ่ม',
        'insurance.html?tab=urgent', $employee['id'], $actor);
}

/* ============================================================
 *  API
 * ============================================================ */
function map_notification($r)
{
    return array(
        'id' => (int)$r['id'],
        'type' => $r['type'],
        'title' => $r['title'],
        'message' => $r['message'],
        'link' => $r['link'],
        'employeeId' => int_or_null($r['employee_id']),
        'read' => (int)$r['is_read'] === 1,
        'at' => stamp_from_db($r['created_at']),
    );
}

function notify_unread_count($userId)
{
    return notify_ready() ? (int)db_value('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0', array((int)$userId)) : 0;
}

/** GET /notifications?before=&limit= → {items, unread, total, hasMore, nextBefore} */
function api_notifications($req, $params)
{
    $u = auth_require($req);
    if (!notify_ready()) { return array('items' => array(), 'unread' => 0, 'total' => 0, 'hasMore' => false, 'nextBefore' => null); }
    $limit = max(1, min((int)req_query($req, 'limit', 10), NOTIFY_PAGE_MAX));
    $before = (int)req_query($req, 'before', 0);
    $args = array((int)$u['id']);
    $sql = 'SELECT * FROM notifications WHERE user_id = ?';
    if ($before > 0) { $sql .= ' AND id < ?'; $args[] = $before; }
    /* ขอเกิน 1 แถว เพื่อรู้ว่ายังมีหน้าถัดไปไหม */
    $rows = db_all($sql . ' ORDER BY id DESC LIMIT ' . ($limit + 1), $args);
    $hasMore = count($rows) > $limit;
    if ($hasMore) { array_pop($rows); }
    $items = array();
    foreach ($rows as $r) { $items[] = map_notification($r); }
    return array(
        'items' => $items,
        'unread' => notify_unread_count($u['id']),
        'total' => (int)db_value('SELECT COUNT(*) FROM notifications WHERE user_id = ?', array((int)$u['id'])),
        'hasMore' => $hasMore,
        'nextBefore' => count($items) ? $items[count($items) - 1]['id'] : null,
    );
}

/** GET /notifications/unread → {unread} · ซิงก์สถานะใบเบิกจากสต็อกให้ด้วยเป็นระยะ */
function api_notifications_unread($req, $params)
{
    $u = auth_require($req);
    notify_auto_stock_sync($u);
    return array('unread' => notify_unread_count($u['id']));
}

/**
 * ไม่มีใครเปิดหน้าชุดฟอร์ม = ไม่มีใครดึงสถานะจากสต็อก → ผลอนุมัติ/คลังจ่ายไม่ถึงกระดิ่ง
 * ใช้จังหวะที่หน้าเว็บถามตัวเลขบนกระดิ่ง ดึงให้ไม่เกินทุก 3 นาทีต่อขอบเขตบริษัท (จำเวลาไว้ในไฟล์ชั่วคราว)
 * สต็อกไม่ตอบ / ยังไม่ได้ตั้งค่า → ข้ามเงียบ ๆ (ตัวเลขบนกระดิ่งต้องตอบได้เสมอ)
 */
function notify_auto_stock_sync($u)
{
    if (!notify_ready() || !function_exists('stock_sync_run')) { return; }
    $scope = data_scope();
    $file = rtrim(sys_get_temp_dir(), '/\\') . '/hlw_stock_sync_' . md5((string)$GLOBALS['hlw_config']['db_name'] . '|' . ($scope === null ? '*' : $scope)) . '.txt';
    $last = @file_get_contents($file);
    if ($last !== false && clock_time() - (int)$last < NOTIFY_STOCK_SYNC_SECONDS) { return; }
    @file_put_contents($file, (string)clock_time());
    try {
        stock_sync_run($u);
    } catch (Exception $e) {
        /* สต็อกล่ม/ยังไม่ตั้งค่า — ลองใหม่รอบหน้า */
    }
}

function api_notification_read($req, $params)
{
    $u = auth_require($req);
    if (notify_ready()) {
        db_exec('UPDATE notifications SET is_read = 1, read_at = ?, updated_by = ? WHERE id = ? AND user_id = ? AND is_read = 0',
            array(db_now(), $u['username'], param_id($params), (int)$u['id']));
    }
    return array('unread' => notify_unread_count($u['id']));
}

function api_notifications_read_all($req, $params)
{
    $u = auth_require($req);
    if (notify_ready()) {
        db_exec('UPDATE notifications SET is_read = 1, read_at = ?, updated_by = ? WHERE user_id = ? AND is_read = 0',
            array(db_now(), $u['username'], (int)$u['id']));
    }
    return array('unread' => 0);
}
