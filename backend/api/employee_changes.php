<?php
/* ============================================================
 *  backend/api/employee_changes.php — โอนย้าย / เปลี่ยนรหัสพนักงาน มีวันที่มีผล (คู่แฝด application/usecases/employeeChange.js)
 *
 *  GET    /employees/{id}/changes             ประวัติ (ใหม่ → เก่า)                         สิทธิ์ employees.view
 *  POST   /employees/{id}/changes             {effectiveDate, companyCode, siteId, employeeType, empCode, notifyInsurer, note}
 *                                             → แก้ข้อมูลพนักงานเป็นค่าใหม่ + เก็บประวัติ      สิทธิ์ employees.edit
 *  DELETE /employees/{id}/changes/{changeId}  ลบรายการล่าสุดที่ยังไม่อยู่ในไฟล์ที่ส่งออกแล้ว → ข้อมูลกลับเป็นค่าเดิม
 *  ยังไม่ได้รัน sql/021 → 503
 * ============================================================ */

function employee_changes_require_db()
{
    if (!db_has_employee_changes()) {
        throw new ApiError('ยังไม่รองรับการโอนย้าย / เปลี่ยนรหัส — ผู้ดูแลระบบต้องรัน backend/sql/021_employee_changes.sql ก่อน', 503);
    }
}

function __cmp_change_desc($a, $b)
{
    $d = strcmp($b['effectiveDate'], $a['effectiveDate']);
    return $d !== 0 ? $d : $b['id'] - $a['id'];
}

function api_employee_changes($req, $params)
{
    $e = find_or_404(repo_employee(param_id($params)), 'ไม่พบพนักงาน');
    $list = repo_employee_changes($e['id']);
    stable_usort($list, '__cmp_change_desc');
    return $list;
}

/** ตรวจคำขอ → errors รายช่อง (ข้อความเดียวกับ validateEmployeeChange) */
function validate_employee_change($emp, $in)
{
    $x = array();
    if ($emp['status'] !== 'ACTIVE') { $x['effectiveDate'] = 'พนักงานพ้นสภาพแล้ว — โอนย้าย / เปลี่ยนรหัสไม่ได้'; }
    $d = $in['effectiveDate'];
    if (!is_string($d) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) { $x['effectiveDate'] = 'กรุณาระบุวันที่มีผล'; }
    elseif (strcmp($d, $emp['startDate']) <= 0) { $x['effectiveDate'] = 'วันที่มีผลต้องหลังวันเริ่มงาน'; }
    else {
        $last = (string)db_value('SELECT MAX(effective_date) FROM employee_changes WHERE employee_id = ?', array($emp['id']));
        if ($last !== '' && strcmp($d, $last) <= 0) { $x['effectiveDate'] = 'ต้องหลังการเปลี่ยนแปลงครั้งก่อน (' . $last . ')'; }
    }
    $to = $in['to'];
    $site = $to['siteId'] ? repo_site($to['siteId']) : null;
    if (!$site) { $x['siteId'] = 'กรุณาเลือกหน่วยงาน'; }
    elseif ($site['companyCode'] !== $to['companyCode']) { $x['siteId'] = 'หน่วยงานไม่ได้อยู่ในบริษัทที่เลือก'; }
    $info = employee_type_info($to['employeeType']);
    if (!$info || !employee_type_allows($info, $to['companyCode'])) { $x['employeeType'] = 'ประเภทนี้ใช้กับบริษัทที่เลือกไม่ได้'; }
    if ($to['empCode'] === '') { $x['empCode'] = 'กรุณาใส่รหัสพนักงาน'; }
    elseif (strlen($to['empCode']) > 20) { $x['empCode'] = 'รหัสยาวเกิน 20 ตัวอักษร'; }
    elseif (db_value('SELECT id FROM employees WHERE emp_code = ? AND id <> ?', array($to['empCode'], $emp['id']))) { $x['empCode'] = 'รหัสพนักงานซ้ำ'; }
    if ($in['note'] !== null && (function_exists('mb_strlen') ? mb_strlen($in['note'], 'UTF-8') : strlen(utf8_decode($in['note']))) > 255) {
        $x['note'] = 'หมายเหตุยาวเกิน 255 ตัวอักษร';
    }
    if (!count($x)) {
        $same = true;
        foreach (change_fields() as $k) { if ($to[$k] !== $emp[$k]) { $same = false; } }
        if ($same) { $x['siteId'] = 'ไม่มีอะไรเปลี่ยน — เลือกหน่วยงาน / บริษัท / ประเภทใหม่ หรือใส่รหัสใหม่'; }
    }
    if (!count($x)) {
        $next = __change_view($emp, $to);
        foreach (employee_inactive_refs($next, $emp, $site) as $k => $m) { $x[$k] = $m; }   // ปิดใช้งานแล้ว (ยกเว้นค่าเดิม)
        if (!count($x)) {
            $bad = validate_employee($next);
            if (count($bad)) {
                $k = key($bad);
                $x[in_array($k, change_fields(), true) ? $k : 'employeeType'] = in_array($k, change_fields(), true)
                    ? $bad[$k] : $bad[$k] . ' — แก้ในตารางพนักงานก่อน แล้วค่อยย้าย';
            }
        }
    }
    return $x;
}

