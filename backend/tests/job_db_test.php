<?php
/* ============================================================
 *  backend/tests/job_db_test.php — ดึงพนักงาน CNS รายวันจากระบบสัญญาจ้าง (api/job_db.php)
 *  เรียกจาก tests/run.php · "ต้นทาง" = ตารางจำลองในฐานทดสอบ ไม่แตะ job_db_cns จริง
 * ============================================================ */

section('ดึงพนักงานจากระบบสัญญาจ้าง (job_db_cns)');

$jb = new Browser('10.0.9.31');
$jb->req('POST', '/auth/login', array('username' => 'hr', 'password' => 'Secret-1234'));
$jbPay = new Browser('10.0.9.32');
$jbPay->req('POST', '/auth/login', array('username' => 'payroll', 'password' => 'Payroll-1234'));

$GLOBALS['hlw_job_db'] = false;
$r = $jb->req('GET', '/job-db/employees/preview');
check('ยังไม่ตั้งค่าการเชื่อมต่อ → 409 บอกชื่อไฟล์', $r['status'] === 409 && strpos($r['json']['error'], 'connect_job_db.php') !== false, json_encode($r['json']));

$GLOBALS['hlw_job_db'] = array('host' => $hlw_config['db_host'], 'port' => $hlw_config['db_port'], 'user' => $hlw_config['db_user'], 'pass' => 'รหัสผิด', 'name' => $hlw_config['db_name']);
$r = $jb->req('GET', '/job-db/employees/preview');
check('ต่อไม่ได้ → 503 ไม่เปิดเผยรหัสผ่าน', $r['status'] === 503 && strpos($r['raw'] . json_encode($r['json']), 'รหัสผิด') === false, json_encode($r['json']));

db_exec('CREATE TABLE tb_resume_contract (rsmc_id INT PRIMARY KEY, rsmc_status VARCHAR(20), rsmc_signature TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8');
db_exec('CREATE TABLE tb_resume_contact_info (info_id INT PRIMARY KEY, info_rsmc_id INT, rsm_format2 VARCHAR(20), rsm_name_th_sex VARCHAR(20), rsm_name_th VARCHAR(100), rsm_name_th2 VARCHAR(100),
    rsm_gender VARCHAR(100), rsm_birthday DATE, rsm_id_card VARCHAR(20), rsm_tel VARCHAR(30), rsm_position INT, ag_format VARCHAR(50), ag_name VARCHAR(255), rsm_start DATE) ENGINE=InnoDB DEFAULT CHARSET=utf8');

// collation ต่างจาก tb_resume_contact_info โดยตั้งใจ — กัน MySQL 1267 ที่เจอกับ developh_bigpro
db_exec('CREATE TABLE tb_agency (ag_id INT PRIMARY KEY, ag_format VARCHAR(50) CHARACTER SET utf8 COLLATE utf8_unicode_ci, ag_name VARCHAR(255), ad_user_id_uptime DATETIME) ENGINE=InnoDB DEFAULT CHARSET=utf8');
db_exec("INSERT INTO tb_agency VALUES (1, 'FM-AV-1', 'ชื่อเก่าของหน่วยงาน', '2020-01-01 00:00:00'), (2, 'FM-AV-1', 'ชื่อจากตารางหน่วยงาน', '2026-01-01 00:00:00'), (3, '', 'หน่วยงานไม่มีรหัส ก', '2026-01-01 00:00:00'), (4, '', 'หน่วยงานไม่มีรหัส ข', '2026-01-01 00:00:00')");

