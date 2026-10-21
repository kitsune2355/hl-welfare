/**
 * สัญญา API ของระบบ (port) — MockApi และ HttpApi ต้องมีเมธอดครบตามนี้
 * หน้าจอเรียกข้อมูลผ่าน `api` จาก app/api.js เท่านั้น จึงสลับ mock ↔ PHP ได้โดยไม่แก้หน้าจอ
 *
 * @typedef {import('../domain/types.js').Employee} Employee
 * @typedef {import('../domain/types.js').Site} Site
 *
 * @typedef {Object} WelfareApi
 * @property {() => Promise<import('../domain/types.js').DashboardData>} getDashboard
 * @property {() => Promise<import('../domain/types.js').Company[]>} listCompanies
 * @property {() => Promise<Site[]>} listSites
 * @property {(input: Omit<Site,'id'>) => Promise<Site>} createSite
 * @property {(id: number, patch: Partial<Pick<Site,'name'|'hasGroupInsurance'|'poloColor'>>) => Promise<Site>} updateSite
 * @property {(id: number) => Promise<void>} deleteSite                         409 ถ้ายังมีพนักงาน
 * @property {(filter?: {q?:string, companyCode?:string, employeeType?:string, status?:string}) => Promise<Employee[]>} listEmployees
 * @property {(id: number) => Promise<import('../domain/types.js').EmployeeBenefits>} getEmployeeBenefits
 * @property {(emp: Omit<Employee,'id'> & {id?: number}) => Promise<Employee>} saveEmployee   ไม่มี id = สร้างใหม่
 * @property {(id: number) => Promise<void>} deleteEmployee                     409 ถ้ามีประวัติแจ้งประกัน/แจกชุด
 * @property {() => Promise<Object>} getRules                                  กฎที่มีผล ณ วันนี้
 * @property {() => Promise<Object>} getRuleHistory                            {today, insurance, uniform: [{id, current, pending, history}], settings: [{key, value, effectiveFrom}], uniformItems}
 * @property {(kind: 'insurance'|'uniform', rule: Object) => Promise<Object>} createRule              rule.effectiveFrom (ไม่ส่ง = วันนี้) · คืนประวัติชุดใหม่
 * @property {(kind: 'insurance'|'uniform', id: number, rule: Object) => Promise<Object>} updateRule   เพิ่มฉบับใหม่ที่มีผลตั้งแต่ rule.effectiveFrom
 * @property {(kind: 'insurance'|'uniform', id: number, effectiveFrom: string) => Promise<Object>} retireRule  เลิกใช้กฎตั้งแต่วันที่
 * @property {(kind: 'insurance'|'uniform', revisionId: number) => Promise<Object>} cancelRuleRevision  ยกเลิกฉบับที่ยังไม่ถึงวันมีผล (409 ถ้ามีผลแล้ว)
 * @property {(input: {effectiveFrom?: string, values: Object<string, number>}) => Promise<Object>} saveRuleSettings
 * @property {(key: string, date: string) => Promise<Object>} cancelSettingChange
 * @property {(siteId: number, overrides: {ruleId: number, quantities: Object}[]) => Promise<Object>} saveSiteUniform  ชุดฟอร์มของหน่วยงาน (มีผลทันที) · คืน Site
 * @property {() => Promise<{companies: number, sites: number, createdSites: number, message: string}>} syncMasterToStock  ส่งบริษัท/หน่วยงาน/ชุดฟอร์มรอบเริ่มงานไปสต็อก
 *   (สร้าง/แก้หน่วยงาน แก้กฎชุดฟอร์ม ตั้งชุดฟอร์มของหน่วยงาน ส่งให้เองอยู่แล้ว · ส่งไม่สำเร็จ = คำตอบมี stockWarning)
 * @property {(cycleDate: string) => Promise<import('../domain/types.js').InsuranceCycle>} getInsuranceCycle
 * @property {() => Promise<import('../domain/types.js').InsuranceBatch[]>} listInsuranceBatches
 * @property {(input: {cycleDate: string, type: string, employeeIds: number[]}) => Promise<import('../domain/types.js').InsuranceBatch>} submitInsuranceBatch
 * @property {(id: number) => Promise<void>} cancelInsuranceBatch               รายการกลับเป็น "รอส่ง"
 * @property {(employeeId?: number) => Promise<import('../domain/types.js').UniformIssue[]>} listUniformIssues
 * @property {(input: Object) => Promise<import('../domain/types.js').UniformIssue>} createUniformIssue
 * @property {() => Promise<import('../domain/types.js').UniformPendingRow[]>} listUniformPending
 * @property {(id: number) => Promise<void>} cancelUniformIssue                 กลับเป็น "ค้างแจก" (ผ่านคลัง: ยกเลิกใบในสต็อกด้วย, 409 ถ้าคลังจ่ายแล้ว)
 * @property {(employeeId: number, entitlementKey: string) => Promise<Object>} getUniformStockOptions   แบบ/ไซซ์/ยอดคงเหลือจากระบบสต็อก (409 ถ้าแจก/ส่งเบิกแล้ว)
 * @property {(input: {employeeId: number, entitlementKey: string, lines: {itemCode: string, productId: number, qty: number}[]}) => Promise<import('../domain/types.js').UniformIssue>} requestUniformFromStock  ออกใบเบิก WRQ (อนุมัติอัตโนมัติ)
 * @property {() => Promise<{changed: number}>} syncUniformStock                 ดึงสถานะใบเบิกจากระบบสต็อก
 * @property {() => Promise<import('../domain/types.js').MonitorTask[]>} getWorkQueue
 * @property {(filter?: {entity?: string, employeeId?: number, limit?: number}) => Promise<import('../domain/types.js').ActivityLog[]>} listActivity
 * @property {(q?: {before?: number, limit?: number}) => Promise<import('../domain/types.js').NotificationPage>} listNotifications  กระดิ่ง: เก่ากว่า id before (เลื่อนลงโหลดเพิ่ม)
 * @property {() => Promise<{unread: number}>} notificationUnread              ตัวเลขบนกระดิ่ง (PHP ดึงสถานะสต็อกให้ด้วยเป็นระยะ)
 * @property {(id: number) => Promise<{unread: number}>} readNotification
 * @property {() => Promise<{unread: number}>} readAllNotifications
 * @property {(username: string, password: string, remember?: boolean) => Promise<{username: string, name: string, role: string}>} login   401 ถ้าไม่ถูกต้อง · 429 ถ้าผิดหลายครั้ง (http: remember = refresh cookie)
 * @property {() => Promise<void>} logout
 * @property {(name: string) => void} setActor                                ชื่อผู้ใช้ที่บันทึกในกิจกรรม (mock)
 * @property {() => Promise<void>} [reset]                                      มีเฉพาะ mock
 */

export {};
