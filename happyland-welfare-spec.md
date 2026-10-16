# ระบบจัดการสวัสดิการพนักงาน — กลุ่มบริษัทแฮปปี้แลนด์

> เอกสารสเปกสำหรับพัฒนาบน localhost
> Stack: **React 19 + TypeScript (Vite, SPA)** · **Tailwind CSS 4** · **PHP 8.2+** · **MySQL 8**
> แนวทาง: **เฟส 1 ทำ Frontend กับ mock ให้เสร็จก่อน → เฟส 2 ต่อ PHP + MySQL จริง**
> สถาปัตยกรรม: **Clean Architecture** (domain เป็นแกน ไม่ขึ้นกับ UI/DB) · UI: **Modern, clean, user-friendly** (design tokens + light/dark)
> อ้างอิงเงื่อนไขจากไฟล์ "เงื่อนไขสวัสดิการ 15.10.69"

---

## สารบัญ
1. [ภาพรวม](#1-ภาพรวม)
2. [สิ่งที่ต้องติดตั้งบนเครื่อง](#2-สิ่งที่ต้องติดตั้งบนเครื่อง)
3. [สถาปัตยกรรม (Clean Architecture)](#3-สถาปัตยกรรม-clean-architecture)
4. [โครงสร้างโปรเจกต์](#4-โครงสร้างโปรเจกต์)
5. [เฟส 1 — สร้าง Frontend (Vite + React 19 + TS)](#5-เฟส-1--สร้าง-frontend-vite--react-19--ts)
6. [Domain Model (TypeScript)](#6-domain-model-typescript)
7. [กฎสวัสดิการ (Business Rules)](#7-กฎสวัสดิการ-business-rules)
8. [API Contract](#8-api-contract)
9. [Mock API](#9-mock-api)
10. [Design System & UX](#10-design-system--ux)
11. [หน้าจอ (Pages)](#11-หน้าจอ-pages)
12. [เฟส 2 — PHP Backend](#12-เฟส-2--php-backend)
13. [MySQL Schema](#13-mysql-schema)
14. [สลับจาก mock → MySQL จริง](#14-สลับจาก-mock--mysql-จริง)
15. [การทดสอบ](#15-การทดสอบ)
16. [Checklist](#16-checklist)
17. [ประเด็นที่ต้องยืนยันกับ HR](#17-ประเด็นที่ต้องยืนยันกับ-hr)

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
| หน่วยงาน | เพิ่ม/แก้/ลบหน่วยงาน, ได้ประกันกลุ่มไหม (แม่บ้าน CNS) และสีโปโล (Pro Site) |
| ศูนย์ติดตามงาน | คิวงานรวมทุกเรื่องที่ต้องทำ (ด่วน/ต้องทำ/ติดตาม) + บันทึกกิจกรรม (audit log) + รีเฟรชอัตโนมัติ |

**บริษัทในเครือ:** HL (แฮปปี้แลนด์), PRO, CNS, CIC, AS

**หลักการออกแบบ**
- **Clean Architecture** — ตรรกะสวัสดิการอยู่ใน `domain/` (pure function ไม่มี I/O, ไม่ import React/fetch) ชั้นนอกพึ่งชั้นในเท่านั้น (ดูข้อ 3)
- Frontend เรียกข้อมูลผ่าน **port** `WelfareApi` ตัวเดียว → มี 2 adapter คือ `MockApi` และ `HttpApi` สลับด้วย `.env` และฉีดเข้าหน้าจอผ่าน React Context (`useApi()`) ไม่ import adapter ตรงๆ
- ตรรกะคำนวณสิทธิฝั่ง PHP ต้องมีตัวคู่แฝดที่ให้ผลเหมือนกัน (`Domain/Eligibility.php`) โดยใช้ชุด test case เดียวกัน
- กฎเก็บเป็น **ข้อมูล** (rule table) ไม่ hard-code ในหน้าจอ
- วันที่ใช้รูปแบบ ISO `YYYY-MM-DD` ทุกที่ คำนวณแบบ UTC เพื่อไม่ให้วันเลื่อน แสดงผลเป็น พ.ศ.
- UI ใช้ **design token** (CSS variables) ชุดเดียว → light/dark สลับได้โดยไม่ต้องแก้ component (ดูข้อ 10)

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
>
> ⚠️ เครื่องพัฒนาปัจจุบัน (AppServ) มี **PHP 5.2.6 / MySQL 5.0** ใน PATH — ใช้กับเฟส 2 ไม่ได้ (ต้องการ `readonly`, `never`, `enum`, JSON column) ต้องติดตั้ง PHP 8.2+ และ MySQL 8 / MariaDB 10.6+ แยก (เช่น Laragon) ก่อนเริ่มเฟส 2 · เฟส 1 ใช้แค่ Node.js

ตรวจสอบ:
```bash
node -v && npm -v && php -v && composer -V && mysql --version
```

---

## 3. สถาปัตยกรรม (Clean Architecture)

### 3.1 ชั้น (Layers) และกฎการพึ่งพา

```text
            ┌──────────────────────────────────────────────────────┐
            │  app/            composition root (router, providers) │
            │  ┌────────────────────────────────────────────────┐  │
            │  │ features/     หน้าจอ + component ราย module      │  │
            │  │ ui/  shared/  design system, format, labels    │  │
            │  │  ┌──────────────────────────────────────────┐  │  │
            │  │  │ application/  ports (WelfareApi),          │  │  │
            │  │  │               use-cases (dashboard, cycle) │  │  │
            │  │  │  ┌────────────────────────────────────┐  │  │  │
            │  │  │  │ domain/  entities + กฎสวัสดิการ       │  │  │  │
            │  │  │  │          (pure, ไม่มี I/O)           │  │  │  │
            │  │  │  └────────────────────────────────────┘  │  │  │
            │  │  └──────────────────────────────────────────┘  │  │
            │  └────────────────────────────────────────────────┘  │
            │  infrastructure/  adapters: MockApi, HttpApi ──────▶ implements port
            └──────────────────────────────────────────────────────┘
                         ลูกศรการ import ชี้ "เข้าหาแกน" เท่านั้น
```

| ชั้น | หน้าที่ | import ได้ | ห้าม import |
|---|---|---|---|
| `domain/` | type ของ entity, กฎคำนวณสิทธิ (ประกัน / PVD / ชุดฟอร์ม), วันที่ | – (ตัวเองเท่านั้น) | React, fetch, localStorage, ชั้นอื่นทั้งหมด |
| `application/` | port `WelfareApi`, `ApiError`, use-case ที่ประกอบหลาย entity (dashboard, รอบประกัน, ชุดค้างแจก) | `domain` | `infrastructure`, `features`, `ui` |
| `infrastructure/` | adapter ที่ implement port: `MockApi` (memory + localStorage), `HttpApi` (fetch → PHP) | `application`, `domain` | `features`, `ui` |
| `shared/` | format วันที่/เงิน, label ภาษาไทย, CSV, hooks ทั่วไป | `domain` (type เท่านั้น) | `infrastructure`, `features` |
| `ui/` | design system — Button, Card, Badge, Table, Modal, Toast ฯลฯ **ไม่รู้จัก domain** | `shared/cn` | `domain`, `application`, `infrastructure` |
| `features/` | หน้าจอแต่ละ module ใช้ API ผ่าน `useApi()` | `application`, `domain`, `ui`, `shared`, `app/ApiContext` (เฉพาะ `useApi`) | `infrastructure` (ต้องผ่าน DI) |
| `app/` | composition root: เลือก adapter จาก `.env`, ประกอบ router, layout, providers | ทุกชั้น | – |

**ผลลัพธ์ที่ได้**
- เปลี่ยน mock → PHP ได้โดยแก้ `.env` บรรทัดเดียว หน้าจอไม่ต้องแก้
- ทดสอบกฎสวัสดิการได้โดยไม่ต้องเปิดเบราว์เซอร์/DB (Vitest + PHPUnit ใช้ case ชุดเดียวกัน)
- ปรับหน้าตา (design token) ได้โดยไม่กระทบตรรกะ
- ตรวจกฎการ import อัตโนมัติด้วย oxlint `no-restricted-imports` (ตั้งไว้ใน `.oxlintrc.json` แยก override ต่อชั้น) → `npx oxlint`

### 3.2 การไหลของข้อมูล (ตัวอย่าง: เปิดหน้ารายละเอียดพนักงาน)

```text
EmployeeDetailPage ──useApi()──▶ WelfareApi.getEmployeeBenefits(id)      (port)
                                   │
                ┌──────────────────┴──────────────────┐
           MockApi (mode=mock)                   HttpApi (mode=http)
           อ่าน seed/localStorage                GET /api/employees/{id}/benefits
           เรียก domain.benefitsOf()                  │
                                                 PHP EmployeeController
                                                 → BenefitService (Application)
                                                 → Domain\Eligibility (คู่แฝด TS)
                                                 → PdoEmployeeRepository (Infrastructure)
```

### 3.3 ฝั่ง PHP ใช้ชั้นเดียวกัน

| ชั้น | Namespace | ตัวอย่าง |
|---|---|---|
| Domain | `App\Domain` | `Dates`, `Eligibility` (คู่แฝดของ TS — pure, ไม่มี PDO) |
| Application | `App\Application` | `Port\EmployeeRepository` (interface), `Service\InsuranceCycleService`, `Service\DashboardService` |
| Infrastructure | `App\Infrastructure` | `Config`, `Database`, `Persistence\PdoEmployeeRepository` |
| Interface (HTTP) | `App\Http` | `Router`, `Request`, `Response`, `Controller\*` (บาง — แค่แปลง request → service → JSON) |

---

## 4. โครงสร้างโปรเจกต์

```text
hl-welfare/
├── happyland-welfare-spec.md      ← ไฟล์นี้
│
├── frontend/                      ← Vite + React 19 + TypeScript + Tailwind 4 (SPA)
│   ├── index.html                 ← โหลดฟอนต์ IBM Plex Sans Thai
│   ├── package.json
│   ├── vite.config.ts             ← plugin react + tailwind, proxy /api → http://localhost:8000
│   ├── .oxlintrc.json             ← บังคับกฎ import ตามชั้น (ข้อ 3.1)
│   ├── .env.example               ← VITE_API_MODE=mock | http
│   └── src/
│       ├── main.tsx
│       ├── index.css              ← design tokens (light/dark) + Tailwind
│       ├── vite-env.d.ts
│       │
│       ├── domain/                ← ① แกนกลาง: pure, ไม่มี I/O
│       │   ├── types.ts           ← entity/value type ทั้งหมด (ตรงกับ JSON ของ PHP)
│       │   ├── date.ts            ← addDays, ageAt, nextCycleDate, diffDays (UTC)
│       │   ├── labels.ts          ← คำศัพท์ภาษาไทยของ enum (ubiquitous language)
│       │   ├── insurance.ts       ← insuranceStatus, insuranceExit
│       │   ├── pvd.ts             ← pvdStatus
│       │   ├── uniform.ts         ← matchUniformRule, resolveItems, uniformStatus
│       │   ├── eligibility.ts     ← benefitsOf() + re-export
│       │   └── eligibility.test.ts
│       │
│       ├── application/           ← ② port + use-case
│       │   ├── ports.ts           ← interface WelfareApi (สัญญา API)
│       │   ├── errors.ts          ← ApiError(status, message)
│       │   └── usecases/
│       │       ├── dashboard.ts       ← buildDashboard()
│       │       ├── insuranceCycle.ts  ← buildInsuranceCycle()
│       │       ├── workQueue.ts       ← buildWorkQueue() คิวงานของศูนย์ติดตาม
│       │       └── uniformPending.ts  ← buildUniformPending()
│       │
│       ├── infrastructure/        ← ③ adapter
│       │   ├── createApi.ts       ← เลือก Mock หรือ Http จาก .env
│       │   ├── mock/
│       │   │   ├── rules.ts       ← กฎตั้งต้นจากไฟล์ Excel
│       │   │   ├── seed.ts        ← ข้อมูลพนักงานจำลอง + edge cases (PRNG deterministic)
│       │   │   ├── mockApi.ts     ← implement WelfareApi ในหน่วยความจำ + localStorage
│       │   │   └── mockApi.test.ts← ทดสอบ validation (409/422/404)
│       │   └── http/
│       │       └── httpApi.ts     ← implement WelfareApi ด้วย fetch → PHP
│       │
│       ├── shared/                ← ④ ของใช้ร่วม
│       │   ├── format.ts          ← thaiDate (5 พ.ย. 69), money (1,234.00)
│       │   ├── labels.ts          ← re-export domain/labels + tone ของ badge + ตัวเลือกฟอร์ม
│       │   ├── csv.ts             ← ส่งออก CSV (UTF-8 BOM ให้ Excel อ่านไทยได้)
│       │   ├── cn.ts              ← รวม className
│       │   └── hooks/
│       │       ├── useAsync.ts    ← { data, error, loading, reload }
│       │       └── useTheme.ts    ← light (ค่าเริ่มต้น) / dark
│       │
│       ├── ui/                    ← ⑤ Design system (ไม่รู้จัก domain)
│       │   ├── Button.tsx         ← Button, ButtonLink, IconButton
│       │   ├── Card.tsx  Badge.tsx  StatCard.tsx  Skeleton.tsx
│       │   ├── Table.tsx          ← ตาราง (desktop) / การ์ด (มือถือ) + แบ่งหน้า
│       │   ├── Pagination.tsx
│       │   ├── Combobox.tsx       ← select ที่พิมพ์ค้นหาได้ (ใช้แทน <select> ทุกจุด)
│       │   ├── DataGrid.tsx       ← ตารางแบบ Excel: คลิกแก้ในเซลล์, เพิ่มแถว, บันทึกอัตโนมัติ
│       │   ├── DataGrid.test.tsx  ← ทดสอบคีย์บอร์ด/การบันทึก (jsdom + Testing Library)
│       │   ├── ConfirmButton.tsx  ← ปุ่มยืนยันก่อนยกเลิก/ลบ
│       │   ├── Field.tsx          ← Field, Input, TextField, SelectField (Combobox)
│       │   ├── Feedback.tsx       ← Alert, EmptyState, ErrorState
│       │   ├── Overlay.tsx        ← Modal (focus trap), ToastProvider/useToast
│       │   ├── Misc.tsx           ← PageHeader, Avatar, Switch, Tabs, Progress, InfoList
│       │   └── index.ts
│       │
│       ├── features/              ← ⑥ หน้าจอแยกตาม module
│       │   ├── common.tsx         ← EmployeeCell (Avatar + ชื่อ + รหัส)
│       │   ├── dashboard/DashboardPage.tsx
│       │   ├── monitor/           ← MonitorPage (คิวงาน + กิจกรรม), ActivityFeed
│       │   ├── employees/
│       │   │   ├── EmployeesPage.tsx       ← ตาราง Excel (DataGrid) แก้/เพิ่ม/ลบในตาราง
│       │   │   ├── employeeRules.ts        ← validateEmployee + normalizeEmployee (ใช้ร่วมฟอร์ม/ตาราง)
│       │   │   ├── EmployeeDetailPage.tsx   ← /employees/:id
│       │   │   ├── EmployeeFormPage.tsx     ← /employees/new, /employees/:id/edit
│       │   │   └── components/    ← BenefitCards (Insurance/Pvd), UniformCard + IssueAction, Timeline
│       │   ├── insurance/InsurancePage.tsx
│       │   ├── pvd/PvdPage.tsx
│       │   ├── uniform/UniformPage.tsx
│       │   ├── rules/RulesPage.tsx
│       │   ├── sites/SitesPage.tsx
│       │   └── NotFoundPage.tsx
│       │
│       └── app/                   ← ⑦ composition root
│           ├── App.tsx            ← RouterProvider
│           ├── router.tsx         ← createBrowserRouter (lazy route ต่อ feature)
│           ├── ApiContext.tsx     ← <ApiProvider> + useApi()
│           └── layout/AppShell.tsx← Sidebar (ตัวนับงานค้าง), Topbar (ค้นหา /, สลับธีม), drawer มือถือ
│
├── backend/                       ← PHP 8.2+ (ไม่ใช้ framework, PSR-4) — เฟส 2
│   ├── composer.json
│   ├── .env.example               ← DB_HOST, DB_NAME, DB_USER, DB_PASS
│   ├── public/
│   │   ├── index.php              ← front controller (ทุก request เข้าที่นี่)
│   │   └── .htaccess
│   ├── src/
│   │   ├── Domain/                ← ① pure (คู่แฝด TS)
│   │   │   ├── Dates.php
│   │   │   └── Eligibility.php
│   │   ├── Application/           ← ② port + use-case
│   │   │   ├── Port/              ← EmployeeRepository, SiteRepository, RuleRepository,
│   │   │   │                         InsuranceBatchRepository, UniformIssueRepository (interface)
│   │   │   └── Service/           ← DashboardService, BenefitService,
│   │   │                             InsuranceCycleService, UniformService
│   │   ├── Infrastructure/        ← ③ adapter
│   │   │   ├── Config.php
│   │   │   ├── Database.php       ← PDO singleton
│   │   │   └── Persistence/       ← Pdo*Repository (implement Port)
│   │   └── Http/                  ← ④ interface
│   │       ├── Router.php  Request.php  Response.php  HttpError.php
│   │       └── Controller/        ← Dashboard, Company, Site, Employee, Rule,
│   │                                 Insurance, Pvd, Uniform
│   ├── database/
│   │   ├── schema.sql
│   │   └── seed.sql
│   └── tests/
│       └── EligibilityTest.php    ← test case ชุดเดียวกับ eligibility.test.ts
│
├── shared/
│   └── eligibility-cases.json     ← test case กลาง (TS + PHP อ่านไฟล์เดียวกัน)
└── .gitignore
```

---

## 5. เฟส 1 — สร้าง Frontend (Vite + React 19 + TS)

### 5.1 สร้างโปรเจกต์
```bash
cd hl-welfare
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install react@^19 react-dom@^19 react-router@^7 lucide-react
npm install -D @types/react@^19 @types/react-dom@^19 vitest tailwindcss@^4 @tailwindcss/vite@^4
```

ตรวจว่า `package.json` ได้ React 19:
```json
"dependencies": {
  "react": "^19.x",
  "react-dom": "^19.x",
  "react-router": "^7.x",
  "lucide-react": "^0.x"
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

### 5.2 `vite.config.ts`
```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// dev: /api ถูก proxy ไปที่ PHP built-in server (เฟส 2)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
});
```

### 5.3 `.env` / `.env.example`
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

### 5.4 Routing (`app/router.tsx`)
ทุก route อยู่ใต้ `AppShell` และโหลดแบบ lazy ต่อ feature

| Path | Page |
|---|---|
| `/` | DashboardPage |
| `/monitor` | MonitorPage — ศูนย์ติดตามงาน (`?severity=critical|warning|info`, `?kind=`) |
| `/employees` | EmployeesPage (filter ผ่าน query string: `q`, `company`, `type`, `status`) |
| `/employees/new` | EmployeeFormPage (โหมดเพิ่ม) |
| `/employees/:id` | EmployeeDetailPage |
| `/employees/:id/edit` | EmployeeFormPage (โหมดแก้ไข / บันทึกพ้นสภาพ) |
| `/insurance` | InsurancePage (`?cycle=YYYY-MM-05`) |
| `/pvd` | PvdPage |
| `/uniform` | UniformPage (`?tab=pending|history`) |
| `/rules` | RulesPage |
| `/sites` | SitesPage |
| `*` | NotFoundPage |

### 5.5 รัน
```bash
npm run dev      # http://localhost:5173
npm test         # vitest
npm run build    # ตรวจ type + build
npx oxlint       # lint + ตรวจกฎ import ตามชั้น
```

---

## 6. Domain Model (TypeScript)

`src/domain/types.ts` — **JSON จาก PHP ต้องใช้ชื่อ field แบบ camelCase ตรงกับนี้**

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

## 7. กฎสวัสดิการ (Business Rules)

### 7.1 ประกันกลุ่ม

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

### 7.2 กองทุนสำรองเลี้ยงชีพ

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

### 7.3 ชุดฟอร์ม

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

## 8. API Contract

`src/application/ports.ts` — **port ของระบบ: ทั้ง MockApi และ HttpApi (adapter) ต้อง implement ครบ**

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

  // ----- CRUD เพิ่มเติม -----
  createSite(input: Omit<Site, 'id'>): Promise<Site>;
  deleteSite(id: number): Promise<void>;                 // 409 ถ้ายังมีพนักงาน
  deleteEmployee(id: number): Promise<void>;             // 409 ถ้ามีประวัติแจ้งประกัน/แจกชุด
  cancelInsuranceBatch(id: number): Promise<void>;       // รายการกลับเป็น "รอส่ง"
  cancelUniformIssue(id: number): Promise<void>;         // กลับเป็น "ค้างแจก"

  // ----- Monitoring -----
  getWorkQueue(): Promise<MonitorTask[]>;
  listActivity(filter?: { entity?: ActivityEntity; employeeId?: number; limit?: number }): Promise<ActivityLog[]>;
}
```

**ตาราง CRUD**
| ข้อมูล | Create | Read | Update | Delete |
|---|---|---|---|---|
| พนักงาน | ตาราง Excel / ฟอร์มเต็ม | ✅ | ตาราง Excel / ฟอร์ม (รวมพ้นสภาพ) | ✅ เฉพาะที่ยังไม่มีประวัติ (ไม่งั้นใช้พ้นสภาพ) |
| หน่วยงาน | ตาราง Excel | ✅ | ตาราง Excel (บริษัทแก้ได้ตอนสร้างเท่านั้น) | ✅ เฉพาะที่ไม่มีพนักงาน |
| แจ้งประกัน (batch) | ✅ | ✅ | – | ยกเลิกได้ (ส่งผิด) |
| แจกชุดฟอร์ม | ✅ | ✅ | – | ยกเลิกได้ (บันทึกผิด) |
| เงื่อนไขสวัสดิการ | – | ✅ | เฟส 3 | – |
| บันทึกกิจกรรม | อัตโนมัติทุกการเปลี่ยนแปลง | ✅ | ❌ (ห้ามแก้) | ❌ |

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
| POST | `/api/sites` | `{companyCode, name, hasGroupInsurance, poloColor}` | `Site` (201) |
| DELETE | `/api/sites/{id}` | – | 204 / 409 |
| DELETE | `/api/employees/{id}` | – | 204 / 409 |
| DELETE | `/api/insurance/batches/{id}` | – | 204 |
| DELETE | `/api/uniform/issues/{id}` | – | 204 |
| GET | `/api/monitor/tasks` | – | `MonitorTask[]` (เรียงด่วนก่อน) |
| GET | `/api/activity` | `?entity=&employeeId=&limit=` | `ActivityLog[]` (ใหม่ก่อน) |

**Validation ที่ต้องมีทั้ง mock และ PHP**
- `empCode` ห้ามซ้ำ → 409 `"รหัสพนักงานซ้ำ"`
- ส่งแจ้งประกันซ้ำ (IN ซ้ำ หรือ OUT/URGENT ซ้ำ) → 409 `"มีพนักงานที่ถูกแจ้งไปแล้ว N ราย"`
- `employeeIds` ว่าง → 422 `"ไม่มีรายการที่เลือก"`
- แจกชุดฟอร์มซ้ำ key เดิม → 409 `"รายการนี้แจกไปแล้ว"`
- ไม่พบข้อมูล → 404
- ลบหน่วยงานที่ยังมีพนักงาน / ลบพนักงานที่มีประวัติ → 409 พร้อมข้อความแนะนำทางเลือก
- ทุก create/update/delete/cancel ต้องเขียน `audit_log` (= `ActivityLog`) พร้อม `summary` ภาษาไทย

### `infrastructure/createApi.ts` + `app/ApiContext.tsx` (Dependency Injection)
```ts
// infrastructure/createApi.ts
export type ApiMode = 'mock' | 'http';
export function createApi(mode: ApiMode, baseUrl = '/api'): WelfareApi {
  return mode === 'http' ? new HttpApi(baseUrl) : new MockApi();
}

// app/ApiContext.tsx — หน้าจอเรียก useApi() เท่านั้น ไม่ import adapter ตรงๆ
const ApiContext = createContext<{ api: WelfareApi; mode: ApiMode } | null>(null);
export function useApi() { const c = use(ApiContext); if (!c) throw new Error('ApiProvider missing'); return c; }
```

`application/errors.ts`
```ts
export class ApiError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
```

### `infrastructure/http/httpApi.ts` (แกนหลัก)
```ts
private async req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${this.baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || 'error' in body) throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status);
  return body.data as T;
}
```

---

## 9. Mock API

- `MockApi implements WelfareApi` เก็บข้อมูลใน memory + `localStorage` (key `hl-welfare-mock-v2`) ห่อ try/catch ทุกครั้ง
- ใส่ latency จำลอง ~150ms และคืนค่าด้วย `structuredClone` (กันหน้าจอแก้ object ใน db ตรงๆ)
- ใช้ `domain/*` + `application/usecases/*` คำนวณสิทธิ → พฤติกรรมเหมือน PHP
- error ใช้ `ApiError(message, status)` ตัวเดียวกับ HttpApi → หน้าจอจัดการ error แบบเดียว
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

**Edge cases ที่ seed ต้องมี** (+ พนักงานสุ่มอีก ~240 คน เพื่อทดสอบการแบ่งหน้า)
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

## 10. Design System & UX

เป้าหมาย: **สะอาด อ่านง่าย ใช้งานเร็ว** — HR ใช้ทุกวัน ข้อมูลเยอะ จึงเน้นความชัดของสถานะ (มีสิทธิ / รอ / ไม่มีสิทธิ) มากกว่าการตกแต่ง

### 10.1 หลักการ
| หลัก | ทำอย่างไร |
|---|---|
| **สถานะต้องเห็นในแวบเดียว** | ทุกสถานะใช้ Badge สี + จุดสี + ข้อความ (ไม่ใช้สีอย่างเดียว เพื่อคนตาบอดสี) |
| **บอกขั้นต่อไปเสมอ** | การ์ดสิทธิแสดง "อะไร · เมื่อไร · ทำไม" เช่น "แจ้งเข้า 5 ธ.ค. 69 (ครบ 30 วัน 9 พ.ย. 69)" |
| **ไม่มีหน้าว่างเปล่า** | Loading = skeleton ทรงเดียวกับเนื้อหา · ว่าง = EmptyState + ปุ่มทำต่อ · ผิดพลาด = Alert + ปุ่มลองใหม่ |
| **ยืนยันก่อนทำสิ่งที่ย้อนไม่ได้** | ส่งแจ้งประกัน / บันทึกพ้นสภาพ → Modal สรุปจำนวนก่อนกดยืนยัน |
| **Feedback ทันที** | บันทึกสำเร็จ/ล้มเหลว → Toast มุมขวาล่าง 4 วินาที |
| **สถานะหน้าจออยู่ใน URL** | filter, แท็บ, รอบประกัน เก็บใน query string → แชร์ลิงก์/กด back ได้ |
| **คีย์บอร์ดได้ทุกจุด** | focus ring ชัด (`:focus-visible`), `/` = โฟกัสช่องค้นหา, `Esc` ปิด modal |

### 10.2 Design tokens (`src/index.css`)
ประกาศเป็น CSS variables แล้ว map เข้า Tailwind ผ่าน `@theme inline` → component ใช้ `bg-surface`, `text-muted` ฯลฯ ได้ทันทีทั้ง light/dark

| Token | Light | Dark | ใช้กับ |
|---|---|---|---|
| `--bg` | `#f7f8fc` | `#0b0d14` | พื้นหลังหน้า |
| `--surface` | `#ffffff` | `#131722` | การ์ด, ตาราง, sidebar |
| `--surface-2` | `#f3f5fa` | `#1a1f2e` | hover, header ตาราง, input |
| `--border` | `#e6e9f0` | `#262c3d` | เส้นขอบ |
| `--fg` | `#0f172a` | `#e6e9f2` | ตัวอักษรหลัก |
| `--muted` | `#64748b` | `#8b93a7` | ตัวอักษรรอง |
| `--primary` | `#4f46e5` | `#818cf8` | ปุ่มหลัก, ลิงก์, เมนูที่เลือก |
| `--primary-soft` | `#eef2ff` | `#1e1b4b` | พื้นหลังเมนูที่เลือก |
| `--success` / `-soft` | `#059669` / `#ecfdf5` | `#34d399` / `#052e1f` | มีสิทธิ, ส่งแล้ว, แจกแล้ว |
| `--warning` / `-soft` | `#d97706` / `#fffbeb` | `#fbbf24` / `#2d1f05` | รอส่ง, แจ้งออก, ใกล้ครบ |
| `--danger` / `-soft` | `#dc2626` / `#fef2f2` | `#f87171` / `#2d0a0a` | ไม่มีสิทธิ, แจ้งทันที, error |
| `--info` / `-soft` | `#0284c7` / `#f0f9ff` | `#38bdf8` / `#04202f` | ข้อมูลทั่วไป, รอบถัดไป |

| ด้าน | ค่า |
|---|---|
| ฟอนต์ | `IBM Plex Sans Thai` 400/500/600/700 (Google Fonts) · ตัวเลขในตารางใช้ `tabular-nums` |
| ขนาดตัวอักษร | 12 (caption) · 13 (ตาราง) · 14 (body) · 16 (หัวการ์ด) · 24 (หัวหน้า) · 30 (ตัวเลข Stat) |
| Spacing | ฐาน 4px (Tailwind scale) · padding การ์ด 20px · gap ระหว่างการ์ด 16–24px |
| Radius | 8px (input, ปุ่ม) · 12px (การ์ด) · 9999px (badge, avatar) |
| Shadow | การ์ด: `0 1px 2px rgb(0 0 0 / .04)` + เส้นขอบ · Modal: `0 20px 50px rgb(0 0 0 / .2)` |
| Motion | 150ms ease-out (hover/focus) · 200ms (modal/toast) · ปิดเมื่อ `prefers-reduced-motion` |
| ธีม | **ค่าเริ่มต้น = โทนสว่าง** (ไม่ตาม dark mode ของระบบ) · ผู้ใช้กดสลับเป็นโหมดมืดได้ที่ Topbar → เก็บใน `localStorage` (`hl-theme`) ใส่ `data-theme="dark"` ที่ `<html>` |

### 10.3 Components (`src/ui/`)
| Component | Variant / Props สำคัญ | หมายเหตุ |
|---|---|---|
| `Button` | `primary` · `secondary` · `ghost` · `danger`, `size: sm/md`, `loading`, `icon` | loading แสดง spinner + disable |
| `Card` | `title`, `description`, `actions`, `padded` | หัวการ์ดมีเส้นคั่นบาง |
| `Badge` | `tone: success/warning/danger/info/neutral/primary`, `dot` | ข้อความสั้น ≤ 3 คำ |
| `StatCard` | `label`, `value`, `hint`, `icon`, `tone`, `to` | คลิกได้ → ไปหน้าที่เกี่ยวข้อง |
| `Table` | `columns`, `rows`, `rowKey`, `onRowClick`, `empty`, `loading`, `pageSize`, `page`/`onPageChange` | ≥768px = ตาราง · <768px = **การ์ดรายแถว** (คอลัมน์กำหนดตำแหน่งด้วย `mobile: lead/title/aside/field/footer`) · ใส่ `pageSize` = แบ่งหน้าอัตโนมัติ |
| `Pagination` | `page`, `pageSize`, `total`, `onPageChange`, `onPageSizeChange` | "แสดง 1–25 จาก 248" · เลือก 10/25/50/100 ต่อหน้า · เลขหน้าแบบย่อ `1 … 4 5 6 … 20` · มือถือแสดง "หน้า x / y" |
| `Input` / `Field` / `SelectField` | `label`, `hint`, `error`, `required` | error ใต้ช่อง สีแดง + `aria-invalid` |
| `Combobox` | `options`, `clearable`, `creatable`, `variant: default/cell`, `autoOpen` | **select ทุกจุดพิมพ์ค้นหาได้** · ↑↓ Enter Esc · `creatable` พิมพ์ค่าใหม่ได้ (เช่น ตำแหน่ง) · popover แบบ portal ไม่ถูกตัดในตาราง |
| `DataGrid` | `columns` (`editor: text/number/date/select/switch`, `editable(row)`), `validate`, `onSave`, `newRow`, `onDelete`, `onOpen`, `pageSize` | ตารางแบบ Excel — ดูข้อ 10.7 |
| `ConfirmButton` | `title`, `confirmLabel`, `successMessage`, `onConfirm` | ยืนยันก่อนยกเลิก/ลบ + Toast อัตโนมัติ |
| `Switch` | `checked`, `onChange`, `label` | ใช้ในหน้าหน่วยงาน |
| `Tabs` | `items`, `value`, `onChange` (sync กับ URL) | underline indicator |
| `Modal` | `open`, `title`, `footer`, `onClose` | trap focus, `Esc` ปิด, backdrop blur |
| `Toast` | `toast.success()`, `toast.error()` | ผ่าน `ToastProvider` |
| `Skeleton` | `className` | shimmer เบาๆ |
| `EmptyState` | `icon`, `title`, `description`, `action` | |
| `Alert` | `tone`, `title`, children | ใช้แจ้ง vesting เป็นค่าตัวอย่าง ฯลฯ |
| `PageHeader` | `title`, `description`, `actions`, `breadcrumbs` | |
| `Avatar` | `name` | อักษรย่อ + สีจาก hash ชื่อ |

ไอคอน: **lucide-react** (เส้นบาง 1.75px ขนาด 16/18/20)

### 10.4 Layout (AppShell)
```text
┌────────────┬───────────────────────────────────────────────────────────┐
│  ☺ HL      │  ภาพรวม › …          [🔍 ค้นหาพนักงาน  /]   [☀/☾]  [mock] │ ← Topbar (sticky, blur)
│  Welfare   ├───────────────────────────────────────────────────────────┤
│            │  หัวหน้า (24px)                              [ปุ่มหลัก]   │ ← PageHeader
│ ▣ ภาพรวม   │  คำอธิบายสั้น                                              │
│ ☺ พนักงาน  │                                                           │
│ ⛨ ประกัน ③ │  ┌─Stat─┐ ┌─Stat─┐ ┌─Stat─┐ ┌─Stat─┐                       │
│ ฿ PVD      │  └──────┘ └──────┘ └──────┘ └──────┘                       │
│ 👕 ชุดฟอร์ม⑫│  ┌──────── Card ────────┐ ┌──── Card ────┐                │
│ ── ตั้งค่า ──│  │                      │ │              │                │
│ ☰ เงื่อนไข  │  └──────────────────────┘ └──────────────┘                │
│ ⌂ หน่วยงาน │                                                           │
│            │                                     max-width 1280px      │
│ [รีเซ็ตmock]│                                                           │
└────────────┴───────────────────────────────────────────────────────────┘
  264px          < 1024px: sidebar เป็น drawer (ปุ่ม ☰ ใน Topbar)
```
- เมนูแสดง **ตัวนับงานค้าง** (badge) เช่น ประกัน = แจ้งทันทีค้าง, ชุดฟอร์ม = ค้างแจก
- ช่องค้นหาใน Topbar → Enter ไป `/employees?q=…`
- ป้ายโหมด: `Mock data` (สีเหลือง) / `API` (สีเขียว)

### 10.5 รูปแบบการแสดงข้อมูล
- วันที่ `5 พ.ย. 69` · วันที่+ระยะ `5 ธ.ค. 69 · อีก 12 วัน` · เงิน `1,234.00` · จำนวนคน `1,234 คน`
- ชื่อพนักงานในตาราง = Avatar + ชื่อ-สกุล + รหัส (บรรทัดรอง สีเทา)
- Badge มาตรฐาน: เขียว=มีสิทธิ/ส่งแล้ว/แจกแล้ว · เหลือง=รอส่ง/แจ้งออก/ใกล้ครบ · แดง=ไม่มีสิทธิ/แจ้งทันที · ฟ้า=รอครบสิทธิ · เทา=พ้นสภาพ
- ตัวเลขชิดขวา + `tabular-nums`
- Responsive: ≥1280 4 คอลัมน์ Stat · 640–1279 2 คอลัมน์ · <640 1 คอลัมน์ · ตาราง <768px เปลี่ยนเป็นการ์ดรายแถว · ตัวกรองบนมือถือเรียง 2 คอลัมน์ ช่องค้นหาเต็มแถว · sidebar <1024px เป็น drawer

### 10.7 ตารางแบบ Excel (DataGrid)
ใช้กับข้อมูลที่ HR แก้บ่อย: **พนักงาน** และ **หน่วยงาน** · ตารางอ่านอย่างเดียว (ประกัน, PVD, ชุดฟอร์ม, ประวัติ) ใช้ `Table` ที่ปรับหน้าตาเป็นเส้นตารางแบบ Excel + เลขแถว

| การใช้งาน | ผลลัพธ์ |
|---|---|
| คลิกเซลล์ | เลือกเซลล์ (กรอบสีหลัก) |
| ดับเบิลคลิก / Enter / F2 / พิมพ์ตัวอักษร | เริ่มแก้ไข (พิมพ์ = แทนค่าด้วยตัวที่พิมพ์) |
| Enter / Tab / Shift+Tab | บันทึกแล้วเลื่อนลง / ขวา / ซ้าย |
| Esc | ยกเลิกการแก้ |
| ← ↑ ↓ → | เลื่อนเซลล์ |
| Space บนเซลล์สวิตช์ / คลิกสวิตช์ | สลับค่าและบันทึกทันที |
| เซลล์ select | เปิด Combobox ค้นหาได้ในเซลล์ |
| ปุ่ม "+ เพิ่มแถว" | แถวใหม่ขึ้นบนสุด (ป้าย "ใหม่") · ช่องบังคับที่ยังว่างขึ้นกรอบแดง · **บันทึกอัตโนมัติเมื่อกรอกครบ** |

- **บันทึกรายแถวอัตโนมัติ** หลังแก้แต่ละเซลล์ — ถ้าข้อมูลยังไม่ผ่าน validation จะยังไม่ส่ง และแสดง ⚠ ที่เลขแถว
- สถานะที่คอลัมน์เลขแถว: ⟳ กำลังบันทึก · ✓ บันทึกแล้ว · ⚠ ผิดพลาด (เลือกแถวเพื่อดูข้อความ) · "ใหม่"
- เซลล์ที่แก้ไม่ได้สำหรับแถวนั้น (เช่น ระดับ ของ Pro Site) เป็นพื้นเทา · หัวตาราง + เลขแถว + ปุ่มท้ายแถว ติดอยู่กับที่เมื่อเลื่อน
- เปลี่ยนบริษัท/ประเภท → `normalizeEmployee` จัดหน่วยงาน/ฝ่าย/ตำแหน่งให้สอดคล้องอัตโนมัติ
- การพ้นสภาพ (หลายช่อง ผลกระทบสูง) ยังทำผ่านฟอร์มเต็มที่หน้ารายละเอียด

### 10.8 การแบ่งหน้า (ข้อมูลเยอะ)
| หน้า | ต่อหน้า | หมายเหตุ |
|---|---|---|
| พนักงาน | 25 | เลขหน้าเก็บใน URL (`?page=`) · เปลี่ยนตัวกรอง → กลับหน้า 1 |
| ประกันกลุ่ม (แต่ละ section) | 25 | ประวัติ batch 10 |
| PVD / ชุดฟอร์ม (ค้างแจก, ประวัติ) | 25 | แท็บใหม่ → เริ่มหน้า 1 |
| ภาพรวม: จะครบสิทธิใน 30 วัน | 10 | |

- เฟส 1 แบ่งหน้าฝั่ง client (ข้อมูลหลักร้อยแถว) · ถ้าข้อมูลเกิน ~2,000 แถว ให้ย้ายไปแบ่งหน้าฝั่ง server ในเฟส 2: `GET /api/employees?page=1&pageSize=25` → `{ "data": [...], "meta": { "page": 1, "pageSize": 25, "total": 2480 } }` (เพิ่มเป็น method ใหม่ใน port โดยไม่ต้องแก้ `Table` — ใช้ `page`/`onPageChange` แบบ controlled)

### 10.6 Accessibility
- Contrast ≥ WCAG AA (4.5:1 ตัวอักษร) ทั้งสองธีม
- ทุก input มี `<label>`, ปุ่มไอคอนมี `aria-label`, Toast ใช้ `role="status"`
- `lang="th"` ที่ `<html>`

---

## 11. หน้าจอ (Pages)

| หน้า | องค์ประกอบ | UX ที่ต้องมี |
|---|---|---|
| **ภาพรวม** | คำทักทาย + วันที่วันนี้ · Stat 4 ใบ: พนักงานปัจจุบัน, รอบแจ้งประกันถัดไป (เข้า/ออก), แจ้งออกทันทีค้าง, ชุดฟอร์มค้างแจก · กราฟแท่งแนวนอนพนักงานแยกบริษัท · รายการ "จะครบสิทธิใน 30 วัน" | Stat คลิกไปหน้าที่เกี่ยวข้อง · แจ้งออกทันทีค้าง > 0 → Alert แดงด้านบน + ปุ่ม "ไปส่งแจ้ง" |
| **ศูนย์ติดตามงาน** | Stat ด่วน/ต้องทำ/ติดตาม/กิจกรรมวันนี้ (คลิกกรอง) · คิวงาน (ระดับ, งาน, พนักงาน, กำหนด/เลยมา N วัน, ปุ่มไปดำเนินการ) กรองตามประเภท + ค้นหา · บันทึกกิจกรรม (ไทม์ไลน์ กรองตามประเภท, โหลดเพิ่ม) | รีเฟรชอัตโนมัติทุก 60 วิ (ปิดได้) + เมื่อกลับมาที่แท็บ · แสดงเวลาอัปเดตล่าสุด |
| **พนักงาน** | ค้นหา รหัส/ชื่อ, filter บริษัท/ประเภท/สถานะ (Combobox, เก็บใน URL) · **ตาราง Excel** แก้ทุกช่องในตาราง · "+ เพิ่มแถว" · ปุ่มเปิดรายละเอียด / ลบ ท้ายแถว · ปุ่ม "เพิ่มด้วยฟอร์มเต็ม" | ค้นหาแบบ debounce 250ms · ล้างตัวกรอง · บันทึกอัตโนมัติรายแถว · ลบต้องยืนยัน |
| **รายละเอียดพนักงาน** | Header: Avatar, ชื่อ, รหัส, Badge สถานะ, ปุ่มแก้ไข · แถบข้อมูลย่อ (บริษัท, หน่วยงาน, ประเภท, สัญญา, อายุงาน) · การ์ดประกันกลุ่ม · การ์ด PVD · การ์ดชุดฟอร์ม (ตารางแต่ละรอบ + เลือกไซซ์ + "บันทึกแจก" + ยกเลิกการแจก) · **ประวัติการเปลี่ยนแปลง** | การ์ดสิทธิ = Badge ใหญ่ + timeline (เริ่มงาน → ครบสิทธิ → รอบแจ้งเข้า → แจ้งออก) · ไม่มีสิทธิ = แสดงเหตุผลเป็นข้อๆ |
| **ฟอร์มพนักงาน** | แบ่ง section: ข้อมูลส่วนตัว / การจ้างงาน / การพ้นสภาพ · บริษัท→หน่วยงาน (กรองตามบริษัท), ประเภท (ส่วนกลางแสดงฝ่าย+ระดับ / Pro Site แสดงตำแหน่ง), สัญญา, เงินเดือน, วันเริ่มงาน, ผ่านทดลองงาน | ช่องที่ไม่เกี่ยวซ่อนอัตโนมัติ · validation ใต้ช่อง · ปุ่มบันทึก sticky ด้านล่าง · บันทึกสำเร็จ → Toast + กลับหน้ารายละเอียด |
| **ประกันกลุ่ม** | เลือกรอบ (วันที่ 5, ย้อนหลัง 6 / ล่วงหน้า 3 เดือน) · 3 section: แจ้งออกทันที / แจ้งเข้า / แจ้งออก · checkbox เลือก → "ส่งแจ้ง" · ส่งออก CSV · ประวัติ batch + **ยกเลิก batch** | ตัวนับในหัว section · เลือกทั้งหมด · Modal ยืนยัน "ส่งแจ้งเข้า 5 ราย รอบ 5 พ.ย. 69?" · แถวที่ส่งแล้วแสดง Badge เขียว checkbox ปิด |
| **PVD** | Stat: สมาชิก, หักสะสมรวม/เดือน, สมทบรวม/เดือน · ตารางสมาชิก (วันเป็นสมาชิก, เงินเดือน, หัก, สมทบ, อายุสมาชิก, vesting) · ส่งออก CSV | Alert เหลืองถ้า vesting เป็นค่าตัวอย่าง · vesting แสดงเป็น progress bar |
| **ชุดฟอร์ม** | แท็บ "ค้างแจก" (เลือกไซซ์ + บันทึกแจกในแถว) / "ประวัติการแจก" · สรุปจำนวนตามแบบเสื้อ (วางแผนสั่งผลิต) | แถวเกินกำหนด > 30 วัน Badge แดง · บันทึกแล้วแถวหายพร้อม Toast |
| **เงื่อนไขสวัสดิการ** | แท็บ: ประกันกลุ่ม / PVD / ชุดฟอร์ม / ค่าตั้งค่า (read-only ในเฟส 1) + รายการประเด็นที่รอยืนยันกับ HR | |
| **หน่วยงาน** | **ตาราง Excel**: บริษัท, ชื่อ, สวิตช์ประกันกลุ่ม, สีโปโล · "+ เพิ่มหน่วยงาน" · ลบท้ายแถว | บันทึกทันที · ลบได้เฉพาะที่ไม่มีพนักงาน |

**UI** — ภาษาไทยทั้งหมด · รายละเอียด token/component/layout ดู [ข้อ 10](#10-design-system--ux)

---

## 12. เฟส 2 — PHP Backend

### 12.1 สร้างโครง
```bash
cd hl-welfare
mkdir -p backend/{public,src/{Domain,Application/{Port,Service},Infrastructure/Persistence,Http/Controller},database,tests}
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

### 12.2 `public/index.php` (front controller)
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

### 12.3 `Http/Response.php`
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

### 12.4 `Infrastructure/Database.php`
```php
<?php
namespace AppInfrastructure;

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

### 12.5 ข้อกำหนด Backend
- **ชั้นตามข้อ 3.3**: Controller บาง (อ่าน request → เรียก Service → `Response::json`) · Service รับ Port (interface) ผ่าน constructor · `Domain` ห้ามแตะ PDO/`$_ENV`
- ประกอบ dependency ที่ `public/index.php` (หรือ `Infrastructure/Container.php` แบบง่าย) ไม่ใช้ `new` ใน Controller/Service
- **Prepared statements ทุก query** (ห้ามต่อ string SQL)
- Repository แปลงแถว DB (`snake_case`) → array `camelCase` ตาม TypeScript type, `boolean` ต้องเป็น `true/false` ไม่ใช่ `0/1`, field JSON (`companies`, `items`, `deptGroups`) ต้อง `json_decode`
- `Domain/Eligibility.php` แปลงจาก `domain/insurance.ts`, `pvd.ts`, `uniform.ts` แบบบรรทัดต่อบรรทัด · use-case ใน `Application/Service` แปลงจาก `application/usecases/*` ใช้ `DateTimeImmutable` + timezone UTC สำหรับคำนวณวัน
- `submitInsuranceBatch` และ `createUniformIssue` ทำใน **transaction** และพึ่ง unique key กันซ้ำ
- เขียน `audit_log` ทุกครั้งที่ create/update พนักงาน, ส่ง batch, แจกชุด
- เฟสถัดไป: login + role (HR Admin / HR บริษัท / Payroll / ผู้ดูแลสต็อก / ผู้บริหาร)

---

## 13. MySQL Schema

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

-- = ActivityLog ในหน้าศูนย์ติดตามงาน (ห้ามแก้/ลบ)
CREATE TABLE audit_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity     ENUM('EMPLOYEE','SITE','INSURANCE_BATCH','UNIFORM_ISSUE') NOT NULL,
  entity_id  VARCHAR(50) NOT NULL,
  action     ENUM('CREATE','UPDATE','DELETE','CANCEL') NOT NULL,
  summary    VARCHAR(500) NOT NULL,      -- ข้อความภาษาไทยสำหรับแสดงผล
  employee_id INT UNSIGNED NULL,         -- ลิงก์ไปหน้าพนักงาน
  before_json JSON NULL,
  after_json  JSON NULL,
  user_name  VARCHAR(100) NOT NULL,
  at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_employee (employee_id),
  INDEX idx_audit_at (at)
) ENGINE=InnoDB;
```

`backend/database/seed.sql` (ตัวอย่างส่วนกฎ — ให้ครบตามตารางข้อ 7)
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

-- uniform_rules: 18 แถวตามตาราง 7.3 (ตัวอย่าง 2 แถว)
INSERT INTO uniform_rules (employee_type, companies, dept_groups, position, level_min, level_max, style, items, polo_by_site, qty_start, qty_start_label, qty_probation, qty_annual, note) VALUES
 ('CENTRAL', '["HL","PRO","CNS","CIC"]', '["Support Line"]', NULL, 1, 5, 'โปโลสีดำ โลโก้ HL', '["POLO_BLACK"]', 0, 0, NULL, 4, 2, ''),
 ('PRO_SITE', '["PRO"]', NULL, 'ช่างทีมโมบาย', NULL, NULL, 'โปโลสีดำหรือน้ำเงิน โลโก้ PRO', '["POLO_NAVY","TECH_SHIRT","TECH_PANTS","SAFETY_SHOES"]', 1, 3, '2+1', 1, 2, '');
-- ... + sites 11 แถวตามข้อ 9 + พนักงานตัวอย่าง
```

> ทางลัด: เขียนสคริปต์ `frontend/scripts/export-seed.ts` ที่เรียก `buildSeed(today)` แล้วพิมพ์เป็น `INSERT` ออกมา → ข้อมูล MySQL จะตรงกับ mock ทุกตัว

ติดตั้งฐานข้อมูล:
```bash
mysql -u root -p < backend/database/schema.sql
mysql -u root -p < backend/database/seed.sql
```

---

## 14. สลับจาก mock → MySQL จริง

1. สร้าง DB ตามข้อ 13 และ `cp backend/.env.example backend/.env` แก้รหัสผ่าน
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

## 15. การทดสอบ

**Frontend (Vitest)** — `src/domain/eligibility.test.ts` (ทดสอบ domain ล้วน ไม่ต้อง mock อะไร)
```ts
import { describe, expect, it } from 'vitest';
import { insuranceStatus, pvdStatus, matchUniformRule } from './eligibility';
import { defaultRules } from '../infrastructure/mock/rules'; // fixture เท่านั้น
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

## 16. Checklist

### เฟส 1 — Frontend + Mock
- [x] สร้างโปรเจกต์ Vite React 19 + TS + Tailwind 4, ติดตั้ง react-router, lucide-react
- [x] `domain/types.ts`, `application/ports.ts`, `application/errors.ts`
- [x] `domain/date.ts`, `insurance.ts`, `pvd.ts`, `uniform.ts` + test ผ่านทั้งหมด
- [x] `application/usecases/*` (dashboard, insuranceCycle, uniformPending)
- [x] `infrastructure/mock/*`, `infrastructure/createApi.ts`, `app/ApiContext.tsx`
- [x] `infrastructure/http/httpApi.ts` (เขียนไว้ก่อน ยังไม่ใช้)
- [x] Design tokens + `ui/*` components + AppShell (light/dark, มือถือ)
- [x] oxlint กฎ import ตามชั้น ผ่าน
- [x] หน้า: ภาพรวม, พนักงาน, รายละเอียด/ฟอร์ม, ประกันกลุ่ม, PVD, ชุดฟอร์ม, เงื่อนไข, หน่วยงาน, 404
- [ ] ส่งออก CSV เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน (ใส่ UTF-8 BOM แล้ว — รอทดสอบเปิดใน Excel จริง)
- [x] `npm run build` ผ่าน ไม่มี type error
- [x] CRUD ครบ (พนักงาน/หน่วยงาน ลบได้ตามเงื่อนไข, ยกเลิก batch/การแจก)
- [x] ศูนย์ติดตามงาน: คิวงาน + บันทึกกิจกรรม + รีเฟรชอัตโนมัติ
- [x] Combobox แทน select ทุกจุด · DataGrid แบบ Excel (พนักงาน, หน่วยงาน) + component test

### เฟส 2 — PHP + MySQL
- [ ] `schema.sql`, `seed.sql` (ข้อมูลตรงกับ mock)
- [ ] Router, Request, Response, Infrastructure/Database
- [ ] Application/Port (interface) + Infrastructure/Persistence (PDO)
- [ ] `Domain/Eligibility.php` + PHPUnit ผ่าน (case เดียวกับ TS)
- [ ] Service + Controller ครบทุก endpoint ในข้อ 8 (รวม DELETE, `/monitor/tasks`, `/activity`)
- [ ] `Application/Service/WorkQueueService` คู่แฝดของ `usecases/workQueue.ts`
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

## 17. ประเด็นที่ต้องยืนยันกับ HR
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
