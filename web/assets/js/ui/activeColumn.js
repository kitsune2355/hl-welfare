// เปิด/ปิดการใช้งาน (แทนการลบ — sql/018) ในตาราง ExcelGrid: คอลัมน์ "ใช้งาน" · แถวที่ปิดจาง · ปุ่มเปิด/ปิดที่เลือก
//   ใช้ร่วมกัน: บริษัท / ประเภท / กลุ่ม-ฝ่าย (pages/_orgSettings.js) · หน่วยงาน (pages/sites.js) · พนักงาน (pages/employees.js)
//   เปลี่ยนแล้วเป็น "ยังไม่บันทึก" เหมือนช่องอื่น — กดบันทึกจึงมีผล
import { isActive } from '../application/activeRules.js';

/** คอลัมน์สวิตช์ "ใช้งาน" — hint = ปิดแล้วเป็นอย่างไร (ต่างกันตามชนิดข้อมูล) */
export const activeColumn = (hint) => ({
  key: 'active',
  header: 'ใช้งาน',
  width: 92,
  align: 'center',
  editor: 'switch',
  hint,
  value: (r) => isActive(r),
  text: (r) => (isActive(r) ? 'เปิดใช้งาน' : 'ปิดใช้งาน'),
  set: (r, v) => ({ ...r, active: !!v }),
});

/** แถวที่ปิดใช้งาน = จาง (ExcelGrid rowClass) */
export const activeRowClass = (r) => (isActive(r) ? '' : 'is-off');

/** ปุ่มเมื่อเลือกหลายแถว: ปิด / เปิดใช้งานที่เลือก (เป็นแถวยังไม่บันทึก) · noun = "บริษัท" "คน" ฯลฯ */
export function activeBulkActions(noun) {
  const flip = (on) => ({
    id: on ? 'activate' : 'deactivate',
    label: on ? 'เปิดใช้งาน' : 'ปิดใช้งาน',
    icon: on ? 'check' : 'ban',
    tone: on ? undefined : 'danger',
    when: (r) => isActive(r) !== on,
    run: (rows, grid) => {
      grid.stage({ edits: rows.map((r) => ({ key: grid.o.rowKey(r), row: { ...r, active: on } })), onlyPending: false });
      return `${on ? 'เปิด' : 'ปิด'}ใช้งาน ${rows.length} ${noun} (ยังไม่บันทึก) — ตรวจแล้วกด “บันทึก”`;
    },
  });
  return [flip(false), flip(true)];
}
