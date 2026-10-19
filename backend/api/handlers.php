<?php
/* ============================================================
 *  backend/api/handlers.php — endpoint ข้อมูลทั้งหมด (สัญญา = web/assets/js/application/ports.js)
 *
 *  แต่ละฟังก์ชันคู่กับเมธอดของ MockApi (infrastructure/mock/mockApi.js) — ข้อความ error, ลำดับ, audit
 *  เหมือนกัน · ต่างกันแค่: ผู้ทำรายการมาจาก session ($u) ไม่ใช่จากหน้าเว็บ และเขียนลงฐานข้อมูลใน transaction
 *  ทุกฟังก์ชันรับ ($req, $params) — router (api/routes.php) ตรวจ session ให้ก่อนแล้ว
 * ============================================================ */

function full_name($e)
{
    return $e['firstName'] . ' ' . $e['lastName'];
}

function find_or_404($item, $message)
{
    if ($item === null) { throw new ApiError($message, 404); }
    return $item;
}

function param_id($params, $key = 'id')
{
    if (!isset($params[$key]) || !preg_match('/^\d+$/', $params[$key])) { throw new ApiError('ไม่พบข้อมูล', 404); }
    return (int)$params[$key];
}

function assert_iso_date($d, $message = 'วันที่ไม่ถูกต้อง')
{
    if (!is_string($d) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) { throw new ApiError($message, 422); }
    return $d;
}

/* ============================================================
 *  ภาพรวม / ติดตามงาน / บันทึกกิจกรรม
 * ============================================================ */
function api_dashboard($req, $params)
{
    $w = repo_world();
    return build_dashboard(today_iso(), $w['employees'], $w['sites'], $w['rules'], $w['batches'], $w['issues']);
}

function api_work_queue($req, $params)
{
    $w = repo_world();
    return build_work_queue(today_iso(), $w['employees'], $w['sites'], $w['rules'], $w['batches'], $w['issues']);
}

