<?php
/* ============================================================
 *  backend/domain/insurance_events.php — คู่แฝดของ web/assets/js/domain/insuranceEvents.js
 *  รายการแจ้งประกันกลุ่มของพนักงาน 1 คน เมื่อมีโอนย้าย / เปลี่ยนรหัส (ดูคำอธิบายกฎในไฟล์ JS)
 *  change = array(id, employeeId, kind, effectiveDate, from: {companyCode, siteId, employeeType, empCode}, to: {...}, notifyInsurer, note)
 * ============================================================ */

function change_fields()
{
    return array('companyCode', 'siteId', 'employeeType', 'empCode');
}

/** ย้ายบริษัท / หน่วยงาน / ประเภท (ไม่ใช่แค่เปลี่ยนรหัส) */
function change_is_transfer($c)
{
    return $c['from']['companyCode'] !== $c['to']['companyCode'] || $c['from']['siteId'] !== $c['to']['siteId']
        || $c['from']['employeeType'] !== $c['to']['employeeType'];
}

function __cmp_change($a, $b)
{
    $d = strcmp($a['effectiveDate'], $b['effectiveDate']);
    return $d !== 0 ? $d : $a['id'] - $b['id'];
}

/** การเปลี่ยนแปลงของการจ้างงานรอบนี้: หลังวันเริ่มงาน · ไม่เกินวันพ้นสภาพ · เรียงตามวันที่มีผล */
function active_changes($emp, $changes)
{
    $out = array();
    foreach ($changes as $c) {
        if ($c['employeeId'] !== $emp['id'] || strcmp($c['effectiveDate'], $emp['startDate']) <= 0) { continue; }
        if ($emp['endDate'] && strcmp($c['effectiveDate'], $emp['endDate']) > 0) { continue; }
        $out[] = $c;
    }
    stable_usort($out, '__cmp_change');
    return $out;
}

function __change_view($emp, $fields)
{
    foreach (change_fields() as $k) { $emp[$k] = $fields[$k]; }
    return $emp;
}

function __place_of($view, $siteById)
{
    $name = isset($siteById[$view['siteId']]) ? $siteById[$view['siteId']]['name'] : 'หน่วยงาน #' . $view['siteId'];
    return $name . ' (' . $view['companyCode'] . ')';
}

/** รายการแจ้งของพนักงาน 1 คน: array(ref, type, view, effectiveDate, cycleDate, urgent, reason, exit?) */
function insurance_events($emp, $siteById, $rules, $changes)
{
    $settings = $rules['settings'];
    $list = active_changes($emp, $changes);
    $views = array(count($list) ? __change_view($emp, $list[0]['from']) : $emp);
    foreach ($list as $c) { $views[] = __change_view($emp, $c['to']); }
    $st = array();
    foreach ($views as $v) { $st[] = insurance_status($v, isset($siteById[$v['siteId']]) ? $siteById[$v['siteId']] : null, $rules); }
    $events = array();
    $covered = false;
    $n = count($views);
    for ($i = 0; $i < $n; $i++) {
        $view = $views[$i];
        $s = $st[$i];
        $c = $i > 0 ? $list[$i - 1] : null;
        if ($c) {
            $d = $c['effectiveDate'];
            if (change_is_transfer($c)) {
                if ($covered && (!$s['eligible'] || $c['notifyInsurer'])) {
                    $prev = $views[$i - 1];
                    $eff = add_days($d, -1);
                    $events[] = array('ref' => $c['id'], 'type' => 'OUT', 'view' => $prev, 'effectiveDate' => $eff,
                        'cycleDate' => next_cycle_date($eff, cycle_day_of($prev, $settings)), 'urgent' => false,
                        'reason' => $s['eligible'] ? 'โอนย้ายไป ' . __place_of($view, $siteById)
                            : 'ย้ายไป ' . __place_of($view, $siteById) . ' — ไม่ได้รับประกันกลุ่ม');
                    $covered = false;
                }
            } elseif ($covered && $c['notifyInsurer']) {
                $events[] = array('ref' => $c['id'], 'type' => 'CHANGE', 'view' => $view, 'effectiveDate' => $d,
                    'cycleDate' => next_cycle_date($d, cycle_day_of($view, $settings)), 'urgent' => false,
                    'reason' => 'เปลี่ยนรหัสพนักงาน ' . $c['from']['empCode'] . ' → ' . $c['to']['empCode']);
            }
        }
        if ($covered || !$s['eligible'] || !$s['enrollCycleDate']) { continue; }
        $start = $i === 0 ? $emp['startDate'] : $c['effectiveDate'];
        $end = $i < count($list) ? add_days($list[$i]['effectiveDate'], -1) : null;
        $eligible = $s['eligibleDate'] !== null ? $s['eligibleDate'] : $s['enrollCycleDate'];
        $from = strcmp($eligible, $start) > 0 ? $eligible : $start;
        if ($end !== null && strcmp($from, $end) > 0) { continue; }   // ย้ายออกก่อนครบอายุงาน — ไปนับในช่วงถัดไป
        $byMove = $from === $start && $i > 0 && $from !== $eligible;
        $rule = find_by($rules['insurance'], 'id', $s['ruleId']);
        $events[] = array(
            'ref' => $byMove ? $c['id'] : 0,
            'type' => 'IN',
            'view' => $view,
            'effectiveDate' => $from,
            'cycleDate' => $from === $eligible ? $s['enrollCycleDate'] : next_cycle_date($from, cycle_day_of($view, $settings)),
            'urgent' => false,
            'reason' => $byMove ? 'โอนย้ายจาก ' . __place_of($views[$i - 1], $siteById) : 'ครบอายุงาน ' . ($rule ? $rule['waitDays'] : '') . ' วัน',
        );
        $covered = true;
    }
    $last = $st[$n - 1];
    if ($covered && $last['exitDate'] && $last['exitCycleDate']) {
        $events[] = array('ref' => 0, 'type' => $last['exitUrgent'] ? 'URGENT' : 'OUT', 'view' => $views[$n - 1],
            'effectiveDate' => $last['exitDate'], 'cycleDate' => $last['exitCycleDate'], 'urgent' => $last['exitUrgent'],
            'reason' => null, 'exit' => $last);
    }
    return $events;
}
