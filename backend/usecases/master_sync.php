<?php
/* ============================================================
 *  backend/usecases/master_sync.php — ข้อมูลหลักที่ส่งให้สต็อก Uniform (คำสั่ง sync_master)
 *
 *  ระบบสวัสดิการเป็นต้นทางของ บริษัท / หน่วยงาน / ชุดฟอร์มรอบเริ่มงาน
 *  สต็อกรับตามเท่านั้น (stock_hr/backend/welfare_master.php — upsert, ไม่ลบ, ทั้งชุดใน transaction เดียว)
 *
 *    companies      [{code, name (ชื่อเต็ม "บริษัท … จำกัด"), active}]
 *    sites          [{id, company_code, name, active}]
 *    uniform_start  [{site_id, rules: [{rule_id, label, items: [{item_code, qty}]}]}]
 *                   กฎชุดฟอร์มที่ใช้กับบริษัทของหน่วยงานนั้น และได้ชุดรอบเริ่มงาน (ตามที่หน่วยงานตั้งทับด้วย)
 *                   สต็อกแสดงในหน้าอุปกรณ์พนักงานใหม่ (อ่านอย่างเดียว) — แต่ละหน่วยงานที่ส่ง = แทนที่ทั้งชุด
 *  ไม่มีการเรียกเครือข่ายในไฟล์นี้
 * ============================================================ */

/** คำอธิบายกฎสั้น ๆ ที่สต็อกแสดง: "Pro Site · ช่างทีมโมบาย" / "ส่วนกลาง · Support Line · ระดับ 1–5" */
function master_rule_label($rule)
{
    $who = $rule['position'] !== null ? $rule['position']
        : ($rule['deptGroups'] !== null ? implode(', ', $rule['deptGroups']) : 'ทุกกลุ่ม/ฝ่าย');
    $parts = array(label_employee_type($rule['employeeType']), $who);
    if ($rule['levelMin'] !== null || $rule['levelMax'] !== null) {
        $parts[] = 'ระดับ ' . ($rule['levelMin'] !== null ? $rule['levelMin'] : 1) . '–' . ($rule['levelMax'] !== null ? $rule['levelMax'] : 9);
    }
    return implode(' · ', $parts);
}

/** ชุดฟอร์มรอบเริ่มงานของหน่วยงานหนึ่ง: [{rule_id, label, items}] — กฎที่ไม่ได้ชุดรอบเริ่มงานไม่ส่ง */
function master_site_uniform_start($site, $rules)
{
    $out = array();
    foreach ($rules['uniform'] as $rule) {
        if (!in_array($site['companyCode'], $rule['companies'], true)) { continue; }
        $q = site_quantities($rule, $site);
        if (sum_qty($q['START']) <= 0) { continue; }
        $items = array();
        foreach ($q['START'] as $code => $n) { $items[] = array('item_code' => $code, 'qty' => (int)$n); }
        $out[] = array('rule_id' => (int)$rule['id'], 'label' => master_rule_label($rule), 'items' => $items);
    }
    return $out;
}

/**
 * payload ของ sync_master
 * $siteIds = null → ทุกหน่วยงาน · array(…) → เฉพาะหน่วยงานเหล่านี้ (บริษัทส่งครบเสมอ — มีไม่กี่แถว)
 * $removed = หน่วยงานที่เพิ่งลบในระบบนี้ [{id, companyCode, name}] → ส่ง active = false (สต็อกปิดใช้งาน ไม่ลบ)
 */
function build_master_payload($companies, $sites, $rules, $siteIds = null, $removed = array())
{
    $c = array();
    foreach ($companies as $co) {
        $name = isset($co['legalName']) && $co['legalName'] !== null && $co['legalName'] !== '' ? $co['legalName'] : $co['name'];
        $c[] = array('code' => $co['code'], 'name' => $name, 'active' => true);
    }
    $s = array();
    $u = array();
    foreach ($sites as $site) {
        if ($siteIds !== null && !in_array((int)$site['id'], $siteIds, true)) { continue; }
        $s[] = array('id' => (int)$site['id'], 'company_code' => $site['companyCode'], 'name' => $site['name'], 'active' => true);
        $u[] = array('site_id' => (int)$site['id'], 'rules' => master_site_uniform_start($site, $rules));
    }
    foreach ($removed as $site) {
        $s[] = array('id' => (int)$site['id'], 'company_code' => $site['companyCode'], 'name' => $site['name'], 'active' => false);
    }
    return array('action' => 'sync_master', 'companies' => $c, 'sites' => $s, 'uniform_start' => $u);
}
