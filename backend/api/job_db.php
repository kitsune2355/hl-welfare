<?php
/* ============================================================
 *  backend/api/job_db.php — ดึงพนักงานจากระบบสัญญาจ้าง: cns (job_db_cns) · pro (hr-pro) — usecases/job_db_import.php
 *
 *    GET  /job-db/employees/preview?source=cns|pro   เทียบข้อมูล (ยังไม่บันทึก)
 *    POST /job-db/employees/import    { source, create: [รหัส…], update: [รหัส…], createSites: bool }
 *
 *  ตั้งจากหน้า admin.html แท็บตั้งค่าระบบได้ (system_settings ทับไฟล์ทีละค่า)
 *  การเชื่อมต่ออยู่ใน backend/connect_job_db.php · connect_job_db_pro.php (แต่ละเครื่อง/โฮสต์มีของตัวเอง) · อ่านอย่างเดียว ไม่เขียนกลับต้นทาง
 *  ตอนนำเข้าอ่านต้นทางใหม่อีกครั้ง ไม่เชื่อค่าจากหน้าเว็บ · บันทึกผ่าน api_employee_save / api_site_create (ตรวจ + audit ชุดเดียวกัน)
 * ============================================================ */

function job_db_source($key)
{
    $all = job_db_sources();
    $key = $key === null || $key === '' ? 'cns' : (string)$key;
    if (!isset($all[$key])) { throw new ApiError('ไม่รู้จักแหล่งข้อมูล', 422); }
    return $all[$key];
}

/** ค่าในไฟล์เชื่อมต่อ — ไม่มีไฟล์ = false */
function job_db_file_config($src)
{
    $hlw_job_db = null;
    $file = dirname(dirname(__FILE__)) . '/' . $src['file'];
    if (is_file($file)) { include $file; }
    return is_array($hlw_job_db) ? $hlw_job_db : false;
}

/** ไฟล์เชื่อมต่อ + ค่าจากหน้าตั้งค่าระบบทับทีละค่า · ยังไม่ครบ = false */
function job_db_config($src)
{
    $g = $src['global'];
    if (array_key_exists($g, $GLOBALS)) { return $GLOBALS[$g]; }
    $c = job_db_file_config($src);
    if (!$c) { $c = array(); }
    if (isset($src['settingsPrefix'])) {
        $saved = sys_setting_overrides();
        foreach (array('host', 'port', 'name', 'user', 'pass') as $f) {
            if (isset($saved[$src['settingsPrefix'] . $f])) { $c[$f] = $saved[$src['settingsPrefix'] . $f]; }
        }
    }
    return (!empty($c['name']) && !empty($c['host'])) ? $c : false;
}

/** $table / $column เป็นค่าคงที่จากโค้ดเท่านั้น */
function job_db_has_column($conn, $table, $column)
{
    $res = mysqli_query($conn, "SHOW COLUMNS FROM `$table` LIKE '$column'");
    if (!$res) { return false; }
    $has = mysqli_num_rows($res) > 0;
    mysqli_free_result($res);
    return $has;
}

/**
 * แถวต้นทาง: สัญญาที่เซ็นแล้ว (tb_resume_contract.rsmc_status = 'signed') เรียงจากสัญญาใหม่สุด
 * หน่วยงาน: tb_agency ตาม ag_format · รหัสซ้ำใช้แถวล่าสุด (เรียงแบบเดียวกับ api_contract_create_contract_v3.php — job_db_plan ใช้แถวแรกของแต่ละคน)
 * ไม่มี ag_format (PRO ส่วนใหญ่) ใช้ i.ag_id → c.rsmc_ag_id → ชื่อที่บันทึกในสัญญา i.rsm_department
 * JOIN ข้อความผ่าน CONVERT เพราะแต่ละตารางของต้นทางอาจใช้ collation ต่างกัน (MySQL 1267)
 * คอลัมน์หน่วยงานของสัญญา · ad_user_id_uptime อาจไม่มีในบางฐาน — ตรวจก่อนใช้
 */
