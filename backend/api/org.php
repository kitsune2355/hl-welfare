<?php
/* ============================================================
 *  backend/api/org.php — ตั้งค่าองค์กร (sites.html แท็บ บริษัท / ประเภทพนักงาน) · sql/015
 *
 *  บริษัท: เพิ่ม / แก้ชื่อ ชื่อตามทะเบียน สี ลำดับ / ลบ — รหัสเปลี่ยนไม่ได้ (พนักงาน หน่วยงาน สิทธิ์ผู้ใช้ อ้างถึง)
 *  ประเภทพนักงาน: เพิ่ม / แก้ชื่อ คำอธิบาย บริษัทที่ใช้ได้ พฤติกรรม สีป้าย / ลบ — รหัสเปลี่ยนไม่ได้
 *  ลบได้เมื่อไม่มีใครใช้: บริษัท = หน่วยงาน พนักงาน ผู้ใช้ กฎที่ใช้อยู่/รอมีผล บริษัทประกันที่ผูก
 *                       ประเภท = พนักงาน กฎที่ใช้อยู่/รอมีผล
 *  อ่าน = ผู้ใช้ที่ login · แก้ = สิทธิ์ org.edit (permissions.php)
 *  การตรวจข้อมูลตรงกับ web/assets/js/application/orgRules.js (แก้ที่หนึ่งต้องแก้อีกที่)
 * ============================================================ */

function org_edit_require($req)
{
    return cap_require($req, 'org.edit');
}

function org_need_types_table()
{
    if (!db_table_exists('employee_types')) {
        throw new ApiError('ยังไม่ได้รัน migration backend/sql/015_org_settings.sql', 409, null, 'MIGRATION_MISSING');
    }
}

function org_tones() { return array('primary', 'info', 'success', 'warning', 'danger', 'neutral'); }

/** ค่า => จำนวนกฎ (ประกัน + ชุดฟอร์ม) ที่ใช้อยู่ / รอมีผล · $pick(rule) คืนรายการค่าที่กฎอ้าง */
function org_rule_usage($pickKey)
{
    $out = array();
    $rev = repo_rule_revisions();
    foreach (array('insurance', 'uniform') as $kind) {
        foreach (rule_timeline($rev[$kind], today_iso()) as $t) {
            $live = $t['pending'];
            if ($t['current']) { $live[] = $t['current']; }
            $ids = array();
            foreach ($live as $r) {
                if ($r['deleted']) { continue; }
                $vals = $pickKey === 'companies' ? (is_array($r['companies']) ? $r['companies'] : array()) : array($r['employeeType']);
                foreach ($vals as $v) { $ids[$v] = true; }
            }
            foreach (array_keys($ids) as $v) { $out[$v] = isset($out[$v]) ? $out[$v] + 1 : 1; }
        }
    }
    return $out;
}

/**
 * ขอเปิด/ปิดการใช้งานในคำขอบันทึกนี้ไหม — คืนค่าใหม่ (true/false) หรือ null = ไม่เปลี่ยน
 * ปิดตัวสุดท้ายที่เปิดอยู่ไม่ได้ · ของใหม่เปิดเสมอ (ไม่สนค่าที่ส่งมา)
 */
function org_active_change($b, $old, $all, $keyField, $key, $lastMsg)
{
    if (!$old || !array_key_exists('active', $b) || (bool)$b['active'] === $old['active']) { return null; }
    $next = (bool)$b['active'];
    if (!$next) {
        $left = 0;
        foreach ($all as $x) { if ($x['active'] && $x[$keyField] !== $key) { $left++; } }
        if ($left === 0) { throw new ApiError($lastMsg, 409); }
    }
    return $next;
}

function org_count_by($sql)
{
    $out = array();
    foreach (db_all($sql) as $r) { $out[$r['k']] = (int)$r['n']; }
    return $out;
}

/* ============================================================
 *  บริษัท
 * ============================================================ */
