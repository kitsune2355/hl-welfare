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
