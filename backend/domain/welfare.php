<?php
/* ============================================================
 *  backend/domain/welfare.php — คู่แฝดของ web/assets/js/domain/welfare.js
 *  สวัสดิการเพิ่มเติมที่ HR สร้างเอง (แปลงบรรทัดต่อบรรทัด — แก้ที่หนึ่งต้องแก้อีกที่)
 *  รูปแบบข้อมูล (WelfareProgram / WelfareRule / WelfareField / WelfareRecord) ดูหัวไฟล์ JS
 * ============================================================ */

define('WELFARE_YEARS_BACK', 3);
define('WELFARE_MONTHS_BACK', 12);
define('WELFARE_MAX_RULES', 50);
define('WELFARE_MAX_FIELDS', 20);

function welfare_frequencies() { return array('ONCE', 'YEARLY', 'MONTHLY', 'ANYTIME'); }
function welfare_wait_from() { return array('START', 'PROBATION'); }
function welfare_field_types() { return array('text', 'number', 'date', 'select'); }

/** ปัดทศนิยม 2 ตำแหน่ง — คืน int ถ้าลงตัว (เหมือน number ของ JS) */
function welfare_round2($n)
{
    return num(round($n, 2));
}

function welfare_in_list($list, $v)
{
    return $list === null || ($v !== null && in_array($v, $list, true));
}

/** กฎข้อแรกที่พนักงานตรงทุกเงื่อนไข — null = ไม่มีสิทธิ์ */
function match_welfare_rule($emp, $rules)
{
    foreach ($rules as $r) {
        if (welfare_in_list($r['companies'], $emp['companyCode'])
            && welfare_in_list($r['employeeTypes'], $emp['employeeType'])
            && welfare_in_list($r['deptGroups'], $emp['deptGroup'])
            && welfare_in_list($r['positions'], $emp['position'])
            && welfare_in_list($r['genders'], $emp['gender'])
            && ($r['levelMin'] === null || ($emp['level'] !== null && $emp['level'] >= $r['levelMin']))
            && ($r['levelMax'] === null || ($emp['level'] !== null && $emp['level'] <= $r['levelMax']))) {
            return $r;
        }
    }
    return null;
}

/** วันสุดท้ายที่นับสิทธิ์ — พ้นสภาพแล้ว = วันพ้นสภาพ (ถ้าก่อนวันนี้) */
function welfare_limit_date($emp, $today)
{
    $end = null;
    if ($emp['status'] === 'INACTIVE') {
        $end = $emp['endDate'] !== null ? $emp['endDate'] : ($emp['lastWorkingDate'] !== null ? $emp['lastWorkingDate'] : $today);
    }
    return ($end !== null && strcmp($end, $today) < 0) ? $end : $today;
}

/** รอบที่ถึงกำหนดแล้ว ตั้งแต่วันครบสิทธิ์ถึงวัน limit — เก่าสุดก่อน */
function welfare_periods_between($frequency, $eligibleDate, $limit)
{
    if ($frequency === 'ONCE') { return array(array('key' => 'ONCE', 'dueDate' => $eligibleDate)); }
    $ly = (int)substr($limit, 0, 4);
    $out = array();
    if ($frequency === 'MONTHLY') {
        $lm = $ly * 12 + (int)substr($limit, 5, 2) - 1;
        $em = (int)substr($eligibleDate, 0, 4) * 12 + (int)substr($eligibleDate, 5, 2) - 1;
        for ($m = max($em, $lm - WELFARE_MONTHS_BACK + 1); $m <= $lm; $m++) {
            $first = sprintf('%04d-%02d-01', (int)floor($m / 12), ($m % 12) + 1);
            $out[] = array('key' => 'M-' . substr($first, 0, 7), 'dueDate' => strcmp($first, $eligibleDate) > 0 ? $first : $eligibleDate);
        }
        return $out;
    }
    // YEARLY: ย้อนหลังได้ · ANYTIME: วงเงินปีปัจจุบันเท่านั้น (ไม่สะสม)
    $from = $frequency === 'ANYTIME' ? $ly : max((int)substr($eligibleDate, 0, 4), $ly - WELFARE_YEARS_BACK + 1);
    for ($y = $from; $y <= $ly; $y++) {
        $first = sprintf('%04d-01-01', $y);
        $out[] = array('key' => 'Y-' . $y, 'dueDate' => strcmp($first, $eligibleDate) > 0 ? $first : $eligibleDate);
    }
    return $out;
}

