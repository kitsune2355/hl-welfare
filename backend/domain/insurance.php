<?php
/* ============================================================
 *  backend/domain/insurance.php — คู่แฝดของ web/assets/js/domain/insurance.js
 *  สิทธิประกันกลุ่มของพนักงาน 1 คน (แปลงบรรทัดต่อบรรทัด — แก้ที่หนึ่งต้องแก้อีกที่)
 * ============================================================ */

/** วันที่รอบแจ้งประกันของพนักงาน — ประเภทที่ตั้ง "รอบรายวัน" ส่งแยกทุกวันที่ 6 (ตั้งค่าได้) · ประเภทอื่นทุกวันที่ 5 */
function cycle_day_of($emp, $settings)
{
    $type = employee_type_info($emp['employeeType']);
    if ($type && $type['dailyCycle']) {
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

/**
 * วันที่อายุครบ N ปี (วันเกิดปีที่ N) — 29 ก.พ. ปีไม่อธิกสุรทินเลื่อนเป็น 1 มี.ค. เหมือนฝั่ง JS
 * คิดจากตัวเลขตรง ๆ ไม่ผ่าน timestamp: PHP 5.2 บน Windows ใช้ timestamp 32 บิต
 * วันเกิดปีที่ 65 ของคนที่เกิดหลังปี 2516 เลยปี 2038 ไปแล้ว gmmktime จะคืนค่าผิด
 */
function birthday_at($birthDate, $years)
{
    $p = explode('-', $birthDate);
    $y = (int)$p[0] + (int)$years;
    $m = (int)$p[1];
    $d = (int)$p[2];
    if ($m === 2 && $d === 29 && !(($y % 4 === 0 && $y % 100 !== 0) || $y % 400 === 0)) { $m = 3; $d = 1; }
    return sprintf('%04d-%02d-%02d', $y, $m, $d);
}

/**
 * วันมีผลออกจากประกันกลุ่ม — null ถ้ายังไม่พ้นสภาพและอายุยังไม่ครบ
 * อายุครบ insuranceMaxAge ระหว่างเป็นสมาชิก → แจ้งออกรอบถัดไป (exitReason = 'AGE')
 * ถ้ามีทั้งพ้นสภาพและอายุครบ ใช้วันที่มาก่อน
 */
function insurance_exit($emp, $settings)
{
    $job = employment_exit($emp, $settings);
    $ageDate = birthday_at($emp['birthDate'], $settings['insuranceMaxAge']);
    if ($job && strcmp($job['exitDate'], $ageDate) <= 0) { return $job; }
    if (!$job && $emp['status'] === 'INACTIVE') { return null; }
    return array('exitDate' => $ageDate, 'exitCycleDate' => next_cycle_date($ageDate, cycle_day_of($emp, $settings)),
                 'exitUrgent' => false, 'exitReason' => 'AGE');
}

/** วันมีผลออกเพราะพ้นสภาพ — null ถ้ายังไม่พ้นสภาพ */
function employment_exit($emp, $settings)
{
    if (!$emp['endReason'] && !$emp['endDate']) { return null; }
    $day = cycle_day_of($emp, $settings);
    switch ($emp['endReason']) {
        case 'TERMINATED':
        case 'MISCONDUCT':
            $exitDate = $emp['endDate'] !== null ? $emp['endDate'] : $emp['lastWorkingDate'];
            if (!$exitDate) { return null; }
            return array('exitDate' => $exitDate, 'exitCycleDate' => $exitDate, 'exitUrgent' => true,
                         'exitReason' => $emp['endReason']);
        case 'ABSENT_3D':
            $base = $emp['lastWorkingDate'] !== null ? $emp['lastWorkingDate'] : $emp['endDate'];
            if (!$base) { return null; }
            $exitDate = add_days($base, $settings['absentExtraDays']);
            return array('exitDate' => $exitDate, 'exitCycleDate' => next_cycle_date($exitDate, $day), 'exitUrgent' => false,
                         'exitReason' => $emp['endReason']);
        default:
            // RESIGN หรือพ้นสภาพโดยไม่ระบุเหตุผล
            $exitDate = $emp['endDate'] !== null ? $emp['endDate'] : $emp['lastWorkingDate'];
            if (!$exitDate) { return null; }
            return array('exitDate' => $exitDate, 'exitCycleDate' => next_cycle_date($exitDate, $day), 'exitUrgent' => false,
                         'exitReason' => $emp['endReason'] ? $emp['endReason'] : null);
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
        'exitReason' => null,
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
    // นับวันเริ่มงานเป็นวันที่ 1 — ทำงานครบ 30 วันในวันเริ่มงาน + 29 · ได้สิทธิจริงวันถัดไป (HR: 30 + 1) = วันเริ่มงาน + 30
    $eligibleDate = add_days($emp['startDate'], $rule['waitDays']);
    $enrollCycleDate = next_cycle_date($eligibleDate, cycle_day_of($emp, $settings));
    if (strcmp(birthday_at($emp['birthDate'], $settings['insuranceMaxAge']), $enrollCycleDate) <= 0) {
        return insurance_none('อายุครบ ' . $settings['insuranceMaxAge'] . ' ปีก่อนถึงรอบแจ้งเข้า',
            array('ruleId' => $rule['id'], 'eligibleDate' => $eligibleDate));
    }
    $exit = insurance_exit($emp, $settings);
    if ($exit && strcmp($exit['exitDate'], $enrollCycleDate) < 0) {
        return insurance_none('พ้นสภาพก่อนถึงรอบแจ้งเข้า — ไม่ต้องแจ้งเข้า/ออก', array(
            'ruleId' => $rule['id'], 'eligibleDate' => $eligibleDate, 'enrollCycleDate' => $enrollCycleDate));
    }
    return array(
        'eligible' => true,
        'reasons' => array(),
        'eligibleDate' => $eligibleDate,
        'enrollCycleDate' => $enrollCycleDate,
        'exitDate' => $exit ? $exit['exitDate'] : null,
        'exitCycleDate' => $exit ? $exit['exitCycleDate'] : null,
        'exitUrgent' => $exit ? $exit['exitUrgent'] : false,
        'exitReason' => $exit ? $exit['exitReason'] : null,
        'ruleId' => $rule['id'],
    );
}
