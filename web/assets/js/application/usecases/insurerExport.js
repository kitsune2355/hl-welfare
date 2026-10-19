// ส่งออกไฟล์แจ้งเข้า-ออกประกันกลุ่ม ตามแบบฟอร์มของบริษัทประกัน (แทนปุ่ม "ส่งแจ้ง")
//
//   1) buildInsurerExport — ใครอยู่ในไฟล์รอบนี้ (ฝั่ง server ทำแบบเดียวกันในเฟส 2)
//      buildBatchExport   — ไฟล์ของการส่งออกครั้งที่ผ่านมา (ดาวน์โหลดซ้ำจากประวัติ)
//   2) cellValue          — ค่าในเซลล์ของแต่ละคอลัมน์ (ใช้ตอนเติมลงไฟล์แบบฟอร์ม Excel — app/excelTemplate.js)
//   3) exportCsvRows      — ตารางเดียวสำหรับ CSV
//
// การส่งออกแบบ "บันทึกว่าแจ้งแล้ว" = สร้าง batch ของรอบนั้น (insurerId) → รายการไม่ตกค้างไปรอบถัดไป
// ส่งออกรอบเดิมซ้ำ = แทนที่ batch เดิมของรอบ + บริษัทประกันนั้น
import { COLUMN_SOURCES, requiredEmployeeFields } from '../../domain/insurerForm.js';
import { EMPLOYEE_TYPE_LABEL, GENDER_LABEL, THAI_MONTHS_FULL } from '../../domain/labels.js';
import { buildInsuranceCycle, sentIndex } from './insuranceCycle.js';

const directionOf = (t) => (t === 'IN' ? 'IN' : 'OUT');
const byCode = (a, b) => a.employee.empCode.localeCompare(b.employee.empCode);

/**
 * รายชื่อที่ต้องอยู่ในไฟล์ของบริษัทประกัน `insurer` รอบ `cycleDate`
 * = รายการที่ยังไม่ส่งออก (รวมที่ตกค้างจากรอบก่อน) + ที่ส่งออกให้บริษัทประกันนี้ในรอบนี้แล้ว (ส่งออกซ้ำได้)
 */
export function buildInsurerExport({ cycleDate, insurer, employees, sites, rules, batches, companies = [] }) {
  const sent = sentIndex(batches);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const companyName = new Map(companies.map((c) => [c.code, c.legalName ?? c.name]));
  const codes = new Set(insurer.companies.map((c) => c.companyCode));
  const rows = buildInsuranceCycle(cycleDate, employees, sites, rules, batches)
    .rows.filter((r) => codes.has(r.employee.companyCode))
    .filter((r) => {
      if (!r.submitted) return true;
      const b = sent[directionOf(r.type)].get(r.employee.id);
      return b?.cycleDate === cycleDate && (b.insurerId ?? insurer.id) === insurer.id;
    })
    .map((r) => ({ ...r, employee: { ...r.employee, siteName: siteById.get(r.employee.siteId)?.name ?? '' } }));

  return { ...exportData(cycleDate, insurer, rows, companyName, insurer.companies), alreadyExported: rows.filter((r) => r.submitted).length };
}

/**
 * ไฟล์แจ้งบริษัทประกันของการส่งออกครั้งที่ผ่านมา (ประวัติ) — ใช้ดาวน์โหลดซ้ำเมื่อไฟล์หาย
 * = รายชื่อเฉพาะใน batch นั้น (ไม่รวมที่เพิ่มขึ้นทีหลัง) · ไม่บันทึกอะไรเพิ่ม
 * ข้อมูลพนักงาน/การผูกบริษัท/แบบฟอร์ม = ปัจจุบัน (บริษัทที่เลิกผูกแล้วแต่มีรายชื่อใน batch ยังได้ชีตของตัวเอง)
 */
