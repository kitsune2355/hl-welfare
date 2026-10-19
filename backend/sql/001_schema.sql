-- ============================================================
--  001_schema.sql — โครงสร้างฐานข้อมูลระบบสวัสดิการ (hl_welfare)
--
--  ฐานข้อมูลแยกจาก stock_hr แต่อยู่บน MySQL เครื่องเดียวกัน (AppServ MySQL 5.0)
--  สองระบบคุยกันทาง stock_hr/api/welfare.php (HMAC) เท่านั้น — ไม่ query ข้ามฐาน
--
--  ข้อจำกัด MySQL 5.0 ที่เลี่ยง (แบบเดียวกับ stock_hr/sql):
--    - utf8 (ไม่มี utf8mb4) · ไม่มีชนิด JSON → เก็บ JSON เป็น TEXT แล้ว PHP json_decode
--    - DATETIME ไม่มี DEFAULT CURRENT_TIMESTAMP → แอปส่ง NOW() เอง
--    - TIMESTAMP อัตโนมัติได้ตารางละตัว → ยกให้ updated_at
--    - ไม่มี generated column → insurance_batch_items.direction แอปคำนวณเอง
--  ทุกตารางมีคอลัมน์ audit 4 ตัว: created_at, created_by, updated_at, updated_by
--
--  วิธีรัน (ส่งเป็นไฟล์ ไม่งั้นภาษาไทยเพี้ยน):
--      mysql -u root -p1234 -e "CREATE DATABASE hl_welfare DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci"
--      mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/001_schema.sql
--  ย้อนกลับ: backend/sql/001_schema_rollback.sql
-- ============================================================

SET NAMES utf8;

