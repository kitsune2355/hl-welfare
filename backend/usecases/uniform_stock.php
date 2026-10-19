<?php
/* ============================================================
 *  backend/usecases/uniform_stock.php — คู่แฝดของ application/usecases/uniformStock.js
 *  แปลงข้อมูลไป/กลับระหว่างสิทธิ์ชุดฟอร์มของระบบนี้กับใบเบิกของสต็อก Uniform (ไม่เรียกเครือข่าย)
 * ============================================================ */

function stock_ref($employeeId, $entitlementKey)
{
    return $employeeId . ':' . $entitlementKey;
}

/**
 * จำนวนตั้งต้นต่อรายการ = จำนวนต่อรายการของสิทธิ์ (ent.itemQty — ตามกฎหรือที่หน่วยงานตั้งทับ)
 * สิทธิ์รุ่นก่อนที่ไม่มี itemQty: รองเท้า 1 คู่ นอกนั้นตามจำนวนรวม
 */
function default_line_qty($itemCode, $qty, $itemQty = null)
{
    if (is_array($itemQty) && isset($itemQty[$itemCode])) { return $itemQty[$itemCode]; }
    return $itemCode === 'SAFETY_SHOES' ? 1 : $qty;
}

function __preferred_variant($variants, $gender)
{
    $want = $gender === 'F' ? 'หญิง' : ($gender === 'M' ? 'ชาย' : null);
    if ($want !== null) {
        foreach ($variants as $i => $v) {
            if (strpos($v['label'], $want) !== false) { return $i; }
        }
    }
    return 0;
}

/** ตัวเลือกในหน้าส่งเบิก จากคำตอบ catalog ของระบบสต็อก */
function build_stock_options($ent, $catalog, $emp)
{
    $byCode = array();
    foreach ((array)arr_get($catalog, 'items', array()) as $i) { $byCode[$i['item_code']] = $i; }
    $items = array();
    foreach ($ent['items'] as $code) {
        $variants = array();
        $src = isset($byCode[$code]['variants']) ? $byCode[$code]['variants'] : array();
        foreach ($src as $v) {
            $products = array();
            foreach ($v['products'] as $p) {
                $products[] = array('productId' => $p['product_id'], 'code' => $p['product_code'], 'name' => $p['product_name'],
                    'size' => $p['size'], 'onHand' => $p['on_hand']);
            }
            $variants[] = array('subCategoryId' => $v['sub_category_id'], 'label' => $v['variant_label'],
                'name' => $v['sub_category_name'], 'products' => $products);
        }
        $items[] = array('itemCode' => $code, 'qty' => default_line_qty($code, $ent['qty'], arr_get($ent, 'itemQty')), 'variants' => $variants,
            'variantIndex' => __preferred_variant($variants, arr_get($emp, 'gender')));
    }
    $d = arr_get($catalog, 'department');
    $kit = array();
    foreach ((array)arr_get($catalog, 'kit', array()) as $k) {
        $kit[] = array('productId' => $k['product_id'], 'name' => $k['product_name'], 'qty' => $k['qty'],
            'mustReturn' => $k['must_return'], 'onHand' => $k['on_hand']);
    }
    $blockers = array();
    if (!$d) { $blockers[] = 'หน่วยงานของพนักงานยังไม่ได้จับคู่กับหน่วยงานในระบบสต็อก'; }
    foreach ($items as $i) {
        if (!count($i['variants'])) { $blockers[] = 'ยังไม่ได้จับคู่ "' . $i['itemCode'] . '" กับสินค้าในระบบสต็อก'; }
    }
    return array(
        'department' => $d ? array('id' => $d['department_id'], 'name' => $d['department_name'], 'company' => $d['company_name']) : null,
        'items' => $items,
        'docKind' => arr_get($catalog, 'doc_kind') !== null ? $catalog['doc_kind'] : 'request',
        'kit' => $kit,
        'blockers' => $blockers,
    );
}

/** ข้อมูลที่ส่งให้คำสั่ง submit — ผู้ขอเบิกมาจาก session ($actor) เสมอ */
function stock_submit_payload($emp, $site, $ent, $logo, $lines, $actor)
{
    $out = array();
    foreach ($lines as $l) {
        $out[] = array('item_code' => $l['itemCode'], 'product_id' => (int)$l['productId'], 'qty' => (int)$l['qty']);
    }
    $p = array(
        'action' => 'submit',
        'employee_id' => $emp['id'],
        'employee_code' => $emp['empCode'],
        'employee_name' => $emp['firstName'] . ' ' . $emp['lastName'],
        'position_name' => $emp['position'] !== null ? $emp['position'] : ($emp['deptGroup'] !== null ? $emp['deptGroup'] : ''),
        'company_code' => $emp['companyCode'],
        'logo' => $logo,
        'site_id' => $emp['siteId'],
        'site_name' => $site ? $site['name'] : '',
        'event' => $ent['event'],
        'entitlement_key' => $ent['key'],
        'start_date' => $emp['startDate'],
        'lines' => $out,
    );
    foreach (stock_actor_fields($actor) as $k => $v) { $p[$k] = $v; }
    return $p;
}

/** ผู้ขอเบิก ณ ตอนนั้น — stock_hr เก็บใน tb_doc_welfare และใช้ requested_by_user ส่งลิงก์เซ็นรับ */
function stock_actor_fields($actor)
{
    return array(
        'requested_by_name' => $actor['name'],
        'requested_by_user' => $actor['username'],
        'requested_by_user_id' => $actor['id'],
        'requested_by_emp_code' => $actor['empCode'] !== null ? $actor['empCode'] : '',
    );
}

/** สถานะ 1 สิทธิ์จากคำสั่ง status → StockRequest */
function to_stock_request($ref, $s)
{
    $items = array();
    foreach ((array)arr_get($s, 'items', array()) as $i) {
        $items[] = array('productId' => $i['product_id'], 'name' => $i['product_name'], 'size' => $i['size'], 'qty' => $i['qty'],
            'uniform' => arr_get($i, 'uniform') !== false);
    }
    return array(
        'ref' => $ref,
        'docId' => $s['doc_id'],
        'docNo' => $s['doc_no'],
        'stage' => $s['stage'],
        'issuedAt' => arr_get($s, 'issued_at'),
        'receivedAt' => arr_get($s, 'received_at'),
        'cancelNote' => arr_get($s, 'cancel_note') !== null ? $s['cancel_note'] : '',
        'items' => $items,
    );
}

function uniform_lines($stock)
{
    $out = array();
    foreach ($stock['items'] as $i) {
        if (arr_get($i, 'uniform') !== false) { $out[] = $i; }
    }
    return $out;
}

function stock_sizes($stock)
{
    $sizes = array();
    foreach (uniform_lines($stock) as $i) {
        if (!in_array($i['size'], $sizes, true)) { $sizes[] = $i['size']; }
    }
    return count($sizes) ? implode(' · ', $sizes) : '–';
}

/** 'NONE' | 'UPDATE' | 'ISSUED' | 'RECEIVED' | 'CANCELLED' */
function stock_change($prev, $next)
{
    if (!$next) { return 'NONE'; }
    if ($next['stage'] === 'CANCELLED') { return 'CANCELLED'; }
    if ($next['stage'] !== $prev['stage']) { return $next['stage'] === 'REQUESTED' ? 'UPDATE' : $next['stage']; }
    return json_encode($next['items']) === json_encode($prev['items']) ? 'NONE' : 'UPDATE';
}
