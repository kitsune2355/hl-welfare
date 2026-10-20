// นำเข้า Excel พนักงาน — ข้อมูลสมมติทั้งหมด (ไม่ใช้ไฟล์จริงของ HR)
import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import {
  endReasonOf,
  guessEmployeeType,
  matchDeptGroup,
  matchSite,
  parseEmployeeSheet,
  planEmployeeImport,
  splitThaiName,
  toIsoDate,
} from '../web/assets/js/application/usecases/employeeImport.js';

// เลขวันที่ Excel ของวันที่ ค.ศ. y-m-d (ไฟล์ HR เก็บปี พ.ศ. ในเซลล์วันที่ → serial ของปี 25xx)
const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;

const IN_ROWS = [
  ['เข้าใหม่ประจำเดือนทดสอบ'],
  ['ลำดับ', 'รหัสพนักงาน', 'บริษัท', 'ชื่อพนักงาน', 'ชื่อตำแหน่ง', 'ชื่อหน่วยงาน', 'ฝ่าย', 'วันเริ่มงาน', 'วันเกิด', 'ระดับ', 'เลขบัตรประชาชน', 'หมายเหตุ'],
  [1, 9900001, 'CNS', 'นายทดสอบ หนึ่ง', 'เจ้าหน้าที่ขาย', 'แผนกขาย CNS', 'ฝ่ายขาย CNS', serial(2569, 9, 7), serial(2539, 6, 4), 'ระดับ 3', '1101700230701', ''],
  [2, 9900002, 'PRO', 'นางสาวทดสอบ สอง', 'ช่างเทคนิค', 'PRO/FM/ไซต์ทดสอบ', 'Facilities Management Division (BU:A)', serial(2569, 9, 1), serial(2545, 12, 12), 'ระดับ 2', '1-1017-00230-70-2', ''],
  [3, 9900003, 'XYZ', 'นายทดสอบ สาม', 'ช่าง', 'ที่ไหน', 'ฝ่าย', serial(2569, 9, 2), serial(2540, 1, 1), 'ระดับ 1', '', ''],
  [4, 'E0001', 'HL', 'นายซ้ำ ในระบบ', 'ธุรการ', 'สำนักงานใหญ่ HL', 'ฝ่ายการตลาด', serial(2569, 9, 2), serial(2540, 1, 1), 'ระดับ 1', '', ''],
  [null, null, null, null],
];
const OUT_ROWS = [
  ['ลาออกประจำเดือนทดสอบ'],
  ['ลำดับ', 'รหัสพนักงาน', 'บริษัท', 'ชื่อพนักงาน', 'ชื่อตำแหน่ง', 'ชื่อหน่วยงาน', 'ฝ่าย', 'วันเข้างาน', 'วันพ้นสภาพ', 'วันเกิด', 'เลขบัตรประชาชน', 'ระดับ', 'หมายเหตุ'],
  [1, 'E0001', 'HL', 'นายซ้ำ ในระบบ', '', '', '', serial(2560, 1, 1), serial(2569, 9, 26), serial(2530, 1, 1), '', 'ระดับ 2', 'ลาออก (ถูกต้อง)'],
  [2, 'E0002', 'HL', 'นางออกแล้ว ก่อนหน้า', '', '', '', serial(2560, 1, 1), serial(2569, 9, 1), serial(2530, 1, 1), '', 'ระดับ 2', 'ลาออก'],
  [3, 'E0003', 'CNS', 'ว่าที่ร.ต.ขาด งาน', '', 'แผนกปฏิบัติการ CNS', '', serial(2568, 1, 1), serial(2569, 9, 10), serial(2530, 1, 1), '', 'ระดับ 1', 'ลาออก (ผิดกฎ ขาดงานเกิน 3 วัน)'],
  [4, 'Z9999', 'PRO', 'นายไม่มี ในระบบ', 'ช่างเทคนิค', 'PRO/FM/ไซต์ทดสอบ', '', serial(2568, 5, 1), serial(2569, 9, 30), serial(2530, 1, 1), '1101700230701', 'ระดับ 2', 'ลาออก (ถูกต้อง ปิดหน่วยงาน)'],
];
const employees = [
  { id: 1, empCode: 'E0001', firstName: 'ซ้ำ', lastName: 'ในระบบ', status: 'ACTIVE', companyCode: 'HL' },
  { id: 2, empCode: 'E0002', firstName: 'ออกแล้ว', lastName: 'ก่อนหน้า', status: 'INACTIVE', companyCode: 'HL' },
  { id: 3, empCode: 'E0003', firstName: 'ขาด', lastName: 'งาน', status: 'ACTIVE', companyCode: 'CNS' },
];
const sites = [
  { id: 10, companyCode: 'PRO', name: 'Pro Site — ไซต์ทดสอบ' },
  { id: 11, companyCode: 'PRO', name: 'Pro Site — อีกไซต์' },
  { id: 20, companyCode: 'CNS', name: 'สำนักงาน CNS' },
];