function jb_src($id, $status, $code, $first, $last, $birth, $start, $site, $extra = array())
{
    db_exec('INSERT INTO tb_resume_contract VALUES (?, ?, ?)', array($id, $status, 'sig'));
    db_exec('INSERT INTO tb_resume_contact_info VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', array($id, $id, $code,
        arr_get($extra, 'title', 'นาง'), $first, $last, arr_get($extra, 'gender', ''), $birth, arr_get($extra, 'card', ''), arr_get($extra, 'tel', ''),
        2, arr_get($extra, 'format', ''), $site, $start));
}
$jbSite = 'FM-AV-1 ชื่อจากตารางหน่วยงาน';   // tb_agency: ag_format + ag_name แถวล่าสุด (ไม่ใช่ชื่อในสัญญา)
$jbExisting = 'สำนักงาน CNS';
$jbOtherCode = db_value("SELECT emp_code FROM employees WHERE company_code <> 'CNS' LIMIT 1");
$jbDaily = db_one("SELECT * FROM employees WHERE company_code = 'CNS' AND employee_type = 'DAILY' AND status = 'ACTIVE' LIMIT 1");
jb_src(101, 'signed', 'JB001', 'สมศรี', 'ใหม่หนึ่ง', '1990-01-02', '2026-01-05', $jbExisting, array('tel' => '081-234-5678', 'card' => '1234'));
jb_src(102, 'signed', 'JB002', 'สมหมาย', 'ใหม่สอง', '1991-03-04', '2026-02-05', 'สาขาทดสอบ', array('format' => 'FM-AV-1'));
jb_src(103, 'cancel', 'JB003', 'ยกเลิก', 'ไม่ดึง', '1992-05-06', '2026-03-05', $jbExisting);
jb_src(104, 'signed', '', 'ไม่มี', 'รหัส', '1992-05-06', '2026-03-05', $jbExisting);
jb_src(105, 'signed', 'JB005', 'ไม่มี', 'วันเกิด', null, '2026-03-05', $jbExisting);
jb_src(106, 'signed', $jbOtherCode, 'รหัส', 'ชนกัน', '1990-01-02', '2026-03-05', $jbExisting);
jb_src(107, 'signed', $jbDaily['emp_code'], 'ชื่อใหม่', $jbDaily['last_name'], $jbDaily['birth_date'], $jbDaily['start_date'], $jbExisting);
jb_src(108, 'signed', 'JB008', 'ชื่อ', 'หน่วยงานยาว', '1990-01-02', '2026-03-05', str_repeat('ก', 201));
jb_src(109, 'signed', 'JB009', 'ไม่พบ', 'หน่วยงาน', '1990-01-02', '2026-03-05', 'ชื่อในสัญญา', array('format' => 'FM-NONE'));
jb_src(110, 'signed', '', 'ไม่มีรหัส', 'หน่วยงานซ้ำ', '1990-01-02', '2026-03-05', 'ชื่อในสัญญา', array('format' => 'FM-AV-1'));
jb_src(111, 'signed', '', 'ไม่มีรหัส', 'ไม่มีรหัสหน่วยงาน', '1990-01-02', '2026-03-05', 'ชื่อในสัญญา');
jb_src(90, 'signed', 'JB001', 'สัญญาเก่า', 'ไม่ใช้', '1990-01-02', '2025-01-05', $jbExisting);

$GLOBALS['hlw_job_db'] = array('host' => $hlw_config['db_host'], 'port' => $hlw_config['db_port'], 'user' => $hlw_config['db_user'], 'pass' => $hlw_config['db_pass'], 'name' => $hlw_config['db_name']);

db_exec("UPDATE role_capabilities SET allowed = 0 WHERE role = 'PAYROLL' AND capability = 'employees.edit'");
perm_reset_cache();
check('ไม่มีสิทธิ์แก้พนักงาน → 403', S($jbPay->req('GET', '/job-db/employees/preview')) === 403);
db_exec("UPDATE role_capabilities SET allowed = 1 WHERE role = 'PAYROLL' AND capability = 'employees.edit'");
perm_reset_cache();

function jb_row($rows, $code) { foreach ($rows as $x) { if ($x['empCode'] === $code) { return $x; } } return null; }

