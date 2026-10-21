<?php
/* ============================================================
 *  backend/api/dept_groups.php — กลุ่ม / ฝ่ายของพนักงานส่วนกลาง (sql/014)
 *
 *  ใช้ที่: พนักงานส่วนกลาง (employees.dept_group) และกฎชุดฟอร์มส่วนกลาง (uniform_rules.dept_groups)
 *  ทั้งสองที่เก็บเป็น "ชื่อ" ไม่ใช่ id — จึง:
 *    - เปลี่ยนชื่อ = แก้ชื่อในพนักงาน + กฎชุดฟอร์มทุกฉบับ (รวมประวัติ) ให้ในคำสั่งเดียว
 *    - ลบ = ได้เฉพาะกลุ่มที่ไม่มีพนักงาน และไม่มีกฎที่ใช้อยู่ / รอมีผล (ประวัติเก่าเก็บชื่อไว้ในตัว)
 *  อ่าน = ผู้ใช้ที่ login · แก้ = สิทธิ์ rules.edit (ชุดเดียวกับแก้เงื่อนไขสวัสดิการ)
 *  การตรวจข้อมูลตรงกับ web/assets/js/application/deptGroupRules.js (แก้ที่หนึ่งต้องแก้อีกที่)
 * ============================================================ */

define('DEPT_GROUP_NAME_MAX', 100);

function dept_groups_need_table()
{
    if (!db_table_exists('dept_groups')) {
        throw new ApiError('ยังไม่ได้รัน migration backend/sql/014_dept_groups.sql', 409, null, 'MIGRATION_MISSING');
    }
}

/** ตรวจชื่อกลุ่ม — $all = รายการทั้งหมด (ตรวจซ้ำ ไม่สนตัวพิมพ์ / ช่องว่างหัวท้าย) · $id = กลุ่มที่แก้ (0 = เพิ่มใหม่) */
function validate_dept_group($name, $all, $id)
{
    $x = array();
    $n = str_trim($name);
    if ($n === '') { $x['name'] = 'กรุณากรอกชื่อกลุ่ม / ฝ่าย'; }
    elseif (mb_strlen($n, 'UTF-8') > DEPT_GROUP_NAME_MAX) { $x['name'] = 'ชื่อยาวเกิน ' . DEPT_GROUP_NAME_MAX . ' ตัวอักษร'; }
    elseif (strpos($n, ',') !== false) { $x['name'] = 'ชื่อห้ามมีเครื่องหมาย “,”'; }
    else {
        foreach ($all as $g) {
            if ($g['id'] !== $id && mb_strtolower($g['name'], 'UTF-8') === mb_strtolower($n, 'UTF-8')) {
                $x['name'] = 'มีกลุ่ม / ฝ่ายชื่อนี้แล้ว';
                break;
            }
        }
    }
    return $x;
}

/** ชื่อกลุ่ม → รหัสกฎชุดฟอร์มที่ใช้อยู่ / รอมีผล ที่อ้างถึง */
function dept_group_rule_usage()
{
    $use = array();
    $rev = repo_rule_revisions();
    foreach (rule_timeline($rev['uniform'], today_iso()) as $t) {
        $live = $t['pending'];
        if ($t['current']) { $live[] = $t['current']; }
        foreach ($live as $r) {
            if ($r['deleted'] || !is_array($r['deptGroups'])) { continue; }
            foreach ($r['deptGroups'] as $name) { $use[$name][$t['id']] = true; }
        }
    }
    return $use;
}

/** รายการกลุ่ม + จำนวนพนักงาน / กฎที่ใช้ */
function repo_dept_groups()
{
    $emp = array();
    foreach (db_all('SELECT dept_group, COUNT(*) AS n FROM employees WHERE dept_group IS NOT NULL GROUP BY dept_group') as $r) {
        $emp[$r['dept_group']] = (int)$r['n'];
    }
    $rules = dept_group_rule_usage();
    $out = array();
    foreach (db_all('SELECT * FROM dept_groups ORDER BY sort_order, id') as $r) {
        $out[] = array(
            'id' => (int)$r['id'],
            'name' => $r['name'],
            'sortOrder' => (int)$r['sort_order'],
            'employeeCount' => isset($emp[$r['name']]) ? $emp[$r['name']] : 0,
            'ruleCount' => isset($rules[$r['name']]) ? count($rules[$r['name']]) : 0,
        );
    }
    return $out;
}

