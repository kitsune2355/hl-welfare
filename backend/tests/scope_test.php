<?php
/* ============================================================
 *  backend/tests/scope_test.php — HR บริษัท (HR_COMPANY) เห็นและทำรายการได้เฉพาะพนักงานบริษัทของตัวเอง
 *  เรียกจาก tests/run.php (ใช้ Browser / check / section / make_user ของไฟล์นั้น) — รันหลังเทสต์อื่น (ยกเลิก batch จริง)
 * ============================================================ */

section('ขอบเขตบริษัท: HR บริษัทเห็นเฉพาะบริษัทตัวเอง (permissions.php data_scope)');

make_user('hrcns', 'Hrcns-12345', 'HR บริษัท CNS', 'HR_COMPANY');
db_exec("UPDATE users SET company_code = 'CNS' WHERE username = 'hrcns'");
make_user('hrnone', 'Hrnone-12345', 'HR บริษัท ยังไม่กำหนด', 'HR_COMPANY');
$cns = new Browser('10.0.12.1');
$cns->req('POST', '/auth/login', array('username' => 'hrcns', 'password' => 'Hrcns-12345'));
$none = new Browser('10.0.12.2');
$none->req('POST', '/auth/login', array('username' => 'hrnone', 'password' => 'Hrnone-12345'));
$hq = new Browser('10.0.12.3');
$hq->req('POST', '/auth/login', array('username' => 'hr', 'password' => 'Secret-1234'));

function scope_codes($rows, $pick)
{
    $out = array();
    foreach ($rows as $r) { $out[call_user_func($pick, $r)] = true; }
    return array_keys($out);
}
function scope_emp_code($r) { return $r['companyCode']; }
function scope_row_emp_code($r) { return $r['employee']['companyCode']; }

$me = $cns->req('GET', '/auth/me');
$caps = $me['json']['data']['caps'];
check('/auth/me: companyCode = CNS · ไม่มีสิทธิ์ที่มีผลทุกบริษัท', $me['json']['data']['companyCode'] === 'CNS'
    && !in_array('rules.edit', $caps, true) && !in_array('insurers.edit', $caps, true) && !in_array('users.manage', $caps, true)
    && in_array('employees.edit', $caps, true) && in_array('stock.request', $caps, true));
$hqMe = $hq->req('GET', '/auth/me');
check('HR Admin: companyCode = null (ทุกบริษัท)', array_key_exists('companyCode', $hqMe['json']['data']) && $hqMe['json']['data']['companyCode'] === null);

$all = $hq->req('GET', '/employees');
$mine = $cns->req('GET', '/employees');
$nCns = (int)db_value("SELECT COUNT(*) FROM employees WHERE company_code = 'CNS'");
check('GET /employees: เฉพาะ CNS ครบทุกคน · HR Admin เห็นทุกบริษัท', scope_codes($mine['json']['data'], 'scope_emp_code') === array('CNS')
    && count($mine['json']['data']) === $nCns && count($all['json']['data']) === (int)db_value('SELECT COUNT(*) FROM employees'));
$r = $none->req('GET', '/employees');
check('HR บริษัทที่ยังไม่กำหนดบริษัท → ไม่เห็นใครเลย', $r['status'] === 200 && $r['json']['data'] === array());

$hlEmp = db_one("SELECT * FROM employees WHERE company_code = 'HL' ORDER BY id LIMIT 1");
$cnsEmp = db_one("SELECT * FROM employees WHERE company_code = 'CNS' ORDER BY id LIMIT 1");
check('สิทธิรายคนของบริษัทอื่น → 404 · ของตัวเอง → 200', S($cns->req('GET', '/employees/' . $hlEmp['id'] . '/benefits')) === 404
    && S($cns->req('GET', '/employees/' . $cnsEmp['id'] . '/benefits')) === 200);

$hlBody = map_employee($hlEmp);
$hlBody['firstName'] = 'แก้ข้ามบริษัท';
check('แก้พนักงานบริษัทอื่น → 404 (ไม่บอกว่ามีอยู่)', S($cns->req('PUT', '/employees/' . $hlEmp['id'], $hlBody)) === 404
    && db_value('SELECT first_name FROM employees WHERE id = ?', array($hlEmp['id'])) === $hlEmp['first_name']);
$off = $hlBody; $off['active'] = false;
check('ปิดใช้งานพนักงานบริษัทอื่น → 404', S($cns->req('PUT', '/employees/' . $hlEmp['id'], $off)) === 404);

