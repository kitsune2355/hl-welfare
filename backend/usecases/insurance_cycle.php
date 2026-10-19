<?php
/* ============================================================
 *  backend/usecases/insurance_cycle.php — คู่แฝดของ application/usecases/insuranceCycle.js
 *  batch = array(id, cycleDate, insurerId, insurerName, items: [{employeeId, type}], submittedAt, submittedBy)
 * ============================================================ */

function direction_of($t)
{
    return $t === 'IN' ? 'IN' : 'OUT';
}

function batch_ids($b)
{
    $ids = array();
    foreach ($b['items'] as $i) {
        if (!in_array($i['employeeId'], $ids, true)) { $ids[] = $i['employeeId']; }
    }
    return $ids;
}

function batch_counts($b)
{
    $c = array('in' => 0, 'out' => 0, 'urgent' => 0, 'total' => count($b['items']));
    foreach ($b['items'] as $i) {
        if ($i['type'] === 'IN') { $c['in']++; }
        elseif ($i['type'] === 'OUT') { $c['out']++; }
        elseif ($i['type'] === 'URGENT') { $c['urgent']++; }
    }
    return $c;
}

/** employeeId → batch ที่แจ้งไปแล้ว แยกตามทิศทาง (URGENT นับเป็น OUT) — batch หลังทับ batch ก่อน (เหมือน Map.set) */
function sent_index($batches)
{
    $idx = array('IN' => array(), 'OUT' => array());
    foreach ($batches as $b) {
        foreach ($b['items'] as $it) { $idx[direction_of($it['type'])][$it['employeeId']] = $b; }
    }
    return $idx;
}

function __cmp_effective($a, $b) { return str_cmp($a['effectiveDate'], $b['effectiveDate']); }

/** รายการแจ้งประกันของรอบ cycleDate */
function build_insurance_cycle($cycleDate, $employees, $sites, $rules, $batches)
{
    $sent = sent_index($batches);
    $siteById = by_key($sites, 'id');
    $rows = array();
    foreach ($employees as $emp) {
        if (!in_cycle_group($emp, $rules['settings'], $cycleDate)) { continue; }
        $st = insurance_status($emp, isset($siteById[$emp['siteId']]) ? $siteById[$emp['siteId']] : null, $rules);
        if (!$st['eligible'] || !$st['enrollCycleDate']) { continue; }
        $inBatch = isset($sent['IN'][$emp['id']]) ? $sent['IN'][$emp['id']] : null;
        if ($inBatch ? $inBatch['cycleDate'] === $cycleDate : strcmp($st['enrollCycleDate'], $cycleDate) <= 0) {
            $rule = find_by($rules['insurance'], 'id', $st['ruleId']);
            $rows[] = array(
                'employee' => $emp,
                'type' => 'IN',
                'effectiveDate' => $st['eligibleDate'] !== null ? $st['eligibleDate'] : $st['enrollCycleDate'],
                'reason' => 'ครบอายุงาน ' . ($rule ? $rule['waitDays'] : '') . ' วัน',
                'submitted' => $inBatch !== null,
            );
        }
        if (!$st['exitDate'] || !$st['exitCycleDate']) { continue; }
        $outBatch = isset($sent['OUT'][$emp['id']]) ? $sent['OUT'][$emp['id']] : null;
        $type = $st['exitUrgent'] ? 'URGENT' : 'OUT';
        $show = $outBatch ? $outBatch['cycleDate'] === $cycleDate : ($st['exitUrgent'] || strcmp($st['exitCycleDate'], $cycleDate) <= 0);
        if ($show) {
            $rows[] = array(
                'employee' => $emp,
                'type' => $type,
                'effectiveDate' => $st['exitDate'],
                'reason' => $emp['endReason'] ? label_end_reason($emp['endReason']) : 'พ้นสภาพ',
                'submitted' => $outBatch !== null,
            );
        }
    }
    stable_usort($rows, '__cmp_effective');
    return array('cycleDate' => $cycleDate, 'rows' => $rows);
}

/** ข้อมูลพนักงานแบบย่อ */
function employee_lite($e)
{
    return array(
        'id' => $e['id'], 'empCode' => $e['empCode'], 'firstName' => $e['firstName'], 'lastName' => $e['lastName'],
        'companyCode' => $e['companyCode'], 'employeeType' => $e['employeeType'], 'siteId' => $e['siteId'], 'status' => $e['status'],
    );
}

function __cmp_batch_item($a, $b)
{
    $order = array('URGENT' => 0, 'IN' => 1, 'OUT' => 2);
    $d = $order[$a['type']] - $order[$b['type']];
    return $d !== 0 ? $d : str_cmp($a['employee']['empCode'], $b['employee']['empCode']);
}

/** รายละเอียด batch ที่ส่งแจ้งแล้ว */
function build_batch_detail($batch, $employees, $sites, $rules, $batches)
{
    $cycle = build_insurance_cycle($batch['cycleDate'], $employees, $sites, $rules, $batches);
    $rowOf = array();
    foreach ($cycle['rows'] as $r) { $rowOf[$r['employee']['id'] . '|' . direction_of($r['type'])] = $r; }
    $empById = by_key($employees, 'id');
    $siteById = by_key($sites, 'id');
    $items = array();
    foreach ($batch['items'] as $it) {
        $id = $it['employeeId'];
        $emp = isset($empById[$id]) ? $empById[$id] : null;
        $k = $id . '|' . direction_of($it['type']);
        $row = isset($rowOf[$k]) ? $rowOf[$k] : null;
        $items[] = array(
            'type' => $it['type'],
            'employee' => $emp ? employee_lite($emp)
                : array('id' => $id, 'empCode' => '#' . $id, 'firstName' => '(ไม่พบข้อมูลพนักงาน)', 'lastName' => ''),
            'siteName' => $emp ? (isset($siteById[$emp['siteId']]) ? $siteById[$emp['siteId']]['name'] : '') : '',
            'effectiveDate' => $row ? $row['effectiveDate'] : null,
            'reason' => $row ? $row['reason'] : '',
        );
    }
    stable_usort($items, '__cmp_batch_item');
    $out = $batch;
    $out['items'] = $items;
    return $out;
}
