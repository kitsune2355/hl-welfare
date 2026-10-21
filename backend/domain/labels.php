<?php
/* ============================================================
 *  backend/domain/labels.php — คู่แฝดของ web/assets/js/domain/labels.js
 * ============================================================ */

/* ---------- บริษัท / ประเภทพนักงาน (ตั้งค่าได้ที่ sites.html — sql/015) ----------
 * คู่แฝดของ web/assets/js/domain/catalog.js · อ่านจากฐานข้อมูลครั้งเดียวต่อคำขอ (org_cache_reset ล้าง)
 * ยังไม่ได้รัน 015 = ใช้ค่าตั้งต้นด้านล่าง (= พฤติกรรมเดิมที่ฝังในโค้ด) */

/** ประเภทตั้งต้น — พฤติกรรมเดิม: ส่วนกลางมีกลุ่ม/ฝ่าย · Pro Site เฉพาะ PRO + ตำแหน่ง · รายวันรอบแจ้งรายวัน */
function default_employee_types()
{
    return array(
        array('code' => 'CENTRAL', 'name' => 'ส่วนกลาง', 'description' => '', 'companies' => null, 'usesDeptGroup' => true, 'usesPosition' => false, 'dailyCycle' => false, 'tone' => 'primary', 'sortOrder' => 10),
        array('code' => 'PRO_SITE', 'name' => 'Pro Site', 'description' => '', 'companies' => array('PRO'), 'usesDeptGroup' => false, 'usesPosition' => true, 'dailyCycle' => false, 'tone' => 'info', 'sortOrder' => 20),
        array('code' => 'DAILY', 'name' => 'รายวัน', 'description' => '', 'companies' => null, 'usesDeptGroup' => false, 'usesPosition' => false, 'dailyCycle' => true, 'tone' => 'warning', 'sortOrder' => 30),
        array('code' => 'MAID_CNS', 'name' => 'แม่บ้าน CNS', 'description' => '', 'companies' => null, 'usesDeptGroup' => false, 'usesPosition' => false, 'dailyCycle' => false, 'tone' => 'neutral', 'sortOrder' => 40),
    );
}

function org_cache_reset() { unset($GLOBALS['hlw_org_cache']); }

/** ประเภทพนักงานทั้งหมด เรียงตามลำดับ */
function employee_types_all()
{
    if (!isset($GLOBALS['hlw_org_cache']['types'])) {
        $GLOBALS['hlw_org_cache']['types'] = (function_exists('repo_employee_types') && db_table_exists('employee_types'))
            ? repo_employee_types() : default_employee_types();
    }
    return $GLOBALS['hlw_org_cache']['types'];
}

function employee_type_codes()
{
    $out = array();
    foreach (employee_types_all() as $t) { $out[] = $t['code']; }
    return $out;
}

/** พฤติกรรมของประเภท · ไม่รู้จัก = null */
function employee_type_info($code)
{
    foreach (employee_types_all() as $t) { if ($t['code'] === $code) { return $t; } }
    return null;
}

/** ประเภทนี้ใช้กับบริษัทนี้ได้ไหม */
function employee_type_allows($type, $company)
{
    return $type !== null && ($type['companies'] === null || in_array($company, $type['companies'], true));
}

function company_codes()
{
    if (!isset($GLOBALS['hlw_org_cache']['companies'])) {
        $out = array();
        foreach (db_all('SELECT code FROM companies ORDER BY sort_order, code') as $r) { $out[] = $r['code']; }
        $GLOBALS['hlw_org_cache']['companies'] = $out;
    }
    return $GLOBALS['hlw_org_cache']['companies'];
}

function label_employee_type($t)
{
    $info = employee_type_info($t);
    return $info ? $info['name'] : null;
}

/** 2026-11-05 → "5 พ.ย. 69" (คู่กับ thaiDate ใน web/assets/js/shared/format.js) */
function thai_date_short($d)
{
    if (!$d) { return '–'; }
    $m = array('ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.');
    $p = explode('-', $d);
    return (int)$p[2] . ' ' . $m[(int)$p[1] - 1] . ' ' . substr((string)((int)$p[0] + 543), -2);
}

function label_end_reason($r)
{
    $m = array('RESIGN' => 'ลาออก', 'ABSENT_3D' => 'ขาดงาน 3 วันติด', 'TERMINATED' => 'เลิกจ้าง', 'MISCONDUCT' => 'กระทำผิด');
    return isset($m[$r]) ? $m[$r] : null;
}

function label_batch_type($t)
{
    $m = array('IN' => 'แจ้งเข้า', 'OUT' => 'แจ้งออก', 'URGENT' => 'แจ้งออกทันที');
    return isset($m[$t]) ? $m[$t] : $t;
}

function label_uniform_event($e)
{
    $m = array('START' => 'เริ่มงาน', 'PROBATION' => 'ผ่านทดลองงาน', 'ANNUAL' => 'ประจำปี');
    return isset($m[$e]) ? $m[$e] : $e;
}