function validate_company($b, $all, $creating)
{
    $x = array();
    $code = strtoupper(str_trim(arr_get($b, 'code', '')));
    if ($creating) {
        if (!preg_match('/^[A-Z][A-Z0-9]{1,9}$/', $code)) { $x['code'] = 'รหัส 2–10 ตัว: ตัวอักษรอังกฤษพิมพ์ใหญ่ / ตัวเลข ขึ้นต้นด้วยตัวอักษร'; }
        else { foreach ($all as $c) { if ($c['code'] === $code) { $x['code'] = 'มีบริษัทรหัสนี้แล้ว'; } } }
    }
    $name = str_trim(arr_get($b, 'name', ''));
    if ($name === '') { $x['name'] = 'กรุณากรอกชื่อบริษัท'; }
    elseif (mb_strlen($name, 'UTF-8') > 150) { $x['name'] = 'ชื่อยาวเกิน 150 ตัวอักษร'; }
    if (mb_strlen(str_trim(arr_get($b, 'legalName', '')), 'UTF-8') > 200) { $x['legalName'] = 'ชื่อตามทะเบียนยาวเกิน 200 ตัวอักษร'; }
    $color = (string)arr_get($b, 'color', '');
    if ($color !== '' && !preg_match('/^#[0-9a-fA-F]{6}$/', $color)) { $x['color'] = 'สีต้องเป็นรูปแบบ #rrggbb'; }
    return $x;
}

/** บริษัททั้งหมด + จำนวนที่ใช้ (หน้าตั้งค่า) */
function repo_companies_usage()
{
    $sites = org_count_by('SELECT company_code AS k, COUNT(*) AS n FROM sites GROUP BY company_code');
    $emps = org_count_by('SELECT company_code AS k, COUNT(*) AS n FROM employees GROUP BY company_code');
    $users = org_count_by('SELECT company_code AS k, COUNT(*) AS n FROM users WHERE company_code IS NOT NULL GROUP BY company_code');
    $rules = org_rule_usage('companies');
    $insurers = array();
    foreach (repo_insurers() as $f) {
        foreach ((array)arr_get($f, 'companies', array()) as $c) {
            $k = $c['companyCode'];
            $insurers[$k] = isset($insurers[$k]) ? $insurers[$k] + 1 : 1;
        }
    }
    $out = array();
    foreach (repo_companies() as $c) {
        $k = $c['code'];
        $c['siteCount'] = isset($sites[$k]) ? $sites[$k] : 0;
        $c['employeeCount'] = isset($emps[$k]) ? $emps[$k] : 0;
        $c['userCount'] = isset($users[$k]) ? $users[$k] : 0;
        $c['ruleCount'] = isset($rules[$k]) ? $rules[$k] : 0;
        $c['insurerCount'] = isset($insurers[$k]) ? $insurers[$k] : 0;
        $out[] = $c;
    }
    return $out;
}

function org_find_company($code)
{
    foreach (repo_companies_usage() as $c) { if ($c['code'] === $code) { return $c; } }
    return null;
}

function api_companies_usage($req, $params)
{
    auth_require($req);
    return repo_companies_usage();
}

