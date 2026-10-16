/**
 * ชนิดข้อมูลของระบบ (JSDoc) — ไม่มีโค้ดทำงาน มีไว้ให้ VS Code ช่วยเติมคำ/ตรวจชนิดข้อมูล
 * ใช้ในไฟล์อื่นด้วย:  /** @param {import('../domain/types.js').Employee} emp *\/
 * JSON จาก PHP (เฟส 2) ต้องใช้ชื่อ field แบบ camelCase ตรงกับนี้
 */

/** @typedef {'HL'|'PRO'|'CNS'|'CIC'|'AS'} CompanyCode */
/** @typedef {'CENTRAL'|'PRO_SITE'|'DAILY'|'MAID_CNS'} EmployeeType */
/** @typedef {'REGULAR'|'SHORT_3PCT'} ContractType */
/** @typedef {'ACTIVE'|'INACTIVE'} EmployeeStatus */
/** @typedef {'RESIGN'|'ABSENT_3D'|'TERMINATED'|'MISCONDUCT'} EndReason */
/** @typedef {string} ISODate  รูปแบบ YYYY-MM-DD */

/** @typedef {{ code: CompanyCode, name: string }} Company */

/**
 * @typedef {Object} Site
 * @property {number} id
 * @property {CompanyCode} companyCode
 * @property {string} name
 * @property {boolean} hasGroupInsurance  แม่บ้าน CNS: หน่วยงานนี้ได้ประกันกลุ่มไหม
 * @property {'BLACK'|'NAVY'} poloColor    Pro Site: สีโปโลของหน่วยงาน
 */

/**
 * @typedef {Object} Employee
 * @property {number} id
 * @property {string} empCode
 * @property {string} firstName
 * @property {string} lastName
 * @property {CompanyCode} companyCode
 * @property {number} siteId
 * @property {EmployeeType} employeeType
 * @property {ContractType} contractType
 * @property {string|null} deptGroup        กลุ่ม/ฝ่าย (ส่วนกลาง)
 * @property {string|null} position         ตำแหน่ง (Pro Site)
 * @property {number|null} level
 * @property {number} salary
 * @property {ISODate} birthDate
 * @property {ISODate} startDate
 * @property {ISODate|null} probationPassDate
 * @property {EmployeeStatus} status
 * @property {ISODate|null} lastWorkingDate
 * @property {ISODate|null} endDate
 * @property {EndReason|null} endReason
 */

/**
 * @typedef {Object} InsuranceStatus
 * @property {boolean} eligible
 * @property {string[]} reasons            เหตุผลที่ไม่มีสิทธิ (ภาษาไทย)
 * @property {ISODate|null} eligibleDate   วันที่ครบอายุงาน
 * @property {ISODate|null} enrollCycleDate รอบวันที่ 5 ที่จะแจ้งเข้า
 * @property {ISODate|null} exitDate
 * @property {ISODate|null} exitCycleDate
 * @property {boolean} exitUrgent          เลิกจ้าง/ทำผิด = แจ้งทันที
 * @property {number|null} ruleId
 */

/**
 * @typedef {Object} PvdStatus
 * @property {boolean} eligible
 * @property {string[]} reasons
 * @property {ISODate|null} joinDate
 * @property {number} employeeMonthly
 * @property {number} companyMonthly
 * @property {number|null} memberYears
 * @property {number|null} vestingPercent
 */

/** @typedef {'START'|'PROBATION'|'ANNUAL'} UniformEvent */
/** @typedef {'POLO_BLACK'|'POLO_NAVY'|'TECH_SHIRT'|'TECH_PANTS'|'SAFETY_SHOES'} UniformItemCode */

/**
 * @typedef {Object} UniformEntitlement
 * @property {string} key              START | PROBATION | ANNUAL-2026
 * @property {UniformEvent} event
 * @property {ISODate} dueDate
 * @property {number} qty
 * @property {string} qtyLabel         เช่น "2+1"
 * @property {UniformItemCode[]} items
 * @property {string} style
 * @property {boolean} issued
 * @property {number|null} issueId
 */

