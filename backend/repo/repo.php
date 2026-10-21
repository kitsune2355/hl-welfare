<?php
/* ============================================================
 *  backend/repo/repo.php — อ่านตาราง → รูปแบบ JSON ของหน้าเว็บ (camelCase ตาม domain/types.js)
 *
 *  แถว DB (snake_case, ตัวเลขเป็น string) → array ชนิดเดียวกับที่ MockApi ใช้
 *  boolean เป็น true/false · field JSON ถูก json_decode · ใช้กับ use-case ที่แปลงจาก JS ได้ตรง ๆ
 *  ข้อมูลหลักร้อยแถว จึงโหลดทั้งตารางแล้วคำนวณในหน่วยความจำแบบเดียวกับ mock (สเปกข้อ 10.7)
 * ============================================================ */

function map_company($r)
{
    return array('code' => $r['code'], 'name' => $r['name'], 'legalName' => $r['legal_name'],
        'color' => isset($r['color']) ? $r['color'] : '', 'sortOrder' => (int)$r['sort_order']);
}

function map_employee_type($r)
{
    return array('code' => $r['code'], 'name' => $r['name'], 'description' => $r['description'],
        'companies' => json_in($r['companies'], null), 'usesDeptGroup' => (bool)$r['uses_dept_group'],
        'usesPosition' => (bool)$r['uses_position'], 'dailyCycle' => (bool)$r['daily_cycle'],
        'tone' => $r['tone'], 'sortOrder' => (int)$r['sort_order']);
}

/** ประเภทพนักงาน (sql/015) — ใช้ผ่าน employee_types_all() ใน domain/labels.php */
function repo_employee_types()
{
    $out = array();
    foreach (db_all('SELECT * FROM employee_types ORDER BY sort_order, code') as $r) { $out[] = map_employee_type($r); }
    return $out;
}

function map_site($r, $overrides = array())
{
    return array('id' => (int)$r['id'], 'companyCode' => $r['company_code'], 'name' => $r['name'],
        'hasGroupInsurance' => (bool)$r['has_group_insurance'], 'poloColor' => $r['polo_color'],
        'uniformOverrides' => $overrides);
}

/** มีตารางนี้ไหม (จำผลไว้ต่อคำขอ) — ใช้กับตารางของ migration ที่อาจยังไม่ได้รัน */
function db_table_exists($table)
{
    static $seen = array();
    if (!isset($seen[$table])) {
        $seen[$table] = db_value('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
            array($table)) > 0;
    }
    return $seen[$table];
}

/**
 * ชุดฟอร์มที่หน่วยงานตั้งทับกฎ: site_id => [{ruleId, quantities}] เรียงตามกฎ
 * ยังไม่ได้รัน migration 007 (ไม่มีตาราง) → ไม่มีของหน่วยงาน
 */
function repo_site_overrides($siteId = null)
{
    if (!db_table_exists('site_uniform_overrides')) { return array(); }
    $rows = $siteId === null
        ? db_all('SELECT * FROM site_uniform_overrides ORDER BY site_id, rule_id')
        : db_all('SELECT * FROM site_uniform_overrides WHERE site_id = ? ORDER BY rule_id', array((int)$siteId));
    $out = array();
    foreach ($rows as $o) {
        $out[(int)$o['site_id']][] = array('ruleId' => (int)$o['rule_id'], 'quantities' => json_in($o['quantities'], array()));
    }
    return $out;
}

function map_employee($r)
{
    return array(
        'id' => (int)$r['id'],
        'empCode' => $r['emp_code'],
        'firstName' => $r['first_name'],
        'lastName' => $r['last_name'],
        'companyCode' => $r['company_code'],
        'siteId' => (int)$r['site_id'],
        'employeeType' => $r['employee_type'],
        'contractType' => $r['contract_type'],
        'deptGroup' => $r['dept_group'],
        'position' => $r['position'],
        'level' => int_or_null($r['level']),
        'salary' => num($r['salary']),
        'birthDate' => $r['birth_date'],
        'startDate' => $r['start_date'],
        'probationPassDate' => $r['probation_pass_date'],
        'status' => $r['status'],
        'lastWorkingDate' => $r['last_working_date'],
        'endDate' => $r['end_date'],
        'endReason' => $r['end_reason'],
        'title' => $r['title'],
        'gender' => $r['gender'],
        'nationalId' => $r['national_id'],
        'phone' => $r['phone'],
        'email' => $r['email'],
    );
}

