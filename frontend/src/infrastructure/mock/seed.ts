import { insuranceStatus } from '../../domain/insurance';
import { addDays, nextCycleDate } from '../../domain/date';
import { uniformStatus } from '../../domain/uniform';
import type {
  BatchType,
  Company,
  CompanyCode,
  Employee,
  EmployeeType,
  InsuranceBatch,
  ISODate,
  RuleSet,
  Site,
  UniformIssue,
} from '../../domain/types';
import { defaultRules } from './rules';

export interface MockDb {
  companies: Company[];
  sites: Site[];
  employees: Employee[];
  batches: InsuranceBatch[];
  issues: UniformIssue[];
  rules: RuleSet;
}

const SYSTEM_USER = 'ระบบ (ข้อมูลตั้งต้น)';
/** จำนวนพนักงานสุ่ม — ตั้งให้มากพอทดสอบการแบ่งหน้า */
const RANDOM_EMPLOYEES = 240;

/** PRNG แบบ deterministic (mulberry32) → seed เหมือนเดิมทุกครั้ง */
function prng(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)];
  return { next, int, pick };
}

const COMPANIES: Company[] = [
  { code: 'HL', name: 'แฮปปี้แลนด์ (HL)' },
  { code: 'PRO', name: 'PRO' },
  { code: 'CNS', name: 'CNS' },
  { code: 'CIC', name: 'CIC' },
  { code: 'AS', name: 'AS' },
];

const SITES: Site[] = [
  { id: 1, companyCode: 'HL', name: 'สำนักงานใหญ่ HL', hasGroupInsurance: true, poloColor: 'BLACK' },
  { id: 2, companyCode: 'HL', name: 'คลังสินค้า HL', hasGroupInsurance: true, poloColor: 'BLACK' },
  { id: 3, companyCode: 'PRO', name: 'สำนักงาน PRO', hasGroupInsurance: true, poloColor: 'BLACK' },
  { id: 4, companyCode: 'PRO', name: 'Pro Site — โครงการพระราม 9', hasGroupInsurance: true, poloColor: 'BLACK' },
  { id: 5, companyCode: 'PRO', name: 'Pro Site — โครงการบางนา', hasGroupInsurance: true, poloColor: 'NAVY' },
  { id: 6, companyCode: 'CNS', name: 'สำนักงาน CNS', hasGroupInsurance: true, poloColor: 'BLACK' },
  { id: 7, companyCode: 'CNS', name: 'หน่วยงาน อาคารสีลม', hasGroupInsurance: true, poloColor: 'BLACK' },
  { id: 8, companyCode: 'CNS', name: 'หน่วยงาน โรงพยาบาลรามอินทรา', hasGroupInsurance: false, poloColor: 'BLACK' },
  { id: 9, companyCode: 'CIC', name: 'สำนักงาน CIC', hasGroupInsurance: true, poloColor: 'BLACK' },
  { id: 10, companyCode: 'AS', name: 'สำนักงาน AS', hasGroupInsurance: true, poloColor: 'BLACK' },
  { id: 11, companyCode: 'AS', name: 'ไซต์ก่อสร้าง AS', hasGroupInsurance: true, poloColor: 'BLACK' },
];

const OFFICE_SITE: Record<CompanyCode, number> = { HL: 1, PRO: 3, CNS: 6, CIC: 9, AS: 10 };

const DEPT_GROUPS: Record<CompanyCode, string[]> = {
  HL: ['Support Line', 'การตลาด'],
  PRO: ['Support Line', 'การตลาด', 'BU ส่วนกลาง', 'ฝ่ายขาย'],
  CNS: ['Support Line', 'BU ส่วนกลาง', 'ฝ่ายขาย'],
  CIC: ['Support Line', 'BU ส่วนกลาง', 'บริหารห้องเช่าและพื้นที่เช่า'],
  AS: ['BU ส่วนกลาง', 'ฝ่ายขาย', 'วิศวกรรมและการออกแบบ'],
};

const PRO_POSITIONS = ['ช่างเทคนิค', 'ช่างเทคนิค', 'ช่างทีมโมบาย', 'หัวหน้าช่างเทคนิค', 'วิศวกร', 'ผู้ควบคุมงาน', 'ธุรการโครงการ'];

