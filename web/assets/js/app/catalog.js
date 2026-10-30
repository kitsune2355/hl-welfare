// โหลดบริษัท + ประเภทพนักงานที่ตั้งค่าไว้ ก่อนหน้าเว็บเริ่มวาด (app/shell.js import ไฟล์นี้ — top-level await)
// มีของเดิมใน sessionStorage = ใช้เลยแล้วรีเฟรชเบื้องหลัง (หน้าไม่ต้องรอ) · ยังไม่มี = รอโหลดครั้งแรก
// โหลดไม่ได้ (เช่น ยังไม่รัน sql/015) = ใช้ค่าตั้งต้นใน domain/catalog.js
import { applyCatalog } from '../domain/catalog.js';
import { progress } from '../ui/loading.js';
import { api, PRACTICE } from './api.js';

// โหมดฝึก = บริษัท/ประเภทของข้อมูลตัวอย่าง — เก็บแยก ไม่ปนกับของจริง
const KEY = PRACTICE ? 'hl-catalog-practice' : 'hl-catalog';

/** โหลดใหม่จาก API แล้วใช้ทันที (หน้าตั้งค่าองค์กรเรียกหลังแก้) */
export async function refreshCatalog() {
  const [companies, employeeTypes] = await progress.quiet(() =>
    Promise.allSettled([api.listCompanies(), api.listEmployeeTypes()]),
  );
  const cat = {
    companies: companies.status === 'fulfilled' ? companies.value : undefined,
    employeeTypes: employeeTypes.status === 'fulfilled' ? employeeTypes.value : undefined,
  };
  applyCatalog(cat);
  try {
    if (cat.companies && cat.employeeTypes) sessionStorage.setItem(KEY, JSON.stringify(cat));
  } catch {
    /* sessionStorage ใช้ไม่ได้ — โหลดใหม่ทุกหน้า */
  }
}

let cached = null;
try {
  cached = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
} catch {
  cached = null;
}
if (cached) {
  applyCatalog(cached);
  refreshCatalog().catch(() => {});
} else {
  await refreshCatalog().catch(() => {});
}
