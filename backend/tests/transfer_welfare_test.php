<?php
/* ============================================================
 *  backend/tests/transfer_welfare_test.php — โอนย้ายพนักงาน (api/transfers.php) + สวัสดิการเพิ่มเติม (api/welfare.php)
 *  เรียกจาก tests/run.php (ใช้ Browser / check / section / make_user ของไฟล์นั้น)
 * ============================================================ */

section('โอนย้ายพนักงาน: ประวัติสังกัด + วันที่มีผล (api/transfers.php)');

$ta = new Browser('10.0.20.1');
$ta->req('POST', '/auth/login', array('username' => 'hr', 'password' => 'Secret-1234'));
make_user('hrcns2', 'Hrcns-12345', 'HR บริษัท CNS', 'HR_COMPANY');
db_exec("UPDATE users SET company_code = 'CNS' WHERE username = 'hrcns2'");
$tc = new Browser('10.0.20.2');
$tc->req('POST', '/auth/login', array('username' => 'hrcns2', 'password' => 'Hrcns-12345'));
$today = today_iso();

$row = db_one("SELECT e.id, e.site_id FROM employees e WHERE e.company_code = 'CNS' AND e.status = 'ACTIVE' AND e.active = 1
               AND e.employee_type = 'MAID_CNS' AND e.start_date < ? ORDER BY e.id LIMIT 1", array('2026-01-01'));
$empId = (int)$row['id'];
$newSite = (int)db_value("SELECT id FROM sites WHERE company_code = 'CNS' AND id <> ? AND active = 1 ORDER BY id LIMIT 1", array((int)$row['site_id']));
$hlSite = (int)db_value("SELECT id FROM sites WHERE company_code = 'HL' AND active = 1 ORDER BY id LIMIT 1");
$before = $ta->req('GET', '/employees/' . $empId . '/benefits');
$emp = $before['json']['data']['employee'];
$to = array('companyCode' => 'CNS', 'siteId' => $newSite, 'employeeType' => $emp['employeeType'], 'deptGroup' => $emp['deptGroup'],
    'position' => $emp['position'], 'level' => $emp['level']);

check('benefits มี transfers ว่าง + welfare ว่าง', $before['status'] === 200 && $before['json']['data']['transfers'] === array()
    && $before['json']['data']['welfare'] === array());
$r = $ta->req('POST', '/employees/' . $empId . '/transfers', array('effectiveDate' => '2026-11-01', 'to' => $emp));
check('สังกัดใหม่เหมือนเดิม → 422', $r['status'] === 422 && isset($r['json']['errors']['siteId']), json_encode($r['json']));
$r = $ta->req('POST', '/employees/' . $empId . '/transfers', array('effectiveDate' => '2026-11-01', 'to' => array_merge($to, array('siteId' => $hlSite))));
check('หน่วยงานคนละบริษัท → 422', $r['status'] === 422 && isset($r['json']['errors']['siteId']));
$r = $tc->req('POST', '/employees/' . $empId . '/transfers', array('effectiveDate' => '2026-11-01',
    'to' => array_merge($to, array('companyCode' => 'HL', 'siteId' => $hlSite, 'employeeType' => 'CENTRAL', 'deptGroup' => 'Support Line', 'level' => 2))));
check('HR บริษัท CNS ย้ายไปบริษัทอื่น → 403', $r['status'] === 403 && $r['json']['code'] === 'OUT_OF_SCOPE', json_encode($r['json']));

$r = $tc->req('POST', '/employees/' . $empId . '/transfers', array('effectiveDate' => '2026-11-01', 'to' => $to, 'resetWait' => true, 'note' => 'ย้ายไซต์'));
$d = $r['json']['data'];
check('ตั้งล่วงหน้า → 201 · PENDING · ข้อมูลพนักงานยังเป็นค่าเดิม', $r['status'] === 201 && $d['transfers'][0]['status'] === 'PENDING'
    && $d['employee']['siteId'] === $emp['siteId'] && $d['transfers'][0]['from']['siteId'] === $emp['siteId']
    && $d['transfers'][0]['createdBy'] === 'HR บริษัท CNS', json_encode($r['json']));
$tid = $d['transfers'][0]['id'];
$r = $ta->req('POST', '/employees/' . $empId . '/transfers', array('effectiveDate' => '2026-12-01', 'to' => $to));
check('มีรายการรอมีผลอยู่แล้ว → 422', $r['status'] === 422 && isset($r['json']['errors']['effectiveDate']));

$GLOBALS['hlw_config']['today_override'] = '2026-11-01';
$b = $ta->req('GET', '/employees/' . $empId . '/benefits');
$e2 = $b['json']['data']['employee'];
$t2 = $b['json']['data']['transfers'][0];
check('ถึงวันที่มีผล → ย้ายเอง · benefitStartDate = วันที่ย้าย · APPLIED', $e2['siteId'] === $newSite && $e2['benefitStartDate'] === '2026-11-01'
    && $t2['status'] === 'APPLIED' && $t2['appliedAt'] !== null, json_encode($b['json']['data']['transfers']));
check('ประกันกลุ่มนับวันรอจากวันที่ย้าย', $b['json']['data']['insurance']['eligibleDate'] === add_days('2026-11-01', 120)
    || $b['json']['data']['insurance']['eligible'] === false, json_encode($b['json']['data']['insurance']));
$act = db_one("SELECT * FROM audit_log WHERE entity = 'EMPLOYEE' AND action = 'TRANSFER' AND employee_id = ? ORDER BY id DESC LIMIT 1", array($empId));
check('บันทึกกิจกรรม TRANSFER โดยระบบ', $act && $act['user_name'] === 'system' && strpos($act['summary'], 'ตั้งไว้โดย HR บริษัท CNS') !== false, json_encode($act));
$r = $ta->req('DELETE', '/employees/' . $empId . '/transfers/' . $tid);
check('ยกเลิกการย้ายที่มีผลแล้ว → 409', $r['status'] === 409);

$r = $ta->req('POST', '/employees/' . $empId . '/transfers', array('effectiveDate' => '2026-12-01', 'to' => array_merge($to, array('siteId' => (int)$row['site_id']))));
$tid2 = $r['json']['data']['transfers'][1]['id'];
$r = $ta->req('DELETE', '/employees/' . $empId . '/transfers/' . $tid2);
check('ยกเลิกการย้ายที่รอมีผล → CANCELLED', $r['status'] === 200 && $r['json']['data'][1]['status'] === 'CANCELLED');
$r = $tc->req('GET', '/employees/' . (int)db_value("SELECT id FROM employees WHERE company_code = 'HL' LIMIT 1") . '/transfers');
check('HR บริษัท CNS ดูประวัติการย้ายพนักงาน HL → 404', $r['status'] === 404);
$GLOBALS['hlw_config']['today_override'] = $today;

section('สวัสดิการเพิ่มเติม (api/welfare.php)');
$prog = array('name' => 'ของขวัญปีใหม่', 'icon' => 'gift', 'frequency' => 'YEARLY', 'unit' => 'บาท',
    'rules' => array(array('label' => 'ทุกคน', 'amount' => 500)),
    'fields' => array(array('label' => 'ของที่ให้', 'type' => 'select', 'options' => array('กระเช้า', 'บัตรกำนัล'), 'required' => true)));
$r = $tc->req('POST', '/welfare/programs', $prog);
check('HR บริษัทสร้างสวัสดิการ → 403 (welfare.manage มีผลทุกบริษัท)', $r['status'] === 403);
$r = $ta->req('POST', '/welfare/programs', array_merge($prog, array('rules' => array())));
check('ไม่มีเงื่อนไข → 422', $r['status'] === 422 && isset($r['json']['errors']['rules']));
$r = $ta->req('POST', '/welfare/programs', $prog);
$p = $r['json']['data'];
check('สร้าง → 201 · เติมรหัสเงื่อนไข/ช่องข้อมูล', $r['status'] === 201 && $p['rules'][0]['id'] === 1 && $p['fields'][0]['key'] === 'f1'
    && $p['active'] === true, json_encode($r['json']));
check('ชื่อซ้ำ → 422', S($ta->req('POST', '/welfare/programs', $prog)) === 422);
$list = $tc->req('GET', '/welfare/programs');
check('ทุกคนอ่านรายการได้ (เมนู)', $list['status'] === 200 && count($list['json']['data']) === 1);

$roster = $tc->req('GET', '/welfare/programs/' . $p['id'] . '/roster');
$cnsOnly = true;
foreach ($roster['json']['data'] as $x) { if ($x['employee']['companyCode'] !== 'CNS') { $cnsOnly = false; } }
check('ผู้มีสิทธิ์: HR บริษัทเห็นเฉพาะ CNS', $roster['status'] === 200 && count($roster['json']['data']) > 0 && $cnsOnly);
$pick = null;
foreach ($roster['json']['data'] as $x) { if ($x['status']['state'] === 'DUE' && $x['employee']['status'] === 'ACTIVE') { $pick = $x; break; } }
$in = array('employeeId' => $pick['employee']['id'], 'periodKey' => 'Y-' . substr($today, 0, 4), 'date' => $today, 'amount' => 500);
$r = $tc->req('POST', '/welfare/programs/' . $p['id'] . '/records', $in);
check('ช่องบังคับว่าง → 422 data.f1', $r['status'] === 422 && isset($r['json']['errors']['data.f1']), json_encode($r['json']));
$in['data'] = array('f1' => 'กระเช้า', 'zzz' => 'ทิ้ง');
$r = $tc->req('POST', '/welfare/programs/' . $p['id'] . '/records', $in);
$rec = $r['json']['data'];
check('บันทึกการให้ → 201 · เก็บเฉพาะช่องที่กำหนด · ผู้บันทึกจาก session', $r['status'] === 201 && $rec['data'] === array('f1' => 'กระเช้า')
    && $rec['recordedBy'] === 'HR บริษัท CNS' && $rec['amount'] === 500, json_encode($r['json']));
check('ให้ซ้ำรอบเดิม → 422', S($tc->req('POST', '/welfare/programs/' . $p['id'] . '/records', $in)) === 422);
$hlEmp = (int)db_value("SELECT id FROM employees WHERE company_code = 'HL' AND status = 'ACTIVE' LIMIT 1");
check('HR บริษัทให้พนักงานบริษัทอื่น → 404', S($tc->req('POST', '/welfare/programs/' . $p['id'] . '/records', array_merge($in, array('employeeId' => $hlEmp)))) === 404);
$recs = $ta->req('GET', '/welfare/programs/' . $p['id'] . '/records');
check('ประวัติการให้มี employee', $recs['status'] === 200 && $recs['json']['data'][0]['employee']['id'] === $pick['employee']['id']);
$dash = $ta->req('GET', '/dashboard');
$due = $dash['json']['data']['welfareDue'];
check('dashboard.welfareDue', count($due) === 1 && $due[0]['programId'] === $p['id'] && $due[0]['due'] > 0, json_encode($due));
$b = $ta->req('GET', '/employees/' . $pick['employee']['id'] . '/benefits');
check('benefits.welfare: รอบนี้ให้แล้ว', $b['json']['data']['welfare'][0]['status']['periods'][count($b['json']['data']['welfare'][0]['status']['periods']) - 1]['done'] === true);
$r = $tc->req('DELETE', '/welfare/records/' . $rec['id']);
check('ยกเลิกการให้ → 204 + บันทึกกิจกรรม', $r['status'] === 204
    && db_value("SELECT COUNT(*) FROM audit_log WHERE entity = 'WELFARE' AND action = 'CANCEL'") == 1);
$r = $ta->req('PUT', '/welfare/programs/' . $p['id'], array_merge($p, array('active' => false)));
check('ปิดใช้งาน → active = false', $r['status'] === 200 && $r['json']['data']['active'] === false);
check('ปิดแล้วบันทึกการให้ไม่ได้ → 409', S($tc->req('POST', '/welfare/programs/' . $p['id'] . '/records', $in)) === 409);
$dash = $ta->req('GET', '/dashboard');
check('ปิดแล้วไม่อยู่ในตัวนับเมนู', $dash['json']['data']['welfareDue'] === array());