$move = map_employee($cnsEmp);
$hlSite = db_one("SELECT id FROM sites WHERE company_code = 'HL' ORDER BY id LIMIT 1");
$move['companyCode'] = 'HL';
$move['siteId'] = (int)$hlSite['id'];
$r = $cns->req('PUT', '/employees/' . $cnsEmp['id'], $move);
check('ย้ายพนักงานตัวเองไปบริษัทอื่น → 403 OUT_OF_SCOPE', $r['status'] === 403 && $r['json']['code'] === 'OUT_OF_SCOPE'
    && db_value('SELECT company_code FROM employees WHERE id = ?', array($cnsEmp['id'])) === 'CNS');
$add = $move;
unset($add['id']);
$add['empCode'] = 'HL-SCOPE-1';
check('เพิ่มพนักงานบริษัทอื่น → 403', S($cns->req('POST', '/employees', $add)) === 403
    && !db_value("SELECT id FROM employees WHERE emp_code = 'HL-SCOPE-1'"));

$sites = $cns->req('GET', '/sites');
check('GET /sites: เฉพาะหน่วยงาน CNS', scope_codes($sites['json']['data'], 'scope_emp_code') === array('CNS')
    && count($sites['json']['data']) === (int)db_value("SELECT COUNT(*) FROM sites WHERE company_code = 'CNS'"));
check('เพิ่มหน่วยงานให้บริษัทอื่น → 403 · แก้หน่วยงานบริษัทอื่น → 404',
    S($cns->req('POST', '/sites', array('companyCode' => 'HL', 'name' => 'ข้ามบริษัท'))) === 403
    && S($cns->req('PATCH', '/sites/' . $hlSite['id'], array('name' => 'ข้ามบริษัท'))) === 404
    && S($cns->req('PATCH', '/sites/' . $hlSite['id'], array('active' => false))) === 404);

$pend = $cns->req('GET', '/uniform/pending');
$iss = $cns->req('GET', '/uniform/issues');
$cnsIds = array();
foreach (db_all("SELECT id FROM employees WHERE company_code = 'CNS'") as $x) { $cnsIds[(int)$x['id']] = true; }
$issOk = count($iss['json']['data']) === (int)db_value("SELECT COUNT(*) FROM uniform_issues u JOIN employees e ON e.id = u.employee_id WHERE e.company_code = 'CNS'");
foreach ($iss['json']['data'] as $i) {
    if (!isset($cnsIds[$i['employeeId']])) { $issOk = false; }
}
/* ค้างแจกที่ HR Admin เห็นของพนักงาน CNS ต้องเท่ากับที่ HR บริษัท CNS เห็นทั้งหมด (CNS อาจไม่มีค้างเลย — แม่บ้าน/รายวันไม่ได้ชุด) */
$hqPend = $hq->req('GET', '/uniform/pending');
$expect = 0;
foreach ($hqPend['json']['data'] as $p) {
    if ($p['employee']['companyCode'] === 'CNS') { $expect++; }
}
$pendCodes = scope_codes($pend['json']['data'], 'scope_row_emp_code');
check('ชุดฟอร์ม: ค้างแจก + ประวัติ เฉพาะพนักงาน CNS', $issOk && count($iss['json']['data']) > 0 && count($pend['json']['data']) === $expect
    && ($pendCodes === array() || $pendCodes === array('CNS')) && count($hqPend['json']['data']) > $expect,
    json_encode(array($issOk, count($iss['json']['data']), count($pend['json']['data']), $expect, $pendCodes)));
$hlIssue = db_one("SELECT u.id FROM uniform_issues u JOIN employees e ON e.id = u.employee_id WHERE e.company_code = 'HL' AND u.source = 'MANUAL' LIMIT 1");
check('ยกเลิกการแจกของบริษัทอื่น → 404', S($cns->req('DELETE', '/uniform/issues/' . $hlIssue['id'])) === 404
    && db_value('SELECT id FROM uniform_issues WHERE id = ?', array($hlIssue['id'])));

$dash = $cns->req('GET', '/dashboard');
$byCo = $dash['json']['data']['activeByCompany'];
check('ภาพรวม: กราฟแยกบริษัทเหลือ CNS', count($byCo) === 1 && $byCo[0]['companyCode'] === 'CNS');
$q = $cns->req('GET', '/monitor/tasks');
check('คิวงาน: ตอบได้ (นับเฉพาะ CNS)', $q['status'] === 200);

