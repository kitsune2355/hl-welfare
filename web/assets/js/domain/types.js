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
 * @property {boolean} issued           แจกแล้ว (บันทึกเอง หรือคลังจ่ายแล้ว)
 * @property {boolean} requested        ส่งเบิกคลังแล้ว รอคลังจ่าย
 * @property {number|null} issueId
 * @property {string|null} stockDocNo   เลขใบเบิกในระบบสต็อก (WRQ-…)
 * @property {StockRequest|null} stock  ใบเบิกในระบบสต็อก (null = ไม่ได้ผ่านคลัง)
 */

/**
 * @typedef {Object} UniformStatus
 * @property {number|null} ruleId
 * @property {string|null} style
 * @property {string|null} logo         โลโก้บริษัทบนเสื้อ (เลือกแบบในระบบสต็อก)
 * @property {string[]} reasons
 * @property {UniformEntitlement[]} entitlements
 */

/**
 * @typedef {Object} EmployeeBenefits
 * @property {Employee} employee
 * @property {Site|null} site
 * @property {InsuranceStatus} insurance
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
 * ประวัติการส่งออก 1 รายการ = ส่งออกไฟล์แจ้งบริษัทประกัน 1 ครั้ง (มีทั้งคนเข้าและคนออก)
 * @typedef {Object} InsuranceBatch
 * @property {number} id
 * @property {ISODate} cycleDate
 * @property {number|null} insurerId
 * @property {string|null} insurerName
 * @property {{employeeId: number, type: BatchType}[]} items
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
 * @property {string} size             ไซซ์ (ผ่านคลัง = ไซซ์ของทุกรายการต่อกัน เช่น "L · 41")
 * @property {ISODate} issuedAt         บันทึกเอง = วันที่แจก / ผ่านคลัง = วันที่ส่งเบิก แล้วเป็นวันที่คลังจ่าย
 * @property {string} issuedBy
 * @property {'MANUAL'|'STOCK'} [source] ไม่มี = MANUAL (ข้อมูลก่อนเชื่อมระบบสต็อก)
 * @property {StockRequest} [stock]      มีเมื่อ source = 'STOCK'
 */

/** @typedef {'WAITING'|'REQUESTED'|'ISSUED'|'RECEIVED'|'CANCELLED'} StockStage  WAITING = รอผู้อนุมัติในสต็อก */

/**
 * ใบเบิกในระบบสต็อก Uniform ของการแจกหนึ่งรายการ
 * @typedef {Object} StockRequest
 * @property {string} ref                <employeeId>:<entitlementKey>
 * @property {number} docId
 * @property {string} docNo              WRQ-ปปดด-####
 * @property {StockStage} stage
 * @property {string|null} issuedAt      คลังจ่ายเมื่อ
 * @property {string|null} receivedAt    พนักงานเซ็นรับเมื่อ
 * @property {{productId: number, name: string, size: string, qty: number}[]} items
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


/**
 * @typedef {Object} DashboardData
 * @property {ISODate} today
 * @property {{ companyCode: CompanyCode, count: number }[]} activeByCompany
 * @property {number} activeTotal
 * @property {ISODate} nextCycleDate
 * @property {number} nextCycleIn
 * @property {number} nextCycleOut
 * @property {number} urgentPending
 * @property {{ employee: Employee, benefit: 'INSURANCE', date: ISODate }[]} upcomingEligible
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
