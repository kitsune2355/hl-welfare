<?php
/* ============================================================
 *  backend/api/rules_edit.php — แก้เงื่อนไขสวัสดิการผ่านหน้าจอ (rules.html) แบบมีวันที่มีผล
 *                              + ชุดฟอร์มของหน่วยงานที่ตั้งทับกฎ (sites.html)
 *
 *    GET    /rules/history                          กฎทุกข้อ: ฉบับที่ใช้อยู่ ฉบับที่รอมีผล ประวัติ + ค่าตั้งค่าทุกฉบับ
 *    POST   /rules/{kind}                           เพิ่มกฎ {…ค่าของกฎ, effectiveFrom}
 *    PUT    /rules/{kind}/{id}                      แก้กฎ = เพิ่มฉบับใหม่ที่มีผลตั้งแต่ effectiveFrom
 *    DELETE /rules/{kind}/{id}?effectiveFrom=       เลิกใช้กฎตั้งแต่วันที่ (เพิ่มฉบับ "ลบ")
 *    DELETE /rules/{kind}/revisions/{revisionId}    ยกเลิกการเปลี่ยนแปลงที่ยังไม่ถึงวันมีผล
 *    PUT    /rules/settings                         ค่าตั้งค่า {effectiveFrom, values: {key: value}}
 *    DELETE /rules/settings/{key}/{date}            ยกเลิกค่าตั้งค่าที่ยังไม่ถึงวันมีผล
 *    PUT    /sites/{id}/uniform                     ชุดฟอร์มของหน่วยงานที่ตั้งทับกฎ {overrides: [{ruleId, quantities}]} (มีผลทันที)
 *    {kind} = insurance | uniform · {id} = รหัสกฎ (คงที่ทุกฉบับ)
 *
 *  กฎที่ใช้ ณ วันที่ d = ฉบับล่าสุดที่ effectiveFrom <= d (domain/rule_versions.php)
 *  บันทึกฉบับใหม่วันเดียวกับฉบับเดิมของกฎเดียวกัน = แก้ฉบับนั้น (ไม่เพิ่มแถวซ้ำ)
 *  การแจ้ง/แจกที่ทำไปแล้วไม่เปลี่ยนตามกฎใหม่ · สิทธิ์ rules.edit (permissions.php) · บันทึกกิจกรรม entity RULE / SITE
 *  การตรวจข้อมูลตรงกับ web/assets/js/application/ruleRules.js (แก้ที่หนึ่งต้องแก้อีกที่)
 * ============================================================ */

function rules_edit_require($req)
{
    return function_exists('cap_require') ? cap_require($req, 'rules.edit')
        : auth_require_role($req, array('HR_ADMIN', 'SUPER_ADMIN'));
}

function rules_need_versions()
{
    if (!db_table_exists('site_uniform_overrides')) {
        throw new ApiError('ยังไม่ได้รัน migration backend/sql/007_uniform_quantities.sql', 409, null, 'MIGRATION_MISSING');
    }
}

function rules_kind($params)
{
    $k = isset($params['kind']) ? $params['kind'] : '';
    if ($k !== 'insurance' && $k !== 'uniform') { throw new ApiError('ไม่พบ endpoint', 404); }
    return $k;
}

function rules_table($kind) { return $kind === 'insurance' ? 'insurance_rules' : 'uniform_rules'; }
function rules_kind_label($kind) { return $kind === 'insurance' ? 'กฎประกันกลุ่ม' : 'กฎชุดฟอร์ม'; }

/** วันที่มีผล — ไม่ส่ง = วันนี้ */
function rules_effective_from($v)
{
    if ($v === null || $v === '') { return today_iso(); }
    $d = assert_iso_date($v, 'วันที่มีผลไม่ถูกต้อง');
    $p = explode('-', $d);
    if (!checkdate((int)$p[1], (int)$p[2], (int)$p[0])) { throw new ApiError('วันที่มีผลไม่ถูกต้อง', 422, array('effectiveFrom' => 'วันที่ไม่มีจริง')); }
    return $d;
}

function rules_codes_valid($list, $allowed)
{
    if (!is_array($list)) { return false; }
    foreach ($list as $c) {
        if (!in_array($c, $allowed, true)) { return false; }
    }
    return true;
}

function rules_company_codes()
{
    $out = array();
    foreach (repo_companies() as $c) { $out[] = $c['code']; }
    return $out;
}

