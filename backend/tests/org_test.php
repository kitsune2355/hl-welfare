<?php
/* ============================================================
 *  backend/tests/org_test.php — ตั้งค่าองค์กร: บริษัท + ประเภทพนักงาน (api/org.php · sql/015)
 *  เรียกจาก tests/run.php (ใช้ Browser / check / section ของไฟล์นั้น)
 * ============================================================ */

section('ตั้งค่าองค์กร: บริษัท / ประเภทพนักงาน (api/org.php)');

$og = new Browser('10.0.9.21');
$og->req('POST', '/auth/login', array('username' => 'hr', 'password' => 'Secret-1234'));
$ogPay = new Browser('10.0.9.22');
$ogPay->req('POST', '/auth/login', array('username' => 'payroll', 'password' => 'Payroll-1234'));

function og_find($list, $key, $val) { foreach ($list as $x) { if ($x[$key] === $val) { return $x; } } return null; }

/* ---------- อ่าน ---------- */
$r = $og->req('GET', '/employee-types');
$types = $r['json']['data'];
$pro = og_find($types, 'code', 'PRO_SITE');
$central = og_find($types, 'code', 'CENTRAL');
$daily = og_find($types, 'code', 'DAILY');
$fixed = og_find($types, 'code', 'FIXED_TERM');
check('GET /employee-types: 5 ประเภทตั้งต้น (รวม FIXED_TERM จาก 019) + พฤติกรรมเดิม', $r['status'] === 200 && count($types) === 5
    && $pro['companies'] === array('PRO') && $pro['usesPosition'] === true && $central['usesDeptGroup'] === true
    && $daily['dailyCycle'] === true && !isset($pro['employeeCount']) && $fixed['name'] === 'สัญญาแบบมีกำหนดระยะเวลา' && $fixed['active'] === true, json_encode($pro));
$r = $og->req('GET', '/employee-types?usage=1');
$c = og_find($r['json']['data'], 'code', 'CENTRAL');
check('?usage=1: จำนวนพนักงาน / กฎที่ใช้', $c['employeeCount'] === (int)db_value("SELECT COUNT(*) FROM employees WHERE employee_type = 'CENTRAL'") && $c['ruleCount'] > 0);
$r = $og->req('GET', '/companies?usage=1');
$hl = og_find($r['json']['data'], 'code', 'HL');
check('GET /companies?usage=1: สี + จำนวนหน่วยงาน/พนักงาน/กฎ', $hl['color'] === '#2563eb' && $hl['siteCount'] > 0 && $hl['employeeCount'] > 0 && $hl['ruleCount'] > 0, json_encode($hl));

/* ---------- สิทธิ์ + ตรวจข้อมูล ---------- */
check('ไม่มีสิทธิ์ org.edit → 403', S($ogPay->req('POST', '/companies', array('code' => 'NEW', 'name' => 'x'))) === 403
    && S($ogPay->req('POST', '/employee-types', array('code' => 'X1', 'name' => 'x', 'tone' => 'info'))) === 403);
check('รหัสบริษัทผิดรูปแบบ / ซ้ำ → 422', S($og->req('POST', '/companies', array('code' => '1A', 'name' => 'x'))) === 422
    && S($og->req('POST', '/companies', array('code' => 'hl', 'name' => 'x'))) === 422);

/* ---------- บริษัทใหม่ ---------- */
$r = $og->req('POST', '/companies', array('code' => 'nw', 'name' => 'นิวเวิลด์', 'legalName' => 'บริษัท นิวเวิลด์ จำกัด', 'color' => '#EF4444'));
check('เพิ่มบริษัท → 201 · รหัสเป็นตัวพิมพ์ใหญ่ · ต่อท้ายลำดับ', $r['status'] === 201 && $r['json']['data']['code'] === 'NW'
    && $r['json']['data']['color'] === '#ef4444', json_encode($r['json']));
