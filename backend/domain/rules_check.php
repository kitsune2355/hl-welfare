<?php
/* ============================================================
 *  backend/domain/rules_check.php — กฎตรวจข้อมูลก่อนบันทึก
 *    คู่แฝดของ domain/thaiId.js, domain/insurerForm.js (ส่วนที่ server ใช้),
 *    application/employeeRules.js (validateEmployee), application/insurerFormRules.js
 *  คืน array('field' => 'ข้อความ') — ว่าง = ผ่าน
 * ============================================================ */

function digits_only($s)
{
    return preg_replace('/\D/', '', (string)$s);
}

function is_valid_thai_id($id)
{
    $d = digits_only($id);
    if (!preg_match('/^\d{13}$/', $d)) { return false; }
    $sum = 0;
    for ($i = 0; $i < 12; $i++) { $sum += (int)$d[$i] * (13 - $i); }
    return (11 - ($sum % 11)) % 10 === (int)$d[12];
}

/** = validateEmployee() ใน application/employeeRules.js */
function validate_employee($e)
{
    $x = array();
    if (!empty($e['nationalId']) && !is_valid_thai_id($e['nationalId'])) {
        $x['nationalId'] = 'เลขบัตรประชาชนไม่ถูกต้อง (13 หลัก / ตรวจหลักสุดท้ายไม่ผ่าน)';
    }
    if (!empty($e['phone']) && !preg_match('/^0\d{8,9}$/', digits_only($e['phone']))) {
        $x['phone'] = 'เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก';
    }
    if (!empty($e['email']) && !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $e['email'])) {
        $x['email'] = 'รูปแบบอีเมลไม่ถูกต้อง';
    }
    if (str_trim(arr_get($e, 'empCode', '')) === '')   { $x['empCode'] = 'กรุณากรอกรหัสพนักงาน'; }
    if (str_trim(arr_get($e, 'firstName', '')) === '') { $x['firstName'] = 'กรุณากรอกชื่อ'; }
    if (str_trim(arr_get($e, 'lastName', '')) === '')  { $x['lastName'] = 'กรุณากรอกนามสกุล'; }
    $birth = arr_get($e, 'birthDate');
    $start = arr_get($e, 'startDate');
    if (!$birth) { $x['birthDate'] = 'กรุณาระบุวันเกิด'; }
    if (!$start) { $x['startDate'] = 'กรุณาระบุวันเริ่มงาน'; }
    if ($birth && $start && strcmp($birth, $start) >= 0) { $x['birthDate'] = 'วันเกิดต้องก่อนวันเริ่มงาน'; }
    $pass = arr_get($e, 'probationPassDate');
    if ($pass && $start && strcmp($pass, $start) < 0) { $x['probationPassDate'] = 'ต้องไม่ก่อนวันเริ่มงาน'; }
    // ไม่ตรวจเงินเดือน / ตำแหน่ง — หน้าพนักงานไม่มีคอลัมน์ให้กรอกแล้ว (คู่กับ application/employeeRules.js)
    if (!arr_get($e, 'siteId')) { $x['siteId'] = 'กรุณาเลือกหน่วยงาน'; }
    $type = arr_get($e, 'employeeType');
    $info = employee_type_info($type);
    if (!$info) { $x['employeeType'] = 'กรุณาเลือกประเภทพนักงาน'; }
    elseif (!employee_type_allows($info, arr_get($e, 'companyCode'))) { $x['employeeType'] = 'ประเภท ' . $info['name'] . ' ใช้กับบริษัทนี้ไม่ได้'; }
    if ($info && $info['usesDeptGroup']) {
        if (!arr_get($e, 'deptGroup')) { $x['deptGroup'] = 'กรุณาเลือกกลุ่ม/ฝ่าย'; }
        // ระดับพนักงาน 1–9 (HR ยืนยันสูงสุดระดับ 9)
        $lv = arr_get($e, 'level');
        if (!(is_numeric($lv) && (float)$lv === floor((float)$lv) && (float)$lv >= 1 && (float)$lv <= 9)) {
            $x['level'] = 'ระดับต้องเป็นตัวเลข 1–9';
        }
    }
    if (arr_get($e, 'status') === 'INACTIVE') {
        if (!arr_get($e, 'endReason')) { $x['endReason'] = 'กรุณาเลือกเหตุผล'; }
        if (!arr_get($e, 'endDate'))   { $x['endDate'] = 'กรุณาระบุวันพ้นสภาพ'; }
        if (arr_get($e, 'endReason') === 'ABSENT_3D' && !arr_get($e, 'lastWorkingDate')) {
            $x['lastWorkingDate'] = 'ขาดงาน 3 วันต้องระบุวันทำงานสุดท้าย';
        }
        if (arr_get($e, 'endDate') && $start && strcmp($e['endDate'], $start) < 0) { $x['endDate'] = 'ต้องไม่ก่อนวันเริ่มงาน'; }
    }
    return $x;
}

