<?php
/* ============================================================
 *  backend/permissions.php — สิทธิ์การใช้งานรายบทบาท (capability)
 *
 *  perm_defs()        รายการ capability: ป้าย, กลุ่ม, ชนิด (view = เห็นหน้า · action = ทำรายการ), บทบาทเริ่มต้น, handler ที่ตรวจ
 *  cap_allowed()      บทบาทนี้ทำได้ไหม — SUPER_ADMIN ได้ทุกอย่างเสมอ · แถวใน role_capabilities (migration 008) · ไม่มีแถว = ค่าเริ่มต้น
 *  cap_require()      ใช้ใน handler: ไม่มีสิทธิ์ → 403 FORBIDDEN
 *  auth_route_guard() route guard (api/routes.php): ต้อง login + ถ้า handler อยู่ใน perm_defs ต้องมีสิทธิ์นั้น
 *
 *  สิทธิ์ "เห็นหน้า" ตรวจที่เซิร์ฟเวอร์เฉพาะ endpoint ที่หน้านั้นใช้คนเดียว — รายการที่หลายหน้าใช้ร่วม (พนักงาน หน่วยงาน กฎ
 *  ตัวเลขภาพรวม บันทึกกิจกรรม) อ่านได้ทุกคนที่ login · สิทธิ์ "ทำรายการ" ตรวจทุก endpoint ที่เขียนข้อมูล
 *  หน้าเว็บซ่อนเมนู/ปุ่มตาม caps ใน AuthUser (/auth/login, /auth/me)
 * ============================================================ */

function perm_defs()
{
    $all = array('HR_ADMIN', 'HR_COMPANY', 'PAYROLL', 'STOCK', 'EXECUTIVE');
    return array(
        'dashboard.view' => array('group' => 'ภาพรวม & ติดตามงาน', 'kind' => 'view', 'label' => 'เห็นหน้าภาพรวม & คิวงาน', 'page' => 'dashboard',
            'roles' => $all, 'handlers' => array('api_work_queue')),
        'employees.view' => array('group' => 'พนักงาน', 'kind' => 'view', 'label' => 'เห็นหน้าพนักงาน + สิทธิของแต่ละคน', 'page' => 'employees',
            'roles' => $all, 'handlers' => array('api_employee_benefits')),
        'employees.edit' => array('group' => 'พนักงาน', 'kind' => 'action', 'label' => 'เพิ่ม / แก้ไข / ลบพนักงาน',
            'roles' => $all, 'handlers' => array('api_employee_save', 'api_employee_delete')),
        'insurance.view' => array('group' => 'ประกันกลุ่ม', 'kind' => 'view', 'label' => 'เห็นหน้าประกันกลุ่ม (รอบแจ้ง ประวัติ)', 'page' => 'insurance',
            'roles' => $all, 'handlers' => array('api_insurance_cycle', 'api_batches', 'api_batch')),
        'insurance.export' => array('group' => 'ประกันกลุ่ม', 'kind' => 'action', 'label' => 'ส่งออกไฟล์แจ้งบริษัทประกัน',
            'roles' => $all, 'handlers' => array('api_insurance_export', 'api_batch_export')),
        'insurance.submit' => array('group' => 'ประกันกลุ่ม', 'kind' => 'action', 'label' => 'บันทึกว่าแจ้งแล้ว / ยกเลิกการแจ้ง',
            'roles' => $all, 'handlers' => array('api_batch_submit', 'api_batch_cancel')),
        'uniform.view' => array('group' => 'ชุดฟอร์ม', 'kind' => 'view', 'label' => 'เห็นหน้าชุดฟอร์ม (ค้างแจก ประวัติ)', 'page' => 'uniform',
            'roles' => $all, 'handlers' => array('api_issues', 'api_pending')),
        'uniform.issue' => array('group' => 'ชุดฟอร์ม', 'kind' => 'action', 'label' => 'บันทึกแจกชุดเอง / ยกเลิกการแจก',
            'roles' => $all, 'handlers' => array('api_issue_create', 'api_issue_cancel')),
        'stock.request' => array('group' => 'ชุดฟอร์ม', 'kind' => 'action', 'label' => 'ส่งเบิก / ยกเลิกใบเบิกในสต็อก Uniform',
            'roles' => array('HR_ADMIN', 'HR_COMPANY'), 'handlers' => array('api_stock_request')),
        'rules.view' => array('group' => 'เงื่อนไขสวัสดิการ', 'kind' => 'view', 'label' => 'เห็นหน้าเงื่อนไขสวัสดิการ', 'page' => 'rules',
            'roles' => $all, 'handlers' => array()),
        'rules.edit' => array('allCompanies' => true, 'group' => 'เงื่อนไขสวัสดิการ', 'kind' => 'action', 'label' => 'แก้เงื่อนไขสวัสดิการ',
            'roles' => array('HR_ADMIN'), 'handlers' => array()),
        'sites.view' => array('group' => 'หน่วยงาน', 'kind' => 'view', 'label' => 'เห็นหน้าหน่วยงาน', 'page' => 'sites',
            'roles' => $all, 'handlers' => array()),
        'sites.edit' => array('group' => 'หน่วยงาน', 'kind' => 'action', 'label' => 'เพิ่ม / แก้ไข / ลบหน่วยงาน',
            'roles' => $all, 'handlers' => array('api_site_create', 'api_site_update', 'api_site_delete')),
        'org.edit' => array('allCompanies' => true, 'group' => 'หน่วยงาน', 'kind' => 'action', 'label' => 'ตั้งค่าบริษัท / ประเภทพนักงาน / กลุ่ม-ฝ่าย (เพิ่ม แก้ ลบ)',
            'roles' => array('HR_ADMIN'), 'handlers' => array()),
        'insurers.view' => array('group' => 'แบบฟอร์มประกัน', 'kind' => 'view', 'label' => 'เห็นหน้าแบบฟอร์มประกัน', 'page' => 'insurers',
            'roles' => $all, 'handlers' => array('api_insurers')),
        'insurers.edit' => array('allCompanies' => true, 'group' => 'แบบฟอร์มประกัน', 'kind' => 'action', 'label' => 'แก้แบบฟอร์ม / ผูกบริษัทกับบริษัทประกัน',
            'roles' => $all, 'handlers' => array('api_insurer_save', 'api_insurer_bindings', 'api_insurer_delete')),
        /* ---------- ผู้ดูแลระบบ (api/admin.php ตรวจเอง) — บัญชี SUPER_ADMIN แก้ได้เฉพาะ SUPER_ADMIN เสมอ ---------- */
        'users.manage' => array('allCompanies' => true, 'group' => 'ผู้ดูแลระบบ', 'kind' => 'action', 'label' => 'จัดการผู้ใช้ระบบ (เพิ่ม แก้ ปิดบัญชี ตั้งรหัสผ่าน)',
            'page' => 'admin-users', 'roles' => array('HR_ADMIN'), 'handlers' => array()),
        'security.view' => array('allCompanies' => true, 'group' => 'ผู้ดูแลระบบ', 'kind' => 'action', 'label' => 'ดูการเข้าสู่ระบบ / จบ session / ปลดล็อก',
            'roles' => array(), 'handlers' => array()),
        'system.health' => array('allCompanies' => true, 'group' => 'ผู้ดูแลระบบ', 'kind' => 'action', 'label' => 'ดูสถานะระบบ / ล้างข้อมูลเก่า',
            'roles' => array(), 'handlers' => array()),
        'system.settings' => array('allCompanies' => true, 'group' => 'ผู้ดูแลระบบ', 'kind' => 'action', 'label' => 'ตั้งค่าระบบ + การเชื่อมต่อสต็อก Uniform',
            'roles' => array(), 'handlers' => array()),
        'audit.view' => array('allCompanies' => true, 'group' => 'ผู้ดูแลระบบ', 'kind' => 'action', 'label' => 'ดูบันทึกการใช้งานทั้งหมด (รวมการเข้าสู่ระบบ)',
            'roles' => array(), 'handlers' => array()),
    );
}