function repo_companies()
{
    $out = array();
    foreach (db_all('SELECT * FROM companies ORDER BY sort_order, code') as $r) { $out[] = map_company($r); }
    return $out;
}

function repo_sites()
{
    $over = repo_site_overrides();
    $out = array();
    foreach (db_all('SELECT * FROM sites ORDER BY id') as $r) {
        $out[] = map_site($r, isset($over[(int)$r['id']]) ? $over[(int)$r['id']] : array());
    }
    return $out;
}

function repo_site($id)
{
    $r = db_one('SELECT * FROM sites WHERE id = ?', array((int)$id));
    if (!$r) { return null; }
    $over = repo_site_overrides((int)$id);
    return map_site($r, isset($over[(int)$id]) ? $over[(int)$id] : array());
}

/* พนักงาน / การแจก / การแจ้งประกัน กรองตามขอบเขตบริษัทของผู้ใช้ในคำขอนี้ (data_scope() ใน permissions.php)
   — HR บริษัทเห็นเฉพาะบริษัทตัวเอง ทุก use-case ที่อ่านผ่านฟังก์ชันเหล่านี้จึงถูกจำกัดตาม · ไม่มีผู้ใช้ (CLI) = ทุกบริษัท */
function repo_employees()
{
    $s = data_scope();
    $out = array();
    foreach (db_all('SELECT * FROM employees' . ($s !== null ? ' WHERE company_code = ?' : '') . ' ORDER BY id',
        $s !== null ? array($s) : array()) as $r) { $out[] = map_employee($r); }
    return $out;
}

function repo_employee($id)
{
    $r = db_one('SELECT * FROM employees WHERE id = ?', array((int)$id));
    return ($r && in_scope($r['company_code'])) ? map_employee($r) : null;
}

/**
 * ฉบับ (revision) ของกฎ — id = รหัสกฎ (rule_key) คงที่ทุกฉบับ · ยังไม่ได้รัน 007 = 1 แถว 1 ฉบับ (id ของแถว)
 * ดู domain/rule_versions.php
 */
function map_rule_revision($r, $rule)
{
    $versioned = array_key_exists('rule_key', $r);
    $head = array(
        'id' => $versioned ? (int)$r['rule_key'] : (int)$r['id'],
        'revisionId' => (int)$r['id'],
        'effectiveFrom' => $versioned ? $r['effective_from'] : RULE_EPOCH,
        'deleted' => $versioned ? (bool)$r['is_deleted'] : false,
    );
    unset($rule['id']);
    return array_merge($head, $rule);
}

/** ฉบับทั้งหมดของกฎ { insurance, uniform, settings } — หน้าเงื่อนไขสวัสดิการ (ประวัติ + รอมีผล) */
function repo_rule_revisions()
{
    $ins = array();
    foreach (db_all('SELECT * FROM insurance_rules ORDER BY id') as $r) {
        $ins[] = map_rule_revision($r, array(
            'id' => (int)$r['id'],
            'employeeType' => $r['employee_type'],
            'companies' => json_in($r['companies'], null),
            'waitDays' => (int)$r['wait_days'],
            'excludeContracts' => json_in($r['exclude_contracts'], array()),
            'requireSiteInsurance' => (bool)$r['require_site_insurance'],
            'note' => $r['note'],
            'updatedBy' => $r['updated_by'],
        ));
    }
    $uni = array();
    foreach (db_all('SELECT * FROM uniform_rules ORDER BY id') as $r) {
        $uni[] = map_rule_revision($r, map_uniform_rule_row($r));
    }
    $settings = array();
    foreach (db_all('SELECT * FROM settings') as $r) {
        $settings[] = array(
            'key' => $r['key'],
            'value' => is_numeric($r['value']) ? num($r['value']) : $r['value'],
            'effectiveFrom' => array_key_exists('effective_from', $r) ? $r['effective_from'] : RULE_EPOCH,
            'updatedBy' => $r['updated_by'],
        );
    }
    return array('insurance' => $ins, 'uniform' => $uni, 'settings' => $settings);
}