function welfare_none($reason, $partial = array())
{
    return array_merge(array('state' => 'NONE', 'eligible' => false, 'reasons' => array($reason), 'ruleId' => null, 'ruleLabel' => null,
        'amount' => null, 'eligibleDate' => null, 'periods' => array(), 'due' => 0), $partial);
}

/**
 * สิทธิ์สวัสดิการ 1 อย่างของพนักงาน 1 คน
 * state: NONE ไม่มีสิทธิ์ · WAITING รอครบสิทธิ์ · DUE มีรอบที่ยังไม่ได้ให้ (ANYTIME = ยังมีวงเงิน) · DONE ให้ครบแล้ว
 */
function welfare_status($emp, $program, $records, $today)
{
    $rule = match_welfare_rule($emp, $program['rules']);
    if (!$rule) { return welfare_none('ไม่ตรงเงื่อนไขของสวัสดิการนี้'); }
    $base = $program['waitFrom'] === 'PROBATION'
        ? ($emp['probationPassDate'] !== null ? $emp['probationPassDate'] : probation_due_date($emp['startDate']))
        : wait_start_date($emp);
    $eligibleDate = add_days($base, $rule['waitDays']);
    $limit = welfare_limit_date($emp, $today);
    $head = array('ruleId' => $rule['id'], 'ruleLabel' => $rule['label'], 'amount' => $rule['amount'], 'eligibleDate' => $eligibleDate);
    if (strcmp($eligibleDate, $limit) > 0) {
        if ($emp['status'] !== 'ACTIVE') { return welfare_none('พ้นสภาพก่อนครบสิทธิ์', $head); }
        return array_merge($head, array('state' => 'WAITING', 'eligible' => true, 'reasons' => array(), 'periods' => array(), 'due' => 0));
    }
    $anytime = $program['frequency'] === 'ANYTIME';
    $periods = array();
    $due = 0;
    foreach (welfare_periods_between($program['frequency'], $eligibleDate, $limit) as $p) {
        $used = 0;
        $ids = array();
        foreach ($records as $r) {
            if ($r['employeeId'] !== $emp['id'] || $r['programId'] !== $program['id'] || $r['periodKey'] !== $p['key']) { continue; }
            $used += $r['amount'] !== null ? $r['amount'] : 0;
            $ids[] = $r['id'];
        }
        $used = welfare_round2($used);
        $remaining = ($anytime && $rule['amount'] !== null) ? welfare_round2($rule['amount'] - $used) : null;
        $done = $anytime ? ($remaining !== null && $remaining <= 0) : count($ids) > 0;
        if (!$done) { $due++; }
        $periods[] = array('key' => $p['key'], 'dueDate' => $p['dueDate'], 'used' => $used, 'remaining' => $remaining,
            'done' => $done, 'recordIds' => $ids);
    }
    return array_merge($head, array('state' => $due ? 'DUE' : 'DONE', 'eligible' => true, 'reasons' => array(),
        'periods' => $periods, 'due' => $due));
}

function welfare_blank($v)
{
    return $v === null || (is_string($v) && trim($v) === '');
}

function welfare_is_num($v)
{
    return (is_int($v) || is_float($v)) && !is_nan($v) && !is_infinite($v);
}

/**
 * ตรวจการบันทึกให้สิทธิ์ — $status = welfare_status ของพนักงานคนนั้น ณ วันนี้
 * คืน array(ช่อง => ข้อความ) · data.<key> = ช่องข้อมูลของสวัสดิการ
 */
