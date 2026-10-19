<?php
/* ============================================================
 *  backend/domain/rule_versions.php — คู่แฝดของ web/assets/js/domain/ruleVersions.js
 *  กฎสวัสดิการแบบมีวันที่มีผล (แปลงบรรทัดต่อบรรทัด — แก้ที่หนึ่งต้องแก้อีกที่)
 *
 *  ฉบับ (revision) = array('id' => รหัสกฎ คงที่ทุกฉบับ, 'revisionId', 'effectiveFrom', 'deleted', ...ค่าของกฎ)
 *  กฎที่ใช้ ณ วันที่ d = ฉบับล่าสุดที่ effectiveFrom <= d ของแต่ละรหัสกฎ (ฉบับที่ลบ = กฎนั้นไม่มีผลแล้ว)
 * ============================================================ */

define('RULE_EPOCH', '2000-01-01');

/** ฉบับ a ใหม่กว่า b ไหม: วันที่มีผลหลังกว่า หรือวันเดียวกันแต่บันทึกทีหลัง */
function rule_rev_newer($a, $b)
{
    $c = strcmp($a['effectiveFrom'], $b['effectiveFrom']);
    return $c > 0 || ($c === 0 && $a['revisionId'] > $b['revisionId']);
}

/** ฉบับที่ใช้อยู่ของแต่ละรหัสกฎ ณ วันที่ asOf (รวมฉบับที่ลบ) — คีย์ = รหัสกฎ */
function rule_latest_by_id($revisions, $asOf)
{
    $best = array();
    foreach ($revisions as $r) {
        if (strcmp($r['effectiveFrom'], $asOf) > 0) { continue; }
        if (!isset($best[$r['id']]) || rule_rev_newer($r, $best[$r['id']])) { $best[$r['id']] = $r; }
    }
    return $best;
}

/** กฎที่มีผล ณ วันที่ asOf เรียงตามรหัสกฎ — ตัด revisionId / deleted ออก */
function active_rules($revisions, $asOf)
{
    $best = rule_latest_by_id($revisions, $asOf);
    ksort($best);
    $out = array();
    foreach ($best as $r) {
        if ($r['deleted']) { continue; }
        unset($r['revisionId'], $r['deleted']);
        $out[] = $r;
    }
    return $out;
}

/** ค่าตั้งค่าที่มีผล ณ วันที่ asOf จากแถว array(key, value, effectiveFrom) */
function active_settings($rows, $asOf)
{
    $best = array();
    foreach ($rows as $s) {
        if (strcmp($s['effectiveFrom'], $asOf) > 0) { continue; }
        if (!isset($best[$s['key']]) || strcmp($s['effectiveFrom'], $best[$s['key']]['effectiveFrom']) >= 0) { $best[$s['key']] = $s; }
    }
    $out = array();
    foreach ($best as $k => $s) { $out[$k] = $s['value']; }
    return $out;
}

function __rule_rev_cmp_newest($a, $b) { return rule_rev_newer($a, $b) ? -1 : 1; }

/** ประวัติ + การเปลี่ยนแปลงที่รอมีผลของกฎทุกข้อ (หน้าเงื่อนไขสวัสดิการ) เรียงตามรหัสกฎ */
function rule_timeline($revisions, $asOf)
{
    $latest = rule_latest_by_id($revisions, $asOf);
    $ids = array();
    foreach ($revisions as $r) { $ids[$r['id']] = true; }
    $ids = array_keys($ids);
    sort($ids);
    $out = array();
    foreach ($ids as $id) {
        $mine = array();
        foreach ($revisions as $r) { if ($r['id'] === $id) { $mine[] = $r; } }
        usort($mine, '__rule_rev_cmp_newest');
        $pending = array();
        $history = array();
        foreach ($mine as $r) {
            if (strcmp($r['effectiveFrom'], $asOf) > 0) { $pending[] = $r; } else { $history[] = $r; }
        }
        $cur = isset($latest[$id]) ? $latest[$id] : null;
        $out[] = array(
            'id' => $id,
            'current' => ($cur && !$cur['deleted']) ? $cur : null,
            'pending' => array_reverse($pending),
            'history' => $history,
        );
    }
    return $out;
}
