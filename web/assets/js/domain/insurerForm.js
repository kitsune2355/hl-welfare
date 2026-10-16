// แบบฟอร์ม Excel แจ้งเข้า-ออกบริษัทประกัน — คำศัพท์และตัวเลือกที่ใช้ในหน้า "แบบฟอร์มประกัน"
//
// แบบฟอร์ม 1 อัน = บริษัทประกัน 1 ราย (เช่น ไทยประกันชีวิต, เมืองไทยประกันชีวิต)
//   ไฟล์ที่ได้ต่อรอบ: ชีต "สรุป" (ถ้าเปิด) + ชีตละ 1 บริษัทในเครือ (ตามที่ผูกไว้ในแบบฟอร์ม)
//   แต่ละชีต: หัวเอกสาร → หัวตาราง (จัดกลุ่มได้ 2 ชั้น) → แถวแจ้งเข้า → แถวแจ้งออก → บรรทัดสรุปจำนวน → ท้ายเอกสาร

/**
 * แหล่งข้อมูลของคอลัมน์
 * needs = ฟิลด์พนักงานที่ต้องมี (ถ้าว่างจะเตือนก่อนส่งออก)
 */
export const COLUMN_SOURCES = {
  seq: { label: 'ลำดับ' },
  empCode: { label: 'รหัสพนักงาน' },
  title: { label: 'คำนำหน้า', needs: 'title' },
  fullName: { label: 'ชื่อ - สกุล' },
  titleFullName: { label: 'คำนำหน้า + ชื่อ - สกุล', needs: 'title' },
  firstName: { label: 'ชื่อ' },
  lastName: { label: 'นามสกุล' },
  gender: { label: 'เพศ (ชาย/หญิง)', needs: 'gender' },
  birthDate: { label: 'วันเกิด' },
  nationalId: { label: 'เลขบัตรประชาชน', needs: 'nationalId' },
  position: { label: 'ตำแหน่ง / ฝ่าย' },
  phone: { label: 'โทรศัพท์มือถือ' }, // ไม่บังคับ — ไฟล์จริงก็เว้นว่างได้
  email: { label: 'อีเมล' },
  salary: { label: 'เงินเดือน' },
  startDate: { label: 'วันเริ่มงาน' },
  companyCode: { label: 'ตัวย่อบริษัท' },
  siteName: { label: 'หน่วยงาน' },
  plan: { label: 'แผนประกัน (ตามบริษัท)' },
  inMark: { label: 'เครื่องหมาย "เข้าใหม่"' },
  outMark: { label: 'เครื่องหมาย "ลาออก"' },
  effectiveDate: { label: 'วันที่มีผล (เข้า = วันครบสิทธิ · ออก = วันออก)' },
  inEffectiveDate: { label: 'วันที่มีผล — เฉพาะแถวเข้าใหม่' },
  outEffectiveDate: { label: 'วันที่มีผล — เฉพาะแถวลาออก' },
  cycleDate: { label: 'วันที่รอบ (วันที่ 5)' },
  reason: { label: 'เหตุผล' },
  text: { label: 'ข้อความคงที่' },
  blank: { label: '(ว่าง — ให้กรอกเอง)' },
};

/** ชื่อฟิลด์พนักงานที่อาจว่าง (ใช้ในคำเตือนก่อนส่งออก) */
export const EMPLOYEE_FIELD_LABEL = { title: 'คำนำหน้า', gender: 'เพศ', nationalId: 'เลขบัตรประชาชน' };

/** แสดงค่าเฉพาะแถวประเภทใด */
export const ROW_SCOPE_LABEL = { '': 'ทุกแถว', IN: 'เฉพาะแถวเข้าใหม่', OUT: 'เฉพาะแถวลาออก' };

/** รูปแบบวันที่ในไฟล์ (เขียนเป็นข้อความ — เปิดเครื่องไหนก็ไม่เพี้ยน) */
export const DATE_FORMATS = {
  'DD/MM/YYYY': 'วว/ดด/ปปปป (05/02/2569)',
  'D/M/YYYY': 'ว/ด/ปปปป (5/2/2569)',
  'D/M/YY': 'ว/ด/ปป (5/2/69)',
};
export const DATE_ERA_LABEL = { BE: 'พ.ศ.', CE: 'ค.ศ.' };

/** ตัวแปรที่ใช้ได้ในหัว/ท้ายเอกสาร และชื่อไฟล์ */
export const PLACEHOLDERS = {
  '{insurer}': 'ชื่อบริษัทประกัน',
  '{companyCode}': 'ตัวย่อบริษัท เช่น HL',
  '{companyName}': 'ชื่อบริษัท (ตามที่ตั้งในแบบฟอร์ม)',
  '{policyNo}': 'เลขที่กรมธรรม์ของบริษัทนั้น',
  '{month}': 'เดือนของรอบ เช่น กุมภาพันธ์ 2569',
  '{cycleDate}': 'วันที่รอบ (ตามรูปแบบวันที่)',
  '{exportDate}': 'วันที่ส่งออก (ตามรูปแบบวันที่)',
  '{in}': 'จำนวนเข้าใหม่',
  '{out}': 'จำนวนลาออก',
  '{total}': 'รวมทั้งหมด',
  '{signerName}': 'ชื่อผู้แจ้ง',
  '{signerDept}': 'แผนก/ฝ่ายผู้แจ้ง',
  '{signerPhone}': 'โทรศัพท์ผู้แจ้ง',
};

/** แทนค่า {ตัวแปร} — ตัวแปรที่ไม่รู้จักคงไว้ตามเดิม */
export const fillPlaceholders = (text, vars) => String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));

/** ฟิลด์พนักงานที่แบบฟอร์มนี้ต้องใช้ (จากคอลัมน์ที่เลือก) */
export function requiredEmployeeFields(form) {
  return [...new Set((form.columns ?? []).map((c) => COLUMN_SOURCES[c.source]?.needs).filter(Boolean))];
}