function job_db_source_rows($src)
{
    $sys = $src['system'];
    $c = job_db_config($src);
    if (!$c) {
        throw new ApiError('ยังไม่ได้ตั้งค่าการเชื่อมต่อ ' . $sys . ' (backend/' . $src['file'] . ' — คัดลอกจาก ' . str_replace('.php', '.example.php', $src['file']) . ')' . (isset($src['settingsPrefix']) ? ' หรือให้ผู้ดูแลตั้งที่ ระบบ & ความปลอดภัย → ตั้งค่าระบบ' : ''), 409, null, 'JOB_DB_NOT_CONFIGURED');
    }
    $conn = mysqli_init();
    mysqli_options($conn, MYSQLI_OPT_CONNECT_TIMEOUT, 5);
    if (!@mysqli_real_connect($conn, $c['host'], $c['user'], $c['pass'], $c['name'], isset($c['port']) ? (int)$c['port'] : 3306)) {
        throw new ApiError('เชื่อมต่อฐานข้อมูล ' . $sys . ' ไม่ได้ (รหัส ' . mysqli_connect_errno() . ') — ตรวจ ' . (isset($src['settingsPrefix']) ? 'ระบบ & ความปลอดภัย → ตั้งค่าระบบ หรือ ' : '') . 'backend/' . $src['file'], 503, null, 'JOB_DB_UNAVAILABLE');
    }
    mysqli_query($conn, 'SET NAMES utf8');
    $hasInfoAg = job_db_has_column($conn, 'tb_resume_contact_info', 'ag_id');
    $hasContractAg = job_db_has_column($conn, 'tb_resume_contract', 'rsmc_ag_id');
    $agencyNames = 'a.ag_name' . ($hasInfoAg ? ', ai.ag_name' : '') . ($hasContractAg ? ', ac.ag_name' : '');
    $agencyFormat = $hasInfoAg && $hasContractAg ? 'CASE WHEN ai.ag_id IS NOT NULL THEN ai.ag_format ELSE ac.ag_format END'
        : ($hasInfoAg ? 'ai.ag_format' : ($hasContractAg ? 'ac.ag_format' : 'NULL'));
    $res = mysqli_query($conn, "SELECT i.info_id, i.rsm_format2, i.rsm_name_th_sex, i.rsm_name_th, i.rsm_name_th2, i.rsm_gender, i.rsm_birthday,
                i.rsm_id_card, i.rsm_tel, i.rsm_position, i.ag_format, "
            . (job_db_has_column($conn, 'tb_resume_contact_info', 'ag_name') ? 'i.ag_name' : 'NULL AS ag_name') . ', '
            . (job_db_has_column($conn, 'tb_resume_contact_info', 'rsm_department') ? 'i.rsm_department' : 'NULL AS rsm_department')
            . ", COALESCE($agencyNames) AS agency_name, $agencyFormat AS agency_format, i.rsm_start"
            . ($src['positionTable'] ? ', p.pt_name AS position_name' : '') . "
            FROM tb_resume_contact_info i
            INNER JOIN tb_resume_contract c ON c.rsmc_id = i.info_rsmc_id
            LEFT JOIN tb_agency a ON CONVERT(a.ag_format USING utf8) = CONVERT(i.ag_format USING utf8) AND TRIM(i.ag_format) <> ''"
            . ($hasInfoAg ? ' LEFT JOIN tb_agency ai ON ai.ag_id = i.ag_id AND i.ag_id > 0' : '')
            . ($hasContractAg ? ' LEFT JOIN tb_agency ac ON ac.ag_id = c.rsmc_ag_id AND c.rsmc_ag_id > 0' : '')
            . ($src['positionTable'] ? ' LEFT JOIN tb_position p ON CONVERT(p.pt_id USING utf8) = CONVERT(i.rsm_position USING utf8)' : '') . "
            WHERE c.rsmc_status = 'signed'
            ORDER BY i.info_rsmc_id DESC, i.info_id DESC, "
            . (job_db_has_column($conn, 'tb_agency', 'ad_user_id_uptime') ? 'a.ad_user_id_uptime DESC, ' : '') . 'a.ag_id DESC');
    if (!$res) {
        $errno = mysqli_errno($conn);
        $error = mysqli_error($conn);
        mysqli_close($conn);
        $hint = in_array($errno, array(1044, 1142, 1143)) ? ' — ตรวจสิทธิ์ SELECT ของผู้ใช้' : ($errno === 1054 ? ' — ' . $error : '');
        throw new ApiError('อ่านข้อมูลจาก ' . $sys . ' ไม่ได้ (รหัส ' . $errno . ')' . $hint, 503, null, 'JOB_DB_UNAVAILABLE');
    }
    $rows = array();
    $seen = array();   // tb_agency รหัสซ้ำได้หลายแถว — หนึ่งสัญญาเอาแถวแรก (แถวล่าสุดตาม ORDER BY)
    while ($r = mysqli_fetch_assoc($res)) {
        if (isset($seen[$r['info_id']])) { continue; }
        $seen[$r['info_id']] = true;
        $rows[] = $r;
    }
    mysqli_free_result($res);
    mysqli_close($conn);
    return $rows;
}

