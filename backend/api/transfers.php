<?php
/* ============================================================
 *  backend/api/transfers.php — โอนย้ายพนักงาน (sql/020)
 *
 *  GET    /employees/{id}/transfers          ประวัติการย้าย + ที่รอมีผล (เรียงตามวันที่)
 *  POST   /employees/{id}/transfers          {effectiveDate, to: {companyCode, siteId, employeeType, deptGroup, position, level}, resetWait, note}
 *                                            วันที่มีผล <= วันนี้ = มีผลทันที · หลังวันนี้ = รอมีผล (ข้อมูลพนักงานยังเป็นค่าเดิม)
 *  DELETE /employees/{id}/transfers/{tid}    ยกเลิกการย้ายที่ยังไม่ถึงวันที่มีผล
 *  ถึงวันที่มีผลแล้ว → transfers_apply_due() เขียนสังกัดใหม่ให้เอง (เรียกทุกคำขอใน api_handle — ไม่ต้องตั้ง cron)
 *  แก้ = สิทธิ์ employees.edit (route guard) · HR บริษัทย้ายไปบริษัทอื่นไม่ได้
 *  การตรวจข้อมูลตรงกับ web/assets/js/domain/transfer.js + MockApi.createTransfer (แก้ที่หนึ่งต้องแก้อีกที่)
 * ============================================================ */

function transfers_ready()
{
    return db_table_exists('employee_transfers');
}

function transfers_need_table()
{
    if (!transfers_ready()) {
        throw new ApiError('ยังโอนย้ายไม่ได้ — ผู้ดูแลระบบต้องรัน backend/sql/020_employee_transfers.sql ก่อน', 503);
    }
}

function map_assignment($r, $p)
{
    return array('companyCode' => $r[$p . 'company_code'], 'siteId' => (int)$r[$p . 'site_id'], 'employeeType' => $r[$p . 'employee_type'],
        'deptGroup' => $r[$p . 'dept_group'], 'position' => $r[$p . 'position'], 'level' => int_or_null($r[$p . 'level']));
}

function map_transfer($r)
{
    return array(
        'id' => (int)$r['id'],
        'employeeId' => (int)$r['employee_id'],
        'effectiveDate' => $r['effective_date'],
        'status' => $r['status'],
        'from' => map_assignment($r, 'from_'),
        'to' => map_assignment($r, 'to_'),
        'resetWait' => (bool)$r['reset_wait'],
        'note' => $r['note'] !== null ? $r['note'] : '',
        'appliedAt' => $r['applied_at'] ? stamp_from_db($r['applied_at']) : null,
        'createdAt' => stamp_from_db($r['created_at']),
        'createdBy' => $r['requested_by_name'],
    );
}

function repo_transfers($employeeId)
{
    if (!transfers_ready()) { return array(); }
    $out = array();
    foreach (db_all('SELECT * FROM employee_transfers WHERE employee_id = ? ORDER BY effective_date, id', array((int)$employeeId)) as $r) {
        $out[] = map_transfer($r);
    }
    return $out;
}

function assignment_values($a)
{
    return array($a['companyCode'], $a['siteId'], $a['employeeType'], $a['deptGroup'], $a['position'], $a['level']);
}

/** "บริษัท HL → PRO · หน่วยงาน สำนักงานใหญ่ → ไซต์ A" — เฉพาะที่เปลี่ยน */
function transfer_change_text($from, $to)
{
    $parts = array();
    foreach (assignment_changes($from, $to) as $k) {
        if ($k === 'companyCode') { $parts[] = 'บริษัท ' . $from[$k] . ' → ' . $to[$k]; }
        if ($k === 'siteId') {
            $a = repo_site($from[$k]);
            $b = repo_site($to[$k]);
            $parts[] = 'หน่วยงาน ' . ($a ? $a['name'] : '#' . $from[$k]) . ' → ' . ($b ? $b['name'] : '#' . $to[$k]);
        }
        if ($k === 'employeeType') {
            $a = employee_type_info($from[$k]);
            $b = employee_type_info($to[$k]);
            $parts[] = 'ประเภท ' . ($a ? $a['name'] : $from[$k]) . ' → ' . ($b ? $b['name'] : $to[$k]);
        }
        if ($k === 'deptGroup') { $parts[] = 'กลุ่ม/ฝ่าย ' . ($from[$k] !== null ? $from[$k] : '–') . ' → ' . ($to[$k] !== null ? $to[$k] : '–'); }
        if ($k === 'position') { $parts[] = 'ตำแหน่ง ' . ($from[$k] !== null ? $from[$k] : '–') . ' → ' . ($to[$k] !== null ? $to[$k] : '–'); }
        if ($k === 'level') { $parts[] = 'ระดับ ' . ($from[$k] !== null ? $from[$k] : '–') . ' → ' . ($to[$k] !== null ? $to[$k] : '–'); }
    }
    return implode(' · ', $parts);
}

