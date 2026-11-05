<?php
/* ============================================================
 *  backend/usecases/job_db_import.php — แปลงข้อมูลระบบสัญญาจ้างเป็นพนักงานของระบบนี้
 *
 *  แหล่งข้อมูล: cns (job_db_cns → CNS รายวัน ระดับ 1) · pro (hr-pro → PRO Pro Site ไม่ใช้ระดับ) — ตารางชื่อเดียวกัน คนละฐาน
 *  จับคู่ด้วยรหัสพนักงาน (rsm_format2) · ไม่ลบใคร ไม่เปลี่ยนสถานะ
 *  ชื่อหน่วยงาน = "ag_format ag_name" จาก tb_agency — หาจาก ag_format ของสัญญา → ag_id → rsmc_ag_id (PRO มักไม่มี ag_format)
 *  ไม่พบใน tb_agency = ใช้ชื่อที่บันทึกในสัญญา (ag_name → rsm_department) · rsm_division คือ "ฝ่าย" ไม่ใช่รหัสหน่วยงาน
 *  ข้อมูลต่างกัน: แสดงให้ HR เลือกเองว่าจะอัปเดตหรือไม่ · ค่าว่างจากต้นทางไม่ลบค่าที่มีอยู่
 *  ไม่มีการเรียกฐานข้อมูลในไฟล์นี้ (api/job_db.php เป็นคนอ่าน)
 * ============================================================ */

define('JOB_DB_SITE_NAME_MAX', 200);   // ขนาดคอลัมน์ sites.name

/**
 * file = ไฟล์เชื่อมต่อใน backend/ · global = ค่าทับในเทสต์
 * positionTable: true = ชื่อตำแหน่งจาก tb_position ของฐานนั้น · false = รหัสคงที่ของ CNS (job_db_position_label)
 */
function job_db_sources()
{
    return array(
        'cns' => array('key' => 'cns', 'system' => 'job_db_cns', 'company' => 'CNS', 'employeeType' => 'DAILY', 'level' => 1,
            'file' => 'connect_job_db.php', 'global' => 'hlw_job_db', 'positionTable' => false),
        'pro' => array('key' => 'pro', 'system' => 'hr-pro', 'company' => 'PRO', 'employeeType' => 'PRO_SITE', 'level' => null,
            'file' => 'connect_job_db_pro.php', 'global' => 'hlw_job_db_pro', 'positionTable' => true),
    );
}

/** รหัสตำแหน่งของ job_db_cns (tb_resume_contact_info.rsm_position) */
function job_db_position_label($code)
{
    $labels = array('', 'หัวหน้าแม่บ้าน', 'แม่บ้าน', 'สแปร์', 'คนสวน', 'บิ๊กคลีน', '', 'หัวหน้าควบคุมงาน', 'รองหัวหน้าแม่บ้าน');
    $i = (int)$code;
    return isset($labels[$i]) && $labels[$i] !== '' ? $labels[$i] : null;
}

function job_db_text($v)
{
    $v = trim(preg_replace('/\s+/u', ' ', (string)$v));
    return $v === '' ? null : $v;
}

/** วันที่ว่าง / 0000-00-00 / รูปแบบผิด = null */
function job_db_date($v)
{
    $v = trim((string)$v);
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m)) { return null; }
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $v : null;
}

/** เพศจากต้นทาง — อ่านไม่ออก = ดูจากคำนำหน้า */
function job_db_gender($gender, $title)
{
    $g = strtolower(trim((string)$gender));
    if (in_array($g, array('m', 'male', 'ชาย'), true)) { return 'M'; }
    if (in_array($g, array('f', 'female', 'หญิง'), true)) { return 'F'; }
    if ($title === 'นาย') { return 'M'; }
    if ($title === 'นาง' || $title === 'นางสาว') { return 'F'; }
    return null;
}

/**
 * แถวต้นทาง → ค่าพนักงาน + ชื่อหน่วยงาน
 * เลขบัตร / เบอร์โทรรูปแบบผิด = เว้นว่างพร้อมคำเตือน (พนักงานยังนำเข้าได้)
 */