function job_db_require($req, $src)
{
    $u = cap_require($req, 'employees.edit');
    scope_require($src['company']);
    return $u;
}

function api_job_db_preview($req, $params)
{
    $src = job_db_source(req_query($req, 'source'));
    $u = job_db_require($req, $src);
    $plan = job_db_plan(job_db_source_rows($src), repo_employees(), repo_sites(), $src);
    $rows = array();
    foreach ($plan['rows'] as $r) {
        if ($r['action'] === 'same') { continue; }
        unset($r['fields'], $r['employee']);
        $rows[] = $r;
    }
    return array('source' => $src['key'], 'system' => $src['system'], 'company' => $src['company'],
        'rows' => $rows, 'summary' => $plan['summary'], 'missingSites' => $plan['missingSites'],
        'canCreateSites' => cap_allowed($u['role'], 'sites.edit'));
}

/** เรียก handler เดิมด้วย body ใหม่ (session / cookie เดิม) */
function job_db_sub_request($req, $body)
{
    $req['raw'] = json_encode($body);
    return $req;
}

function job_db_site_id($name, $src)
{
    return (int)db_value('SELECT id FROM sites WHERE company_code = ? AND name = ?', array($src['company'], $name));
}

function api_job_db_import($req, $params)
{
    $b = req_json($req);
    $src = job_db_source(arr_get($b, 'source'));
    $u = job_db_require($req, $src);
    $create = array_flip((array)arr_get($b, 'create', array()));
    $update = array_flip((array)arr_get($b, 'update', array()));
    $createSites = (bool)arr_get($b, 'createSites', false) && cap_allowed($u['role'], 'sites.edit');
    @set_time_limit(300);
    $plan = job_db_plan(job_db_source_rows($src), repo_employees(), repo_sites(), $src);
    $result = array('created' => 0, 'updated' => 0, 'sitesCreated' => 0, 'failed' => array());
    foreach ($plan['rows'] as $r) {
        $isNew = $r['action'] === 'new' && isset($create[$r['empCode']]);
        $isUpdate = $r['action'] === 'update' && isset($update[$r['empCode']]);
        if (!$isNew && !$isUpdate) { continue; }
        try {
            $siteId = job_db_site_id($r['siteName'], $src);
            if (!$siteId) {
                if (!$createSites) { throw new ApiError('ยังไม่มีหน่วยงาน “' . $r['siteName'] . '”', 422); }
                api_site_create(job_db_sub_request($req, array('name' => $r['siteName'], 'companyCode' => $src['company'], 'hasGroupInsurance' => true)), array());
                $siteId = job_db_site_id($r['siteName'], $src);
                $result['sitesCreated']++;
            }
            if ($isNew) {
                api_employee_save(job_db_sub_request($req, job_db_new_employee($r['fields'], $siteId, $src)), array());
                $result['created']++;
            } else {
                api_employee_save(job_db_sub_request($req, job_db_merged_employee($r['employee'], $r['fields'], $siteId)), array('id' => $r['employee']['id']));
                $result['updated']++;
            }
        } catch (Exception $ex) {
            db_rollback();
            $result['failed'][] = array('empCode' => $r['empCode'], 'name' => $r['name'], 'message' => $ex->getMessage());
        }
    }
    if ($result['created'] || $result['updated'] || $result['sitesCreated']) {
        db_begin();
        audit_write('EMPLOYEE', 'job_db', 'UPDATE', 'ดึงจาก ' . $src['system'] . ': เพิ่ม ' . $result['created'] . ' · อัปเดต ' . $result['updated']
            . ' · หน่วยงานใหม่ ' . $result['sitesCreated'] . ' · ไม่สำเร็จ ' . count($result['failed']), null, $u);
        db_commit();
    }
    return $result;
}