/** RuleSet = { insurance, uniform, uniformItems, settings } ที่มีผล ณ วันนี้ (ไม่ส่ง updatedBy — หน้าตาเดียวกับ MockApi) */
function repo_rules()
{
    $rev = repo_rule_revisions();
    $today = today_iso();
    $strip = array();
    foreach (array('insurance', 'uniform') as $k) {
        $strip[$k] = array();
        foreach (active_rules($rev[$k], $today) as $r) {
            unset($r['updatedBy']);
            $strip[$k][] = $r;
        }
    }
    $items = array();
    foreach (db_all('SELECT * FROM uniform_items ORDER BY sort_order, code') as $r) {
        $items[] = array('code' => $r['code'], 'name' => $r['name']);
    }
    return array('insurance' => $strip['insurance'], 'uniform' => $strip['uniform'], 'uniformItems' => $items,
        'settings' => active_settings($rev['settings'], $today));
}

function map_uniform_rule_row($r)
{
    return array(
        'id' => (int)$r['id'],
        'employeeType' => $r['employee_type'],
        'companies' => json_in($r['companies'], array()),
        'deptGroups' => json_in($r['dept_groups'], null),
        'position' => $r['position'],
        'levelMin' => int_or_null($r['level_min']),
        'levelMax' => int_or_null($r['level_max']),
        'style' => $r['style'],
        'logo' => $r['logo'],
        'items' => json_in($r['items'], array()),
        'poloBySite' => (bool)$r['polo_by_site'],
        // จำนวนต่อรายการต่อรอบ (migration 007) — ยังไม่มีคอลัมน์ = null → domain แปลงจากจำนวนรวม
        'quantities' => array_key_exists('quantities', $r) ? json_in($r['quantities'], null) : null,
        'qtyStart' => (int)$r['qty_start'],
        'qtyStartLabel' => $r['qty_start_label'],
        'qtyProbation' => (int)$r['qty_probation'],
        'qtyAnnual' => (int)$r['qty_annual'],
        'note' => $r['note'],
        'updatedBy' => $r['updated_by'],
    );
}

/** InsuranceBatch[] เรียงตาม id (items เรียงตาม seq) */
function repo_batches()
{
    $items = array();
    $s = data_scope();
    foreach (db_all('SELECT i.batch_id, i.employee_id, i.type FROM insurance_batch_items i'
        . ($s !== null ? ' JOIN employees e ON e.id = i.employee_id WHERE e.company_code = ?' : '') . ' ORDER BY i.batch_id, i.seq',
        $s !== null ? array($s) : array()) as $r) {
        $items[(int)$r['batch_id']][] = array('employeeId' => (int)$r['employee_id'], 'type' => $r['type']);
    }
    $out = array();
    foreach (db_all('SELECT * FROM insurance_batches ORDER BY id') as $r) {
        $id = (int)$r['id'];
        if ($s !== null && !isset($items[$id])) { continue; }   // ไม่มีพนักงานบริษัทนี้ในการส่งครั้งนั้น
        $out[] = array(
            'id' => $id,
            'cycleDate' => $r['cycle_date'],
            'insurerId' => int_or_null($r['insurer_id']),
            'insurerName' => $r['insurer_name'],
            'items' => isset($items[$id]) ? $items[$id] : array(),
            'submittedAt' => stamp_from_db($r['submitted_at']),
            'submittedBy' => $r['submitted_by_name'],
        );
    }
    return $out;
}

function map_issue($r)
{
    $i = array(
        'id' => (int)$r['id'],
        'employeeId' => (int)$r['employee_id'],
        'entitlementKey' => $r['entitlement_key'],
        'event' => $r['event'],
        'qty' => (int)$r['qty'],
        'size' => $r['size'],
        'issuedAt' => $r['issued_at'],
        'issuedBy' => $r['issued_by_name'],
        'source' => $r['source'],
    );
    if ($r['source'] === 'STOCK') {
        $i['stock'] = array(
            'ref' => $r['stock_ref'],
            'docId' => int_or_null($r['stock_doc_id']),
            'docNo' => $r['stock_doc_no'],
            'stage' => $r['stock_stage'],
            'issuedAt' => $r['stock_issued_at'],
            'receivedAt' => $r['stock_received_at'],
            'cancelNote' => $r['stock_cancel_note'] !== null ? $r['stock_cancel_note'] : '',
            'items' => json_in($r['stock_items'], array()),
        );
    }
    return $i;
}