function rules_item_codes()
{
    $out = array();
    foreach (db_all('SELECT code FROM uniform_items ORDER BY sort_order, code') as $r) { $out[] = $r['code']; }
    return $out;
}

function rules_is_int($v, $min, $max)
{
    return is_numeric($v) && (float)$v === floor((float)$v) && $v >= $min && $v <= $max;
}

/** จำนวนต่อรายการต่อรอบ — จำนวนเต็ม 0–20, รหัสรายการต้องมีจริง · คืน [quantities ที่จัดรูปแล้ว, ข้อผิดพลาด] */
function rules_clean_quantities($q, $itemCodes)
{
    if (!is_array($q)) { return array(null, 'กรุณาระบุจำนวนชุดฟอร์ม'); }
    $out = array();
    $total = 0;
    foreach (uniform_events() as $ev) {
        $m = isset($q[$ev]) && is_array($q[$ev]) ? $q[$ev] : array();
        $clean = array();
        foreach ($m as $code => $n) {
            if (!in_array((string)$code, $itemCodes, true)) { return array(null, 'ไม่รู้จักรายการชุดฟอร์ม ' . $code); }
            if (!rules_is_int($n, 0, 20)) { return array(null, 'จำนวนต้องเป็นจำนวนเต็ม 0–20'); }
            $clean[(string)$code] = (int)$n;
            $total += (int)$n;
        }
        $out[$ev] = $clean;
    }
    if ($total === 0) { return array(null, 'ต้องได้ชุดฟอร์มอย่างน้อย 1 ชิ้นในรอบใดรอบหนึ่ง'); }
    return array($out, null);
}

/** รายการของกฎ = ทุกรหัสที่ปรากฏในรอบใดรอบหนึ่ง เรียงตามลำดับที่พบ */
function rules_items_of($quantities)
{
    $items = array();
    foreach (uniform_events() as $ev) {
        foreach ($quantities[$ev] as $code => $n) {
            if (!in_array($code, $items, true)) { $items[] = $code; }
        }
    }
    return $items;
}

/* ============================================================
 *  ตรวจข้อมูลของกฎ → คอลัมน์ในตาราง
 * ============================================================ */
function rules_insurance_columns($b)
{
    $x = array();
    $type = (string)arr_get($b, 'employeeType', '');
    if (!in_array($type, employee_type_codes(), true)) { $x['employeeType'] = 'กรุณาเลือกประเภทพนักงาน'; }
    $companies = arr_get($b, 'companies');
    if ($companies !== null && !(rules_codes_valid($companies, rules_company_codes()) && count($companies) > 0)) {
        $x['companies'] = 'เลือกบริษัทอย่างน้อย 1 บริษัท หรือ "ทุกบริษัท"';
    }
    $wait = arr_get($b, 'waitDays');
    if (!rules_is_int($wait, 1, 365)) { $x['waitDays'] = 'อายุงานต้องเป็นจำนวนวัน 1–365'; }
    $exclude = arr_get($b, 'excludeContracts', array());
    if (!rules_codes_valid($exclude, array('REGULAR', 'SHORT_3PCT'))) { $x['excludeContracts'] = 'ประเภทสัญญาไม่ถูกต้อง'; }
    if (count($x)) { throw new ApiError('ข้อมูลกฎไม่ถูกต้อง', 422, $x); }
    return array(
        'employee_type' => $type,
        'companies' => $companies === null ? null : json_encode(array_values($companies)),
        'wait_days' => (int)$wait,
        'exclude_contracts' => json_encode(array_values($exclude)),
        'require_site_insurance' => (bool)arr_get($b, 'requireSiteInsurance', false) ? 1 : 0,
        'note' => str_trim((string)arr_get($b, 'note', '')),
    );
}

