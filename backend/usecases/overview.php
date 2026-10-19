<?php
/* ============================================================
 *  backend/usecases/overview.php — คู่แฝดของ
 *    application/usecases/uniformPending.js (buildUniformPending)
 *    application/usecases/dashboard.js      (buildDashboard)
 *    application/usecases/workQueue.js      (buildWorkQueue)
 * ============================================================ */

function __cmp_due($a, $b) { return str_cmp($a['dueDate'], $b['dueDate']); }
function __cmp_date($a, $b) { return str_cmp($a['date'], $b['date']); }

/** ชุดฟอร์มที่ถึงกำหนดแต่ยังไม่แจกและยังไม่ได้ส่งเบิก (เฉพาะพนักงานที่ทำงานอยู่) */
function build_uniform_pending($employees, $sites, $rules, $issues, $today)
{
    $siteById = by_key($sites, 'id');
    $rows = array();
    foreach ($employees as $emp) {
        if ($emp['status'] !== 'ACTIVE') { continue; }
        $st = uniform_status($emp, isset($siteById[$emp['siteId']]) ? $siteById[$emp['siteId']] : null, $rules, $issues, $today);
        foreach ($st['entitlements'] as $e) {
            if ($e['issued'] || $e['requested']) { continue; }
            $rows[] = array(
                'employee' => $emp,
                'entitlementKey' => $e['key'],
                'event' => $e['event'],
                'dueDate' => $e['dueDate'],
                'qtyLabel' => $e['qtyLabel'],
                'style' => $e['style'],
            );
        }
    }
    stable_usort($rows, '__cmp_due');
    return $rows;
}

define('UPCOMING_DAYS', 30);

function build_dashboard($today, $employees, $sites, $rules, $batches, $issues)
{
    $active = array();
    foreach ($employees as $e) {
        if ($e['status'] === 'ACTIVE') { $active[] = $e; }
    }
    $siteById = by_key($sites, 'id');
    $cycles = array();
    foreach (cycle_days($rules['settings']) as $d) { $cycles[] = next_cycle_date($today, $d); }
    $cycleDate = $cycles[0];
    foreach ($cycles as $c) {
        if (strcmp($c, $cycleDate) < 0) { $cycleDate = $c; }
    }
    $pending = array();
    foreach ($cycles as $c) {
        $cy = build_insurance_cycle($c, $employees, $sites, $rules, $batches);
        foreach ($cy['rows'] as $r) {
            if (!$r['submitted']) { $pending[] = $r; }
        }
    }
    $horizon = add_days($today, UPCOMING_DAYS);
    $upcoming = array();
    foreach ($active as $emp) {
        $ins = insurance_status($emp, isset($siteById[$emp['siteId']]) ? $siteById[$emp['siteId']] : null, $rules);
        if ($ins['eligible'] && $ins['eligibleDate'] && strcmp($ins['eligibleDate'], $today) > 0 && strcmp($ins['eligibleDate'], $horizon) <= 0) {
            $upcoming[] = array('employee' => $emp, 'benefit' => 'INSURANCE', 'date' => $ins['eligibleDate']);
        }
    }
    stable_usort($upcoming, '__cmp_date');
    $byCompany = array();
    foreach (company_codes() as $code) {
        $n = 0;
        foreach ($active as $e) {
            if ($e['companyCode'] === $code) { $n++; }
        }
        $byCompany[] = array('companyCode' => $code, 'count' => $n);
    }
    $count = array('IN' => 0, 'OUT' => 0, 'URGENT' => 0);
    foreach ($pending as $r) { $count[$r['type']]++; }
    return array(
        'today' => $today,
        'activeByCompany' => $byCompany,
        'activeTotal' => count($active),
        'nextCycleDate' => $cycleDate,
        'nextCycleIn' => $count['IN'],
        'nextCycleOut' => $count['OUT'],
        'urgentPending' => $count['URGENT'],
        'upcomingEligible' => $upcoming,
        'uniformPending' => count(build_uniform_pending($employees, $sites, $rules, $issues, $today)),
    );
}

define('PROBATION_DAYS', 119);
define('UNIFORM_CRITICAL_DAYS', 30);
define('CYCLE_SOON_DAYS', 7);

function __wq_overdue($due, $today) { return max(0, diff_days($due, $today)); }

function __wq_cycle_severity($due, $today)
{
    if (strcmp($due, $today) < 0) { return 'critical'; }
    return diff_days($today, $due) <= CYCLE_SOON_DAYS ? 'warning' : 'info';
}

function __cmp_task($a, $b)
{
    $rank = array('critical' => 0, 'warning' => 1, 'info' => 2);
    $d = $rank[$a['severity']] - $rank[$b['severity']];
    if ($d !== 0) { return $d; }
    $d = $b['overdueDays'] - $a['overdueDays'];
    if ($d !== 0) { return $d; }
    return str_cmp($a['dueDate'] !== null ? $a['dueDate'] : '9999', $b['dueDate'] !== null ? $b['dueDate'] : '9999');
}

