// กฎตั้งต้นจากไฟล์ "เงื่อนไขสวัสดิการ 15.10.69" (สเปกข้อ 7) + คำตอบของ HR (19 ต.ค. 69)
// แก้ต่อได้ที่หน้าเงื่อนไขสวัสดิการ (rules.html) — ไฟล์นี้คือค่าตั้งต้นของ seed/mock เท่านั้น
import { ruleQuantities, UNIFORM_EVENTS } from '../../domain/uniform.js';

const HPCC = ['HL', 'PRO', 'CNS', 'CIC'];
/** ระดับพนักงานสูงสุด (HR ยืนยัน) — "6 ขึ้นไป" = 6–9 */
export const LEVEL_MAX = 9;

// [id, บริษัท, กลุ่ม/ฝ่าย, โลโก้, [ระดับต่ำสุด, สูงสุด], เริ่มงาน, ผ่านโปร, ประจำปี] — จำนวนโปโลต่อรอบ
const central = [
  [1, HPCC, ['Support Line'], 'HL', [1, 5], 0, 4, 2],
  [2, HPCC, ['Support Line'], 'HL', [6, LEVEL_MAX], 0, 2, 1],
  [3, HPCC, ['การตลาด'], 'HL', [null, null], 0, 2, 1],
  [4, ['PRO'], ['BU ส่วนกลาง'], 'PRO', [1, 5], 0, 4, 2],
  [5, ['PRO'], ['BU ส่วนกลาง'], 'PRO', [6, LEVEL_MAX], 0, 2, 1],
  [6, ['PRO'], ['ฝ่ายขาย'], 'PRO', [null, null], 0, 2, 1],
  [7, ['CNS'], ['BU ส่วนกลาง'], 'CNS', [1, 5], 0, 4, 2],
  [8, ['CNS'], ['BU ส่วนกลาง'], 'CNS', [6, LEVEL_MAX], 0, 2, 1],
  [9, ['CNS'], ['ฝ่ายขาย'], 'CNS', [null, null], 0, 2, 1],
  [10, ['AS'], ['BU ส่วนกลาง'], 'AS', [1, 5], 0, 4, 2],
  [11, ['AS'], ['BU ส่วนกลาง'], 'AS', [6, LEVEL_MAX], 0, 2, 1],
  [12, ['AS'], ['ฝ่ายขาย'], 'AS', [null, null], 0, 2, 1],
  [13, ['AS'], ['วิศวกรรมและการออกแบบ'], 'AS', [null, null], 0, 2, 1],
  [14, ['CIC'], ['BU ส่วนกลาง', 'บริหารห้องเช่าและพื้นที่เช่า'], 'HL', [1, 5], 3, 1, 2],
  // CIC ระดับ 6 ขึ้นไป ได้ 1 ตัว (HR ยืนยัน) — ตั้งเป็นรอบผ่านโปร 1 + ประจำปี 1 ตามแบบระดับ 6+ ของบริษัทอื่น
  [19, ['CIC'], ['BU ส่วนกลาง', 'บริหารห้องเช่าและพื้นที่เช่า'], 'HL', [6, LEVEL_MAX], 0, 1, 1],
];

/** qtyStart/qtyProbation/qtyAnnual = จำนวนรวมของรอบ (ไว้แสดงย่อ) คำนวณจาก quantities เสมอ */
export function withTotals(rule) {
  const q = ruleQuantities(rule);
  const total = (ev) => Object.values(q[ev] ?? {}).reduce((s, n) => s + n, 0);
  return { ...rule, quantities: q, qtyStart: total('START'), qtyStartLabel: null, qtyProbation: total('PROBATION'), qtyAnnual: total('ANNUAL') };
}

/** จำนวนต่อรายการต่อรอบ — รายการเดียวกันทุกรอบ ใส่ 0 ได้ */
const qty = (items, perEvent) =>
  Object.fromEntries(UNIFORM_EVENTS.map((ev, i) => [ev, Object.fromEntries(items.map((c) => [c, perEvent[i][c] ?? 0]))]));

const centralRules = central.map(([id, companies, deptGroups, logo, [levelMin, levelMax], start, probation, annual]) =>
  withTotals({
    id,
    employeeType: 'CENTRAL',
    companies,
    deptGroups,
    position: null,
    levelMin,
    levelMax,
    style: `โปโลสีดำ โลโก้ ${logo}`,
    logo,
    items: ['POLO_BLACK'],
    poloBySite: false,
    quantities: qty(['POLO_BLACK'], [{ POLO_BLACK: start }, { POLO_BLACK: probation }, { POLO_BLACK: annual }]),
    note: '',
  }),
);