function job_db_map_row($r, $src)
{
    $warnings = array();
    $title = job_db_text(arr_get($r, 'rsm_name_th_sex'));
    $nationalId = digits_only(arr_get($r, 'rsm_id_card', ''));
    if ($nationalId === '') { $nationalId = null; }
    elseif (!is_valid_thai_id($nationalId)) { $warnings[] = 'เลขบัตรประชาชนไม่ถูกต้อง — เว้นว่าง'; $nationalId = null; }
    $phone = digits_only(arr_get($r, 'rsm_tel', ''));
    if ($phone === '') { $phone = null; }
    elseif (!preg_match('/^0\d{8,9}$/', $phone)) { $warnings[] = 'เบอร์โทรไม่ถูกต้อง — เว้นว่าง'; $phone = null; }
    $format = job_db_text(arr_get($r, 'ag_format'));
    if ($format === null) { $format = job_db_text(arr_get($r, 'agency_format')); }
    $agencyName = job_db_text(arr_get($r, 'agency_name'));
    if ($agencyName === null && $format !== null) { $warnings[] = 'ไม่พบ ' . $format . ' ใน tb_agency — ใช้ชื่อจากสัญญา'; }
    if ($agencyName === null) { $agencyName = job_db_text(arr_get($r, 'ag_name')); }
    if ($agencyName === null) { $agencyName = job_db_text(arr_get($r, 'rsm_department')); }
    $siteName = job_db_text($format . ' ' . $agencyName);
    return array(
        'fields' => array(
            'empCode' => job_db_text(arr_get($r, 'rsm_format2')),
            'title' => $title,
            'firstName' => job_db_text(arr_get($r, 'rsm_name_th')),
            'lastName' => job_db_text(arr_get($r, 'rsm_name_th2')),
            'gender' => job_db_gender(arr_get($r, 'rsm_gender'), $title),
            'birthDate' => job_db_date(arr_get($r, 'rsm_birthday')),
            'startDate' => job_db_date(arr_get($r, 'rsm_start')),
            'nationalId' => $nationalId,
            'phone' => $phone,
            'position' => $src['positionTable'] ? job_db_text(arr_get($r, 'position_name')) : job_db_position_label(arr_get($r, 'rsm_position')),
            'level' => $src['level'],
        ),
        'siteName' => $siteName,
        'warnings' => $warnings,
    );
}

function job_db_field_labels()
{
    return array('title' => 'คำนำหน้า', 'firstName' => 'ชื่อ', 'lastName' => 'นามสกุล', 'gender' => 'เพศ', 'birthDate' => 'วันเกิด',
        'startDate' => 'วันเริ่มงาน', 'nationalId' => 'เลขบัตรประชาชน', 'phone' => 'เบอร์โทร', 'position' => 'ตำแหน่ง', 'level' => 'ระดับ');
}

/** ค่าที่จะบันทึกของพนักงานใหม่ */
function job_db_new_employee($f, $siteId, $src)
{
    return array_merge($f, array('companyCode' => $src['company'], 'siteId' => $siteId, 'employeeType' => $src['employeeType'],
        'contractType' => 'REGULAR', 'deptGroup' => null, 'probationPassDate' => null, 'status' => 'ACTIVE',
        'lastWorkingDate' => null, 'endDate' => null, 'endReason' => null, 'email' => null));
}

/** ค่าที่จะบันทึกของพนักงานเดิม: ต้นทางมีค่า = ใช้ค่าต้นทาง · ค่าอื่นคงเดิม · วันผ่านทดลองงานที่ระบบคำนวณไว้ คำนวณใหม่ตามวันเริ่มงาน */
function job_db_merged_employee($e, $f, $siteId)
{
    $m = $e;
    foreach ($f as $k => $v) { if ($v !== null) { $m[$k] = $v; } }
    if ($siteId) { $m['siteId'] = $siteId; }
    if ($m['startDate'] !== $e['startDate'] && $e['probationPassDate'] === probation_due_date($e['startDate'])) {
        $m['probationPassDate'] = null;
    }
    return $m;
}

function job_db_error_list($errors)
{
    $out = array();
    foreach ($errors as $msg) { $out[] = $msg; }
    return $out;
}

/**
 * เทียบต้นทางกับพนักงานในระบบ — คืนรายการ + สรุป
 * action: new เพิ่มใหม่ · update ข้อมูลต่างกัน · same ตรงกันแล้ว · skip ข้ามพร้อมเหตุผล
 * ต้นทางเรียงจากสัญญาใหม่สุด: รหัสซ้ำ (ต่อสัญญา) ใช้แถวแรก
 */