/* ---------- แบบฟอร์มบริษัทประกัน ---------- */

/** ฟิลด์พนักงานที่คอลัมน์แต่ละแบบต้องใช้ (COLUMN_SOURCES[x].needs) */
function column_source_needs($source)
{
    $m = array('title' => 'title', 'titleFullName' => 'title', 'gender' => 'gender', 'nationalId' => 'nationalId');
    return isset($m[$source]) ? $m[$source] : null;
}

/** = requiredEmployeeFields() */
function required_employee_fields($form)
{
    $out = array();
    $cols = (isset($form['template']['columns']) && is_array($form['template']['columns'])) ? $form['template']['columns'] : array();
    foreach ($cols as $c) {
        $n = column_source_needs(arr_get($c, 'source'));
        if ($n !== null && !in_array($n, $out, true)) { $out[] = $n; }
    }
    return $out;
}

function insurer_layout_error($l, $label)
{
    if (!is_array($l) || empty($l['sheet'])) { return $label . ': ยังไม่ได้เลือกชีต'; }
    $hr = arr_get($l, 'headerRow'); $he = arr_get($l, 'headerEnd'); $dr = arr_get($l, 'dataRow'); $fr = arr_get($l, 'footerRow');
    if (!($hr >= 1 && $he >= $hr)) { return $label . ': แถวหัวตารางไม่ถูกต้อง'; }
    if (!($dr > $he)) { return $label . ': แถวข้อมูลต้องอยู่ใต้หัวตาราง'; }
    if (!($fr > $dr)) { return $label . ': ส่วนท้ายต้องอยู่ใต้แถวข้อมูล'; }
    $any = false;
    foreach ((array)arr_get($l, 'columns', array()) as $c) {
        if (arr_get($c, 'source') !== 'blank') { $any = true; }
    }
    if (!$any) { return $label . ': ยังไม่ได้ระบุว่าคอลัมน์ไหนใส่ข้อมูลอะไร'; }
    return '';
}

/** = validateInsurerForm() */
function validate_insurer_form($f, $others)
{
    $err = array();
    if (str_trim(arr_get($f, 'name', '')) === '')      { $err['name'] = 'กรุณาระบุชื่อบริษัทประกัน'; }
    if (str_trim(arr_get($f, 'shortName', '')) === '') { $err['shortName'] = 'กรุณาระบุชื่อย่อ (ใช้ในชื่อไฟล์)'; }
    if (!in_array(arr_get($f, 'dateFormat'), array('DD/MM/YYYY', 'D/M/YYYY', 'D/M/YY'), true)) { $err['dateFormat'] = 'รูปแบบวันที่ไม่ถูกต้อง'; }
    if (!in_array(arr_get($f, 'dateEra'), array('BE', 'CE'), true)) { $err['dateEra'] = 'กรุณาเลือก พ.ศ. / ค.ศ.'; }
    $tpl = arr_get($f, 'template');
    if (!$tpl) {
        if (!empty($f['active'])) { $err['template'] = 'ต้องอัปโหลดไฟล์แบบฟอร์ม Excel ก่อนเปิดใช้'; }
    } else {
        $e = insurer_layout_error($tpl, 'ชีตบริษัท');
        if ($e === '' && !empty($tpl['summary'])) { $e = insurer_layout_error($tpl['summary'], 'ชีตสรุป'); }
        if ($e !== '') { $err['template'] = $e; }
    }
    $codes = array();
    foreach ((array)arr_get($f, 'companies', array()) as $c) { $codes[] = arr_get($c, 'companyCode'); }
    if (count(array_unique($codes)) !== count($codes)) {
        $err['companies'] = 'มีบริษัทซ้ำในแบบฟอร์มนี้';
    } elseif (!empty($f['active'])) {
        $clash = array();
        foreach ($others as $o) {
            if ($o['id'] === arr_get($f, 'id') || !$o['active']) { continue; }
            foreach ($o['companies'] as $c) {
                if (in_array($c['companyCode'], $codes, true)) { $clash[] = $c['companyCode'] . ' (' . $o['shortName'] . ')'; }
            }
        }
        if (count($clash)) { $err['companies'] = 'บริษัทนี้ผูกกับบริษัทประกันอื่นที่เปิดใช้อยู่แล้ว: ' . implode(', ', $clash); }
    }
    return $err;
}

/** = validateBindings() */
function validate_bindings($bindings, $forms)
{
    $err = array();
    foreach ($bindings as $b) {
        if (empty($b['insurerId'])) { continue; }
        if (find_by($forms, 'id', (int)$b['insurerId']) === null) { $err[$b['companyCode']] = 'ไม่พบบริษัทประกันที่เลือก'; }
    }
    return $err;
}
