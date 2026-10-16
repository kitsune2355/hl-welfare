// กฎตั้งต้นจากไฟล์ "เงื่อนไขสวัสดิการ 15.10.69" (สเปกข้อ 7)
const HPCC = ['HL', 'PRO', 'CNS', 'CIC'];

const central = [
  [1, HPCC, ['Support Line'], 'HL', [1, 5], 0, 4, 2],
  [2, HPCC, ['Support Line'], 'HL', [6, null], 0, 2, 1],
  [3, HPCC, ['การตลาด'], 'HL', [null, null], 0, 2, 1],
  [4, ['PRO'], ['BU ส่วนกลาง'], 'PRO', [1, 5], 0, 4, 2],
  [5, ['PRO'], ['BU ส่วนกลาง'], 'PRO', [6, null], 0, 2, 1],
  [6, ['PRO'], ['ฝ่ายขาย'], 'PRO', [null, null], 0, 2, 1],
  [7, ['CNS'], ['BU ส่วนกลาง'], 'CNS', [1, 5], 0, 4, 2],
  [8, ['CNS'], ['BU ส่วนกลาง'], 'CNS', [6, null], 0, 2, 1],
  [9, ['CNS'], ['ฝ่ายขาย'], 'CNS', [null, null], 0, 2, 1],
  [10, ['AS'], ['BU ส่วนกลาง'], 'AS', [1, 5], 0, 4, 2],
  [11, ['AS'], ['BU ส่วนกลาง'], 'AS', [6, null], 0, 2, 1],
  [12, ['AS'], ['ฝ่ายขาย'], 'AS', [null, null], 0, 2, 1],
  [13, ['AS'], ['วิศวกรรมและการออกแบบ'], 'AS', [null, null], 0, 2, 1],
  [14, ['CIC'], ['BU ส่วนกลาง', 'บริหารห้องเช่าและพื้นที่เช่า'], 'HL', [1, 5], 3, 1, 2],
];

const centralRules = central.map(
  ([id, companies, deptGroups, logo, [levelMin, levelMax], qtyStart, qtyProbation, qtyAnnual]) => ({
    id,
    employeeType: 'CENTRAL',
    companies,
    deptGroups,
    position: null,
    levelMin,
    levelMax,
    style: `โปโลสีดำ โลโก้ ${logo}`,
    items: ['POLO_BLACK'],
    poloBySite: false,
    qtyStart,
    qtyProbation,
    qtyAnnual,
    note: '',
  }),
);

const proSite = (id, position, style, items, poloBySite, qtyStart, qtyStartLabel) => ({
  id,
  employeeType: 'PRO_SITE',
  companies: ['PRO'],
  deptGroups: null,
  position,
  levelMin: null,
  levelMax: null,
  style,
  items,
  poloBySite,
  qtyStart,
  qtyStartLabel,
  qtyProbation: 1,
  qtyAnnual: 2,
  note: '',
});

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
        companies: ['HL', 'AS'],
        waitDays: 120,
        excludeContracts: [],
        requireSiteInsurance: false,
        note: 'พนักงานรายวัน HL, AS',
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
    pvd: [
      { id: 1, employeeType: 'PRO_SITE', eligible: true, waitDays: 0, note: 'เป็นสมาชิกตั้งแต่วันแรก' },
      { id: 2, employeeType: 'CENTRAL', eligible: true, waitDays: 120, note: 'เป็นสมาชิกเมื่อครบ 120 วัน' },
      {
        id: 3,
        employeeType: 'MAID_CNS',
        eligible: false,
        waitDays: 0,
        note: 'แม่บ้าน CNS ไม่ได้รับกองทุนสำรองเลี้ยงชีพ',
      },
      {
        id: 4,
        employeeType: 'DAILY',
        eligible: false,
        waitDays: 0,
        note: 'พนักงานรายวันทุกบริษัท ไม่ได้รับกองทุนสำรองเลี้ยงชีพ',
      },
    ],
    uniform: [
      ...centralRules,
      proSite(15, 'ช่างเทคนิค', 'ชุดช่าง + รองเท้า Safety', ['TECH_SHIRT', 'TECH_PANTS', 'SAFETY_SHOES'], false, 2),
      proSite(
        16,
        'ช่างทีมโมบาย',
        'ชุดช่าง + โปโล + รองเท้า Safety',
        ['POLO_BLACK', 'TECH_SHIRT', 'TECH_PANTS', 'SAFETY_SHOES'],
        true,
        3,
        '2+1',
      ),
      proSite(17, 'หัวหน้าช่างเทคนิค, วิศวกร', 'โปโล + รองเท้า Safety', ['POLO_BLACK', 'SAFETY_SHOES'], true, 3),
      proSite(18, 'ตำแหน่งอื่นๆ', 'ชุดช่าง + โปโล', ['TECH_SHIRT', 'TECH_PANTS', 'POLO_NAVY'], true, 3),
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
      absentExtraDays: 7,
      pvdEmployeeRate: 2,
      pvdCompanyRate: 2,
      pvdVesting: [
        { minYears: 0, percent: 0 },
        { minYears: 3, percent: 50 },
        { minYears: 5, percent: 100 },
      ],
      pvdVestingIsPlaceholder: true,
      uniformAnnualMonth: 1,
    },
  };
}