const FIRST = ['สมชาย', 'สมหญิง', 'วิชัย', 'มาลี', 'ประเสริฐ', 'สุดา', 'อนุชา', 'กาญจนา', 'ธนพล', 'พิมพ์ชนก', 'ณัฐวุฒิ', 'อรอุมา', 'กิตติพงษ์', 'ศิริพร', 'วรเชษฐ์', 'จันทร์เพ็ญ', 'ปิยะ', 'รัตนา', 'เอกชัย', 'นภัสสร', 'ภานุ', 'สุภาพร', 'ชยพล', 'ลำดวน'];
const LAST = ['ใจดี', 'รักงาน', 'มั่นคง', 'ศรีสุข', 'แสงทอง', 'บุญมา', 'ทองดี', 'วงศ์ไทย', 'สายสุวรรณ', 'พรหมมา', 'จันทร์หอม', 'เพชรรัตน์', 'สุขสวัสดิ์', 'ปัญญาดี', 'อินทร์แก้ว', 'ชัยมงคล'];

interface Draft extends Partial<Employee> {
  employeeType: EmployeeType;
  companyCode: CompanyCode;
  startDays: number; // เริ่มงานกี่วันก่อนวันนี้
  /** edge case: ไม่ต้องสร้างประวัติแจกชุดอัตโนมัติ */
  keepUniformPending?: boolean;
}

