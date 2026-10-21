<?php
/* ============================================================
 *  backend/domain/uniform.php — คู่แฝดของ web/assets/js/domain/uniform.js
 *  สิทธิชุดฟอร์มของพนักงาน 1 คน (แปลงบรรทัดต่อบรรทัด)
 * ============================================================ */

define('OTHER_POSITION', 'ตำแหน่งอื่นๆ');
define('ANNUAL_LOOKBACK_YEARS', 3);

/** rule.position เก็บได้หลายตำแหน่งคั่นด้วย "," */
function uniform_positions_of($rule)
{
    if ($rule['position'] === null) { return array(); }
    $out = array();
    foreach (explode(',', $rule['position']) as $p) { $out[] = trim($p); }
    return $out;
}

function match_uniform_rule($emp, $rules)
{
    $candidates = array();
    foreach ($rules as $r) {
        if ($r['employeeType'] === $emp['employeeType']
            && in_array($emp['companyCode'], $r['companies'], true)
            && ($r['deptGroups'] === null || ($emp['deptGroup'] !== null && in_array($emp['deptGroup'], $r['deptGroups'], true)))
            && ($r['levelMin'] === null || ($emp['level'] !== null && $emp['level'] >= $r['levelMin']))
            && ($r['levelMax'] === null || ($emp['level'] !== null && $emp['level'] <= $r['levelMax']))) {
            $candidates[] = $r;
        }
    }
    foreach ($candidates as $r) {
        if ($emp['position'] !== null && in_array($emp['position'], uniform_positions_of($r), true)) { return $r; }
    }
    foreach ($candidates as $r) {
        if ($r['position'] === null) { return $r; }
    }
    foreach ($candidates as $r) {
        if ($r['position'] === OTHER_POSITION) { return $r; }
    }
    return null;
}

/** แทนโปโลด้วยสีของหน่วยงาน ถ้ากฎระบุ poloBySite */
function resolve_items($rule, $site)
{
    if (!$rule['poloBySite']) { return $rule['items']; }
    $polo = ($site && $site['poloColor'] === 'NAVY') ? 'POLO_NAVY' : 'POLO_BLACK';
    $out = array();
    foreach ($rule['items'] as $i) { $out[] = ($i === 'POLO_BLACK' || $i === 'POLO_NAVY') ? $polo : $i; }
    return $out;
}

function resolve_style($rule, $site)
{
    $hasPolo = false;
    foreach ($rule['items'] as $i) {
        if (strpos($i, 'POLO') === 0) { $hasPolo = true; }
    }
    if (!$rule['poloBySite'] || !$hasPolo) { return $rule['style']; }
    return $rule['style'] . ' · โปโล' . (($site && $site['poloColor'] === 'NAVY') ? 'สีน้ำเงิน' : 'สีดำ');
}

/** โลโก้บริษัทบนเสื้อ — ใช้เลือกแบบเสื้อในระบบสต็อก */
function uniform_logo($rule, $emp)
{
    if (isset($rule['logo']) && $rule['logo'] !== null) { return $rule['logo']; }
    if (preg_match('/โลโก้\s*(\S+)/u', $rule['style'], $m)) { return $m[1]; }
    return $emp['companyCode'];
}

/** การแจกผ่านคลังนับว่า "แจกแล้ว" เมื่อคลังจ่ายของแล้วเท่านั้น */
function is_stock_issue($issue)
{
    return isset($issue['source']) && $issue['source'] === 'STOCK';
}

function is_handed_out($issue)
{
    return !is_stock_issue($issue) || in_array($issue['stock']['stage'], array('ISSUED', 'RECEIVED'), true);
}

/** รอบแจกชุดฟอร์ม เรียงตามลำดับเวลา */
function uniform_events() { return array('START', 'PROBATION', 'ANNUAL'); }

/**
 * จำนวนต่อรายการต่อรอบของกฎ: { START: { TECH_SHIRT: 2, POLO_BLACK: 1 }, PROBATION: {...}, ANNUAL: {...} }
 * กฎรุ่นก่อนที่ไม่มี quantities: ทุกรายการได้ตามจำนวนของรอบ ยกเว้นรองเท้า 1 คู่
 */
function rule_quantities($rule)
{
    if (isset($rule['quantities']) && $rule['quantities'] !== null) { return $rule['quantities']; }
    $legacy = array('START' => 'qtyStart', 'PROBATION' => 'qtyProbation', 'ANNUAL' => 'qtyAnnual');
    $out = array();
    foreach (uniform_events() as $ev) {
        $n = isset($rule[$legacy[$ev]]) ? (int)$rule[$legacy[$ev]] : 0;
        $m = array();
        foreach ($rule['items'] as $c) { $m[$c] = $n > 0 ? ($c === 'SAFETY_SHOES' ? 1 : $n) : 0; }
        $out[$ev] = $m;
    }
    return $out;
}

/** หน่วยงานตั้งชุดฟอร์มทับกฎข้อนี้ไว้ไหม — คืน quantities ของหน่วยงาน หรือ null */
function site_override($rule, $site)
{
    if (!$site || !isset($site['uniformOverrides'])) { return null; }
    foreach ($site['uniformOverrides'] as $o) {
        if ((int)$o['ruleId'] === (int)$rule['id']) { return $o['quantities']; }
    }
    return null;
}

