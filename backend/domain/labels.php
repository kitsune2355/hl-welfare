<?php
/* ============================================================
 *  backend/domain/labels.php — คู่แฝดของ web/assets/js/domain/labels.js
 * ============================================================ */

function company_codes()
{
    return array('HL', 'PRO', 'CNS', 'CIC', 'AS');
}

function label_employee_type($t)
{
    $m = array('CENTRAL' => 'ส่วนกลาง', 'PRO_SITE' => 'Pro Site', 'DAILY' => 'รายวัน', 'MAID_CNS' => 'แม่บ้าน CNS');
    return isset($m[$t]) ? $m[$t] : null;
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
