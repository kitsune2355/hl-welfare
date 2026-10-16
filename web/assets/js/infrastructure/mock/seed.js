import { cycleDayOf, insuranceStatus } from '../../domain/insurance.js';
import { UNIFORM_EVENT_LABEL } from '../../domain/labels.js';
import { addDays, nextCycleDate } from '../../domain/date.js';
import { uniformStatus } from '../../domain/uniform.js';
import { thaiIdCheckDigit } from '../../domain/thaiId.js';
import { defaultInsurers } from './insurers.js';
import { defaultRules } from './rules.js';

const SYSTEM_USER = 'ระบบ (ข้อมูลตั้งต้น)';

/** จำนวนพนักงานสุ่ม — ตั้งให้มากพอทดสอบการแบ่งหน้า */
const RANDOM_EMPLOYEES = 240;

/** PRNG แบบ deterministic (mulberry32) → seed เหมือนเดิมทุกครั้ง */
function prng(seed) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (xs) => xs[Math.floor(next() * xs.length)];
  return { next, int, pick };
}

// legalName = ชื่อตามทะเบียน (ใช้ในชีตสรุปของไฟล์แจ้งประกัน)
const COMPANIES = [
  { code: 'HL', name: 'แฮปปี้แลนด์ (HL)', legalName: 'บ.แฮปปี้แลนด์ จำกัด' },
  { code: 'PRO', name: 'PRO', legalName: 'บ.โปรแอ็คทีฟ แมเนจเม้นท์ จำกัด' },
  { code: 'CNS', name: 'CNS', legalName: 'บ.คลีนนิ่ง โซลูชั่น จำกัด' },
  { code: 'CIC', name: 'CIC', legalName: 'บ.คอน.อิน.คอน จำกัด' },
  { code: 'AS', name: 'AS', legalName: 'บ.อาเชี่ยน คอนสตรั๊คชั่น จำกัด' },
];

