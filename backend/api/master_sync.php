<?php
/* ============================================================
 *  backend/api/master_sync.php — ส่งบริษัท/หน่วยงาน/ชุดฟอร์มรอบเริ่มงานให้สต็อก Uniform
 *
 *    POST /stock/sync-master        ส่งทั้งหมดเดี๋ยวนี้ (ปุ่ม "ส่งข้อมูลไปสต็อก" หน้าหน่วยงาน)
 *    master_sync_after_change()     เรียกหลังเพิ่ม/แก้/ลบหน่วยงาน แก้กฎชุดฟอร์ม หรือตั้งชุดฟอร์มของหน่วยงาน
 *
 *  ส่งไม่สำเร็จ (สต็อกล่ม / ยังไม่ตั้งค่า) ต้องไม่ทำให้การบันทึกในระบบนี้ล้ม — คืนข้อความเตือนให้หน้าจอแสดงแทน
 *  กฎที่ตั้งล่วงหน้าเปลี่ยนสิทธิ์เมื่อถึงวันมีผล: กดส่งเองหรือรอการแก้ครั้งถัดไป (สต็อกแสดงเวลาที่รับล่าสุด)
 *  ผลทุกครั้งบันทึกในบันทึกกิจกรรม entity STOCK_REQUEST action SYNC
 * ============================================================ */

function stock_sync_master($payload, $actor)
{
    foreach (stock_actor_fields($actor) as $k => $v) { $payload[$k] = $v; }
    return stock_call($payload);
}

/** ยังไม่ได้ตั้งที่อยู่/กุญแจของสต็อก = ข้ามเงียบ ๆ (เครื่องพัฒนา / เทสต์ที่ไม่ใช้สต็อก) */
function master_sync_configured()
{
    if (!empty($GLOBALS['hlw_stock_fake'])) { return true; }
    return sys_setting('stock_api_url') !== '' && sys_setting('stock_api_secret') !== '';
}

/**
 * ส่งหลังการแก้ข้อมูล — คืน null ถ้าสำเร็จ/ข้าม หรือข้อความเตือน (ไม่โยน error)
 * $siteIds = null ทุกหน่วยงาน · $removed = หน่วยงานที่เพิ่งลบ
 */
function master_sync_after_change($actor, $siteIds = null, $removed = array())
{
    if (!master_sync_configured()) { return null; }
    try {
        $payload = build_master_payload(repo_companies(), repo_sites(), repo_rules(), $siteIds, $removed);
        stock_sync_master($payload, $actor);
        return null;
    } catch (Exception $e) {
        $msg = 'บันทึกแล้ว แต่ส่งข้อมูลไปสต็อก Uniform ไม่สำเร็จ (' . $e->getMessage() . ') — กด "ส่งข้อมูลไปสต็อก" ที่หน้าหน่วยงานอีกครั้ง';
        try {
            audit_write('STOCK_REQUEST', 'MASTER', 'SYNC', 'ส่งข้อมูลหลักไปสต็อกไม่สำเร็จ: ' . $e->getMessage(), null, $actor);
        } catch (Exception $ignored) {
            /* บันทึกกิจกรรมไม่ได้ก็ไม่เป็นไร — ห้ามทำให้งานหลักล้ม */
        }
        return $msg;
    }
}

/** POST /stock/sync-master — ส่งทุกบริษัท/หน่วยงาน/ชุดฟอร์มรอบเริ่มงานเดี๋ยวนี้ */
function api_stock_sync_master($req, $params)
{
    $u = function_exists('cap_require') ? cap_require($req, 'sites.edit') : auth_require($req);
    if (function_exists('scope_require_all')) { scope_require_all(); }   // ส่งทุกบริษัท — HR บริษัทกดไม่ได้
    if (!master_sync_configured()) {
        throw new ApiError('ยังไม่ได้ตั้งค่าการเชื่อมต่อสต็อก Uniform (หน้าผู้ดูแลระบบ › ตั้งค่าระบบ)', 409, null, 'STOCK_NOT_CONFIGURED');
    }
    $payload = build_master_payload(repo_companies(), repo_sites(), repo_rules());
    $res = stock_sync_master($payload, $u);
    $created = 0;
    foreach ((array)arr_get($res, 'sites', array()) as $s) { if (!empty($s['created'])) { $created++; } }
    $summary = 'ส่งข้อมูลหลักไปสต็อก: บริษัท ' . count($payload['companies']) . ' · หน่วยงาน ' . count($payload['sites'])
        . ($created ? ' (สต็อกสร้างหน่วยงานใหม่ ' . $created . ')' : '');
    audit_write('STOCK_REQUEST', 'MASTER', 'SYNC', $summary, null, $u);
    return array('companies' => count($payload['companies']), 'sites' => count($payload['sites']), 'createdSites' => $created,
        'message' => $summary);
}