/** บทบาทที่ตั้งสิทธิ์ได้ (SUPER_ADMIN ได้ทุกอย่างเสมอ) */
function perm_roles()
{
    $out = array();
    foreach ($GLOBALS['hlw_role_labels'] as $code => $label) {
        if ($code !== 'SUPER_ADMIN') { $out[$code] = $label; }
    }
    return $out;
}

/** array(role => array(cap => bool)) จากตาราง — ไม่มีตาราง (ยังไม่รัน 008) = array() */
function perm_rows()
{
    if (isset($GLOBALS['hlw_perm_rows']) && is_array($GLOBALS['hlw_perm_rows'])) { return $GLOBALS['hlw_perm_rows']; }
    $out = array();
    try {
        foreach (db_all('SELECT role, capability, allowed FROM role_capabilities') as $r) { $out[$r['role']][$r['capability']] = (bool)$r['allowed']; }
    } catch (DbError $e) {
        if ($e->errno !== 1146) { throw $e; }
    }
    $GLOBALS['hlw_perm_rows'] = $out;
    return $out;
}

function perm_reset_cache()
{
    $GLOBALS['hlw_perm_rows'] = null;
}

function cap_default($role, $cap)
{
    $defs = perm_defs();
    return isset($defs[$cap]) && in_array($role, $defs[$cap]['roles'], true);
}

function cap_allowed($role, $cap)
{
    if ($role === 'SUPER_ADMIN') { return true; }
    $defs = perm_defs();
    if (!isset($defs[$cap])) { return false; }
    if (scoped_role($role) && !empty($defs[$cap]['allCompanies'])) { return false; }   // มีผลทุกบริษัท → บทบาทที่ดูแลบริษัทเดียวทำไม่ได้
    $rows = perm_rows();
    return isset($rows[$role][$cap]) ? $rows[$role][$cap] : cap_default($role, $cap);
}