$list = $og->req('GET', '/companies');
$last = end($list['json']['data']);
check('บริษัทใหม่อยู่ท้ายรายการ + ใช้ได้ทันที (หน่วยงาน)', $last['code'] === 'NW'
    && S($og->req('POST', '/sites', array('companyCode' => 'NW', 'name' => 'สำนักงาน NW', 'hasGroupInsurance' => true, 'poloColor' => 'BLACK'))) === 201);
$r = $og->req('PUT', '/companies/NW', array('name' => 'นิวเวิลด์ (NW)', 'legalName' => '', 'color' => ''));
check('แก้ชื่อบริษัท (รหัสคงเดิม)', $r['status'] === 200 && $r['json']['data']['name'] === 'นิวเวิลด์ (NW)' && $r['json']['data']['code'] === 'NW');
check('ลบบริษัท → ไม่มี endpoint (405)', S($og->req('DELETE', '/companies/NW')) === 405);
$order = array('NW', 'HL', 'PRO', 'CNS', 'CIC', 'AS');
$r = $og->req('PUT', '/companies/order', array('order' => $order));
$codes = array();
$now = $og->req('GET', '/companies');
foreach ($now['json']['data'] as $x) { $codes[] = $x['code']; }
check('จัดลำดับบริษัท', $r['status'] === 200 && $codes === $order, json_encode($codes));
check('จัดลำดับไม่ครบ → 422', S($og->req('PUT', '/companies/order', array('order' => array('HL')))) === 422);

/* ---------- ประเภทใหม่: ใช้ได้เฉพาะ NW · มีกลุ่ม/ฝ่าย · รอบรายวัน ---------- */
check('ประเภท: ไม่เลือกสี / บริษัทไม่รู้จัก → 422', S($og->req('POST', '/employee-types', array('code' => 'T1', 'name' => 'ทดลอง'))) === 422
    && S($og->req('POST', '/employee-types', array('code' => 'T1', 'name' => 'ทดลอง', 'tone' => 'info', 'companies' => array('ZZ')))) === 422);
$r = $og->req('POST', '/employee-types', array('code' => 'contract_nw', 'name' => 'สัญญาจ้าง NW', 'description' => 'ทดสอบ',
    'companies' => array('NW'), 'usesDeptGroup' => true, 'usesPosition' => false, 'dailyCycle' => true, 'tone' => 'success'));
check('เพิ่มประเภท → 201', $r['status'] === 201 && $r['json']['data']['code'] === 'CONTRACT_NW' && $r['json']['data']['companies'] === array('NW'), json_encode($r['json']));

$site = db_one("SELECT id FROM sites WHERE company_code = 'NW' LIMIT 1");
$emp = $golden['reads']['employees'][0];
$ne = $emp; unset($ne['id']);
$ne['empCode'] = 'NW0001'; $ne['nationalId'] = ''; $ne['companyCode'] = 'NW'; $ne['siteId'] = (int)$site['id'];
$ne['employeeType'] = 'CONTRACT_NW'; $ne['deptGroup'] = null; $ne['level'] = null; $ne['status'] = 'ACTIVE';
$ne['endReason'] = null; $ne['endDate'] = null; $ne['lastWorkingDate'] = null;
$r = $og->req('POST', '/employees', $ne);
check('ประเภทใหม่ที่ตั้ง "ต้องมีกลุ่ม/ฝ่าย" → ไม่มีกลุ่ม = 422', $r['status'] === 422 && isset($r['json']['errors']['deptGroup']), json_encode($r['json']));
$ne['deptGroup'] = 'Support Line'; $ne['level'] = 3;
$r = $og->req('POST', '/employees', $ne);
check('พนักงานประเภทใหม่ในบริษัทใหม่ → 201', $r['status'] === 201, json_encode($r['json']));
$nwId = $r['status'] === 201 ? $r['json']['data']['id'] : 0;
$bad = $ne; $bad['empCode'] = 'NW0002'; $bad['companyCode'] = 'HL'; $bad['siteId'] = 1;
$r = $og->req('POST', '/employees', $bad);
check('ประเภทที่จำกัดบริษัท ใช้กับบริษัทอื่น → 422', $r['status'] === 422 && isset($r['json']['errors']['employeeType']), json_encode($r['json']));
org_cache_reset();
check('รอบรายวันตามพฤติกรรมที่ตั้ง (ไม่ใช่รหัส DAILY)', cycle_day_of(array('employeeType' => 'CONTRACT_NW'), array('insuranceCycleDay' => 5, 'insuranceCycleDayDaily' => 6)) === 6
    && cycle_day_of(array('employeeType' => 'CENTRAL'), array('insuranceCycleDay' => 5, 'insuranceCycleDayDaily' => 6)) === 5);

