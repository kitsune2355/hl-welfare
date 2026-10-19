<?php
/* ============================================================
 *  backend/domain/insurance.php — คู่แฝดของ web/assets/js/domain/insurance.js
 *  สิทธิประกันกลุ่มของพนักงาน 1 คน (แปลงบรรทัดต่อบรรทัด — แก้ที่หนึ่งต้องแก้อีกที่)
 * ============================================================ */

/** วันที่รอบแจ้งประกันของพนักงาน — รายวันส่งแยกทุกวันที่ 6 (ตั้งค่าได้) · ประเภทอื่นทุกวันที่ 5 */
function cycle_day_of($emp, $settings)
{
    if ($emp['employeeType'] === 'DAILY') {
        return isset($settings['insuranceCycleDayDaily']) && $settings['insuranceCycleDayDaily'] !== null
            ? $settings['insuranceCycleDayDaily'] : $settings['insuranceCycleDay'];
    }
    return $settings['insuranceCycleDay'];
}

/** วันที่ของรอบทั้งหมดในเดือน เช่น [5, 6] */
function cycle_days($settings)
{
    $daily = isset($settings['insuranceCycleDayDaily']) && $settings['insuranceCycleDayDaily'] !== null
        ? $settings['insuranceCycleDayDaily'] : $settings['insuranceCycleDay'];
    $days = array_values(array_unique(array($settings['insuranceCycleDay'], $daily)));
    sort($days);
    return $days;
}

/** รอบนี้ (cycleDate) เป็นของพนักงานคนนี้ไหม */
function in_cycle_group($emp, $settings, $cycleDate)
{
    return cycle_day_of($emp, $settings) === (int)substr($cycleDate, 8, 2);
}

function find_insurance_rule($emp, $rules)
{
    foreach ($rules as $r) {
        if ($r['employeeType'] === $emp['employeeType']
            && ($r['companies'] === null || in_array($emp['companyCode'], $r['companies'], true))) {
            return $r;
        }
    }
    return null;
}

/** วันมีผลออกจากประกันกลุ่ม — null ถ้ายังไม่พ้นสภาพ */
function insurance_exit($emp, $settings)
{
    if (!$emp['endReason'] && !$emp['endDate']) { return null; }
    $day = cycle_day_of($emp, $settings);
    switch ($emp['endReason']) {
        case 'TERMINATED':
        case 'MISCONDUCT':
            $exitDate = $emp['endDate'] !== null ? $emp['endDate'] : $emp['lastWorkingDate'];
            if (!$exitDate) { return null; }
            return array('exitDate' => $exitDate, 'exitCycleDate' => $exitDate, 'exitUrgent' => true);
        case 'ABSENT_3D':
            $base = $emp['lastWorkingDate'] !== null ? $emp['lastWorkingDate'] : $emp['endDate'];
            if (!$base) { return null; }
            $exitDate = add_days($base, $settings['absentExtraDays']);
            return array('exitDate' => $exitDate, 'exitCycleDate' => next_cycle_date($exitDate, $day), 'exitUrgent' => false);
        default:
            // RESIGN หรือพ้นสภาพโดยไม่ระบุเหตุผล
            $exitDate = $emp['endDate'] !== null ? $emp['endDate'] : $emp['lastWorkingDate'];
            if (!$exitDate) { return null; }
            return array('exitDate' => $exitDate, 'exitCycleDate' => next_cycle_date($exitDate, $day), 'exitUrgent' => false);
    }
}

function insurance_none($reason, $partial = array())
{
    $r = array(
        'eligible' => false,
        'reasons' => array($reason),
        'eligibleDate' => null,
        'enrollCycleDate' => null,
        'exitDate' => null,
        'exitCycleDate' => null,
        'exitUrgent' => false,
        'ruleId' => null,
    );
    foreach ($partial as $k => $v) { $r[$k] = $v; }
    return $r;
}

function insurance_status($emp, $site, $rules)
{
    $settings = $rules['settings'];
    $rule = find_insurance_rule($emp, $rules['insurance']);
    if (!$rule) { return insurance_none('ประเภทพนักงาน/บริษัทนี้ไม่อยู่ในเงื่อนไขประกันกลุ่ม'); }
    if (in_array($emp['contractType'], $rule['excludeContracts'], true)) {
        return insurance_none('สัญญา 3% ระยะสั้น ไม่ได้รับประกันกลุ่ม', array('ruleId' => $rule['id']));
    }
    if ($rule['requireSiteInsurance'] && !($site && $site['hasGroupInsurance'])) {
        return insurance_none('หน่วยงานนี้ไม่ได้รับประกันกลุ่ม', array('ruleId' => $rule['id']));
    }
    $eligibleDate = add_days($emp['startDate'], $rule['waitDays']);
    $enrollCycleDate = next_cycle_date($eligibleDate, cycle_day_of($emp, $settings));
    $exit = insurance_exit($emp, $settings);
    if ($exit && strcmp($exit['exitDate'], $enrollCycleDate) < 0) {
        return insurance_none('พ้นสภาพก่อนถึงรอบแจ้งเข้า — ไม่ต้องแจ้งเข้า/ออก', array(
            'ruleId' => $rule['id'], 'eligibleDate' => $eligibleDate, 'enrollCycleDate' => $enrollCycleDate));
    }
    if (age_at($emp['birthDate'], $enrollCycleDate) > $settings['insuranceMaxAge']) {
        return insurance_none('อายุเกิน ' . $settings['insuranceMaxAge'] . ' ปี ณ รอบแจ้งเข้า',
            array('ruleId' => $rule['id'], 'eligibleDate' => $eligibleDate));
    }
    return array(
        'eligible' => true,
        'reasons' => array(),
        'eligibleDate' => $eligibleDate,
        'enrollCycleDate' => $enrollCycleDate,
        'exitDate' => $exit ? $exit['exitDate'] : null,
        'exitCycleDate' => $exit ? $exit['exitCycleDate'] : null,
        'exitUrgent' => $exit ? $exit['exitUrgent'] : false,
        'ruleId' => $rule['id'],
    );
}
