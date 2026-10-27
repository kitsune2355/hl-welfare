<?php
/* ============================================================
 *  backend/tests/dept_groups_test.php — กลุ่ม / ฝ่าย (api/dept_groups.php)
 *  เรียกจาก tests/run.php (ใช้ Browser / check / section ของไฟล์นั้น)
 * ============================================================ */

section('กลุ่ม / ฝ่าย: เพิ่ม / เปลี่ยนชื่อ / ลบ (api/dept_groups.php)');

$dg = new Browser('10.0.9.11');
$dg->req('POST', '/auth/login', array('username' => 'hr', 'password' => 'Secret-1234'));
$dgPay = new Browser('10.0.9.12');
$dgPay->req('POST', '/auth/login', array('username' => 'payroll', 'password' => 'Payroll-1234'));

function dg_find($list, $name) { foreach ($list as $g) { if ($g['name'] === $name) { return $g; } } return null; }

$r = $dg->req('GET', '/dept-groups');
$list = $r['json']['data'];
$sl = dg_find($list, 'Support Line');
check('GET /dept-groups: 6 กลุ่มตั้งต้น + จำนวนพนักงาน/กฎที่ใช้', $r['status'] === 200 && count($list) >= 6
    && $sl && $sl['ruleCount'] === 2 && $sl['employeeCount'] === (int)db_value("SELECT COUNT(*) FROM employees WHERE dept_group = 'Support Line'"),
    json_encode($sl));

check('ผู้ใช้ที่ไม่มีสิทธิ์แก้เงื่อนไข → 403', S($dgPay->req('POST', '/dept-groups', array('name' => 'ทดสอบ'))) === 403);
check('ชื่อว่าง → 422', S($dg->req('POST', '/dept-groups', array('name' => '  '))) === 422);
check('ชื่อซ้ำ (ไม่สนตัวพิมพ์) → 422', S($dg->req('POST', '/dept-groups', array('name' => 'support line'))) === 422);

$r = $dg->req('POST', '/dept-groups', array('name' => '  ฝ่ายทดสอบ  '));
$new = $r['json']['data'];
check('เพิ่มกลุ่ม → 201 + ตัดช่องว่าง + ต่อท้ายรายการ', $r['status'] === 201 && $new['name'] === 'ฝ่ายทดสอบ' && $new['employeeCount'] === 0,
    json_encode($r['json']));
$last = $dg->req('GET', '/dept-groups');
$last = end($last['json']['data']);
check('กลุ่มใหม่อยู่ท้ายรายการ', $last['id'] === $new['id']);

check('ลบกลุ่ม → ไม่มี endpoint (405)', S($dg->req('DELETE', '/dept-groups/' . $sl['id'])) === 405);

/* เปลี่ยนชื่อ → ชื่อในพนักงานและกฎชุดฟอร์มทุกฉบับเปลี่ยนตาม */
$empBefore = $sl['employeeCount'];
$r = $dg->req('PUT', '/dept-groups/' . $sl['id'], array('name' => 'Support Line (ใหม่)'));
check('เปลี่ยนชื่อ → 200', $r['status'] === 200 && $r['json']['data']['name'] === 'Support Line (ใหม่)', json_encode($r['json']));
$rules = $dg->req('GET', '/rules');
$r1 = null;
foreach ($rules['json']['data']['uniform'] as $x) { if ($x['id'] === 1) { $r1 = $x; } }
check('เปลี่ยนชื่อ: พนักงาน + กฎชุดฟอร์มเปลี่ยนตาม · ชื่อเดิมไม่เหลือ',
    (int)db_value("SELECT COUNT(*) FROM employees WHERE dept_group = 'Support Line (ใหม่)'") === $empBefore
    && (int)db_value("SELECT COUNT(*) FROM employees WHERE dept_group = 'Support Line'") === 0
    && $r1 && $r1['deptGroups'] === array('Support Line (ใหม่)'),
    json_encode($r1 ? $r1['deptGroups'] : null));
check('เปลี่ยนชื่อ: บันทึกกิจกรรมบอกจำนวนที่แก้',
    strpos(db_value("SELECT summary FROM audit_log WHERE entity = 'DEPT_GROUP' ORDER BY id DESC LIMIT 1"), 'เปลี่ยนชื่อกลุ่ม / ฝ่าย Support Line → Support Line (ใหม่)') === 0);
$dg->req('PUT', '/dept-groups/' . $sl['id'], array('name' => 'Support Line'));     // คืนชื่อเดิมให้เทสต์อื่น

$r = $dg->req('PUT', '/dept-groups/' . $new['id'], array('name' => 'ฝ่ายทดสอบ', 'active' => false));
$after = $dg->req('GET', '/dept-groups');
$f = dg_find($after['json']['data'], 'ฝ่ายทดสอบ');
check('ปิดใช้งานกลุ่ม → 200 · ยังอยู่ในรายการ (active = false) · audit', $r['status'] === 200 && $f && $f['active'] === false
    && strpos(db_value("SELECT summary FROM audit_log WHERE entity = 'DEPT_GROUP' ORDER BY id DESC LIMIT 1"), 'ปิดใช้งานกลุ่ม / ฝ่าย ฝ่ายทดสอบ') === 0, json_encode($r['json']));
db_exec('DELETE FROM dept_groups WHERE id = ?', array($new['id']));   // เก็บกวาด