function rules_uniform_columns($b)
{
    $x = array();
    $type = (string)arr_get($b, 'employeeType', '');
    if (!in_array($type, employee_type_codes(), true)) { $x['employeeType'] = 'กรุณาเลือกประเภทพนักงาน'; }
    $companies = arr_get($b, 'companies', array());
    if (!(rules_codes_valid($companies, rules_company_codes()) && count($companies) > 0)) { $x['companies'] = 'เลือกบริษัทอย่างน้อย 1 บริษัท'; }
    $groups = arr_get($b, 'deptGroups');
    if ($groups !== null && !(is_array($groups) && count($groups) > 0)) { $x['deptGroups'] = 'เลือกกลุ่ม/ฝ่ายอย่างน้อย 1 กลุ่ม หรือ "ทุกกลุ่ม"'; }
    $position = arr_get($b, 'position');
    $position = ($position === null || str_trim((string)$position) === '') ? null : str_trim((string)$position);
    $lmin = arr_get($b, 'levelMin');
    $lmax = arr_get($b, 'levelMax');
    if ($lmin !== null && !rules_is_int($lmin, 1, 9)) { $x['levelMin'] = 'ระดับต้องเป็น 1–9'; }
    if ($lmax !== null && !rules_is_int($lmax, 1, 9)) { $x['levelMax'] = 'ระดับต้องเป็น 1–9'; }
    if ($lmin !== null && $lmax !== null && !isset($x['levelMin']) && !isset($x['levelMax']) && $lmin > $lmax) {
        $x['levelMax'] = 'ระดับสูงสุดต้องไม่น้อยกว่าระดับต่ำสุด';
    }
    $style = str_trim((string)arr_get($b, 'style', ''));
    if ($style === '') { $x['style'] = 'กรุณาระบุชื่อแบบชุดฟอร์ม'; }
    list($q, $qErr) = rules_clean_quantities(arr_get($b, 'quantities'), rules_item_codes());
    if ($qErr !== null) { $x['quantities'] = $qErr; }
    if (count($x)) { throw new ApiError('ข้อมูลกฎไม่ถูกต้อง', 422, $x); }
    $logo = arr_get($b, 'logo');
    return array(
        'employee_type' => $type,
        'companies' => json_encode(array_values($companies)),
        'dept_groups' => $groups === null ? null : json_encode(array_values($groups)),
        'position' => $position,
        'level_min' => $lmin === null ? null : (int)$lmin,
        'level_max' => $lmax === null ? null : (int)$lmax,
        'style' => $style,
        'logo' => ($logo === null || str_trim((string)$logo) === '') ? null : str_trim((string)$logo),
        'items' => json_encode(rules_items_of($q)),
        'polo_by_site' => (bool)arr_get($b, 'poloBySite', false) ? 1 : 0,
        'quantities' => json_encode($q),
        'qty_start' => sum_qty($q['START']),
        'qty_start_label' => null,
        'qty_probation' => sum_qty($q['PROBATION']),
        'qty_annual' => sum_qty($q['ANNUAL']),
        'note' => str_trim((string)arr_get($b, 'note', '')),
    );
}

function rules_columns($kind, $b)
{
    return $kind === 'insurance' ? rules_insurance_columns($b) : rules_uniform_columns($b);
}

/** คำอธิบายกฎสั้น ๆ ใช้ในบันทึกกิจกรรม */
function rules_describe($kind, $c)
{
    if ($kind === 'insurance') { return label_employee_type($c['employee_type']) . ' ' . $c['wait_days'] . ' วัน'; }
    return $c['style'] . ($c['position'] !== null ? ' · ' . $c['position'] : '');
}

/**
 * เขียนฉบับของกฎ: มีฉบับของรหัสกฎนี้วันเดียวกันอยู่แล้ว = แก้ฉบับนั้น · ไม่มี = เพิ่มแถวใหม่
 * $key = null → กฎใหม่ (rule_key = id ของแถวที่เพิ่ง insert)  · คืน revisionId
 */
function rules_write_revision($kind, $key, $effectiveFrom, $cols, $deleted, $u)
{
    $table = rules_table($kind);
    $same = $key === null ? null
        : db_value('SELECT id FROM ' . $table . ' WHERE rule_key = ? AND effective_from = ? ORDER BY id DESC LIMIT 1', array($key, $effectiveFrom));
    $cols['effective_from'] = $effectiveFrom;
    $cols['is_deleted'] = $deleted ? 1 : 0;
    if ($same) {
        $sets = array();
        $vals = array();
        foreach ($cols as $c => $v) { $sets[] = '`' . $c . '` = ?'; $vals[] = $v; }
        $vals[] = $u['username'];
        $vals[] = (int)$same;
        db_exec('UPDATE ' . $table . ' SET ' . implode(', ', $sets) . ', updated_by = ? WHERE id = ?', $vals);
        return (int)$same;
    }
    $cols['rule_key'] = $key === null ? 0 : $key;
    $cols['created_at'] = db_now();
    $cols['created_by'] = $u['username'];
    $cols['updated_by'] = $u['username'];
    $names = array();
    $marks = array();
    foreach (array_keys($cols) as $c) { $names[] = '`' . $c . '`'; $marks[] = '?'; }
    $res = db_exec('INSERT INTO ' . $table . ' (' . implode(', ', $names) . ') VALUES (' . implode(', ', $marks) . ')', array_values($cols));
    if ($key === null) { db_exec('UPDATE ' . $table . ' SET rule_key = id WHERE id = ?', array($res['id'])); }
    return (int)$res['id'];
}