$bs = $cns->req('GET', '/insurance/batches');
$bOk = count($bs['json']['data']) > 0;
foreach ($bs['json']['data'] as $b) {
    foreach ($b['items'] as $it) {
        if (!isset($cnsIds[$it['employeeId']])) { $bOk = false; }
    }
}
check('ประวัติการส่งออก: เฉพาะครั้งที่มี CNS และรายชื่อเฉพาะ CNS', $bOk);
/* เลือก batch ตามข้อมูล ณ ตอนนี้ (เทสต์ก่อนหน้าแทนที่/ยกเลิกบางครั้งไปแล้ว) */
$mix = db_value("SELECT i.batch_id FROM insurance_batch_items i JOIN employees e ON e.id = i.employee_id
                 GROUP BY i.batch_id HAVING SUM(e.company_code = 'CNS') > 0 AND SUM(e.company_code <> 'CNS') > 0 ORDER BY i.batch_id LIMIT 1");
$other = db_value("SELECT i.batch_id FROM insurance_batch_items i JOIN employees e ON e.id = i.employee_id
                   GROUP BY i.batch_id HAVING SUM(e.company_code = 'CNS') = 0 ORDER BY i.batch_id LIMIT 1");
$only = db_value("SELECT i.batch_id FROM insurance_batch_items i JOIN employees e ON e.id = i.employee_id
                  GROUP BY i.batch_id HAVING SUM(e.company_code <> 'CNS') = 0 ORDER BY i.batch_id LIMIT 1");
$r = $cns->req('DELETE', '/insurance/batches/' . $mix);
check('ยกเลิกการส่งออกที่รวมบริษัทอื่น → 403 · ข้อมูลไม่หาย', $mix && $r['status'] === 403 && $r['json']['code'] === 'OUT_OF_SCOPE'
    && db_value('SELECT id FROM insurance_batches WHERE id = ?', array($mix)), $mix . ' ' . json_encode($r['json']));
check('ยกเลิกการส่งออกครั้งที่ไม่มี CNS → 404', $other && S($cns->req('DELETE', '/insurance/batches/' . $other)) === 404
    && find_by($bs['json']['data'], 'id', (int)$other) === null);
check('ยกเลิกการส่งออกที่มีแต่ CNS → 204', $only && S($cns->req('DELETE', '/insurance/batches/' . $only)) === 204
    && !db_value('SELECT id FROM insurance_batches WHERE id = ?', array($only)));

$act = $cns->req('GET', '/activity?limit=1000');
$aOk = $act['status'] === 200;
foreach ($act['json']['data'] as $a) {
    if ($a['employeeId'] !== null && !isset($cnsIds[$a['employeeId']])) { $aOk = false; }
}
check('บันทึกกิจกรรม: ไม่มีของพนักงานบริษัทอื่น', $aOk);

check('งานที่มีผลทุกบริษัท → 403 (กฎ แบบฟอร์มประกัน ส่งข้อมูลหลักทั้งหมด)',
    S($cns->req('PUT', '/insurers/bindings', array('bindings' => array()))) === 403
    && S($cns->req('PUT', '/rules/settings', array('effectiveFrom' => today_iso(), 'values' => array()))) === 403
    && S($cns->req('POST', '/stock/sync-master')) === 403);

/* ---------- หน้าผู้ดูแล: ตารางสิทธิ์ล็อกช่องที่มีผลทุกบริษัทของ HR บริษัท ---------- */
$sa = new Browser('10.0.12.4');
$sa->req('POST', '/auth/login', array('username' => 'boss', 'password' => 'Boss-12345'));
$pv = $sa->req('GET', '/admin/permissions');
$rulesEdit = find_by($pv['json']['data']['caps'], 'key', 'rules.edit');
$insEdit = find_by($pv['json']['data']['caps'], 'key', 'insurers.edit');
check('สิทธิ์: rules.edit / insurers.edit ล็อก HR บริษัท + ไม่อยู่ในค่าเริ่มต้น', $rulesEdit['lockedRoles'] === array('HR_COMPANY')
    && !in_array('HR_COMPANY', $insEdit['defaultRoles'], true) && !in_array('HR_COMPANY', $insEdit['roles'], true));
$sa->req('PUT', '/admin/permissions', array('matrix' => array('rules.edit' => array('HR_ADMIN', 'HR_COMPANY'))));
check('ติ๊กสิทธิ์ที่ล็อกส่งมา → ไม่มีผล', !cap_allowed('HR_COMPANY', 'rules.edit') && cap_allowed('HR_ADMIN', 'rules.edit'));

$hrcns = user_by_username('hrcns');
$r = $sa->req('PATCH', '/admin/users/' . $hrcns['id'], array('companyCode' => 'PRO'));
$after = $cns->req('GET', '/employees');
check('ผู้ดูแลเปลี่ยนบริษัทที่ดูแล → มีผลคำขอถัดไปทันที', $r['status'] === 200 && $r['json']['data']['companyCode'] === 'PRO'
    && scope_codes($after['json']['data'], 'scope_emp_code') === array('PRO'));
$r = $sa->req('PATCH', '/admin/users/' . $hrcns['id'], array('role' => 'PAYROLL'));
check('เปลี่ยนเป็นบทบาทอื่น → ล้างบริษัท เห็นทุกบริษัท', $r['status'] === 200 && $r['json']['data']['companyCode'] === null
    && db_value('SELECT company_code FROM users WHERE id = ?', array($hrcns['id'])) === null);