function api_employee_change_create($req, $params)
{
    $u = auth_require($req);
    employee_changes_require_db();
    $emp = find_or_404(repo_employee(param_id($params)), 'ไม่พบพนักงาน');
    $b = req_json($req);
    $in = array(
        'effectiveDate' => arr_get($b, 'effectiveDate'),
        'to' => array('companyCode' => (string)arr_get($b, 'companyCode', ''), 'siteId' => (int)arr_get($b, 'siteId', 0),
            'employeeType' => (string)arr_get($b, 'employeeType', ''), 'empCode' => trim((string)arr_get($b, 'empCode', ''))),
        'notifyInsurer' => (bool)arr_get($b, 'notifyInsurer', false),
        'note' => blank_null(trim((string)arr_get($b, 'note', ''))),
    );
    scope_require($emp['companyCode']);
    scope_require($in['to']['companyCode']);      // HR บริษัท: ย้ายไปบริษัทอื่นไม่ได้ (ให้ HR ส่วนกลางทำ)
    $errors = validate_employee_change($emp, $in);
    if (count($errors)) { throw new ApiError(reset($errors), 422, $errors); }
    $from = array();
    foreach (change_fields() as $k) { $from[$k] = $emp[$k]; }
    $to = $in['to'];
    $kind = change_is_transfer(array('from' => $from, 'to' => $to)) ? 'TRANSFER' : 'CODE';
    $now = db_now();
    db_begin();
    $res = db_exec('INSERT INTO employee_changes (employee_id, kind, effective_date, from_company_code, from_site_id, from_employee_type, from_emp_code,
             to_company_code, to_site_id, to_employee_type, to_emp_code, notify_insurer, note, created_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        array($emp['id'], $kind, $in['effectiveDate'], $from['companyCode'], $from['siteId'], $from['employeeType'], $from['empCode'],
            $to['companyCode'], $to['siteId'], $to['employeeType'], $to['empCode'], $in['notifyInsurer'] ? 1 : 0, $in['note'],
            $now, $u['username'], $u['username']));
    db_exec('UPDATE employees SET company_code = ?, site_id = ?, employee_type = ?, emp_code = ?, updated_by = ? WHERE id = ?',
        array($to['companyCode'], $to['siteId'], $to['employeeType'], $to['empCode'], $u['username'], $emp['id']));
    $c = map_employee_change(db_one('SELECT * FROM employee_changes WHERE id = ?', array($res['id'])));
    audit_write('EMPLOYEE', $emp['id'], 'UPDATE', ($kind === 'TRANSFER' ? 'โอนย้าย ' : 'เปลี่ยนรหัส ') . full_name($emp) . ': '
        . employee_change_summary($c) . ' มีผล ' . $c['effectiveDate'] . ($c['notifyInsurer'] ? ' (แจ้งบริษัทประกัน)' : ''), $emp['id'], $u);
    db_commit();
    return http_data(array('change' => $c, 'employee' => repo_employee($emp['id'])), 201);
}