$r = $jb->req('GET', '/job-db/employees/preview');
$p = $r['json']['data'];
$j1 = jb_row($p['rows'], 'JB001');
$u1 = jb_row($p['rows'], $jbDaily['emp_code']);
$jbCnt = array();
foreach ($p['rows'] as $jbX) { $jbCnt[$jbX['name']] = isset($jbCnt[$jbX['name']]) ? $jbCnt[$jbX['name']] + 1 : 1; }
check('tb_agency หลายแถว: หนึ่งสัญญาขึ้นแถวเดียว', arr_get($jbCnt, 'ไม่มีรหัส หน่วยงานซ้ำ') === 1, json_encode($jbCnt));
check('ag_format ว่าง: ไม่จับคู่หน่วยงานที่ไม่มีรหัส', arr_get($jbCnt, 'ไม่มีรหัส ไม่มีรหัสหน่วยงาน') === 1, json_encode($jbCnt));
check('ag_format ว่าง: ใช้ชื่อในสัญญา', $j1['siteName'] === $jbExisting, json_encode($j1));
check('ตัวอย่าง: สัญญาที่เซ็นแล้วเท่านั้น · รหัสซ้ำใช้สัญญาใหม่สุด', $r['status'] === 200 && jb_row($p['rows'], 'JB003') === null && $j1['name'] === 'สมศรี ใหม่หนึ่ง' && $j1['action'] === 'new', json_encode($p['summary']));
check('เลขบัตรผิดรูปแบบ = เตือน ไม่บล็อก · ไม่ส่งค่าทั้งแถวไปหน้าเว็บ', count($j1['warnings']) === 1 && !isset($j1['fields']) && !isset($j1['employee']));
$j2 = jb_row($p['rows'], 'JB002');
$jNoCode = jb_row($p['rows'], null);
$j5 = jb_row($p['rows'], 'JB005');
$jOther = jb_row($p['rows'], $jbOtherCode);
check('หน่วยงานที่ยังไม่มีแจ้งรายการ', $j2['siteExists'] === false && in_array($jbSite, $p['missingSites'], true) && $p['canCreateSites'] === true);
$j9 = jb_row($p['rows'], 'JB009');
check('ไม่พบใน tb_agency = ใช้ชื่อจากสัญญา พร้อมคำเตือน', $j9['siteName'] === 'FM-NONE ชื่อในสัญญา' && count($j9['warnings']) === 1, json_encode($j9));
$j8 = jb_row($p['rows'], 'JB008');
check('ชื่อหน่วยงานยาวเกินคอลัมน์ = ข้าม', $j8['action'] === 'skip');
check('ไม่มีรหัส / ไม่มีวันเกิด = ข้ามพร้อมเหตุผล', $jNoCode['action'] === 'skip' && $j5['action'] === 'skip' && count($j5['reasons']) > 0);
check('รหัสของบริษัทอื่น = ข้าม ไม่เขียนทับ', $jOther['action'] === 'skip');
check('ข้อมูลต่างกัน = update พร้อมรายการที่ต่าง', $u1['action'] === 'update' && $u1['changes'][0]['to'] !== null, json_encode($u1));
check('ตัวอย่างไม่บันทึกอะไร', !db_value("SELECT id FROM employees WHERE emp_code = 'JB001'"));

$r = $jb->req('POST', '/job-db/employees/import', array('create' => array('JB001', 'JB002'), 'update' => array(), 'createSites' => false));
$d = $r['json']['data'];
$e1 = db_one("SELECT * FROM employees WHERE emp_code = 'JB001'");
check('เพิ่มใหม่: CNS / รายวัน / ผ่านทดลองงานคำนวณเอง / เบอร์โทรเป็นตัวเลข', $d['created'] === 1 && $e1['company_code'] === 'CNS' && $e1['employee_type'] === 'DAILY' && $e1['probation_pass_date'] === probation_due_date('2026-01-05') && $e1['phone'] === '0812345678' && $e1['national_id'] === null && (int)$e1['level'] === 1, json_encode($d));
check('ไม่ติ๊กสร้างหน่วยงาน = รายการนั้นไม่สำเร็จ แจ้งเหตุผล', count($d['failed']) === 1 && $d['failed'][0]['empCode'] === 'JB002' && !db_value("SELECT id FROM sites WHERE name = ?", array($jbSite)));

$r = $jb->req('POST', '/job-db/employees/import', array('create' => array('JB002'), 'createSites' => true));
$d = $r['json']['data'];
$e2 = db_one("SELECT e.*, s.name AS site FROM employees e JOIN sites s ON s.id = e.site_id WHERE e.emp_code = 'JB002'");
check('ติ๊กสร้างหน่วยงาน = สร้างแล้วผูกพนักงาน', $d['created'] === 1 && $d['sitesCreated'] === 1 && $e2['site'] === $jbSite, json_encode($d));

$jb->req('POST', '/job-db/employees/import', array('create' => array(), 'update' => array()));
check('ไม่เลือกอัปเดต = ไม่เขียนทับ', db_value('SELECT first_name FROM employees WHERE id = ?', array($jbDaily['id'])) === $jbDaily['first_name']);
$r = $jb->req('POST', '/job-db/employees/import', array('update' => array($jbDaily['emp_code'])));
$d = $r['json']['data'];
$after = db_one('SELECT * FROM employees WHERE id = ?', array($jbDaily['id']));
check('เลือกอัปเดต = ใช้ค่าต้นทาง · ค่าอื่นคงเดิม', $d['updated'] === 1 && $after['first_name'] === 'ชื่อใหม่' && (int)$after['level'] === 1 && $after['status'] === 'ACTIVE' && $after['national_id'] === $jbDaily['national_id'], json_encode($d));
$r = $jb->req('POST', '/job-db/employees/import', array('create' => array('ไม่มีรหัสนี้', $jbOtherCode), 'update' => array($jbOtherCode)));
check('รหัสที่ไม่อยู่ในแผน / ข้าม ส่งมาก็ไม่บันทึก', $r['json']['data']['created'] === 0 && $r['json']['data']['updated'] === 0);
check('ทุกการบันทึกมีบันทึกกิจกรรม', (int)db_value("SELECT COUNT(*) FROM audit_log WHERE entity_id = 'job_db'") >= 2);

