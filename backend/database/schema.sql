-- สร้างจากสเปกข้อ 13 (happyland-welfare-spec.md) — แก้ที่สเปกแล้วคัดลอกมาให้ตรงกัน
CREATE DATABASE IF NOT EXISTS happyland_welfare
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE happyland_welfare;

CREATE TABLE companies (
  code        VARCHAR(10)  PRIMARY KEY,
  name        VARCHAR(150) NOT NULL
) ENGINE=InnoDB;

-- ===== ผู้ใช้ + การเข้าสู่ระบบ (ข้อ 10.9.1) =====
-- รหัสผ่านเก็บด้วย password_hash() เท่านั้น · ชื่อผู้ใช้เก็บตัวพิมพ์เล็ก
CREATE TABLE users (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username             VARCHAR(50)  NOT NULL UNIQUE,
  password_hash        VARCHAR(255) NOT NULL,
  name                 VARCHAR(150) NOT NULL,
  emp_code             VARCHAR(20)  NULL,              -- รหัสพนักงานของผู้ใช้ (ส่งให้ stock_hr เป็น requested_by_emp_code)
  role                 ENUM('HR_ADMIN','HR_COMPANY','PAYROLL','STOCK','EXECUTIVE') NOT NULL DEFAULT 'HR_ADMIN',
  company_code         VARCHAR(10) NULL,               -- null = ทุกบริษัท (เฟส 3: จำกัดสิทธิ์ตามบริษัท)
  is_active            TINYINT(1) NOT NULL DEFAULT 1,
  session_version      INT UNSIGNED NOT NULL DEFAULT 1, -- +1 เมื่อเปลี่ยนรหัสผ่าน → session ทุกเครื่องหลุด
  password_changed_at  DATETIME NULL,
  last_login_at        DATETIME NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by           VARCHAR(50) NOT NULL DEFAULT 'system',
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by           VARCHAR(50) NOT NULL DEFAULT 'system'
) ENGINE=InnoDB;

-- refresh token ของ "จดจำฉัน" — เก็บเฉพาะ SHA-256 (hex) ของโทเคน ไม่เคยเก็บค่าจริง
-- หมุนทุกครั้งที่ใช้ (แถวเก่า revoked_reason = ROTATED, replaced_by = แถวใหม่) · family = สายโทเคนของการ login 1 ครั้งบน 1 อุปกรณ์
CREATE TABLE auth_refresh_tokens (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  token_hash      CHAR(64) CHARACTER SET ascii NOT NULL,
  family_id       CHAR(32) CHARACTER SET ascii NOT NULL,
  expires_at      DATETIME NOT NULL,
  created_ip      VARCHAR(45) NOT NULL,
  user_agent      VARCHAR(255) NOT NULL DEFAULT '',
  revoked_at      DATETIME NULL,
  revoked_reason  ENUM('ROTATED','LOGOUT','REUSE','PASSWORD_CHANGE','ADMIN') NULL,
  replaced_by     BIGINT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by      VARCHAR(50) NOT NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by      VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_refresh_hash (token_hash),
  INDEX idx_refresh_family (family_id),
  INDEX idx_refresh_user (user_id, revoked_at),
  INDEX idx_refresh_expires (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (replaced_by) REFERENCES auth_refresh_tokens(id)
) ENGINE=InnoDB;

-- ใช้จำกัดการเดารหัสผ่าน (ผิด 5 ครั้ง/ชื่อผู้ใช้ หรือ 20 ครั้ง/IP ใน 15 นาที → 429)
CREATE TABLE auth_login_attempts (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(50) NOT NULL,
  ip          VARCHAR(45) NOT NULL,
  succeeded   TINYINT(1) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- = เวลาที่ลอง
  created_by  VARCHAR(50) NOT NULL DEFAULT 'system',
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  VARCHAR(50) NOT NULL DEFAULT 'system',
  INDEX idx_attempt_user (username, created_at),
  INDEX idx_attempt_ip (ip, created_at)
) ENGINE=InnoDB;

CREATE TABLE sites (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_code         VARCHAR(10)  NOT NULL,
  name                 VARCHAR(200) NOT NULL,
  has_group_insurance  TINYINT(1)   NOT NULL DEFAULT 1,
  polo_color           ENUM('BLACK','NAVY') NOT NULL DEFAULT 'BLACK',
  FOREIGN KEY (company_code) REFERENCES companies(code)
) ENGINE=InnoDB;

CREATE TABLE employees (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  emp_code             VARCHAR(20)  NOT NULL UNIQUE,
  first_name           VARCHAR(100) NOT NULL,
  last_name            VARCHAR(100) NOT NULL,
  company_code         VARCHAR(10)  NOT NULL,
  site_id              INT UNSIGNED NOT NULL,
  employee_type        ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL,
  contract_type        ENUM('REGULAR','SHORT_3PCT') NOT NULL DEFAULT 'REGULAR',
  dept_group           VARCHAR(100) NULL,
  position             VARCHAR(100) NULL,
  level                TINYINT UNSIGNED NULL,
  salary               DECIMAL(12,2) NOT NULL DEFAULT 0,
  birth_date           DATE NOT NULL,
  start_date           DATE NOT NULL,
  probation_pass_date  DATE NULL,
  status               ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  last_working_date    DATE NULL,
  end_date             DATE NULL,
  end_reason           ENUM('RESIGN','ABSENT_3D','TERMINATED','MISCONDUCT') NULL,
  title                ENUM('นาย','นาง','นางสาว') NULL,
  gender               ENUM('M','F') NULL,
  national_id          CHAR(13) NULL,
  phone                VARCHAR(10) NULL,
  email                VARCHAR(150) NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_code) REFERENCES companies(code),
  FOREIGN KEY (site_id) REFERENCES sites(id),
  INDEX idx_emp_company_status (company_code, status),
  INDEX idx_emp_type (employee_type)
) ENGINE=InnoDB;