export function buildSeed(today: ISODate): MockDb {
  const rnd = prng(20261015);
  const rules = defaultRules();
  const ago = (days: number) => addDays(today, -days);
  const birthForAge = (age: number) => addDays(today, -Math.round(age * 365.25) - rnd.int(0, 300));

  const edge: Draft[] = [
    { companyCode: 'HL', employeeType: 'CENTRAL', deptGroup: 'Support Line', level: 3, startDays: 12, firstName: 'ปวีณา', lastName: 'เริ่มใหม่' },
    { companyCode: 'CIC', employeeType: 'CENTRAL', deptGroup: 'บริหารห้องเช่าและพื้นที่เช่า', level: 2, startDays: 20, keepUniformPending: true, firstName: 'ธีรวัฒน์', lastName: 'ห้องเช่า' },
    { companyCode: 'PRO', employeeType: 'PRO_SITE', siteId: 4, position: 'ช่างเทคนิค', startDays: 3, keepUniformPending: true, firstName: 'สุรชัย', lastName: 'ช่างใหม่' },
    { companyCode: 'PRO', employeeType: 'PRO_SITE', siteId: 5, position: 'ช่างทีมโมบาย', startDays: 6, keepUniformPending: true, firstName: 'อำนาจ', lastName: 'โมบาย' },
    { companyCode: 'PRO', employeeType: 'PRO_SITE', siteId: 4, position: 'ช่างเทคนิค', contractType: 'SHORT_3PCT', startDays: 90, firstName: 'บุญชู', lastName: 'สัญญาสั้น' },
    { companyCode: 'HL', employeeType: 'DAILY', siteId: 2, startDays: 110, firstName: 'สมปอง', lastName: 'รายวัน' },
    { companyCode: 'AS', employeeType: 'DAILY', siteId: 11, startDays: 118, firstName: 'ทองใบ', lastName: 'ก่อสร้าง' },
    { companyCode: 'CNS', employeeType: 'MAID_CNS', siteId: 8, startDays: 200, firstName: 'บัวผัน', lastName: 'รามอินทรา' },
    { companyCode: 'CNS', employeeType: 'MAID_CNS', siteId: 7, startDays: 115, firstName: 'สมศรี', lastName: 'สีลม' },
    { companyCode: 'AS', employeeType: 'CENTRAL', deptGroup: 'BU ส่วนกลาง', level: 8, startDays: 25, birthDate: birthForAge(66), firstName: 'ประยูร', lastName: 'อาวุโส' },
    { companyCode: 'HL', employeeType: 'CENTRAL', deptGroup: 'การตลาด', level: 4, startDays: 400, status: 'INACTIVE', endReason: 'RESIGN', endDate: ago(8), lastWorkingDate: ago(9), firstName: 'กมลชนก', lastName: 'ลาออก' },
    { companyCode: 'PRO', employeeType: 'PRO_SITE', siteId: 4, position: 'ช่างเทคนิค', startDays: 300, status: 'INACTIVE', endReason: 'ABSENT_3D', lastWorkingDate: ago(10), endDate: ago(6), firstName: 'สมบัติ', lastName: 'ขาดงาน' },
    { companyCode: 'CNS', employeeType: 'CENTRAL', deptGroup: 'BU ส่วนกลาง', level: 5, startDays: 700, status: 'INACTIVE', endReason: 'TERMINATED', endDate: ago(2), lastWorkingDate: ago(2), firstName: 'ชาตรี', lastName: 'เลิกจ้าง' },
    { companyCode: 'HL', employeeType: 'CENTRAL', deptGroup: 'Support Line', level: 2, startDays: 500, status: 'INACTIVE', endReason: 'MISCONDUCT', endDate: ago(1), lastWorkingDate: ago(1), firstName: 'วีระ', lastName: 'ทำผิด' },
    { companyCode: 'CIC', employeeType: 'CENTRAL', deptGroup: 'BU ส่วนกลาง', level: 7, startDays: 800, firstName: 'อรรถพล', lastName: 'ระดับเจ็ด' },
    // ครบ 30 วันแล้ว รอแจ้งเข้ารอบถัดไป
    { companyCode: 'PRO', employeeType: 'CENTRAL', deptGroup: 'ฝ่ายขาย', level: 3, startDays: 42, firstName: 'จิราพร', lastName: 'ฝ่ายขาย' },
    { companyCode: 'AS', employeeType: 'CENTRAL', deptGroup: 'วิศวกรรมและการออกแบบ', level: 4, startDays: 38, firstName: 'ภูมิพัฒน์', lastName: 'ออกแบบ' },
  ];

  const random: Draft[] = [];
  for (let i = 0; i < RANDOM_EMPLOYEES; i++) {
    const roll = rnd.next();
    const startDays = rnd.int(150, 2600);
    const inactive = rnd.next() < 0.12;
    const end: Partial<Employee> = inactive
      ? (() => {
          const endDays = rnd.int(40, Math.min(startDays - 30, 900));
          return { status: 'INACTIVE', endReason: 'RESIGN', endDate: ago(endDays), lastWorkingDate: ago(endDays + 1) };
        })()
      : {};
    if (roll < 0.45) {
      const companyCode = rnd.pick<CompanyCode>(['HL', 'HL', 'PRO', 'CNS', 'CIC', 'AS', 'AS']);
      const deptGroup = rnd.pick(DEPT_GROUPS[companyCode]);
      const level = companyCode === 'CIC' && deptGroup !== 'Support Line' ? rnd.int(1, 5) : rnd.int(1, 8);
      random.push({ companyCode, employeeType: 'CENTRAL', deptGroup, level, startDays, ...end });
    } else if (roll < 0.72) {
      random.push({ companyCode: 'PRO', employeeType: 'PRO_SITE', siteId: rnd.pick([4, 4, 5]), position: rnd.pick(PRO_POSITIONS), contractType: rnd.next() < 0.1 ? 'SHORT_3PCT' : 'REGULAR', startDays, ...end });
    } else if (roll < 0.87) {
      const companyCode = rnd.pick<CompanyCode>(['HL', 'AS', 'AS', 'CNS']);
      const siteId = companyCode === 'HL' ? 2 : companyCode === 'AS' ? 11 : 6;
      random.push({ companyCode, employeeType: 'DAILY', siteId, startDays, ...end });
    } else {
      random.push({ companyCode: 'CNS', employeeType: 'MAID_CNS', siteId: rnd.pick([7, 7, 8]), startDays, ...end });
    }
  }

  const salaryFor = (t: EmployeeType, level: number | null) =>
    t === 'CENTRAL' ? 15000 + (level ?? 1) * 4500 + rnd.int(0, 20) * 250 : t === 'PRO_SITE' ? 14000 + rnd.int(0, 40) * 250 : t === 'DAILY' ? 10800 + rnd.int(0, 12) * 100 : 11000 + rnd.int(0, 8) * 100;

  const prefix: Record<CompanyCode, string> = { HL: 'HL', PRO: 'PR', CNS: 'CN', CIC: 'CI', AS: 'AS' };
  const counters: Record<CompanyCode, number> = { HL: 0, PRO: 0, CNS: 0, CIC: 0, AS: 0 };
  const pendingUniform = new Set<number>();

  const employees: Employee[] = [...edge, ...random].map((d, i) => {
    const id = i + 1;
    if (d.keepUniformPending) pendingUniform.add(id);
    counters[d.companyCode]++;
    const startDate = ago(d.startDays);
    const pass = addDays(startDate, 119);
    const status = d.status ?? 'ACTIVE';
    const level = d.employeeType === 'CENTRAL' ? (d.level ?? 1) : null;
    return {
      id,
      empCode: `${prefix[d.companyCode]}${String(6000 + counters[d.companyCode] * 7).padStart(5, '0')}`,
      firstName: d.firstName ?? rnd.pick(FIRST),
      lastName: d.lastName ?? rnd.pick(LAST),
      companyCode: d.companyCode,
      siteId: d.siteId ?? OFFICE_SITE[d.companyCode],
      employeeType: d.employeeType,
      contractType: d.contractType ?? 'REGULAR',
      deptGroup: d.employeeType === 'CENTRAL' ? (d.deptGroup ?? null) : null,
      position: d.employeeType === 'PRO_SITE' ? (d.position ?? null) : null,
      level,
      salary: d.salary ?? salaryFor(d.employeeType, level),
      birthDate: d.birthDate ?? birthForAge(rnd.int(20, 58)),
      startDate,
      probationPassDate: pass <= (d.endDate ?? today) ? pass : null,
      status,
      lastWorkingDate: d.lastWorkingDate ?? null,
      endDate: d.endDate ?? null,
      endReason: d.endReason ?? null,
    };
  });

  const siteById = new Map(SITES.map((s) => [s.id, s]));

  // ----- ประวัติแจ้งประกัน: ทุกรายการที่รอบ < รอบปัจจุบันถือว่าส่งแล้ว -----
  const currentCycle = nextCycleDate(today, rules.settings.insuranceCycleDay);
  const grouped = new Map<string, number[]>();
  const add = (cycle: ISODate, type: BatchType, id: number) => {
    const k = `${cycle}|${type}`;
    grouped.set(k, [...(grouped.get(k) ?? []), id]);
  };
  for (const e of employees) {
    const st = insuranceStatus(e, siteById.get(e.siteId) ?? null, rules);
    if (!st.eligible || !st.enrollCycleDate) continue;
    if (st.enrollCycleDate < currentCycle) add(st.enrollCycleDate, 'IN', e.id);
    if (!st.exitCycleDate || !st.exitDate) continue;
    if (st.exitUrgent) {
      if (st.exitDate < addDays(today, -7)) add(st.exitDate, 'URGENT', e.id);
    } else if (st.exitCycleDate < currentCycle) {
      add(st.exitCycleDate, 'OUT', e.id);
    }
  }
  const batches: InsuranceBatch[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, ids], i) => {
      const [cycleDate, type] = k.split('|') as [ISODate, BatchType];
      return { id: i + 1, cycleDate, type, employeeIds: ids, submittedAt: `${addDays(cycleDate, -1)}T10:00:00`, submittedBy: SYSTEM_USER };
    });

  // ----- ประวัติแจกชุด: ครบกำหนดเกิน 14 วัน → แจกแล้ว (เว้นบางส่วนให้ค้าง) -----
  const issues: UniformIssue[] = [];
  const cutoff = addDays(today, -14);
  for (const e of employees) {
    if (pendingUniform.has(e.id)) continue;
    const st = uniformStatus(e, siteById.get(e.siteId) ?? null, rules, [], today);
    for (const ent of st.entitlements) {
      if (ent.dueDate > cutoff || rnd.next() < 0.06) continue;
      issues.push({
        id: issues.length + 1,
        employeeId: e.id,
        entitlementKey: ent.key,
        event: ent.event,
        qty: ent.qty,
        size: rnd.pick(['S', 'M', 'L', 'XL', '2XL']),
        issuedAt: addDays(ent.dueDate, rnd.int(1, 10)),
        issuedBy: SYSTEM_USER,
      });
    }
  }

  return { companies: COMPANIES, sites: SITES, employees, batches, issues, rules };
}
