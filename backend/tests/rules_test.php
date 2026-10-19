<?php
/* ============================================================
 *  backend/tests/rules_test.php — แก้เงื่อนไขสวัสดิการแบบมีวันที่มีผล + ชุดฟอร์มของหน่วยงาน (api/rules_edit.php)
 *  เรียกจาก tests/run.php (ใช้ Browser / check / section / make_user ของไฟล์นั้น)
 *  วันนี้ของเทสต์ = วันของ golden (today_override)
 * ============================================================ */

section('เงื่อนไขสวัสดิการ: แก้ผ่านหน้าจอ มีวันที่มีผล (api/rules_edit.php)');

$ed = new Browser('10.0.9.1');
$ed->req('POST', '/auth/login', array('username' => 'hr', 'password' => 'Secret-1234'));
$pay = new Browser('10.0.9.2');
$pay->req('POST', '/auth/login', array('username' => 'payroll', 'password' => 'Payroll-1234'));

$today = today_iso();
$later = add_days($today, 30);

function rules_find($list, $id) { foreach ($list as $r) { if ($r['id'] === $id) { return $r; } } return null; }
function rules_now($b, $kind = 'uniform') { $r = $b->req('GET', '/rules'); return $kind === null ? $r['json']['data'] : $r['json']['data'][$kind]; }
function rules_hist($b) { $r = $b->req('GET', '/rules/history'); return $r['json']['data']; }

$h = rules_hist($ed);
check('GET /rules/history: กฎทุกข้อ + ค่าตั้งค่า', count($h['insurance']) === 4 && count($h['uniform']) === 19 && count($h['settings']) >= 5
    && $h['today'] === $today);

$r16 = rules_find(rules_now($ed), 16);
$body = $r16;
$body['quantities']['START'] = array('POLO_BLACK' => 2, 'TECH_SHIRT' => 2, 'TECH_PANTS' => 2, 'SAFETY_SHOES' => 1);
$body['effectiveFrom'] = $later;
$r = $ed->req('PUT', '/rules/uniform/16', $body);
$t16 = rules_find($r['json']['data']['uniform'], 16);
check('แก้กฎล่วงหน้า → ยังใช้ฉบับเดิม + มีรายการรอมีผล', $r['status'] === 200
    && rules_find(rules_now($ed), 16) == $r16 && count($t16['pending']) === 1 && $t16['pending'][0]['effectiveFrom'] === $later, json_encode($r['json']));
$body['quantities']['START']['POLO_BLACK'] = 3;
$r = $ed->req('PUT', '/rules/uniform/16', $body);
$t16 = rules_find($r['json']['data']['uniform'], 16);
check('แก้ซ้ำวันเดียวกัน = แก้ฉบับที่รออยู่ ไม่เพิ่มฉบับ', count($t16['pending']) === 1 && $t16['pending'][0]['quantities']['START']['POLO_BLACK'] === 3);
$r = $ed->req('DELETE', '/rules/uniform/revisions/' . $t16['pending'][0]['revisionId']);
$t16 = rules_find($r['json']['data']['uniform'], 16);
check('ยกเลิกการเปลี่ยนที่รอมีผล', $r['status'] === 200 && count($t16['pending']) === 0);
$cur = rules_find(rules_hist($ed), 16);
check('ยกเลิกฉบับที่มีผลแล้วไม่ได้ → 409', S($ed->req('DELETE', '/rules/uniform/revisions/' . $t16['current']['revisionId'])) === 409);

$body['effectiveFrom'] = $today;
$r = $ed->req('PUT', '/rules/uniform/16', $body);
$now16 = rules_find(rules_now($ed), 16);
$t16 = rules_find($r['json']['data']['uniform'], 16);
check('แก้กฎมีผลวันนี้ → ใช้ทันที (จำนวนรวมคำนวณใหม่) + ประวัติเก็บฉบับเดิม', $r['status'] === 200
    && $now16['quantities']['START']['POLO_BLACK'] === 3 && $now16['qtyStart'] === 8 && count($t16['history']) === 2);

$bad = $body;
$bad['levelMin'] = 6; $bad['levelMax'] = 10;
$r = $ed->req('PUT', '/rules/uniform/16', $bad);
check('ระดับเกิน 9 → 422 พร้อมช่องที่ผิด', $r['status'] === 422 && isset($r['json']['errors']['levelMax']));
$bad = $body;
$bad['quantities'] = array('START' => array('NOPE' => 1));
check('รหัสรายการไม่มีจริง → 422', S($ed->req('PUT', '/rules/uniform/16', $bad)) === 422);
$bad['quantities'] = array('START' => array('POLO_BLACK' => 0), 'PROBATION' => array(), 'ANNUAL' => array());
check('ไม่ได้ชุดฟอร์มเลยสักรอบ → 422', S($ed->req('PUT', '/rules/uniform/16', $bad)) === 422);