function repo_dept_group($id)
{
    foreach (repo_dept_groups() as $g) { if ($g['id'] === $id) { return $g; } }
    return null;
}

/** เปลี่ยนชื่อในกฎชุดฟอร์มทุกฉบับ (JSON ของชื่อ — PHP 5.2 เก็บอักษรไทยเป็น \uXXXX จึงต้องอ่านทีละแถว) */
function dept_group_rename_in_rules($old, $new, $u)
{
    $n = 0;
    foreach (db_all('SELECT id, dept_groups FROM uniform_rules WHERE dept_groups IS NOT NULL') as $r) {
        $groups = json_in($r['dept_groups'], null);
        if (!is_array($groups) || !in_array($old, $groups, true)) { continue; }
        $next = array();
        foreach ($groups as $g) {
            $g = ($g === $old) ? $new : $g;
            if (!in_array($g, $next, true)) { $next[] = $g; }
        }
        db_exec('UPDATE uniform_rules SET dept_groups = ?, updated_by = ? WHERE id = ?',
            array(json_encode($next), $u['username'], (int)$r['id']));
        $n++;
    }
    return $n;
}

function api_dept_groups($req, $params)
{
    auth_require($req);
    dept_groups_need_table();
    return repo_dept_groups();
}

function api_dept_group_save($req, $params)
{
    $u = rules_edit_require($req);
    dept_groups_need_table();
    $id = isset($params['id']) ? param_id($params) : 0;
    $b = req_json($req);
    $all = repo_dept_groups();
    $old = $id ? find_or_404(repo_dept_group($id), 'ไม่พบกลุ่ม / ฝ่าย') : null;
    $errors = validate_dept_group(arr_get($b, 'name', ''), $all, $id);
    if (count($errors)) { throw new ApiError(reset($errors), 422, $errors); }
    $name = str_trim($b['name']);
    $now = db_now();

    db_begin();
    if (!$old) {
        $max = (int)db_value('SELECT COALESCE(MAX(sort_order), 0) FROM dept_groups');
        $res = db_exec('INSERT INTO dept_groups (name, sort_order, created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?)',
            array($name, $max + 10, $now, $u['username'], $u['username']));
        $id = $res['id'];
        audit_write('DEPT_GROUP', $id, 'CREATE', 'เพิ่มกลุ่ม / ฝ่าย ' . $name, null, $u);
    } elseif ($old['name'] !== $name) {
        db_exec('UPDATE dept_groups SET name = ?, updated_by = ? WHERE id = ?', array($name, $u['username'], $id));
        $emp = db_exec('UPDATE employees SET dept_group = ?, updated_by = ? WHERE dept_group = ?', array($name, $u['username'], $old['name']));
        $rules = dept_group_rename_in_rules($old['name'], $name, $u);
        audit_write('DEPT_GROUP', $id, 'UPDATE', 'เปลี่ยนชื่อกลุ่ม / ฝ่าย ' . $old['name'] . ' → ' . $name
            . ' (พนักงาน ' . $emp['affected'] . ' คน · กฎชุดฟอร์ม ' . $rules . ' ฉบับ)', null, $u);
    }
    db_commit();
    $g = repo_dept_group($id);
    return $old ? $g : http_data($g, 201);
}

function api_dept_group_delete($req, $params)
{
    $u = rules_edit_require($req);
    dept_groups_need_table();
    $id = param_id($params);
    $g = find_or_404(repo_dept_group($id), 'ไม่พบกลุ่ม / ฝ่าย');
    if ($g['employeeCount'] > 0 || $g['ruleCount'] > 0) {
        $why = array();
        if ($g['employeeCount'] > 0) { $why[] = 'พนักงาน ' . $g['employeeCount'] . ' คน'; }
        if ($g['ruleCount'] > 0) { $why[] = 'กฎชุดฟอร์ม ' . $g['ruleCount'] . ' ข้อ'; }
        throw new ApiError('ลบไม่ได้ — ยังมี' . implode(' และ', $why) . 'ใช้กลุ่มนี้อยู่ ย้ายออกก่อน หรือเปลี่ยนชื่อแทน', 409);
    }
    db_begin();
    db_exec('DELETE FROM dept_groups WHERE id = ?', array($id));
    audit_write('DEPT_GROUP', $id, 'DELETE', 'ลบกลุ่ม / ฝ่าย ' . $g['name'], null, $u);
    db_commit();
    return http_no_content();
}