/* ---------- แหล่ง PRO (hr-pro): ตารางชื่อเดียวกัน · ชื่อตำแหน่งจาก tb_position ---------- */
check('แหล่งข้อมูลที่ไม่รู้จัก → 422', S($jb->req('GET', '/job-db/employees/preview?source=nope')) === 422);
$GLOBALS['hlw_job_db_pro'] = false;
$r = $jb->req('GET', '/job-db/employees/preview?source=pro');
check('PRO ยังไม่ตั้งค่า → 409 บอกไฟล์ของ PRO', $r['status'] === 409 && strpos($r['json']['error'], 'connect_job_db_pro.php') !== false);
$GLOBALS['hlw_job_db_pro'] = $GLOBALS['hlw_job_db'];
db_exec('CREATE TABLE tb_position (pt_id INT PRIMARY KEY, pt_name VARCHAR(100)) ENGINE=InnoDB DEFAULT CHARSET=utf8');
db_exec("INSERT INTO tb_position VALUES (2, 'ช่างเทคนิค')");
db_exec('DELETE FROM tb_resume_contact_info');
db_exec('DELETE FROM tb_resume_contract');
jb_src(201, 'signed', 'JBP01', 'สมปอง', 'ช่างใหม่', '1990-01-02', '2026-01-05', 'สำนักงาน PRO');
jb_src(202, 'signed', 'JB001', 'รหัส', 'ของซีเอ็นเอส', '1990-01-02', '2026-01-05', 'สำนักงาน PRO');
$r = $jb->req('GET', '/job-db/employees/preview?source=pro');
$p = $r['json']['data'];
$jp = jb_row($p['rows'], 'JBP01');
$jc = jb_row($p['rows'], 'JB001');
check('PRO: ตำแหน่งจาก tb_position · บอกบริษัท', $r['status'] === 200 && $p['company'] === 'PRO' && $jp['action'] === 'new' && $jp['position'] === 'ช่างเทคนิค', json_encode($r['json']));
check('PRO: รหัสของ CNS รายวัน = ข้าม', $jc['action'] === 'skip');
$r = $jb->req('POST', '/job-db/employees/import', array('source' => 'pro', 'create' => array('JBP01')));
$ep = db_one("SELECT * FROM employees WHERE emp_code = 'JBP01'");
check('PRO: เพิ่มเป็น PRO / Pro Site · ไม่มีระดับ', $r['json']['data']['created'] === 1 && $ep['company_code'] === 'PRO' && $ep['employee_type'] === 'PRO_SITE' && $ep['level'] === null && $ep['position'] === 'ช่างเทคนิค', json_encode($r['json']));
// ฐานที่ไม่มีคอลัมน์เสริม (hr-pro เช็กคอลัมน์เหล่านี้ก่อนใช้)
jb_src(203, 'cancel', 'JBP02', 'ยกเลิก', 'ไม่ดึง', '1990-01-02', '2026-01-05', 'x', array('format' => 'FM-AV-1'));
jb_src(204, 'signed', 'JBP03', 'ไม่มี', 'คอลัมน์เสริม', '1990-01-02', '2026-01-05', 'x', array('format' => 'FM-AV-1'));
db_exec("UPDATE tb_resume_contract SET rsmc_signature = '' WHERE rsmc_id = 204");   // เงื่อนไขคือ rsmc_status เท่านั้น ไม่ดูลายเซ็น
db_exec('ALTER TABLE tb_resume_contact_info DROP COLUMN ag_name');
db_exec('ALTER TABLE tb_agency DROP COLUMN ad_user_id_uptime');
$r = $jb->req('GET', '/job-db/employees/preview?source=pro');
$jm = $r['status'] === 200 ? jb_row($r['json']['data']['rows'], 'JBP03') : null;
$jx = $r['status'] === 200 ? jb_row($r['json']['data']['rows'], 'JBP02') : null;
check('signed ไม่มีลายเซ็น + ไม่มีคอลัมน์เสริม: ยังดึงได้ · ใช้ชื่อจาก tb_agency · สัญญายกเลิกไม่ติดมา', $jm && $jm['action'] === 'new' && $jm['siteName'] === $jbSite && !$jx, json_encode($r['json']));
// PRO เก็บหน่วยงานที่ ag_id / rsmc_ag_id / rsm_department — ag_format ว่าง
db_exec('ALTER TABLE tb_resume_contact_info ADD COLUMN ag_id INT DEFAULT 0, ADD COLUMN rsm_department VARCHAR(255), ADD COLUMN rsm_division VARCHAR(255)');
db_exec('ALTER TABLE tb_resume_contract ADD COLUMN rsmc_ag_id INT DEFAULT 0');
db_exec("INSERT INTO tb_agency (ag_id, ag_format, ag_name) VALUES (5, 'PRO/FM/1', 'หน่วยงานตาม ag_id'), (6, '', 'หน่วยงานไม่มีรหัส ตาม rsmc_ag_id')");
function jb_pro($id, $code, $format, $infoAg, $contractAg, $dept)
{
    db_exec('INSERT INTO tb_resume_contract (rsmc_id, rsmc_status, rsmc_ag_id) VALUES (?, ?, ?)', array($id, 'signed', $contractAg));
    db_exec('INSERT INTO tb_resume_contact_info (info_id, info_rsmc_id, rsm_format2, rsm_name_th_sex, rsm_name_th, rsm_name_th2, rsm_gender, rsm_birthday, rsm_id_card, rsm_tel, rsm_position, ag_format, rsm_start, ag_id, rsm_department, rsm_division)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', array($id, $id, $code, 'นาย', 'ทดสอบ', $code, '', '1990-01-02', '', '', 2, $format, '2026-01-05', $infoAg, $dept, 'ฝ่ายไม่ใช่รหัส'));
}
jb_pro(301, 'JBP10', '', 5, 6, '');
jb_pro(302, 'JBP11', '', 0, 6, '');
jb_pro(303, 'JBP12', '', 0, 0, 'สังกัดตามสัญญา');
jb_pro(304, 'JBP13', '', 0, 0, '');
jb_pro(305, 'JBP14', 'FM-AV-1', 5, 6, '');
$r = $jb->req('GET', '/job-db/employees/preview?source=pro');
$jpRows = $r['status'] === 200 ? $r['json']['data']['rows'] : array();
$jp10 = jb_row($jpRows, 'JBP10'); $jp11 = jb_row($jpRows, 'JBP11'); $jp12 = jb_row($jpRows, 'JBP12'); $jp13 = jb_row($jpRows, 'JBP13'); $jp14 = jb_row($jpRows, 'JBP14');
check('PRO หน่วยงาน: จาก ag_id ของสัญญา = รหัส + ชื่อจาก tb_agency', $jp10 && $jp10['siteName'] === 'PRO/FM/1 หน่วยงานตาม ag_id' && $jp10['action'] === 'new', json_encode($r['json']));
check('PRO หน่วยงาน: ไม่มี ag_id ใช้ rsmc_ag_id · tb_agency ไม่มีรหัส = ชื่ออย่างเดียว', $jp11 && $jp11['siteName'] === 'หน่วยงานไม่มีรหัส ตาม rsmc_ag_id', json_encode($jp11));
check('PRO หน่วยงาน: ไม่มี id ใช้ rsm_department · ไม่เอาฝ่ายมาเป็นรหัส', $jp12 && $jp12['siteName'] === 'สังกัดตามสัญญา', json_encode($jp12));
check('PRO หน่วยงาน: ไม่มีข้อมูลเลย = ข้าม', $jp13 && $jp13['action'] === 'skip', json_encode($jp13));
check('มี ag_format ใช้ ag_format ก่อน ag_id', $jp14 && $jp14['siteName'] === $jbSite, json_encode($jp14));
db_exec('ALTER TABLE tb_resume_contact_info DROP COLUMN rsm_tel');
$r = $jb->req('GET', '/job-db/employees/preview?source=pro');
check('ขาดคอลัมน์หลัก → 503 บอกชื่อคอลัมน์', $r['status'] === 503 && strpos($r['json']['error'], 'rsm_tel') !== false, json_encode($r['json']));
db_exec('DROP TABLE tb_position');
unset($GLOBALS['hlw_job_db_pro']);

$jb->req('POST', '/auth/logout', array());
check('ไม่ได้ login → 401', S($jb->req('GET', '/job-db/employees/preview')) === 401);
db_exec('DROP TABLE tb_agency');
db_exec('DROP TABLE tb_resume_contact_info');
db_exec('DROP TABLE tb_resume_contract');
unset($GLOBALS['hlw_job_db']);