-- ===== กฎ =====
CREATE TABLE insurance_rules (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_type           ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL,
  companies               JSON NULL,              -- null = ทุกบริษัท, ["HL","AS"]
  wait_days               SMALLINT UNSIGNED NOT NULL,
  exclude_contracts       JSON NOT NULL,          -- ["SHORT_3PCT"]
  require_site_insurance  TINYINT(1) NOT NULL DEFAULT 0,
  note                    VARCHAR(255) NOT NULL DEFAULT '',
  effective_from          DATE NOT NULL DEFAULT '2026-01-01',
  effective_to            DATE NULL
) ENGINE=InnoDB;

CREATE TABLE uniform_items (
  code  VARCHAR(20) PRIMARY KEY,
  name  VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE uniform_rules (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_type    ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL,
  companies        JSON NOT NULL,
  dept_groups      JSON NULL,
  position         VARCHAR(100) NULL,
  level_min        TINYINT UNSIGNED NULL,
  level_max        TINYINT UNSIGNED NULL,
  style            VARCHAR(200) NOT NULL,
  items            JSON NOT NULL,
  polo_by_site     TINYINT(1) NOT NULL DEFAULT 0,
  qty_start        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  qty_start_label  VARCHAR(20) NULL,
  qty_probation    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  qty_annual       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  note             VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB;

CREATE TABLE settings (
  `key`    VARCHAR(50) PRIMARY KEY,
  `value`  VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

-- ===== ธุรกรรม =====
CREATE TABLE insurance_batches (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cycle_date    DATE NOT NULL,                    -- ส่งออก 1 ครั้ง = 1 แถว (เข้า/ออกอยู่ใน insurance_batch_items)
  submitted_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_by_user_id INT UNSIGNED NULL,       -- ผู้ส่งจาก session (null = ข้อมูลก่อนมีระบบผู้ใช้)
  submitted_by_name VARCHAR(150) NOT NULL,      -- ชื่อ ณ ตอนส่ง (API ส่งเป็น submittedBy)
  insurer_id    INT UNSIGNED NULL,                -- แบบฟอร์มที่ส่งออก (ลบแบบฟอร์มได้ → ไม่ทำ FK)
  insurer_name  VARCHAR(100) NULL,
  INDEX idx_batch_cycle (cycle_date),
  INDEX idx_batch_cycle_insurer (cycle_date, insurer_id),
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- แบบฟอร์ม Excel ของบริษัทประกัน: ค่าที่ซ้อนกัน (คอลัมน์, หัว/ท้ายเอกสาร) เก็บเป็น JSON
CREATE TABLE insurer_forms (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  short_name   VARCHAR(60)  NOT NULL,
  active       TINYINT(1)   NOT NULL DEFAULT 1,
  config_json  LONGTEXT     NOT NULL,             -- InsurerForm ส่วนที่เหลือ (companies, dateFormat, signer, template layout …)
  template_file LONGBLOB    NULL,                 -- ไฟล์ .xlsx แบบฟอร์ม (ล้างข้อมูลบุคคลแล้ว) — API ส่งเป็น base64
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE insurance_batch_items (
  batch_id     INT UNSIGNED NOT NULL,
  employee_id  INT UNSIGNED NOT NULL,
  type         ENUM('IN','OUT','URGENT') NOT NULL,
  direction    ENUM('IN','OUT') AS (IF(type = 'IN', 'IN', 'OUT')) STORED, -- URGENT นับเป็น OUT
  PRIMARY KEY (batch_id, employee_id, direction),
  UNIQUE KEY uq_emp_direction (employee_id, direction), -- กันแจ้งซ้ำ
  FOREIGN KEY (batch_id) REFERENCES insurance_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE uniform_issues (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id      INT UNSIGNED NOT NULL,
  entitlement_key  VARCHAR(20) NOT NULL,     -- START | PROBATION | ANNUAL-2026
  event            ENUM('START','PROBATION','ANNUAL') NOT NULL,
  qty              TINYINT UNSIGNED NOT NULL,
  size             VARCHAR(10) NOT NULL,
  issued_at        DATE NOT NULL,
  issued_by_user_id INT UNSIGNED NULL,      -- ผู้บันทึก/ผู้ส่งเบิกจาก session — ห้ามรับจาก body
  issued_by_name   VARCHAR(150) NOT NULL,   -- ชื่อ ณ ตอนบันทึก (API ส่งเป็น issuedBy)
  UNIQUE KEY uq_emp_ent (employee_id, entitlement_key),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (issued_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- = ActivityLog ในแท็บบันทึกกิจกรรม (ห้ามแก้/ลบ)
CREATE TABLE audit_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity     ENUM('EMPLOYEE','SITE','INSURANCE_BATCH','UNIFORM_ISSUE','STOCK_REQUEST','USER') NOT NULL,
  entity_id  VARCHAR(50) NOT NULL,           -- STOCK_REQUEST = "<employee_id>:<entitlement_key>" · USER = users.id
  action     ENUM('CREATE','UPDATE','DELETE','CANCEL','LOGIN','LOGOUT','PASSWORD_CHANGE','TOKEN_REUSE') NOT NULL,
  summary    VARCHAR(500) NOT NULL,      -- ข้อความภาษาไทยสำหรับแสดงผล
  employee_id INT UNSIGNED NULL,         -- ลิงก์ไปหน้าพนักงาน
  before_json JSON NULL,
  after_json  JSON NULL,
  user_id    INT UNSIGNED NULL,          -- ผู้กระทำจาก session (null = ระบบ เช่น พบโทเคนถูกใช้ซ้ำ)
  user_name  VARCHAR(150) NOT NULL,      -- ชื่อ ณ ตอนนั้น (เปลี่ยนชื่อผู้ใช้ภายหลัง ประวัติไม่เปลี่ยน)
  at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(50) NOT NULL,       -- username ผู้กระทำ หรือ 'system'
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- ไม่มีการแก้จริง (ห้ามแก้/ลบ)
  updated_by VARCHAR(50) NOT NULL,
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_employee (employee_id),
  INDEX idx_audit_user (user_id, at),
  INDEX idx_audit_at (at),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
