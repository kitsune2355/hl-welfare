<?php
/* ============================================================
 *  backend/api/welfare.php — สวัสดิการเพิ่มเติมที่ HR สร้างเอง (sql/021)
 *
 *  GET    /welfare/programs                    ทุกสวัสดิการ (รวมที่ปิด) — เมนูใน sidebar + หน้าตั้งค่า (ทุกคนที่ login)
 *  POST   /welfare/programs                    สร้าง (สิทธิ์ welfare.manage)
 *  PUT    /welfare/programs/{id}               แก้ / เปิด-ปิดใช้งาน (สิทธิ์ welfare.manage) — ไม่มีการลบ
 *  GET    /welfare/programs/{id}/roster        ผู้มีสิทธิ์ + สถานะ (สิทธิ์ welfare.view)
 *  GET    /welfare/programs/{id}/records       ประวัติการให้ (สิทธิ์ welfare.view)
 *  POST   /welfare/programs/{id}/records       บันทึกการให้ {employeeId, periodKey, date, amount, data, note} (สิทธิ์ welfare.record)
 *  DELETE /welfare/records/{id}                ยกเลิกการให้ (บันทึกผิด) (สิทธิ์ welfare.record)
 *  พนักงาน / การให้ กรองตามขอบเขตบริษัทของผู้ใช้ (HR บริษัทเห็นเฉพาะบริษัทตัวเอง)
 *  การตรวจข้อมูล = backend/domain/welfare.php (คู่แฝดของ web/assets/js/domain/welfare.js)
 * ============================================================ */

function welfare_ready()
{
    return db_table_exists('welfare_programs');
}

function welfare_need_table()
{
    if (!welfare_ready()) {
        throw new ApiError('ยังใช้สวัสดิการเพิ่มเติมไม่ได้ — ผู้ดูแลระบบต้องรัน backend/sql/021_welfare_programs.sql ก่อน', 503);
    }
}

function map_welfare_program($r)
{
    $c = json_in($r['config'], array());
    return array(
        'id' => (int)$r['id'],
        'name' => $r['name'],
        'icon' => $r['icon'],
        'description' => $r['description'] !== null ? $r['description'] : '',
        'active' => (bool)$r['active'],
        'sortOrder' => (int)$r['sort_order'],
        'frequency' => arr_get($c, 'frequency', 'ONCE'),
        'waitFrom' => arr_get($c, 'waitFrom', 'START'),
        'unit' => arr_get($c, 'unit', ''),
        'rules' => is_array(arr_get($c, 'rules')) ? $c['rules'] : array(),
        'fields' => is_array(arr_get($c, 'fields')) ? $c['fields'] : array(),
    );
}

/** สวัสดิการทั้งหมด (รวมที่ปิด) เรียงตามลำดับ — ยังไม่ได้รัน 021 = ไม่มี */
function repo_welfare_programs()
{
    if (!welfare_ready()) { return array(); }
    $out = array();
    foreach (db_all('SELECT * FROM welfare_programs ORDER BY sort_order, id') as $r) { $out[] = map_welfare_program($r); }
    return $out;
}

function repo_welfare_program($id)
{
    if (!welfare_ready()) { return null; }
    $r = db_one('SELECT * FROM welfare_programs WHERE id = ?', array((int)$id));
    return $r ? map_welfare_program($r) : null;
}

function map_welfare_record($r)
{
    $data = json_in($r['data'], array());
    return array(
        'id' => (int)$r['id'],
        'programId' => (int)$r['program_id'],
        'employeeId' => (int)$r['employee_id'],
        'periodKey' => $r['period_key'],
        'date' => $r['record_date'],
        'amount' => $r['amount'] !== null ? num($r['amount']) : null,
        'data' => count($data) ? $data : new stdClass(),     // {} เหมือน JS (array ว่างออกเป็น [])
        'note' => $r['note'] !== null ? $r['note'] : '',
        'recordedBy' => $r['recorded_by_name'],
        'createdAt' => stamp_from_db($r['created_at']),
    );
}

