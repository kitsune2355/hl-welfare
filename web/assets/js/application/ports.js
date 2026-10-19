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
 * @property {() => Promise<Object>} getRules
 * @property {(cycleDate: string) => Promise<import('../domain/types.js').InsuranceCycle>} getInsuranceCycle
 * @property {() => Promise<import('../domain/types.js').InsuranceBatch[]>} listInsuranceBatches
 * @property {(input: {cycleDate: string, type: string, employeeIds: number[]}) => Promise<import('../domain/types.js').InsuranceBatch>} submitInsuranceBatch
 * @property {(id: number) => Promise<void>} cancelInsuranceBatch               รายการกลับเป็น "รอส่ง"
 * @property {(employeeId?: number) => Promise<import('../domain/types.js').UniformIssue[]>} listUniformIssues
 * @property {(input: Object) => Promise<import('../domain/types.js').UniformIssue>} createUniformIssue
 * @property {() => Promise<import('../domain/types.js').UniformPendingRow[]>} listUniformPending
 * @property {(id: number) => Promise<void>} cancelUniformIssue                 กลับเป็น "ค้างแจก"
 * @property {() => Promise<import('../domain/types.js').MonitorTask[]>} getWorkQueue
 * @property {(filter?: {entity?: string, employeeId?: number, limit?: number}) => Promise<import('../domain/types.js').ActivityLog[]>} listActivity
 * @property {(username: string, password: string) => Promise<{username: string, name: string, role: string}>} login   401 ถ้าไม่ถูกต้อง
 * @property {() => Promise<void>} logout
 * @property {(name: string) => void} setActor                                ชื่อผู้ใช้ที่บันทึกในกิจกรรม (mock)
 * @property {() => Promise<void>} [reset]                                      มีเฉพาะ mock
 */

export {};