-- ===== ข้อมูลหลัก =====
CREATE TABLE `companies` (
  `code`        VARCHAR(10)  NOT NULL,
  `name`        VARCHAR(150) NOT NULL,
  `legal_name`  VARCHAR(200) NOT NULL DEFAULT '' COMMENT 'ชื่อตามทะเบียน (ชีตสรุปไฟล์แจ้งประกัน)',
  `sort_order`  INT NOT NULL DEFAULT 0,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `sites` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ตรงกับ stock_hr.tb_welfare_site_map.welfare_site_id',
  `company_code`         VARCHAR(10)  NOT NULL,
  `name`                 VARCHAR(200) NOT NULL,
  `has_group_insurance`  TINYINT(1)   NOT NULL DEFAULT 1,
  `polo_color`           ENUM('BLACK','NAVY') NOT NULL DEFAULT 'BLACK',
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_site_name` (`company_code`, `name`),
  CONSTRAINT `fk_site_company` FOREIGN KEY (`company_code`) REFERENCES `companies` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `employees` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `emp_code`             VARCHAR(20)  NOT NULL,
  `first_name`           VARCHAR(100) NOT NULL,
  `last_name`            VARCHAR(100) NOT NULL,
  `company_code`         VARCHAR(10)  NOT NULL,
  `site_id`              INT UNSIGNED NOT NULL,
  `employee_type`        ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL,
  `contract_type`        ENUM('REGULAR','SHORT_3PCT') NOT NULL DEFAULT 'REGULAR',
  `dept_group`           VARCHAR(100) NULL,
  `position`             VARCHAR(100) NULL,
  `level`                TINYINT UNSIGNED NULL,
  `salary`               DECIMAL(12,2) NOT NULL DEFAULT 0,
  `birth_date`           DATE NOT NULL,
  `start_date`           DATE NOT NULL,
  `probation_pass_date`  DATE NULL,
  `status`               ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `last_working_date`    DATE NULL,
  `end_date`             DATE NULL,
  `end_reason`           ENUM('RESIGN','ABSENT_3D','TERMINATED','MISCONDUCT') NULL,
  `title`                VARCHAR(20)  NULL COMMENT 'นาย / นาง / นางสาว',
  `gender`               ENUM('M','F') NULL,
  `national_id`          CHAR(13) NULL,
  `phone`                VARCHAR(10) NULL,
  `email`                VARCHAR(150) NULL,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_emp_code` (`emp_code`),
  KEY `idx_emp_company_status` (`company_code`, `status`),
  KEY `idx_emp_type` (`employee_type`),
  CONSTRAINT `fk_emp_company` FOREIGN KEY (`company_code`) REFERENCES `companies` (`code`),
  CONSTRAINT `fk_emp_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ===== กฎสวัสดิการ (สเปกข้อ 7) =====
CREATE TABLE `insurance_rules` (
  `id`                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_type`           ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL,
  `companies`               TEXT NULL COMMENT 'JSON ["HL","AS"] · NULL = ทุกบริษัท',
  `wait_days`               SMALLINT UNSIGNED NOT NULL,
  `exclude_contracts`       TEXT NOT NULL COMMENT 'JSON ["SHORT_3PCT"]',
  `require_site_insurance`  TINYINT(1) NOT NULL DEFAULT 0,
  `note`                    VARCHAR(255) NOT NULL DEFAULT '',
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `uniform_items` (
  `code`        VARCHAR(20)  NOT NULL,
  `name`        VARCHAR(100) NOT NULL,
  `sort_order`  INT NOT NULL DEFAULT 0,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `uniform_rules` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_type`    ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL,
  `companies`        TEXT NOT NULL COMMENT 'JSON ["HL","PRO"]',
  `dept_groups`      TEXT NULL COMMENT 'JSON · NULL = ทุกกลุ่ม',
  `position`         VARCHAR(200) NULL COMMENT 'หลายตำแหน่งคั่นด้วย ","',
  `level_min`        TINYINT UNSIGNED NULL,
  `level_max`        TINYINT UNSIGNED NULL,
  `style`            VARCHAR(200) NOT NULL,
  `logo`             VARCHAR(10)  NULL COMMENT 'โลโก้บนเสื้อ (เลือกแบบในสต็อก)',
  `items`            TEXT NOT NULL COMMENT 'JSON ["POLO_BLACK"]',
  `polo_by_site`     TINYINT(1) NOT NULL DEFAULT 0,
  `qty_start`        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `qty_start_label`  VARCHAR(20) NULL,
  `qty_probation`    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `qty_annual`       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `note`             VARCHAR(255) NOT NULL DEFAULT '',
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `settings` (
  `key`         VARCHAR(50)  NOT NULL,
  `value`       VARCHAR(255) NOT NULL,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- แบบฟอร์ม Excel ของบริษัทประกัน — ค่าที่ซ้อนกัน (companies, template layout, signer …) อยู่ใน form_json
CREATE TABLE `insurer_forms` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(150) NOT NULL,
  `short_name`  VARCHAR(60)  NOT NULL,
  `active`      TINYINT(1)   NOT NULL DEFAULT 0,
  `form_json`   LONGTEXT     NOT NULL COMMENT 'InsurerForm ส่วนที่เหลือ (รวมไฟล์แบบฟอร์ม base64)',
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ===== ผู้ใช้ + การเข้าสู่ระบบ (สเปกข้อ 10.9.1) =====
CREATE TABLE `users` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`             VARCHAR(50)  NOT NULL COMMENT 'ตัวพิมพ์เล็ก · ตรงกับ tb_user.username ของ stock_hr ถ้ามีบัญชีที่นั่น',
  `password_hash`        VARCHAR(255) NOT NULL COMMENT 'pbkdf2_sha256$รอบ$salt$hash',
  `name`                 VARCHAR(150) NOT NULL,
  `emp_code`             VARCHAR(20)  NULL COMMENT 'ส่งให้ stock_hr เป็น requested_by_emp_code',
  `role`                 ENUM('HR_ADMIN','HR_COMPANY','PAYROLL','STOCK','EXECUTIVE') NOT NULL DEFAULT 'HR_ADMIN',
  `company_code`         VARCHAR(10) NULL COMMENT 'NULL = ทุกบริษัท (เฟส 3)',
  `is_active`            TINYINT(1) NOT NULL DEFAULT 1,
  `session_version`      INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '+1 เมื่อเปลี่ยนรหัสผ่าน/ปิดบัญชี → session ทุกเครื่องหลุด',
  `password_changed_at`  DATETIME NULL,
  `last_login_at`        DATETIME NULL,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- session อายุสั้น — cookie ถือค่าสุ่ม 256 บิต · ฐานข้อมูลเก็บเฉพาะ SHA-256
CREATE TABLE `auth_sessions` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`          INT UNSIGNED NOT NULL,
  `token_hash`       CHAR(64) NOT NULL,
  `session_version`  INT UNSIGNED NOT NULL,
  `last_seen_at`     DATETIME NOT NULL,
  `expires_at`       DATETIME NOT NULL COMMENT 'อายุสูงสุดนับจาก login/refresh',
  `ip`               VARCHAR(45) NOT NULL,
  `user_agent`       VARCHAR(255) NOT NULL DEFAULT '',
  `revoked_at`       DATETIME NULL,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_session_hash` (`token_hash`),
  KEY `idx_session_user` (`user_id`, `revoked_at`),
  CONSTRAINT `fk_session_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- refresh token ของ "จดจำฉัน" — เก็บเฉพาะ SHA-256 · หมุนทุกครั้งที่ใช้ · family = การ login 1 ครั้งบน 1 อุปกรณ์
CREATE TABLE `auth_refresh_tokens` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`         INT UNSIGNED NOT NULL,
  `token_hash`      CHAR(64) NOT NULL,
  `family_id`       CHAR(32) NOT NULL,
  `expires_at`      DATETIME NOT NULL,
  `created_ip`      VARCHAR(45) NOT NULL,
  `user_agent`      VARCHAR(255) NOT NULL DEFAULT '',
  `revoked_at`      DATETIME NULL,
  `revoked_reason`  ENUM('ROTATED','LOGOUT','REUSE','PASSWORD_CHANGE','ADMIN') NULL,
  `replaced_by`     BIGINT UNSIGNED NULL,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refresh_hash` (`token_hash`),
  KEY `idx_refresh_family` (`family_id`),
  KEY `idx_refresh_user` (`user_id`, `revoked_at`),
  CONSTRAINT `fk_refresh_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_refresh_replaced` FOREIGN KEY (`replaced_by`) REFERENCES `auth_refresh_tokens` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- จำกัดการเดารหัสผ่าน
CREATE TABLE `auth_login_attempts` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`    VARCHAR(50) NOT NULL,
  `ip`          VARCHAR(45) NOT NULL,
  `succeeded`   TINYINT(1) NOT NULL,
  `created_at`  DATETIME NOT NULL COMMENT '= เวลาที่ลอง',
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_attempt_user` (`username`, `created_at`),
  KEY `idx_attempt_ip` (`ip`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ===== ธุรกรรม =====
-- ส่งออกไฟล์แจ้งบริษัทประกัน 1 ครั้ง = 1 แถว (เข้า/ออกอยู่ใน insurance_batch_items)
CREATE TABLE `insurance_batches` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cycle_date`            DATE NOT NULL,
  `insurer_id`            INT UNSIGNED NULL COMMENT 'ลบแบบฟอร์มได้ → ไม่ทำ FK',
  `insurer_name`          VARCHAR(100) NULL,
  `submitted_at`          DATETIME NOT NULL,
  `submitted_by_user_id`  INT UNSIGNED NULL COMMENT 'จาก session · NULL = ข้อมูลตั้งต้น',
  `submitted_by_name`     VARCHAR(150) NOT NULL COMMENT 'ชื่อ ณ ตอนส่ง (API: submittedBy)',
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_batch_cycle_insurer` (`cycle_date`, `insurer_id`),
  CONSTRAINT `fk_batch_user` FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `insurance_batch_items` (
  `batch_id`     INT UNSIGNED NOT NULL,
  `seq`          SMALLINT UNSIGNED NOT NULL COMMENT 'ลำดับใน batch (คงลำดับเดิม)',
  `employee_id`  INT UNSIGNED NOT NULL,
  `type`         ENUM('IN','OUT','URGENT') NOT NULL,
  `direction`    ENUM('IN','OUT') NOT NULL COMMENT 'แอปคำนวณ: URGENT นับเป็น OUT',
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`batch_id`, `employee_id`, `direction`),
  UNIQUE KEY `uq_emp_direction` (`employee_id`, `direction`),  -- กันแจ้งซ้ำ
  CONSTRAINT `fk_item_batch` FOREIGN KEY (`batch_id`) REFERENCES `insurance_batches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_item_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- แจกชุดฟอร์ม: บันทึกเอง (MANUAL) หรือส่งเบิกผ่านสต็อก Uniform (STOCK — สถานะใบเบิกอยู่ใน stock_*)
CREATE TABLE `uniform_issues` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`        INT UNSIGNED NOT NULL,
  `entitlement_key`    VARCHAR(20) NOT NULL COMMENT 'START | PROBATION | ANNUAL-2026',
  `event`              ENUM('START','PROBATION','ANNUAL') NOT NULL,
  `qty`                TINYINT UNSIGNED NOT NULL,
  `size`               VARCHAR(100) NOT NULL,
  `issued_at`          DATE NOT NULL,
  `issued_by_user_id`  INT UNSIGNED NULL COMMENT 'จาก session — ห้ามรับจาก body',
  `issued_by_name`     VARCHAR(150) NOT NULL COMMENT 'ชื่อ ณ ตอนบันทึก (API: issuedBy)',
  `source`             ENUM('MANUAL','STOCK') NOT NULL DEFAULT 'MANUAL',
  `stock_ref`          VARCHAR(40) NULL COMMENT '<employee_id>:<entitlement_key>',
  `stock_doc_id`       INT UNSIGNED NULL,
  `stock_doc_no`       VARCHAR(30) NULL,
  `stock_stage`        ENUM('REQUESTED','ISSUED','RECEIVED','CANCELLED') NULL,
  `stock_issued_at`    VARCHAR(30) NULL,
  `stock_received_at`  VARCHAR(30) NULL,
  `stock_cancel_note`  VARCHAR(255) NULL,
  `stock_items`        TEXT NULL COMMENT 'JSON [{productId,name,size,qty,uniform}]',
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_emp_ent` (`employee_id`, `entitlement_key`),
  KEY `idx_issue_stage` (`source`, `stock_stage`),
  CONSTRAINT `fk_issue_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`),
  CONSTRAINT `fk_issue_user` FOREIGN KEY (`issued_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- = ActivityLog (ห้ามแก้/ลบ) — ผู้กระทำจาก session: user_id + ชื่อ ณ ตอนนั้น
CREATE TABLE `audit_log` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `entity`       VARCHAR(30) NOT NULL COMMENT 'EMPLOYEE SITE INSURANCE_BATCH UNIFORM_ISSUE INSURER_FORM STOCK_REQUEST USER',
  `entity_id`    VARCHAR(50) NOT NULL,
  `action`       VARCHAR(20) NOT NULL COMMENT 'CREATE UPDATE DELETE CANCEL LOGIN LOGOUT PASSWORD_CHANGE TOKEN_REUSE',
  `summary`      VARCHAR(500) NOT NULL,
  `employee_id`  INT UNSIGNED NULL,
  `user_id`      INT UNSIGNED NULL COMMENT 'NULL = ระบบ / ข้อมูลตั้งต้น',
  `user_name`    VARCHAR(150) NOT NULL,
  `at`           DATETIME NOT NULL,
  `created_at`  DATETIME NOT NULL,
  `created_by`  VARCHAR(50) NOT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`  VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_entity` (`entity`, `entity_id`),
  KEY `idx_audit_employee` (`employee_id`),
  KEY `idx_audit_at` (`at`),
  KEY `idx_audit_user` (`user_id`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
