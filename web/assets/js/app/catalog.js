// โหลดบริษัท + ประเภทพนักงาน + สวัสดิการเพิ่มเติมที่ตั้งค่าไว้ ก่อนหน้าเว็บเริ่มวาด (app/shell.js import ไฟล์นี้ — top-level await)
// มีของเดิมใน sessionStorage = ใช้เลยแล้วรีเฟรชเบื้องหลัง (หน้าไม่ต้องรอ) · ยังไม่มี = รอโหลดครั้งแรก
// โหลดไม่ได้ (เช่น ยังไม่รัน sql/015) = ใช้ค่าตั้งต้นใน domain/catalog.js
import { applyCatalog } from '../domain/catalog.js';
import { progress } from '../ui/loading.js';
import { api } from './api.js';

const KEY = 'hl-catalog';

/** สวัสดิการเพิ่มเติมทั้งหมด (รวมที่ปิด) — เมนูใน sidebar ใช้เฉพาะที่เปิด (welfareMenu) */
let programs = [];
export const welfarePrograms = () => programs;
export const welfareMenu = () => programs.filter((p) => p.active);
/** เปลี่ยนแล้ว (สร้าง / แก้ / เปิด-ปิดสวัสดิการ) → shell วาดเมนูใหม่ */
export const CATALOG_EVENT = 'hl:catalog';

/** โหลดใหม่จาก API แล้วใช้ทันที (หน้าตั้งค่าองค์กร / ตั้งค่าสวัสดิการเพิ่มเติม เรียกหลังแก้) */
export async function refreshCatalog() {
  const [companies, employeeTypes, welfare] = await progress.quiet(() =>
    Promise.allSettled([api.listCompanies(), api.listEmployeeTypes(), api.listWelfarePrograms()]),
  );
  const cat = {
    companies: companies.status === 'fulfilled' ? companies.value : undefined,
    employeeTypes: employeeTypes.status === 'fulfilled' ? employeeTypes.value : undefined,
    welfarePrograms: welfare.status === 'fulfilled' ? welfare.value : programs,
  };
  applyCatalog(cat);
  const changed = JSON.stringify(programs) !== JSON.stringify(cat.welfarePrograms);
  programs = cat.welfarePrograms;
  try {
    if (cat.companies && cat.employeeTypes) sessionStorage.setItem(KEY, JSON.stringify(cat));
  } catch {
    /* sessionStorage ใช้ไม่ได้ — โหลดใหม่ทุกหน้า */
  }
  if (changed) window.dispatchEvent(new Event(CATALOG_EVENT));
}

let cached = null;
try {
  cached = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
} catch {
  cached = null;
}
if (cached) {
  applyCatalog(cached);
  programs = cached.welfarePrograms ?? [];
  refreshCatalog().catch(() => {});
} else {
  await refreshCatalog().catch(() => {});
}
