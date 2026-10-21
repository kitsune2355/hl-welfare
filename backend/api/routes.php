<?php
/* ============================================================
 *  backend/api/routes.php — ตาราง endpoint (สเปกข้อ 8) · path ต่อจาก web/api/index.php
 *  ทุก route ต้องมี session ยกเว้นที่ระบุ public (login / refresh / logout)
 *  route guard ตรวจสิทธิ์ตาม handler ด้วย (perm_defs ใน backend/permissions.php)
 * ============================================================ */

$GLOBALS['hlw_route_guard'] = 'auth_route_guard';

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

    /* การแจ้งเตือน (กระดิ่ง) — ทุกคนที่ login เห็นเฉพาะของตัวเอง · usecases/notifications.php */
    router_add($r, 'GET', '/notifications', 'api_notifications');
    router_add($r, 'GET', '/notifications/unread', 'api_notifications_unread');
    router_add($r, 'POST', '/notifications/read-all', 'api_notifications_read_all');
    router_add($r, 'POST', '/notifications/{id}/read', 'api_notification_read');

    router_add($r, 'GET', '/companies', 'api_companies');
    /* ตั้งค่าองค์กร · api/org.php (แก้ = สิทธิ์ org.edit — ตรวจใน handler) */
    router_add($r, 'POST', '/companies', 'api_company_save');
    router_add($r, 'PUT', '/companies/order', 'api_company_order');
    router_add($r, 'PUT', '/companies/{code}', 'api_company_save');
    router_add($r, 'DELETE', '/companies/{code}', 'api_company_delete');
    router_add($r, 'GET', '/employee-types', 'api_employee_types');
    router_add($r, 'POST', '/employee-types', 'api_employee_type_save');
    router_add($r, 'PUT', '/employee-types/{code}', 'api_employee_type_save');
    router_add($r, 'DELETE', '/employee-types/{code}', 'api_employee_type_delete');
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
    /* แก้เงื่อนไขสวัสดิการแบบมีวันที่มีผล · api/rules_edit.php (สิทธิ์ rules.edit — ตรวจใน handler) */
    router_add($r, 'GET', '/rules/history', 'api_rules_history');
    router_add($r, 'PUT', '/rules/settings', 'api_rule_settings_save');
    router_add($r, 'DELETE', '/rules/settings/{key}/{date}', 'api_rule_setting_cancel');
    router_add($r, 'DELETE', '/rules/{kind}/revisions/{revisionId}', 'api_rule_revision_cancel');
    router_add($r, 'POST', '/rules/{kind}', 'api_rule_create');
    router_add($r, 'PUT', '/rules/{kind}/{id}', 'api_rule_update');
    router_add($r, 'DELETE', '/rules/{kind}/{id}', 'api_rule_delete');
    router_add($r, 'PUT', '/sites/{id}/uniform', 'api_site_uniform_save');
    /* กลุ่ม / ฝ่าย · api/dept_groups.php (แก้ = สิทธิ์ org.edit) */
    router_add($r, 'GET', '/dept-groups', 'api_dept_groups');
    router_add($r, 'POST', '/dept-groups', 'api_dept_group_save');
    router_add($r, 'PUT', '/dept-groups/{id}', 'api_dept_group_save');
    router_add($r, 'DELETE', '/dept-groups/{id}', 'api_dept_group_delete');

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
    /* ส่งบริษัท/หน่วยงาน/ชุดฟอร์มรอบเริ่มงานไปสต็อก · api/master_sync.php (สิทธิ์ sites.edit — ตรวจใน handler) */
    router_add($r, 'POST', '/stock/sync-master', 'api_stock_sync_master');

    /* ผู้ดูแลระบบ (SUPER_ADMIN — ตรวจใน handler) · api/admin.php */
    router_add($r, 'GET', '/admin/users', 'api_admin_users');
    router_add($r, 'POST', '/admin/users', 'api_admin_user_create');
    router_add($r, 'PATCH', '/admin/users/{id}', 'api_admin_user_update');
    router_add($r, 'POST', '/admin/users/{id}/password', 'api_admin_user_password');
    router_add($r, 'POST', '/admin/users/{id}/signout', 'api_admin_user_signout');
    router_add($r, 'GET', '/admin/sessions', 'api_admin_sessions');
    router_add($r, 'DELETE', '/admin/sessions/{id}', 'api_admin_session_revoke');
    router_add($r, 'DELETE', '/admin/devices/{familyId}', 'api_admin_device_revoke');
    router_add($r, 'GET', '/admin/login-attempts', 'api_admin_login_attempts');
    router_add($r, 'POST', '/admin/lockouts/clear', 'api_admin_lockout_clear');
    router_add($r, 'GET', '/admin/audit', 'api_admin_audit');
    router_add($r, 'GET', '/admin/health', 'api_admin_health');
    router_add($r, 'POST', '/admin/cleanup', 'api_admin_cleanup');
    router_add($r, 'GET', '/admin/settings', 'api_admin_settings');
    router_add($r, 'PUT', '/admin/settings', 'api_admin_settings_save');
    router_add($r, 'POST', '/admin/stock/test', 'api_admin_stock_test');
    router_add($r, 'GET', '/admin/permissions', 'api_admin_permissions');
    router_add($r, 'PUT', '/admin/permissions', 'api_admin_permissions_save');
    return $r;
}