/** UniformIssue[] — ข้อมูลตั้งต้น (MANUAL) ไม่มี source ใน mock: ส่ง source ไปด้วยเสมอ (หน้าเว็บถือว่าไม่มี = MANUAL) */
function repo_issues()
{
    $s = data_scope();
    $out = array();
    foreach (db_all('SELECT u.* FROM uniform_issues u'
        . ($s !== null ? ' JOIN employees e ON e.id = u.employee_id WHERE e.company_code = ?' : '') . ' ORDER BY u.id',
        $s !== null ? array($s) : array()) as $r) { $out[] = map_issue($r); }
    return $out;
}

function repo_issue($id)
{
    $r = db_one('SELECT u.*, e.company_code AS emp_company FROM uniform_issues u LEFT JOIN employees e ON e.id = u.employee_id WHERE u.id = ?',
        array((int)$id));
    return ($r && in_scope($r['emp_company'])) ? map_issue($r) : null;
}

/** การส่งแจ้งครั้งนี้มีพนักงานนอกขอบเขตบริษัทของผู้ใช้กี่คน (ยกเลิก/แทนที่ได้เฉพาะเมื่อเป็น 0) */
function batch_items_out_of_scope($batchId)
{
    $s = data_scope();
    if ($s === null) { return 0; }
    return (int)db_value('SELECT COUNT(*) FROM insurance_batch_items i JOIN employees e ON e.id = i.employee_id
                          WHERE i.batch_id = ? AND e.company_code <> ?', array((int)$batchId, $s));
}

/** InsurerForm — คอลัมน์หลัก + ส่วนที่เหลือจาก form_json */
function map_insurer($r)
{
    $f = array('id' => (int)$r['id'], 'name' => $r['name'], 'shortName' => $r['short_name'], 'active' => (bool)$r['active']);
    foreach (json_in($r['form_json'], array()) as $k => $v) {
        if (!array_key_exists($k, $f)) { $f[$k] = $v; }
    }
    if (!isset($f['companies']) || !is_array($f['companies'])) { $f['companies'] = array(); }
    return $f;
}

function repo_insurers()
{
    $out = array();
    foreach (db_all('SELECT * FROM insurer_forms ORDER BY active DESC, id') as $r) { $out[] = map_insurer($r); }
    return $out;
}

function repo_insurer($id)
{
    $r = db_one('SELECT * FROM insurer_forms WHERE id = ?', array((int)$id));
    return $r ? map_insurer($r) : null;
}

/** ข้อมูลทั้งหมดที่ use-case ต้องใช้ (แบบเดียวกับ this.db ของ MockApi) */
function repo_world()
{
    return array(
        'employees' => repo_employees(),
        'sites' => repo_sites(),
        'rules' => repo_rules(),
        'batches' => repo_batches(),
        'issues' => repo_issues(),
    );
}

/* ---------- audit_log ---------- */
/** = this.log() ของ MockApi · ผู้กระทำ = ผู้ใช้จาก session ($actor) หรือ null = ระบบ */
function audit_write($entity, $entityId, $action, $summary, $employeeId, $actor, $actorName = null)
{
    $by = $actor ? $actor['username'] : 'system';
    $now = db_now();
    db_exec('INSERT INTO audit_log (entity, entity_id, action, summary, employee_id, user_id, user_name, at,
             created_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        array($entity, (string)$entityId, $action, function_exists('mb_substr') ? mb_substr($summary, 0, 500, 'UTF-8') : $summary,
            $employeeId === null ? null : (int)$employeeId, $actor ? (int)$actor['id'] : null,
            $actor ? $actor['name'] : ($actorName !== null ? $actorName : 'system'), $now, $now, $by, $by));
}

function map_activity($r)
{
    return array(
        'id' => (int)$r['id'],
        'at' => stamp_from_db($r['at']),
        'user' => $r['user_name'],
        'entity' => $r['entity'],
        'entityId' => $r['entity_id'],
        'action' => $r['action'],
        'summary' => $r['summary'],
        'employeeId' => int_or_null($r['employee_id']),
    );
}