$new = array('employeeType' => 'CENTRAL', 'companies' => array('HL'), 'waitDays' => 45, 'excludeContracts' => array(),
    'requireSiteInsurance' => false, 'note' => 'ทดสอบ', 'effectiveFrom' => $today);
$r = $ed->req('POST', '/rules/insurance', $new);
$ids = array();
foreach ($r['json']['data']['insurance'] as $t) { $ids[] = $t['id']; }
$newId = max($ids);
$added = rules_find(rules_now($ed, 'insurance'), $newId);
check('เพิ่มกฎประกันกลุ่ม → 201 + รหัสกฎใหม่', $r['status'] === 201 && $added !== null && $added['waitDays'] === 45);
$r = $ed->req('DELETE', '/rules/insurance/' . $newId . '?effectiveFrom=' . $later);
$tn = rules_find($r['json']['data']['insurance'], $newId);
check('เลิกใช้กฎล่วงหน้า → ยังใช้อยู่จนถึงวันนั้น', $r['status'] === 200 && rules_find(rules_now($ed, 'insurance'), $newId) !== null
    && $tn['pending'][0]['deleted'] === true);
$r = $ed->req('DELETE', '/rules/insurance/' . $newId);
$tn = rules_find($r['json']['data']['insurance'], $newId);
check('เลิกใช้กฎวันนี้ → ไม่อยู่ใน /rules แต่ยังมีประวัติ', $r['status'] === 200 && rules_find(rules_now($ed, 'insurance'), $newId) === null
    && $tn['current'] === null && count($tn['history']) >= 1);
check('แก้กฎที่ไม่มี → 404', S($ed->req('PUT', '/rules/insurance/9999', $new)) === 404);

$r = $ed->req('PUT', '/rules/settings', array('effectiveFrom' => $later, 'values' => array('uniformAnnualMonth' => 2)));
$s = rules_now($ed, null);
check('ค่าตั้งค่าล่วงหน้า → ยังใช้ค่าเดิม', $r['status'] === 200 && (int)$s['settings']['uniformAnnualMonth'] === 1);
check('ยกเลิกค่าตั้งค่าที่รอมีผล', S($ed->req('DELETE', '/rules/settings/uniformAnnualMonth/' . $later)) === 200
    && S($ed->req('DELETE', '/rules/settings/uniformAnnualMonth/' . $later)) === 404);
$r = $ed->req('PUT', '/rules/settings', array('values' => array('insuranceMaxAge' => 99)));
check('ค่าตั้งค่านอกช่วง → 422', $r['status'] === 422 && isset($r['json']['errors']['insuranceMaxAge']));

check('ไม่มีสิทธิ์ rules.edit (Payroll) → 403 · อ่านประวัติได้', S($pay->req('PUT', '/rules/uniform/16', $body)) === 403
    && S($pay->req('POST', '/rules/insurance', $new)) === 403 && S($pay->req('GET', '/rules/history')) === 200);

section('ชุดฟอร์มของหน่วยงาน (ตั้งทับกฎ)');
$emp = db_one("SELECT id FROM employees WHERE site_id = 5 AND employee_type = 'PRO_SITE' AND position = 'ช่างทีมโมบาย' LIMIT 1");
$q = array('START' => array('POLO_NAVY' => 4), 'PROBATION' => array(), 'ANNUAL' => array('POLO_NAVY' => 1));
$r = $ed->req('PUT', '/sites/5/uniform', array('overrides' => array(array('ruleId' => 16, 'quantities' => $q))));
check('ตั้งชุดฟอร์มของหน่วยงาน → คืนหน่วยงานพร้อม uniformOverrides', $r['status'] === 200
    && $r['json']['data']['uniformOverrides'][0]['ruleId'] === 16, json_encode($r['json']));
if ($emp) {
    $b = $ed->req('GET', '/employees/' . $emp['id'] . '/benefits');
    $u = $b['json']['data']['uniform'];
    $start = null;
    foreach ($u['entitlements'] as $e) { if ($e['key'] === 'START') { $start = $e; } }
    check('สิทธิของพนักงานในหน่วยงานนั้นใช้จำนวนของหน่วยงาน', $u['siteOverride'] === true && $start && $start['itemQty'] === array('POLO_NAVY' => 4));
}
check('กฎของบริษัทอื่น → 422', S($ed->req('PUT', '/sites/5/uniform', array('overrides' => array(array('ruleId' => 10, 'quantities' => $q))))) === 422);
check('ล้างชุดฟอร์มของหน่วยงาน → กลับไปใช้กฎกลาง', S($ed->req('PUT', '/sites/5/uniform', array('overrides' => array()))) === 200
    && count(repo_site(5)) && count(repo_site_overrides(5)) === 0);
check('บันทึกกิจกรรม RULE', (int)db_value("SELECT COUNT(*) FROM audit_log WHERE entity = 'RULE'") >= 8);
