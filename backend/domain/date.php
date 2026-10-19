<?php
/* ============================================================
 *  backend/domain/date.php — คู่แฝดของ web/assets/js/domain/date.js
 *  ทุกการคำนวณวันทำบน UTC (gmmktime / gmdate) วันไม่เลื่อนตาม timezone
 * ============================================================ */

define('DAY_SECONDS', 86400);

function date_parse_iso($d)
{
    $p = explode('-', substr($d, 0, 10));
    return gmmktime(0, 0, 0, (int)$p[1], (int)$p[2], (int)$p[0]);
}

function date_to_iso($ts)
{
    return gmdate('Y-m-d', $ts);
}

function add_days($d, $n)
{
    return date_to_iso(date_parse_iso($d) + $n * DAY_SECONDS);
}

function add_months($d, $n)
{
    $p = explode('-', $d);
    return date_to_iso(gmmktime(0, 0, 0, (int)$p[1] + $n, (int)$p[2], (int)$p[0]));
}

/** จำนวนวันจาก a ถึง b (b − a) */
function diff_days($a, $b)
{
    return (int)round((date_parse_iso($b) - date_parse_iso($a)) / DAY_SECONDS);
}

/** อายุเต็มปี ณ วันที่ at */
function age_at($birth, $at)
{
    $b = explode('-', $birth);
    $a = explode('-', $at);
    $by = (int)$b[0]; $bm = (int)$b[1]; $bd = (int)$b[2];
    $ay = (int)$a[0]; $am = (int)$a[1]; $ad = (int)$a[2];
    return $ay - $by - (($am < $bm || ($am === $bm && $ad < $bd)) ? 1 : 0);
}

/** วันที่ `day` แรกของเดือนที่ >= d (รอบแจ้งประกัน) */
function next_cycle_date($d, $day = 5)
{
    $p = explode('-', $d);
    $y = (int)$p[0]; $m = (int)$p[1]; $dd = (int)$p[2];
    $target = $dd <= $day ? gmmktime(0, 0, 0, $m, $day, $y) : gmmktime(0, 0, 0, $m + 1, $day, $y);
    return date_to_iso($target);
}

function min_date($a, $b)
{
    return ($a !== null && strcmp($a, $b) < 0) ? $a : $b;
}

function year_of($d)
{
    return (int)substr($d, 0, 4);
}