/** ฉบับล่าสุดของรหัสกฎนี้ (ทุกวันที่) — ใช้ตรวจว่ามีกฎนี้ และคัดลอกค่าตอนเลิกใช้ */
function rules_latest_row($kind, $key)
{
    return db_one('SELECT * FROM ' . rules_table($kind) . ' WHERE rule_key = ? ORDER BY effective_from DESC, id DESC LIMIT 1', array($key));
}

function rules_history_payload()
{
    $rev = repo_rule_revisions();
    $today = today_iso();
    $rules = repo_rules();
    return array(
        'today' => $today,
        'insurance' => rule_timeline($rev['insurance'], $today),
        'uniform' => rule_timeline($rev['uniform'], $today),
        'settings' => $rev['settings'],
        'uniformItems' => $rules['uniformItems'],
    );
}

/**
 * คำตอบหลังแก้กฎ — กฎชุดฟอร์มเปลี่ยน = ชุดฟอร์มรอบเริ่มงานที่สต็อกแสดงเปลี่ยนตาม จึงส่งข้อมูลหลักไปสต็อกด้วย
 * ส่งไม่สำเร็จไม่ทำให้การบันทึกล้ม: แนบ stockWarning ให้หน้าจอแสดง
 * (ฉบับที่ตั้งล่วงหน้ายังไม่มีผลวันนี้ — สต็อกเห็นเมื่อถึงวันแล้วมีการส่งครั้งถัดไป)
 */
function rules_saved_payload($kind, $u)
{
    $out = rules_history_payload();
    if ($kind === 'uniform') {
        $w = master_sync_after_change($u);
        if ($w !== null) { $out['stockWarning'] = $w; }
    }
    return $out;
}

/* ============================================================
 *  handlers
 * ============================================================ */
function api_rules_history($req, $params)
{
    auth_require($req);
    rules_need_versions();
    return rules_history_payload();
}

function api_rule_create($req, $params)
{
    $u = rules_edit_require($req);
    rules_need_versions();
    $kind = rules_kind($params);
    $b = req_json($req);
    $cols = rules_columns($kind, $b);
    $from = rules_effective_from(arr_get($b, 'effectiveFrom'));
    db_begin();
    $rev = rules_write_revision($kind, null, $from, $cols, false, $u);
    $key = (int)db_value('SELECT rule_key FROM ' . rules_table($kind) . ' WHERE id = ?', array($rev));
    audit_write('RULE', strtoupper(substr($kind, 0, 3)) . '-' . $key, 'CREATE',
        'เพิ่ม' . rules_kind_label($kind) . ' #' . $key . ' ' . rules_describe($kind, $cols) . ' มีผล ' . $from, null, $u);
    db_commit();
    return http_data(rules_saved_payload($kind, $u), 201);
}

function api_rule_update($req, $params)
{
    $u = rules_edit_require($req);
    rules_need_versions();
    $kind = rules_kind($params);
    $key = param_id($params);
    if (!rules_latest_row($kind, $key)) { throw new ApiError('ไม่พบกฎ', 404); }
    $b = req_json($req);
    $cols = rules_columns($kind, $b);
    $from = rules_effective_from(arr_get($b, 'effectiveFrom'));
    db_begin();
    rules_write_revision($kind, $key, $from, $cols, false, $u);
    audit_write('RULE', strtoupper(substr($kind, 0, 3)) . '-' . $key, 'UPDATE',
        'แก้' . rules_kind_label($kind) . ' #' . $key . ' ' . rules_describe($kind, $cols) . ' มีผล ' . $from, null, $u);
    db_commit();
    return rules_saved_payload($kind, $u);
}