function api_activity($req, $params)
{
    $u = auth_require($req);
    /* การเข้าสู่ระบบ / งานระบบ ดูได้เฉพาะผู้มีสิทธิ์ audit.view (หน้า admin.html) */
    $where = cap_allowed($u['role'], 'audit.view') ? array() : array("entity NOT IN ('USER', 'SYSTEM')");
    $args = array();
    if (req_query($req, 'entity') !== null) { $where[] = 'entity = ?'; $args[] = req_query($req, 'entity'); }
    if (req_query($req, 'employeeId') !== null) { $where[] = 'employee_id = ?'; $args[] = (int)req_query($req, 'employeeId'); }
    $limit = (int)req_query($req, 'limit', 200);
    $limit = max(1, min($limit, 1000));
    $rows = db_all('SELECT * FROM audit_log' . (count($where) ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY at DESC, id DESC LIMIT ' . $limit, $args);
    $out = array();
    foreach ($rows as $r) { $out[] = map_activity($r); }
    return $out;
}

/* ============================================================
 *  บริษัท / หน่วยงาน
 * ============================================================ */
function api_companies($req, $params) { return repo_companies(); }
function api_sites($req, $params) { return repo_sites(); }

function api_site_create($req, $params)
{
    $u = auth_require($req);
    $b = req_json($req);
    $name = trim((string)arr_get($b, 'name', ''));
    $code = (string)arr_get($b, 'companyCode', '');
    if ($name === '') { throw new ApiError('กรุณาระบุชื่อหน่วยงาน', 422); }
    if (!db_value('SELECT code FROM companies WHERE code = ?', array($code))) { throw new ApiError('ไม่พบบริษัท', 422); }
    if (db_value('SELECT id FROM sites WHERE company_code = ? AND name = ?', array($code, $name))) {
        throw new ApiError('มีหน่วยงานชื่อนี้ในบริษัทแล้ว', 409);
    }
    $polo = arr_get($b, 'poloColor') === 'NAVY' ? 'NAVY' : 'BLACK';
    db_begin();
    $res = db_exec('INSERT INTO sites (company_code, name, has_group_insurance, polo_color, created_at, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?)', array($code, $name, !empty($b['hasGroupInsurance']), $polo, db_now(), $u['username'], $u['username']));
    audit_write('SITE', $res['id'], 'CREATE', 'เพิ่มหน่วยงาน “' . $name . '” (' . $code . ')', null, $u);
    db_commit();
    return http_data(site_with_sync(repo_site($res['id']), master_sync_after_change($u, array((int)$res['id']))), 201);
}

/** ส่งหน่วยงานไปสต็อกไม่สำเร็จ → แนบข้อความเตือนให้หน้าจอแสดง (การบันทึกในระบบนี้สำเร็จแล้ว) */
function site_with_sync($site, $warning)
{
    if ($warning !== null) { $site['stockWarning'] = $warning; }
    return $site;
}

function api_site_update($req, $params)
{
    $u = auth_require($req);
    $id = param_id($params);
    $s = find_or_404(repo_site($id), 'ไม่พบหน่วยงาน');
    $patch = req_json($req);
    if (array_key_exists('name', $patch) && trim((string)$patch['name']) === '') { throw new ApiError('กรุณาระบุชื่อหน่วยงาน', 422); }
    $changes = array();
    $next = $s;
    if (array_key_exists('name', $patch) && $patch['name'] !== $s['name']) {
        $changes[] = 'ชื่อ → ' . $patch['name'];
        $next['name'] = trim((string)$patch['name']);
    }
    if (array_key_exists('hasGroupInsurance', $patch) && (bool)$patch['hasGroupInsurance'] !== $s['hasGroupInsurance']) {
        $changes[] = $patch['hasGroupInsurance'] ? 'ได้รับประกันกลุ่ม' : 'ไม่ได้รับประกันกลุ่ม';
        $next['hasGroupInsurance'] = (bool)$patch['hasGroupInsurance'];
    }
    if (array_key_exists('poloColor', $patch) && $patch['poloColor'] !== $s['poloColor']) {
        $changes[] = 'โปโลสี' . ($patch['poloColor'] === 'NAVY' ? 'น้ำเงิน' : 'ดำ');
        $next['poloColor'] = $patch['poloColor'] === 'NAVY' ? 'NAVY' : 'BLACK';
    }
    db_begin();
    db_exec('UPDATE sites SET name = ?, has_group_insurance = ?, polo_color = ?, updated_by = ? WHERE id = ?',
        array($next['name'], $next['hasGroupInsurance'], $next['poloColor'], $u['username'], $id));
    if (count($changes)) {
        audit_write('SITE', $id, 'UPDATE', 'แก้ไขหน่วยงาน “' . $next['name'] . '”: ' . implode(', ', $changes), null, $u);
    }
    db_commit();
    // ชื่อ/สีโปโลเปลี่ยน = ชื่อหน่วยงานและชุดฟอร์มรอบเริ่มงานในสต็อกเปลี่ยนตาม
    return site_with_sync(repo_site($id), count($changes) ? master_sync_after_change($u, array($id)) : null);
}

function api_site_delete($req, $params)
{
    $u = auth_require($req);
    $id = param_id($params);
    $s = find_or_404(repo_site($id), 'ไม่พบหน่วยงาน');
    $n = (int)db_value('SELECT COUNT(*) FROM employees WHERE site_id = ?', array($id));
    if ($n > 0) { throw new ApiError('ลบไม่ได้ — ยังมีพนักงานในหน่วยงานนี้ ' . $n . ' คน', 409); }
    db_begin();
    db_exec('DELETE FROM sites WHERE id = ?', array($id));
    audit_write('SITE', $id, 'DELETE', 'ลบหน่วยงาน “' . $s['name'] . '”', null, $u);
    db_commit();
    // สต็อกปิดใช้งานหน่วยงานนี้ (ไม่ลบ — ใบเบิกเก่าอ้างอยู่) · ส่งไม่สำเร็จก็ไม่เป็นไร กดส่งทั้งหมดทีหลังได้
    master_sync_after_change($u, array(), array($s));
    return http_no_content();
}

/* ============================================================
 *  พนักงาน
 * ============================================================ */
function __cmp_emp_code($a, $b) { return str_cmp($a['empCode'], $b['empCode']); }

function api_employees($req, $params)
{
    $q = strtolower(trim((string)req_query($req, 'q', '')));
    $company = req_query($req, 'company');
    $type = req_query($req, 'type');
    $status = req_query($req, 'status');
    $out = array();
    foreach (repo_employees() as $e) {
        if ($q !== '' && strpos(strtolower($e['empCode'] . ' ' . $e['firstName'] . ' ' . $e['lastName']), $q) === false) { continue; }
        if ($company !== null && $e['companyCode'] !== $company) { continue; }
        if ($type !== null && $e['employeeType'] !== $type) { continue; }
        if ($status !== null && $e['status'] !== $status) { continue; }
        $out[] = $e;
    }
    stable_usort($out, '__cmp_emp_code');
    return $out;
}

function api_employee_benefits($req, $params)
{
    $e = find_or_404(repo_employee(param_id($params)), 'ไม่พบพนักงาน');
    return benefits_of($e, repo_site($e['siteId']), repo_rules(), repo_issues(), today_iso());
}

function blank_null($v)
{
    return ($v === null || $v === '') ? null : (string)$v;
}

/** ค่าจากหน้าเว็บ → ค่าที่เก็บ (ว่าง = null) */
function employee_input($b)
{
    return array(
        'empCode' => trim((string)arr_get($b, 'empCode', '')),
        'firstName' => trim((string)arr_get($b, 'firstName', '')),
        'lastName' => trim((string)arr_get($b, 'lastName', '')),
        'companyCode' => (string)arr_get($b, 'companyCode', ''),
        'siteId' => (int)arr_get($b, 'siteId', 0),
        'employeeType' => (string)arr_get($b, 'employeeType', ''),
        'contractType' => arr_get($b, 'contractType') === 'SHORT_3PCT' ? 'SHORT_3PCT' : 'REGULAR',
        'deptGroup' => blank_null(arr_get($b, 'deptGroup')),
        'position' => blank_null(arr_get($b, 'position')),
        'level' => int_or_null(arr_get($b, 'level')),
        'salary' => (float)arr_get($b, 'salary', 0),
        'birthDate' => blank_null(arr_get($b, 'birthDate')),
        'startDate' => blank_null(arr_get($b, 'startDate')),
        'probationPassDate' => blank_null(arr_get($b, 'probationPassDate')),
        'status' => arr_get($b, 'status') === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        'lastWorkingDate' => blank_null(arr_get($b, 'lastWorkingDate')),
        'endDate' => blank_null(arr_get($b, 'endDate')),
        'endReason' => blank_null(arr_get($b, 'endReason')),
        'title' => blank_null(arr_get($b, 'title')),
        'gender' => in_array(arr_get($b, 'gender'), array('M', 'F'), true) ? $b['gender'] : null,
        'nationalId' => arr_get($b, 'nationalId') ? digits_only($b['nationalId']) : null,
        'phone' => arr_get($b, 'phone') ? digits_only($b['phone']) : null,
        'email' => blank_null(arr_get($b, 'email')),
    );
}

function employee_values($e)
{
    return array($e['empCode'], $e['firstName'], $e['lastName'], $e['companyCode'], $e['siteId'], $e['employeeType'],
        $e['contractType'], $e['deptGroup'], $e['position'], $e['level'], $e['salary'], $e['birthDate'], $e['startDate'],
        $e['probationPassDate'], $e['status'], $e['lastWorkingDate'], $e['endDate'], $e['endReason'], $e['title'], $e['gender'],
        $e['nationalId'], $e['phone'], $e['email']);
}

function api_employee_save($req, $params)
{
    $u = auth_require($req);
    $id = isset($params['id']) ? param_id($params) : 0;
    $in = employee_input(req_json($req));
    if (!in_array($in['employeeType'], array('CENTRAL', 'PRO_SITE', 'DAILY', 'MAID_CNS'), true)) {
        throw new ApiError('ประเภทพนักงานไม่ถูกต้อง', 422, array('employeeType' => 'ประเภทพนักงานไม่ถูกต้อง'));
    }
    if ($in['endReason'] !== null && !in_array($in['endReason'], array('RESIGN', 'ABSENT_3D', 'TERMINATED', 'MISCONDUCT'), true)) {
        throw new ApiError('เหตุผลพ้นสภาพไม่ถูกต้อง', 422, array('endReason' => 'เหตุผลพ้นสภาพไม่ถูกต้อง'));
    }
    $errors = validate_employee($in);
    if (count($errors)) {
        $first = reset($errors);
        throw new ApiError($first, 422, $errors);
    }
    $dup = db_value('SELECT id FROM employees WHERE emp_code = ? AND id <> ?', array($in['empCode'], $id));
    if ($dup) { throw new ApiError('รหัสพนักงานซ้ำ', 409); }
    $site = repo_site($in['siteId']);
    if (!$site) { throw new ApiError('ไม่พบหน่วยงาน', 422); }
    if ($site['companyCode'] !== $in['companyCode']) { throw new ApiError('หน่วยงานไม่ได้อยู่ในบริษัทที่เลือก', 422); }

    db_begin();
    if ($id) {
        $old = find_or_404(repo_employee($id), 'ไม่พบพนักงาน');
        $vals = employee_values($in);
        $vals[] = $u['username'];
        $vals[] = $id;
        db_exec('UPDATE employees SET emp_code = ?, first_name = ?, last_name = ?, company_code = ?, site_id = ?, employee_type = ?,
                 contract_type = ?, dept_group = ?, position = ?, level = ?, salary = ?, birth_date = ?, start_date = ?,
                 probation_pass_date = ?, status = ?, last_working_date = ?, end_date = ?, end_reason = ?, title = ?, gender = ?,
                 national_id = ?, phone = ?, email = ?, updated_by = ? WHERE id = ?', $vals);
        $terminated = $old['status'] === 'ACTIVE' && $in['status'] === 'INACTIVE';
        audit_write('EMPLOYEE', $id, 'UPDATE', ($terminated ? 'บันทึกพ้นสภาพ ' : 'แก้ไขข้อมูล ') . full_name($in) . ' (' . $in['empCode'] . ')', $id, $u);
    } else {
        $vals = employee_values($in);
        array_push($vals, db_now(), $u['username'], $u['username']);
        $res = db_exec('INSERT INTO employees (emp_code, first_name, last_name, company_code, site_id, employee_type, contract_type,
                 dept_group, position, level, salary, birth_date, start_date, probation_pass_date, status, last_working_date,
                 end_date, end_reason, title, gender, national_id, phone, email, created_at, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', $vals);
        $id = $res['id'];
        audit_write('EMPLOYEE', $id, 'CREATE', 'เพิ่มพนักงาน ' . full_name($in) . ' (' . $in['empCode'] . ')', $id, $u);
    }
    db_commit();
    $e = repo_employee($id);
    return isset($params['id']) ? $e : http_data($e, 201);
}

function api_employee_delete($req, $params)
{
    $u = auth_require($req);
    $id = param_id($params);
    $e = find_or_404(repo_employee($id), 'ไม่พบพนักงาน');
    $has = db_value('SELECT 1 FROM insurance_batch_items WHERE employee_id = ? LIMIT 1', array($id))
        || db_value('SELECT 1 FROM uniform_issues WHERE employee_id = ? LIMIT 1', array($id));
    if ($has) { throw new ApiError('ลบไม่ได้ — มีประวัติแจ้งประกัน/แจกชุดแล้ว ให้ใช้ “บันทึกพ้นสภาพ” แทน', 409); }
    db_begin();
    db_exec('DELETE FROM employees WHERE id = ?', array($id));
    audit_write('EMPLOYEE', $id, 'DELETE', 'ลบพนักงาน ' . full_name($e) . ' (' . $e['empCode'] . ')', null, $u);
    db_commit();
    return http_no_content();
}

function api_rules($req, $params) { return repo_rules(); }

/* ============================================================
 *  ประกันกลุ่ม
 * ============================================================ */
function api_insurance_cycle($req, $params)
{
    $date = assert_iso_date($params['date']);
    $w = repo_world();
    return build_insurance_cycle($date, $w['employees'], $w['sites'], $w['rules'], $w['batches']);
}

function __cmp_id_desc($a, $b) { return $b['id'] - $a['id']; }

function api_batches($req, $params)
{
    $byId = by_key(repo_employees(), 'id');
    $list = repo_batches();
    stable_usort($list, '__cmp_id_desc');
    foreach ($list as $i => $b) {
        $lite = array();
        foreach (batch_ids($b) as $id) {
            if (isset($byId[$id])) { $lite[] = employee_lite($byId[$id]); }
        }
        $list[$i]['employees'] = $lite;
    }
    return $list;
}

function api_batch($req, $params)
{
    $w = repo_world();
    $b = find_or_404(find_by($w['batches'], 'id', param_id($params)), 'ไม่พบรายการส่งแจ้ง');
    return build_batch_detail($b, $w['employees'], $w['sites'], $w['rules'], $w['batches']);
}

function api_batch_export($req, $params)
{
    $w = repo_world();
    $batch = find_or_404(find_by($w['batches'], 'id', param_id($params)), 'ไม่พบรายการส่งออก');
    $insurer = $batch['insurerId'] !== null ? repo_insurer($batch['insurerId']) : null;
    if (!$insurer) {
        throw new ApiError('ไม่พบแบบฟอร์มของ' . ($batch['insurerName'] !== null ? $batch['insurerName'] : 'บริษัทประกัน')
            . 'แล้ว — ดาวน์โหลดเป็น CSV จากหน้ารายชื่อแทน', 404);
    }
    return build_batch_export($batch, $insurer, $w['employees'], $w['sites'], $w['rules'], $w['batches'], repo_companies());
}

/** บันทึก batch + items (ลำดับตามที่ส่งมา) → InsuranceBatch */
function batch_insert($cycleDate, $insurerId, $insurerName, $items, $u)
{
    $now = db_now();
    $res = db_exec('INSERT INTO insurance_batches (cycle_date, insurer_id, insurer_name, submitted_at, submitted_by_user_id,
                    submitted_by_name, created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        array($cycleDate, $insurerId, $insurerName, $now, $u['id'], $u['name'], $now, $u['username'], $u['username']));
    foreach ($items as $i => $it) {
        db_exec('INSERT INTO insurance_batch_items (batch_id, seq, employee_id, type, direction, created_at, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            array($res['id'], $i + 1, $it['employeeId'], $it['type'], direction_of($it['type']), $now, $u['username'], $u['username']));
    }
    return array('id' => $res['id'], 'cycleDate' => $cycleDate, 'insurerId' => $insurerId, 'insurerName' => $insurerName,
        'items' => $items, 'submittedAt' => stamp_from_db($now), 'submittedBy' => $u['name']);
}

function api_batch_submit($req, $params)
{
    $u = auth_require($req);
    $b = req_json($req);
    $ids = (array)arr_get($b, 'employeeIds', array());
    $type = arr_get($b, 'type');
    if (!in_array($type, array('IN', 'OUT', 'URGENT'), true)) { throw new ApiError('ประเภทการแจ้งไม่ถูกต้อง', 422); }
    if (count($ids) === 0) { throw new ApiError('ไม่มีรายการที่เลือก', 422); }
    $cycleDate = assert_iso_date(arr_get($b, 'cycleDate'));
    db_begin();
    $byId = by_key(repo_employees(), 'id');
    $items = array();
    foreach ($ids as $id) {
        if (!isset($byId[(int)$id])) { throw new ApiError('ไม่พบพนักงาน', 404); }
        $items[] = array('employeeId' => (int)$id, 'type' => $type);
    }
    $sent = sent_index(repo_batches(), array_values($byId));
    $already = 0;
    foreach ($items as $it) {
        if (isset($sent[$type === 'IN' ? 'IN' : 'OUT'][$it['employeeId']])) { $already++; }
    }
    if ($already > 0) { throw new ApiError('มีพนักงานที่ถูกแจ้งไปแล้ว ' . $already . ' ราย', 409); }
    $batch = batch_insert($cycleDate, int_or_null(arr_get($b, 'insurerId')), arr_get($b, 'insurerName'), $items, $u);
    audit_write('INSURANCE_BATCH', $batch['id'], 'CREATE',
        'ส่ง' . label_batch_type($type) . ' ' . count($items) . ' ราย (รอบ ' . $cycleDate . ')', count($items) === 1 ? $items[0]['employeeId'] : null, $u);
    db_commit();
    return http_data($batch, 201);
}

function api_batch_cancel($req, $params)
{
    $u = auth_require($req);
    $id = param_id($params);
    $b = find_or_404(find_by(repo_batches(), 'id', $id), 'ไม่พบรายการส่งแจ้ง');
    $c = batch_counts($b);
    db_begin();
    db_exec('DELETE FROM insurance_batches WHERE id = ?', array($id));
    audit_write('INSURANCE_BATCH', $id, 'CANCEL', 'ยกเลิกการส่งออก' . ($b['insurerName'] ? $b['insurerName'] : '') . ' #' . $id
        . ' รอบ ' . $b['cycleDate'] . ' (เข้า ' . $c['in'] . ' · ออก ' . ($c['out'] + $c['urgent']) . ' ราย)', null, $u);
    db_commit();
    return http_no_content();
}

/** POST /insurance/exports {cycleDate, insurerId, record} — record = แทนที่การส่งออกเดิมของรอบ + บริษัทประกันนั้น */
function api_insurance_export($req, $params)
{
    $u = auth_require($req);
    $b = req_json($req);
    $cycleDate = assert_iso_date(arr_get($b, 'cycleDate'));
    $insurerId = (int)arr_get($b, 'insurerId', 0);
    $insurer = find_or_404(repo_insurer($insurerId), 'ไม่พบแบบฟอร์มบริษัทประกัน');
    $companies = repo_companies();
    $w = repo_world();
    $data = build_insurer_export($cycleDate, $insurer, $w['employees'], $w['sites'], $w['rules'], $w['batches'], $companies);
    if (empty($b['record'])) {
        $data['batches'] = array();
        return $data;
    }
    db_begin();
    $replaced = array();
    foreach ($w['batches'] as $x) {
        if ($x['cycleDate'] === $cycleDate && $x['insurerId'] === $insurerId) { $replaced[] = $x['id']; }
    }
    foreach ($replaced as $rid) { db_exec('DELETE FROM insurance_batches WHERE id = ?', array($rid)); }
    $all = array();
    foreach ($data['companies'] as $c) {
        foreach ($c['in'] as $r) { $all[] = $r; }
        foreach ($c['out'] as $r) { $all[] = $r; }
    }
    $created = array();
    if (count($all)) {
        $items = array();
        foreach ($all as $r) { $items[] = array('employeeId' => $r['employee']['id'], 'type' => $r['type']); }
        $created[] = batch_insert($cycleDate, $insurerId, $insurer['shortName'], $items, $u);
    }
    $nIn = 0;
    foreach ($all as $r) {
        if ($r['type'] === 'IN') { $nIn++; }
    }
    $ids = array();
    foreach ($created as $c) { $ids[] = $c['id']; }
    audit_write('INSURANCE_BATCH', count($ids) ? implode(',', $ids) : '-', 'CREATE',
        'ส่งออกไฟล์แจ้ง' . $insurer['shortName'] . ' รอบ ' . $cycleDate . ': เข้า ' . $nIn . ' · ออก ' . (count($all) - $nIn) . ' ราย'
        . (count($replaced) ? ' (แทนที่ไฟล์เดิมของรอบนี้)' : ''), count($all) === 1 ? $all[0]['employee']['id'] : null, $u);
    db_commit();
    $out = build_insurer_export($cycleDate, $insurer, $w['employees'], $w['sites'], $w['rules'], repo_batches(), $companies);
    $out['batches'] = $created;
    return $out;
}

/* ============================================================
 *  แบบฟอร์มบริษัทประกัน
 * ============================================================ */
function api_insurers($req, $params) { return repo_insurers(); }

function insurer_store($f, $u, $id)
{
    $rest = $f;
    foreach (array('id', 'name', 'shortName', 'active') as $k) { unset($rest[$k]); }
    if (!isset($rest['companies'])) { $rest['companies'] = array(); }
    $json = json_encode($rest);
    if ($id) {
        db_exec('UPDATE insurer_forms SET name = ?, short_name = ?, active = ?, form_json = ?, updated_by = ? WHERE id = ?',
            array(trim($f['name']), trim($f['shortName']), !empty($f['active']), $json, $u['username'], $id));
        return $id;
    }
    $res = db_exec('INSERT INTO insurer_forms (name, short_name, active, form_json, created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        array(trim($f['name']), trim($f['shortName']), !empty($f['active']), $json, db_now(), $u['username'], $u['username']));
    return $res['id'];
}

/** POST /insurers · PUT /insurers/{id} */
function api_insurer_save($req, $params)
{
    $u = auth_require($req);
    $id = isset($params['id']) ? param_id($params) : 0;
    $f = req_json($req);
    $f['id'] = $id;
    $errors = validate_insurer_form($f, repo_insurers());
    if (count($errors)) {
        $first = reset($errors);
        throw new ApiError($first, 422, $errors);
    }
    $old = $id ? find_or_404(repo_insurer($id), 'ไม่พบแบบฟอร์มบริษัทประกัน') : null;
    /* ผู้อัปโหลดไฟล์แบบฟอร์มมาจาก session — ไม่เชื่อชื่อที่หน้าเว็บส่งมา */
    if (!empty($f['template']) && is_array($f['template'])) {
        $oldAt = ($old && !empty($old['template']['uploadedAt'])) ? $old['template']['uploadedAt'] : null;
        $newAt = arr_get($f['template'], 'uploadedAt');
        if ($old === null || $newAt !== $oldAt) {
            $f['template']['uploadedBy'] = $u['name'];
        } elseif (isset($old['template']['uploadedBy'])) {
            $f['template']['uploadedBy'] = $old['template']['uploadedBy'];
        }
    }
    db_begin();
    $newId = insurer_store($f, $u, $id);
    audit_write('INSURER_FORM', $newId, $id ? 'UPDATE' : 'CREATE', ($id ? 'แก้ไขแบบฟอร์ม ' : 'เพิ่มแบบฟอร์ม ') . trim($f['shortName']), null, $u);
    db_commit();
    return $id ? repo_insurer($newId) : http_data(repo_insurer($newId), 201);
}

function __cmp_company_code($a, $b) { return str_cmp($a['companyCode'], $b['companyCode']); }

/** PUT /insurers/bindings {bindings: [{companyCode, insurerId, policyNo, holderName, plan}]} */
function api_insurer_bindings($req, $params)
{
    $u = auth_require($req);
    $b = req_json($req);
    $bindings = (array)arr_get($b, 'bindings', array());
    $forms = repo_insurers();
    $errors = validate_bindings($bindings, $forms);
    if (count($errors)) {
        $first = reset($errors);
        throw new ApiError($first, 422, $errors);
    }
    db_begin();
    $summary = array();
    foreach ($forms as $f) {
        $cos = array();
        foreach ($bindings as $x) {
            if ((int)arr_get($x, 'insurerId', 0) !== $f['id']) { continue; }
            $cos[] = array('companyCode' => $x['companyCode'], 'policyNo' => (string)arr_get($x, 'policyNo', ''),
                'holderName' => (string)arr_get($x, 'holderName', ''), 'plan' => (string)arr_get($x, 'plan', ''));
        }
        stable_usort($cos, '__cmp_company_code');
        $f['companies'] = $cos;
        insurer_store($f, $u, $f['id']);
        $codes = array();
        foreach ($cos as $c) { $codes[] = $c['companyCode']; }
        $summary[] = $f['shortName'] . ': ' . (count($codes) ? implode(', ', $codes) : '-');
    }
    audit_write('INSURER_FORM', 'bindings', 'UPDATE', 'ผูกบริษัทกับบริษัทประกัน — ' . implode(' · ', $summary), null, $u);
    db_commit();
    return repo_insurers();
}

function api_insurer_delete($req, $params)
{
    $u = auth_require($req);
    $id = param_id($params);
    $f = find_or_404(repo_insurer($id), 'ไม่พบแบบฟอร์มบริษัทประกัน');
    db_begin();
    db_exec('DELETE FROM insurer_forms WHERE id = ?', array($id));      // ประวัติเก็บชื่อบริษัทประกันไว้ในตัว
    audit_write('INSURER_FORM', $id, 'DELETE', 'ลบแบบฟอร์ม ' . $f['shortName'], null, $u);
    db_commit();
    return http_no_content();
}

/* ============================================================
 *  ชุดฟอร์ม
 * ============================================================ */
function __cmp_issue($a, $b)
{
    $d = str_cmp($b['issuedAt'], $a['issuedAt']);
    return $d !== 0 ? $d : $b['id'] - $a['id'];
}

function api_issues($req, $params)
{
    $emp = req_query($req, 'employeeId');
    $out = array();
    foreach (repo_issues() as $i) {
        if ($emp === null || $i['employeeId'] === (int)$emp) { $out[] = $i; }
    }
    stable_usort($out, '__cmp_issue');
    return $out;
}

function api_pending($req, $params)
{
    $w = repo_world();
    return build_uniform_pending($w['employees'], $w['sites'], $w['rules'], $w['issues'], today_iso());
}

function issue_insert($i, $u)
{
    $s = isset($i['stock']) ? $i['stock'] : null;
    $res = db_exec('INSERT INTO uniform_issues (employee_id, entitlement_key, event, qty, size, issued_at, issued_by_user_id, issued_by_name,
             source, stock_ref, stock_doc_id, stock_doc_no, stock_stage, stock_issued_at, stock_received_at, stock_cancel_note, stock_items,
             created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        array($i['employeeId'], $i['entitlementKey'], $i['event'], (int)$i['qty'], $i['size'], $i['issuedAt'], $u['id'], $u['name'],
            $i['source'], $s ? $s['ref'] : null, $s ? int_or_null($s['docId']) : null, $s ? $s['docNo'] : null, $s ? $s['stage'] : null,
            $s ? $s['issuedAt'] : null, $s ? $s['receivedAt'] : null, $s ? $s['cancelNote'] : null, $s ? json_encode($s['items']) : null,
            db_now(), $u['username'], $u['username']));
    return $res['id'];
}

/** POST /uniform/issues {employeeId, entitlementKey, event, qty, size, issuedAt} — บันทึกการแจกเอง */
function api_issue_create($req, $params)
{
    $u = auth_require($req);
    $b = req_json($req);
    $e = find_or_404(repo_employee((int)arr_get($b, 'employeeId', 0)), 'ไม่พบพนักงาน');
    if (trim((string)arr_get($b, 'size', '')) === '') { throw new ApiError('กรุณาเลือกไซซ์', 422); }
    $event = arr_get($b, 'event');
    if (!in_array($event, array('START', 'PROBATION', 'ANNUAL'), true)) { throw new ApiError('รอบการแจกไม่ถูกต้อง', 422); }
    $qty = (int)arr_get($b, 'qty', 0);
    if ($qty < 1) { throw new ApiError('จำนวนต้องเป็นจำนวนเต็มมากกว่า 0', 422); }
    $key = (string)arr_get($b, 'entitlementKey', '');
    $dup = db_one('SELECT * FROM uniform_issues WHERE employee_id = ? AND entitlement_key = ?', array($e['id'], $key));
    if ($dup) { throw new ApiError($dup['source'] === 'STOCK' ? 'ส่งเบิกคลังไปแล้ว (ใบ ' . $dup['stock_doc_no'] . ')' : 'รายการนี้แจกไปแล้ว', 409); }
    $issue = array('employeeId' => $e['id'], 'entitlementKey' => $key, 'event' => $event, 'qty' => $qty,
        'size' => trim($b['size']), 'issuedAt' => assert_iso_date(arr_get($b, 'issuedAt'), 'กรุณาระบุวันที่แจก'), 'source' => 'MANUAL');
    db_begin();
    $id = issue_insert($issue, $u);
    audit_write('UNIFORM_ISSUE', $id, 'CREATE', 'แจกชุดฟอร์ม (' . label_uniform_event($event) . ') ' . $qty . ' ตัว ไซซ์ ' . $issue['size']
        . ' ให้ ' . full_name($e), $e['id'], $u);
    db_commit();
    return http_data(repo_issue($id), 201);
}

/** DELETE /uniform/issues/{id} — ผ่านคลัง: ยกเลิกได้เฉพาะใบที่คลังยังไม่จ่าย และต้องยกเลิกใบในสต็อกก่อน */
function api_issue_cancel($req, $params)
{
    $u = auth_require($req);
    $id = param_id($params);
    $i = find_or_404(repo_issue($id), 'ไม่พบรายการแจก');
    if (is_stock_issue($i)) {
        if (!in_array($u['role'], stock_write_roles(), true)) { throw new ApiError('บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้', 403, null, 'FORBIDDEN'); }
        if (is_handed_out($i)) {
            throw new ApiError('คลังจ่ายของตามใบ ' . $i['stock']['docNo'] . ' ไปแล้ว — ต้องให้คลังยกเลิกใบจ่ายในระบบสต็อก', 409);
        }
        stock_cancel($i['stock']['ref'], 'ยกเลิกจากระบบสวัสดิการ', $u);
    }
    $e = repo_employee($i['employeeId']);
    $who = $e ? full_name($e) : '#' . $i['employeeId'];
    db_begin();
    db_exec('DELETE FROM uniform_issues WHERE id = ?', array($id));
    audit_write('UNIFORM_ISSUE', $id, 'CANCEL', is_stock_issue($i)
        ? 'ยกเลิกการส่งเบิกชุดฟอร์ม (' . label_uniform_event($i['event']) . ') ใบ ' . $i['stock']['docNo'] . ' ของ ' . $who
        : 'ยกเลิกการแจกชุดฟอร์ม (' . label_uniform_event($i['event']) . ') ของ ' . $who, $i['employeeId'], $u);
    db_commit();
    return http_no_content();
}

/** สิทธิ์ที่ยังไม่ได้แจกและยังไม่ได้ส่งเบิก — 404 ไม่พบ / 409 แจกหรือส่งเบิกไปแล้ว */
function open_entitlement($employeeId, $key)
{
    $e = find_or_404(repo_employee($employeeId), 'ไม่พบพนักงาน');
    $site = repo_site($e['siteId']);
    $st = uniform_status($e, $site, repo_rules(), repo_issues(), today_iso());
    $ent = find_by($st['entitlements'], 'key', $key);
    if (!$ent) { throw new ApiError('ไม่พบสิทธิ์ชุดฟอร์มรายการนี้', 404); }
    if ($ent['requested']) { throw new ApiError('ส่งเบิกคลังไปแล้ว (ใบ ' . $ent['stockDocNo'] . ') — รอคลังจ่าย', 409); }
    if ($ent['issued']) { throw new ApiError('รายการนี้แจกไปแล้ว', 409); }
    return array('e' => $e, 'site' => $site, 'st' => $st, 'ent' => $ent);
}

/** GET /uniform/stock-options?employeeId=&entitlementKey= */
function api_stock_options($req, $params)
{
    $o = open_entitlement((int)req_query($req, 'employeeId', 0), (string)req_query($req, 'entitlementKey', ''));
    $catalog = stock_catalog($o['ent']['items'], $o['st']['logo'], $o['e']['siteId'], $o['ent']['event']);
    $out = build_stock_options($o['ent'], $catalog, $o['e']);
    $out['logo'] = $o['st']['logo'];
    $out['event'] = $o['ent']['event'];
    $out['qty'] = $o['ent']['qty'];
    $out['qtyLabel'] = $o['ent']['qtyLabel'];
    $out['style'] = $o['ent']['style'];
    return $out;
}

/** POST /uniform/stock-requests {employeeId, entitlementKey, lines} — ออกใบเบิกในสต็อก ผู้ขอเบิกจาก session */
function api_stock_request($req, $params)
{
    $u = auth_require_role($req, stock_write_roles());
    $b = req_json($req);
    $o = open_entitlement((int)arr_get($b, 'employeeId', 0), (string)arr_get($b, 'entitlementKey', ''));
    $lines = (array)arr_get($b, 'lines', array());
    if (!count($lines)) { throw new ApiError('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ', 422); }
    foreach ($lines as $l) {
        if (empty($l['productId'])) { throw new ApiError('กรุณาเลือกแบบและไซซ์ให้ครบทุกรายการ', 422); }
        if (!(is_int(arr_get($l, 'qty')) && $l['qty'] > 0)) { throw new ApiError('จำนวนต้องเป็นจำนวนเต็มมากกว่า 0', 422); }
    }
    $e = $o['e'];
    $ent = $o['ent'];
    $ref = stock_ref($e['id'], $ent['key']);
    $res = stock_call(stock_submit_payload($e, $o['site'], $ent, $o['st']['logo'], $lines, $u));
    $stock = (isset($res['status'][$ref]) && is_array($res['status'][$ref])) ? to_stock_request($ref, $res['status'][$ref])
        : array('ref' => $ref, 'docId' => arr_get($res, 'doc_id'), 'docNo' => arr_get($res, 'doc_no'), 'stage' => 'REQUESTED',
            'issuedAt' => null, 'receivedAt' => null, 'cancelNote' => '', 'items' => array());
    $qty = 0;
    foreach ($lines as $l) { $qty += (int)$l['qty']; }
    db_begin();
    /* คำขอก่อนหน้าหลุดระหว่างทาง (สต็อกออกใบไปแล้ว) — ใช้ใบเดิม ไม่ซ้อนรายการ */
    db_exec('DELETE FROM uniform_issues WHERE employee_id = ? AND entitlement_key = ?', array($e['id'], $ent['key']));
    $id = issue_insert(array('employeeId' => $e['id'], 'entitlementKey' => $ent['key'], 'event' => $ent['event'], 'qty' => $qty,
        'size' => stock_sizes($stock), 'issuedAt' => today_iso(), 'source' => 'STOCK', 'stock' => $stock), $u);
    audit_write('UNIFORM_ISSUE', $id, 'CREATE', 'ส่งเบิกชุดฟอร์ม (' . label_uniform_event($ent['event']) . ') ใบ ' . $stock['docNo']
        . ' ให้ ' . full_name($e) . ' — รอคลังจ่าย', $e['id'], $u);
    db_commit();
    return http_data(repo_issue($id), 201);
}

/** POST /uniform/stock-sync — ดึงสถานะใบเบิกจากสต็อก (คลังยกเลิก → สิทธิ์กลับเป็นค้างแจก) */
function api_stock_sync($req, $params)
{
    $u = auth_require($req);
    $open = array();
    foreach (repo_issues() as $i) {
        if (is_stock_issue($i) && $i['stock']['stage'] !== 'RECEIVED') { $open[] = $i; }
    }
    if (!count($open)) { return array('changed' => 0); }
    $refs = array();
    foreach ($open as $i) { $refs[] = $i['stock']['ref']; }
    $status = stock_status($refs);
    $changed = 0;
    db_begin();
    foreach ($open as $i) {
        $s = isset($status[$i['stock']['ref']]) ? $status[$i['stock']['ref']] : null;
        $next = ($s && (int)$s['doc_id'] === (int)$i['stock']['docId']) ? to_stock_request($i['stock']['ref'], $s) : null;
        $kind = stock_change($i['stock'], $next);
        if ($kind === 'NONE') { continue; }
        $changed++;
        $e = repo_employee($i['employeeId']);
        $who = $e ? full_name($e) : '#' . $i['employeeId'];
        if ($kind === 'CANCELLED') {
            db_exec('DELETE FROM uniform_issues WHERE id = ?', array($i['id']));
            $why = $next['cancelNote'] ? ' (' . $next['cancelNote'] . ')' : '';
            audit_write('UNIFORM_ISSUE', $i['id'], 'CANCEL', 'คลังยกเลิกใบ ' . $i['stock']['docNo'] . $why . ' — ชุดฟอร์มของ ' . $who . ' กลับเป็นค้างแจก',
                $i['employeeId'], $u);
            continue;
        }
        $qty = 0;
        foreach (uniform_lines($next) as $l) { $qty += (int)$l['qty']; }
        $issuedAt = $next['issuedAt'] ? substr($next['issuedAt'], 0, 10) : $i['issuedAt'];
        db_exec('UPDATE uniform_issues SET size = ?, qty = ?, issued_at = ?, stock_doc_no = ?, stock_stage = ?, stock_issued_at = ?,
                 stock_received_at = ?, stock_cancel_note = ?, stock_items = ?, updated_by = ? WHERE id = ?',
            array(stock_sizes($next), $qty ? $qty : $i['qty'], $issuedAt, $next['docNo'], $next['stage'], $next['issuedAt'],
                $next['receivedAt'], $next['cancelNote'], json_encode($next['items']), $u['username'], $i['id']));
        if ($kind === 'ISSUED') {
            audit_write('UNIFORM_ISSUE', $i['id'], 'UPDATE', 'คลังจ่ายชุดฟอร์มตามใบ ' . $next['docNo'] . ' ให้ ' . $who . ' แล้ว', $i['employeeId'], $u);
        }
        if ($kind === 'RECEIVED') {
            audit_write('UNIFORM_ISSUE', $i['id'], 'UPDATE', $who . ' เซ็นรับชุดฟอร์มตามใบ ' . $next['docNo'] . ' แล้ว', $i['employeeId'], $u);
        }
    }
    db_commit();
    return array('changed' => $changed);
}

/** บทบาทที่ออก/ยกเลิกใบเบิกได้ = capability stock.request (ตั้งได้ที่ admin.html) */
function stock_write_roles()
{
    return cap_roles('stock.request');
}

/**
 * POST /stock/bridge {action, ...} — ตัวกลางแบบเดิมสำหรับหน้าเว็บโหมด mock (StockGateway)
 * ต้องเข้าสู่ระบบ · ผู้ขอเบิกจาก session (ทิ้ง requested_by_* ที่ส่งมา) · ตอบ { ok, message, ... } ตามสต็อก
 */
function api_stock_bridge($req, $params)
{
    $in = req_json($req);
    $action = (string)arr_get($in, 'action', '');
    if (!in_array($action, array('catalog', 'submit', 'status', 'cancel'), true)) { throw new ApiError('ไม่รู้จักคำสั่งที่ส่งมา', 400); }
    $write = $action === 'submit' || $action === 'cancel';
    $u = $write ? auth_require_role($req, stock_write_roles()) : auth_require($req);
    foreach (array('requested_by_name', 'requested_by_user', 'requested_by_user_id', 'requested_by_emp_code') as $k) { unset($in[$k]); }
    if ($write) {
        foreach (stock_actor_fields($u) as $k => $v) { $in[$k] = $v; }
    }
    $res = stock_raw($in);
    $body = is_array($res[1]) ? $res[1] : array('ok' => false, 'message' => 'ระบบสต็อกตอบกลับผิดรูปแบบ (HTTP ' . $res[0] . ')');
    if ($res[0] < 400 && !empty($body['ok']) && $write) {
        if ($action === 'submit') {
            audit_write('STOCK_REQUEST', arr_get($in, 'employee_id') . ':' . arr_get($in, 'entitlement_key'), 'CREATE',
                'ส่งเบิกชุดฟอร์ม ' . arr_get($in, 'entitlement_key') . ' ใบ ' . arr_get($body, 'doc_no') . ' ให้ ' . arr_get($in, 'employee_name'),
                null, $u);
        } else {
            audit_write('STOCK_REQUEST', (string)arr_get($in, 'ref'), 'CANCEL', 'ยกเลิกใบเบิกชุดฟอร์ม ' . arr_get($in, 'ref'), null, $u);
        }
    }
    return http_response($res[0] >= 400 ? $res[0] : (is_array($res[1]) ? 200 : 502), $body);
}