/** ข้อความสรุป เช่น "ย้าย สาขาบางนา (HL) → ไซต์ A (PRO) · รหัส H001 → P001" (= changeSummary) */
function employee_change_summary($c)
{
    $parts = array();
    $f = $c['from'];
    $t = $c['to'];
    if ($f['companyCode'] !== $t['companyCode'] || $f['siteId'] !== $t['siteId']) {
        $parts[] = 'ย้าย ' . __change_place($f) . ' → ' . __change_place($t);
    }
    if ($f['employeeType'] !== $t['employeeType']) {
        $a = employee_type_info($f['employeeType']);
        $b = employee_type_info($t['employeeType']);
        $parts[] = 'ประเภท ' . ($a ? $a['name'] : $f['employeeType']) . ' → ' . ($b ? $b['name'] : $t['employeeType']);
    }
    if ($f['empCode'] !== $t['empCode']) { $parts[] = 'รหัส ' . $f['empCode'] . ' → ' . $t['empCode']; }
    return implode(' · ', $parts);
}

function __change_place($v)
{
    $name = db_value('SELECT name FROM sites WHERE id = ?', array($v['siteId']));
    return ($name !== null && $name !== false ? $name : '#' . $v['siteId']) . ' (' . $v['companyCode'] . ')';
}

function api_employee_change_delete($req, $params)
{
    $u = auth_require($req);
    employee_changes_require_db();
    $emp = find_or_404(repo_employee(param_id($params)), 'ไม่พบพนักงาน');
    $cid = param_id($params, 'changeId');
    $row = db_one('SELECT * FROM employee_changes WHERE id = ? AND employee_id = ?', array($cid, $emp['id']));
    if (!$row) { throw new ApiError('ไม่พบรายการเปลี่ยนแปลง', 404); }
    $c = map_employee_change($row);
    $latest = db_one('SELECT id FROM employee_changes WHERE employee_id = ? ORDER BY effective_date DESC, id DESC LIMIT 1', array($emp['id']));
    if ((int)$latest['id'] !== $c['id']) { throw new ApiError('ลบได้เฉพาะรายการล่าสุด', 409); }
    if (db_value('SELECT 1 FROM insurance_batch_items WHERE employee_id = ? AND change_id = ? LIMIT 1', array($emp['id'], $c['id']))) {
        throw new ApiError('อยู่ในไฟล์แจ้งประกันที่ส่งออกแล้ว — ยกเลิกการส่งออกครั้งนั้นก่อน', 409);
    }
    if (db_value('SELECT id FROM employees WHERE emp_code = ? AND id <> ?', array($c['from']['empCode'], $emp['id']))) {
        throw new ApiError('ใช้รหัสเดิม ' . $c['from']['empCode'] . ' ไม่ได้ — มีพนักงานอื่นใช้แล้ว', 409);
    }
    scope_require($c['from']['companyCode']);
    db_begin();
    db_exec('DELETE FROM employee_changes WHERE id = ?', array($c['id']));
    db_exec('UPDATE employees SET company_code = ?, site_id = ?, employee_type = ?, emp_code = ?, updated_by = ? WHERE id = ?',
        array($c['from']['companyCode'], $c['from']['siteId'], $c['from']['employeeType'], $c['from']['empCode'], $u['username'], $emp['id']));
    audit_write('EMPLOYEE', $emp['id'], 'UPDATE', 'ยกเลิกการ' . ($c['kind'] === 'TRANSFER' ? 'โอนย้าย ' : 'เปลี่ยนรหัส ') . full_name($emp)
        . ' (มีผล ' . $c['effectiveDate'] . ') — กลับเป็นข้อมูลเดิม', $emp['id'], $u);
    db_commit();
    return repo_employee($emp['id']);
}