/** คิวงานรวมของ HR — ทุกเรื่องที่ต้องทำ ณ วันนี้ เรียงตามความเร่งด่วน */
function build_work_queue($today, $employees, $sites, $rules, $batches, $issues)
{
    $siteById = by_key($sites, 'id');
    $sent = sent_index($batches);
    $tasks = array();
    foreach ($employees as $e) {
        $st = insurance_status($e, isset($siteById[$e['siteId']]) ? $siteById[$e['siteId']] : null, $rules);
        $cycle = next_cycle_date($today, cycle_day_of($e, $rules['settings']));
        if ($st['eligible'] && $st['enrollCycleDate'] && !isset($sent['IN'][$e['id']]) && strcmp($st['enrollCycleDate'], $cycle) <= 0) {
            $tasks[] = array(
                'id' => 'INSURANCE_IN:' . $e['id'],
                'kind' => 'INSURANCE_IN',
                'severity' => __wq_cycle_severity($st['enrollCycleDate'], $today),
                'employee' => $e,
                'title' => 'แจ้งเข้าประกันกลุ่ม',
                'detail' => strcmp($st['enrollCycleDate'], $cycle) < 0 ? 'ตกค้างจากรอบก่อน' : 'รอบถัดไป',
                'dueDate' => $st['enrollCycleDate'],
                'overdueDays' => __wq_overdue($st['enrollCycleDate'], $today),
            );
        }
        if ($st['eligible'] && $st['exitDate'] && $st['exitCycleDate'] && !isset($sent['OUT'][$e['id']])) {
            $reason = $e['endReason'] ? label_end_reason($e['endReason']) : 'พ้นสภาพ';
            if ($st['exitUrgent']) {
                $tasks[] = array(
                    'id' => 'INSURANCE_URGENT:' . $e['id'],
                    'kind' => 'INSURANCE_URGENT',
                    'severity' => 'critical',
                    'employee' => $e,
                    'title' => 'แจ้งออกประกันทันที',
                    'detail' => $reason,
                    'dueDate' => $st['exitDate'],
                    'overdueDays' => __wq_overdue($st['exitDate'], $today),
                );
            } elseif (strcmp($st['exitCycleDate'], $cycle) <= 0) {
                $tasks[] = array(
                    'id' => 'INSURANCE_OUT:' . $e['id'],
                    'kind' => 'INSURANCE_OUT',
                    'severity' => __wq_cycle_severity($st['exitCycleDate'], $today),
                    'employee' => $e,
                    'title' => 'แจ้งออกประกันกลุ่ม',
                    'detail' => $reason,
                    'dueDate' => $st['exitCycleDate'],
                    'overdueDays' => __wq_overdue($st['exitCycleDate'], $today),
                );
            }
        }
        if ($e['status'] !== 'ACTIVE') { continue; }
        $passDue = add_days($e['startDate'], PROBATION_DAYS);
        if (!$e['probationPassDate'] && strcmp($passDue, $today) < 0) {
            $tasks[] = array(
                'id' => 'PROBATION_MISSING:' . $e['id'],
                'kind' => 'PROBATION_MISSING',
                'severity' => 'warning',
                'employee' => $e,
                'title' => 'ยังไม่บันทึกวันผ่านทดลองงาน',
                'detail' => 'ครบ ' . PROBATION_DAYS . ' วันแล้ว — มีผลกับสิทธิชุดฟอร์ม',
                'dueDate' => $passDue,
                'overdueDays' => __wq_overdue($passDue, $today),
            );
        }
        $covered = false;
        foreach ($rules['uniform'] as $r) {
            if ($r['employeeType'] === $e['employeeType']) { $covered = true; }
        }
        if ($covered && !match_uniform_rule($e, $rules['uniform'])) {
            $tasks[] = array(
                'id' => 'UNIFORM_RULE_MISSING:' . $e['id'],
                'kind' => 'UNIFORM_RULE_MISSING',
                'severity' => 'info',
                'employee' => $e,
                'title' => 'ไม่พบกฎชุดฟอร์ม',
                'detail' => 'บริษัท/กลุ่ม/ระดับนี้ยังไม่มีในเงื่อนไข — รอ HR ยืนยัน',
                'dueDate' => null,
                'overdueDays' => 0,
            );
        }
    }
    foreach (build_uniform_pending($employees, $sites, $rules, $issues, $today) as $p) {
        $days = __wq_overdue($p['dueDate'], $today);
        $tasks[] = array(
            'id' => 'UNIFORM_ISSUE:' . $p['employee']['id'] . ':' . $p['entitlementKey'],
            'kind' => 'UNIFORM_ISSUE',
            'severity' => $days > UNIFORM_CRITICAL_DAYS ? 'critical' : 'warning',
            'employee' => $p['employee'],
            'title' => 'แจกชุดฟอร์ม (' . label_uniform_event($p['event']) . ')',
            'detail' => $p['qtyLabel'] . ' ตัว · ' . $p['style'],
            'dueDate' => $p['dueDate'],
            'overdueDays' => $days,
        );
    }
    stable_usort($tasks, '__cmp_task');
    return $tasks;
}
