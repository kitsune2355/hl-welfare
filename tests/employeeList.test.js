// ไฟล์รายชื่อพนักงาน (application/usecases/employeeList.js) — ส่งออก → แก้ใน Excel → นำเข้ากลับ · ข้อมูลสมมติ
import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { employeeListRows, isListHeader, LIST_COLUMNS, monthlyMovers, parseEmployeeList, planEmployeeList, TEMPLATE_COLUMNS } from '../web/assets/js/application/usecases/employeeList.js';
import { parseEmployeeSheet } from '../web/assets/js/application/usecases/employeeImport.js';

const serial = (iso) => (Date.UTC(...iso.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0))) - Date.UTC(1899, 11, 30)) / 86_400_000;
const sites = [
  { id: 1, companyCode: 'HL', name: 'สำนักงานใหญ่ HL' },
  { id: 2, companyCode: 'HL', name: 'สาขาบางนา' },
  { id: 10, companyCode: 'PRO', name: 'Pro Site — ไซต์ทดสอบ' },
];
const groups = ['Support Line', 'ฝ่ายขาย'];
const base = {
  contractType: 'REGULAR', nationalId: null, phone: null, email: null, lastWorkingDate: null, endDate: null, endReason: null, status: 'ACTIVE',
};
const employees = [
  { ...base, id: 1, empCode: 'E1', title: 'นาย', firstName: 'หนึ่ง', lastName: 'ทดสอบ', gender: 'M', birthDate: '1990-01-02', companyCode: 'HL', siteId: 1, employeeType: 'CENTRAL', deptGroup: 'ฝ่ายขาย', level: 3, position: 'ธุรการ', startDate: '2024-01-01', probationPassDate: '2024-04-29', phone: '0812345678' },
  { ...base, id: 2, empCode: 'E2', title: 'นางสาว', firstName: 'สอง', lastName: 'ทดสอบ', gender: 'F', birthDate: '1995-05-06', companyCode: 'PRO', siteId: 10, employeeType: 'PRO_SITE', deptGroup: null, level: null, position: 'ช่างเทคนิค', startDate: '2025-02-03', probationPassDate: '2025-06-02', nationalId: '1101700230701' },
];
/** แถวที่ส่งออก → เหมือนอ่านกลับจาก Excel (วันที่เป็นเลข serial) */
const asSheet = (emps) => [
  LIST_COLUMNS.map((c) => c.head),
  ...employeeListRows(emps, sites).map((r) => r.map((v, i) => (LIST_COLUMNS[i].kind === 'date' && v ? serial(v) : v))),
];
const plan = (rows) => planEmployeeList(parseEmployeeList(rows), employees, sites, { deptGroups: groups });

