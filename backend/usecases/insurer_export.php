<?php
/* ============================================================
 *  backend/usecases/insurer_export.php — คู่แฝดของ application/usecases/insurerExport.js
 *  (buildInsurerExport / buildBatchExport / exportData) — ใครอยู่ในไฟล์แจ้งบริษัทประกัน
 *  การเติมข้อมูลลงไฟล์ Excel ยังทำในเบราว์เซอร์ (app/excelTemplate.js)
 * ============================================================ */

function __cmp_row_code($a, $b) { return str_cmp($a['employee']['empCode'], $b['employee']['empCode']); }

function __company_name_map($companies)
{
    $m = array();
    foreach ($companies as $c) {
        $m[$c['code']] = (isset($c['legalName']) && $c['legalName'] !== null) ? $c['legalName'] : $c['name'];
    }
    return $m;
}

/** รายชื่อที่ต้องอยู่ในไฟล์ของบริษัทประกัน รอบ cycleDate = ยังไม่ส่งออก + ส่งออกให้บริษัทนี้ในรอบนี้แล้ว */
function build_insurer_export($cycleDate, $insurer, $employees, $sites, $rules, $batches, $companies, $changes = array())
{
    $sent = sent_index($batches, $employees);
    $siteById = by_key($sites, 'id');
    $codes = array();
    foreach ($insurer['companies'] as $c) { $codes[] = $c['companyCode']; }
    $cycle = build_insurance_cycle($cycleDate, $employees, $sites, $rules, $batches, $changes);
    $rows = array();
    foreach ($cycle['rows'] as $r) {
        if (!in_array($r['employee']['companyCode'], $codes, true)) { continue; }
        if ($r['submitted']) {
            $dir = direction_of($r['type']);
            $sk = sent_key($r['employee']['id'], isset($r['ref']) ? $r['ref'] : 0);
            $b = isset($sent[$dir][$sk]) ? $sent[$dir][$sk] : null;
            $bInsurer = ($b && $b['insurerId'] !== null) ? $b['insurerId'] : $insurer['id'];
            if (!($b && $b['cycleDate'] === $cycleDate && $bInsurer === $insurer['id'])) { continue; }
        }
        $r['employee']['siteName'] = isset($siteById[$r['employee']['siteId']]) ? $siteById[$r['employee']['siteId']]['name'] : '';
        $rows[] = $r;
    }
    $data = __export_data($cycleDate, $insurer, $rows, __company_name_map($companies), $insurer['companies']);
    $n = 0;
    foreach ($rows as $r) {
        if ($r['submitted']) { $n++; }
    }
    $data['alreadyExported'] = $n;
    return $data;
}

/** ไฟล์ของการส่งออกครั้งที่ผ่านมา = รายชื่อเฉพาะใน batch นั้น */
function build_batch_export($batch, $insurer, $employees, $sites, $rules, $batches, $companies, $changes = array())
{
    $cycle = build_insurance_cycle($batch['cycleDate'], $employees, $sites, $rules, $batches, $changes);
    $cycleRow = array();
    foreach ($cycle['rows'] as $r) { $cycleRow[cycle_row_key($r)] = $r; }
    $empById = by_key($employees, 'id');
    $siteById = by_key($sites, 'id');
    $rows = array();
    foreach ($batch['items'] as $it) {
        if (!isset($empById[$it['employeeId']])) { continue; }
        $k = batch_item_key($it);
        $r = isset($cycleRow[$k]) ? $cycleRow[$k] : null;
        $e = $r ? $r['employee'] : $empById[$it['employeeId']];   // แจ้งออกจากที่เดิม = ข้อมูลเดิม
        $e['siteName'] = isset($siteById[$e['siteId']]) ? $siteById[$e['siteId']]['name'] : '';
        $rows[] = array('type' => $it['type'], 'employee' => $e, 'effectiveDate' => $r ? $r['effectiveDate'] : null,
            'reason' => $r ? $r['reason'] : '', 'submitted' => true);
    }
    $bound = array();
    foreach ($insurer['companies'] as $c) { $bound[] = $c['companyCode']; }
    $extra = array();
    foreach ($rows as $r) {
        $cc = $r['employee']['companyCode'];
        if (!in_array($cc, $bound, true) && !in_array($cc, $extra, true)) { $extra[] = $cc; }
    }
    sort($extra, SORT_STRING);
    $cos = $insurer['companies'];
    foreach ($extra as $cc) { $cos[] = array('companyCode' => $cc, 'policyNo' => '', 'holderName' => '', 'plan' => ''); }
    $data = __export_data($batch['cycleDate'], $insurer, $rows, __company_name_map($companies), $cos);
    $data['batchId'] = $batch['id'];
    $data['alreadyExported'] = count($rows);
    return $data;
}

/** รายชื่อ → ข้อมูลไฟล์: แยกตามบริษัทในเครือ (ชีตละบริษัท) + รายการที่ข้อมูลไม่ครบ */
function __export_data($cycleDate, $insurer, $rows, $companyName, $cos)
{
    $needs = required_employee_fields($insurer);
    $missing = array();
    foreach ($rows as $r) {
        if ($r['type'] !== 'IN') { continue; }
        $fields = array();
        foreach ($needs as $f) {
            if (empty($r['employee'][$f])) { $fields[] = $f; }
        }
        if (count($fields)) { $missing[] = array('employee' => $r['employee'], 'fields' => $fields); }
    }
    $companies = array();
    foreach ($cos as $c) {
        $in = array();
        $out = array();
        $change = array();
        foreach ($rows as $r) {
            if ($r['employee']['companyCode'] !== $c['companyCode']) { continue; }
            if ($r['type'] === 'IN') { $in[] = $r; } elseif ($r['type'] === 'CHANGE') { $change[] = $r; } else { $out[] = $r; }
        }
        stable_usort($in, '__cmp_row_code');
        stable_usort($out, '__cmp_row_code');
        stable_usort($change, '__cmp_row_code');
        $holder = isset($c['holderName']) ? trim((string)$c['holderName']) : '';
        $c['companyName'] = $holder !== '' ? $holder
            : (isset($companyName[$c['companyCode']]) && $companyName[$c['companyCode']] !== '' ? $companyName[$c['companyCode']] : $c['companyCode']);
        $c['in'] = $in;
        $c['out'] = $out;
        $c['change'] = $change;   // แจ้งเปลี่ยนแปลง (เปลี่ยนรหัส) — ต่อท้ายแถวออก
        $companies[] = $c;
    }
    return array('cycleDate' => $cycleDate, 'insurer' => $insurer, 'companies' => $companies, 'missing' => $missing);
}