/**
 * ให้การย้ายมีผล: เขียนสังกัดใหม่ลงพนักงาน + เก็บสังกัดเดิม ณ วันนั้น (from_*) — ไม่เปิด/ปิด transaction เอง
 * $u = ผู้กดบันทึก (มีผลทันที) หรือ null = ระบบ (ถึงวันที่ตั้งไว้)
 */
function transfer_apply($t, $u)
{
    $row = db_one('SELECT * FROM employees WHERE id = ?', array($t['employeeId']));
    if (!$row) { return; }
    $emp = map_employee($row);
    $from = assignment_of($emp);
    $by = $u ? $u['username'] : 'system';
    $vals = assignment_values($t['to']);
    $sql = 'UPDATE employees SET company_code = ?, site_id = ?, employee_type = ?, dept_group = ?, position = ?, level = ?';
    if ($t['resetWait']) {
        $sql .= ', benefit_start_date = ?';
        $vals[] = $t['effectiveDate'];
    }
    $vals[] = $by;
    $vals[] = $t['employeeId'];
    db_exec($sql . ', updated_by = ? WHERE id = ?', $vals);
    $vals = assignment_values($from);
    array_push($vals, db_now(), $by, $t['id']);
    db_exec("UPDATE employee_transfers SET status = 'APPLIED', from_company_code = ?, from_site_id = ?, from_employee_type = ?,
             from_dept_group = ?, from_position = ?, from_level = ?, applied_at = ?, updated_by = ? WHERE id = ?", $vals);
    audit_write('EMPLOYEE', $t['employeeId'], 'TRANSFER', 'โอนย้าย ' . full_name($emp) . ' (' . $emp['empCode'] . ') มีผล ' . $t['effectiveDate']
        . ': ' . transfer_change_text($from, $t['to']) . ($t['resetWait'] ? ' · นับวันรอสิทธิ์ใหม่' : '')
        . ($u ? '' : ' (ถึงวันที่มีผล — ตั้งไว้โดย ' . $t['createdBy'] . ')'), $t['employeeId'], $u);
}

/** การย้ายที่ถึงวันที่มีผลแล้ว → มีผล (เรียกต้นทุกคำขอ — ไม่ขึ้นกับขอบเขตบริษัทของผู้ใช้) · พังเงียบ ๆ ไม่ให้คำขอหลักล้ม */
function transfers_apply_due()
{
    try {
        if (!transfers_ready()) { return 0; }
        $rows = db_all("SELECT * FROM employee_transfers WHERE status = 'PENDING' AND effective_date <= ? ORDER BY effective_date, id",
            array(today_iso()));
        if (!count($rows)) { return 0; }
        db_begin();
        foreach ($rows as $r) { transfer_apply(map_transfer($r), null); }
        db_commit();
        return count($rows);
    } catch (DbError $e) {
        db_rollback();
        error_log('[hl-welfare] transfers_apply_due: ' . $e->getMessage());
        return 0;
    }
}

function api_employee_transfers($req, $params)
{
    $e = find_or_404(repo_employee(param_id($params)), 'ไม่พบพนักงาน');
    return repo_transfers($e['id']);
}

/** สังกัดใหม่จากหน้าเว็บ — ประเภทที่ไม่ใช้กลุ่ม/ฝ่าย = ไม่มีกลุ่มและระดับ (เหมือน normalizeEmployee) */
function transfer_to_input($b)
{
    $to = array(
        'companyCode' => (string)arr_get($b, 'companyCode', ''),
        'siteId' => (int)arr_get($b, 'siteId', 0),
        'employeeType' => (string)arr_get($b, 'employeeType', ''),
        'deptGroup' => blank_null(arr_get($b, 'deptGroup')),
        'position' => blank_null(arr_get($b, 'position')),
        'level' => int_or_null(arr_get($b, 'level')),
    );
    $t = employee_type_info($to['employeeType']);
    if ($t && !$t['usesDeptGroup']) {
        $to['deptGroup'] = null;
        $to['level'] = null;
    }
    return $to;
}

function api_employee_transfer_create($req, $params)
{
    $u = auth_require($req);
    transfers_need_table();
    $emp = find_or_404(repo_employee(param_id($params)), 'ไม่พบพนักงาน');
    $b = req_json($req);
    $in = array(
        'effectiveDate' => (string)arr_get($b, 'effectiveDate', ''),
        'to' => transfer_to_input(is_array(arr_get($b, 'to')) ? $b['to'] : array()),
        'resetWait' => (bool)arr_get($b, 'resetWait', false),
        'note' => welfare_str(arr_get($b, 'note', ''), 500),
    );
    $errors = validate_transfer($in, $emp, repo_transfers($emp['id']));
    if (count($errors)) { throw new ApiError(reset($errors), 422, $errors); }
    scope_require($in['to']['companyCode']);       // HR บริษัท: ย้ายไปบริษัทอื่นไม่ได้
    $site = repo_site($in['to']['siteId']);
    if (!$site) { throw new ApiError('ไม่พบหน่วยงาน', 422, array('siteId' => 'ไม่พบหน่วยงาน')); }
    if ($site['companyCode'] !== $in['to']['companyCode']) {
        throw new ApiError('หน่วยงานไม่ได้อยู่ในบริษัทที่เลือก', 422, array('siteId' => 'หน่วยงานไม่ได้อยู่ในบริษัทที่เลือก'));
    }
    // ข้อมูลหลังย้ายต้องผ่านกฎพนักงาน (ประเภทใช้กับบริษัทนี้ได้ · กลุ่ม/ระดับตามประเภท) และไม่เลือกของที่ปิดใช้งาน
    $errors = validate_employee(array_merge($emp, $in['to']));
    if (count($errors)) { throw new ApiError(reset($errors), 422, $errors); }
    $off = employee_inactive_refs($in['to'], $emp, $site);
    if (count($off)) { throw new ApiError(reset($off), 422, $off); }

    db_begin();
    $vals = array_merge(array($emp['id'], $in['effectiveDate']), assignment_values(assignment_of($emp)), assignment_values($in['to']));
    array_push($vals, $in['resetWait'] ? 1 : 0, $in['note'] !== '' ? $in['note'] : null, $u['name'], db_now(), $u['username'], $u['username']);
    $res = db_exec("INSERT INTO employee_transfers (employee_id, effective_date, status, from_company_code, from_site_id, from_employee_type,
             from_dept_group, from_position, from_level, to_company_code, to_site_id, to_employee_type, to_dept_group, to_position, to_level,
             reset_wait, note, requested_by_name, created_at, created_by, updated_by)
             VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", $vals);
    $t = map_transfer(db_one('SELECT * FROM employee_transfers WHERE id = ?', array($res['id'])));
    if (strcmp($t['effectiveDate'], today_iso()) <= 0) {
        transfer_apply($t, $u);
    } else {
        audit_write('EMPLOYEE', $emp['id'], 'TRANSFER', 'ตั้งโอนย้าย ' . full_name($emp) . ' (' . $emp['empCode'] . ') มีผล ' . $t['effectiveDate']
            . ': ' . transfer_change_text(assignment_of($emp), $t['to']) . ($t['resetWait'] ? ' · นับวันรอสิทธิ์ใหม่' : ''), $emp['id'], $u);
    }
    db_commit();
    return http_data(array('employee' => repo_employee($emp['id']), 'transfers' => repo_transfers($emp['id'])), 201);
}

function api_employee_transfer_cancel($req, $params)
{
    $u = auth_require($req);
    transfers_need_table();
    $emp = find_or_404(repo_employee(param_id($params)), 'ไม่พบพนักงาน');
    $r = db_one('SELECT * FROM employee_transfers WHERE id = ? AND employee_id = ?', array(param_id($params, 'tid'), $emp['id']));
    $t = map_transfer(find_or_404($r, 'ไม่พบรายการโอนย้าย'));
    if ($t['status'] !== 'PENDING') { throw new ApiError('ยกเลิกได้เฉพาะการย้ายที่ยังไม่ถึงวันที่มีผล', 409); }
    db_begin();
    db_exec("UPDATE employee_transfers SET status = 'CANCELLED', updated_by = ? WHERE id = ?", array($u['username'], $t['id']));
    audit_write('EMPLOYEE', $emp['id'], 'CANCEL', 'ยกเลิกการโอนย้าย ' . full_name($emp) . ' (' . $emp['empCode'] . ') ที่จะมีผล ' . $t['effectiveDate'], $emp['id'], $u);
    db_commit();
    return repo_transfers($emp['id']);
}