check('ลบประเภท → ไม่มี endpoint (405)', S($og->req('DELETE', '/employee-types/CONTRACT_NW')) === 405);
$t = $og->req('GET', '/employee-types?usage=1');
foreach ($t['json']['data'] as $x) { if ($x['code'] === 'CONTRACT_NW') { $t = $x; break; } }
$t['active'] = false;
$r = $og->req('PUT', '/employee-types/CONTRACT_NW', $t);
check('ปิดใช้งานประเภท → 200 · active = false', $r['status'] === 200 && $r['json']['data']['active'] === false, json_encode($r['json']));
org_cache_reset();
$keep = $og->req('GET', '/employees?q=NW0001');
$keep = $keep['json']['data'][0];
$keep['firstName'] = 'แก้ได้';
check('พนักงานเดิมของประเภทที่ปิด แก้ข้อมูลได้ (ค่าเดิมใช้ต่อ)', S($og->req('PUT', '/employees/' . $nwId, $keep)) === 200);
$ne2 = $ne; $ne2['empCode'] = 'NW0003';
$r = $og->req('POST', '/employees', $ne2);
check('เพิ่มพนักงานด้วยประเภทที่ปิดใช้งาน → 422 errors.employeeType', $r['status'] === 422 && isset($r['json']['errors']['employeeType']), json_encode($r['json']));
$t['active'] = true;
$og->req('PUT', '/employee-types/CONTRACT_NW', $t);
$r = $og->req('PUT', '/employee-types/CONTRACT_NW', array('name' => 'สัญญาจ้าง (NW)', 'description' => '', 'companies' => null,
    'usesDeptGroup' => false, 'usesPosition' => false, 'dailyCycle' => false, 'tone' => 'danger'));
check('แก้ประเภท (รหัสคงเดิม)', $r['status'] === 200 && $r['json']['data']['name'] === 'สัญญาจ้าง (NW)' && $r['json']['data']['companies'] === null);

/* ---------- ปิดใช้งานบริษัท · ตัวสุดท้ายปิดไม่ได้ ---------- */
$co = org_find_company('NW');
$co['active'] = false;
$r = $og->req('PUT', '/companies/NW', $co);
check('ปิดใช้งานบริษัท → 200 · active = false', $r['status'] === 200 && $r['json']['data']['active'] === false, json_encode($r['json']));
db_exec("UPDATE companies SET active = 0 WHERE code IN ('PRO', 'CNS', 'CIC', 'AS')");
$hl = org_find_company('HL');
$hl['active'] = false;
check('ปิดบริษัทสุดท้ายที่เปิดอยู่ → 409', S($og->req('PUT', '/companies/HL', $hl)) === 409);
db_exec("UPDATE companies SET active = 1");

/* ---------- เก็บกวาด (ตรงฐานข้อมูล — ระบบไม่มีการลบแล้ว) ---------- */
db_exec('DELETE FROM employees WHERE id = ?', array($nwId));
db_exec("DELETE FROM employee_types WHERE code = 'CONTRACT_NW'");
db_exec("DELETE FROM sites WHERE company_code = 'NW'");
db_exec("DELETE FROM companies WHERE code = 'NW'");
org_cache_reset();
$og->req('PUT', '/companies/order', array('order' => array('HL', 'PRO', 'CNS', 'CIC', 'AS')));
check('บันทึกกิจกรรม COMPANY / EMPLOYEE_TYPE', (int)db_value("SELECT COUNT(*) FROM audit_log WHERE entity IN ('COMPANY', 'EMPLOYEE_TYPE')") >= 8);
