<?php
/* ============================================================
 *  backend/api/routes.php — ตาราง endpoint (สเปกข้อ 8) · path ต่อจาก web/api/index.php
 *  ทุก route ต้องมี session ยกเว้นที่ระบุ public (login / refresh / logout)
 * ============================================================ */

$GLOBALS['hlw_route_guard'] = 'auth_require';

function api_routes()
{
    static $r = null;
    if ($r !== null) { return $r; }
    $r = array();
    router_add($r, 'POST', '/auth/login', 'api_auth_login', true);
    router_add($r, 'POST', '/auth/refresh', 'api_auth_refresh', true);
    router_add($r, 'POST', '/auth/logout', 'api_auth_logout', true);
    router_add($r, 'GET', '/auth/me', 'api_auth_me');
    router_add($r, 'POST', '/auth/password', 'api_auth_password');

    router_add($r, 'GET', '/dashboard', 'api_dashboard');
    router_add($r, 'GET', '/monitor/tasks', 'api_work_queue');
    router_add($r, 'GET', '/activity', 'api_activity');

    router_add($r, 'GET', '/companies', 'api_companies');
    router_add($r, 'GET', '/sites', 'api_sites');
    router_add($r, 'POST', '/sites', 'api_site_create');
    router_add($r, 'PATCH', '/sites/{id}', 'api_site_update');
    router_add($r, 'DELETE', '/sites/{id}', 'api_site_delete');

    router_add($r, 'GET', '/employees', 'api_employees');
    router_add($r, 'POST', '/employees', 'api_employee_save');
    router_add($r, 'PUT', '/employees/{id}', 'api_employee_save');
    router_add($r, 'DELETE', '/employees/{id}', 'api_employee_delete');
    router_add($r, 'GET', '/employees/{id}/benefits', 'api_employee_benefits');
    router_add($r, 'GET', '/rules', 'api_rules');

    router_add($r, 'GET', '/insurance/cycles/{date}', 'api_insurance_cycle');
    router_add($r, 'GET', '/insurance/batches', 'api_batches');
    router_add($r, 'POST', '/insurance/batches', 'api_batch_submit');
    router_add($r, 'GET', '/insurance/batches/{id}', 'api_batch');
    router_add($r, 'DELETE', '/insurance/batches/{id}', 'api_batch_cancel');
    router_add($r, 'GET', '/insurance/batches/{id}/export', 'api_batch_export');
    router_add($r, 'POST', '/insurance/exports', 'api_insurance_export');

    router_add($r, 'GET', '/insurers', 'api_insurers');
    router_add($r, 'POST', '/insurers', 'api_insurer_save');
    router_add($r, 'PUT', '/insurers/bindings', 'api_insurer_bindings');
    router_add($r, 'PUT', '/insurers/{id}', 'api_insurer_save');
    router_add($r, 'DELETE', '/insurers/{id}', 'api_insurer_delete');

    router_add($r, 'GET', '/uniform/issues', 'api_issues');
    router_add($r, 'POST', '/uniform/issues', 'api_issue_create');
    router_add($r, 'DELETE', '/uniform/issues/{id}', 'api_issue_cancel');
    router_add($r, 'GET', '/uniform/pending', 'api_pending');
    router_add($r, 'GET', '/uniform/stock-options', 'api_stock_options');
    router_add($r, 'POST', '/uniform/stock-requests', 'api_stock_request');
    router_add($r, 'POST', '/uniform/stock-sync', 'api_stock_sync');

    router_add($r, 'POST', '/stock/bridge', 'api_stock_bridge');
    return $r;
}
