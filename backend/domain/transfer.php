<?php
/* ============================================================
 *  backend/domain/transfer.php — คู่แฝดของ web/assets/js/domain/transfer.js
 *  โอนย้ายพนักงาน: ประวัติสังกัด + วันที่มีผล (แปลงบรรทัดต่อบรรทัด — แก้ที่หนึ่งต้องแก้อีกที่)
 * ============================================================ */

/** ฟิลด์สังกัดที่การย้ายเปลี่ยนได้ */
function assignment_fields()
{
    return array('companyCode', 'siteId', 'employeeType', 'deptGroup', 'position', 'level');
}

/** สังกัดปัจจุบันของพนักงาน */
function assignment_of($emp)
{
    $out = array();
    foreach (assignment_fields() as $k) { $out[$k] = isset($emp[$k]) ? $emp[$k] : null; }
    return $out;
}

/** ฟิลด์ที่ต่างกันระหว่างสังกัดเดิมกับใหม่ */
function assignment_changes($from, $to)
{
    $out = array();
    foreach (assignment_fields() as $k) {
        $a = isset($from[$k]) ? $from[$k] : null;
        $b = isset($to[$k]) ? $to[$k] : null;
        if ($a !== $b) { $out[] = $k; }
    }
    return $out;
}

/** วันเริ่มนับวันรอสิทธิ์ — ย้ายแบบ "นับใหม่" แล้ว = วันที่ย้าย · ไม่เคย = วันเริ่มงาน */
function wait_start_date($emp)
{
    return !empty($emp['benefitStartDate']) ? $emp['benefitStartDate'] : $emp['startDate'];
}

function __cmp_transfer_date($a, $b)
{
    $c = strcmp($a['effectiveDate'], $b['effectiveDate']);
    return $c !== 0 ? $c : $a['id'] - $b['id'];
}

/**
 * ตรวจคำขอย้าย (ก่อนตรวจกับข้อมูลองค์กร — หน่วยงานตรงบริษัท / ปิดใช้งาน / ระดับตามประเภท ตรวจที่ API ด้วย validate_employee)
 * คืน array(ช่อง => ข้อความ) — ว่าง = ผ่าน
 */
function validate_transfer($input, $emp, $transfers)
{
    $errors = array();
    $d = $input['effectiveDate'];
    if ($emp['status'] !== 'ACTIVE') {
        $errors['effectiveDate'] = 'พนักงานพ้นสภาพแล้ว — โอนย้ายไม่ได้';
    } elseif (!$d || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
        $errors['effectiveDate'] = 'กรุณาระบุวันที่มีผล';
    } elseif (strcmp($d, $emp['startDate']) <= 0) {
        $errors['effectiveDate'] = 'วันที่มีผลต้องหลังวันเริ่มงาน';
    } else {
        $last = null;
        $pending = false;
        foreach ($transfers as $t) {
            if ($t['status'] === 'APPLIED' && ($last === null || __cmp_transfer_date($t, $last) > 0)) { $last = $t; }
            if ($t['status'] === 'PENDING') { $pending = true; }
        }
        if ($last && strcmp($d, $last['effectiveDate']) <= 0) {
            $errors['effectiveDate'] = 'วันที่มีผลต้องหลังการย้ายครั้งล่าสุด';
        } elseif ($pending) {
            $errors['effectiveDate'] = 'มีการย้ายที่รอมีผลอยู่แล้ว — ยกเลิกรายการเดิมก่อน';
        }
    }
    $to = $input['to'];
    if (!$to['companyCode']) { $errors['companyCode'] = 'กรุณาเลือกบริษัท'; }
    if (!$to['siteId']) { $errors['siteId'] = 'กรุณาเลือกหน่วยงาน'; }
    if (!$to['employeeType']) { $errors['employeeType'] = 'กรุณาเลือกประเภทพนักงาน'; }
    if (!count($errors) && !count(assignment_changes(assignment_of($emp), $to))) { $errors['siteId'] = 'สังกัดใหม่เหมือนเดิม — ไม่มีอะไรเปลี่ยน'; }
    return $errors;
}