/**
 * Pro Site — จำนวนต่อรายการ: ช่างทีมโมบาย "2+1" = ชุดช่าง 2 + โปโล 1 (HR ยืนยัน ต่างกันได้ตามหน่วยงาน
 * — หน่วยงานตั้งทับได้ที่หน้าหน่วยงาน) · กฎอื่นแปลงจากจำนวนรวมเดิม: ทุกรายการได้ตามจำนวนของรอบ รองเท้า 1 คู่
 */
const proSite = (id, position, style, items, poloBySite, perEvent) =>
  withTotals({
    id,
    employeeType: 'PRO_SITE',
    companies: ['PRO'],
    deptGroups: null,
    position,
    levelMin: null,
    levelMax: null,
    style,
    logo: 'PRO',
    items,
    poloBySite,
    quantities: qty(items, perEvent),
    note: '',
  });

/** จำนวนเดิมแบบรวม (เริ่มงาน n ตัว / ผ่านโปร 1 / ประจำปี 2) → ต่อรายการ (รองเท้า 1 คู่) */
const legacy = (items, start) =>
  [start, 1, 2].map((n) => Object.fromEntries(items.map((c) => [c, c === 'SAFETY_SHOES' ? 1 : n])));

const TECH = ['TECH_SHIRT', 'TECH_PANTS', 'SAFETY_SHOES'];
const MOBILE = ['POLO_BLACK', 'TECH_SHIRT', 'TECH_PANTS', 'SAFETY_SHOES'];
const LEAD = ['POLO_BLACK', 'SAFETY_SHOES'];
const OTHER = ['TECH_SHIRT', 'TECH_PANTS', 'POLO_NAVY'];

export function defaultRules() {
  return {
    insurance: [
      {
        id: 1,
        employeeType: 'CENTRAL',
        companies: null,
        waitDays: 30,
        excludeContracts: [],
        requireSiteInsurance: false,
        note: 'พนักงานส่วนกลางทุกบริษัท',
      },
      {
        id: 2,
        employeeType: 'PRO_SITE',
        companies: ['PRO'],
        waitDays: 30,
        excludeContracts: ['SHORT_3PCT'],
        requireSiteInsurance: false,
        note: 'สัญญา 3% ระยะสั้น ไม่ได้รับประกันกลุ่ม',
      },
      {
        id: 3,
        employeeType: 'DAILY',
        companies: ['HL', 'AS', 'CNS', 'CIC', 'PRO'],
        waitDays: 120,
        excludeContracts: [],
        requireSiteInsurance: false,
        note: 'พนักงานรายวันทุกบริษัท (HR ยืนยัน CNS / CIC / PRO ได้ด้วย)',
      },
      {
        id: 4,
        employeeType: 'MAID_CNS',
        companies: ['CNS'],
        waitDays: 120,
        excludeContracts: [],
        requireSiteInsurance: true,
        note: 'เฉพาะหน่วยงานที่ระบุว่าได้รับประกันกลุ่ม',
      },
    ],
    // เรียงตาม id เหมือนที่ฐานข้อมูลคืน (กฎ 19 อยู่ท้าย)
    uniform: [
      ...centralRules.filter((u) => u.id < 15),
      proSite(15, 'ช่างเทคนิค', 'ชุดช่าง + รองเท้า Safety', TECH, false, legacy(TECH, 2)),
      proSite(16, 'ช่างทีมโมบาย', 'ชุดช่าง + โปโล + รองเท้า Safety', MOBILE, true, [
        { POLO_BLACK: 1, TECH_SHIRT: 2, TECH_PANTS: 2, SAFETY_SHOES: 1 },
        ...legacy(MOBILE, 0).slice(1),
      ]),
      proSite(17, 'หัวหน้าช่างเทคนิค, วิศวกร', 'โปโล + รองเท้า Safety', LEAD, true, legacy(LEAD, 3)),
      proSite(18, 'ตำแหน่งอื่นๆ', 'ชุดช่าง + โปโล', OTHER, true, legacy(OTHER, 3)),
      ...centralRules.filter((u) => u.id > 18),
    ],
    uniformItems: [
      { code: 'POLO_BLACK', name: 'โปโลสีดำ' },
      { code: 'POLO_NAVY', name: 'โปโลสีน้ำเงิน' },
      { code: 'TECH_SHIRT', name: 'เสื้อช่าง' },
      { code: 'TECH_PANTS', name: 'กางเกงช่าง' },
      { code: 'SAFETY_SHOES', name: 'รองเท้า Safety' },
    ],
    settings: {
      insuranceMaxAge: 65,
      insuranceCycleDay: 5,
      insuranceCycleDayDaily: 6, // พนักงานรายวันส่งแจ้งแยก ทุกวันที่ 6
      absentExtraDays: 7,
      uniformAnnualMonth: 1,
    },
  };
}