function validate_welfare_record($program, $status, $input)
{
    $errors = array();
    $period = null;
    foreach ($status['periods'] as $p) { if ($p['key'] === $input['periodKey']) { $period = $p; } }
    if (!$status['eligible']) {
        $errors['periodKey'] = count($status['reasons']) ? $status['reasons'][0] : 'พนักงานไม่มีสิทธิ์สวัสดิการนี้';
    } elseif ($status['state'] === 'WAITING') {
        $errors['periodKey'] = 'ยังไม่ครบสิทธิ์';
    } elseif (!$period) {
        $errors['periodKey'] = 'ไม่พบรอบนี้ หรือเลยกำหนดย้อนหลังแล้ว';
    } elseif ($period['done']) {
        $errors['periodKey'] = $program['frequency'] === 'ANYTIME' ? 'ใช้สิทธิ์ครบวงเงินของปีนี้แล้ว' : 'รอบนี้ให้แล้ว';
    }
    if (!$input['date'] || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $input['date'])) { $errors['date'] = 'กรุณาระบุวันที่ให้'; }
    $amt = $input['amount'];
    if ($amt !== null && !(welfare_is_num($amt) && $amt >= 0)) {
        $errors['amount'] = 'จำนวนต้องเป็นตัวเลขไม่ติดลบ';
    } elseif ($program['frequency'] === 'ANYTIME' && $status['amount'] !== null) {
        if ($amt === null || $amt <= 0) {
            $errors['amount'] = 'กรุณาระบุจำนวนที่เบิก';
        } elseif ($period && !$period['done'] && $amt > $period['remaining']) {
            $errors['amount'] = 'เกินวงเงินคงเหลือ (' . $period['remaining'] . ')';
        }
    }
    $data = is_array($input['data']) ? $input['data'] : array();
    foreach ($program['fields'] as $f) {
        $v = isset($data[$f['key']]) ? $data[$f['key']] : null;
        $k = 'data.' . $f['key'];
        if (welfare_blank($v)) {
            if ($f['required']) { $errors[$k] = 'กรุณากรอก' . $f['label']; }
        } elseif ($f['type'] === 'number' && !welfare_is_num($v)) {
            $errors[$k] = $f['label'] . 'ต้องเป็นตัวเลข';
        } elseif ($f['type'] === 'date' && !(is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v))) {
            $errors[$k] = $f['label'] . 'ไม่ใช่วันที่';
        } elseif ($f['type'] === 'select' && !in_array($v, $f['options'], true)) {
            $errors[$k] = 'เลือก' . $f['label'] . 'จากรายการ';
        }
    }
    return $errors;
}

/* ---------- ตั้งค่าสวัสดิการ ---------- */
function welfare_str($v, $max)
{
    if (!is_string($v)) { return ''; }
    $v = trim($v);
    return function_exists('mb_substr') ? mb_substr($v, 0, $max, 'UTF-8') : substr($v, 0, $max);
}

/** '' / null = null · จำนวนเต็ม = int · อย่างอื่น = NAN (ตรวจไม่ผ่าน) */
function welfare_int_or_null($v)
{
    if ($v === null || $v === '') { return null; }
    if (is_int($v)) { return $v; }
    if ((is_float($v) && $v == floor($v)) || (is_string($v) && preg_match('/^-?\d+$/', trim($v)))) { return (int)$v; }
    return NAN;
}

function welfare_num_or_null($v)
{
    if ($v === null || $v === '') { return null; }
    if (is_int($v) || is_float($v)) { return $v; }
    if (is_string($v) && is_numeric(trim($v))) { return num(trim($v)); }
    return NAN;
}

/** รายการเลือก: null / ว่าง = ทุกค่า */
function welfare_list_or_null($v)
{
    if (!is_array($v)) { return null; }
    $out = array();
    foreach ($v as $x) {
        $x = is_string($x) ? trim($x) : '';
        if ($x !== '' && !in_array($x, $out, true)) { $out[] = $x; }
    }
    return count($out) ? $out : null;
}