/**
 * @typedef {Object} UniformStatus
 * @property {number|null} ruleId
 * @property {string|null} style
 * @property {string[]} reasons
 * @property {UniformEntitlement[]} entitlements
 */

/**
 * @typedef {Object} EmployeeBenefits
 * @property {Employee} employee
 * @property {Site|null} site
 * @property {InsuranceStatus} insurance
 * @property {PvdStatus} pvd
 * @property {UniformStatus} uniform
 */

/** @typedef {'IN'|'OUT'|'URGENT'} BatchType */

/**
 * @typedef {Object} InsuranceCycleRow
 * @property {Employee} employee
 * @property {BatchType} type
 * @property {ISODate} effectiveDate
 * @property {string} reason
 * @property {boolean} submitted
 */

/** @typedef {{ cycleDate: ISODate, rows: InsuranceCycleRow[] }} InsuranceCycle */

/**
 * @typedef {Object} InsuranceBatch
 * @property {number} id
 * @property {ISODate} cycleDate
 * @property {BatchType} type
 * @property {number[]} employeeIds
 * @property {string} submittedAt
 * @property {string} submittedBy
 */

/**
 * @typedef {Object} UniformIssue
 * @property {number} id
 * @property {number} employeeId
 * @property {string} entitlementKey
 * @property {UniformEvent} event
 * @property {number} qty
 * @property {string} size
 * @property {ISODate} issuedAt
 * @property {string} issuedBy
 */

/**
 * @typedef {Object} UniformPendingRow
 * @property {Employee} employee
 * @property {string} entitlementKey
 * @property {UniformEvent} event
 * @property {ISODate} dueDate
 * @property {string} qtyLabel
 * @property {string} style
 */

/** @typedef {{ employee: Employee, pvd: PvdStatus }} PvdRow */

/**
 * @typedef {Object} DashboardData
 * @property {ISODate} today
 * @property {{ companyCode: CompanyCode, count: number }[]} activeByCompany
 * @property {number} activeTotal
 * @property {ISODate} nextCycleDate
 * @property {number} nextCycleIn
 * @property {number} nextCycleOut
 * @property {number} urgentPending
 * @property {{ employee: Employee, benefit: 'INSURANCE'|'PVD', date: ISODate }[]} upcomingEligible
 * @property {number} uniformPending
 */

/** @typedef {'INSURANCE_URGENT'|'INSURANCE_IN'|'INSURANCE_OUT'|'UNIFORM_ISSUE'|'PROBATION_MISSING'|'UNIFORM_RULE_MISSING'} TaskKind */
/** @typedef {'critical'|'warning'|'info'} TaskSeverity */

/**
 * @typedef {Object} MonitorTask
 * @property {string} id
 * @property {TaskKind} kind
 * @property {TaskSeverity} severity
 * @property {Employee} employee
 * @property {string} title
 * @property {string} detail
 * @property {ISODate|null} dueDate
 * @property {number} overdueDays      > 0 = เลยกำหนดมาแล้ว
 */

/** @typedef {'EMPLOYEE'|'SITE'|'INSURANCE_BATCH'|'UNIFORM_ISSUE'} ActivityEntity */
/** @typedef {'CREATE'|'UPDATE'|'DELETE'|'CANCEL'} ActivityAction */

/**
 * @typedef {Object} ActivityLog  บันทึกกิจกรรม (= ตาราง audit_log ฝั่ง PHP)
 * @property {number} id
 * @property {string} at               YYYY-MM-DDTHH:mm:ss
 * @property {string} user
 * @property {ActivityEntity} entity
 * @property {string} entityId
 * @property {ActivityAction} action
 * @property {string} summary
 * @property {number|null} employeeId
 */

export {};
