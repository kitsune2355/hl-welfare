<?php
/* ============================================================
 *  backend/bootstrap.php — โหลดทุกไฟล์ของ backend (ใช้ทั้ง web/api/index.php, bin/*.php, tests)
 *
 *  โครงแบบเดียวกับ stock_hr: ฟังก์ชันล้วน แยกชั้น
 *    lib/      db, http, security, util           (โครงพื้นฐาน)
 *    domain/   กฎสวัสดิการ — คู่แฝดของ web/assets/js/domain        (ห้ามแตะ DB/HTTP)
 *    usecases/ คู่แฝดของ web/assets/js/application/usecases         (ห้ามแตะ DB/HTTP)
 *    repo/     อ่านตาราง → รูปแบบ JSON ของหน้าเว็บ + audit_log
 *    auth.php, api/*.php   endpoint (อ่านคำขอ → เรียกชั้นล่าง → ตอบ)
 *  เขียนให้รองรับ PHP 5.2.6 / MySQL 5.0 (AppServ)
 * ============================================================ */

error_reporting(E_ALL ^ E_NOTICE);

$hlw_dir = dirname(__FILE__);
if (!isset($GLOBALS['hlw_config'])) {
    $cfgFile = $hlw_dir . '/config.php';
    if (!is_file($cfgFile)) {
        header('HTTP/1.1 503 Service Unavailable');
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(array('error' => 'ยังไม่ได้ตั้งค่าระบบ (backend/config.php — คัดลอกจาก config.example.php)'));
        exit();
    }
    include $cfgFile;
    $GLOBALS['hlw_config'] = $hlw_config;
}
date_default_timezone_set($GLOBALS['hlw_config']['timezone']);

foreach (array('lib/util.php', 'lib/db.php', 'lib/settings.php', 'lib/http.php', 'lib/security.php',
    'domain/date.php', 'domain/labels.php', 'domain/insurance.php', 'domain/uniform.php', 'domain/rules_check.php', 'domain/rule_versions.php',
    'usecases/insurance_cycle.php', 'usecases/overview.php', 'usecases/insurer_export.php', 'usecases/uniform_stock.php', 'usecases/master_sync.php', 'usecases/notifications.php',
    'repo/repo.php', 'auth.php', 'permissions.php', 'api/stock_client.php', 'api/handlers.php', 'api/admin.php', 'api/rules_edit.php', 'api/dept_groups.php', 'api/master_sync.php', 'api/routes.php') as $f) {
    require_once $hlw_dir . '/' . $f;
}

/**
 * รับคำขอ 1 ครั้ง → คำตอบ (ไม่ส่งออก ไม่ exit — เทสต์เรียกตรงได้)
 */
function api_handle($req)
{
    $GLOBALS['hlw_set_cookies'] = array();
    unset($GLOBALS['hlw_auth_user']);
    sys_settings_reset_cache();
    perm_reset_cache();
    try {
        csrf_check($req);
        $res = router_dispatch(api_routes(), $req);
    } catch (ApiError $e) {
        db_rollback();
        $res = http_error_response($e);
    } catch (DbError $e) {
        db_rollback();
        error_log('[hl-welfare] ' . $e->getMessage());
        $res = http_response($e->errno === 1062 ? 409 : 500,
            array('error' => $e->errno ? db_error_message($e->errno) : 'เกิดข้อผิดพลาดภายในระบบ'));
    } catch (Exception $e) {
        db_rollback();
        error_log('[hl-welfare] ' . $e->getMessage());
        $res = http_response(500, array('error' => 'เกิดข้อผิดพลาดภายในระบบ'));
    }
    $res['cookies'] = $GLOBALS['hlw_set_cookies'];
    return $res;
}