function api_rule_delete($req, $params)
{
    $u = rules_edit_require($req);
    rules_need_versions();
    $kind = rules_kind($params);
    $key = param_id($params);
    $row = rules_latest_row($kind, $key);
    if (!$row) { throw new ApiError('ไม่พบกฎ', 404); }
    $from = rules_effective_from(req_query($req, 'effectiveFrom'));
    // ฉบับ "ลบ" คัดลอกค่าเดิมไว้ ประวัติจะได้อ่านรู้เรื่องว่ากฎที่เลิกใช้คืออะไร
    $cols = $row;
    foreach (array('id', 'rule_key', 'effective_from', 'is_deleted', 'created_at', 'created_by', 'updated_at', 'updated_by') as $c) { unset($cols[$c]); }
    db_begin();
    rules_write_revision($kind, $key, $from, $cols, true, $u);
    audit_write('RULE', strtoupper(substr($kind, 0, 3)) . '-' . $key, 'DELETE',
        'เลิกใช้' . rules_kind_label($kind) . ' #' . $key . ' ตั้งแต่ ' . $from, null, $u);
    db_commit();
    return rules_saved_payload($kind, $u);
}

function api_rule_revision_cancel($req, $params)
{
    $u = rules_edit_require($req);
    rules_need_versions();
    $kind = rules_kind($params);
    $rid = param_id($params, 'revisionId');
    $row = db_one('SELECT * FROM ' . rules_table($kind) . ' WHERE id = ?', array($rid));
    if (!$row) { throw new ApiError('ไม่พบการเปลี่ยนแปลงนี้', 404); }
    if (strcmp($row['effective_from'], today_iso()) <= 0) {
        throw new ApiError('ฉบับนี้มีผลแล้ว ยกเลิกไม่ได้ — แก้กฎเป็นฉบับใหม่แทน', 409);
    }
    db_begin();
    db_exec('DELETE FROM ' . rules_table($kind) . ' WHERE id = ?', array($rid));
    audit_write('RULE', strtoupper(substr($kind, 0, 3)) . '-' . $row['rule_key'], 'CANCEL',
        'ยกเลิกการเปลี่ยน' . rules_kind_label($kind) . ' #' . $row['rule_key'] . ' ที่จะมีผล ' . $row['effective_from'], null, $u);
    db_commit();
    return rules_saved_payload($kind, $u);
}

/* ============================================================
 *  ค่าตั้งค่า
 * ============================================================ */
function rules_settings_spec()
{
    // key => [ต่ำสุด, สูงสุด, ชื่อ] — ตรงกับ SETTING_SPEC ใน application/ruleRules.js
    return array(
        'insuranceMaxAge' => array(50, 80, 'อายุสูงสุดประกันกลุ่ม'),
        'insuranceCycleDay' => array(1, 28, 'วันที่รอบแจ้งประกัน'),
        'insuranceCycleDayDaily' => array(1, 28, 'วันที่รอบแจ้งประกันพนักงานรายวัน'),
        'absentExtraDays' => array(0, 60, 'วันบวกเพิ่มกรณีขาดงาน 3 วัน'),
        'uniformAnnualMonth' => array(1, 12, 'เดือนแจกชุดประจำปี'),
    );
}

function api_rule_settings_save($req, $params)
{
    $u = rules_edit_require($req);
    rules_need_versions();
    $b = req_json($req);
    $from = rules_effective_from(arr_get($b, 'effectiveFrom'));
    $values = arr_get($b, 'values', array());
    if (!is_array($values) || !count($values)) { throw new ApiError('ไม่มีค่าที่จะบันทึก', 422); }
    $spec = rules_settings_spec();
    $x = array();
    foreach ($values as $k => $v) {
        if (!isset($spec[$k])) { $x[$k] = 'ไม่รู้จักค่าตั้งค่านี้'; continue; }
        if (!rules_is_int($v, $spec[$k][0], $spec[$k][1])) { $x[$k] = $spec[$k][2] . 'ต้องเป็นตัวเลข ' . $spec[$k][0] . '–' . $spec[$k][1]; }
    }
    if (count($x)) { throw new ApiError('ค่าตั้งค่าไม่ถูกต้อง', 422, $x); }
    $rules = repo_rules();
    $changes = array();
    db_begin();
    foreach ($values as $k => $v) {
        $v = (int)$v;
        // ค่าเท่าเดิมและมีผลวันนี้หรือก่อน = ไม่ต้องเพิ่มฉบับ
        if (strcmp($from, today_iso()) <= 0 && isset($rules['settings'][$k]) && (int)$rules['settings'][$k] === $v) { continue; }
        if (db_value('SELECT `key` FROM settings WHERE `key` = ? AND effective_from = ?', array($k, $from))) {
            db_exec('UPDATE settings SET value = ?, updated_by = ? WHERE `key` = ? AND effective_from = ?', array((string)$v, $u['username'], $k, $from));
        } else {
            db_exec('INSERT INTO settings (`key`, value, effective_from, created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
                array($k, (string)$v, $from, db_now(), $u['username'], $u['username']));
        }
        $changes[] = $spec[$k][2] . ' → ' . $v;
    }
    if (count($changes)) { audit_write('RULE', 'SETTINGS', 'UPDATE', 'แก้ค่าตั้งค่า (มีผล ' . $from . '): ' . implode(', ', $changes), null, $u); }
    db_commit();
    return rules_history_payload();
}

