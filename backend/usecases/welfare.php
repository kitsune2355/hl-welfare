<?php
/* ============================================================
 *  backend/usecases/welfare.php — คู่แฝดของ web/assets/js/application/usecases/welfare.js
 *  รายชื่อผู้มีสิทธิ์ของสวัสดิการเพิ่มเติม + สิทธิ์รายคน (หน้าพนักงาน) + ตัวนับบนเมนู
 * ============================================================ */

/** แถวของหน้า welfare.html แท็บผู้มีสิทธิ์ — เฉพาะคนที่ตรงเงื่อนไข (ไม่มีสิทธิ์ไม่แสดง) เรียงตามรหัสพนักงาน */
function build_welfare_roster($program, $employees, $sites, $records, $today)
{
    $siteName = array();
    foreach ($sites as $s) { $siteName[$s['id']] = $s['name']; }
    $out = array();
    foreach ($employees as $e) {
        $st = welfare_status($e, $program, $records, $today);
        if ($st['state'] === 'NONE') { continue; }
        $out[] = array('employee' => employee_lite($e), 'siteName' => isset($siteName[$e['siteId']]) ? $siteName[$e['siteId']] : '', 'status' => $st);
    }
    stable_usort($out, '__cmp_roster');
    return $out;
}

function __cmp_roster($a, $b)
{
    return str_cmp($a['employee']['empCode'], $b['employee']['empCode']);
}

/** สิทธิ์สวัสดิการเพิ่มเติม (ที่เปิดใช้งาน) ของพนักงาน 1 คน — การ์ดในหน้ารายละเอียดพนักงาน */
function welfare_of_employee($emp, $programs, $records, $today)
{
    $out = array();
    foreach ($programs as $p) {
        if (!$p['active']) { continue; }
        $out[] = array('programId' => $p['id'], 'name' => $p['name'], 'icon' => $p['icon'], 'unit' => $p['unit'],
            'frequency' => $p['frequency'], 'status' => welfare_status($emp, $p, $records, $today));
    }
    return $out;
}

/** ตัวนับบนเมนู [{programId, due}] — เฉพาะที่เปิดใช้งาน */
function welfare_due_list($programs, $employees, $records, $today)
{
    $out = array();
    foreach ($programs as $p) {
        if ($p['active']) { $out[] = array('programId' => $p['id'], 'due' => welfare_due_count($p, $employees, $records, $today)); }
    }
    return $out;
}