/** ค่าจากหน้าเว็บ → สวัสดิการที่เก็บ (ตัดช่องว่าง เติมค่าเริ่มต้น) — ตรวจต่อด้วย validate_welfare_program */
function normalize_welfare_program($in)
{
    $p = array(
        'id' => isset($in['id']) ? $in['id'] : null,
        'name' => welfare_str(arr_get($in, 'name'), 100),
        'icon' => welfare_str(arr_get($in, 'icon'), 40),
        'description' => welfare_str(arr_get($in, 'description'), 500),
        'active' => array_key_exists('active', $in) ? (bool)$in['active'] : true,
        'frequency' => arr_get($in, 'frequency'),
        'waitFrom' => arr_get($in, 'waitFrom', 'START'),
        'unit' => welfare_str(arr_get($in, 'unit'), 20),
        'rules' => array(),
        'fields' => array(),
    );
    if ($p['icon'] === '') { $p['icon'] = 'gift'; }
    $maxId = 0;
    foreach (is_array(arr_get($in, 'rules')) ? $in['rules'] : array() as $r) {
        $id = (!isset($r['id']) || $r['id'] === '') ? 0 : welfare_int_or_null($r['id']);
        if (is_int($id) && $id > $maxId) { $maxId = $id; }
        $wait = welfare_int_or_null(arr_get($r, 'waitDays'));
        $p['rules'][] = array(
            'id' => $id,
            'label' => welfare_str(arr_get($r, 'label'), 100),
            'companies' => welfare_list_or_null(arr_get($r, 'companies')),
            'employeeTypes' => welfare_list_or_null(arr_get($r, 'employeeTypes')),
            'deptGroups' => welfare_list_or_null(arr_get($r, 'deptGroups')),
            'positions' => welfare_list_or_null(arr_get($r, 'positions')),
            'genders' => welfare_list_or_null(arr_get($r, 'genders')),
            'levelMin' => welfare_int_or_null(arr_get($r, 'levelMin')),
            'levelMax' => welfare_int_or_null(arr_get($r, 'levelMax')),
            'waitDays' => $wait === null ? 0 : $wait,
            'amount' => welfare_num_or_null(arr_get($r, 'amount')),
            'note' => welfare_str(arr_get($r, 'note'), 500),
        );
    }
    // รหัสที่ยังไม่มี (เงื่อนไขใหม่ = 0 / ช่องข้อมูลใหม่ = '') → ต่อจากเลขมากสุด — รหัสเดิมคงที่
    foreach ($p['rules'] as $i => $r) { if ($r['id'] === 0) { $p['rules'][$i]['id'] = ++$maxId; } }
    $n = 0;
    foreach (is_array(arr_get($in, 'fields')) ? $in['fields'] : array() as $f) {
        $type = arr_get($f, 'type');
        $opts = array();
        if ($type === 'select' && is_array(arr_get($f, 'options'))) {
            foreach ($f['options'] as $o) {
                $o = welfare_str($o, 100);
                if ($o !== '' && !in_array($o, $opts, true)) { $opts[] = $o; }
            }
        }
        $key = welfare_str(arr_get($f, 'key'), 30);
        if (preg_match('/^f(\d+)$/', $key, $m) && (int)$m[1] > $n) { $n = (int)$m[1]; }
        $p['fields'][] = array('key' => $key, 'label' => welfare_str(arr_get($f, 'label'), 100), 'type' => $type,
            'options' => $opts, 'required' => (bool)arr_get($f, 'required', false));
    }
    foreach ($p['fields'] as $i => $f) { if ($f['key'] === '') { $p['fields'][$i]['key'] = 'f' . (++$n); } }
    return $p;
}

function welfare_lower($s)
{
    return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
}

/**
 * ตรวจสวัสดิการ (หลัง normalize) — $others = สวัสดิการอื่นทั้งหมด (ตรวจชื่อซ้ำ)
 * คืน array(ช่อง => ข้อความ) · rules.<i>.<ช่อง> / fields.<i>.<ช่อง>
 */