function api_company_save($req, $params)
{
    $u = org_edit_require($req);
    $creating = !isset($params['code']);
    $b = req_json($req);
    $old = $creating ? null : find_or_404(org_find_company(strtoupper((string)$params['code'])), 'ไม่พบบริษัท');
    $errors = validate_company($b, repo_companies(), $creating);
    if (count($errors)) { throw new ApiError(reset($errors), 422, $errors); }
    $code = $creating ? strtoupper(str_trim($b['code'])) : $old['code'];
    $name = str_trim($b['name']);
    $legal = str_trim(arr_get($b, 'legalName', ''));
    $color = strtolower((string)arr_get($b, 'color', ''));
    $toggle = org_active_change($b, $old, repo_companies(), 'code', $code, 'ต้องเปิดใช้งานอย่างน้อย 1 บริษัท');
    db_begin();
    if ($creating) {
        $max = (int)db_value('SELECT COALESCE(MAX(sort_order), 0) FROM companies');
        db_exec('INSERT INTO companies (code, name, legal_name, color, sort_order, created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            array($code, $name, $legal, $color, $max + 1, db_now(), $u['username'], $u['username']));
        audit_write('COMPANY', $code, 'CREATE', 'เพิ่มบริษัท ' . $code . ' — ' . $name, null, $u);
    } else {
        db_exec('UPDATE companies SET name = ?, legal_name = ?, color = ?, updated_by = ? WHERE code = ?',
            array($name, $legal, $color, $u['username'], $code));
        audit_write('COMPANY', $code, 'UPDATE', 'แก้ไขบริษัท ' . $code . ' — ' . $name, null, $u);
    }
    if ($toggle !== null) {
        set_active('companies', 'code', $code, $toggle, $u);
        audit_write('COMPANY', $code, 'UPDATE', ($toggle ? 'เปิดใช้งาน' : 'ปิดใช้งาน') . 'บริษัท ' . $code . ' — ' . $name, null, $u);
    }
    db_commit();
    if ($toggle !== null) { master_sync_after_change($u, array()); }   // บริษัทในสต็อกเปิด/ปิดตาม
    org_cache_reset();
    $c = org_find_company($code);
    return $creating ? http_data($c, 201) : $c;
}

/** เลื่อนลำดับบริษัท: body { order: ["HL","PRO",…] } */
function api_company_order($req, $params)
{
    $u = org_edit_require($req);
    $order = (array)arr_get(req_json($req), 'order', array());
    $codes = company_codes();
    $sorted = $order;
    sort($sorted);
    $known = $codes;
    sort($known);
    if ($sorted !== $known) { throw new ApiError('ลำดับต้องมีบริษัทครบทุกบริษัท', 422); }
    db_begin();
    foreach ($order as $i => $code) {
        db_exec('UPDATE companies SET sort_order = ?, updated_by = ? WHERE code = ?', array($i + 1, $u['username'], $code));
    }
    audit_write('COMPANY', '-', 'UPDATE', 'จัดลำดับบริษัท: ' . implode(', ', $order), null, $u);
    db_commit();
    org_cache_reset();
    return repo_companies_usage();
}

/* ============================================================
 *  ประเภทพนักงาน
 * ============================================================ */
function validate_employee_type($b, $all, $creating)
{
    $x = array();
    $code = strtoupper(str_trim(arr_get($b, 'code', '')));
    if ($creating) {
        if (!preg_match('/^[A-Z][A-Z0-9_]{1,19}$/', $code)) { $x['code'] = 'รหัส 2–20 ตัว: ตัวอักษรอังกฤษพิมพ์ใหญ่ / ตัวเลข / _ ขึ้นต้นด้วยตัวอักษร'; }
        else { foreach ($all as $t) { if ($t['code'] === $code) { $x['code'] = 'มีประเภทรหัสนี้แล้ว'; } } }
    }
    $name = str_trim(arr_get($b, 'name', ''));
    if ($name === '') { $x['name'] = 'กรุณากรอกชื่อประเภท'; }
    elseif (mb_strlen($name, 'UTF-8') > 100) { $x['name'] = 'ชื่อยาวเกิน 100 ตัวอักษร'; }
    else {
        foreach ($all as $t) {
            if ($t['code'] !== $code && mb_strtolower($t['name'], 'UTF-8') === mb_strtolower($name, 'UTF-8')) { $x['name'] = 'มีประเภทชื่อนี้แล้ว'; }
        }
    }
    if (mb_strlen(str_trim(arr_get($b, 'description', '')), 'UTF-8') > 255) { $x['description'] = 'คำอธิบายยาวเกิน 255 ตัวอักษร'; }
    $cos = arr_get($b, 'companies');
    if ($cos !== null) {
        $ok = is_array($cos) && count($cos) > 0;
        if ($ok) { foreach ($cos as $c) { if (!in_array($c, company_codes(), true)) { $ok = false; } } }
        if (!$ok) { $x['companies'] = 'เลือกบริษัทอย่างน้อย 1 บริษัท หรือ "ทุกบริษัท"'; }
    }
    if (!in_array(arr_get($b, 'tone'), org_tones(), true)) { $x['tone'] = 'เลือกสีป้าย'; }
    return $x;
}

function repo_employee_types_usage()
{
    $emps = org_count_by('SELECT employee_type AS k, COUNT(*) AS n FROM employees GROUP BY employee_type');
    $rules = org_rule_usage('employeeType');
    $out = array();
    foreach (repo_employee_types() as $t) {
        $t['employeeCount'] = isset($emps[$t['code']]) ? $emps[$t['code']] : 0;
        $t['ruleCount'] = isset($rules[$t['code']]) ? $rules[$t['code']] : 0;
        $out[] = $t;
    }
    return $out;
}

function org_find_type($code)
{
    foreach (repo_employee_types_usage() as $t) { if ($t['code'] === $code) { return $t; } }
    return null;
}

/** ?usage=1 = พร้อมจำนวนพนักงาน / กฎที่ใช้ (หน้าตั้งค่า) · ไม่ใส่ = รายการเบา ๆ ที่ทุกหน้าโหลด (app/catalog.js) */
function api_employee_types($req, $params)
{
    auth_require($req);
    org_need_types_table();
    return req_query($req, 'usage') === '1' ? repo_employee_types_usage() : repo_employee_types();
}

function api_employee_type_save($req, $params)
{
    $u = org_edit_require($req);
    org_need_types_table();
    $creating = !isset($params['code']);
    $b = req_json($req);
    $old = $creating ? null : find_or_404(org_find_type(strtoupper((string)$params['code'])), 'ไม่พบประเภทพนักงาน');
    if (!$creating) { $b['code'] = $old['code']; }
    $errors = validate_employee_type($b, repo_employee_types(), $creating);
    if (count($errors)) { throw new ApiError(reset($errors), 422, $errors); }
    $code = strtoupper(str_trim($b['code']));
    $cos = arr_get($b, 'companies');
    $vals = array(str_trim($b['name']), str_trim(arr_get($b, 'description', '')), $cos === null ? null : json_encode(array_values($cos)),
        arr_get($b, 'usesDeptGroup') ? 1 : 0, arr_get($b, 'usesPosition') ? 1 : 0, arr_get($b, 'dailyCycle') ? 1 : 0, $b['tone']);
    $toggle = org_active_change($b, $old, repo_employee_types(), 'code', $code, 'ต้องเปิดใช้งานอย่างน้อย 1 ประเภท');
    db_begin();
    if ($creating) {
        $max = (int)db_value('SELECT COALESCE(MAX(sort_order), 0) FROM employee_types');
        db_exec('INSERT INTO employee_types (name, description, companies, uses_dept_group, uses_position, daily_cycle, tone, code, sort_order, created_at, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            array_merge($vals, array($code, $max + 10, db_now(), $u['username'], $u['username'])));
        audit_write('EMPLOYEE_TYPE', $code, 'CREATE', 'เพิ่มประเภทพนักงาน ' . $vals[0] . ' (' . $code . ')', null, $u);
    } else {
        db_exec('UPDATE employee_types SET name = ?, description = ?, companies = ?, uses_dept_group = ?, uses_position = ?, daily_cycle = ?, tone = ?, updated_by = ? WHERE code = ?',
            array_merge($vals, array($u['username'], $code)));
        audit_write('EMPLOYEE_TYPE', $code, 'UPDATE', 'แก้ไขประเภทพนักงาน ' . $vals[0] . ' (' . $code . ')', null, $u);
    }
    if ($toggle !== null) {
        set_active('employee_types', 'code', $code, $toggle, $u);
        audit_write('EMPLOYEE_TYPE', $code, 'UPDATE', ($toggle ? 'เปิดใช้งาน' : 'ปิดใช้งาน') . 'ประเภทพนักงาน ' . $vals[0] . ' (' . $code . ')', null, $u);
    }
    db_commit();
    org_cache_reset();
    $t = org_find_type($code);
    return $creating ? http_data($t, 201) : $t;
}

