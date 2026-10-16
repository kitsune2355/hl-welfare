# ระบบจัดการสวัสดิการพนักงาน — กลุ่มบริษัทแฮปปี้แลนด์

> เอกสารสเปกสำหรับพัฒนาบน localhost
> Stack: **React 19 + TypeScript (Vite, SPA)** · **PHP 8.2+** · **MySQL 8**
> แนวทาง: **เฟส 1 ทำ Frontend กับ mock ให้เสร็จก่อน → เฟส 2 ต่อ PHP + MySQL จริง**
> อ้างอิงเงื่อนไขจากไฟล์ "เงื่อนไขสวัสดิการ 15.10.69"

---

## สารบัญ
1. [ภาพรวม](#1-ภาพรวม)
2. [สิ่งที่ต้องติดตั้งบนเครื่อง](#2-สิ่งที่ต้องติดตั้งบนเครื่อง)
3. [โครงสร้างโปรเจกต์](#3-โครงสร้างโปรเจกต์)
4. [เฟส 1 — สร้าง Frontend (Vite + React 19 + TS)](#4-เฟส-1--สร้าง-frontend-vite--react-19--ts)
5. [Domain Model (TypeScript)](#5-domain-model-typescript)
6. [กฎสวัสดิการ (Business Rules)](#6-กฎสวัสดิการ-business-rules)
7. [API Contract](#7-api-contract)
8. [Mock API](#8-mock-api)
9. [หน้าจอ (Pages)](#9-หน้าจอ-pages)
10. [เฟส 2 — PHP Backend](#10-เฟส-2--php-backend)
11. [MySQL Schema](#11-mysql-schema)
12. [สลับจาก mock → MySQL จริง](#12-สลับจาก-mock--mysql-จริง)
13. [การทดสอบ](#13-การทดสอบ)
14. [Checklist](#14-checklist)
15. [ประเด็นที่ต้องยืนยันกับ HR](#15-ประเด็นที่ต้องยืนยันกับ-hr)

---

## 1. ภาพรวม

ระบบกลางให้ HR จัดการสวัสดิการของทุกบริษัทในเครือ:

| โมดูล | ทำอะไร |
|---|---|
| พนักงาน | ทะเบียนพนักงาน + หน้า "สิทธิสวัสดิการ" รายคน |
| ประกันกลุ่ม | คำนวณสิทธิ, สร้างรายการแจ้งเข้า/ออกทุกวันที่ 5, แจ้งออกทันทีกรณีเลิกจ้าง, ส่งออก CSV |
| กองทุนสำรองเลี้ยงชีพ (PVD) | สิทธิสมาชิก, ยอดหักสะสม/สมทบ 2%, % สิทธิเงินสมทบ (vesting) |
| ชุดฟอร์ม | สิทธิตามกลุ่ม/ระดับ/ตำแหน่ง, รายการค้างแจก, บันทึกการแจก + ไซซ์ |
| เงื่อนไขสวัสดิการ | แสดงกฎทั้งหมด (เฟส 2: แก้ไขได้) |
| หน่วยงาน | ตั้งค่าหน่วยงานว่าได้ประกันกลุ่มไหม (แม่บ้าน CNS) และสีโปโล (Pro Site) |

**บริษัทในเครือ:** HL (แฮปปี้แลนด์), PRO, CNS, CIC, AS

**หลักการออกแบบ**
- Frontend เรียกข้อมูลผ่าน interface `WelfareApi` ตัวเดียว → มี 2 implementation คือ `MockApi` และ `HttpApi` สลับด้วย `.env`
- ตรรกะคำนวณสิทธิเป็น **pure function** (`domain/eligibility.ts`) และฝั่ง PHP ต้องมีตัวคู่แฝดที่ให้ผลเหมือนกัน (`Domain/Eligibility.php`) โดยใช้ชุด test case เดียวกัน
- กฎเก็บเป็น **ข้อมูล** (rule table) ไม่ hard-code ในหน้าจอ
- วันที่ใช้รูปแบบ ISO `YYYY-MM-DD` ทุกที่ คำนวณแบบ UTC เพื่อไม่ให้วันเลื่อน แสดงผลเป็น พ.ศ.

---

## 2. สิ่งที่ต้องติดตั้งบนเครื่อง

| เครื่องมือ | เวอร์ชัน | หมายเหตุ |
|---|---|---|
| Node.js | 20.19+ หรือ 22 LTS | ใช้กับ Vite |
| PHP | 8.2+ | ต้องเปิด extension `pdo_mysql`, `mbstring` |
| Composer | 2.x | autoload PSR-4 |
| MySQL | 8.0+ (หรือ MariaDB 10.6+) | ใช้ผ่าน XAMPP / Laragon / Docker ก็ได้ |
| Git | – | |

> Windows แนะนำ **Laragon** หรือ **XAMPP** (มี PHP + MySQL ในตัว)
> macOS: `brew install php mysql composer node`

ตรวจสอบ:
```bash
node -v && npm -v && php -v && composer -V && mysql --version
```

---

## 3. โครงสร้างโปรเจกต์

```text
happyland-welfare/
├── README.md
├── docs/
│   └── SPEC.md                    ← ไฟล์นี้
│
├── frontend/                      ← Vite + React 19 + TypeScript (SPA)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts             ← proxy /api → http://localhost:8000
│   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│   ├── .env.example               ← VITE_API_MODE=mock | http
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                ← React Router (createBrowserRouter)
│       ├── index.css
│       ├── vite-env.d.ts
│       ├── types/
│       │   └── domain.ts          ← type ทั้งหมด (ตรงกับ JSON ของ PHP)
│       ├── domain/                ← ตรรกะล้วน ไม่มี I/O
│       │   ├── date.ts            ← addDays, ageAt, nextCycleDate, thaiDate
│       │   ├── eligibility.ts     ← คำนวณสิทธิประกัน / PVD / ชุดฟอร์ม
│       │   └── eligibility.test.ts
│       ├── api/
│       │   ├── types.ts           ← interface WelfareApi (สัญญา API)
│       │   ├── index.ts           ← เลือก Mock หรือ Http จาก .env
│       │   ├── mock/
│       │   │   ├── rules.ts       ← กฎตั้งต้นจากไฟล์ Excel
│       │   │   ├── seed.ts        ← ข้อมูลพนักงานจำลอง + edge cases
│       │   │   └── mockApi.ts     ← implement WelfareApi ในหน่วยความจำ + localStorage
│       │   └── http/
│       │       └── httpApi.ts     ← implement WelfareApi ด้วย fetch → PHP
│       ├── hooks/
│       │   └── useAsync.ts
│       ├── lib/
│       │   ├── labels.ts          ← ข้อความภาษาไทยของ enum
│       │   └── csv.ts             ← ส่งออก CSV (UTF-8 BOM ให้ Excel อ่านไทยได้)
│       ├── components/
│       │   ├── Layout.tsx         ← sidebar + เมนู + ป้าย mock/http
│       │   ├── ui.tsx             ← PageHeader, Card, Badge, Stat, Loading, ErrorBox, Empty
│       │   └── EmployeeForm.tsx
│       └── pages/
│           ├── DashboardPage.tsx
│           ├── EmployeesPage.tsx
│           ├── EmployeeDetailPage.tsx   ← /employees/:id และ /employees/new
│           ├── InsurancePage.tsx
│           ├── PvdPage.tsx
│           ├── UniformPage.tsx
│           ├── RulesPage.tsx
│           ├── SitesPage.tsx
│           └── NotFoundPage.tsx
│
├── backend/                       ← PHP 8.2+ (ไม่ใช้ framework, PSR-4)
│   ├── composer.json
│   ├── .env.example               ← DB_HOST, DB_NAME, DB_USER, DB_PASS
│   ├── public/
│   │   └── index.php              ← front controller (ทุก request เข้าที่นี่)
│   ├── src/
│   │   ├── Config.php             ← อ่าน .env
│   │   ├── Database.php           ← PDO singleton
│   │   ├── Http/
│   │   │   ├── Router.php         ← จับคู่ method + path (รองรับ {id})
│   │   │   ├── Request.php
│   │   │   └── Response.php       ← json(['data'=>..]) / error(['error'=>..])
│   │   ├── Domain/
│   │   │   ├── Dates.php          ← คู่แฝดของ date.ts
│   │   │   └── Eligibility.php    ← คู่แฝดของ eligibility.ts
│   │   ├── Repository/
│   │   │   ├── EmployeeRepository.php
│   │   │   ├── SiteRepository.php
│   │   │   ├── RuleRepository.php
│   │   │   ├── InsuranceBatchRepository.php
│   │   │   └── UniformIssueRepository.php
│   │   └── Controller/
│   │       ├── DashboardController.php
│   │       ├── CompanyController.php
│   │       ├── SiteController.php
│   │       ├── EmployeeController.php
│   │       ├── RuleController.php
│   │       ├── InsuranceController.php
│   │       ├── PvdController.php
│   │       └── UniformController.php
│   ├── database/
│   │   ├── schema.sql             ← CREATE TABLE ทั้งหมด
│   │   └── seed.sql               ← กฎตั้งต้น + บริษัท + หน่วยงาน
│   └── tests/
│       └── EligibilityTest.php    ← test case ชุดเดียวกับ eligibility.test.ts
│
└── .gitignore
```

---

## 4. เฟส 1 — สร้าง Frontend (Vite + React 19 + TS)

### 4.1 สร้างโปรเจกต์
```bash
mkdir happyland-welfare && cd happyland-welfare
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install react@^19 react-dom@^19 react-router-dom@^7
npm install -D @types/react@^19 @types/react-dom@^19 vitest
```

ตรวจว่า `package.json` ได้ React 19:
```json
"dependencies": {
  "react": "^19.x",
  "react-dom": "^19.x",
  "react-router-dom": "^7.x"
}
```

เพิ่ม script:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run"
}
```

### 4.2 `vite.config.ts`
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// dev: /api ถูก proxy ไปที่ PHP built-in server (เฟส 2)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
});
```

### 4.3 `.env` / `.env.example`
```ini
# mock = ใช้ข้อมูลจำลองในเบราว์เซอร์ / http = เรียก PHP backend
VITE_API_MODE=mock
VITE_API_BASE_URL=/api
```

`src/vite-env.d.ts`
```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'mock' | 'http';
  readonly VITE_API_BASE_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
```

### 4.4 Routing (`App.tsx`)
| Path | Page |
|---|---|
| `/` | DashboardPage |
| `/employees` | EmployeesPage (filter ผ่าน query string: `q`, `company`, `type`, `status`) |
| `/employees/new` | EmployeeDetailPage (โหมดเพิ่ม) |
| `/employees/:id` | EmployeeDetailPage |
| `/insurance` | InsurancePage (`?cycle=YYYY-MM-05`) |
| `/pvd` | PvdPage |
| `/uniform` | UniformPage |
| `/rules` | RulesPage |
| `/sites` | SitesPage |
| `*` | NotFoundPage |

### 4.5 รัน
```bash
npm run dev      # http://localhost:5173
npm test         # vitest
npm run build    # ตรวจ type + build
```

---

## 5. Domain Model (TypeScript)

`src/types/domain.ts` — **JSON จาก PHP ต้องใช้ชื่อ field แบบ camelCase ตรงกับนี้**

```ts
export type CompanyCode = 'HL' | 'PRO' | 'CNS' | 'CIC' | 'AS';
export type EmployeeType = 'CENTRAL' | 'PRO_SITE' | 'DAILY' | 'MAID_CNS';
export type ContractType = 'REGULAR' | 'SHORT_3PCT';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE';
export type EndReason = 'RESIGN' | 'ABSENT_3D' | 'TERMINATED' | 'MISCONDUCT';
export type ISODate = string; // YYYY-MM-DD

export interface Company { code: CompanyCode; name: string; }

export interface Site {
  id: number;
  companyCode: CompanyCode;
  name: string;
  hasGroupInsurance: boolean;      // แม่บ้าน CNS: หน่วยงานนี้ได้ประกันกลุ่มไหม
  poloColor: 'BLACK' | 'NAVY';     // Pro Site: สีโปโลของหน่วยงาน
}

export interface Employee {
  id: number;
  empCode: string;
  firstName: string;
  lastName: string;
  companyCode: CompanyCode;
  siteId: number;
  employeeType: EmployeeType;
  contractType: ContractType;
  deptGroup: string | null;        // กลุ่มพนักงาน/ฝ่าย (ส่วนกลาง)
  position: string | null;         // ตำแหน่ง (Pro Site)
  level: number | null;
  salary: number;
  birthDate: ISODate;
  startDate: ISODate;
  probationPassDate: ISODate | null;
  status: EmployeeStatus;
  lastWorkingDate: ISODate | null;
  endDate: ISODate | null;
  endReason: EndReason | null;
}

// ----- Rules -----
export interface InsuranceRule {
  id: number;
  employeeType: EmployeeType;
  companies: CompanyCode[] | null; // null = ทุกบริษัท
  waitDays: number;
  excludeContracts: ContractType[];
  requireSiteInsurance: boolean;
  note: string;
}

export interface PvdRule {
  id: number;
  employeeType: EmployeeType;
  eligible: boolean;
  waitDays: number;                // 0 = ตั้งแต่วันแรก
  note: string;
}

export interface VestingStep { minYears: number; percent: number; }

export type UniformItemCode = 'POLO_BLACK' | 'POLO_NAVY' | 'TECH_SHIRT' | 'TECH_PANTS' | 'SAFETY_SHOES';
export interface UniformItem { code: UniformItemCode; name: string; }

export interface UniformRule {
  id: number;
  employeeType: EmployeeType;
  companies: CompanyCode[];
  deptGroups: string[] | null;     // null = ไม่อ้างอิงฝ่าย
  position: string | null;         // null = ไม่อ้างอิงตำแหน่ง
  levelMin: number | null;
  levelMax: number | null;
  style: string;
  items: UniformItemCode[];
  poloBySite: boolean;             // สีโปโลขึ้นกับ site.poloColor
  qtyStart: number;
  qtyStartLabel?: string;          // เช่น "2+1"
  qtyProbation: number;
  qtyAnnual: number;
  note: string;
}

export interface Settings {
  insuranceMaxAge: number;         // 65
  insuranceCycleDay: number;       // 5
  absentExtraDays: number;         // 7
  pvdEmployeeRate: number;         // 2 (%)
  pvdCompanyRate: number;          // 2 (%)
  pvdVesting: VestingStep[];
  pvdVestingIsPlaceholder: boolean;
  uniformAnnualMonth: number;      // เดือนที่แจกประจำปี (1 = ม.ค.)
}

export interface RuleSet {
  insurance: InsuranceRule[];
  pvd: PvdRule[];
  uniform: UniformRule[];
  uniformItems: UniformItem[];
  settings: Settings;
}

// ----- Computed -----
export interface InsuranceStatus {
  eligible: boolean;
  reasons: string[];               // เหตุผลที่ไม่มีสิทธิ (ภาษาไทย)
  eligibleDate: ISODate | null;    // วันที่ครบอายุงาน
  enrollCycleDate: ISODate | null; // รอบวันที่ 5 ที่จะแจ้งเข้า
  exitDate: ISODate | null;        // วันที่มีผลออก
  exitCycleDate: ISODate | null;
  exitUrgent: boolean;             // เลิกจ้าง/ทำผิด = แจ้งทันที
  ruleId: number | null;
}

export interface PvdStatus {
  eligible: boolean;
  reasons: string[];
  joinDate: ISODate | null;
  employeeMonthly: number;
  companyMonthly: number;
  memberYears: number | null;
  vestingPercent: number | null;
}

export type UniformEvent = 'START' | 'PROBATION' | 'ANNUAL';

export interface UniformEntitlement {
  key: string;                     // START | PROBATION | ANNUAL-2026
  event: UniformEvent;
  dueDate: ISODate;
  qty: number;
  qtyLabel: string;
  items: UniformItemCode[];
  style: string;
  issued: boolean;
  issueId: number | null;
}

export interface UniformStatus {
  ruleId: number | null;
  style: string | null;
  reasons: string[];
  entitlements: UniformEntitlement[];
}

export interface EmployeeBenefits {
  employee: Employee;
  site: Site | null;
  insurance: InsuranceStatus;
  pvd: PvdStatus;
  uniform: UniformStatus;
}

export type BatchType = 'IN' | 'OUT' | 'URGENT';

export interface InsuranceCycleRow {
  employee: Employee;
  type: BatchType;
  effectiveDate: ISODate;
  reason: string;
  submitted: boolean;
}
export interface InsuranceCycle { cycleDate: ISODate; rows: InsuranceCycleRow[]; }

export interface InsuranceBatch {
  id: number;
  cycleDate: ISODate;
  type: BatchType;
  employeeIds: number[];
  submittedAt: string;
  submittedBy: string;
}

export interface UniformIssue {
  id: number;
  employeeId: number;
  entitlementKey: string;
  event: UniformEvent;
  qty: number;
  size: string;
  issuedAt: ISODate;
  issuedBy: string;
}

export interface UniformPendingRow {
  employee: Employee;
  entitlementKey: string;
  event: UniformEvent;
  dueDate: ISODate;
  qtyLabel: string;
  style: string;
}

export interface PvdRow { employee: Employee; pvd: PvdStatus; }

export interface DashboardData {
  today: ISODate;
  activeByCompany: { companyCode: CompanyCode; count: number }[];
  activeTotal: number;
  nextCycleDate: ISODate;
  nextCycleIn: number;
  nextCycleOut: number;
  urgentPending: number;
  upcomingEligible: { employee: Employee; benefit: 'INSURANCE' | 'PVD'; date: ISODate }[];
  uniformPending: number;
}

export interface EmployeeFilter {
  q?: string;
  companyCode?: CompanyCode | '';
  employeeType?: EmployeeType | '';
  status?: EmployeeStatus | '';
}
```

---

## 6. กฎสวัสดิการ (Business Rules)

### 6.1 ประกันกลุ่ม

| # | ประเภทพนักงาน | บริษัท | รอ (วัน) | เงื่อนไขเพิ่ม |
|---|---|---|---|---|
| 1 | CENTRAL ส่วนกลาง | ทุกบริษัท | 30 | – |
| 2 | PRO_SITE | PRO | 30 | ❌ สัญญา `SHORT_3PCT` ไม่ได้รับ |
| 3 | DAILY รายวัน | HL, AS | 120 | – |
| 4 | MAID_CNS แม่บ้าน | CNS | 120 | ✅ เฉพาะ `site.hasGroupInsurance = true` |

**อัลกอริทึม `insuranceStatus(emp, site, rules)`**
```text
1. หา rule ที่ employeeType ตรง และ (companies = null หรือ มี companyCode)
   ไม่พบ → ไม่มีสิทธิ "ประเภทพนักงาน/บริษัทนี้ไม่อยู่ในเงื่อนไขประกันกลุ่ม"
2. contractType อยู่ใน excludeContracts → ไม่มีสิทธิ "สัญญา 3% ระยะสั้น ไม่ได้รับประกันกลุ่ม"
3. requireSiteInsurance และ site.hasGroupInsurance = false → ไม่มีสิทธิ
4. eligibleDate    = startDate + waitDays
   enrollCycleDate = วันที่ 5 แรกที่ >= eligibleDate
5. ถ้าพ้นสภาพ และ exitDate < enrollCycleDate → ไม่ต้องแจ้งเข้า/ออก
6. อายุ ณ enrollCycleDate > 65 → ไม่มีสิทธิ
7. มีสิทธิ + คำนวณการแจ้งออก (ถ้ามี endReason)
```

**การแจ้งออก `insuranceExit(emp)`**

| endReason | exitDate | exitCycleDate | urgent |
|---|---|---|---|
| RESIGN ลาออก | endDate | วันที่ 5 แรกที่ >= exitDate | ❌ |
| ABSENT_3D ขาดงาน 3 วันติด | lastWorkingDate **+ 7 วัน** | วันที่ 5 แรกที่ >= exitDate | ❌ |
| TERMINATED เลิกจ้าง | endDate | = exitDate | ✅ แจ้งทันที |
| MISCONDUCT กระทำผิด | endDate | = exitDate | ✅ แจ้งทันที |

**รายการรอบ `insuranceCycle(cycleDate, employees, sites, rules, batches)`**
- `IN`: พนักงานที่มีสิทธิ และ `enrollCycleDate <= cycleDate` ที่ยังไม่ถูกส่ง (ตกค้างจากรอบก่อนก็แสดง) + ที่ส่งแล้วในรอบนี้
- `OUT`: `exitCycleDate <= cycleDate` ที่ยังไม่ส่ง + ที่ส่งแล้วในรอบนี้
- `URGENT`: แจ้งออกทันทีที่ยังไม่ส่ง แสดงทุกรอบจนกว่าจะส่ง
- พนักงานถูกแจ้งเข้าได้ครั้งเดียว และแจ้งออกได้ครั้งเดียว (ส่งซ้ำ → error)

### 6.2 กองทุนสำรองเลี้ยงชีพ

| ประเภท | สิทธิ | รอ (วัน) |
|---|---|---|
| PRO_SITE | ✅ | 0 (วันแรก) |
| CENTRAL | ✅ | 120 |
| MAID_CNS | ❌ | – |
| DAILY | ❌ | – |

```text
joinDate        = startDate + waitDays
พ้นสภาพก่อน joinDate → ไม่มีสิทธิ
employeeMonthly = salary × 2%
companyMonthly  = salary × 2%
asOf            = min(endDate, today)
memberYears     = (asOf − joinDate) / 365.25 (ปัดลง 1 ตำแหน่ง)
vestingPercent  = ขั้นสูงสุดของ pvdVesting ที่ memberYears >= minYears
                  ยกเว้น endReason = MISCONDUCT หรือ ABSENT_3D → 0%
```
> ⚠️ ตาราง vesting ยังเป็นค่าตัวอย่าง `[0→0%, 3→50%, 5→100%]` รอ HR ยืนยัน

### 6.3 ชุดฟอร์ม

**ส่วนกลาง (CENTRAL)** — items = `['POLO_BLACK']`

| id | บริษัท | กลุ่ม | โลโก้ | ระดับ | เริ่มงาน | ผ่านทดลอง | ประจำปี |
|---|---|---|---|---|---|---|---|
| 1 | HL, PRO, CNS, CIC | Support Line | HL | 1–5 | 0 | 4 | 2 |
| 2 | HL, PRO, CNS, CIC | Support Line | HL | 6+ | 0 | 2 | 1 |
| 3 | HL, PRO, CNS, CIC | การตลาด | HL | ทุกระดับ | 0 | 2 | 1 |
| 4 | PRO | BU ส่วนกลาง | PRO | 1–5 | 0 | 4 | 2 |
| 5 | PRO | BU ส่วนกลาง | PRO | 6+ | 0 | 2 | 1 |
| 6 | PRO | ฝ่ายขาย | PRO | ทุกระดับ | 0 | 2 | 1 |
| 7 | CNS | BU ส่วนกลาง | CNS | 1–5 | 0 | 4 | 2 |
| 8 | CNS | BU ส่วนกลาง | CNS | 6+ | 0 | 2 | 1 |
| 9 | CNS | ฝ่ายขาย | CNS | ทุกระดับ | 0 | 2 | 1 |
| 10 | AS | BU ส่วนกลาง | AS | 1–5 | 0 | 4 | 2 |
| 11 | AS | BU ส่วนกลาง | AS | 6+ | 0 | 2 | 1 |
| 12 | AS | ฝ่ายขาย | AS | ทุกระดับ | 0 | 2 | 1 |
| 13 | AS | วิศวกรรมและการออกแบบ | AS | ทุกระดับ | 0 | 2 | 1 |
| 14 | CIC | BU ส่วนกลาง, บริหารห้องเช่าและพื้นที่เช่า | HL | 1–5 | 3 | 1 | 2 |

**Pro Site (PRO_SITE)** — แจกตามตำแหน่ง ไม่อ้างอิงระดับ

| id | ตำแหน่ง | items | poloBySite | เริ่มงาน | ผ่านทดลอง | ประจำปี |
|---|---|---|---|---|---|---|
| 15 | ช่างเทคนิค | TECH_SHIRT, TECH_PANTS, SAFETY_SHOES | ❌ | 2 | 1 | 2 |
| 16 | ช่างทีมโมบาย | POLO, TECH_SHIRT, TECH_PANTS, SAFETY_SHOES | ✅ | 3 (`"2+1"`) | 1 | 2 |
| 17 | หัวหน้าช่างเทคนิค, วิศวกร | POLO, SAFETY_SHOES | ✅ | 3 | 1 | 2 |
| 18 | ตำแหน่งอื่นๆ | TECH_SHIRT, TECH_PANTS, POLO_NAVY | ✅ | 3 | 1 | 2 |

**อัลกอริทึม**
```text
matchUniformRule(emp):
  candidates = rule ที่ employeeType ตรง, companies มี companyCode,
               deptGroups = null หรือมี emp.deptGroup,
               level อยู่ในช่วง levelMin..levelMax (null = ไม่จำกัด)
  เลือกตามลำดับ: position ตรงตัว → position = null → position = "ตำแหน่งอื่นๆ"

resolveItems(rule, site):
  ถ้า poloBySite → แทน POLO_* ด้วยสีตาม site.poloColor

entitlements (limit = min(endDate, today)):
  START      : ถ้า qtyStart > 0           dueDate = startDate
  PROBATION  : ถ้ามี probationPassDate <= limit และ qtyProbation > 0
  ANNUAL-YYYY: ทุกปีที่ 1/{uniformAnnualMonth}/YYYY > probationPassDate และ <= limit
               (ย้อนหลังไม่เกิน 3 ปี)
  issued     = มี UniformIssue ที่ (employeeId, entitlementKey) ตรงกัน
```

---

## 7. API Contract

`src/api/types.ts` — **ทั้ง MockApi และ HttpApi ต้อง implement ครบ**

```ts
export interface WelfareApi {
  getDashboard(): Promise<DashboardData>;

  listCompanies(): Promise<Company[]>;
  listSites(): Promise<Site[]>;
  updateSite(id: number, patch: Partial<Pick<Site, 'hasGroupInsurance' | 'poloColor' | 'name'>>): Promise<Site>;

  listEmployees(filter?: EmployeeFilter): Promise<Employee[]>;
  getEmployeeBenefits(id: number): Promise<EmployeeBenefits>;
  saveEmployee(emp: Omit<Employee, 'id'> & { id?: number }): Promise<Employee>;

  getRules(): Promise<RuleSet>;

  getInsuranceCycle(cycleDate: ISODate): Promise<InsuranceCycle>;
  listInsuranceBatches(): Promise<InsuranceBatch[]>;
  submitInsuranceBatch(input: { cycleDate: ISODate; type: BatchType; employeeIds: number[] }): Promise<InsuranceBatch>;

  listPvdMembers(): Promise<PvdRow[]>;

  listUniformIssues(employeeId?: number): Promise<UniformIssue[]>;
  createUniformIssue(input: Omit<UniformIssue, 'id' | 'issuedBy'>): Promise<UniformIssue>;
  listUniformPending(): Promise<UniformPendingRow[]>;
}
```

### REST Endpoints (PHP)

รูปแบบ response: สำเร็จ `{ "data": ... }` · ผิดพลาด `{ "error": "ข้อความ" }` + HTTP 4xx/5xx

| Method | Path | Body / Query | คืนค่า |
|---|---|---|---|
| GET | `/api/dashboard` | – | `DashboardData` |
| GET | `/api/companies` | – | `Company[]` |
| GET | `/api/sites` | – | `Site[]` |
| PATCH | `/api/sites/{id}` | `{hasGroupInsurance?, poloColor?, name?}` | `Site` |
| GET | `/api/employees` | `?q=&company=&type=&status=` | `Employee[]` |
| POST | `/api/employees` | `Employee` (ไม่มี id) | `Employee` (201) |
| PUT | `/api/employees/{id}` | `Employee` | `Employee` |
| GET | `/api/employees/{id}/benefits` | – | `EmployeeBenefits` |
| GET | `/api/rules` | – | `RuleSet` |
| GET | `/api/insurance/cycles/{YYYY-MM-DD}` | – | `InsuranceCycle` |
| GET | `/api/insurance/batches` | – | `InsuranceBatch[]` (ใหม่ก่อน) |
| POST | `/api/insurance/batches` | `{cycleDate, type, employeeIds}` | `InsuranceBatch` (201) |
| GET | `/api/pvd/members` | – | `PvdRow[]` |
| GET | `/api/uniform/issues` | `?employeeId=` | `UniformIssue[]` |
| POST | `/api/uniform/issues` | `{employeeId, entitlementKey, event, qty, size, issuedAt}` | `UniformIssue` (201) |
| GET | `/api/uniform/pending` | – | `UniformPendingRow[]` |

**Validation ที่ต้องมีทั้ง mock และ PHP**
- `empCode` ห้ามซ้ำ → 409 `"รหัสพนักงานซ้ำ"`
- ส่งแจ้งประกันซ้ำ (IN ซ้ำ หรือ OUT/URGENT ซ้ำ) → 409 `"มีพนักงานที่ถูกแจ้งไปแล้ว N ราย"`
- `employeeIds` ว่าง → 422 `"ไม่มีรายการที่เลือก"`
- แจกชุดฟอร์มซ้ำ key เดิม → 409 `"รายการนี้แจกไปแล้ว"`
- ไม่พบข้อมูล → 404

### `api/index.ts`
```ts
export const API_MODE = (import.meta.env.VITE_API_MODE ?? 'mock') as 'mock' | 'http';
export const api: WelfareApi =
  API_MODE === 'http' ? new HttpApi(import.meta.env.VITE_API_BASE_URL ?? '/api') : new MockApi();
```

### `api/http/httpApi.ts` (แกนหลัก)
```ts
private async req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${this.baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || 'error' in body) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.data as T;
}
```

---

## 8. Mock API

- `MockApi implements WelfareApi` เก็บข้อมูลใน memory + `localStorage` (key `hl-welfare-mock-v1`) ห่อ try/catch ทุกครั้ง
- ใส่ latency จำลอง ~150ms และคืนค่าด้วย `structuredClone` (กันหน้าจอแก้ object ใน db ตรงๆ)
- ใช้ `domain/eligibility.ts` คำนวณสิทธิ → พฤติกรรมเหมือน PHP
- มีปุ่ม "รีเซ็ตข้อมูล" ใน sidebar (เฉพาะโหมด mock)
- seed ต้องสร้างจาก `today` (วันที่สัมพัทธ์) เพื่อให้ edge case อยู่ในสถานะที่ต้องการเสมอ และใช้ PRNG แบบ deterministic

**หน่วยงานตั้งต้น (sites)**
| id | บริษัท | ชื่อ | ประกัน | สีโปโล |
|---|---|---|---|---|
| 1 | HL | สำนักงานใหญ่ HL | ✅ | ดำ |
| 2 | HL | คลังสินค้า HL | ✅ | ดำ |
| 3 | PRO | สำนักงาน PRO | ✅ | ดำ |
| 4 | PRO | Pro Site — โครงการพระราม 9 | ✅ | ดำ |
| 5 | PRO | Pro Site — โครงการบางนา | ✅ | น้ำเงิน |
| 6 | CNS | สำนักงาน CNS | ✅ | ดำ |
| 7 | CNS | หน่วยงาน อาคารสีลม | ✅ | ดำ |
| 8 | CNS | หน่วยงาน โรงพยาบาลรามอินทรา | ❌ | ดำ |
| 9 | CIC | สำนักงาน CIC | ✅ | ดำ |
| 10 | AS | สำนักงาน AS | ✅ | ดำ |
| 11 | AS | ไซต์ก่อสร้าง AS | ✅ | ดำ |

**Edge cases ที่ seed ต้องมี** (+ พนักงานสุ่มอีก ~40 คน)
| กรณี | ผลที่คาด |
|---|---|
| ส่วนกลาง HL เริ่มงาน 12 วันก่อน | ยังไม่ครบ 30 วัน → อยู่ใน "จะครบสิทธิใน 30 วัน" |
| CIC บริหารห้องเช่า ระดับ 2 เริ่ม 20 วันก่อน | ได้ชุดฟอร์มวันเริ่มงาน 3 ตัว |
| Pro Site ช่างเทคนิค เริ่ม 3 วันก่อน | PVD ตั้งแต่วันแรก, ชุดวันเริ่มงาน 2 |
| Pro Site ช่างทีมโมบาย (site บางนา) | โปโลสีน้ำเงิน, จำนวน "2+1" |
| Pro Site สัญญา 3% | ไม่มีประกันกลุ่ม |
| รายวัน HL 110 วัน / AS 118 วัน | ใกล้ครบ 120 วัน |
| แม่บ้าน CNS site 8 | ไม่มีประกัน (หน่วยงานไม่ได้รับ) |
| แม่บ้าน CNS site 7 115 วัน | ใกล้ครบ 120 วัน |
| ส่วนกลาง AS อายุ 66 | ไม่มีประกัน (เกิน 65) |
| ลาออก 8 วันก่อน | แจ้งออกรอบถัดไป |
| ขาดงาน 3 วันติด | วันออก = วันทำงานสุดท้าย + 7 |
| เลิกจ้าง 2 วันก่อน / ทำผิด 1 วันก่อน | แจ้งออกทันที (URGENT ค้างส่ง) |
| CIC ระดับ 7 | ไม่พบกฎชุดฟอร์ม (รอ HR) |

- batch ประกันในอดีต: สร้างเป็น "ส่งแล้ว" ให้ทุกคนที่รอบแจ้งเข้า/ออก < รอบปัจจุบัน
- ชุดฟอร์มที่ครบกำหนดเกิน 14 วัน: สร้างเป็น "แจกแล้ว"

---

## 9. หน้าจอ (Pages)

| หน้า | องค์ประกอบ |
|---|---|
| **ภาพรวม** | Stat: พนักงานปัจจุบัน, รอบแจ้งประกันถัดไป (เข้า/ออก), แจ้งออกทันทีค้าง, ชุดฟอร์มค้างแจก · ตารางพนักงานแยกบริษัท (bar) · รายการ "จะครบสิทธิใน 30 วัน" |
| **พนักงาน** | ค้นหา รหัส/ชื่อ, filter บริษัท/ประเภท/สถานะ (เก็บใน URL) · ปุ่ม "เพิ่มพนักงาน" · ตาราง → คลิกไปหน้ารายละเอียด |
| **รายละเอียดพนักงาน** | ข้อมูลพนักงาน · การ์ดประกันกลุ่ม (วันครบสิทธิ, รอบแจ้งเข้า, วันออก/แจ้งทันที หรือเหตุผลที่ไม่มีสิทธิ) · การ์ด PVD (วันเป็นสมาชิก, ยอดหัก/สมทบ, อายุสมาชิก, % vesting) · ตารางชุดฟอร์มแต่ละรอบ + เลือกไซซ์ + "บันทึกแจก" · ปุ่มแก้ไข/บันทึกพ้นสภาพ |
| **ฟอร์มพนักงาน** | ข้อมูลส่วนตัว, บริษัท→หน่วยงาน (กรองตามบริษัท), ประเภท (ส่วนกลางแสดงฝ่าย+ระดับ / Pro Site แสดงตำแหน่ง), สัญญา, วันเริ่มงาน, ผ่านทดลองงาน, เหตุผลพ้นสภาพ + วันทำงานสุดท้าย + วันพ้นสภาพ |
| **ประกันกลุ่ม** | เลือกรอบ (วันที่ 5, ย้อนหลัง 6 / ล่วงหน้า 3 เดือน) · 3 ส่วน: แจ้งออกทันที / แจ้งเข้า / แจ้งออก · checkbox เลือก → "ยืนยันส่งแจ้ง" · ส่งออก CSV · ประวัติ batch |
| **PVD** | Stat: สมาชิก, ยอดสะสม+สมทบรวม/เดือน · ตารางสมาชิก (วันเป็นสมาชิก, เงินเดือน, หัก, สมทบ, อายุสมาชิก, vesting) · แจ้งเตือนถ้า vesting เป็นค่าตัวอย่าง · ส่งออก CSV |
| **ชุดฟอร์ม** | แท็บ "ค้างแจก" (บันทึกแจกได้เลย) / "ประวัติการแจก" · สรุปจำนวนตามแบบเสื้อ (ใช้วางแผนสั่งผลิต) |
| **เงื่อนไขสวัสดิการ** | ตารางกฎประกัน, PVD, ชุดฟอร์ม, ค่าตั้งค่า (read-only ในเฟส 1) + รายการประเด็นที่รอยืนยัน |
| **หน่วยงาน** | ตารางหน่วยงาน toggle "ได้รับประกันกลุ่ม", เลือกสีโปโล → บันทึกทันที |

**UI**
- ภาษาไทยทั้งหมด, วันที่แบบ `5 พ.ย. 69`, เงิน `1,234.00`
- Layout: sidebar ซ้าย (โลโก้ HL, เมนู, ป้ายโหมด mock/API) + เนื้อหาขวา, รองรับจอมือถือ
- รองรับ light/dark mode
- ฟอนต์แนะนำ: `IBM Plex Sans Thai` หรือ `Sarabun` (Google Fonts)
- Badge สี: เขียว=มีสิทธิ/ส่งแล้ว, เหลือง=รอส่ง/แจ้งออก, แดง=ไม่มีสิทธิ/แจ้งทันที

---

## 10. เฟส 2 — PHP Backend

### 10.1 สร้างโครง
```bash
cd happyland-welfare
mkdir -p backend/{public,src/{Http,Domain,Repository,Controller},database,tests}
cd backend
composer init --name=happyland/welfare --type=project -n
composer require vlucas/phpdotenv
composer require --dev phpunit/phpunit
```

`composer.json`
```json
{
  "name": "happyland/welfare",
  "type": "project",
  "require": {
    "php": ">=8.2",
    "ext-pdo": "*",
    "vlucas/phpdotenv": "^5.6"
  },
  "require-dev": { "phpunit/phpunit": "^11" },
  "autoload": { "psr-4": { "App\\": "src/" } },
  "autoload-dev": { "psr-4": { "Tests\\": "tests/" } },
  "scripts": {
    "serve": "php -S localhost:8000 -t public",
    "test": "phpunit tests"
  }
}
```
```bash
composer dump-autoload
```

`backend/.env.example`
```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=happyland_welfare
DB_USER=root
DB_PASS=
APP_TZ=Asia/Bangkok
CORS_ORIGIN=http://localhost:5173
```

### 10.2 `public/index.php` (front controller)
```php
<?php
declare(strict_types=1);

use App\Http\{Router, Request, Response};
use App\Controller\{DashboardController, CompanyController, SiteController, EmployeeController,
    RuleController, InsuranceController, PvdController, UniformController};

require __DIR__ . '/../vendor/autoload.php';
Dotenv\Dotenv::createImmutable(dirname(__DIR__))->safeLoad();
date_default_timezone_set($_ENV['APP_TZ'] ?? 'Asia/Bangkok');

// CORS (กรณีไม่ได้ใช้ Vite proxy)
header('Access-Control-Allow-Origin: ' . ($_ENV['CORS_ORIGIN'] ?? 'http://localhost:5173'));
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$r = new Router();
$r->get('/api/dashboard',                     [DashboardController::class, 'show']);
$r->get('/api/companies',                     [CompanyController::class, 'index']);
$r->get('/api/sites',                         [SiteController::class, 'index']);
$r->patch('/api/sites/{id}',                  [SiteController::class, 'update']);
$r->get('/api/employees',                     [EmployeeController::class, 'index']);
$r->post('/api/employees',                    [EmployeeController::class, 'store']);
$r->put('/api/employees/{id}',                [EmployeeController::class, 'update']);
$r->get('/api/employees/{id}/benefits',       [EmployeeController::class, 'benefits']);
$r->get('/api/rules',                         [RuleController::class, 'index']);
$r->get('/api/insurance/cycles/{date}',       [InsuranceController::class, 'cycle']);
$r->get('/api/insurance/batches',             [InsuranceController::class, 'batches']);
$r->post('/api/insurance/batches',            [InsuranceController::class, 'submit']);
$r->get('/api/pvd/members',                   [PvdController::class, 'index']);
$r->get('/api/uniform/issues',                [UniformController::class, 'issues']);
$r->post('/api/uniform/issues',               [UniformController::class, 'issue']);
$r->get('/api/uniform/pending',               [UniformController::class, 'pending']);

try {
    $r->dispatch(Request::fromGlobals());
} catch (\App\Http\HttpError $e) {
    Response::error($e->getMessage(), $e->status);
} catch (\Throwable $e) {
    error_log((string) $e);
    Response::error('เกิดข้อผิดพลาดภายในระบบ', 500);
}
```

### 10.3 `Http/Response.php`
```php
<?php
namespace App\Http;

final class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['data' => $data], JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        exit;
    }

    public static function error(string $message, int $status = 400): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
```

`Http/HttpError.php`
```php
<?php
namespace App\Http;
final class HttpError extends \RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400) { parent::__construct($message); }
}
```

### 10.4 `Database.php`
```php
<?php
namespace App;

use PDO;

final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        return self::$pdo ??= new PDO(
            sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                $_ENV['DB_HOST'], $_ENV['DB_PORT'] ?? 3306, $_ENV['DB_NAME']),
            $_ENV['DB_USER'], $_ENV['DB_PASS'] ?? '',
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ],
        );
    }
}
```

### 10.5 ข้อกำหนด Backend
- **Prepared statements ทุก query** (ห้ามต่อ string SQL)
- Repository แปลงแถว DB (`snake_case`) → array `camelCase` ตาม TypeScript type, `boolean` ต้องเป็น `true/false` ไม่ใช่ `0/1`, field JSON (`companies`, `items`, `deptGroups`) ต้อง `json_decode`
- `Domain/Eligibility.php` แปลงจาก `eligibility.ts` แบบบรรทัดต่อบรรทัด ใช้ `DateTimeImmutable` + timezone UTC สำหรับคำนวณวัน
- `submitInsuranceBatch` และ `createUniformIssue` ทำใน **transaction** และพึ่ง unique key กันซ้ำ
- เขียน `audit_log` ทุกครั้งที่ create/update พนักงาน, ส่ง batch, แจกชุด
- เฟสถัดไป: login + role (HR Admin / HR บริษัท / Payroll / ผู้ดูแลสต็อก / ผู้บริหาร)

---

## 11. MySQL Schema

`backend/database/schema.sql`
```sql
CREATE DATABASE IF NOT EXISTS happyland_welfare
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE happyland_welfare;

CREATE TABLE companies (
  code        VARCHAR(10)  PRIMARY KEY,
  name        VARCHAR(150) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE sites (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_code         VARCHAR(10)  NOT NULL,
  name                 VARCHAR(200) NOT NULL,
  has_group_insurance  TINYINT(1)   NOT NULL DEFAULT 1,
  polo_color           ENUM('BLACK','NAVY') NOT NULL DEFAULT 'BLACK',
  FOREIGN KEY (company_code) REFERENCES companies(code)
) ENGINE=InnoDB;

CREATE TABLE employees (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  emp_code             VARCHAR(20)  NOT NULL UNIQUE,
  first_name           VARCHAR(100) NOT NULL,
  last_name            VARCHAR(100) NOT NULL,
  company_code         VARCHAR(10)  NOT NULL,
  site_id              INT UNSIGNED NOT NULL,
  employee_type        ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL,
  contract_type        ENUM('REGULAR','SHORT_3PCT') NOT NULL DEFAULT 'REGULAR',
  dept_group           VARCHAR(100) NULL,
  position             VARCHAR(100) NULL,
  level                TINYINT UNSIGNED NULL,
  salary               DECIMAL(12,2) NOT NULL DEFAULT 0,
  birth_date           DATE NOT NULL,
  start_date           DATE NOT NULL,
  probation_pass_date  DATE NULL,
  status               ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  last_working_date    DATE NULL,
  end_date             DATE NULL,
  end_reason           ENUM('RESIGN','ABSENT_3D','TERMINATED','MISCONDUCT') NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_code) REFERENCES companies(code),
  FOREIGN KEY (site_id) REFERENCES sites(id),
  INDEX idx_emp_company_status (company_code, status),
  INDEX idx_emp_type (employee_type)
) ENGINE=InnoDB;

-- ===== กฎ =====
CREATE TABLE insurance_rules (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_type           ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL,
  companies               JSON NULL,              -- null = ทุกบริษัท, ["HL","AS"]
  wait_days               SMALLINT UNSIGNED NOT NULL,
  exclude_contracts       JSON NOT NULL,          -- ["SHORT_3PCT"]
  require_site_insurance  TINYINT(1) NOT NULL DEFAULT 0,
  note                    VARCHAR(255) NOT NULL DEFAULT '',
  effective_from          DATE NOT NULL DEFAULT '2026-01-01',
  effective_to            DATE NULL
) ENGINE=InnoDB;

CREATE TABLE pvd_rules (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_type   ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL,
  eligible        TINYINT(1) NOT NULL,
  wait_days       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  note            VARCHAR(255) NOT NULL DEFAULT '',
  effective_from  DATE NOT NULL DEFAULT '2026-01-01',
  effective_to    DATE NULL
) ENGINE=InnoDB;

CREATE TABLE pvd_vesting (
  min_years  DECIMAL(4,1) PRIMARY KEY,
  percent    DECIMAL(5,2) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE uniform_items (
  code  VARCHAR(20) PRIMARY KEY,
  name  VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE uniform_rules (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_type    ENUM('CENTRAL','PRO_SITE','DAILY','MAID_CNS') NOT NULL,
  companies        JSON NOT NULL,
  dept_groups      JSON NULL,
  position         VARCHAR(100) NULL,
  level_min        TINYINT UNSIGNED NULL,
  level_max        TINYINT UNSIGNED NULL,
  style            VARCHAR(200) NOT NULL,
  items            JSON NOT NULL,
  polo_by_site     TINYINT(1) NOT NULL DEFAULT 0,
  qty_start        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  qty_start_label  VARCHAR(20) NULL,
  qty_probation    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  qty_annual       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  note             VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB;

CREATE TABLE settings (
  `key`    VARCHAR(50) PRIMARY KEY,
  `value`  VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

-- ===== ธุรกรรม =====
CREATE TABLE insurance_batches (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cycle_date    DATE NOT NULL,
  type          ENUM('IN','OUT','URGENT') NOT NULL,
  submitted_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_by  VARCHAR(100) NOT NULL,
  INDEX idx_batch_cycle (cycle_date)
) ENGINE=InnoDB;

CREATE TABLE insurance_batch_items (
  batch_id     INT UNSIGNED NOT NULL,
  employee_id  INT UNSIGNED NOT NULL,
  direction    ENUM('IN','OUT') NOT NULL,   -- URGENT นับเป็น OUT
  PRIMARY KEY (batch_id, employee_id),
  UNIQUE KEY uq_emp_direction (employee_id, direction), -- กันแจ้งซ้ำ
  FOREIGN KEY (batch_id) REFERENCES insurance_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE uniform_issues (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id      INT UNSIGNED NOT NULL,
  entitlement_key  VARCHAR(20) NOT NULL,     -- START | PROBATION | ANNUAL-2026
  event            ENUM('START','PROBATION','ANNUAL') NOT NULL,
  qty              TINYINT UNSIGNED NOT NULL,
  size             VARCHAR(10) NOT NULL,
  issued_at        DATE NOT NULL,
  issued_by        VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_emp_ent (employee_id, entitlement_key),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE audit_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity     VARCHAR(50) NOT NULL,
  entity_id  VARCHAR(50) NOT NULL,
  action     VARCHAR(20) NOT NULL,
  before_json JSON NULL,
  after_json  JSON NULL,
  user_name  VARCHAR(100) NOT NULL,
  at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity, entity_id)
) ENGINE=InnoDB;
```

`backend/database/seed.sql` (ตัวอย่างส่วนกฎ — ให้ครบตามตารางข้อ 6)
```sql
USE happyland_welfare;

INSERT INTO companies VALUES
 ('HL','แฮปปี้แลนด์ (HL)'),('PRO','PRO'),('CNS','CNS'),('CIC','CIC'),('AS','AS');

INSERT INTO insurance_rules (employee_type, companies, wait_days, exclude_contracts, require_site_insurance, note) VALUES
 ('CENTRAL',  NULL,           30,  '[]',               0, 'พนักงานส่วนกลางทุกบริษัท'),
 ('PRO_SITE', '["PRO"]',      30,  '["SHORT_3PCT"]',   0, 'สัญญา 3% ระยะสั้น ไม่ได้รับประกันกลุ่ม'),
 ('DAILY',    '["HL","AS"]',  120, '[]',               0, 'พนักงานรายวัน HL, AS'),
 ('MAID_CNS', '["CNS"]',      120, '[]',               1, 'เฉพาะหน่วยงานที่ระบุว่าได้รับประกันกลุ่ม');

INSERT INTO pvd_rules (employee_type, eligible, wait_days, note) VALUES
 ('PRO_SITE', 1, 0,   'เป็นสมาชิกตั้งแต่วันแรก'),
 ('CENTRAL',  1, 120, 'เป็นสมาชิกเมื่อครบ 120 วัน'),
 ('MAID_CNS', 0, 0,   'แม่บ้าน CNS ไม่ได้รับกองทุนสำรองเลี้ยงชีพ'),
 ('DAILY',    0, 0,   'พนักงานรายวันทุกบริษัท ไม่ได้รับกองทุนสำรองเลี้ยงชีพ');

INSERT INTO pvd_vesting VALUES (0,0),(3,50),(5,100);   -- ⚠️ ค่าตัวอย่าง

INSERT INTO settings VALUES
 ('insuranceMaxAge','65'),('insuranceCycleDay','5'),('absentExtraDays','7'),
 ('pvdEmployeeRate','2'),('pvdCompanyRate','2'),('uniformAnnualMonth','1'),
 ('pvdVestingIsPlaceholder','1');

INSERT INTO uniform_items VALUES
 ('POLO_BLACK','โปโลสีดำ'),('POLO_NAVY','โปโลสีน้ำเงิน'),('TECH_SHIRT','เสื้อช่าง'),
 ('TECH_PANTS','กางเกงช่าง'),('SAFETY_SHOES','รองเท้า Safety');

-- uniform_rules: 18 แถวตามตาราง 6.3 (ตัวอย่าง 2 แถว)
INSERT INTO uniform_rules (employee_type, companies, dept_groups, position, level_min, level_max, style, items, polo_by_site, qty_start, qty_start_label, qty_probation, qty_annual, note) VALUES
 ('CENTRAL', '["HL","PRO","CNS","CIC"]', '["Support Line"]', NULL, 1, 5, 'โปโลสีดำ โลโก้ HL', '["POLO_BLACK"]', 0, 0, NULL, 4, 2, ''),
 ('PRO_SITE', '["PRO"]', NULL, 'ช่างทีมโมบาย', NULL, NULL, 'โปโลสีดำหรือน้ำเงิน โลโก้ PRO', '["POLO_NAVY","TECH_SHIRT","TECH_PANTS","SAFETY_SHOES"]', 1, 3, '2+1', 1, 2, '');
-- ... + sites 11 แถวตามข้อ 8 + พนักงานตัวอย่าง
```

> ทางลัด: เขียนสคริปต์ `frontend/scripts/export-seed.ts` ที่เรียก `buildSeed(today)` แล้วพิมพ์เป็น `INSERT` ออกมา → ข้อมูล MySQL จะตรงกับ mock ทุกตัว

ติดตั้งฐานข้อมูล:
```bash
mysql -u root -p < backend/database/schema.sql
mysql -u root -p < backend/database/seed.sql
```

---

## 12. สลับจาก mock → MySQL จริง

1. สร้าง DB ตามข้อ 11 และ `cp backend/.env.example backend/.env` แก้รหัสผ่าน
2. รัน backend
   ```bash
   cd backend
   composer install
   composer serve            # = php -S localhost:8000 -t public
   curl http://localhost:8000/api/companies
   ```
3. แก้ `frontend/.env`
   ```ini
   VITE_API_MODE=http
   VITE_API_BASE_URL=/api
   ```
4. รีสตาร์ท `npm run dev` → ป้ายใน sidebar เปลี่ยนเป็น "เชื่อมต่อ API"
5. เปิดทุกหน้าเทียบกับโหมด mock — ผลคำนวณสิทธิต้องตรงกัน

**Deploy บน Apache (XAMPP/Laragon)** — ถ้าไม่ใช้ `php -S`
- ชี้ DocumentRoot / virtual host ไปที่ `backend/public`
- `backend/public/.htaccess`
  ```apache
  RewriteEngine On
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteRule ^ index.php [QSA,L]
  ```
- Build frontend: `npm run build` → นำ `frontend/dist/*` ไปวางเป็นเว็บหลัก และตั้ง fallback ทุก path ไป `index.html` (เพราะเป็น SPA)

---

## 13. การทดสอบ

**Frontend (Vitest)** — `src/domain/eligibility.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { insuranceStatus, pvdStatus, matchUniformRule } from './eligibility';
import { defaultRules } from '../api/mock/rules';
// สร้าง helper emp({...}) คืน Employee ที่มีค่า default

describe('ประกันกลุ่ม', () => {
  it('ส่วนกลาง ครบ 30 วัน → รอบวันที่ 5 ถัดไป', () => {
    // start 2026-10-10 → eligible 2026-11-09 → enroll 2026-12-05
  });
  it('ครบสิทธิวันที่ 5 พอดี → เข้ารอบนั้นเลย', () => {});
  it('Pro Site สัญญา 3% → ไม่มีสิทธิ', () => {});
  it('แม่บ้าน CNS หน่วยงานไม่ได้ประกัน → ไม่มีสิทธิ', () => {});
  it('อายุ 66 ณ รอบแจ้งเข้า → ไม่มีสิทธิ', () => {});
  it('ขาดงาน 3 วัน → วันออก = วันทำงานสุดท้าย + 7', () => {});
  it('เลิกจ้าง → urgent, exitCycleDate = endDate', () => {});
  it('ลาออกก่อนถึงรอบแจ้งเข้า → ไม่ต้องแจ้ง', () => {});
});
describe('PVD', () => {
  it('Pro Site เป็นสมาชิกวันแรก', () => {});
  it('ส่วนกลาง เป็นสมาชิกเมื่อครบ 120 วัน', () => {});
  it('หัก/สมทบ 2% ของเงินเดือน', () => {});
  it('กระทำผิด → vesting 0%', () => {});
});
describe('ชุดฟอร์ม', () => {
  it('Support Line ระดับ 3 → rule 1 (4/2)', () => {});
  it('Support Line ระดับ 7 → rule 2 (2/1)', () => {});
  it('Pro Site ตำแหน่งไม่อยู่ในรายการ → ตำแหน่งอื่นๆ', () => {});
  it('ช่างทีมโมบาย site สีน้ำเงิน → POLO_NAVY', () => {});
});
```

**Backend (PHPUnit)** — `tests/EligibilityTest.php` ใช้ test case ชุดเดียวกัน
> แนะนำเก็บ test case เป็น `shared/eligibility-cases.json` (input + expected) ให้ทั้ง Vitest และ PHPUnit อ่านไฟล์เดียวกัน → รับประกันว่า TS กับ PHP ให้ผลตรงกัน

---

## 14. Checklist

### เฟส 1 — Frontend + Mock
- [ ] สร้างโปรเจกต์ Vite React 19 + TS, ติดตั้ง react-router-dom
- [ ] `types/domain.ts`, `api/types.ts`
- [ ] `domain/date.ts`, `domain/eligibility.ts` + test ผ่านทั้งหมด
- [ ] `api/mock/rules.ts`, `seed.ts`, `mockApi.ts`, `api/index.ts`
- [ ] `api/http/httpApi.ts` (เขียนไว้ก่อน ยังไม่ใช้)
- [ ] Layout + ui components + CSS (light/dark, มือถือ)
- [ ] หน้า: ภาพรวม, พนักงาน, รายละเอียด/ฟอร์ม, ประกันกลุ่ม, PVD, ชุดฟอร์ม, เงื่อนไข, หน่วยงาน, 404
- [ ] ส่งออก CSV เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน (UTF-8 BOM)
- [ ] `npm run build` ผ่าน ไม่มี type error

### เฟส 2 — PHP + MySQL
- [ ] `schema.sql`, `seed.sql` (ข้อมูลตรงกับ mock)
- [ ] Router, Request, Response, Database
- [ ] `Domain/Eligibility.php` + PHPUnit ผ่าน (case เดียวกับ TS)
- [ ] Repository + Controller ครบทุก endpoint ในข้อ 7
- [ ] Validation + transaction + unique key กันซ้ำ
- [ ] audit_log
- [ ] สลับ `VITE_API_MODE=http` แล้วทุกหน้าทำงานเหมือน mock

### เฟส 3 (ภายหลัง)
- [ ] Login + สิทธิ์ตาม role / แยกบริษัท
- [ ] แก้ไขกฎสวัสดิการผ่านหน้าจอ (มี effective date)
- [ ] นำเข้าพนักงาน/รายชื่อลาออกจาก Excel ของ Payroll (ส่วนกลาง + CNS)
- [ ] รับ flag ขาดงาน 3 วันจากระบบลงเวลา
- [ ] สต็อกชุดฟอร์ม

---

## 15. ประเด็นที่ต้องยืนยันกับ HR
- [ ] "ทำงานครบ 30/120 วัน" นับวันปฏิทินหรือวันทำงาน? นับวันเริ่มงานเป็นวันที่ 1 ไหม? (ระบบตอนนี้: `startDate + N วันปฏิทิน`)
- [ ] ครบสิทธิหลังวันที่ 5 → เข้ารอบเดือนถัดไปใช่ไหม?
- [ ] อายุ 65 ตรวจเฉพาะตอนแจ้งเข้า หรือต้องแจ้งออกเมื่ออายุครบ 65 ระหว่างเป็นสมาชิกด้วย?
- [ ] ขาดงาน 3 วันแล้วกลับมาทำงาน → แจ้งเข้าใหม่ + นับอายุงานใหม่ไหม?
- [ ] พนักงานรายวัน CNS / CIC / PRO ได้ประกันกลุ่มไหม (ไฟล์ระบุแค่ HL, AS)?
- [ ] PVD: ตาราง vesting จริง และนิยาม "ลาออกถูกต้องตามระเบียบ"
- [ ] ชุดฟอร์มส่วนกลาง: ช่อง "วันเริ่มงาน" ว่าง = ไม่ได้จนกว่าจะผ่านทดลองงาน ใช่ไหม?
- [ ] ช่างทีมโมบาย "2+1" = ชุดช่าง 2 + โปโล 1 ใช่ไหม?
- [ ] แจกชุดประจำปีเดือนไหน และต้องทำงานครบกี่เดือนก่อนรอบแจก?
- [ ] CIC ระดับ 6 ขึ้นไป ได้ชุดฟอร์มกี่ตัว?
- [ ] แม่บ้าน CNS และพนักงานรายวัน ได้ชุดฟอร์มไหม?
- [ ] ระดับพนักงาน "6 ขึ้นไป" สูงสุดถึงระดับเท่าไร?