/** capability ที่บทบาทนี้มี (ส่งให้หน้าเว็บใน AuthUser.caps) */
function caps_for_role($role)
{
    $out = array();
    foreach (perm_defs() as $cap => $d) {
        if (cap_allowed($role, $cap)) { $out[] = $cap; }
    }
    return $out;
}

/** บทบาทที่มี capability นี้ (รวม SUPER_ADMIN) */
function cap_roles($cap)
{
    $out = array('SUPER_ADMIN');
    foreach (perm_roles() as $role => $label) {
        if (cap_allowed($role, $cap)) { $out[] = $role; }
    }
    return $out;
}

function cap_forbidden($cap)
{
    $defs = perm_defs();
    $label = isset($defs[$cap]) ? $defs[$cap]['label'] : $cap;
    return new ApiError('บัญชีนี้ไม่มีสิทธิ์ ' . $label . ' — ติดต่อผู้ดูแลระบบ', 403, null, 'FORBIDDEN');
}

/** ใน handler: ต้อง login และมีสิทธิ์ $cap · คืนผู้ใช้ */
function cap_require($req, $cap)
{
    $u = auth_require($req);
    if (!cap_allowed($u['role'], $cap)) { throw cap_forbidden($cap); }
    return $u;
}

/* ============================================================
 *  ขอบเขตบริษัท — HR บริษัท (HR_COMPANY) เห็นและทำรายการได้เฉพาะพนักงานบริษัทของตัวเอง (users.company_code)
 *  repo_employees / repo_employee / repo_issues / repo_batches กรองให้เอง (repo/repo.php) · handler ตรวจตอนเขียน
 *  บทบาทอื่นเห็นทุกบริษัท · capability ที่มี allCompanies (กฎ แบบฟอร์มประกัน ผู้ใช้ ระบบ) บทบาทนี้ทำไม่ได้
 * ============================================================ */
function scoped_role($role)
{
    return $role === 'HR_COMPANY';
}

/** null = ทุกบริษัท · 'CNS' = เฉพาะ CNS · '' = ไม่มีบริษัทไหนเลย (HR บริษัทที่ยังไม่ได้กำหนดบริษัท) */
function user_scope($u)
{
    return ($u && scoped_role($u['role'])) ? (string)$u['companyCode'] : null;
}

/** ขอบเขตของผู้ใช้ในคำขอนี้ (auth_user ตั้งไว้) — ไม่มีผู้ใช้ (CLI / งานตั้งเวลา) = ทุกบริษัท */
function data_scope()
{
    return user_scope(isset($GLOBALS['hlw_auth_user']) ? $GLOBALS['hlw_auth_user'] : null);
}

function in_scope($companyCode)
{
    $s = data_scope();
    return $s === null || $companyCode === $s;
}

function scope_forbidden()
{
    $s = data_scope();
    return new ApiError($s === '' ? 'บัญชี HR บริษัทนี้ยังไม่ได้กำหนดบริษัท — ติดต่อผู้ดูแลระบบ'
        : 'บัญชีนี้ดูแลเฉพาะพนักงานบริษัท ' . $s, 403, null, 'OUT_OF_SCOPE');
}

function scope_require($companyCode)
{
    if (!in_scope($companyCode)) { throw scope_forbidden(); }
}

/** งานที่มีผลทุกบริษัท (ส่งข้อมูลหลักทั้งหมดไปสต็อก ฯลฯ) — บัญชีที่ดูแลบริษัทเดียวทำไม่ได้ */
function scope_require_all()
{
    if (data_scope() !== null) {
        throw new ApiError('งานนี้มีผลกับทุกบริษัท — ให้ HR ส่วนกลางหรือผู้ดูแลระบบทำ', 403, null, 'OUT_OF_SCOPE');
    }
}

/** handler → capability (สร้างครั้งเดียว) */
function perm_handler_caps()
{
    static $map = null;
    if ($map !== null) { return $map; }
    $map = array();
    foreach (perm_defs() as $cap => $d) {
        foreach ($d['handlers'] as $h) { $map[$h] = $cap; }
    }
    return $map;
}

/** route guard: login + สิทธิ์ของ handler (ถ้ามี) — router_dispatch ส่ง ($req, $handler) */
function auth_route_guard($req, $handler = null)
{
    $u = auth_require($req);
    /* ผู้ดูแลตั้ง/รีเซ็ตรหัสให้ (เช่น 4123) → ใช้ได้แค่ดูตัวเองกับเปลี่ยนรหัสผ่าน จนกว่าจะตั้งรหัสเอง */
    if ($u['mustChangePassword'] && !in_array($handler, array('api_auth_me', 'api_auth_password'), true)) {
        throw new ApiError('กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน (รหัสผ่านนี้ผู้ดูแลระบบตั้งให้)', 403, null, 'PASSWORD_CHANGE_REQUIRED');
    }
    $map = perm_handler_caps();
    if ($handler !== null && isset($map[$handler]) && !cap_allowed($u['role'], $map[$handler])) { throw cap_forbidden($map[$handler]); }
    return $u;
}