describe('นำเข้า Excel พนักงาน: อ่านค่า', () => {
  it('วันที่: เลข Excel ปี พ.ศ. / ข้อความ / ISO → ค.ศ.', () => {
    expect(toIsoDate(serial(2569, 9, 7))).toBe('2026-09-07');
    expect(toIsoDate(serial(2026, 9, 7))).toBe('2026-09-07');
    expect(toIsoDate('15/5/69')).toBe('2026-05-15');
    expect(toIsoDate('30/09/2569')).toBe('2026-09-30');
    expect(toIsoDate('2026-01-02')).toBe('2026-01-02');
    expect(toIsoDate('')).toBe(null);
    expect(toIsoDate('ไม่ใช่วันที่')).toBe(null);
  });
  it('ชื่อ: คำนำหน้าติดชื่อ → แยก + เพศ', () => {
    expect(splitThaiName('นายทดสอบ หนึ่ง')).toEqual({ title: 'นาย', rawTitle: 'นาย', firstName: 'ทดสอบ', lastName: 'หนึ่ง', gender: 'M' });
    expect(splitThaiName('นางสาวทดสอบ สอง').gender).toBe('F');
    expect(splitThaiName('น.ส. ทดสอบ สาม').title).toBe('นางสาว');
    const r = splitThaiName('ว่าที่ร.ต.ขาด งาน');
    expect([r.title, r.rawTitle, r.firstName, r.gender]).toEqual([null, 'ว่าที่ร.ต.', 'ขาด', null]);
  });
  it('เหตุผลพ้นสภาพจากหมายเหตุ', () => {
    expect(endReasonOf('ลาออก (ผิดกฎ ขาดงานเกิน 3 วัน)')).toBe('ABSENT_3D');
    expect(endReasonOf('ลาออก (ผิดกฎ ขางานเกิน 3 วัน)')).toBe('ABSENT_3D');
    expect(endReasonOf('ลาออก (ผิดกฎ ไม่แจ้งล่วงหน้า 30 วัน)')).toBe('RESIGN');
    expect(endReasonOf('สิ้นสุดระยะการจ้าง 15/5/69-30/09/69')).toBe('RESIGN');
    expect(endReasonOf('เลิกจ้าง')).toBe('TERMINATED');
    expect(endReasonOf('กระทำผิดวินัย')).toBe('MISCONDUCT');
  });
  it('หน่วยงาน / ประเภท / ฝ่าย', () => {
    expect(matchSite('PRO/FM/ไซต์ทดสอบ', 'PRO', sites)?.id).toBe(10);
    expect(matchSite('PRO/FM/ไม่มีแน่นอน', 'PRO', sites)).toBe(null);
    expect(matchSite('ไซต์ทดสอบ', 'CNS', sites)).toBe(null); // ต่างบริษัท
    expect(guessEmployeeType({ companyCode: 'PRO', unit: 'PRO/FM/x', position: '' })).toBe('PRO_SITE');
    expect(guessEmployeeType({ companyCode: 'CNS', unit: 'x', position: 'แม่บ้าน' })).toBe('MAID_CNS');
    expect(guessEmployeeType({ companyCode: 'CNS', unit: 'แผนกขาย', position: 'เจ้าหน้าที่ขาย' })).toBe('CENTRAL');
    expect(matchDeptGroup('ฝ่ายขาย CNS')).toBe('ฝ่ายขาย');
    expect(matchDeptGroup('ฝ่ายบริหารทรัพยากรบุคคล')).toBe(null);
  });
  it('หาหัวตารางเอง + ไม่ใช่ไฟล์รายชื่อ = error', () => {
    expect(parseEmployeeSheet(IN_ROWS).kind).toBe('IN');
    expect(parseEmployeeSheet(IN_ROWS).items.length).toBe(4); // แถวว่างท้ายตารางถูกข้าม
    expect(parseEmployeeSheet(OUT_ROWS).kind).toBe('OUT');
    expect(!!parseEmployeeSheet([['a', 'b'], [1, 2]]).error).toBe(true);
  });
});

