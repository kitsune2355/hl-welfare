// สวัสดิการเพิ่มเติม — รายชื่อผู้มีสิทธิ์ / สิทธิ์รายคน / ตัวนับบนเมนู (คู่แฝด: backend/usecases/welfare.php)
import { welfareDueCount, welfareStatus } from '../../domain/welfare.js';
import { employeeLite } from './insuranceCycle.js';

/** แถวของหน้า welfare.html แท็บผู้มีสิทธิ์ — เฉพาะคนที่ตรงเงื่อนไข (ไม่มีสิทธิ์ไม่แสดง) เรียงตามรหัสพนักงาน */
export function buildWelfareRoster(program, employees, sites, records, today) {
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  return employees
    .map((e) => ({ employee: employeeLite(e), siteName: siteName.get(e.siteId) ?? '', status: welfareStatus(e, program, records, today) }))
    .filter((r) => r.status.state !== 'NONE')
    .sort((a, b) => (a.employee.empCode < b.employee.empCode ? -1 : a.employee.empCode > b.employee.empCode ? 1 : 0));
}

/** สิทธิ์สวัสดิการเพิ่มเติม (ที่เปิดใช้งาน) ของพนักงาน 1 คน — การ์ดในหน้ารายละเอียดพนักงาน */
export function welfareOfEmployee(emp, programs, records, today) {
  return programs
    .filter((p) => p.active)
    .map((p) => ({ programId: p.id, name: p.name, icon: p.icon, unit: p.unit, frequency: p.frequency, status: welfareStatus(emp, p, records, today) }));
}

/** ตัวนับบนเมนู [{programId, due}] — เฉพาะที่เปิดใช้งาน */
export function welfareDueList(programs, employees, records, today) {
  return programs.filter((p) => p.active).map((p) => ({ programId: p.id, due: welfareDueCount(p, employees, records, today) }));
}