const SITES = [
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

const OFFICE_SITE = { HL: 1, PRO: 3, CNS: 6, CIC: 9, AS: 10 };

const DEPT_GROUPS = {
  HL: ['Support Line', 'การตลาด'],
  PRO: ['Support Line', 'การตลาด', 'BU ส่วนกลาง', 'ฝ่ายขาย'],
  CNS: ['Support Line', 'BU ส่วนกลาง', 'ฝ่ายขาย'],
  CIC: ['Support Line', 'BU ส่วนกลาง', 'บริหารห้องเช่าและพื้นที่เช่า'],
  AS: ['BU ส่วนกลาง', 'ฝ่ายขาย', 'วิศวกรรมและการออกแบบ'],
};

const PRO_POSITIONS = [
  'ช่างเทคนิค',
  'ช่างเทคนิค',
  'ช่างทีมโมบาย',
  'หัวหน้าช่างเทคนิค',
  'วิศวกร',
  'ผู้ควบคุมงาน',
  'ธุรการโครงการ',
];

const FIRST = [
  'สมชาย',
  'สมหญิง',
  'วิชัย',
  'มาลี',
  'ประเสริฐ',
  'สุดา',
  'อนุชา',
  'กาญจนา',
  'ธนพล',
  'พิมพ์ชนก',
  'ณัฐวุฒิ',
  'อรอุมา',
  'กิตติพงษ์',
  'ศิริพร',
  'วรเชษฐ์',
  'จันทร์เพ็ญ',
  'ปิยะ',
  'รัตนา',
  'เอกชัย',
  'นภัสสร',
  'ภานุ',
  'สุภาพร',
  'ชยพล',
  'ลำดวน',
];

const LAST = [
  'ใจดี',
  'รักงาน',
  'มั่นคง',
  'ศรีสุข',
  'แสงทอง',
  'บุญมา',
  'ทองดี',
  'วงศ์ไทย',
  'สายสุวรรณ',
  'พรหมมา',
  'จันทร์หอม',
  'เพชรรัตน์',
  'สุขสวัสดิ์',
  'ปัญญาดี',
  'อินทร์แก้ว',
  'ชัยมงคล',
];

/** ชื่อผู้หญิงใน FIRST + edge case (ใช้กำหนดเพศ/คำนำหน้าของข้อมูลจำลอง) */
const FEMALE = new Set(['สมหญิง', 'มาลี', 'สุดา', 'กาญจนา', 'พิมพ์ชนก', 'อรอุมา', 'ศิริพร', 'จันทร์เพ็ญ', 'รัตนา', 'นภัสสร', 'สุภาพร', 'ลำดวน', 'กมลชนก', 'จิราพร', 'บัวผัน', 'ปวีณา', 'สมศรี', 'ทองใบ']);

/**
 * ข้อมูลส่วนตัวสำหรับไฟล์แจ้งประกัน (เพศ คำนำหน้า เลขบัตร โทร อีเมล) — ข้อมูลสมมติทั้งหมด
 * ใช้ PRNG แยกต่อคน จึงไม่กระทบค่าสุ่มอื่นของ seed · ทุกคนที่ 23 เว้นว่างไว้ทดสอบคำเตือน "ข้อมูลไม่ครบ"
 */
function personalInfo(id, firstName) {
  const r = prng(90000 + id);
  const gender = FEMALE.has(firstName) ? 'F' : 'M';
  const title = gender === 'M' ? 'นาย' : r.next() < 0.5 ? 'นาง' : 'นางสาว';
  if (id % 23 === 0) return { title, gender, nationalId: null, phone: null, email: null };
  const first12 = `${r.pick(['1', '3'])}${Array.from({ length: 11 }, () => r.int(0, 9)).join('')}`;
  return {
    title,
    gender,
    nationalId: first12 + thaiIdCheckDigit(first12),
    phone: `0${r.pick(['6', '8', '9'])}${String(r.int(0, 99999999)).padStart(8, '0')}`,
    email: id % 3 === 0 ? `emp${id}@example.com` : null,
  };
}

export function buildSeed(today) {
  const rnd = prng(20261015);
  const rules = defaultRules();
  const ago = (days) => addDays(today, -days);
  const birthForAge = (age) => addDays(today, -Math.round(age * 365.25) - rnd.int(0, 300));
  const edge = [
    {
      companyCode: 'HL',
      employeeType: 'CENTRAL',
      deptGroup: 'Support Line',
      level: 3,
      startDays: 12,
      firstName: 'ปวีณา',
      lastName: 'เริ่มใหม่',
    },
    {
      companyCode: 'CIC',
      employeeType: 'CENTRAL',
      deptGroup: 'บริหารห้องเช่าและพื้นที่เช่า',
      level: 2,
      startDays: 20,
      keepUniformPending: true,
      firstName: 'ธีรวัฒน์',
      lastName: 'ห้องเช่า',
    },
    {
      companyCode: 'PRO',
      employeeType: 'PRO_SITE',
      siteId: 4,
      position: 'ช่างเทคนิค',
      startDays: 3,
      keepUniformPending: true,
      firstName: 'สุรชัย',
      lastName: 'ช่างใหม่',
    },
    {
      companyCode: 'PRO',
      employeeType: 'PRO_SITE',
      siteId: 5,
      position: 'ช่างทีมโมบาย',
      startDays: 6,
      keepUniformPending: true,
      firstName: 'อำนาจ',
      lastName: 'โมบาย',
    },
    {
      companyCode: 'PRO',
      employeeType: 'PRO_SITE',
      siteId: 4,
      position: 'ช่างเทคนิค',
      contractType: 'SHORT_3PCT',
      startDays: 90,
      firstName: 'บุญชู',
      lastName: 'สัญญาสั้น',
    },
    { companyCode: 'HL', employeeType: 'DAILY', siteId: 2, startDays: 110, firstName: 'สมปอง', lastName: 'รายวัน' },
    { companyCode: 'AS', employeeType: 'DAILY', siteId: 11, startDays: 118, firstName: 'ทองใบ', lastName: 'ก่อสร้าง' },
    {
      companyCode: 'CNS',
      employeeType: 'MAID_CNS',
      siteId: 8,
      startDays: 200,
      firstName: 'บัวผัน',
      lastName: 'รามอินทรา',
    },
    { companyCode: 'CNS', employeeType: 'MAID_CNS', siteId: 7, startDays: 115, firstName: 'สมศรี', lastName: 'สีลม' },
    {
      companyCode: 'AS',
      employeeType: 'CENTRAL',
      deptGroup: 'BU ส่วนกลาง',
      level: 8,
      startDays: 25,
      birthDate: birthForAge(66),
      firstName: 'ประยูร',
      lastName: 'อาวุโส',
    },
    {
      companyCode: 'HL',
      employeeType: 'CENTRAL',
      deptGroup: 'การตลาด',
      level: 4,
      startDays: 400,
      status: 'INACTIVE',
      endReason: 'RESIGN',
      endDate: ago(8),
      lastWorkingDate: ago(9),
      firstName: 'กมลชนก',
      lastName: 'ลาออก',
    },
    {
      companyCode: 'PRO',
      employeeType: 'PRO_SITE',
      siteId: 4,
      position: 'ช่างเทคนิค',
      startDays: 300,
      status: 'INACTIVE',
      endReason: 'ABSENT_3D',
      lastWorkingDate: ago(10),
      endDate: ago(6),
      firstName: 'สมบัติ',
      lastName: 'ขาดงาน',
    },
    {
      companyCode: 'CNS',
      employeeType: 'CENTRAL',
      deptGroup: 'BU ส่วนกลาง',
      level: 5,
      startDays: 700,
      status: 'INACTIVE',
      endReason: 'TERMINATED',
      endDate: ago(2),
      lastWorkingDate: ago(2),
      firstName: 'ชาตรี',
      lastName: 'เลิกจ้าง',
    },
    {
      companyCode: 'HL',
      employeeType: 'CENTRAL',
      deptGroup: 'Support Line',
      level: 2,
      startDays: 500,
      status: 'INACTIVE',
      endReason: 'MISCONDUCT',
      endDate: ago(1),
      lastWorkingDate: ago(1),
      firstName: 'วีระ',
      lastName: 'ทำผิด',
    },
    {
      companyCode: 'CIC',
      employeeType: 'CENTRAL',
      deptGroup: 'BU ส่วนกลาง',
      level: 7,
      startDays: 800,
      firstName: 'อรรถพล',
      lastName: 'ระดับเจ็ด',
    },
    // ครบ 30 วันแล้ว รอแจ้งเข้ารอบถัดไป
    {
      companyCode: 'PRO',
      employeeType: 'CENTRAL',
      deptGroup: 'ฝ่ายขาย',
      level: 3,
      startDays: 42,
      firstName: 'จิราพร',
      lastName: 'ฝ่ายขาย',
    },
    {
      companyCode: 'AS',
      employeeType: 'CENTRAL',
      deptGroup: 'วิศวกรรมและการออกแบบ',
      level: 4,
      startDays: 38,
      firstName: 'ภูมิพัฒน์',
      lastName: 'ออกแบบ',
    },
    {
      companyCode: 'AS',
      employeeType: 'CENTRAL',
      deptGroup: 'ฝ่ายขาย',
      level: 2,
      startDays: 160,
      skipProbation: true,
      firstName: 'ศักดิ์ชัย',
      lastName: 'ลืมบันทึก',
    },
  ];
  const random = [];
  for (let i = 0; i < RANDOM_EMPLOYEES; i++) {
    const roll = rnd.next();
    const startDays = rnd.int(150, 2600);
    const inactive = rnd.next() < 0.12;
    const end = inactive
      ? (() => {
          const endDays = rnd.int(40, Math.min(startDays - 30, 900));
          return { status: 'INACTIVE', endReason: 'RESIGN', endDate: ago(endDays), lastWorkingDate: ago(endDays + 1) };
        })()
      : {};
    if (roll < 0.45) {
      const companyCode = rnd.pick(['HL', 'HL', 'PRO', 'CNS', 'CIC', 'AS', 'AS']);
      const deptGroup = rnd.pick(DEPT_GROUPS[companyCode]);
      const level = companyCode === 'CIC' && deptGroup !== 'Support Line' ? rnd.int(1, 5) : rnd.int(1, 8);
      random.push({ companyCode, employeeType: 'CENTRAL', deptGroup, level, startDays, ...end });
    } else if (roll < 0.72) {
      random.push({
        companyCode: 'PRO',
        employeeType: 'PRO_SITE',
        siteId: rnd.pick([4, 4, 5]),
        position: rnd.pick(PRO_POSITIONS),
        contractType: rnd.next() < 0.1 ? 'SHORT_3PCT' : 'REGULAR',
        startDays,
        ...end,
      });
    } else if (roll < 0.87) {
      const companyCode = rnd.pick(['HL', 'AS', 'AS', 'CNS']);
      const siteId = companyCode === 'HL' ? 2 : companyCode === 'AS' ? 11 : 6;
      random.push({ companyCode, employeeType: 'DAILY', siteId, startDays, ...end });
    } else {
      random.push({ companyCode: 'CNS', employeeType: 'MAID_CNS', siteId: rnd.pick([7, 7, 8]), startDays, ...end });
    }
  }
  const salaryFor = (t, level) =>
    t === 'CENTRAL'
      ? 15000 + (level ?? 1) * 4500 + rnd.int(0, 20) * 250
      : t === 'PRO_SITE'
        ? 14000 + rnd.int(0, 40) * 250
        : t === 'DAILY'
          ? 10800 + rnd.int(0, 12) * 100
          : 11000 + rnd.int(0, 8) * 100;
  const prefix = { HL: 'HL', PRO: 'PR', CNS: 'CN', CIC: 'CI', AS: 'AS' };
  const counters = { HL: 0, PRO: 0, CNS: 0, CIC: 0, AS: 0 };
  const pendingUniform = new Set();
  const employees = [...edge, ...random].map((d, i) => {
    const id = i + 1;
    if (d.keepUniformPending) pendingUniform.add(id);
    counters[d.companyCode]++;
    const startDate = ago(d.startDays);
    const pass = addDays(startDate, 119);
    const status = d.status ?? 'ACTIVE';
    const level = d.employeeType === 'CENTRAL' ? (d.level ?? 1) : null;
    const firstName = d.firstName ?? rnd.pick(FIRST);
    return {
      id,
      empCode: `${prefix[d.companyCode]}${String(6000 + counters[d.companyCode] * 7).padStart(5, '0')}`,
      firstName,
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
      probationPassDate: !d.skipProbation && pass <= (d.endDate ?? today) ? pass : null,
      status,
      lastWorkingDate: d.lastWorkingDate ?? null,
      endDate: d.endDate ?? null,
      endReason: d.endReason ?? null,
      ...personalInfo(id, firstName),
    };
  });
  const siteById = new Map(SITES.map((s) => [s.id, s]));
  // ----- ประวัติแจ้งประกัน: ทุกรายการที่รอบ < รอบปัจจุบันถือว่าส่งแล้ว -----
  const grouped = new Map();
  // ส่งออก 1 ครั้งต่อรอบ (มีทั้งคนเข้าและคนออก) · แจ้งออกทันทีส่งแยกในวันที่พ้นสภาพ
  const add = (cycle, type, id) => grouped.set(cycle, [...(grouped.get(cycle) ?? []), { employeeId: id, type }]);
  for (const e of employees) {
    const st = insuranceStatus(e, siteById.get(e.siteId) ?? null, rules);
    if (!st.eligible || !st.enrollCycleDate) continue;
    const currentCycle = nextCycleDate(today, cycleDayOf(e, rules.settings)); // รายวัน = รอบวันที่ 6
    if (st.enrollCycleDate < currentCycle) add(st.enrollCycleDate, 'IN', e.id);
    if (!st.exitCycleDate || !st.exitDate) continue;
    if (st.exitUrgent) {
      if (st.exitDate < addDays(today, -7)) add(st.exitDate, 'URGENT', e.id);
    } else if (st.exitCycleDate < currentCycle) {
      add(st.exitCycleDate, 'OUT', e.id);
    }
  }
  const insurers = defaultInsurers();
  const batches = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cycleDate, items], i) => ({
      id: i + 1,
      cycleDate,
      insurerId: insurers[0].id,
      insurerName: insurers[0].shortName,
      items,
      submittedAt: `${addDays(cycleDate, -1)}T10:00:00`,
      submittedBy: SYSTEM_USER,
    }));
  // ----- ประวัติแจกชุด: ครบกำหนดเกิน 14 วัน → แจกแล้ว (เว้นบางส่วนให้ค้าง) -----
  const issues = [];
  const cutoff = addDays(today, -14);
  for (const e of employees) {
    if (pendingUniform.has(e.id)) continue;
    const st = uniformStatus(e, siteById.get(e.siteId) ?? null, rules, [], today);
    for (const ent of st.entitlements) {
      // เว้นบางรายการให้ค้าง เฉพาะที่ครบกำหนดใน 120 วันล่าสุด (ของเก่าถือว่าแจกครบแล้ว)
      if (ent.dueDate > cutoff || (ent.dueDate > addDays(today, -120) && rnd.next() < 0.3)) continue;
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
  // ----- บันทึกกิจกรรมย้อนหลัง (60 วัน) จากประวัติที่สร้างไว้ -----
  const empById = new Map(employees.map((e) => [e.id, e]));
  const since = addDays(today, -60);
  const raw = [
    ...batches
      .filter((b) => b.submittedAt.slice(0, 10) >= since)
      .map((b) => ({
        at: b.submittedAt,
        user: b.submittedBy,
        entity: 'INSURANCE_BATCH',
        entityId: String(b.id),
        action: 'CREATE',
        summary: `ส่งออกไฟล์แจ้ง${b.insurerName} รอบ ${b.cycleDate}: เข้า ${b.items.filter((x) => x.type === 'IN').length} · ออก ${b.items.filter((x) => x.type !== 'IN').length} ราย`,
        employeeId: b.items.length === 1 ? b.items[0].employeeId : null,
      })),
    ...issues
      .filter((i) => i.issuedAt >= since)
      .map((i) => {
        const e = empById.get(i.employeeId);
        return {
          at: `${i.issuedAt}T${String(9 + (i.id % 8)).padStart(2, '0')}:${String((i.id * 7) % 60).padStart(2, '0')}:00`,
          user: i.issuedBy,
          entity: 'UNIFORM_ISSUE',
          entityId: String(i.id),
          action: 'CREATE',
          summary:
            `แจกชุดฟอร์ม (${UNIFORM_EVENT_LABEL[i.event]}) ${i.qty} ตัว ไซซ์ ${i.size} ให้ ${e?.firstName ?? ''} ${e?.lastName ?? ''}`.trim(),
          employeeId: i.employeeId,
        };
      }),
  ];
  const activities = raw.sort((a, b) => a.at.localeCompare(b.at)).map((a, i) => ({ ...a, id: i + 1 }));
  return { companies: COMPANIES, sites: SITES, employees, batches, issues, rules, activities, insurers, marksV2: true };
}
