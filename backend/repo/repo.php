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
    return array('code' => $r['code'], 'name' => $r['name'], 'legalName' => $r['legal_name']);
}

function map_site($r)
{
    return array('id' => (int)$r['id'], 'companyCode' => $r['company_code'], 'name' => $r['name'],
        'hasGroupInsurance' => (bool)$r['has_group_insurance'], 'poloColor' => $r['polo_color']);
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
    $out = array();
    foreach (db_all('SELECT * FROM sites ORDER BY id') as $r) { $out[] = map_site($r); }
    return $out;
}

function repo_site($id)
{
    $r = db_one('SELECT * FROM sites WHERE id = ?', array((int)$id));
    return $r ? map_site($r) : null;
}

function repo_employees()
{
    $out = array();
    foreach (db_all('SELECT * FROM employees ORDER BY id') as $r) { $out[] = map_employee($r); }
    return $out;
}

function repo_employee($id)
{
    $r = db_one('SELECT * FROM employees WHERE id = ?', array((int)$id));
    return $r ? map_employee($r) : null;
}

/** RuleSet = { insurance, uniform, uniformItems, settings } */
function repo_rules()
{
    $ins = array();
    foreach (db_all('SELECT * FROM insurance_rules ORDER BY id') as $r) {
        $ins[] = array(
            'id' => (int)$r['id'],
            'employeeType' => $r['employee_type'],
            'companies' => json_in($r['companies'], null),
            'waitDays' => (int)$r['wait_days'],
            'excludeContracts' => json_in($r['exclude_contracts'], array()),
            'requireSiteInsurance' => (bool)$r['require_site_insurance'],
            'note' => $r['note'],
        );
    }
    $uni = array();
    foreach (db_all('SELECT * FROM uniform_rules ORDER BY id') as $r) {
        $u = array(
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
            'qtyStart' => (int)$r['qty_start'],
            'qtyStartLabel' => $r['qty_start_label'],
            'qtyProbation' => (int)$r['qty_probation'],
            'qtyAnnual' => (int)$r['qty_annual'],
            'note' => $r['note'],
        );
        $uni[] = $u;
    }
    $items = array();
    foreach (db_all('SELECT * FROM uniform_items ORDER BY sort_order, code') as $r) {
        $items[] = array('code' => $r['code'], 'name' => $r['name']);
    }
    $settings = array();
    foreach (db_all('SELECT * FROM settings') as $r) {
        $settings[$r['key']] = is_numeric($r['value']) ? num($r['value']) : $r['value'];
    }
    return array('insurance' => $ins, 'uniform' => $uni, 'uniformItems' => $items, 'settings' => $settings);
}

/** InsuranceBatch[] เรียงตาม id (items เรียงตาม seq) */
function repo_batches()
{
    $items = array();
    foreach (db_all('SELECT batch_id, employee_id, type FROM insurance_batch_items ORDER BY batch_id, seq') as $r) {
        $items[(int)$r['batch_id']][] = array('employeeId' => (int)$r['employee_id'], 'type' => $r['type']);
    }
    $out = array();
    foreach (db_all('SELECT * FROM insurance_batches ORDER BY id') as $r) {
        $id = (int)$r['id'];
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
    $out = array();
    foreach (db_all('SELECT * FROM uniform_issues ORDER BY id') as $r) { $out[] = map_issue($r); }
    return $out;
}

function repo_issue($id)
{
    $r = db_one('SELECT * FROM uniform_issues WHERE id = ?', array((int)$id));
    return $r ? map_issue($r) : null;
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