describe('ไฟล์รายชื่อพนักงาน', () => {
  it('หัวตารางแยกจากไฟล์เข้าใหม่ / ลาออกของ HR', () => {
    expect(isListHeader(LIST_COLUMNS.map((c) => c.head))).toBe(true);
    expect(isListHeader(['ลำดับ', 'รหัสพนักงาน', 'บริษัท', 'ชื่อพนักงาน'])).toBe(false);
    expect(parseEmployeeSheet(asSheet(employees)).error === undefined).toBe(true); // ตัวอ่านไฟล์ HR อ่านได้แต่ไม่ใช้กับไฟล์นี้
  });
  it('ส่งออกแล้วนำเข้ากลับทันที = เหมือนเดิมทุกคน', () => {
    const p = plan(asSheet(employees));
    expect([p.add.length, p.update.length, p.skip.length, p.unchanged]).toEqual([0, 0, 0, 2]);
  });
  it('แก้ในไฟล์ → แก้เฉพาะช่องที่เปลี่ยน · คอลัมน์ที่ลบออก = ไม่แตะ', () => {
    const rows = asSheet(employees);
    const col = (h) => rows[0].indexOf(h);
    rows[1][col('ตำแหน่ง')] = 'หัวหน้าธุรการ';
    rows[1][col('หน่วยงาน')] = 'สาขาบางนา';
    rows[1][col('วันเกิด')] = '2/1/2534'; // พิมพ์เองเป็น พ.ศ.
    rows[2][col('สถานะ')] = 'พ้นสภาพ';
    rows[2][col('เหตุผลพ้นสภาพ')] = 'เลิกจ้าง';
    rows[2][col('วันพ้นสภาพ')] = serial('2026-10-01');
    const p = plan(rows);
    expect(p.update.map((u) => [u.id, u.changes])).toEqual([
      [1, ['วันเกิด', 'หน่วยงาน', 'ตำแหน่ง']],
      [2, ['สถานะ', 'เหตุผลพ้นสภาพ', 'วันพ้นสภาพ']],
    ]);
    expect([p.update[0].row.siteId, p.update[0].row.birthDate, p.update[1].row.endReason]).toEqual([2, '1991-01-02', 'TERMINATED']);
    // ลบคอลัมน์อีเมลและโทร → ค่าเดิมไม่หาย
    const slim = asSheet(employees).map((r) => r.filter((_, i) => !['โทรศัพท์มือถือ', 'อีเมล'].includes(LIST_COLUMNS[i].head)));
    expect(plan(slim).unchanged).toBe(2);
  });
  it('รหัสใหม่ = เพิ่ม · บริษัทไม่รู้จัก = ข้าม · ค่าอ่านไม่ได้ = คงเดิม + แจ้ง · รหัสซ้ำในไฟล์ = ข้าม', () => {
    const rows = asSheet(employees);
    const col = (h) => rows[0].indexOf(h);
    const extra = [...rows[1]];
    extra[col('รหัส')] = 'E9';
    extra[col('ชื่อ')] = 'เก้า';
    const bad = [...rows[1]];
    bad[col('รหัส')] = 'E8';
    bad[col('บริษัท')] = 'XYZ';
    rows[1][col('หน่วยงาน')] = 'ไม่มีหน่วยงานนี้';
    rows[1][col('ประเภท')] = 'ประเภทแปลก';
    const p = plan([...rows, extra, bad, [...rows[2]]]);
    expect(p.add.map((a) => [a.row.empCode, a.row.firstName, a.row.siteId, a.row.employeeType])).toEqual([['E9', 'เก้า', 1, 'CENTRAL']]);
    expect(p.skip.map((x) => [x.empCode, x.reason])).toEqual([
      ['E1', 'หน่วยงาน "ไม่มีหน่วยงานนี้" อ่านไม่ได้ — คงค่าเดิม · ประเภท "ประเภทแปลก" อ่านไม่ได้ — คงค่าเดิม'], // ไม่มีอะไรเปลี่ยน แต่บอกให้รู้
      ['E8', 'ไม่รู้จักบริษัท "XYZ"'],
      ['E2', 'รหัสซ้ำในไฟล์ — ใช้แถวแรก'],
    ]);
    expect(p.unchanged).toBe(1);
  });
  it('ค่าอ่านไม่ได้ในแถวที่มีการแก้อื่น → แจ้งให้ตรวจ', () => {
    const rows = asSheet(employees);
    const col = (h) => rows[0].indexOf(h);
    rows[1][col('ตำแหน่ง')] = 'ผู้จัดการ';
    rows[1][col('หน่วยงาน')] = 'ไม่มีหน่วยงานนี้';
    const p = plan(rows);
    expect(p.update[0].row.siteId).toBe(1);
    expect(p.update[0].issues).toEqual(['หน่วยงาน "ไม่มีหน่วยงานนี้" อ่านไม่ได้ — คงค่าเดิม']);
  });
});

