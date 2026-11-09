<?php
/* ============================================================
 *  backend/usecases/insurance_cycle.php — คู่แฝดของ application/usecases/insuranceCycle.js
 *  batch = array(id, cycleDate, insurerId, insurerName, items: [{employeeId, type}], submittedAt, submittedBy)
 * ============================================================ */

/** ทิศทางของรายการ: URGENT นับเป็น OUT · CHANGE = แจ้งเปลี่ยนแปลง */
function direction_of($t)
{
    return $t === 'IN' ? 'IN' : ($t === 'CHANGE' ? 'CHANGE' : 'OUT');
}

/** คีย์จับคู่รายการกับที่ส่งแล้ว: พนักงาน + การเปลี่ยนแปลงที่ทำให้เกิดรายการ (0 = แจ้งเข้าครั้งแรก / ออกตอนพ้นสภาพ) */
function sent_key($employeeId, $ref = 0)
{
    return $employeeId . '|' . ($ref ? (int)$ref : 0);
}

function item_change_id($it)
{
    return isset($it['changeId']) ? (int)$it['changeId'] : 0;
}

/** employeeId → การเปลี่ยนแปลงของคนนั้น */
function group_changes($changes)
{
    $m = array();
    foreach ($changes as $c) { $m[$c['employeeId']][] = $c; }
    return $m;
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
    $c = array('in' => 0, 'out' => 0, 'urgent' => 0, 'change' => 0, 'total' => count($b['items']));
    foreach ($b['items'] as $i) {
        if ($i['type'] === 'IN') { $c['in']++; }
        elseif ($i['type'] === 'OUT') { $c['out']++; }
        elseif ($i['type'] === 'URGENT') { $c['urgent']++; }
        elseif ($i['type'] === 'CHANGE') { $c['change']++; }
    }
    return $c;
}

/**
 * employeeId → batch ที่แจ้งไปแล้ว แยกตามทิศทาง (URGENT นับเป็น OUT) — batch หลังทับ batch ก่อน (เหมือน Map.set)
 * ส่ง employees มาด้วย = นับเฉพาะการแจ้งของการจ้างงานรอบปัจจุบัน (รอบส่ง >= วันเริ่มงาน)
 * พนักงานที่ขาดงานแล้วกลับมาทำงาน HR ตั้งวันเริ่มงานใหม่ → ต้องแจ้งเข้าใหม่ได้ ประวัติเดิมยังอยู่
 */
function sent_index($batches, $employees = null)
{
    $startOf = null;
    if ($employees !== null) {
        $startOf = array();
        foreach ($employees as $e) { $startOf[$e['id']] = $e['startDate']; }
    }
    $idx = array('IN' => array(), 'OUT' => array(), 'CHANGE' => array());
    foreach ($batches as $b) {
        foreach ($b['items'] as $it) {
            if ($startOf !== null && isset($startOf[$it['employeeId']])
                && strcmp($b['cycleDate'], $startOf[$it['employeeId']]) < 0) { continue; }
            $idx[direction_of($it['type'])][sent_key($it['employeeId'], item_change_id($it))] = $b;
        }
    }
    return $idx;
}

/** เหตุผลของแถวแจ้งออกตอนพ้นสภาพ — อายุครบ / เหตุผลพ้นสภาพ */
function insurance_exit_reason_text($emp, $st, $settings)
{
    if ($st['exitReason'] === 'AGE') { return 'อายุครบ ' . $settings['insuranceMaxAge'] . ' ปี'; }
    return $emp['endReason'] ? label_end_reason($emp['endReason']) : 'พ้นสภาพ';
}

function __cmp_effective($a, $b) { return str_cmp($a['effectiveDate'], $b['effectiveDate']); }

/**
 * รายการแจ้งประกันของรอบ cycleDate (changes = ประวัติโอนย้าย / เปลี่ยนรหัส — domain/insurance_events.php)
 * แถวที่เกิดจากการเปลี่ยนแปลงมี ref · employee ของแถว = ข้อมูล ณ ช่วงนั้น
 */
function build_insurance_cycle($cycleDate, $employees, $sites, $rules, $batches, $changes = array())
{
    $sent = sent_index($batches, $employees);
    $siteById = by_key($sites, 'id');
    $changesOf = group_changes($changes);
    $rows = array();
    foreach ($employees as $emp) {
        $mine = isset($changesOf[$emp['id']]) ? $changesOf[$emp['id']] : array();
        foreach (insurance_events($emp, $siteById, $rules, $mine) as $ev) {
            if (!in_cycle_group($ev['view'], $rules['settings'], $cycleDate)) { continue; }
            $k = sent_key($emp['id'], $ev['ref']);
            $dir = direction_of($ev['type']);
            $b = isset($sent[$dir][$k]) ? $sent[$dir][$k] : null;
            $show = $b ? $b['cycleDate'] === $cycleDate : ($ev['urgent'] || strcmp($ev['cycleDate'], $cycleDate) <= 0);
            if (!$show) { continue; }
            $row = array(
                'employee' => $ev['view'],
                'type' => $ev['type'],
                'effectiveDate' => $ev['effectiveDate'],
                'reason' => $ev['reason'] !== null ? $ev['reason'] : insurance_exit_reason_text($emp, $ev['exit'], $rules['settings']),
                'submitted' => $b !== null,
            );
            if ($ev['ref']) { $row['ref'] = $ev['ref']; }
            $rows[] = $row;
        }
    }
    stable_usort($rows, '__cmp_effective');
    return array('cycleDate' => $cycleDate, 'rows' => $rows);
}

/** คีย์ของแถวในรอบ / รายการใน batch (จับคู่กัน) */
function cycle_row_key($r)
{
    return sent_key($r['employee']['id'], isset($r['ref']) ? $r['ref'] : 0) . '|' . direction_of($r['type']);
}

function batch_item_key($it)
{
    return sent_key($it['employeeId'], item_change_id($it)) . '|' . direction_of($it['type']);
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
    $order = array('URGENT' => 0, 'IN' => 1, 'OUT' => 2, 'CHANGE' => 3);
    $d = $order[$a['type']] - $order[$b['type']];
    return $d !== 0 ? $d : str_cmp($a['employee']['empCode'], $b['employee']['empCode']);
}

/** รายละเอียด batch ที่ส่งแจ้งแล้ว */
function build_batch_detail($batch, $employees, $sites, $rules, $batches, $changes = array())
{
    $cycle = build_insurance_cycle($batch['cycleDate'], $employees, $sites, $rules, $batches, $changes);
    $rowOf = array();
    foreach ($cycle['rows'] as $r) { $rowOf[cycle_row_key($r)] = $r; }
    $empById = by_key($employees, 'id');
    $siteById = by_key($sites, 'id');
    $items = array();
    foreach ($batch['items'] as $it) {
        $id = $it['employeeId'];
        $k = batch_item_key($it);
        $row = isset($rowOf[$k]) ? $rowOf[$k] : null;
        $emp = $row ? $row['employee'] : (isset($empById[$id]) ? $empById[$id] : null);   // แจ้งออกจากที่เดิม = ข้อมูลเดิม
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