/** การให้ทั้งหมด (ของสวัสดิการเดียว / ทุกอัน) ตามขอบเขตบริษัท · $employeeId = เฉพาะคนนั้น */
function repo_welfare_records($programId = null, $employeeId = null)
{
    if (!welfare_ready()) { return array(); }
    $s = data_scope();
    $where = array();
    $args = array();
    if ($programId !== null) { $where[] = 'w.program_id = ?'; $args[] = (int)$programId; }
    if ($employeeId !== null) { $where[] = 'w.employee_id = ?'; $args[] = (int)$employeeId; }
    if ($s !== null) { $where[] = 'e.company_code = ?'; $args[] = $s; }
    $out = array();
    foreach (db_all('SELECT w.* FROM welfare_records w' . ($s !== null ? ' JOIN employees e ON e.id = w.employee_id' : '')
        . (count($where) ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY w.id', $args) as $r) {
        $out[] = map_welfare_record($r);
    }
    return $out;
}

function welfare_program_or_404($params)
{
    welfare_need_table();
    return find_or_404(repo_welfare_program(param_id($params)), 'ไม่พบสวัสดิการนี้');
}

function api_welfare_programs($req, $params)
{
    return repo_welfare_programs();
}

function api_welfare_program_save($req, $params)
{
    $u = auth_require($req);
    welfare_need_table();
    $id = isset($params['id']) ? param_id($params) : 0;
    $old = $id ? find_or_404(repo_welfare_program($id), 'ไม่พบสวัสดิการนี้') : null;
    $b = req_json($req);
    $b['id'] = $id ? $id : null;
    $p = normalize_welfare_program($b);
    $errors = validate_welfare_program($p, repo_welfare_programs());
    if (count($errors)) { throw new ApiError(reset($errors), 422, $errors); }
    $config = json_encode(array('frequency' => $p['frequency'], 'waitFrom' => $p['waitFrom'], 'unit' => $p['unit'],
        'rules' => $p['rules'], 'fields' => $p['fields']));
    db_begin();
    if ($old) {
        db_exec('UPDATE welfare_programs SET name = ?, icon = ?, description = ?, config = ?, active = ?, updated_by = ? WHERE id = ?',
            array($p['name'], $p['icon'], $p['description'] !== '' ? $p['description'] : null, $config, $p['active'] ? 1 : 0, $u['username'], $id));
        audit_write('WELFARE_PROGRAM', $id, 'UPDATE', 'แก้ไขสวัสดิการ ' . $p['name'], null, $u);
        if ($p['active'] !== $old['active']) {
            audit_write('WELFARE_PROGRAM', $id, 'UPDATE', ($p['active'] ? 'เปิดใช้งาน' : 'ปิดใช้งาน') . 'สวัสดิการ ' . $p['name'], null, $u);
        }
    } else {
        $sort = (int)db_value('SELECT COALESCE(MAX(sort_order), 0) FROM welfare_programs') + 10;
        $res = db_exec('INSERT INTO welfare_programs (name, icon, description, config, active, sort_order, created_at, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            array($p['name'], $p['icon'], $p['description'] !== '' ? $p['description'] : null, $config, $p['active'] ? 1 : 0, $sort,
                db_now(), $u['username'], $u['username']));
        $id = $res['id'];
        audit_write('WELFARE_PROGRAM', $id, 'CREATE', 'สร้างสวัสดิการ ' . $p['name'], null, $u);
    }
    db_commit();
    $saved = repo_welfare_program($id);
    return $old ? $saved : http_data($saved, 201);
}

function api_welfare_roster($req, $params)
{
    $p = welfare_program_or_404($params);
    $w = repo_world();
    return build_welfare_roster($p, $w['employees'], $w['sites'], repo_welfare_records($p['id']), today_iso());
}

function __cmp_welfare_record_desc($a, $b)
{
    $c = strcmp($b['date'], $a['date']);
    return $c !== 0 ? $c : $b['id'] - $a['id'];
}

function api_welfare_records($req, $params)
{
    $p = welfare_program_or_404($params);
    $emps = by_key(repo_employees(), 'id');
    $out = array();
    foreach (repo_welfare_records($p['id']) as $r) {
        $e = isset($emps[$r['employeeId']]) ? $emps[$r['employeeId']] : null;
        $r['employee'] = $e ? employee_lite($e) : array('id' => $r['employeeId'], 'empCode' => '#' . $r['employeeId'], 'firstName' => '(ไม่พบข้อมูลพนักงาน)', 'lastName' => '');
        $out[] = $r;
    }
    stable_usort($out, '__cmp_welfare_record_desc');
    return $out;
}

/** ค่าช่องข้อมูลที่เก็บ — เฉพาะช่องที่สวัสดิการกำหนด · ข้อความตัดช่องว่าง · ว่าง = ไม่เก็บ */
function welfare_record_data($program, $data)
{
    $out = array();
    if (!is_array($data)) { return $out; }
    foreach ($program['fields'] as $f) {
        if (!array_key_exists($f['key'], $data)) { continue; }
        $v = $data[$f['key']];
        if (is_string($v)) { $v = welfare_str($v, 500); }
        if (!welfare_blank($v)) { $out[$f['key']] = $v; }
    }
    return $out;
}

function api_welfare_record_create($req, $params)
{
    $u = auth_require($req);
    $p = welfare_program_or_404($params);
    if (!$p['active']) { throw new ApiError('สวัสดิการนี้ปิดใช้งานแล้ว — บันทึกการให้ไม่ได้', 409); }
    $b = req_json($req);
    $emp = find_or_404(repo_employee((int)arr_get($b, 'employeeId', 0)), 'ไม่พบพนักงาน');
    if (!$emp['active']) { throw new ApiError('พนักงานคนนี้ปิดใช้งานแล้ว', 409); }
    $amount = arr_get($b, 'amount');
    $in = array(
        'periodKey' => (string)arr_get($b, 'periodKey', ''),
        'date' => (string)arr_get($b, 'date', ''),
        'amount' => ($amount === null || $amount === '') ? null : $amount,
        'data' => welfare_record_data($p, arr_get($b, 'data', array())),
        'note' => welfare_str(arr_get($b, 'note', ''), 500),
    );
    db_begin();
    $status = welfare_status($emp, $p, repo_welfare_records($p['id'], $emp['id']), today_iso());
    $errors = validate_welfare_record($p, $status, $in);
    if (count($errors)) { throw new ApiError(reset($errors), 422, $errors); }
    $res = db_exec('INSERT INTO welfare_records (program_id, employee_id, period_key, record_date, amount, data, note, recorded_by_name,
             created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        array($p['id'], $emp['id'], $in['periodKey'], $in['date'], $in['amount'], count($in['data']) ? json_encode($in['data']) : null,
            $in['note'] !== '' ? $in['note'] : null, $u['name'], db_now(), $u['username'], $u['username']));
    $amountText = $in['amount'] !== null ? ' ' . $in['amount'] . ($p['unit'] !== '' ? ' ' . $p['unit'] : '') : '';
    audit_write('WELFARE', $res['id'], 'CREATE', 'ให้สวัสดิการ ' . $p['name'] . ' (' . welfare_period_label($in['periodKey']) . ')' . $amountText
        . ' แก่ ' . full_name($emp) . ' (' . $emp['empCode'] . ')', $emp['id'], $u);
    db_commit();
    return http_data(map_welfare_record(db_one('SELECT * FROM welfare_records WHERE id = ?', array($res['id']))), 201);
}

function api_welfare_record_cancel($req, $params)
{
    $u = auth_require($req);
    welfare_need_table();
    $r = find_or_404(db_one('SELECT w.*, e.company_code AS emp_company FROM welfare_records w JOIN employees e ON e.id = w.employee_id WHERE w.id = ?',
        array(param_id($params))), 'ไม่พบรายการ');
    if (!in_scope($r['emp_company'])) { throw new ApiError('ไม่พบรายการ', 404); }
    $rec = map_welfare_record($r);
    $p = repo_welfare_program($rec['programId']);
    $emp = repo_employee($rec['employeeId']);
    db_begin();
    db_exec('DELETE FROM welfare_records WHERE id = ?', array($rec['id']));
    audit_write('WELFARE', $rec['id'], 'CANCEL', 'ยกเลิกการให้สวัสดิการ ' . ($p ? $p['name'] : '#' . $rec['programId']) . ' ('
        . welfare_period_label($rec['periodKey']) . ') ของ ' . ($emp ? full_name($emp) . ' (' . $emp['empCode'] . ')' : '#' . $rec['employeeId']),
        $rec['employeeId'], $u);
    db_commit();
    return http_no_content();
}
