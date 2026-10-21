// กลุ่ม / ฝ่ายของพนักงานส่วนกลาง — กฎตรวจ + นับการใช้งาน (คู่กับ backend/api/dept_groups.php · แก้ที่หนึ่งต้องแก้อีกที่)
// พนักงาน (deptGroup) และกฎชุดฟอร์ม (deptGroups) เก็บเป็น "ชื่อ" → เปลี่ยนชื่อต้องแก้ทั้งสองที่
import { ruleTimeline } from '../domain/ruleVersions.js';

export const DEPT_GROUP_NAME_MAX = 100;

const fold = (s) => String(s ?? '').trim().toLocaleLowerCase('th');

/** ตรวจชื่อกลุ่ม — all = รายการทั้งหมด (ซ้ำไม่สนตัวพิมพ์/ช่องว่าง) · id = กลุ่มที่แก้ (0/null = เพิ่มใหม่) */
export function validateDeptGroup(name, all, id) {
  const n = String(name ?? '').trim();
  if (!n) return { name: 'กรุณากรอกชื่อกลุ่ม / ฝ่าย' };
  if ([...n].length > DEPT_GROUP_NAME_MAX) return { name: `ชื่อยาวเกิน ${DEPT_GROUP_NAME_MAX} ตัวอักษร` };
  if (n.includes(',')) return { name: 'ชื่อห้ามมีเครื่องหมาย “,”' };
  if (all.some((g) => g.id !== (id || 0) && fold(g.name) === fold(n))) return { name: 'มีกลุ่ม / ฝ่ายชื่อนี้แล้ว' };
  return {};
}

/** ชื่อกลุ่ม → Set ของรหัสกฎชุดฟอร์มที่ใช้อยู่ / รอมีผล ที่อ้างถึง (ประวัติเก่าไม่นับ) */
export function deptGroupRuleUsage(uniformRevisions, today) {
  const use = new Map();
  for (const t of ruleTimeline(uniformRevisions, today)) {
    for (const r of [...t.pending, ...(t.current ? [t.current] : [])]) {
      if (r.deleted || !Array.isArray(r.deptGroups)) continue;
      for (const name of r.deptGroups) {
        if (!use.has(name)) use.set(name, new Set());
        use.get(name).add(t.id);
      }
    }
  }
  return use;
}

/** แทนชื่อในรายการกลุ่มของกฎ (ไม่ซ้ำ) */
export const renameInGroups = (groups, from, to) => [...new Set(groups.map((g) => (g === from ? to : g)))];
