// เปิด/ปิดการใช้งาน (แทนการลบ — sql/018) — คู่กับ backend/api/handlers.php employee_inactive_refs / org.php org_active_change
//
//   บริษัท / ประเภท / กลุ่ม-ฝ่าย / หน่วยงาน ที่ปิด: ข้อมูลเดิมที่อ้างอยู่ยังใช้และคำนวณตามเดิม — เลือกใหม่ไม่ได้
//   พนักงานที่ปิด: ไม่อยู่ในการคำนวณใดเลย (MockApi.world / repo_world)

/** เปิดใช้งานไหม (ข้อมูลที่ยังไม่มีค่า = เปิด) */
export const isActive = (x) => x?.active !== false;

/**
 * พนักงาน: เลือกบริษัท / หน่วยงาน / ประเภท / กลุ่ม ที่ปิดแล้วไม่ได้ — ยกเว้นค่าเดิมของคนนี้
 * @returns {Record<string, string>} field → ข้อความ (ว่าง = ผ่าน)
 */
export function inactiveRefs(input, prev, { site, companies = [], types = [], groups = [] }) {
  const x = {};
  const changed = (k) => !prev || prev[k] !== input[k];
  if (site && !isActive(site) && changed('siteId')) x.siteId = 'หน่วยงานนี้ปิดใช้งานแล้ว';
  if (changed('companyCode') && companies.some((c) => c.code === input.companyCode && !isActive(c))) x.companyCode = 'บริษัทนี้ปิดใช้งานแล้ว';
  if (changed('employeeType') && types.some((t) => t.code === input.employeeType && !isActive(t))) x.employeeType = 'ประเภทนี้ปิดใช้งานแล้ว';
  if (input.deptGroup && changed('deptGroup') && groups.some((g) => g.name === input.deptGroup && !isActive(g))) x.deptGroup = 'กลุ่ม / ฝ่ายนี้ปิดใช้งานแล้ว';
  return x;
}