function api_rule_setting_cancel($req, $params)
{
    $u = rules_edit_require($req);
    rules_need_versions();
    $key = (string)$params['key'];
    $date = assert_iso_date($params['date']);
    if (strcmp($date, today_iso()) <= 0) { throw new ApiError('ค่านี้มีผลแล้ว ยกเลิกไม่ได้ — ตั้งค่าใหม่แทน', 409); }
    $n = db_exec('DELETE FROM settings WHERE `key` = ? AND effective_from = ?', array($key, $date));
    if (!$n['affected']) { throw new ApiError('ไม่พบการเปลี่ยนแปลงนี้', 404); }
    audit_write('RULE', 'SETTINGS', 'CANCEL', 'ยกเลิกการเปลี่ยนค่าตั้งค่า ' . $key . ' ที่จะมีผล ' . $date, null, $u);
    return rules_history_payload();
}

/* ============================================================
 *  ชุดฟอร์มของหน่วยงาน (ตั้งทับกฎ — มีผลทันที)
 * ============================================================ */
function api_site_uniform_save($req, $params)
{
    $u = rules_edit_require($req);
    rules_need_versions();
    $id = param_id($params);
    $site = find_or_404(repo_site($id), 'ไม่พบหน่วยงาน');
    $list = arr_get(req_json($req), 'overrides', array());
    if (!is_array($list)) { throw new ApiError('ข้อมูลไม่ถูกต้อง', 422); }
    $rules = repo_rules();
    $items = rules_item_codes();
    $clean = array();
    $x = array();
    foreach ($list as $i => $o) {
        $rule = find_by($rules['uniform'], 'id', (int)arr_get($o, 'ruleId', 0));
        if (!$rule) { $x['overrides.' . $i] = 'ไม่พบกฎชุดฟอร์ม'; continue; }
        if (!in_array($site['companyCode'], $rule['companies'], true)) {
            $x['overrides.' . $i] = 'กฎ #' . $rule['id'] . ' ไม่ใช่ของบริษัท ' . $site['companyCode']; continue;
        }
        if (isset($clean[$rule['id']])) { $x['overrides.' . $i] = 'ตั้งกฎ #' . $rule['id'] . ' ซ้ำ'; continue; }
        list($q, $err) = rules_clean_quantities(arr_get($o, 'quantities'), $items);
        if ($err !== null) { $x['overrides.' . $i] = $err; continue; }
        $clean[$rule['id']] = $q;
    }
    if (count($x)) { throw new ApiError('ข้อมูลชุดฟอร์มของหน่วยงานไม่ถูกต้อง', 422, $x); }
    db_begin();
    db_exec('DELETE FROM site_uniform_overrides WHERE site_id = ?', array($id));
    foreach ($clean as $ruleId => $q) {
        db_exec('INSERT INTO site_uniform_overrides (site_id, rule_id, quantities, created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
            array($id, $ruleId, json_encode($q), db_now(), $u['username'], $u['username']));
    }
    audit_write('SITE', $id, 'UPDATE', 'ตั้งชุดฟอร์มของหน่วยงาน “' . $site['name'] . '”: '
        . (count($clean) ? count($clean) . ' กฎ (#' . implode(', #', array_keys($clean)) . ')' : 'ใช้ตามกฎกลางทั้งหมด'), null, $u);
    db_commit();
    return site_with_sync(repo_site($id), master_sync_after_change($u, array($id)));
}