function job_db_plan($sourceRows, $employees, $sites, $src)
{
    $byCode = array();
    foreach ($employees as $e) { $byCode[strtolower($e['empCode'])] = $e; }
    $siteByName = array();
    $siteNames = array();
    foreach ($sites as $s) {
        $siteNames[$s['id']] = $s['name'];
        if ($s['companyCode'] === $src['company']) { $siteByName[$s['name']] = $s; }
    }
    $labels = job_db_field_labels();
    $seen = array();
    $missing = array();
    $rows = array();
    $summary = array('total' => 0, 'new' => 0, 'update' => 0, 'same' => 0, 'skip' => 0);
    foreach ($sourceRows as $sourceRow) {
        $mapped = job_db_map_row($sourceRow, $src);
        $f = $mapped['fields'];
        $code = $f['empCode'];
        $key = strtolower((string)$code);
        if ($code !== null && isset($seen[$key])) { continue; }
        if ($code !== null) { $seen[$key] = true; }
        $name = trim($f['firstName'] . ' ' . $f['lastName']);
        $siteName = $mapped['siteName'];
        $site = $siteName !== null && isset($siteByName[$siteName]) ? $siteByName[$siteName] : null;
        $row = array('empCode' => $code, 'name' => $name, 'position' => $f['position'], 'siteName' => $siteName, 'siteExists' => $site !== null,
            'action' => 'skip', 'reasons' => array(), 'warnings' => $mapped['warnings'], 'changes' => array(), 'fields' => $f, 'employee' => null);
        $e = $key !== '' && isset($byCode[$key]) ? $byCode[$key] : null;
        if ($code === null) {
            $row['reasons'][] = 'ไม่มีรหัสพนักงาน';
        } elseif ($siteName === null) {
            $row['reasons'][] = 'ไม่มีชื่อหน่วยงาน';
        } elseif (mb_strlen($siteName, 'UTF-8') > JOB_DB_SITE_NAME_MAX) {
            $row['reasons'][] = 'ชื่อหน่วยงานยาวเกิน ' . JOB_DB_SITE_NAME_MAX . ' ตัวอักษร';
        } elseif ($site && !$site['active'] && !($e && $e['siteId'] === $site['id'])) {
            $row['reasons'][] = 'หน่วยงาน “' . $siteName . '” ปิดใช้งานอยู่';
        } elseif ($e && ($e['companyCode'] !== $src['company'] || $e['employeeType'] !== $src['employeeType'])) {
            $row['reasons'][] = 'รหัสนี้เป็นพนักงาน ' . $e['companyCode'] . ' / ' . label_employee_type($e['employeeType']) . ' อยู่แล้ว — ตรวจในหน้าพนักงาน';
        } elseif ($e) {
            $row['employee'] = $e;
            foreach ($labels as $k => $label) {
                if ($f[$k] !== null && (string)$f[$k] !== (string)$e[$k]) {
                    $row['changes'][] = array('field' => $k, 'label' => $label, 'from' => $e[$k], 'to' => $f[$k]);
                }
            }
            if (!$site || $site['id'] !== $e['siteId']) {
                $row['changes'][] = array('field' => 'site', 'label' => 'หน่วยงาน',
                    'from' => isset($siteNames[$e['siteId']]) ? $siteNames[$e['siteId']] : '', 'to' => $siteName);
            }
            $errors = validate_employee(job_db_merged_employee($e, $f, $e['siteId']));
            if (count($errors)) { $row['reasons'] = job_db_error_list($errors); }
            else { $row['action'] = count($row['changes']) ? 'update' : 'same'; }
        } else {
            // หน่วยงานที่ยังไม่มีจะสร้างตอนบันทึก (ตรวจแค่ค่าไม่ว่าง)
            $errors = validate_employee(job_db_new_employee($f, $site ? $site['id'] : -1, $src));
            if (count($errors)) { $row['reasons'] = job_db_error_list($errors); }
            else { $row['action'] = 'new'; }
        }
        if (in_array($row['action'], array('new', 'update'), true) && !$site) { $missing[$siteName] = true; }
        $summary['total']++;
        $summary[$row['action']]++;
        $rows[] = $row;
    }
    return array('rows' => $rows, 'summary' => $summary, 'missingSites' => array_keys($missing));
}