/**
 * จำนวนที่ใช้จริงที่หน่วยงานนี้ — หน่วยงานตั้งทับกฎไว้ = ใช้ของหน่วยงานแทนทั้งชุด
 * ตัดรายการที่เป็น 0 ออก และแทนโปโลด้วยสีของหน่วยงานถ้ากฎระบุ poloBySite
 */
function site_quantities($rule, $site)
{
    $over = site_override($rule, $site);
    $base = $over !== null ? $over : rule_quantities($rule);
    $polo = ($site && $site['poloColor'] === 'NAVY') ? 'POLO_NAVY' : 'POLO_BLACK';
    $out = array();
    foreach (uniform_events() as $ev) {
        $m = array();
        $src = isset($base[$ev]) && is_array($base[$ev]) ? $base[$ev] : array();
        foreach ($src as $code => $n) {
            if (!($n > 0)) { continue; }
            $c = ($rule['poloBySite'] && strpos($code, 'POLO') === 0) ? $polo : $code;
            $m[$c] = (isset($m[$c]) ? $m[$c] : 0) + (int)$n;
        }
        $out[$ev] = $m;
    }
    return $out;
}

function sum_qty($m)
{
    $s = 0;
    foreach ($m as $n) { $s += $n; }
    return $s;
}

function uniform_status($emp, $site, $rules, $issues, $today)
{
    $rule = match_uniform_rule($emp, $rules['uniform']);
    if (!$rule) {
        $typeCovered = false;
        foreach ($rules['uniform'] as $r) {
            if ($r['employeeType'] === $emp['employeeType']) { $typeCovered = true; }
        }
        return array(
            'ruleId' => null,
            'style' => null,
            'logo' => null,
            'siteOverride' => false,
            'reasons' => array($typeCovered
                ? 'ไม่พบกฎชุดฟอร์มที่ตรงกับบริษัท/กลุ่ม/ระดับของพนักงาน (รอ HR ยืนยัน)'
                : 'ประเภทพนักงานนี้ไม่อยู่ในเงื่อนไขชุดฟอร์ม'),
            'entitlements' => array(),
        );
    }
    $quantities = site_quantities($rule, $site);
    $style = resolve_style($rule, $site);
    $limit = min_date($emp['endDate'], $today);
    $mine = array();
    foreach ($issues as $i) {
        if ($i['employeeId'] === $emp['id']) { $mine[] = $i; }
    }
    $ents = array();
    $add = array();   // [key, event, dueDate]
    if (sum_qty($quantities['START']) > 0 && strcmp($emp['startDate'], $limit) <= 0) {
        $add[] = array('START', 'START', $emp['startDate']);
    }
    // ผ่านทดลองงานก่อนเสมอ ถึงจะได้รอบผ่านโปรและรอบประจำปี (HR ยืนยัน)
    $pass = $emp['probationPassDate'];
    if ($pass && strcmp($pass, $limit) <= 0 && sum_qty($quantities['PROBATION']) > 0) {
        $add[] = array('PROBATION', 'PROBATION', $pass);
    }
    if ($pass && sum_qty($quantities['ANNUAL']) > 0) {
        $month = str_pad2($rules['settings']['uniformAnnualMonth']);
        $lastYear = year_of($limit);
        for ($y = max(year_of($pass), $lastYear - ANNUAL_LOOKBACK_YEARS + 1); $y <= $lastYear; $y++) {
            $due = $y . '-' . $month . '-01';
            if (strcmp($due, $pass) > 0 && strcmp($due, $limit) <= 0) {
                $add[] = array('ANNUAL-' . $y, 'ANNUAL', $due);
            }
        }
    }
    foreach ($add as $a) {
        $issue = null;
        foreach ($mine as $i) {
            if ($i['entitlementKey'] === $a[0]) { $issue = $i; break; }
        }
        $stock = ($issue && isset($issue['stock'])) ? $issue['stock'] : null;
        $itemQty = $quantities[$a[1]];
        $ents[] = array(
            'key' => $a[0],
            'event' => $a[1],
            'dueDate' => $a[2],
            'qty' => sum_qty($itemQty),
            'qtyLabel' => (string)sum_qty($itemQty),
            'items' => array_keys($itemQty),
            'itemQty' => $itemQty,
            'style' => $style,
            'issued' => $issue !== null && is_handed_out($issue),
            'requested' => $issue !== null && !is_handed_out($issue),
            'issueId' => $issue ? $issue['id'] : null,
            'stockDocNo' => $stock ? $stock['docNo'] : null,
            'stock' => $stock,
        );
    }
    return array('ruleId' => $rule['id'], 'style' => $style, 'logo' => uniform_logo($rule, $emp),
        'siteOverride' => site_override($rule, $site) !== null, 'reasons' => array(), 'entitlements' => $ents);
}

/** สิทธิสวัสดิการทั้งหมดของพนักงาน 1 คน (= benefitsOf ใน eligibility.js) */
function benefits_of($employee, $site, $rules, $issues, $today)
{
    return array(
        'employee' => $employee,
        'site' => $site,
        'insurance' => insurance_status($employee, $site, $rules),
        'uniform' => uniform_status($employee, $site, $rules, $issues, $today),
    );
}