describe('นำเข้า Excel พนักงาน: แผนการนำเข้า', () => {
  it('ไฟล์เข้าใหม่: เพิ่มแถว · รหัสซ้ำ / บริษัทไม่รู้จัก = ข้าม · ที่เดาไม่ได้ = issues', () => {
    const plan = planEmployeeImport(parseEmployeeSheet(IN_ROWS), employees, sites);
    expect(plan.add.length).toBe(2);
    expect(plan.skip.map((s) => s.reason.split(' (')[0])).toEqual(['ไม่รู้จักบริษัท "XYZ"', 'มีรหัสนี้ในระบบแล้ว']);
    const [cns, pro] = plan.add.map((a) => a.row);
    expect([cns.empCode, cns.employeeType, cns.deptGroup, cns.level, cns.siteId, cns.startDate, cns.probationPassDate]).toEqual([
      '9900001', 'CENTRAL', 'ฝ่ายขาย', 3, 0, '2026-09-07', '2027-01-04',
    ]);
    expect([pro.employeeType, pro.siteId, pro.position, pro.level, pro.nationalId, pro.gender]).toEqual(['PRO_SITE', 10, 'ช่างเทคนิค', null, '1101700230702', 'F']);
    expect(plan.add[0].issues.some((x) => x.startsWith('ไม่พบหน่วยงาน'))).toBe(true);
    expect(plan.add[1].issues.length).toBe(0);
  });
  it('ไฟล์ลาออก: แก้คนที่มี → พ้นสภาพ · พ้นสภาพแล้ว / ไม่พบ = ข้าม', () => {
    const plan = planEmployeeImport(parseEmployeeSheet(OUT_ROWS), employees, sites);
    expect(plan.update.map((u) => [u.id, u.row.status, u.row.endDate, u.row.lastWorkingDate, u.row.endReason])).toEqual([
      [1, 'INACTIVE', '2026-09-26', '2026-09-26', 'RESIGN'],
      [3, 'INACTIVE', '2026-09-10', '2026-09-10', 'ABSENT_3D'],
    ]);
    expect(plan.update[1].issues.length).toBe(1); // ขาดงาน 3 วัน → ให้ตรวจวันทำงานสุดท้าย
    expect(plan.skip.map((s) => s.reason)).toEqual(['พ้นสภาพในระบบแล้ว', 'ไม่พบรหัสนี้ในระบบ']);
    expect(plan.add.length).toBe(0);
  });
  it('ไฟล์ลาออก + addMissing: คนที่ไม่มีในระบบ → เพิ่มเป็นพนักงานที่พ้นสภาพ', () => {
    const plan = planEmployeeImport(parseEmployeeSheet(OUT_ROWS), employees, sites, { addMissing: true });
    expect(plan.add.length).toBe(1);
    const r = plan.add[0].row;
    expect([r.empCode, r.status, r.endDate, r.endReason, r.employeeType, r.siteId, r.startDate]).toEqual(['Z9999', 'INACTIVE', '2026-09-30', 'RESIGN', 'PRO_SITE', 10, '2025-05-01']);
  });
});