export function buildBatchExport({ batch, insurer, employees, sites, rules, batches, companies = [] }) {
  const cycleRow = new Map(buildInsuranceCycle(batch.cycleDate, employees, sites, rules, batches).rows.map((r) => [`${r.employee.id}|${directionOf(r.type)}`, r]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const companyName = new Map(companies.map((c) => [c.code, c.legalName ?? c.name]));
  const rows = batch.items
    .filter((it) => empById.has(it.employeeId))
    .map(({ employeeId, type }) => {
      const e = empById.get(employeeId);
      const r = cycleRow.get(`${employeeId}|${directionOf(type)}`);
      return { type, employee: { ...e, siteName: siteById.get(e.siteId)?.name ?? '' }, effectiveDate: r?.effectiveDate ?? null, reason: r?.reason ?? '', submitted: true };
    });
  const bound = new Set(insurer.companies.map((c) => c.companyCode));
  const extra = [...new Set(rows.map((r) => r.employee.companyCode))].filter((c) => !bound.has(c)).sort();
  const cos = [...insurer.companies, ...extra.map((companyCode) => ({ companyCode, policyNo: '', holderName: '', plan: '' }))];
  return { ...exportData(batch.cycleDate, insurer, rows, companyName, cos), batchId: batch.id, alreadyExported: rows.length };
}

/** รายชื่อ → ข้อมูลไฟล์: แยกตามบริษัทในเครือ (ชีตละบริษัท) + รายการที่ข้อมูลไม่ครบ */
function exportData(cycleDate, insurer, rows, companyName, cos) {
  const needs = requiredEmployeeFields(insurer);
  const missing = rows
    .filter((r) => r.type === 'IN') // ข้อมูลส่วนตัวใช้เฉพาะแถวเข้าใหม่
    .map((r) => ({ employee: r.employee, fields: needs.filter((f) => !r.employee[f]) }))
    .filter((m) => m.fields.length);

  return {
    cycleDate,
    insurer,
    companies: cos.map((c) => {
      const mine = rows.filter((r) => r.employee.companyCode === c.companyCode);
      return {
        ...c,
        companyName: c.holderName?.trim() || companyName.get(c.companyCode) || c.companyCode,
        in: mine.filter((r) => r.type === 'IN').sort(byCode),
        out: mine.filter((r) => r.type !== 'IN').sort(byCode),
      };
    }),
    missing,
  };
}

// ---------- จัดรูปแบบค่า ----------
/** วันที่ ISO → ข้อความตามแบบฟอร์ม เช่น 05/02/2569 */
export function formatFormDate(iso, format = 'DD/MM/YYYY', era = 'BE') {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const year = era === 'BE' ? y + 543 : y;
  const pad = (n) => String(n).padStart(2, '0');
  if (format === 'D/M/YYYY') return `${d}/${m}/${year}`;
  if (format === 'D/M/YY') return `${d}/${m}/${String(year).slice(-2)}`;
  return `${pad(d)}/${pad(m)}/${year}`;
}

/** "กุมภาพันธ์ 2569" */
export const thaiMonthYear = (iso) => `${THAI_MONTHS_FULL[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(0, 4)) + 543}`;

/** ค่าในเซลล์ของคอลัมน์ col สำหรับแถว row (ใช้ทั้งสร้างไฟล์และแสดงตัวอย่างในหน้าตั้งค่า) */
export function cellValue(col, row, seq, form, company, cycleDate) {
  const e = row.employee;
  const date = (d) => formatFormDate(d, form.dateFormat, form.dateEra);
  const isIn = row.type === 'IN';
  if (col.only === 'IN' && !isIn) return '';
  if (col.only === 'OUT' && isIn) return '';
  switch (col.source) {
    case 'seq': return seq;
    case 'empCode': return e.empCode;
    case 'title': return e.title ?? '';
    case 'fullName': return `${e.firstName} ${e.lastName}`;
    case 'titleFullName': return `${e.title ?? ''}${e.firstName} ${e.lastName}`;
    case 'firstName': return e.firstName;
    case 'lastName': return e.lastName;
    case 'gender': return GENDER_LABEL[e.gender] ?? '';
    case 'birthDate': return date(e.birthDate);
    case 'nationalId': return String(e.nationalId ?? '').replace(/\D/g, '');
    case 'position': return e.position ?? e.deptGroup ?? EMPLOYEE_TYPE_LABEL[e.employeeType] ?? '';
    case 'phone': return e.phone ?? '';
    case 'email': return e.email ?? '';
    case 'salary': return e.salary ? Number(e.salary) : '';
    case 'startDate': return date(e.startDate);
    case 'companyCode': return e.companyCode;
    case 'siteName': return e.siteName ?? '';
    case 'plan': return isIn ? (company.plan ?? '') : '';
    case 'inMark': return isIn ? form.inMark : '';
    case 'outMark': return isIn ? '' : form.outMark;
    case 'effectiveDate': return date(row.effectiveDate);
    case 'inEffectiveDate': return isIn ? date(row.effectiveDate) : '';
    case 'outEffectiveDate': return isIn ? '' : date(row.effectiveDate);
    case 'cycleDate': return date(cycleDate);
    case 'reason': return row.reason ?? '';
    case 'text': return col.text ?? '';
    default: return '';
  }
}

/** CSV: ตารางเดียวทุกบริษัท (คอลัมน์แรก = บริษัท) ตามคอลัมน์ของแบบฟอร์ม Excel */
export function exportCsvRows(data) {
  const form = data.insurer;
  const cols = (form.template?.columns ?? []).filter((c) => c.source !== 'blank');
  const header = ['บริษัท', ...cols.map((c) => [c.group?.split('>').pop()?.trim(), c.header].filter(Boolean).join(' - ').replace(/\s*\n\s*/g, ' '))];
  const rows = [];
  for (const company of data.companies) {
    let seq = 0;
    for (const row of [...company.in, ...company.out]) {
      seq++;
      rows.push([company.companyCode, ...cols.map((col) => cellValue(col, row, seq, form, company, data.cycleDate))]);
    }
  }
  return { header, rows };
}

/** ป้ายของแหล่งข้อมูล (ใช้ในหน้าตั้งค่า) */
export const sourceLabel = (s) => COLUMN_SOURCES[s]?.label ?? s;