describe('ไฟล์รายชื่อพนักงาน: คอลัมน์ชุดเดียวกับตาราง + template / ส่งออกเข้า-ออกรายเดือน', () => {
  it('ลำดับคอลัมน์ = ตารางพนักงาน (pages/employees.js)', () => {
    expect(LIST_COLUMNS.map((c) => c.head)).toEqual([
      'รหัส', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'เพศ', 'วันเกิด', 'อายุ', 'บริษัท', 'หน่วยงาน', 'ประเภท', 'กลุ่ม / ฝ่าย', 'ระดับ', 'ตำแหน่ง',
      'วันเริ่มงาน', 'ผ่านทดลองงาน', 'เลขบัตรประชาชน', 'โทรศัพท์มือถือ', 'อีเมล', 'สถานะ', 'เหตุผลพ้นสภาพ', 'ทำงานวันสุดท้าย', 'วันพ้นสภาพ',
    ]);
  });
  it('อายุ: เขียนลงไฟล์ (คำนวณ ณ วันที่ส่งออก) · นำเข้าไม่อ่าน — แก้ในไฟล์ไม่มีผล', () => {
    const iAge = LIST_COLUMNS.findIndex((c) => c.key === 'age');
    expect(employeeListRows(employees, sites, '2026-10-27').map((r) => r[iAge])).toEqual([36, 31]);
    const rows = asSheet(employees);
    rows[1][iAge] = 99;
    expect(parseEmployeeList(rows).columns.includes('age')).toBe(false);
    const p = plan(rows);
    expect([p.update.length, p.unchanged]).toEqual([0, 2]);
  });
  it('template เปล่า = เฉพาะช่องที่ต้องกรอก (ไม่มีค่าที่ระบบคำนวณ / กลุ่มพ้นสภาพ) · ลำดับตามตาราง', () => {
    expect(TEMPLATE_COLUMNS.map((c) => c.head)).toEqual([
      'รหัส', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'วันเกิด', 'บริษัท', 'หน่วยงาน', 'ประเภท', 'กลุ่ม / ฝ่าย', 'ระดับ', 'ตำแหน่ง', 'วันเริ่มงาน', 'เลขบัตรประชาชน', 'โทรศัพท์มือถือ', 'อีเมล',
    ]);
    expect(isListHeader(TEMPLATE_COLUMNS.map((c) => c.head))).toBe(true); // นำเข้ารู้จักไฟล์ template
    const p = plan([TEMPLATE_COLUMNS.map((c) => c.head)]);
    expect([p.add.length, p.update.length, p.skip.length]).toEqual([0, 0, 0]);
  });
  it('นำเข้า template: ระบบเติม เพศ (จากคำนำหน้า) · ผ่านทดลองงาน · สถานะทำงานอยู่', () => {
    const head = TEMPLATE_COLUMNS.map((c) => c.head);
    const row = (code, title) => {
      const v = { รหัส: code, คำนำหน้า: title, ชื่อ: 'ใหม่', นามสกุล: 'ทดสอบ', วันเกิด: serial('1999-03-04'), บริษัท: 'HL', หน่วยงาน: 'สาขาบางนา', ประเภท: 'ส่วนกลาง', 'กลุ่ม / ฝ่าย': 'ฝ่ายขาย', ระดับ: 2, วันเริ่มงาน: serial('2026-10-01') };
      return head.map((h) => v[h] ?? null);
    };
    const p = plan([head, row('N1', 'นางสาว'), row('N2', 'นาย'), row('N3', 'ว่าที่ร.ต.')]);
    expect(p.add.map((a) => [a.row.empCode, a.row.gender, a.row.status, a.row.probationPassDate, a.row.siteId])).toEqual([
      ['N1', 'F', 'ACTIVE', '2027-01-28', 2],
      ['N2', 'M', 'ACTIVE', '2027-01-28', 2],
      ['N3', null, 'ACTIVE', '2027-01-28', 2], // คำนำหน้าที่ระบบไม่มี = ไม่เดาเพศ (แจ้งให้ตรวจ)
    ]);
  });
  it('เข้า-ออกของเดือน: เข้าใหม่ = วันเริ่มงานในเดือน · ลาออก = พ้นสภาพ + วันพ้นสภาพในเดือน · เรียงตามรหัส', () => {
    const people = [
      { ...employees[0], empCode: 'B2', startDate: '2026-09-05' },
      { ...employees[1], empCode: 'B1', startDate: '2026-09-01' },
      { ...employees[0], id: 3, empCode: 'C1', startDate: '2020-01-01', status: 'INACTIVE', endDate: '2026-09-30', endReason: 'RESIGN' },
      { ...employees[0], id: 4, empCode: 'D1', startDate: '2026-08-31', status: 'INACTIVE', endDate: '2026-10-01', endReason: 'RESIGN' },
    ];
    const mv = monthlyMovers(people, '2026-09');
    expect([mv.IN.map((e) => e.empCode), mv.OUT.map((e) => e.empCode)]).toEqual([['B1', 'B2'], ['C1']]);
    // ชีตลาออกนำเข้ากลับ (ระบบยังไม่มีคนนี้) = เพิ่มเป็นพ้นสภาพ ค่าครบ
    const out = [LIST_COLUMNS.map((c) => c.head), ...employeeListRows(mv.OUT, sites).map((r) => r.map((v, i) => (LIST_COLUMNS[i].kind === 'date' && v ? serial(v) : v)))];
    const p = plan(out);
    expect(p.add.map((a) => [a.row.empCode, a.row.status, a.row.endDate, a.row.endReason, a.row.siteId])).toEqual([['C1', 'INACTIVE', '2026-09-30', 'RESIGN', 1]]);
  });
});