function validate_welfare_program($p, $others)
{
    $e = array();
    if ($p['name'] === '') {
        $e['name'] = 'กรุณาตั้งชื่อสวัสดิการ';
    } else {
        foreach ($others as $o) {
            if ($o['id'] !== $p['id'] && welfare_lower($o['name']) === welfare_lower($p['name'])) { $e['name'] = 'มีสวัสดิการชื่อนี้แล้ว'; }
        }
    }
    if (!in_array($p['frequency'], welfare_frequencies(), true)) { $e['frequency'] = 'กรุณาเลือกรอบการให้สิทธิ์'; }
    if (!in_array($p['waitFrom'], welfare_wait_from(), true)) { $e['waitFrom'] = 'กรุณาเลือกวันเริ่มนับ'; }
    if (!count($p['rules'])) {
        $e['rules'] = 'ต้องมีเงื่อนไขผู้มีสิทธิ์อย่างน้อย 1 ข้อ';
    } elseif (count($p['rules']) > WELFARE_MAX_RULES) {
        $e['rules'] = 'เงื่อนไขได้ไม่เกิน ' . WELFARE_MAX_RULES . ' ข้อ';
    }
    $ids = array();
    foreach ($p['rules'] as $i => $r) {
        $k = 'rules.' . $i . '.';
        if (!is_int($r['id']) || $r['id'] < 1 || isset($ids[$r['id']])) { $e[$k . 'id'] = 'รหัสเงื่อนไขไม่ถูกต้อง'; }
        if (is_int($r['id'])) { $ids[$r['id']] = true; }
        foreach (array('levelMin', 'levelMax') as $f) {
            if ($r[$f] !== null && !(is_int($r[$f]) && $r[$f] >= 1 && $r[$f] <= 20)) { $e[$k . $f] = 'ระดับต้องเป็นเลข 1–20'; }
        }
        if ($r['levelMin'] !== null && $r['levelMax'] !== null && !isset($e[$k . 'levelMax']) && !isset($e[$k . 'levelMin'])
            && $r['levelMin'] > $r['levelMax']) { $e[$k . 'levelMax'] = 'ระดับสูงสุดต้องไม่น้อยกว่าต่ำสุด'; }
        if (!(is_int($r['waitDays']) && $r['waitDays'] >= 0 && $r['waitDays'] <= 3650)) { $e[$k . 'waitDays'] = 'จำนวนวันต้องเป็นเลข 0–3650'; }
        if ($r['amount'] !== null && !(welfare_is_num($r['amount']) && $r['amount'] >= 0)) { $e[$k . 'amount'] = 'จำนวนต้องเป็นตัวเลขไม่ติดลบ'; }
        if ($r['genders'] !== null) {
            foreach ($r['genders'] as $g) { if ($g !== 'M' && $g !== 'F') { $e[$k . 'genders'] = 'เพศไม่ถูกต้อง'; } }
        }
    }
    if (count($p['fields']) > WELFARE_MAX_FIELDS) { $e['fields'] = 'ช่องข้อมูลได้ไม่เกิน ' . WELFARE_MAX_FIELDS . ' ช่อง'; }
    $keys = array();
    foreach ($p['fields'] as $i => $f) {
        $k = 'fields.' . $i . '.';
        if (!preg_match('/^[a-z][a-z0-9_]{0,29}$/', $f['key']) || isset($keys[$f['key']])) { $e[$k . 'key'] = 'รหัสช่องข้อมูลไม่ถูกต้อง'; }
        $keys[$f['key']] = true;
        if ($f['label'] === '') { $e[$k . 'label'] = 'กรุณาตั้งชื่อช่อง'; }
        if (!in_array($f['type'], welfare_field_types(), true)) {
            $e[$k . 'type'] = 'ชนิดข้อมูลไม่ถูกต้อง';
        } elseif ($f['type'] === 'select' && !count($f['options'])) {
            $e[$k . 'options'] = 'ใส่ตัวเลือกอย่างน้อย 1 ค่า';
        }
    }
    return $e;
}

/** จำนวนพนักงานที่ยังค้างให้ (ตัวนับบนเมนู) — ANYTIME ไม่นับ (ใช้สิทธิ์เมื่อพนักงานขอ ไม่ใช่งานค้าง) */
function welfare_due_count($program, $employees, $records, $today)
{
    if ($program['frequency'] === 'ANYTIME') { return 0; }
    $n = 0;
    foreach ($employees as $e) {
        $s = welfare_status($e, $program, $records, $today);
        if ($s['state'] === 'DUE') { $n++; }
    }
    return $n;
}

/** ชื่อรอบ: ONCE = ครั้งเดียว · Y-2026 = ปี 2569 · M-2026-03 = มี.ค. 2569 (พ.ศ.) */
function welfare_period_label($key)
{
    $months = array('ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.');
    if ($key === 'ONCE') { return 'ครั้งเดียว'; }
    if (preg_match('/^Y-(\d{4})$/', $key, $m)) { return 'ปี ' . ((int)$m[1] + 543); }
    if (preg_match('/^M-(\d{4})-(\d{2})$/', $key, $m)) { return $months[(int)$m[2] - 1] . ' ' . ((int)$m[1] + 543); }
    return $key;
}
