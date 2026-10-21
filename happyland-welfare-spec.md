# ระบบจัดการสวัสดิการพนักงาน — กลุ่มบริษัทแฮปปี้แลนด์

> เอกสารสเปกสำหรับพัฒนาและนำขึ้น host ของหน่วยงาน
> Stack: **HTML + CSS + JavaScript (ES Modules) ไม่ใช้ framework ไม่ต้อง build** · **PHP 5.2.6 + MySQL 5.0** (AppServ เครื่องเดียวกับ stock_hr — ฐานข้อมูลแยก `hl_welfare`)
> แนวทาง: **เฟส 1 หน้าเว็บ + ข้อมูลจำลอง (mock) ✅ → เฟส 2 PHP + MySQL จริง ✅ (ใช้งานด้วย `apiMode: 'http'`)**
> สถาปัตยกรรม: **Clean Architecture** (กฎสวัสดิการเป็นแกน ไม่ขึ้นกับหน้าจอ/ฐานข้อมูล) · UI: **Modern, clean, user-friendly** — ธีม **gradient น้ำเงิน → เขียว**, โทนสว่าง + โหมดมืด, หน้า login พร้อมอนิเมชัน
> อ้างอิงเงื่อนไขจากไฟล์ "เงื่อนไขสวัสดิการ 15.10.69"
>
> **ทำไมไม่ใช้ React:** ทีม dev ส่วนใหญ่ไม่ถนัด React และ host ของหน่วยงานเป็น static/PHP — จึงเขียนเป็น HTML + JS ธรรมดา
> อัปโหลดโฟลเดอร์ `web/` ขึ้น host ได้ทันที แก้ไขด้วย text editor ได้เลย (เวอร์ชัน React เดิมยังอยู่ใน git history: commit `7221e7f`)

---

## สารบัญ
1. [ภาพรวม](#1-ภาพรวม)
2. [สิ่งที่ต้องติดตั้งบนเครื่อง](#2-สิ่งที่ต้องติดตั้งบนเครื่อง)
3. [สถาปัตยกรรม (Clean Architecture)](#3-สถาปัตยกรรม-clean-architecture)
4. [โครงสร้างโปรเจกต์](#4-โครงสร้างโปรเจกต์)
5. [เริ่มใช้งาน / พัฒนาต่อ (เฟส 1)](#5-เริ่มใช้งาน--พัฒนาต่อ-เฟส-1)
6. [Domain Model (รูปแบบข้อมูล JSON)](#6-domain-model-รูปแบบข้อมูล-json)
7. [กฎสวัสดิการ (Business Rules)](#7-กฎสวัสดิการ-business-rules)
8. [API Contract](#8-api-contract)
9. [Mock API](#9-mock-api)
10. [Design System & UX](#10-design-system--ux)
11. [หน้าจอ (Pages)](#11-หน้าจอ-pages)
12. [เฟส 2 — PHP Backend (PHP 5.2)](#12-เฟส-2--php-backend-php-526-บน-appserv--ทำแล้ว)
13. [MySQL Schema](#13-mysql-schema)
14. [นำขึ้น host / สลับจาก mock → MySQL](#14-นำขึ้น-host--สลับจาก-mock--mysql)
15. [การทดสอบ](#15-การทดสอบ)
16. [Checklist](#16-checklist)
17. [ประเด็นที่ต้องยืนยันกับ HR](#17-ประเด็นที่ต้องยืนยันกับ-hr)
18. [ประเด็นเปิด — backend / การเข้าสู่ระบบ](#18-ประเด็นเปิด--backend--การเข้าสู่ระบบ-ต้องตัดสินใจ)

---

## 1. ภาพรวม

ระบบกลางให้ HR จัดการสวัสดิการของทุกบริษัทในเครือ:

| โมดูล | ทำอะไร |
|---|---|
| เข้าสู่ระบบ | หน้า login (อนิเมชันเมื่อสำเร็จ), จดจำการเข้าสู่ระบบ, ออกจากระบบ · ชื่อผู้ใช้ถูกบันทึกในทุกกิจกรรม |
| ภาพรวม & ติดตามงาน | แท็บ **สรุป** (ตัวเลขหลัก) · **คิวงาน** (ทุกเรื่องที่ต้องทำ จัดระดับ ด่วน/ต้องทำ/ติดตาม) · **บันทึกกิจกรรม** + รีเฟรชอัตโนมัติ |
| พนักงาน | ทะเบียนพนักงาน (ตารางแบบ Excel) + หน้า "สิทธิสวัสดิการ" รายคน |
| ประกันกลุ่ม | แท็บ แจ้งออกทันที / แจ้งเข้า / แจ้งออก / ประวัติ (ตัวเลขรอส่งบนแท็บ) — คำนวณสิทธิ, ส่งออกไฟล์แจ้งทุกวันที่ 5 (พนักงานรายวันแยกรอบวันที่ 6), ประวัติ 1 รายการต่อการส่งออก 1 ครั้ง |
| ชุดฟอร์ม | สิทธิตามกลุ่ม/ระดับ/ตำแหน่ง, รายการค้างแจก, บันทึกการแจก + ไซซ์ |
| เงื่อนไขสวัสดิการ | แสดงกฎทั้งหมด (เฟส 3: แก้ไขได้) |
| หน่วยงาน | เพิ่ม/แก้/ลบหน่วยงาน, ได้ประกันกลุ่มไหม (แม่บ้าน CNS) และสีโปโล (Pro Site) |

**บริษัทในเครือ:** HL (แฮปปี้แลนด์), PRO, CNS, CIC, AS

**หลักการออกแบบ**
- **ไม่ต้อง build** — ไฟล์ที่เขียนคือไฟล์ที่ใช้งานจริง เบราว์เซอร์รัน `<script type="module">` ได้โดยตรง
- **1 หน้า = 1 ไฟล์ HTML** (`employees.html`) + **1 ไฟล์ JS** (`assets/js/pages/employees.js`) — โครงหน้าอยู่ใน HTML, JS เติมข้อมูล
- **Clean Architecture** — กฎสวัสดิการอยู่ใน `domain/` (ฟังก์ชันล้วน ไม่แตะ DOM/fetch/localStorage) ชั้นนอกพึ่งชั้นในเท่านั้น (ข้อ 3)
- หน้าจอเรียกข้อมูลผ่าน `api` ตัวเดียว (`assets/js/app/api.js`) → สลับ **mock ↔ PHP** ได้ด้วย `config.js` บรรทัดเดียว
- ตรรกะคำนวณสิทธิฝั่ง PHP ต้องมีตัวคู่แฝดที่ให้ผลเหมือนกัน (`backend/domain/`, `backend/usecases/`) — ตรวจด้วย golden test (ข้อ 15.3)
- กฎเก็บเป็น **ข้อมูล** (rule table) ไม่ hard-code ในหน้าจอ
- วันที่ใช้รูปแบบ ISO `YYYY-MM-DD` ทุกที่ คำนวณแบบ UTC เพื่อไม่ให้วันเลื่อน แสดงผลเป็น พ.ศ.
- UI ใช้ **design token** (CSS variables) ชุดเดียวใน `app.css` → โทนสว่าง/โหมดมืดสลับได้โดยไม่ต้องแก้หน้า (ข้อ 10)
- **Desktop สูงพอดีจอ** — หน้ารายการไม่ต้องเลื่อนทั้งหน้า ตารางยืดเต็มจอและเลื่อนภายในตัวเอง (ข้อ 10.8)
- **แนะนำการใช้งาน (driver.js)** ทุกหน้า เปิดอัตโนมัติครั้งแรก + ปุ่ม ? (ข้อ 10.10)
- **กรองคอลัมน์ที่หัวตาราง** แบบ Excel AutoFilter ทุกตาราง (ข้อ 10.4)
- **เข้าสู่ระบบ** ก่อนใช้งานทุกหน้า (ข้อ 10.9)
- ค่าใน HTML ที่มาจากข้อมูล **escape อัตโนมัติ** ผ่าน `html\`...\`` (กัน XSS)

---

## 2. สิ่งที่ต้องติดตั้งบนเครื่อง

| เครื่องมือ | เวอร์ชัน | ใช้ทำอะไร | จำเป็น? |
|---|---|---|---|
| Web server ใดก็ได้ | Apache / Nginx / IIS / `npx http-server` | เปิดหน้าเว็บ (ES modules ต้องเปิดผ่าน `http://` ไม่ใช่ดับเบิลคลิกไฟล์) | ✅ |
| เบราว์เซอร์ | Chrome / Edge / Firefox / Safari รุ่นปี 2023 ขึ้นไป | ใช้งาน | ✅ |
| Node.js | 20+ | **รันชุดทดสอบเท่านั้น** (`npm test`) — ไม่ต้องใช้บน host | ไม่บังคับ |
| PHP | 5.2.6+ (`mysqli`, `curl`, `hash`, `json`) — AppServ ตัวเดียวกับ stock_hr | backend | ✅ |
| MySQL | 5.0+ — เครื่องเดียวกับ stock_hr (ฐานข้อมูลแยก `hl_welfare`) | backend | ✅ |

> โค้ด backend เขียนให้รันบน **PHP 5.2.6 / MySQL 5.0 ของ AppServ** (ตัดสินใจ 19 ต.ค. 2569 ให้อยู่เครื่องเดียวกับ stock_hr) และใช้ได้กับ PHP/MySQL รุ่นใหม่กว่า — ข้อจำกัดดูข้อ 12.3

---

## 3. สถาปัตยกรรม (Clean Architecture)

### 3.1 ชั้น (Layers) และกฎการพึ่งพา

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  *.html + pages/*.js     หน้าจอ (โครง HTML + JS เติมข้อมูล)    │
   │  app/  shell, api         โครงหน้าร่วม + จุดเลือกแหล่งข้อมูล     │
   │  ui/   shared/            ชิ้นส่วน UI, format, label, icon    │
   │   ┌───────────────────────────────────────────────────────┐ │
   │   │ application/  สัญญา API (ports) + use-case + validation │ │
   │   │   ┌─────────────────────────────────────────────────┐ │ │
   │   │   │ domain/  กฎสวัสดิการ (ฟังก์ชันล้วน ไม่มี I/O)     │ │ │
   │   │   └─────────────────────────────────────────────────┘ │ │
   │   └───────────────────────────────────────────────────────┘ │
   │  infrastructure/  MockApi (localStorage) · HttpApi (fetch → PHP) │
   └─────────────────────────────────────────────────────────────┘
               ลูกศรการ import ชี้ "เข้าหาแกน" เท่านั้น
```

| ชั้น (โฟลเดอร์ใน `web/assets/js/`) | หน้าที่ | import ได้ | ห้าม import |
|---|---|---|---|
| `domain/` | กฎคำนวณสิทธิ (ประกัน / ชุดฟอร์ม), วันที่, คำศัพท์ภาษาไทยของ enum, `types.js` (JSDoc) | `domain` เท่านั้น | DOM, `fetch`, `localStorage`, ชั้นอื่นทั้งหมด |
| `application/` | `ports.js` (สัญญา API), `errors.js` (`ApiError`), `usecases/` (dashboard, รอบประกัน, ชุดค้างแจก, คิวงาน), `employeeRules.js` (validate) | `domain` | `infrastructure`, `ui`, `pages` |
| `infrastructure/` | adapter ที่ทำตามสัญญา: `mock/` (ข้อมูลจำลอง) และ `http/` (เรียก PHP) | `application`, `domain` | `ui`, `pages` |
| `shared/` | `dom.js` (html, render, on), `format.js`, `labels.js`, `csv.js`, `excel.js` (เขียน .xlsx ด้วย ExcelJS), `icons.js` | `domain` | `infrastructure`, `pages` |
| `ui/` | ชิ้นส่วน UI: components, table, datagrid (Excel), combobox, overlay (modal/toast) — **ไม่รู้จักกฎสวัสดิการ** | `shared` | `domain`, `application`, `infrastructure` |
| `app/` | `api.js` (เลือก Mock/Http จาก `config.js`), `shell.js` (sidebar/topbar/ธีม) | ทุกชั้น | – |
| `pages/` | โค้ดของแต่ละหน้า ใช้ข้อมูลผ่าน `api` เท่านั้น | `app`, `application`, `domain`, `ui`, `shared` | `infrastructure` (ต้องผ่าน `app/api.js`) |

**ผลลัพธ์ที่ได้**
- เปลี่ยน mock → PHP ได้โดยแก้ `config.js` บรรทัดเดียว หน้าจอไม่ต้องแก้
- ทดสอบกฎสวัสดิการได้ด้วย `node --test` โดยไม่ต้องเปิดเบราว์เซอร์/DB
- ปรับหน้าตา (design token ใน `app.css`) ได้โดยไม่กระทบตรรกะ

### 3.2 การไหลของข้อมูล (ตัวอย่าง: เปิด `employee.html?id=5`)

```text
pages/employee.js ──import { api }──▶ app/api.js ── config.apiMode ──┐
                                                                    │
                ┌───────────────────────────────────────────────────┴───┐
         MockApi (mock)                                           HttpApi (http)
         อ่าน localStorage                                         GET api/employees/5/benefits
         เรียก domain/eligibility.js → benefitsOf()                      │
                                                                  PHP EmployeeController
                                                                  → BenefitService (Application)
                                                                  → Domain\Eligibility (คู่แฝด JS)
                                                                  → PdoEmployeeRepository
```

### 3.3 ฝั่ง PHP ใช้ชั้นเดียวกัน

| ชั้น | โฟลเดอร์ (PHP 5.2 — ฟังก์ชันล้วน แบบ stock_hr) | ตัวอย่าง |
|---|---|---|
| Domain | `backend/domain/` | `insurance_status()`, `uniform_status()` (คู่แฝดของ JS — pure, ไม่แตะ DB) |
| Application | `backend/usecases/` | `build_insurance_cycle()`, `build_work_queue()`, `build_insurer_export()` |
| Infrastructure | `backend/lib/`, `backend/repo/`, `backend/api/stock_client.php` | `db_all()`, `repo_world()`, `stock_call()` |
| Interface (HTTP) | `web/api/index.php`, `backend/api/`, `backend/auth.php` | `api_routes()`, `api_*()` (บาง — อ่านคำขอ → เรียกชั้นล่าง → JSON) |

---

## 4. โครงสร้างโปรเจกต์

```text
hl-welfare/
├── happyland-welfare-spec.md          ← ไฟล์นี้
├── package.json                       ← ใช้เฉพาะ `npm test` (ไม่มี dependency)
├── tests/                             ← ทดสอบกฎสวัสดิการด้วย node:test
│   ├── _expect.js                     ← ตัวช่วย expect(...).toBe(...)
│   ├── eligibility.test.js            ← ประกัน / ชุดฟอร์ม / seed
│   └── mockApi.test.js                ← validation 409/422/404, CRUD, คิวงาน, กิจกรรม
│
├── web/                               ← ★ อัปโหลดทั้งโฟลเดอร์นี้ขึ้น host
│   ├── login.html                     ← เข้าสู่ระบบ (ไม่มี sidebar)
│   ├── index.html                     ← ภาพรวม & ติดตามงาน (?tab=summary|queue|activity)
│   ├── monitor.html                   ← (เดิม) พาไป index.html?tab=queue ให้ลิงก์เก่ายังใช้ได้
│   ├── employees.html                 ← พนักงาน (ตาราง Excel)
│   ├── employee.html                  ← รายละเอียดพนักงาน (?id=)
│   ├── insurance.html                 ← ประกันกลุ่ม (?cycle=&tab=urgent|in|out|history&batch=) + ส่งออกไฟล์แจ้งประกัน
│   ├── uniform.html                   ← ชุดฟอร์ม (?tab=history)
│   ├── rules.html                     ← เงื่อนไขสวัสดิการ (?tab=)
│   ├── sites.html                     ← หน่วยงาน (ตาราง Excel)
│   ├── insurers.html                  ← แบบฟอร์มประกัน: ตั้งค่าไฟล์ Excel ของแต่ละบริษัทประกัน (?id=)
│   ├── .htaccess                      ← Cache-Control: no-cache (เบราว์เซอร์ตรวจไฟล์ใหม่หลังอัปเดต)
│   ├── favicon.svg
│   └── assets/
│       ├── css/app.css                ← design tokens (gradient น้ำเงิน→เขียว) + ทุก component + ธีม tour
│       ├── css/login.css              ← หน้าเข้าสู่ระบบ + อนิเมชัน
│       ├── vendor/driver.js/          ← driver.js 1.8.0 (MIT) เก็บในโปรเจกต์ ไม่ต้องพึ่ง CDN
│       ├── vendor/exceljs/            ← ExcelJS 4.4.0 (MIT) อ่าน/เขียน .xlsx พร้อมรูปแบบ — โหลดเมื่อใช้ครั้งแรก
│       ├── vendor/sheetjs/            ← SheetJS 0.18.5 (Apache-2.0) แปลงไฟล์ .xls → .xlsx ตอนอัปโหลด — โหลดเมื่อใช้ครั้งแรก
│       ├── templates/                 ← ไฟล์แบบฟอร์มตั้งต้น (thai-life.xlsx, muang-thai.xlsx) โครงเดียวกับไฟล์ของ HR ไม่มีข้อมูลบุคคล
│       └── js/
│           ├── config.js              ← ★ ตั้งค่า: apiMode 'mock' | 'http', apiBaseUrl, auth (เปิด/ปิด login, อายุ session)
│           ├── domain/                ← ① กฎสวัสดิการ (pure)
│           │   ├── types.js           ← ชนิดข้อมูล (JSDoc) ให้ VS Code ช่วยเติมคำ
│           │   ├── date.js            ← addDays, ageAt, nextCycleDate, diffDays (UTC)
│           │   ├── labels.js          ← คำภาษาไทยของ enum
│           │   ├── insurance.js       ← insuranceStatus, insuranceExit
│           │   ├── insurerForm.js     ← แหล่งข้อมูลคอลัมน์, รูปแบบวันที่, ตัวแปร {…} ของแบบฟอร์มประกัน
│           │   ├── thaiId.js          ← ตรวจ/จัดรูปแบบเลขบัตรประชาชน 13 หลัก
│           │   ├── uniform.js         ← matchUniformRule, resolveItems, uniformStatus
│           │   └── eligibility.js     ← benefitsOf() + re-export
│           ├── application/           ← ② สัญญา + use-case
│           │   ├── ports.js           ← WelfareApi (JSDoc)
│           │   ├── errors.js          ← ApiError(message, status)
│           │   ├── employeeRules.js   ← validateEmployee, normalizeEmployee
│           │   ├── insurerFormRules.js ← validateInsurerForm, blankInsurerForm
│           │   └── usecases/          ← dashboard, insuranceCycle, insurerExport (ใครอยู่ในไฟล์ + ค่าในเซลล์), templateDetect (อ่านตำแหน่งในไฟล์แบบฟอร์ม), uniformPending, workQueue
│           ├── infrastructure/        ← ③ adapter
│           │   ├── mock/              ← rules.js (กฎตั้งต้น), insurers.js (แบบฟอร์มตั้งต้น 2 บริษัทประกัน), seed.js (ข้อมูลจำลอง), users.js (ผู้ใช้ทดลอง), mockApi.js
│           │   └── http/              ← httpApi.js (fetch → PHP), serverAuth.js (login/refresh/401), stockGateway.js (โหมด mock)
│           ├── shared/                ← ④ dom.js, format.js, labels.js, csv.js, excel.js, icons.js
│           ├── ui/                    ← ⑤ ชิ้นส่วน UI
│           │   ├── components.js      ← badge, card, statCard, emptyState, alertBox, avatar, tabs …
│           │   ├── table.js           ← DataTable (อ่านอย่างเดียว) + pager
│           │   ├── datagrid.js        ← ExcelGrid (แก้ไขในตาราง)
│           │   ├── combobox.js        ← <select data-combobox> ค้นหาได้
│           │   ├── columnFilter.js    ← กรอง/เรียงที่หัวคอลัมน์ (ใช้ใน table.js และ datagrid.js)
│           │   ├── loading.js         ← progress (loading กลางจอ · quiet = งานเบื้องหลัง), loader, spinner, busy
│           │   ├── sheetPreview.js    ← แสดงชีต Excel เป็นตาราง (ระบายสีส่วน/คอลัมน์/เซลล์อัตโนมัติ)
│           │   └── overlay.js         ← toast, openModal, confirmAction
│           ├── app/                   ← ⑥ api.js, auth.js (session/login/logout), shell.js, tour.js, excelTemplate.js (อ่าน/ล้าง/เติมไฟล์แบบฟอร์ม)
│           ├── tour/                  ← ★ แนะนำการใช้งาน (driver.js) — dev ปรับได้
│           │   ├── tour.config.js     ← ตั้งค่า: เปิด/ปิด, เปิดอัตโนมัติ, ข้อความปุ่ม, สีพื้นหลัง ฯลฯ
│           │   └── steps.js           ← เนื้อหาแนะนำของแต่ละหน้า
│           └── pages/                 ← ⑦ โค้ดของแต่ละหน้า (ชื่อเดียวกับไฟล์ HTML)
│               ├── _shared.js         ← บันทึกแจกชุด, ไทม์ไลน์กิจกรรม
│               └── login.js  dashboard.js  employees.js  employee.js
│                   insurance.js  uniform.js  rules.js  sites.js
│
│       └── api/index.php              ← ทางเข้าเดียวของ API (ส่งต่อให้ backend/)
│
├── backend/                           ← PHP 5.2 + MySQL 5.0 (ข้อ 12)
│   ├── bootstrap.php  config.example.php  .htaccess (Deny from all)
│   ├── lib/  domain/  usecases/  repo/  api/  auth.php
│   ├── sql/  001_schema.sql  002_seed_master.sql  003_seed_demo.sql
│   ├── bin/user.php
│   └── tests/run.php  fixtures/golden.json
├── scripts/export-seed.mjs            ← seed + golden จาก mock
│
└── .gitignore
```

---

## 5. เริ่มใช้งาน / พัฒนาต่อ (เฟส 1)

### 5.1 เปิดดูบนเครื่อง
ต้องเปิดผ่าน web server (ES modules ไม่ทำงานเมื่อดับเบิลคลิกไฟล์ `file://`)

| วิธี | คำสั่ง / URL |
|---|---|
| AppServ / XAMPP / Laragon (วางโปรเจกต์ใน `www`) | `http://localhost/hl-welfare/web/` |
| ไม่มี web server แต่มี Node.js | `npm run serve` → `http://localhost:8080/` |
| VS Code | ติดตั้ง extension **Live Server** → คลิกขวา `web/index.html` → Open with Live Server |

### 5.2 ตั้งค่า (`web/assets/js/config.js`)
```js
export const CONFIG = {
  apiMode: 'http',        // 'http' = PHP + MySQL (ใช้งานจริง) · 'mock' = ข้อมูลจำลองในเบราว์เซอร์ (ทดลอง/เทสต์)
  apiBaseUrl: 'api/index.php', // URL ของ PHP API (relative จากหน้าเว็บ · ไม่ต้องเปิด mod_rewrite)
  auth: {
    enabled: true,         // false = ไม่ต้อง login (เข้าเป็น "ผู้ใช้ทั่วไป")
    sessionHours: 12,      // อายุการเข้าสู่ระบบ
    showDemoAccounts: true,// แสดงบัญชีทดลองบนหน้า login (เฉพาะ mock)
    forgotPasswordText: '…',
  },
};
```

### 5.3 หน้าและพารามิเตอร์ใน URL
| ไฟล์ | หน้า | พารามิเตอร์ |
|---|---|---|
| `login.html` | เข้าสู่ระบบ | `?next=หน้า.html` (กลับหน้าเดิมหลัง login), `?bye=1` |
| `index.html` | ภาพรวม & ติดตามงาน | `?tab=summary\|queue\|activity` · แท็บคิวงานรับ `&severity=critical\|warning\|info&kind=` |
| `monitor.html` | (เดิม) พาไปแท็บคิวงาน | ส่งต่อ query เดิม |
| `employees.html` | พนักงาน | `?q=&company=&type=&status=&page=` |
| `employee.html` | รายละเอียดพนักงาน | `?id=` (จำเป็น) |
| `insurance.html` | ประกันกลุ่ม | `?cycle=YYYY-MM-05&tab=urgent\|in\|out\|history` (ไม่ระบุ tab = แท็บแรกที่มีรายการรอส่ง) |
| `?tab=members\|waiting\|left` |
| `uniform.html` | ชุดฟอร์ม | `?tab=history` |
| `rules.html` | เงื่อนไขสวัสดิการ | `?tab=insurance\|uniform\|settings\|open` |
| `sites.html` | หน่วยงาน | – |
| `admin.html` | ผู้ใช้ระบบ / กำหนดสิทธิ์การใช้งาน / ระบบ & ความปลอดภัย (ตามสิทธิ์ ข้อ 12.5) | `?tab=users\|permissions\|system\|access\|health\|settings\|audit` · แท็บบันทึกการใช้งานรับ `&entity=&action=&user=&q=&from=&to=` |
| `account.html` | บัญชีของฉัน: เปลี่ยนรหัสผ่าน + ขนาดตัวอักษร (ทุกคน) | `#password` · `#font` · `?force=1&next=หน้าเดิม` (ต้องตั้งรหัสเองก่อนใช้งาน) |
| `insurers.html` | แบบฟอร์มประกัน (ตั้งค่า) | `?id=<id>` หรือ `?id=new` |

### 5.4 เพิ่มหน้าใหม่ (ตัวอย่าง `reports.html`)
1. คัดลอก `sites.html` → `reports.html` แก้ `<title>`, `<h1>`, เนื้อหาใน `<main id="page">` และเปลี่ยน `<script src="assets/js/pages/reports.js">` (สคริปต์ใน `<head>` ที่ตรวจการเข้าสู่ระบบติดมาด้วย — อย่าลบ)
2. สร้าง `assets/js/pages/reports.js`
   ```js
   import { api } from '../app/api.js';
   import { initPage } from '../app/shell.js';
   import { $, html, render } from '../shared/dom.js';
   import { DataTable } from '../ui/table.js';

   initPage('reports');                         // ตรวจ login + สร้าง sidebar/topbar + แปลง icon/select ในหน้า
   const table = new DataTable($('#list'), {
     rowKey: (r) => r.id,
     pageSize: 25,
     columns: [{ key: 'name', header: 'ชื่อ', cell: (r) => html`<b>${r.name}</b>` }],
   });
   table.setRows(await api.listSites());
   ```
3. เพิ่มเมนูใน `MENU` หรือ `SETTINGS` ของ `assets/js/app/shell.js`

### 5.5 กฎการเขียนโค้ด (สำหรับทีม)
- สร้าง HTML ด้วย `html\`...\`` เสมอ (ค่าใน `${}` ถูก escape อัตโนมัติ) — ใช้ `raw()` เฉพาะ HTML ที่เราสร้างเอง เช่น `icon()`
- ผูก event กับปุ่มที่ render ใหม่บ่อย ๆ ด้วย `on(container, 'click', '[data-action="x"]', fn)` (event delegation)
- เก็บตัวกรอง/แท็บ/หน้า ใน URL ด้วย `getParam()` / `setParams()` → แชร์ลิงก์และกด back ได้
- หน้าจอห้าม import `infrastructure/` ตรง ๆ ให้ใช้ `api` จาก `app/api.js`
- ทุกครั้งที่แก้กฎสวัสดิการใน `domain/` ให้รัน `npm test`

---

## 6. Domain Model (รูปแบบข้อมูล JSON)

รูปแบบข้อมูลที่ทุกชั้นใช้ร่วมกัน — **JSON จาก PHP ต้องใช้ชื่อ field แบบ camelCase ตรงกับนี้**
เขียนด้วยไวยากรณ์ TypeScript เพื่อให้อ่านง่าย · ในโค้ดจริงอยู่ที่ `web/assets/js/domain/types.js` (JSDoc — VS Code ใช้ช่วยเติมคำ/ตรวจชนิดข้อมูล)

```ts
export type CompanyCode = 'HL' | 'PRO' | 'CNS' | 'CIC' | 'AS';
export type EmployeeType = 'CENTRAL' | 'PRO_SITE' | 'DAILY' | 'MAID_CNS';
export type ContractType = 'REGULAR' | 'SHORT_3PCT';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE';
export type EndReason = 'RESIGN' | 'ABSENT_3D' | 'TERMINATED' | 'MISCONDUCT';
export type ISODate = string; // YYYY-MM-DD

export interface Company { code: CompanyCode; name: string; legalName: string; } // legalName ใช้ในชีตสรุปของไฟล์แจ้งประกัน

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
  deptGroup: string | null;        // กลุ่มพนักงาน/ฝ่าย (ส่วนกลาง) — ชื่อจากรายการ dept_groups (sql/014) · บังคับเมื่อเป็นส่วนกลาง
  position: string | null;         // ตำแหน่ง (Pro Site)
  level: number | null;
  salary: number;
  birthDate: ISODate;
  startDate: ISODate;
  probationPassDate: ISODate | null;  // ว่าง = ระบบเติมให้ตอนบันทึก: วันเริ่มงาน + 119 วัน (domain/employee.js · PHP probation_due_date) · แก้เองได้ (เช่น ขยายทดลองงาน)
  status: EmployeeStatus;
  lastWorkingDate: ISODate | null;
  endDate: ISODate | null;
  endReason: EndReason | null;
  // ข้อมูลสำหรับไฟล์แจ้งบริษัทประกัน (ไม่บังคับ — ว่างแล้วหน้าส่งออกจะเตือน)
  title: 'นาย' | 'นาง' | 'นางสาว' | null;
  gender: 'M' | 'F' | null;
  nationalId: string | null;       // 13 หลัก ตรวจ check digit (domain/thaiId.js)
  phone: string | null;            // 0 + 8–9 หลัก
  email: string | null;
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

export type UniformItemCode = 'POLO_BLACK' | 'POLO_NAVY' | 'TECH_SHIRT' | 'TECH_PANTS' | 'SAFETY_SHOES';
export interface UniformItem { code: UniformItemCode; name: string; }

export interface UniformRule {
  id: number;
  employeeType: EmployeeType;
  companies: CompanyCode[];
  deptGroups: string[] | null;     // null = ไม่อ้างอิงฝ่าย · ชื่อจากรายการ dept_groups
  position: string | null;         // null = ไม่อ้างอิงตำแหน่ง — ฟอร์มกฎไม่มีช่องพิมพ์แล้ว (กฎใหม่ = null · กฎเดิมที่มีตำแหน่ง แสดงเป็นช่องติ๊ก "ใช้เฉพาะตำแหน่ง" เอาออกได้)
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
  insuranceCycleDay: number;       // 5 — รอบแจ้งประกันของพนักงานทุกประเภทยกเว้นรายวัน
  insuranceCycleDayDaily?: number; // 6 — พนักงานรายวัน (DAILY) ส่งแจ้งแยกรอบ (ไม่กำหนด = ใช้ insuranceCycleDay)
  absentExtraDays: number;         // 7
  uniformAnnualMonth: number;      // เดือนที่แจกประจำปี (1 = ม.ค.)
}

export interface RuleSet {
  insurance: InsuranceRule[];
  uniform: UniformRule[];
  uniformItems: UniformItem[];
  settings: Settings;
}

// ----- Computed -----
export interface InsuranceStatus {
  eligible: boolean;
  reasons: string[];               // เหตุผลที่ไม่มีสิทธิ (ภาษาไทย)
  eligibleDate: ISODate | null;    // วันที่ครบอายุงาน
  enrollCycleDate: ISODate | null; // รอบที่จะแจ้งเข้า (วันที่ 5 · รายวัน = วันที่ 6)
  exitDate: ISODate | null;        // วันที่มีผลออก
  exitCycleDate: ISODate | null;
  exitUrgent: boolean;             // เลิกจ้าง/ทำผิด = แจ้งทันที
  ruleId: number | null;
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

/** ประวัติการส่งออก 1 รายการ = ส่งออกไฟล์ 1 ครั้ง (1 บริษัทประกัน · 1 รอบ) — มีทั้งคนเข้าและคนออกในรายการเดียว */
export interface InsuranceBatch {
  id: number;
  cycleDate: ISODate;
  items: { employeeId: number; type: BatchType }[];
  submittedAt: string;
  submittedBy: string;
  insurerId: number | null;        // ส่งออกให้แบบฟอร์ม/บริษัทประกันไหน
  insurerName: string | null;      // เก็บชื่อไว้ในตัว — ลบแบบฟอร์มแล้วประวัติไม่หาย
  employees?: EmployeeLite[];      // แนบมาใน GET /insurance/batches — แสดงตัวอย่างชื่อ + ค้นหา
}

/** แบบฟอร์ม Excel ของบริษัทประกัน 1 ราย (หน้า insurers.html) — ดูข้อ 7.4 */
export interface InsurerForm {
  id: number;
  name: string;                    // บริษัท ไทยประกันชีวิต จำกัด (มหาชน)
  shortName: string;               // ใช้ในชื่อไฟล์/หน้าส่งออก
  active: boolean;                 // ปิด = ไม่แสดงในหน้าส่งออก (เปิดใช้ได้เมื่อมีไฟล์แบบฟอร์ม)
  companies: { companyCode: CompanyCode; policyNo: string; holderName: string; plan: string }[]; // ผูกที่ตาราง "บริษัทในเครือส่งแจ้งกับบริษัทประกันไหน"
  dateFormat: 'DD/MM/YYYY' | 'D/M/YYYY' | 'D/M/YY';
  dateEra: 'BE' | 'CE';
  inMark: string; outMark: string; // เครื่องหมายในช่องเข้าใหม่/ลาออก เช่น "✓" (ค่าเริ่มต้น · ช่องที่ใช้ฟอนต์ Wingdings เขียนเป็นตัวอักษรของฟอนต์นั้นให้)
  sheetName: string;               // ชื่อชีตต่อบริษัท เช่น "{companyCode}"
  fileName: string;                // เช่น "แจ้งเข้า-ออก {insurer} {cycleDate}"
  includeEmptySheets: boolean;
  signer: { name: string; department: string; phone: string };
  template: InsurerTemplate | null; // ไฟล์ Excel ที่ HR อัปโหลด
}

/** ไฟล์แบบฟอร์ม + ตำแหน่งที่ระบบอ่านให้ (แก้ได้) — แถว/คอลัมน์เริ่มที่ 1 แบบ Excel */
export interface TemplateLayout {
  sheet: string;                   // ชื่อชีตในไฟล์
  headerRow: number; headerEnd: number; // หัวตาราง (หลายแถวได้)
  dataRow: number;                 // แถวข้อมูลต้นแบบ — ทุกแถวที่สร้างใช้รูปแบบแถวนี้
  footerRow: number;               // ส่วนท้ายเริ่มแถวนี้ — เลื่อนลงตามจำนวนคน
  columns: { col: number; header: string; group: string; source: ColumnSource | SummarySource; only: '' | 'IN' | 'OUT' }[];
  cells: Record<string, string>;   // { 'C6': '{policyNo}', 'A5': 'ชื่อนายจ้าง / ผู้ถือกรมธรรม์  {companyName}' }
}
export interface InsurerTemplate extends TemplateLayout {
  fileName: string;
  data?: string;                   // ไฟล์ .xlsx (base64) หลังล้างข้อมูลบุคคล — หรือ
  url?: string;                    // ไฟล์ตั้งต้นใน assets/templates/
  converted: boolean;              // แปลงจาก .xls
  uploadedAt: string | null; uploadedBy: string;
  summary: TemplateLayout | null;  // ชีตสรุป (1 แถว = 1 บริษัท)
}

/** POST /insurance/exports — ข้อมูลสำหรับสร้างไฟล์ (usecase: buildInsurerExport) */
export interface InsurerExport {
  cycleDate: ISODate;
  insurer: InsurerForm;
  companies: (InsurerForm['companies'][number] & { companyName: string; in: InsuranceCycleRow[]; out: InsuranceCycleRow[] })[];
  missing: { employee: Employee; fields: ('title' | 'gender' | 'nationalId')[] }[]; // แถวเข้าใหม่ที่ข้อมูลไม่ครบ
  alreadyExported: number;
  batches: InsuranceBatch[];       // batch ที่สร้าง (record = true)
  batchId?: number;                // GET /insurance/batches/{id}/export — ไฟล์ของการส่งออกครั้งนั้น (usecase: buildBatchExport)
}

/** ข้อมูลพนักงานแบบย่อ (ไม่มีเงินเดือน/วันเกิด) */
export interface EmployeeLite {
  id: number; empCode: string; firstName: string; lastName: string;
  companyCode: CompanyCode; employeeType: EmployeeType; siteId: number; status: EmployeeStatus;
}

/** GET /insurance/batches/{id} — รายชื่อใน batch (usecase: buildBatchDetail) */
export interface InsuranceBatchDetail extends Omit<InsuranceBatch, 'items'> {
  items: {
    type: BatchType;                 // แจ้งเข้า / แจ้งออก / แจ้งออกทันที (badge ต่อแถว)
    employee: EmployeeLite;
    siteName: string;
    effectiveDate: ISODate | null;   // IN = วันครบสิทธิ · OUT/URGENT = วันมีผลการออก (คำนวณแบบเดียวกับหน้ารอบที่ส่ง)
    reason: string;
  }[];                               // เรียง แจ้งออกทันที → แจ้งเข้า → แจ้งออก แล้วตามรหัสพนักงาน
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

export interface DashboardData {
  today: ISODate;
  activeByCompany: { companyCode: CompanyCode; count: number }[];
  activeTotal: number;
  nextCycleDate: ISODate;
  nextCycleIn: number;
  nextCycleOut: number;
  urgentPending: number;
  upcomingEligible: { employee: Employee; benefit: 'INSURANCE'; date: ISODate }[];
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
   enrollCycleDate = วันที่ 5 แรกที่ >= eligibleDate  (พนักงานรายวัน: วันที่ 6 — settings.insuranceCycleDayDaily)
5. ถ้าพ้นสภาพ และ exitDate < enrollCycleDate → ไม่ต้องแจ้งเข้า/ออก
6. อายุ ณ enrollCycleDate > 65 → ไม่มีสิทธิ
7. มีสิทธิ + คำนวณการแจ้งออก (ถ้ามี endReason)
```

**การแจ้งออก `insuranceExit(emp)`**

| endReason | exitDate | exitCycleDate | urgent |
|---|---|---|---|
| RESIGN ลาออก | endDate | วันที่ 5 แรกที่ >= exitDate (รายวัน: วันที่ 6) | ❌ |
| ABSENT_3D ขาดงาน 3 วันติด | lastWorkingDate **+ 7 วัน** | วันที่ 5 แรกที่ >= exitDate (รายวัน: วันที่ 6) | ❌ |
| TERMINATED เลิกจ้าง | endDate | = exitDate | ✅ แจ้งทันที |
| MISCONDUCT กระทำผิด | endDate | = exitDate | ✅ แจ้งทันที |

**รายการรอบ `insuranceCycle(cycleDate, employees, sites, rules, batches)`**
- `IN`: พนักงานที่มีสิทธิ และ `enrollCycleDate <= cycleDate` ที่ยังไม่ถูกส่ง (ตกค้างจากรอบก่อนก็แสดง) + ที่ส่งแล้วในรอบนี้
- `OUT`: `exitCycleDate <= cycleDate` ที่ยังไม่ส่ง + ที่ส่งแล้วในรอบนี้
- `URGENT`: แจ้งออกทันทีที่ยังไม่ส่ง แสดงทุกรอบจนกว่าจะส่ง
- พนักงานถูกแจ้งเข้าได้ครั้งเดียว และแจ้งออกได้ครั้งเดียว (ส่งซ้ำ → error)
- "ส่งแล้ว" = อยู่ในไฟล์ที่**ส่งออกแบบบันทึกว่าแจ้งแล้ว** (ข้อ 7.4) — ไม่มีปุ่ม "ส่งแจ้ง" แยกอีกต่อไป

### 7.2 กองทุนสำรองเลี้ยงชีพ — นอกขอบเขต
ระบบนี้**ไม่จัดการ**กองทุนสำรองเลี้ยงชีพ (ตัดออกแล้ว: เมนู, หน้า `pvd.html`, กฎในหน้าเงื่อนไข, การ์ดในหน้าพนักงาน, รายการ "จะครบสิทธิ" ในภาพรวม, API `/api/pvd/members`) · คงเลขข้อไว้เพื่อให้การอ้างอิงข้อ 7.3 / 7.4 ไม่เปลี่ยน

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

### 7.4 ส่งออกไฟล์แจ้งบริษัทประกัน — เติมลงไฟล์แบบฟอร์มที่ HR อัปโหลด
HR ใช้บริษัทประกันหลัก 2 ราย แต่ละรายมี**ไฟล์ Excel แบบฟอร์มของตัวเอง** — ระบบไม่สร้างหน้าตาไฟล์เอง แต่ **เติมรายชื่อลงไฟล์แบบฟอร์มนั้น** (คงตัวอักษร เส้นขอบ merge ความกว้าง หมายเหตุ ช่องลงนาม ทุกอย่าง)

**หน้าแก้แบบฟอร์ม (`insurers.html?id=new` / `?id=<id>`)** — แนวคิด: ใช้**ไฟล์ต้นฉบับ**ของบริษัทประกัน ระบบเติมข้อมูลลงไฟล์นั้น ไม่สร้างแบบฟอร์มใหม่ · **ไม่มีหน้าแก้ตำแหน่งข้อมูล** — ระบบหาจุดที่ต้องเติมเองตอนอัปโหลด · **หน้าเดียว 2 กล่อง (ไม่มีขั้นตอน)**: **กล่องซ้าย** = อัปโหลดไฟล์ + การตั้งค่าทั้งหมด (เลื่อนในกล่อง) · **กล่องขวา** = ตัวอย่างไฟล์ที่เติมข้อมูลสมมติแล้ว — เติมเองตอนเปิด/อัปโหลด และ**อัปเดตเองเมื่อแก้การตั้งค่า** (หน่วง 0.5 วินาทีระหว่างพิมพ์ · ชื่อไฟล์ไม่ทำให้เติมใหม่ · คงชีต/ตำแหน่งเลื่อนเดิม) · ยังไม่มีไฟล์ → กล่องขวาแสดงคำอธิบาย 3 ข้อ (ไฟล์ตัวจริง → ระบบหาจุดที่ต้องเติมเอง → ส่งออก = เติมรายชื่อลงไฟล์นี้) · จอ ≥1024px ซ้าย-ขวาพอดีจอ (ซ้ายกว้าง ~34%) · จอเล็กต่อกันลงมา · ลิงก์เก่า `?step=` ถูกล้าง
1. **ไฟล์ Excel ของบริษัทประกัน** — อัปโหลดไฟล์ที่ใช้ส่งจริง (.xlsx แนะนำ / .xls แปลงด้วย SheetJS) → ระบบหาจุดเติมข้อมูลให้ (`templateDetect.js`) แล้วแสดง**สรุป**: ชีตที่ใช้ · คอลัมน์ที่เติมรายชื่อ (ป้ายสีเขียว) · ช่องที่เติม (เลขกรมธรรม์ เดือน ผู้แจ้ง ฯลฯ ป้ายสีม่วง) · ไฟล์ที่ไม่พบตารางรายชื่อ → แจ้งว่าไม่ใช่ไฟล์แบบฟอร์ม (ไม่รับ) · ไฟล์ที่เก็บไว้ดาวน์โหลดกลับได้ · มีไฟล์แล้ว ช่องอัปโหลดย่อเหลือแถวเดียว
2. **การตั้งค่า** (ใต้ไฟล์ในกล่องซ้าย) — เปิดใช้, รูปแบบวันที่, เครื่องหมาย, ชื่อไฟล์/ชีต, ผู้แจ้ง → ดูผลที่กล่องขวา (ข้อมูลสมมติ 3 คน เข้า 2 · ออก 1 · แท็บชีต) · ปุ่ม **"เปิดใน Excel"** ดาวน์โหลดไฟล์ตัวอย่าง (ตัวอย่างในหน้าเป็นแบบโดยประมาณ)
3. **บันทึก** → ล้างรายชื่อพนักงานในไฟล์ (ข้อมูลบุคคล) + เซลล์ที่ระบบเติม + ชีตที่ไม่ใช้ แล้วเก็บไฟล์ (`sanitizeTemplate`)
4. **ผูกบริษัท** ที่ตาราง "บริษัทในเครือส่งแจ้งกับบริษัทประกันไหน" (1 บริษัท = 1 บริษัทประกัน + เลขกรมธรรม์ + ผู้ถือกรมธรรม์ + แผน) → `saveInsurerBindings`

**ระบบอ่านตำแหน่งอย่างไร (`detectLayout`)**

| ส่วน | วิธีหา |
|---|---|
| หัวตาราง | แถวที่มีคำหัวตารางมากที่สุด (ลำดับ รหัสพนักงาน ชื่อ เกิด บัตรประชาชน เข้าใหม่ ลาออก …) แล้วขยายขึ้น/ลงตาม merge แนวตั้ง |
| กลุ่ม / ชื่อคอลัมน์ | เซลล์ที่ merge กว้างหลายคอลัมน์ = กลุ่ม (เช่น "ประกันชีวิตกลุ่ม…", "เข้าใหม่") · เซลล์คอลัมน์เดียวซ้อนกัน = ชื่อคอลัมน์ต่อกัน |
| ข้อมูลของคอลัมน์ | จากคำในหัว: บัตร → เลขบัตร (เฉพาะเข้า) · เกิด → วันเกิด (เฉพาะเข้า) · วันที่มีผล ใต้ "เข้าใหม่"/"ยกเลิก" → วันมีผลเฉพาะเข้า/ออก · เข้าใหม่/ลาออก → เครื่องหมาย · เปลี่ยนแปลง/ธนาคาร/หมายเหตุ → ว่าง |
| แถวข้อมูล / ส่วนท้าย | แถวถัดจากหัวตาราง · ส่วนท้าย = แถวแรกที่ขึ้นต้น หมายเหตุ / ลงชื่อ / ผู้แจ้ง / เข้าใหม่ … คน (รวมแถวว่างที่คั่น) |
| เซลล์ที่เติมอัตโนมัติ | ป้ายต้นเซลล์ → เซลล์ทางขวา หรือส่วนที่เว้นไว้กรอกในเซลล์เดียวกัน: เลขที่กรมธรรม์ → `{policyNo}` · ผู้ถือกรมธรรม์/ชื่อนายจ้าง → `{companyName}` · ประจำเดือน → `{month}` · วันที่แจ้ง → `{exportDate}` · ผู้แจ้ง/โทร/แผนก → ผู้แจ้ง · เข้าใหม่/ลาออก/รวมทั้งหมด (ท้าย) → จำนวน |
| ชีตสรุป | ชีตชื่อ "สรุป" ที่มีหัว ลำดับ/สังกัด/ตัวย่อ/แจ้งเข้า/แจ้งออก/รวม · แถว "รวม" = ส่วนท้าย (เติมยอดรวม) |
| ชีตต้นแบบ | ชีตบริษัทที่มีคำหัวตารางมากที่สุด · เสมอกัน → ชีตที่มีแถวตัวอย่างมากที่สุด |

**กรณีที่พบในไฟล์จริงของ HR** (ทดสอบใน `tests/excelTemplate.test.js`)
- กลุ่มที่**ไม่ได้ merge** แต่มีหัวย่อยด้านล่างหลายคอลัมน์ (เช่น "เปลี่ยนแปลง") → นับเป็นกลุ่มที่กว้างจนสุดเซลล์ว่าง (`virtualGroups`)
- ช่องจำนวนว่างระหว่างป้ายกับ "คน" (`เข้าใหม่ | _ | คน`) → เติมในช่องว่างแรก
- ป้ายผู้แจ้งซ้ำ 2 เซลล์ / ป้าย "ฝ่าย" ระหว่างป้ายกับช่องกรอก → ข้ามเซลล์ที่เป็นป้าย
- ไฟล์ .xls ที่จัดรูปแบบไว้ถึงแถว 65,000 → ใช้เฉพาะช่วงที่มีค่า/merge จริง (`usedExtent`) ไฟล์ที่เก็บเหลือ ~10KB
- ค่าวันที่ในส่วนบน/ส่วนท้ายคงเป็นวันที่ (ไม่กลายเป็นข้อความ)
- ป้ายต้องอยู่ต้นเซลล์ หรือเซลล์ยาว ≤ 40 ตัวอักษร (กันคำในหมายเหตุยาว ๆ)
- **แบบฟอร์มเปล่า** (ทางขวาของป้ายว่างทั้งหมด) → ช่องกรอก = เซลล์ว่างที่มีสีพื้น (ไม่ใช่ขาว) หรือเส้นใต้ ไม่งั้นเซลล์ว่างแรก · ค่าที่อยู่ห่างป้ายเกิน 2 ช่องว่างไม่นับเป็นค่าของป้าย
- ล้างแบบฟอร์มแล้ว เซลล์ที่ระบบเติมเหลือข้อความป้ายไว้ (เช่น "เลขที่กรมธรรม์ : ชีวิตกลุ่ม") — ไฟล์ที่เก็บดูเหมือนแบบฟอร์มเปล่าของบริษัทประกัน

**เติมข้อมูลลงไฟล์ของบริษัทประกันตัวจริง** (`app/xlsxDirect.js` · JSZip) — ไม่สร้างไฟล์ใหม่เลียนแบบ: เปิดไฟล์ .xlsx ที่ HR อัปโหลดแล้วแก้ XML **เฉพาะชีตที่ต้องเติม** ส่วนอื่นของไฟล์ (styles, theme, รูปภาพ, กล่องข้อความ, แผนภูมิ, หมายเหตุ, ตั้งค่าหน้ากระดาษ ฯลฯ) คงเดิมทุกไบต์ — ใช้ได้กับแบบฟอร์มของบริษัทประกันรายใดก็ได้
- `sanitizeXlsx` (เก็บแบบฟอร์ม): ลบชีตที่ไม่ใช้ (พร้อม drawing/หมายเหตุของชีตนั้น) · แถวข้อมูลตัวอย่างเหลือ 1 แถวว่าง (คงรูปแบบ) · เซลล์ที่ระบบเติมเหลือแต่ป้าย · **สร้าง sharedStrings ใหม่เหลือเฉพาะข้อความที่ใช้** (รายชื่อตัวอย่าง/ชีตอื่นไม่ติดไปกับไฟล์) · ชื่อผู้สร้าง/แก้ไขไฟล์ใน docProps → "HL Welfare" · ลบ calcChain
- `fillXlsx` (ส่งออก): ชีตสรุปเติมในชีตเดิม · ชีตบริษัทแรกใช้ชีตต้นแบบ บริษัทถัดไป**สำเนาชีต** (พร้อมสำเนา drawing/หมายเหตุ) · แถวข้อมูล = สำเนา XML ของแถวต้นแบบ (ความสูง รูปแบบ merge ในแถว สูตรเลื่อนแบบ Excel) · ค่าเป็น inline string / ตัวเลข คง `s` (รูปแบบ) ของเซลล์ · ชีตอื่นในไฟล์ไม่ติดไป
- สิ่งที่เลื่อนตามส่วนท้าย / ขยายตามจำนวนแถว: แถว · merge · **สูตร** (อ้างส่วนท้าย +delta, ช่วงที่ครอบแถวข้อมูลขยาย เช่น `COUNTA(B8:B10)` → `B8:B{8+n-1}`) · conditional formatting · data validation · ลิงก์ · ตัวแบ่งหน้า · พื้นที่พิมพ์/แถวหัวพิมพ์ซ้ำ (definedNames ต่อชีต) · ตำแหน่งรูปภาพ/กล่องข้อความ · ตำแหน่งหมายเหตุ
- workbook: `fullCalcOnLoad="1"` (Excel คำนวณสูตรใหม่ตอนเปิด) · แท็บที่เลือกมีชีตแรกชีตเดียว · ชื่อชีตใน docProps/app.xml ตรงกับชีตจริง
- ExcelJS ใช้**อ่าน**ไฟล์เท่านั้น (หาตำแหน่ง / แสดงตัวอย่าง) · ไฟล์ .xls ที่แปลงแล้วใส่เส้นขอบหัวตาราง/แถวข้อมูลก่อน (ExcelJS) แล้วค่อยเข้าขั้นตอนเดียวกัน
- ตรวจด้วย Excel: เปิดไฟล์ได้โดยไม่มีการซ่อมไฟล์ · PDF ของไฟล์ส่งออกตรงกับต้นฉบับ (โลโก้ กล่องข้อความ ไฮไลต์ conditional formatting สูตรท้ายตาราง)
- ไม่รองรับ: ตาราง (ListObject) ในชีตต้นแบบไม่ถูกสำเนาไปชีตบริษัทถัดไป (ชื่อตารางซ้ำไม่ได้) · ไฟล์ที่ใช้ namespace prefix ใน XML ของชีต (ไม่พบใน Excel ทั่วไป)
- **ไฟล์ .xls (Excel 97-2003)**: แปลงในเบราว์เซอร์ได้ค่า merge ความกว้าง และสีไฮไลต์ (จาก SheetJS) แต่**รูปภาพ/กล่องข้อความ/ฟอนต์บางส่วนแปลงไม่ได้** → หน้าแก้แบบฟอร์มแจ้งเตือนค้างไว้พร้อมวิธีแก้ (เปิดใน Excel → Save As .xlsx แล้วอัปโหลดใหม่)
- ตัวอย่างในหน้าเว็บ (`ui/sheetPreview.js`): สีพื้น/ตัวอักษรตามธีมและจานสีของไฟล์ · เส้นขอบแต่ละด้าน · ความสูงแถว (ตัดข้อความเกินเหมือน Excel) · คอลัมน์ซ่อน · รูปภาพ/กล่องข้อความวางทับตามตำแหน่ง

**ส่งออก (`fillTemplate` → `fillXlsx`)**: ชีตสรุป (ถ้ามี) + ชีตละบริษัทในเครือที่ผูก · แถวข้อมูลตามจำนวนคน (ไม่มีรายการ = คงแถวว่าง 1 แถว) → ส่วนท้ายเลื่อนลงตาม → เติมเซลล์อัตโนมัติ · สร้างไฟล์สำเร็จก่อนแล้วค่อย "บันทึกว่าแจ้งแล้ว" · ไม่มีไฟล์แบบฟอร์ม = ส่งออก CSV ได้อย่างเดียว

**ใครอยู่ในไฟล์ / บันทึกว่าแจ้งแล้ว** (เหมือนเดิม)
- `buildInsurerExport`: ยังไม่ส่งออก (รวมตกค้าง + แจ้งออกทันที) + ที่ส่งออกให้บริษัทประกันนี้ในรอบนี้แล้ว → ส่งออกซ้ำได้รายชื่อเดิม · `missing` = แถวเข้าใหม่ที่ขาด คำนำหน้า/เพศ/เลขบัตร (ตามคอลัมน์ของแบบฟอร์ม)
- บันทึก = `InsuranceBatch` **1 รายการต่อการส่งออก 1 ครั้ง** (items มีทั้งเข้า/ออก/ออกทันที) พร้อม `insurerId`, `insurerName` · ส่งออกรอบเดิมซ้ำ = แทนที่ · ยกเลิกได้ที่แท็บประวัติ (ยกเลิกทั้งไฟล์)
- **รอบของพนักงานรายวัน**: วันที่ 6 ของทุกเดือน แยกจากรอบวันที่ 5 (ประเภทอื่น) — `cycleDayOf(emp)` / `inCycleGroup` ใน `domain/insurance.js` · ตัวเลือกรอบในหน้าประกันกลุ่มมีเดือนละ 2 รอบ (ทั่วไป / รายวัน) · ภาพรวมนับรายการรอส่งของทั้ง 2 รอบถัดไป

**แบบฟอร์มตั้งต้น** (`assets/templates/`): ไทยประกันชีวิต (เปิดใช้ · ทุกบริษัท) และเมืองไทยประกันชีวิต (ปิดไว้) — โครงเดียวกับไฟล์ที่ HR ใช้ (`1. แจ้งเข้า-ออก 5-2-2569.xls`, `1 PMAV-แจ้งเข้า ยกเลิก ก.พ. 68.xlsx`) สร้างผ่านขั้นตอนเดียวกับการอัปโหลด ไม่มีข้อมูลบุคคล — HR อัปโหลดไฟล์จริงแทนได้

## 8. API Contract

สัญญา API (port) — **MockApi และ HttpApi ต้องมีเมธอดครบตามนี้** · ในโค้ดจริงอยู่ที่ `web/assets/js/application/ports.js` (JSDoc)

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
  getInsuranceBatch(id: number): Promise<InsuranceBatchDetail>;
  submitInsuranceBatch(input: { cycleDate: ISODate; type: BatchType; employeeIds: number[] }): Promise<InsuranceBatch>; // ใช้ภายใน/ทดสอบ — หน้าจอใช้ exportInsurance แทน
  exportInsurance(input: { cycleDate: ISODate; insurerId: number; record?: boolean }): Promise<InsurerExport>;
  exportInsuranceBatch(id: number): Promise<InsurerExport>; // ดาวน์โหลดไฟล์ของประวัติอีกครั้ง (ไฟล์หาย) — ไม่บันทึกอะไรเพิ่ม
  listInsurers(): Promise<InsurerForm[]>;
  saveInsurer(form: InsurerForm): Promise<InsurerForm>;   // id = 0 → สร้างใหม่ · template.data = ไฟล์ .xlsx (base64) ที่ล้างข้อมูลบุคคลแล้ว · 422 + errors
  saveInsurerBindings(b: { companyCode: CompanyCode; insurerId: number | null; policyNo: string; holderName: string; plan: string }[]): Promise<InsurerForm[]>;
  deleteInsurer(id: number): Promise<void>;


  listUniformIssues(employeeId?: number): Promise<UniformIssue[]>;
  createUniformIssue(input: Omit<UniformIssue, 'id' | 'issuedBy'>): Promise<UniformIssue>;
  listUniformPending(): Promise<UniformPendingRow[]>;

  // ----- CRUD เพิ่มเติม -----
  createSite(input: Omit<Site, 'id'>): Promise<Site>;
  deleteSite(id: number): Promise<void>;                 // 409 ถ้ายังมีพนักงาน
  deleteEmployee(id: number): Promise<void>;             // 409 ถ้ามีประวัติแจ้งประกัน/แจกชุด
  cancelInsuranceBatch(id: number): Promise<void>;       // รายการกลับเป็น "รอส่ง"
  cancelUniformIssue(id: number): Promise<void>;         // กลับเป็น "ค้างแจก"

  // ----- เข้าสู่ระบบ -----
  login(username: string, password: string, remember?: boolean): Promise<AuthUser>; // 401 ถ้าไม่ถูกต้อง · 429 ผิดหลายครั้ง
  logout(): Promise<void>;
  setActor(name: string): void;                          // mock: ชื่อที่บันทึกในกิจกรรม

  // ----- Monitoring -----
  getWorkQueue(): Promise<MonitorTask[]>;
  listActivity(filter?: { entity?: ActivityEntity; employeeId?: number; limit?: number }): Promise<ActivityLog[]>;
}
```

**ตาราง CRUD**
| ข้อมูล | Create | Read | Update | Delete |
|---|---|---|---|---|
| พนักงาน | ตาราง Excel | ✅ | ตาราง Excel (รวมพ้นสภาพ) | ✅ เฉพาะที่ยังไม่มีประวัติ (ไม่งั้นใช้พ้นสภาพ) |
| หน่วยงาน | ตาราง Excel | ✅ | ตาราง Excel (บริษัทแก้ได้ตอนสร้างเท่านั้น) | ✅ เฉพาะที่ไม่มีพนักงาน |
| แจ้งประกัน (batch) | ✅ | ✅ | – | ยกเลิกได้ (ส่งผิด) |
| แจกชุดฟอร์ม | ✅ | ✅ | – | ยกเลิกได้ (บันทึกผิด) |
| เงื่อนไขสวัสดิการ | – | ✅ | เฟส 3 | – |
| บันทึกกิจกรรม | อัตโนมัติทุกการเปลี่ยนแปลง | ✅ | ❌ (ห้ามแก้) | ❌ |

### REST Endpoints (PHP)

ทุก path ต่อจาก `api/index.php` เช่น `GET api/index.php/employees/5/benefits` (ในตารางเขียนแบบ `/api/...` ตามเดิม = `api/index.php/...`) · ตารางเส้นทางจริงอยู่ที่ `backend/api/routes.php`

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
| GET | `/api/insurance/batches` | – | `InsuranceBatch[]` (ใหม่ก่อน · แนบ `employees` แบบย่อ) |
| GET | `/api/insurance/batches/{id}` | – | `InsuranceBatchDetail` / 404 |
| GET | `/api/insurance/batches/{id}/export` | – | `InsurerExport` ของรายชื่อใน batch นั้นเท่านั้น (ข้อมูลพนักงาน/แบบฟอร์มปัจจุบัน · บริษัทที่เลิกผูกแล้วยังได้ชีต) · 404 = ไม่พบ batch หรือแบบฟอร์มถูกลบ |
| POST | `/api/insurance/batches` | `{cycleDate, type, employeeIds}` | `InsuranceBatch` (201, items ประเภทเดียว) — ใช้ภายใน |
| POST | `/api/insurance/exports` | `{cycleDate, insurerId, record}` | `InsurerExport` · record = แทนที่ batch ของรอบ + บริษัทประกันนั้น (transaction) |
| GET | `/api/insurers` | – | `InsurerForm[]` |
| POST | `/api/insurers` | `InsurerForm` | `InsurerForm` (201) / 422 `{error, errors}` |
| PUT | `/api/insurers/{id}` | `InsurerForm` | `InsurerForm` / 422 |
| DELETE | `/api/insurers/{id}` | – | 204 |
| PUT | `/api/insurers/bindings` | `{bindings: [{companyCode, insurerId, policyNo, holderName, plan}]}` | `InsurerForm[]` (ผูกทุกบริษัทในครั้งเดียว · transaction) |
| GET | `/api/uniform/issues` | `?employeeId=` | `UniformIssue[]` |
| POST | `/api/uniform/issues` | `{employeeId, entitlementKey, event, qty, size, issuedAt}` | `UniformIssue` (201) |
| GET | `/api/uniform/pending` | – | `UniformPendingRow[]` |
| GET | `/api/uniform/stock-options` | `?employeeId=&entitlementKey=` | แบบ/ไซซ์/ยอดคงเหลือจากระบบสต็อก Uniform (409 ถ้าแจกหรือส่งเบิกแล้ว) |
| POST | `/api/uniform/stock-requests` | `{employeeId, entitlementKey, lines: [{itemCode, productId, qty}]}` | `UniformIssue` (201, `source: STOCK`) — ออกใบเบิก WRQ (รอบเริ่มงาน = NRQ) ใน stock_hr สถานะ**รออนุมัติ** — ผู้อนุมัติของหน่วยงานในระบบสต็อกต้องกดอนุมัติเอง (หน้ารายการใบเบิก / ลิงก์ในอีเมล) แล้วคลังจึงได้แจ้งเตือนให้จ่าย · HR_ADMIN/HR_COMPANY · `requested_by_*` จาก session |
| POST | `/api/uniform/stock-sync` | – | `{changed}` — ดึงสถานะใบเบิกจาก stock_hr — ขั้น `WAITING` รอผู้อนุมัติ → `REQUESTED` รอคลังจ่าย → `ISSUED` คลังจ่ายแล้ว → `RECEIVED` เซ็นรับแล้ว · **ไม่อนุมัติ** / คลังยกเลิก → `CANCELLED` สิทธิ์กลับเป็นค้างแจก พร้อมเหตุผล (`cancel_note` = "ไม่อนุมัติ: …") · บันทึกกิจกรรมเมื่ออนุมัติ / ไม่อนุมัติ / จ่าย / เซ็นรับ · ยกเลิกจากระบบนี้ได้ทั้งตอนรออนุมัติและรอคลังจ่าย |
| POST | `/api/sites` | `{companyCode, name, hasGroupInsurance, poloColor}` | `Site` (201) |
| DELETE | `/api/sites/{id}` | – | 204 / 409 |
| DELETE | `/api/employees/{id}` | – | 204 / 409 |
| DELETE | `/api/insurance/batches/{id}` | – | 204 |
| DELETE | `/api/uniform/issues/{id}` | – | 204 |
| POST | `/api/auth/login` | `{username, password, remember}` | `AuthUser` + session cookie (+ refresh cookie เมื่อ `remember`) · 401 ผิด · 429 ผิดหลายครั้ง (ข้อ 10.9.1) |
| POST | `/api/auth/refresh` | – (refresh cookie) | `AuthUser` + session ใหม่ + refresh cookie ตัวใหม่ · 401 `{code}` · 409 `REFRESH_RACE` |
| POST | `/api/auth/logout` | – | 204 (เพิกถอนโทเคน ลบ cookie) |
| GET | `/api/auth/me` | – | `AuthUser` หรือ 401 |
| POST | `/api/auth/password` | `{currentPassword, newPassword}` | `AuthUser` · เพิกถอนทุกโทเคน + session เครื่องอื่น · 422 |
| POST | `/api/stock/bridge` | `{action: catalog\|submit\|status\|cancel, …}` | ตัวกลางสำหรับหน้าเว็บโหมด mock (StockGateway) · ตอบ `{ok, message, …}` ตาม stock_hr (ไม่ห่อ `data`) · submit/cancel ต้องเป็น HR_ADMIN/HR_COMPANY (403) · ผู้ขอเบิกจาก session |
| GET | `/api/monitor/tasks` | – | `MonitorTask[]` (เรียงด่วนก่อน) |
| GET | `/api/activity` | `?entity=&employeeId=&limit=` | `ActivityLog[]` (ใหม่ก่อน) |
| GET | `/api/notifications` | `?before=<id>&limit=10` (สูงสุด 30) | `{items: Notice[], unread, total, hasMore, nextBefore}` — เฉพาะของผู้ใช้ที่ login · ใหม่ก่อน · `before` = เก่ากว่า id (เลื่อนลงโหลดเพิ่ม) |
| GET | `/api/notifications/unread` | – | `{unread}` — หน้าเว็บถามทุก 90 วินาที · **ดึงสถานะใบเบิกจากสต็อกให้ด้วย ไม่เกินทุก 3 นาทีต่อขอบเขตบริษัท** (ไม่มีใครเปิดหน้าชุดฟอร์มก็ยังได้ผลอนุมัติ/คลังจ่าย) · สต็อกไม่ตอบ = ข้ามเงียบ ๆ |
| POST | `/api/notifications/{id}/read` · `/api/notifications/read-all` | – | `{unread}` (อ่านของคนอื่นไม่ได้) |

**Validation ที่ต้องมีทั้ง mock และ PHP**
- `empCode` ห้ามซ้ำ → 409 `"รหัสพนักงานซ้ำ"`
- ส่งแจ้งประกันซ้ำ (IN ซ้ำ หรือ OUT/URGENT ซ้ำ) → 409 `"มีพนักงานที่ถูกแจ้งไปแล้ว N ราย"`
- `employeeIds` ว่าง → 422 `"ไม่มีรายการที่เลือก"`
- แจกชุดฟอร์มซ้ำ key เดิม → 409 `"รายการนี้แจกไปแล้ว"`
- ไม่พบข้อมูล → 404
- ลบหน่วยงานที่ยังมีพนักงาน / ลบพนักงานที่มีประวัติ → 409 พร้อมข้อความแนะนำทางเลือก
- ทุก create/update/delete/cancel ต้องเขียน `audit_log` (= `ActivityLog`) พร้อม `summary` ภาษาไทย + `user_id` และ `user_name` (ชื่อ ณ ตอนนั้น) **จาก session เท่านั้น** — ห้ามรับชื่อผู้ทำรายการ (`issuedBy`, `submittedBy`, `requested_by_*`, `uploadedBy`) จาก body
- ทุก endpoint (ยกเว้น `/api/auth/login|refresh|logout`) ต้องมี session → ไม่มี = 401 `{error, code}` (หน้าเว็บต่ออายุด้วย refresh 1 ครั้ง ไม่ได้ → หน้า login)
- คำขอที่เปลี่ยนข้อมูลต้องเป็น `Content-Type: application/json` (415) และถ้ามี `Origin` ต้องเป็น origin เดียวกัน/`CORS_ORIGIN` (403) — กัน CSRF ร่วมกับ cookie `SameSite=Lax`

`AuthUser` = `{ id, username, name, role /* ป้ายแสดงผล เช่น "HR Admin" */, roleCode /* HR_ADMIN|HR_COMPANY|PAYROLL|STOCK|EXECUTIVE */, empCode }`

### จุดเลือกแหล่งข้อมูล — `app/api.js`
```js
import { CONFIG } from '../config.js';
import { HttpApi } from '../infrastructure/http/httpApi.js';
import { MockApi } from '../infrastructure/mock/mockApi.js';

export const API_MODE = CONFIG.apiMode === 'http' ? 'http' : 'mock';
export const api = API_MODE === 'http' ? new HttpApi(CONFIG.apiBaseUrl) : new MockApi();
// ทุกหน้า: import { api } from '../app/api.js';  (ห้าม import MockApi/HttpApi ตรง ๆ)
```

`application/errors.js` — ทุก adapter โยน error แบบเดียวกัน หน้าจอจึงจัดการ error แบบเดียว
```js
export class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'ApiError'; this.status = status; }
}
```

### `infrastructure/http/httpApi.js` + `serverAuth.js` (แกนหลัก)
```js
// HttpApi.req → ServerAuth.authorized: ได้ 401 → POST /auth/refresh ครั้งเดียว (คำขอพร้อมกันใช้ refresh ร่วมกัน) แล้วลองใหม่
//   refresh 409 REFRESH_RACE (อีกแท็บเพิ่งหมุนโทเคน) → GET /auth/me แล้วลองใหม่
//   ไม่สำเร็จ → onUnauthorized() → app/auth.js ล้างข้อมูลแสดงผล แล้วไป login.html?next=หน้าเดิม
req(path, init) {
  return this.auth.authorized(() => this.auth.call(path, init)); // call = fetch(credentials: 'include') → body.data / ApiError
}
```

---

## 9. Mock API

- `MockApi implements WelfareApi` เก็บข้อมูลใน memory + `localStorage` (key `hl-welfare-mock-v4`) · ไฟล์ `web/assets/js/infrastructure/mock/` ห่อ try/catch ทุกครั้ง
- ใส่ latency จำลอง ~150ms และคืนค่าด้วย `structuredClone` (กันหน้าจอแก้ object ใน db ตรงๆ)
- ใช้ `domain/*.js` + `application/usecases/*.js` คำนวณสิทธิ → พฤติกรรมเหมือน PHP
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
| Pro Site ช่างเทคนิค เริ่ม 3 วันก่อน | ชุดวันเริ่มงาน 2 |
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

- batch ประกันในอดีต: สร้างเป็น "ส่งแล้ว" ให้ทุกคนที่รอบแจ้งเข้า/ออก < รอบปัจจุบัน — 1 รายการต่อรอบ (รวมเข้า/ออก)
- ชุดฟอร์มที่ครบกำหนดเกิน 14 วัน: สร้างเป็น "แจกแล้ว" (เว้นบางรายการที่ครบกำหนดใน 120 วันล่าสุดให้ค้าง)
- บันทึกกิจกรรมย้อนหลัง 60 วันสร้างจากประวัติแจ้งประกัน/แจกชุด · มีพนักงานที่ "ลืมบันทึกวันผ่านทดลองงาน" 1 คน (ทดสอบคิวงาน)

---

## 10. Design System & UX

เป้าหมาย: **สะอาด อ่านง่าย ใช้งานเร็ว** — HR ใช้ทุกวัน ข้อมูลเยอะ จึงเน้นความชัดของสถานะ (มีสิทธิ / รอ / ไม่มีสิทธิ) มากกว่าการตกแต่ง

### 10.1 หลักการ
| หลัก | ทำอย่างไร |
|---|---|
| **สถานะต้องเห็นในแวบเดียว** | ทุกสถานะใช้ Badge สี + จุดสี + ข้อความ (ไม่ใช้สีอย่างเดียว เพื่อคนตาบอดสี) |
| **บอกขั้นต่อไปเสมอ** | การ์ดสิทธิแสดง "อะไร · เมื่อไร · ทำไม" เช่น "แจ้งเข้า 5 ธ.ค. 69 (ครบ 30 วัน 9 พ.ย. 69)" |
| **ไม่มีหน้าว่างเปล่า** | Loading = skeleton ทรงเดียวกับเนื้อหา · ว่าง = emptyState + ปุ่มทำต่อ · ผิดพลาด = Alert + ปุ่มลองใหม่ |
| **ยืนยันก่อนทำสิ่งที่ย้อนไม่ได้** | ส่งแจ้งประกัน / ลบ / ยกเลิก → Modal สรุปก่อนกดยืนยัน |
| **Feedback ทันที** | บันทึกสำเร็จ/ล้มเหลว → Toast มุมขวาล่าง 4 วินาที |
| **สถานะหน้าจออยู่ใน URL** | filter, แท็บ, รอบประกัน, หน้า เก็บใน query string → แชร์ลิงก์/กด back ได้ |
| **คีย์บอร์ดได้ทุกจุด** | focus ring ชัด (`:focus-visible`), `/` = โฟกัสช่องค้นหา, `Esc` ปิด modal, ตาราง Excel ใช้ลูกศร/Enter/Tab |

### 10.2 Design tokens (`web/assets/css/app.css` ส่วนที่ 1)
แก้สีที่ `:root` ที่เดียว → เปลี่ยนทั้งระบบ · โหมดมืดอยู่ที่ `:root[data-theme='dark']` · **เปลี่ยนโทน gradient: แก้แค่ `--grad-start` / `--grad-mid` / `--grad-end`**

| Token | Light | Dark | ใช้กับ |
|---|---|---|---|
| `--bg` | `#f7f8fc` | `#0b0d14` | พื้นหลังหน้า |
| `--surface` | `#ffffff` | `#131722` | การ์ด, ตาราง, sidebar |
| `--surface-2` | `#f3f5fa` | `#1a1f2e` | hover, header ตาราง |
| `--border` | `#e6e9f0` | `#262c3d` | เส้นขอบ |
| `--fg` | `#0f172a` | `#e6e9f2` | ตัวอักษรหลัก |
| `--muted` | `#64748b` | `#8b93a7` | ตัวอักษรรอง |
| `--primary` | `#0e7490` | `#22d3ee` | ลิงก์, ตัวอักษรที่เน้น, focus (เฉดเข้มพอให้ contrast ≥ 4.5:1) |
| `--primary-soft` | `#e6f6f8` | `#0c2a33` | พื้นหลังอ่อน |
| `--grad-start` → `--grad-mid` → `--grad-end` | `#1d4ed8` → `#0e7490` → `#047857` | `#2563eb` → `#0e7490` → `#059669` | **ธีม gradient น้ำเงิน → เขียว** |
| `--grad` / `--grad-soft` | gradient เข้ม / อ่อน (สร้างจาก 3 สีบน) | | ปุ่มหลัก, เมนูที่เลือก, แท็บ, วงแหวน loading, โลโก้, สวิตช์, หน้า login (ไม่มีแถบสีบนสุดของหน้าแล้ว) |
| `--success` / `-soft` | `#059669` / `#ecfdf5` | `#34d399` / `#052e1f` | มีสิทธิ, ส่งแล้ว, แจกแล้ว |
| `--warning` / `-soft` | `#b45309` / `#fffbeb` | `#fbbf24` / `#2d1f05` | รอส่ง, แจ้งออก, ใกล้ครบ |
| `--danger` / `-soft` | `#dc2626` / `#fef2f2` | `#f87171` / `#2d0a0a` | ไม่มีสิทธิ, แจ้งทันที, error |
| `--info` / `-soft` | `#0369a1` / `#f0f9ff` | `#38bdf8` / `#04202f` | ข้อมูลทั่วไป, รอบถัดไป |

| ด้าน | ค่า |
|---|---|
| ฟอนต์ | `IBM Plex Sans Thai` 400/500/600/700 (Google Fonts) · ตัวเลขในตารางใช้ class `num` (tabular-nums) |
| ขนาดตัวอักษร | 12 (caption) · 13 (ตาราง) · 14 (body) · 16 (หัวการ์ด) · 24 (หัวหน้า) · 30 (ตัวเลข Stat) |
| ขนาดกระชับ (จอ ≥1024px) | body 13 · ตาราง 12.5 · หัวหน้า 20 · ปุ่ม/ช่องกรอกสูง 34 (เล็ก 28) · แถวตาราง Excel 30 · topbar 52 · sidebar 220 · เนื้อหากว้างสุด 1600px — เห็นข้อมูลได้มากขึ้น (มือถือคงขนาดเดิมให้แตะง่าย) · บล็อก "ขนาดกระชับ" ท้าย `app.css` |
| แนวสมมาตร (จอคอม) | sidebar: โลโก้ / ไอคอนเมนู / หัวข้อ / ป้ายท้ายเมนู เริ่มที่ 20px · แถบเมนูที่เลือกและการ์ดผู้ใช้ 10px ทั้งซ้าย-ขวา · ช่องค้นหาบนสุดเริ่มตรงกับเนื้อหาหน้า · การ์ด: หัว/เนื้อหา/ท้าย ระยะขอบใน 16px เท่ากัน · การ์ดที่วางคู่กันสูงเท่ากัน (`.grid.eq`) · ปุ่มข้างช่องกรอกสูงเท่าช่องกรอก ขอบล่างตรงกัน |
| Radius | 8px (input, ปุ่ม) · 12px (การ์ด) · 999px (badge, avatar) |
| Motion | 150ms (hover/focus) · 200ms (modal/toast) · ปิดเมื่อ `prefers-reduced-motion` |
| ธีม | **ค่าเริ่มต้น = โทนสว่าง** (ไม่ตาม dark mode ของระบบ) · ปุ่ม ☾ ที่ Topbar → เก็บใน `localStorage` (`hl-theme`) ใส่ `data-theme="dark"` ที่ `<html>` |

### 10.3 CSS classes หลัก (ใช้ใน HTML ได้ทันที)
| Class | ใช้ทำ | ตัวอย่าง |
|---|---|---|
| `page-head`, `page-actions`, `breadcrumb` | หัวหน้า | `<div class="page-head"><div><h1>…</h1><p>…</p></div>…</div>` |
| `card`, `card-head`, `card-title`, `card-icon`, `card-body`, `card-foot` | การ์ด | |
| `btn` + `btn-primary` / `btn-danger` / `btn-ghost` / `btn-sm`, `btn-icon` | ปุ่ม | `<button class="btn btn-primary"><i data-icon="save"></i> บันทึก</button>` |
| `badge tone-success` (+ `dot`, `lg`) | สถานะ | tone: `success` `warning` `danger` `info` `primary` `neutral` |
| `grid grid-2/3/4`, `span-2`, `stack`, `mt`, `mb` | จัดวาง (responsive อัตโนมัติ) | |
| `field`, `input`, `input-icon`, `form-section`, `form-grid`, `form-footer` | ฟอร์ม | เช่น หน้าแบบฟอร์มประกัน |
| `filters` | แถบตัวกรองเหนือตาราง | ดู `employees.html` |
| `switch` | สวิตช์ (`role="switch" aria-checked`) | |
| `tabs`, `tab`, `chips`, `chip` | แท็บ / ชิปกรอง | `tabs(items, value)` — item `{ value, label, count, tone }` ตัวเลขบนแท็บมีสีตาม tone |
| `panel fill` | แท็บ panel ในหน้าพอดีจอ | ดู `index.html`, `insurance.html` |
| `grad-text` | ตัวอักษร gradient | |
| `alert tone-*` | แจ้งเตือนในหน้า | |
| `num`, `muted`, `small`, `truncate`, `nowrap`, `hidden` | utilities | |
| `<i data-icon="ชื่อ">` | ไอคอน Lucide (แปลงเป็น SVG ตอนโหลดหน้า) | ชื่อทั้งหมดอยู่ใน `shared/icons.js` |

### 10.4 JavaScript UI API (`web/assets/js/ui/`)
| ฟังก์ชัน / คลาส | ไฟล์ | หมายเหตุ |
|---|---|---|
| `badge(text, tone, {dot, lg})`, `card({...})`, `statCard({...})`, `emptyState({...})`, `alertBox({...})`, `errorState(e)`, `avatar(name)`, `employeeCell(emp, {link})`, `tabs(items, value)`, `progress(v)`, `infoList(items, cols)` | `components.js` | คืน HTML ใช้ใน `html\`...\`` ได้ทันที |
| `new DataTable(el, { columns, rowKey, pageSize, onRowClick, rowClass, empty, onRender })` → `.setRows(rows)` | `table.js` | ตารางอ่านอย่างเดียว · เส้นตารางแบบ Excel + เลขแถว · ≥768px = ตาราง, <768px = **การ์ดรายแถว** (คอลัมน์กำหนดตำแหน่งด้วย `mobile: 'lead'\|'title'\|'aside'\|'field'\|'footer'`) · ใส่ `pageSize` = แบ่งหน้า |
| `new ExcelGrid(el, { columns, rowKey, validate, onSave, onRemove, rowLabel, onSaved, newRow, onOpen, pageSize })` | `datagrid.js` | ตารางแบบ Excel — ข้อ 10.6 |
| กรองคอลัมน์ที่หัวตาราง | `columnFilter.js` | **เปิดอัตโนมัติทุกตาราง** — **คลิกชื่อหัวคอลัมน์ = เรียง** (`headerLabel` · วน น้อย→มาก → มาก→น้อย → ไม่เรียง · ลูกศร ↑/↓ สีหลักข้างชื่อ · ชี้แล้วเห็น ⇅ จาง ๆ · `aria-sort` ที่ `<th>` · เรียงได้ทีละคอลัมน์) · คลิกกรวยที่หัวคอลัมน์ (สีหลัก = กรองอยู่): เรียงน้อย→มาก/มาก→น้อย, ค้นหาค่า, ติ๊กเลือกค่า (มีจำนวนแต่ละค่า) · **chip ตัวกรองที่ใช้อยู่** เหนือตาราง (`filterChips`): 1 chip ต่อคอลัมน์ที่กรอง "ชื่อคอลัมน์: ค่า" (2 ค่าแรก + "+N" · เอาออกน้อยกว่าที่เหลือ = "ไม่รวม …") + chip การเรียง · กด × ที่ chip = เอาออกทีละอัน · มีมากกว่า 1 อัน = ปุ่ม "ล้างทั้งหมด" · คอลัมน์: `filter: false` = ปิด, `text(row)` = ข้อความที่ใช้กรอง, `sort(row)` = ค่าที่ใช้เรียง (วันที่ ISO, ตัวเลข) · ตาราง Excel: แถวที่เพิ่งแก้ยังแสดงแม้ไม่ตรงตัวกรอง |
| **ปุ่มส่งออก Excel ทุกตาราง** | `exportExcel.js` | ปุ่ม "Excel" มุมขวาบนของทุก `DataTable` / ในแถบเครื่องมือของ `ExcelGrid` — ส่งออก**ทุกแถวตามตัวกรอง/การเรียง** (ทุกหน้า) เป็น .xlsx · หัวตารางสีพื้น ตัวหนา · ตรึงแถวหัว · AutoFilter · ความกว้างตามข้อความ · ไม่รวมคอลัมน์ปุ่ม · ExcelGrid ส่งออกข้อมูลที่บันทึกแล้ว · ชื่อไฟล์ = ชื่อหน้า + วันที่ · ปิดด้วย `exportable: false` |
| หัวคอลัมน์ตาราง | `app.css` | สีพื้นชัดเจนทุกตาราง (`--th-bg` ฟ้าอ่อน / ตัวอักษร `--th-fg` เข้ม · โหมดมืดใช้ค่าคู่กัน) ตัวหนา เส้นล่าง 2px |
| ตรึงคอลัมน์ไว้ด้านซ้าย | `columnFilter.js` (`headerPinButton`, `loadPins`, `savePins`, `orderByPins`, `tableId`) | **เปิดอัตโนมัติทุกตาราง** — **ชี้ที่หัวคอลัมน์ → ปุ่มหมุด** (ข้างปุ่มกรวย · ลอยทับท้ายชื่อคอลัมน์ ไม่ดันความกว้าง) กด = ตรึง / กดอีกครั้ง = เลิกตรึง · คอลัมน์ที่ตรึงแสดงหมุดสีหลักตลอด · จอสัมผัสแสดงหมุดจาง ๆ ตลอด · ตรึงได้หลายคอลัมน์ (ย้ายไปต่อจากเลขแถวตามลำดับเดิม) · ติดอยู่กับที่เมื่อเลื่อนแนวนอน มีเงาที่ขอบคอลัมน์สุดท้าย · จำแยกต่อตาราง/ต่อเครื่องใน `localStorage` คีย์ `hl-pins:<ไฟล์หน้า>#<id ตาราง>` (ระบุเองได้ด้วย `opts.id`) |
| ปรับความกว้างคอลัมน์ | `columnFilter.js` (`resizeHandle`, `wireColumnResize`, `loadWidths`, `saveWidths`) | **เปิดอัตโนมัติทุกตาราง** — ลากขอบขวาของหัวคอลัมน์ (เคอร์เซอร์ ↔ · เส้นสีหลักขณะลาก) ซ้าย = แคบ / ขวา = กว้าง · ขั้นต่ำ 48px · ดับเบิลคลิกขอบ = กลับเป็นความกว้างเดิม · DataTable: เซลล์ที่แคบกว่าเนื้อหาตัดด้วย … · ExcelGrid: ทับค่า `width` ของคอลัมน์ · จำแยกต่อตาราง/ต่อเครื่องใน `localStorage` คีย์ `hl-colw:<ไฟล์หน้า>#<id ตาราง>` · รองรับขนาดตัวอักษรของระบบ (zoom) |
| `<select data-combobox>` + `enhanceSelects()` | `combobox.js` | **select ทุกจุดพิมพ์ค้นหาได้** · มี `<option value="">` = ล้างค่าได้ · `data-creatable` = พิมพ์ค่าใหม่ได้ · `data-size="sm"` · `<option disabled>` = ไม่แสดง · แก้ option ด้วย JS แล้วเรียก `select.refreshCombobox()` |
| `openPicker({anchor, options, value, onPick})` | `combobox.js` | รายการค้นหาได้ลอยใต้ element (ใช้ในเซลล์ตาราง) |
| `toast.success(msg)`, `toast.error(msg)` | `overlay.js` | |
| `confirmAction({ title, description, body, confirmLabel, danger, successMessage, action })` | `overlay.js` | ยืนยัน → รัน `action()` → Toast ทั้งสำเร็จ/ล้มเหลว · ปิดไม่ได้ระหว่างบันทึก |
| `openModal({ title, body, footer })` | `overlay.js` | trap focus, `Esc` ปิด |
| `initPage(menuId)`, `refreshCounts()` | `app/shell.js` | สร้าง sidebar/topbar, ตัวนับงานค้างในเมนู |
| `html\`\``, `raw()`, `render(el, h)`, `$`, `$$`, `on()`, `debounce()`, `getParam()`, `setParams()` | `shared/dom.js` | |

**Loading (`ui/loading.js`) — ใช้แบบเดียวกันทั้งระบบ**

| ใช้ | เมื่อไร | หน้าตา |
|---|---|---|
| `progress` | **อัตโนมัติ**: `api` ทุกคำสั่ง (ห่อด้วย Proxy ใน `app/api.js`) + คลิกลิงก์เปลี่ยนหน้า (`installNavigationProgress` ใน shell) · เรียกเองได้ `progress.track(promise)` | แถบ gradient สูง 3px บนสุดของจอ เดินช้าลงเรื่อย ๆ จนเสร็จแล้ววิ่งเต็ม + จางหาย · แสดงหลังรอ 80ms (งานเร็วไม่กระพริบ) · `aria-busy` ที่ `<html>` |
| `skeleton` | ตาราง / การ์ดสถิติ (รู้รูปร่างล่วงหน้า) | แถบเทาวิ่งเงา (เดิม) |
| `loader({ text, logo })` | พื้นที่ที่ไม่รู้รูปร่าง เช่น modal รายชื่อ, modal ส่งออก, ตัวแก้ไขแบบฟอร์ม | วงแหวน gradient หมุน (+ โลโก้หายใจตรงกลาง) + ข้อความ "…" กระพริบ · `role="status"` |
| `busy(button, fn, { label })` | ปุ่มที่รอผล (บันทึก, ดาวน์โหลด) | ปุ่มกดซ้ำไม่ได้ + วงแหวนเล็ก (สีขาวบนปุ่มสี) + ข้อความ · `aria-busy` · เสร็จแล้วคืนหน้าตาเดิม |
| `spinner({ size, onColor })` | จุดเล็ก เช่น เลขแถวที่กำลังบันทึกในตาราง Excel | วงแหวน sm 16 / md 28 / lg 44 px |

- `prefers-reduced-motion`: วงแหวนยังหมุนช้า ๆ (ให้รู้ว่าทำงานอยู่) · ปิดแสงวิ่ง/จุดกระพริบ

### 10.5 Layout (shell)
```text
┌────────────┬───────────────────────────────────────────────────────────┐
│  ☺ HL      │  ☰                                                    ☾   │ ← Topbar (sticky, blur) · ไม่มีช่องค้นหารวม
│  Welfare   ├───────────────────────────────────────────────────────────┤
│ ▣ ภาพรวม   │  หัวหน้า (24px)                              [ปุ่มหลัก]   │ ← page-head
│ ☑ ติดตามงาน │  คำอธิบายสั้น                                              │
│ ☺ พนักงาน  │  ┌─Stat─┐ ┌─Stat─┐ ┌─Stat─┐ ┌─Stat─┐                       │
│ ⛨ ประกัน ② │  └──────┘ └──────┘ └──────┘ └──────┘                       │
│ 👕 ชุดฟอร์ม③│  ┌──────── card ────────┐ ┌──── card ────┐                │
│            │  └──────────────────────┘ └──────────────┘                │
│ ── ตั้งค่า ──│                                     max-width 1280px      │
│ ☰ เงื่อนไข  │                                                           │
│ ⌂ หน่วยงาน │                                                           │
│ Mock data  │                                                           │
│[รีเซ็ตmock]│                                                           │
└────────────┴───────────────────────────────────────────────────────────┘
  256px          768–1023px: sidebar เป็น drawer (ปุ่ม ☰)
```

**มือถือ (<768px)** — เมนูด้านล่าง (bottom navigation) แทนปุ่ม ☰
```text
┌──────────────────────────────────┐
│ ☺ HL Welfare              ?  ☾ │ ← Topbar: โลโก้ + ชื่อระบบ | ปุ่ม
├──────────────────────────────────┤
│  เนื้อหา (เว้นล่าง 88px)            │
├──────┬──────┬──────┬──────┬──────┤
│  ▣   │  ☺   │ ⛨②  │ 👕③ │  ⊞   │ ← .bottom-nav (fixed, blur, รองรับ safe-area)
│ภาพรวม│พนักงาน│ประกัน│ชุดฟอร์ม│เพิ่มเติม│   5 ปุ่มกว้างเท่ากัน · หน้าปัจจุบันมีแถบ gradient ด้านบน
└──────┴──────┴──────┴──────┴──────┘
```
- 4 หน้าหลักกำหนดที่ `BOTTOM_NAV` / `BOTTOM_LABEL` ใน `app/shell.js` · ตัวนับงานค้างแสดงบนไอคอนเหมือน sidebar
- **ซ่อนอัตโนมัติ:** ปัดขึ้น (เลื่อนอ่านต่อลงไป) = เมนูล่างเลื่อนหายลงขอบจอ · ปัดลง / กลับบนสุด = แสดงกลับ · แถบปุ่มฟอร์มและ Toast เลื่อนตาม · ปรับความไวได้ที่ `HIDE_AFTER` / `MIN_DELTA` ใน `autoHideBottomNav()` (`app/shell.js`) · เลื่อนตารางแนวนอนหรือเมนูเต็มเปิดอยู่ ไม่มีผล
- "เพิ่มเติม" เปิดเมนูเต็ม (drawer) — เงื่อนไข, หน่วยงาน, แบบฟอร์มประกัน, แหล่งข้อมูล, ผู้ใช้/ออกจากระบบ · ไฮไลต์เมื่ออยู่หน้าที่ไม่มีในเมนูล่าง · Esc / แตะพื้นหลัง = ปิด
- แถบปุ่มบันทึกของฟอร์ม (`.form-footer`) และ Toast ขยับขึ้นอยู่เหนือเมนูล่าง
- เมนูแสดง **ตัวนับงานค้าง**: ประกันกลุ่ม = แจ้งออกทันทีค้าง (แดง), ชุดฟอร์ม = ค้างแจก (เหลือง)
- ช่องค้นหาใน Topbar → Enter ไป `employees.html?q=…` · กด `/` เพื่อโฟกัส
- ป้ายแหล่งข้อมูล: `Mock data` (เหลือง) / `API` (เขียว)

### 10.6 ตารางแบบ Excel (`ExcelGrid`)
ใช้กับข้อมูลที่ HR แก้บ่อย: **พนักงาน**, **หน่วยงาน**, **การผูกบริษัทในเครือ ↔ บริษัทประกัน** (หน้าแบบฟอร์มประกัน) · ตารางอ่านอย่างเดียวใช้ `DataTable`

| การใช้งาน | ผลลัพธ์ |
|---|---|
| คลิกเซลล์ | เลือกเซลล์ (กรอบสีหลัก) |
| ดับเบิลคลิก / Enter / F2 / พิมพ์ตัวอักษร | เริ่มแก้ไข (พิมพ์ = แทนค่าด้วยตัวที่พิมพ์) |
| Enter / Tab / Shift+Tab | ยืนยันค่าในเซลล์แล้วเลื่อนลง / ขวา / ซ้าย (ยังไม่บันทึกลงระบบ) |
| Esc | ยกเลิกการแก้ |
| ← ↑ ↓ → | เลื่อนเซลล์ |
| คลิก / Space บนเซลล์สวิตช์ | สลับค่า |
| เซลล์ select (คลิกซ้ำ / ดับเบิลคลิก / พิมพ์) | เปิดรายการค้นหาได้ในเซลล์ |
| ปุ่ม "+ เพิ่มแถว" + ช่องจำนวน [n] แถว | เพิ่มแถวใหม่ n แถวขึ้นบนสุดในครั้งเดียว (ค่าเริ่มต้น 1 · สูงสุด 100 · กด Enter ในช่องจำนวน = เพิ่ม · จำค่าที่ใส่ไว้) · สีเขียว ป้าย "ใหม่" · ช่องบังคับที่ยังว่างขึ้นกรอบแดง |
| ปุ่ม 🗑 ท้ายแถว | ทำเครื่องหมายลบ (สีแดง ขีดฆ่า) — ลบจริงตอนบันทึก · ปุ่ม ↶ = ยกเลิกการลบ / คืนค่าเดิมของแถวที่แก้ |
| **บันทึก** (แถบ "ยังไม่บันทึก") / Ctrl+S | บันทึกทุกการเปลี่ยนแปลง: ลบ → แก้ไข → เพิ่ม · มีการลบ → กล่องยืนยันพร้อมรายชื่อ |
| ยกเลิกทั้งหมด | ทิ้งทุกการเปลี่ยนแปลงที่ยังไม่บันทึก |

- **การเปลี่ยนแปลงค้างไว้จนกว่าจะกดบันทึก** — สี: **เขียว = เพิ่ม · เหลือง = แก้ไข · แดงขีดฆ่า = ลบ** (แถบสีซ้ายของแถว + ป้ายที่คอลัมน์เลขแถว "ใหม่ / แก้ไข / ลบ") · เซลล์ที่เปลี่ยนมีขีดเหลือง + ตัวหนา + tooltip "เดิม: …" · แก้กลับเป็นค่าเดิม = ไม่นับว่าแก้
- **แถบ "ยังไม่บันทึก"** ในแถบเครื่องมือ: จำนวน เพิ่ม / แก้ไข / ลบ · มีปัญหา N แถว · ปุ่มยกเลิกทั้งหมด / บันทึก (N) · ไม่มีงานค้าง → แสดงคำอธิบายสี · ปิด/ออกจากหน้าขณะมีงานค้าง → เบราว์เซอร์ถามก่อน
- แถวใหม่/แถวที่แก้ตรวจ `validate` ทันที (ช่องสีแดง) · กดบันทึกขณะยังไม่ครบ → ไม่ส่งอะไรเลย + Toast บอกจำนวนแถว
- บันทึกไม่ผ่านบางแถว (เช่น ลบหน่วยงานที่ยังมีพนักงาน) → แถวนั้นค้างเป็นสีแดงพร้อม ⚠ + สาเหตุ (ชี้/เลือกแถว) · แถวอื่นบันทึกตามปกติ · Toast สรุป "บันทึกแล้ว — เพิ่ม 1 · แก้ไข 2 · ลบ 1"
- สถานะที่คอลัมน์เลขแถว: ⟳ กำลังบันทึก · ✓ บันทึกแล้ว · ⚠ ผิดพลาด · ใหม่ / แก้ไข / ลบ
- options: `onSave(row, isNew)` · `onRemove(row)` (ลบจริง) · `rowLabel(row)` (ชื่อในกล่องยืนยันลบ) · `onSaved({added, edited, deleted})`
- `onSave(row, isNew)` ต้อง **คืนแถวที่บันทึกแล้ว** — ตารางอัปเดตตัวเอง
- เซลล์ที่แก้ไม่ได้สำหรับแถวนั้น (เช่น ระดับ ของ Pro Site) เป็นพื้นเทา · หัวตาราง + เลขแถว + ปุ่มท้ายแถว ติดอยู่กับที่เมื่อเลื่อน
- เปลี่ยนบริษัท/ประเภท → `normalizeEmployee` จัดหน่วยงาน/ฝ่าย/ตำแหน่งให้สอดคล้องอัตโนมัติ
- การพ้นสภาพทำในตารางพนักงาน: คอลัมน์ **สถานะ** → "พ้นสภาพ" แล้วกรอก **เหตุผล / ทำงานวันสุดท้าย / วันพ้นสภาพ** ในแถวเดียวกัน (ช่องเหล่านี้แก้ได้เฉพาะแถวที่พ้นสภาพ) · เลิกจ้าง/กระทำผิด → Toast เตือนแจ้งออกประกันทันที

```js
const grid = new ExcelGrid(document.getElementById('grid'), {
  rowKey: (s) => s.id,
  columns: [
    { key: 'name', header: 'ชื่อหน่วยงาน', width: 320, required: true, editor: 'text',
      value: (s) => s.name, set: (s, v) => ({ ...s, name: v }) },
    { key: 'hasGroupInsurance', header: 'ประกันกลุ่ม', width: 150, editor: 'switch',
      value: (s) => s.hasGroupInsurance, set: (s, v) => ({ ...s, hasGroupInsurance: !!v }) },
  ],
  validate: (s) => (s.name ? {} : { name: 'กรุณาระบุชื่อ' }),
  newRow: () => ({ id: 0, name: '', hasGroupInsurance: true }),
  onSave: (row, isNew) => (isNew ? api.createSite(row) : api.updateSite(row.id, row)),
  onRemove: (row) => api.deleteSite(row.id),
  rowLabel: (row) => row.name,
});
grid.setRows(await api.listSites());
```

### 10.7 การแบ่งหน้า (ข้อมูลเยอะ)
| หน้า | ต่อหน้า | หมายเหตุ |
|---|---|---|
| พนักงาน | 25 | เลขหน้าเก็บใน URL (`?page=`) · เปลี่ยนตัวกรอง → กลับหน้า 1 |
| ประกันกลุ่ม (แต่ละส่วน) / ชุดฟอร์ม | 25 | ประวัติ batch 10 · เปลี่ยนแท็บ → หน้า 1 |
| ศูนย์ติดตามงาน: คิวงาน | 15 | |
| ภาพรวม: จะครบสิทธิใน 30 วัน | 10 | |

**แถบแบ่งหน้า** (`pagerHtml` / `wirePager` ใน `ui/table.js` — ใช้ร่วมกันทั้ง DataTable และ ExcelGrid)
```text
Desktop  76–100 จาก 258 รายการ      ( « ‹ 1 … 3 [4] 5 … 11 › » )      แถวต่อหน้า (10|25|50|100)  ไปหน้า [4]
         ▬▬▬━━▬▬▬▬ (แถบตำแหน่ง)
มือถือ   ( ‹      หน้า [4] / 11      › )
         76–100 จาก 258 รายการ                    (10|25|50|100)
```
| ส่วน | รายละเอียด |
|---|---|
| ช่วงที่แสดง | "76–100 จาก 258 รายการ" + แถบตำแหน่งเล็ก (ซ่อนเมื่อ <1280px) |
| เลขหน้า | กลุ่มปุ่มทรง pill: หน้าแรก « · ก่อนหน้า ‹ · เลขหน้าแบบย่อ `1 … 4 5 6 … 20` · ถัดไป › · หน้าสุดท้าย » · หน้าปัจจุบันพื้น gradient |
| แถวต่อหน้า | ปุ่มแบบ segmented 10 / 25 / 50 / 100 (กดครั้งเดียว ไม่ต้องเปิด dropdown) → กลับหน้า 1 |
| ไปหน้า | ช่องกรอกเลขหน้า แสดงเมื่อมี ≥ 8 หน้า (`JUMP_FROM_PAGES`) · Enter / ออกจากช่อง = ไป · Esc = ยกเลิก · เลขเกินช่วงปัดเป็นหน้าแรก/สุดท้าย |
| มือถือ (<640) | ปุ่ม ‹ › ใหญ่ซ้าย-ขวา · ตรงกลาง "หน้า [n] / N" พิมพ์เลขหน้าได้ · ซ่อน « » และเลขหน้า · เปลี่ยนหน้าแล้วเลื่อนกลับต้นรายการ |
| แท็บเล็ต (640–1023) | เลขหน้าอยู่บรรทัดบนกึ่งกลาง · ช่วงที่แสดง + แถวต่อหน้าอยู่บรรทัดล่าง |
| ข้อมูลหน้าเดียว | แสดงเฉพาะช่วงที่แสดง + แถวต่อหน้า (`.pager.single`) |
| Accessibility | `<nav aria-label>` · `aria-current="page"` · ปุ่มลูกศรมี `aria-label` + tooltip · แถวต่อหน้าใช้ `aria-pressed` · เปลี่ยนหน้าด้วยคีย์บอร์ดแล้วโฟกัสยังอยู่ที่ปุ่มเดิม · จอสัมผัสปุ่มสูง ≥ 36px |
- เฟส 1 แบ่งหน้าฝั่งเบราว์เซอร์ (ข้อมูลหลักร้อยแถว) · ถ้าเกิน ~2,000 แถว ให้แบ่งหน้าฝั่ง PHP ในเฟส 2: `GET api/employees?page=1&pageSize=25` → `{ "data": [...], "meta": { "page": 1, "pageSize": 25, "total": 2480 } }`

### 10.8 Responsive, ความสูงพอดีจอ & Accessibility
**Desktop (≥1024px) — สูงพอดีจอ:** หน้าต่างไม่เลื่อน · หน้ารายการ (ภาพรวม, ศูนย์ติดตามงาน, พนักงาน, ชุดฟอร์ม, หน่วยงาน) ให้ตารางยืดเต็มความสูงที่เหลือและเลื่อนภายใน (หัวตาราง/แถบแบ่งหน้าอยู่กับที่) · หน้าที่เนื้อหายาว (ประกันกลุ่ม, รายละเอียด, ฟอร์ม) เลื่อนภายในพื้นที่เนื้อหา · ทดสอบแล้วที่ 1440×900 และ 1366×768

| Class | ใส่ที่ | ผล |
|---|---|---|
| `page fit` | `<main id="page">` | หน้านี้พอดีจอ (ไม่ใส่ = เลื่อนภายในพื้นที่เนื้อหาตามปกติ) |
| `fill` | การ์ด หรือ `grid` ที่เป็นลูกโดยตรงของ `.page.fit` | ยืดเต็มความสูงที่เหลือ (ต่ำสุด 260px — จอเตี้ยกว่านั้นจะเลื่อนแทน) |
| `fill-body` | div ที่ใส่ `DataTable` / `ExcelGrid` | ตารางยืดเต็มการ์ด + เลื่อนภายใน |
| `fill-body scroll` | div เนื้อหาทั่วไป (เช่น บันทึกกิจกรรม) | เลื่อนภายใน |
| `label-xl` | ข้อความบนปุ่มในตาราง | ซ่อนเมื่อจอแคบกว่า 1440px (เหลือไอคอน + tooltip) |

**Breakpoints**

| ขนาด | การจัดวาง |
|---|---|
| ≥1280 (desktop) | sidebar + เนื้อหากว้างสุด 1216px · Stat 4 คอลัมน์ |
| 1024–1279 (laptop / tablet แนวนอน) | Stat 4 คอลัมน์แบบกะทัดรัด · การ์ดความเร่งด่วน 3 คอลัมน์ → ตารางยังมีพื้นที่ |
| 768–1023 (tablet แนวตั้ง) | sidebar เป็น drawer (☰) · Stat 2 คอลัมน์ · grid-3 เหลือ 1 คอลัมน์เมื่อ <900 |
| <768 (มือถือ) | **เมนูด้านล่าง 5 ปุ่ม** (ซ่อน ☰) · topbar: ช่องค้นหาชิดโลโก้ ยืดเต็มที่เหลือ · ตารางอ่านอย่างเดียวเป็นการ์ด · **ตาราง Excel ทุกตาราง (รวมพนักงาน) ใช้ตารางเดียวกับจอคอม เลื่อนแนวนอน — เพิ่ม/แก้ในตารางได้ทุกขนาดจอ** |
| <640 (มือถือเล็ก) | Stat 2×2 กะทัดรัด · หัวหน้าเล็กลง ปุ่มเต็มแถว · แจ้งเตือนที่มีหัวข้อแสดงแค่หัวข้อ + ปุ่ม · ปุ่มรีเฟรช/อัตโนมัติเหลือไอคอน (`hide-sm`) |
| จอสัมผัส (`pointer: coarse`) | ปุ่ม/ไอคอน/เลขหน้า/ชิป/ตัวเลือก ≥ 36–40px · ปุ่มกรองหัวคอลัมน์ 32px · ซ่อนป้ายคีย์ลัด `/` |

- **พื้นที่เนื้อหา (`.page`) กว้างเต็มจอ** แต่จำกัดความกว้างเนื้อหาด้วย padding (`--page-max: 1216px`) → หน้าที่เลื่อนภายใน (ฟอร์ม, รายละเอียด) มี scrollbar อยู่ขอบขวาของจอ ไม่ลอยกลางจอ
- utilities: `hide-sm` (ซ่อน <640), `hide-mobile` / `show-mobile` (ซ่อน/แสดง <768)
- ตรวจแล้วที่ 360, 390, 768, 1024, 1280, 1366, 1440, 1920 px: ไม่มีหน้าล้นแนวนอน
- Contrast ≥ WCAG AA ทั้งสองธีม · ทุก input มี `<label>` · ปุ่มไอคอนมี `aria-label` · Toast ใช้ `role="status"` · `lang="th"`

### 10.8.1 ขนาดตัวอักษรของทั้งระบบ (`app/fontSize.js` · เมนู “บัญชีของฉัน → ขนาดตัวอักษร”)
- 4 ระดับ: เล็ก 90% · ปกติ 100% · ใหญ่ 115% · ใหญ่มาก 130% — เก็บใน localStorage `hl-font:<username>` (ต่อผู้ใช้ ต่อเบราว์เซอร์) + `hl-font` (ค่าล่าสุด ใช้ที่หน้า login)
- ใช้ก่อนวาดหน้า: สคริปต์ใน `<head>` ของทุกหน้าตั้ง `--ui-zoom` ที่ `<html>` (เหมือนธีม) · `app/shell.js` ตั้งซ้ำเผื่อหน้าที่ยังไม่มีสคริปต์
- app.css ใช้ px ทั้งหมด จึงย่อ/ขยายด้วย `html { zoom: var(--ui-zoom) }` · ความสูงแบบ vh (หน้า fit, modal) หารด้วย zoom แล้ว · กล่องลอย `position: fixed` ต้องใช้ `cssRect()` ใน `shared/dom.js` แปลงพิกัดจอเป็น CSS px (ทำแล้วใน combobox, ตัวกรองคอลัมน์, หน้า login)
- **หน้าใหม่ต้องใส่ 2 บรรทัดนี้ในสคริปต์ `<head>`** (ต่อจากบรรทัดอ่าน `hl-session`):
  `var f = Number(localStorage.getItem('hl-font:' + (s && s.username)) || localStorage.getItem('hl-font') || 100);`
  `if (f !== 100 && f >= 80 && f <= 150) document.documentElement.style.setProperty('--ui-zoom', f / 100);`

### 10.9 หน้าเข้าสู่ระบบ & การยืนยันตัวตน
- **login.html**: ฝั่งซ้ายเป็นแบรนด์บนพื้น gradient ที่เลื่อนสีช้า ๆ + วงกลมเบลอลอย · ฝั่งขวาเป็นฟอร์มที่เลื่อนขึ้นทีละส่วน · **มือถือ**: แบรนด์อยู่ด้านบน (โลโก้ ชื่อระบบ หัวข้อ + ป้ายจุดเด่น 3 ข้อเลื่อนแนวนอน) แล้วฟอร์มเป็นการ์ดมุมบนโค้งเลื่อนขึ้นทับ · ช่องกรอกสูง 52px ตัวอักษร 16px (iOS ไม่ซูม) · ปุ่มสลับธีมสีขาวบนส่วนแบรนด์
- ฟอร์ม: ชื่อผู้ใช้, รหัสผ่าน (แสดง/ซ่อน, เตือน Caps Lock), จดจำฉัน, ลืมรหัสผ่าน (ข้อความตั้งใน `config.js`), บัญชีทดลอง (เฉพาะ mock — คลิกเพื่อกรอก)
- ผิดพลาด: ช่องสั่น + ข้อความแดง · ระหว่างตรวจ: ปุ่มแสดง spinner
- **สำเร็จ**: ปุ่มเปลี่ยนเป็น ✓ → วงกลม gradient ขยายจากปุ่มเต็มจอ → วาดวง + เครื่องหมายถูก → "ยินดีต้อนรับ, ชื่อ" + แถบโหลด → เข้าหน้าที่ต้องการ (~2 วินาที; ผู้ที่ตั้งลดการเคลื่อนไหวจะข้ามทันที)
- ปรับความเร็วอนิเมชันทั้งหน้า: `--login-speed` ใน `login.css`

| เรื่อง | การทำงาน |
|---|---|
| ป้องกันทุกหน้า | สคริปต์ใน `<head>` ของทุกหน้าตรวจ session ก่อนแสดงผล → ไม่มี = ไป `login.html?next=หน้าเดิม` (ไม่มีเนื้อหาแวบให้เห็น) · `initPage()` ตรวจซ้ำอีกชั้น |
| Session | **mock**: `app/auth.js` เก็บข้อมูลผู้ใช้ใน sessionStorage (ปิดแท็บ = ออก) หรือ localStorage เมื่อเลือก "จดจำฉัน" · หมดอายุตาม `auth.sessionHours` · **server**: sessionStorage เท่านั้น (ชื่อ/บทบาทไว้แสดงผล) — กุญแจจริงคือ cookie HttpOnly ของ PHP ดูข้อ 10.9.1 |
| หลังเข้าสู่ระบบ | กลับหน้าเดิม (`?next=` รับเฉพาะไฟล์ .html ในโฟลเดอร์เดียวกัน กันลิงก์พาไปเว็บอื่น) · ชื่อ + บทบาท + ปุ่มออกจากระบบ ยึดอยู่ล่างสุดของ sidebar (มือถืออยู่ในเมนู drawer) · ทุกกิจกรรมบันทึกชื่อผู้ใช้ |
| ออกจากระบบ | ปุ่มข้างชื่อผู้ใช้ (ล่างสุดของ sidebar) → `login.html?bye=1` |
| ปิดระบบ login | `config.js` → `auth.enabled: false` (เข้าเป็น "ผู้ใช้ทั่วไป" อัตโนมัติ) |
| ผู้ใช้ทดลอง (mock) | `infrastructure/mock/users.js` — ⚠️ ไฟล์นี้ส่งถึงเบราว์เซอร์ ห้ามใส่รหัสผ่านจริง |
| ใครตรวจรหัสผ่าน | `config.js` → `auth.provider`: `'auto'` (mock ↔ apiMode) · `'mock'` · `'server'` = PHP backend แม้ข้อมูลยังเป็น mock (ใช้เมื่อส่งเบิกคลังจริงและต้องรู้ว่าใครขอ) |
| PHP (`backend/`) | ข้อ 10.9.1 · **การตรวจในเบราว์เซอร์ใช้เพื่อการนำทางเท่านั้น ความปลอดภัยจริงอยู่ที่ PHP** |

### 10.9.1 การยืนยันตัวตนฝั่ง PHP (session + refresh token) — ✅ ทำแล้วใน `backend/auth.php`

**หลักการ**: เบราว์เซอร์ไม่เคยถือกุญแจที่ JS อ่านได้ · session ฝั่งเซิร์ฟเวอร์อายุสั้น · "จดจำฉัน" = refresh token ที่หมุนทุกครั้งที่ใช้ · ผู้ทำรายการทุกครั้งมาจาก session
**ข้อจำกัด PHP 5.2.6** (AppServ เหมือน stock_hr): ไม่มี `password_hash`/`random_bytes`/`openssl_random_pseudo_bytes` และ `setcookie()` ใส่ `SameSite` ไม่ได้ → ทำเองตามตารางด้านล่าง (`backend/lib/security.php`, `backend/lib/http.php`)

| ส่วน | รายละเอียด |
|---|---|
| Session | ไม่ใช้ PHP session ในตัว — cookie `HLW_SESSION` = ค่าสุ่ม 256 บิต (hex 64) · ตาราง `auth_sessions` เก็บเฉพาะ `SHA-256` · cookie `HttpOnly` + `SameSite=Lax` + `Secure` (config `cookie_secure`) · path = โฟลเดอร์หน้าเว็บ (เช่น `/hl-welfare/web/`) · ไม่มีวันหมดอายุบน cookie (ปิดเบราว์เซอร์ = หมด) · ฝั่งเซิร์ฟเวอร์หมดเมื่อไม่ใช้งาน `session_idle_minutes` (30) หรือครบ `session_absolute_hours` (12) · ค่าใหม่ทุกครั้งที่ login/refresh/เปลี่ยนรหัสผ่าน (ค่าเก่าถูกเพิกถอน — กัน session fixation) · เก็บใน DB จึงใช้หลายเครื่องเซิร์ฟเวอร์ได้ และเพิกถอนทุกเครื่องของผู้ใช้ได้ |
| ตรวจทุกคำขอ | อ่านผู้ใช้จากตาราง `users` ใหม่ทุกครั้ง: `is_active = 0` หรือ `session_version` ไม่ตรง (เปลี่ยนรหัสผ่าน/ปิดบัญชี) → 401 ทันทีทุกเครื่อง · `last_seen_at` เขียนไม่เกินนาทีละครั้ง |
| Refresh token | ค่าสุ่ม 256 บิต · `auth_refresh_tokens.token_hash` = `SHA-256` เท่านั้น (+ `user_id`, `family_id`, `expires_at` 30 วัน, `created_ip`, `user_agent`, `revoked_at`, `revoked_reason`, `replaced_by` + คอลัมน์ audit 4 ตัว) · cookie `HLW_REFRESH`: `HttpOnly` + `SameSite=Lax` + `Secure` · **path = `<api>/auth`** เช่น `/hl-welfare/web/api/index.php/auth` (ส่งไปเฉพาะ endpoint ของ auth) · **ห้ามเก็บโทเคนใน localStorage/sessionStorage** |
| หมุนโทเคน | `POST /auth/refresh` ใน transaction (`SELECT … FOR UPDATE`): ตัวเดิม `revoked_reason = ROTATED`, `replaced_by` = ตัวใหม่ (family เดิม) แล้วเริ่ม session ใหม่ |
| ตรวจจับโทเคนรั่ว | ใช้ตัวที่ `ROTATED` แล้วซ้ำ → เพิกถอน**ทั้ง family** (`REUSE`) + `audit_log` `USER/TOKEN_REUSE` + 401 → เจ้าของตัวจริงต้อง login ใหม่ · ภายใน `refresh_grace_seconds` (10) หลังหมุน = สองแท็บต่ออายุพร้อมกัน → 409 `REFRESH_RACE` (ไม่เพิกถอน หน้าเว็บถาม `/auth/me` แล้วลองใหม่) · ตัวที่ถูกเพิกถอนด้วยเหตุอื่น/หมดอายุ → 401 เฉย ๆ |
| ออกจากระบบ | เพิกถอน family ของโทเคนในเบราว์เซอร์นี้ (`LOGOUT`) + เพิกถอน session + ลบทั้ง 2 cookie · login ใหม่โดยไม่เลือกจดจำฉัน ก็เพิกถอนโทเคนเดิมของเบราว์เซอร์นั้นด้วย |
| เปลี่ยนรหัสผ่าน | `POST /auth/password` (หรือ `bin/user.php password`) → `session_version + 1` + เพิกถอนทุก refresh token และทุก session ของผู้ใช้ (`PASSWORD_CHANGE`) · เครื่องที่เปลี่ยนได้ session ใหม่ แต่ต้องเลือกจดจำฉันใหม่ · รหัสผ่านใหม่ ≥ 8 ตัว ไม่เหมือนชื่อผู้ใช้ |
| รหัสตั้งต้น 4123 | ผู้ดูแล (`users.manage`) สร้างผู้ใช้โดยไม่ใส่รหัส หรือกด “รีเซ็ตรหัสผ่านเป็น 4123” → `AUTH_DEFAULT_PASSWORD` (backend/auth.php) · 4123 เป็นรหัสเดียวที่ยกเว้นความยาวขั้นต่ำ (ผู้ดูแลตั้งรหัสเองต้อง ≥ 8 ตัว) · รีเซ็ต = ออกจากระบบทุกอุปกรณ์ · ทุกครั้งที่ผู้ดูแลตั้ง/รีเซ็ตให้ → `users.must_change_password = 1` (migration 009) |
| บังคับเปลี่ยนรหัส | `must_change_password = 1` → route guard ตอบ 403 `PASSWORD_CHANGE_REQUIRED` ทุก API ยกเว้น `/auth/me`, `/auth/password` · หน้าเว็บ (app/shell.js) พาไป `account.html?force=1&next=…` · ผู้ใช้ตั้งรหัสเอง (≥ 8 ตัว ไม่ใช่ 4123 ไม่ซ้ำรหัสเดิม) → flag = 0 แล้วกลับหน้าเดิม · บัญชี SUPER_ADMIN รีเซ็ตได้เฉพาะ SUPER_ADMIN |
| รหัสผ่าน | **PBKDF2-HMAC-SHA256** (RFC 8018 — ตรวจกับ test vector ของ RFC 7914 แล้ว) salt สุ่ม 16 byte · 60,000 รอบ (~120 ms) · เก็บ `pbkdf2_sha256$รอบ$salt$hash` · เทียบแบบเวลาคงที่ · เปลี่ยนจำนวนรอบ → hash ใหม่ตอน login · ไม่พบผู้ใช้ก็ยังคำนวณกับ hash หลอก (เวลาเท่ากัน) · ข้อความผิดเหมือนกันทุกกรณี · ชื่อผู้ใช้เก็บตัวเล็ก · ขึ้น PHP ≥ 5.5 แล้วเปลี่ยนเป็น `password_hash` ได้โดยให้ `pw_verify` รับรูปแบบเดิมต่อ |
| ค่าสุ่ม | `/dev/urandom` (Linux) · Windows ใช้ `com_create_guid()` 3 ตัว (CoCreateGuid = CSPRNG ของ Windows, สุ่มจริง 122 บิต/ตัว) รวมกับค่าอื่นแล้วกลั่นด้วย SHA-256 · หาแหล่งสุ่มไม่ได้ = error (ไม่ถอยไปใช้ `mt_rand`) |
| จำกัดการเดา | ตาราง `auth_login_attempts` · ผิด ≥ 5 ครั้งต่อชื่อผู้ใช้ (นับหลังเข้าสำเร็จครั้งล่าสุด) หรือ ≥ 20 ครั้งต่อ IP ภายใน 15 นาที → 429 + `Retry-After` (รหัสถูกก็ไม่ให้เข้าจนพ้นช่วง) |
| CSRF | cookie `SameSite=Lax` + คำขอที่เปลี่ยนข้อมูลต้องเป็น `Content-Type: application/json` (415) + ตรวจ `Origin`/`Sec-Fetch-Site` (403) — `csrf_check()` |
| ผู้ใช้ | หน้า `admin.html` (SUPER_ADMIN — ข้อ 12.4) หรือ CLI `backend/bin/user.php create|password|disable|list` · username ควรตรงกับ `tb_user.username` ของ stock_hr (สต็อกใช้ส่งลิงก์เซ็นรับให้ผู้ขอเบิก) |

**ลำดับในหน้าเว็บ** (`apiMode = 'http'` → `auth.provider` = `'server'` อัตโนมัติ)
1. login.html → `POST api/index.php/auth/login {username, password, remember}` → เก็บ `AuthUser` ใน **sessionStorage** (ไว้แสดงชื่อ/นำทาง) → ไปหน้าที่ต้องการ
2. ทุกคำขอส่ง cookie เอง (`credentials: 'include'`) · ได้ 401 → `POST …/auth/refresh` ครั้งเดียวแล้วลองคำขอเดิมใหม่ (คำขอพร้อมกันใช้ refresh ร่วมกัน) · ไม่ได้ → ล้าง sessionStorage → `login.html?next=หน้าเดิม`
3. เปิดเบราว์เซอร์ใหม่ (sessionStorage ว่าง) → สคริปต์ใน `<head>` พาไป login.html → `restore()` = `GET /auth/me` (session ยังอยู่) หรือ `POST /auth/refresh` (เลือกจดจำฉันไว้) → สำเร็จ = เข้าหน้าเดิมทันทีโดยไม่ต้องกรอกรหัส
4. ออกจากระบบ → `POST /auth/logout` → `login.html?bye=1` (หน้านี้ไม่ restore)

**ผู้ทำรายการ (actor attribution)**
- ทุกการเขียนใช้ผู้ใช้จาก `auth_require()` ไม่ใช่จาก body: `uniform_issues.issued_by_user_id + issued_by_name`, `insurance_batches.submitted_by_user_id + submitted_by_name`, `audit_log.user_id + user_name` (ชื่อ ณ ตอนนั้น — เปลี่ยนชื่อผู้ใช้ภายหลังประวัติไม่เปลี่ยน) · `issuedBy` ที่หน้าเว็บส่งมาถูกทิ้ง · `template.uploadedBy` ของแบบฟอร์มประกันใส่จาก session เมื่ออัปโหลดไฟล์ใหม่
- ส่งเบิกชุดฟอร์มไป stock_hr (`/uniform/stock-requests`, ยกเลิก `DELETE /uniform/issues/{id}`, ตัวกลาง `/stock/bridge`): backend ใส่ `requested_by_name`, `requested_by_user` (username), `requested_by_user_id`, `requested_by_emp_code` (`users.emp_code`) จาก session เสมอ — stock_hr เก็บใน `tb_doc_welfare` (migration 079 ฝั่ง stock_hr) และใช้ `requested_by_user` ส่งลิงก์เซ็นรับ
- ออก/ยกเลิกใบเบิกได้เฉพาะ `HR_ADMIN`, `HR_COMPANY` (403) · ดูตัวเลือก/สถานะได้ทุกบทบาทที่เข้าสู่ระบบ

**ไฟล์**: `backend/auth.php` · `backend/lib/security.php` · `backend/lib/http.php` (cookie/CSRF) · หน้าเว็บ `infrastructure/http/serverAuth.js`, `app/api.js` (`authApi`, `AUTH_PROVIDER`), `app/auth.js`, `pages/login.js`

### 10.9.2 การแจ้งเตือน (กระดิ่งบนแถบบน — `app/notifications.js` · แนวเดียวกับระบบสต็อก Uniform)
- **กระดิ่ง** ทุกหน้า: ตัวเลขเรื่องที่ยังไม่อ่าน (แดง · 99+) · ถามใหม่ทุก 90 วินาที + ทันทีที่กลับมาที่แท็บ (เงียบ ไม่ขึ้น loading) · หน้าชุดฟอร์มซิงก์สต็อกแล้วรีเฟรชตัวเลขทันที (event `hl:notifications-refresh`)
- **กล่องรายการ**: 10 เรื่องล่าสุด จัดกลุ่มตามวัน (วันนี้ / เมื่อวาน / วันที่ — หัวกลุ่มติดบน) · **เลื่อนลงใกล้ท้าย = โหลดเพิ่มทีละ 10** · ยังไม่อ่าน = พื้นฟ้า + จุด · กดรายการ = อ่านแล้ว + ไปหน้าปลายทาง (`employee.html?id=` เปิด popup · ลิงก์ที่เปลี่ยนหน้ารอบันทึกการอ่านก่อนไม่เกิน 1.5 วินาที) · "อ่านทั้งหมด" · Esc / คลิกนอกกล่อง = ปิด · มือถือกล่องเต็มความกว้าง
- **แจ้งเตือนนอกหน้าเว็บ** (สวิตช์ท้ายกล่อง — Web Notifications API): เด้งที่มุมจอเมื่อมีเรื่องใหม่ แม้สลับไปทำอย่างอื่น (ต้องเปิดหน้าระบบค้างไว้ในแท็บใดแท็บหนึ่ง · ปิดเบราว์เซอร์แล้วไม่เด้ง — ต้องใช้ push server + https) · ใหม่เกิน 3 เรื่องรวบเป็นกล่องเดียว · ไม่เด้งของเก่าย้อนหลังตอนเพิ่งเปิด · เปิดครั้งแรกเด้ง "ทดสอบการแจ้งเตือน" · **เบราว์เซอร์อนุญาตเฉพาะ https หรือ localhost** — เปิดผ่าน http://<IP> สวิตช์ใช้ไม่ได้และบอกเหตุผล · เคยกดไม่อนุญาต = บอกวิธีเปิดที่รูปแม่กุญแจ · เก็บต่อเครื่อง/ต่อผู้ใช้ใน localStorage (`hl-desktop-noti:<username>`, `hl-desktop-seen:<username>`)
- **เรื่องที่แจ้ง** (`backend/usecases/notifications.php` · ข้อความชุดเดียวกับ `application/usecases/notifications.js`):

| ประเภท | เมื่อ | ถึงใคร | ลิงก์ |
|---|---|---|---|
| `stock_approved` | ผู้อนุมัติในสต็อกอนุมัติใบเบิกชุดฟอร์ม | HR ที่ส่งเบิก (บัญชีถูกปิด/ไม่มี → ผู้มีสิทธิ์ `stock.request` ของบริษัทนั้น) | รายละเอียดพนักงาน |
| `stock_rejected` · `stock_cancelled` | ไม่อนุมัติ (พร้อมเหตุผล) · คลังยกเลิก — สิทธิ์กลับเป็นค้างแจก | เหมือนบน | รายละเอียดพนักงาน |
| `stock_issued` · `stock_received` | คลังจ่ายแล้ว · พนักงานเซ็นรับแล้ว | เหมือนบน | รายละเอียดพนักงาน |
| `insurance_urgent` | บันทึกพ้นสภาพแบบเลิกจ้าง / กระทำผิด | ผู้มีสิทธิ์ `insurance.submit` ที่ดูแลบริษัทนั้น (ไม่รวมคนที่บันทึก · บัญชีที่ปิด) | ประกันกลุ่ม › แจ้งออกทันที |

- ตาราง `notifications` (`backend/sql/013_notifications.sql` — 1 แถวต่อผู้รับ 1 คน · audit 4 คอลัมน์) · ยังไม่รัน 013 = กระดิ่งว่าง ไม่ error · สร้างแจ้งเตือนไม่สำเร็จไม่ทำให้งานหลักล้ม · โหมด mock แจ้งทุกเรื่องถึงผู้ใช้ปัจจุบัน (มีผู้ใช้คนเดียว)

### 10.10 แนะนำการใช้งาน (driver.js)
- ทุกหน้า **และทุกแท็บ** มี "ทัวร์" สั้น ๆ 2–12 ขั้น ไฮไลต์ส่วนสำคัญพร้อมคำอธิบายภาษาไทย — 23 ชุด: ภาพรวม (สรุป/คิวงาน/กิจกรรม) · พนักงาน · รายละเอียดพนักงาน · ประกันกลุ่ม (+ประวัติการส่งออก) · ชุดฟอร์ม (ค้างแจก/รอคลังจ่าย/ประวัติ) · เงื่อนไขสวัสดิการ (กฎ/ค่าตั้งค่า/รอมีผล) · หน่วยงาน · แบบฟอร์มประกัน (+แก้แบบฟอร์ม) · บัญชีของฉัน · ผู้ดูแลระบบ (ผู้ใช้/สิทธิ์/การเข้าสู่ระบบ/สถานะ/ตั้งค่า/บันทึก)
- ขั้นที่ขึ้นกับสิทธิ์หรือข้อมูล (ปุ่มแก้ไข, ส่งเบิกคลัง, รายการรอมีผล, ข้อความดูอย่างเดียว) ถูกข้ามเองเมื่อไม่มีในหน้า · หน้าบัญชีของฉันไม่เปิดแนะนำทับตอนถูกบังคับตั้งรหัสใหม่
- ตรวจแล้วทุกชุดบนข้อมูลจริงที่ 1366×800 และขนาดตัวอักษร 130% (CSS zoom) — ไฮไลต์ตรงตำแหน่ง
- **เปิดอัตโนมัติครั้งแรก**ที่ผู้ใช้เข้าแต่ละหน้า (รอข้อมูลโหลดก่อน) · เปิดซ้ำได้ที่ปุ่ม **?** บนแถบด้านบน · หรือเปิดลิงก์ด้วย `?tour=1`
- ขั้นที่หา element ไม่เจอ/ถูกซ่อน จะถูกข้ามอัตโนมัติ (เช่น ไม่มีรายการด่วน, เมนูซ้ายบนมือถือ)
- ระบบเลื่อนภายในกล่อง (`.page`, ตาราง) ไม่ใช่หน้าต่าง → `app/tour.js` เลื่อน element มากลางจอก่อนไฮไลต์ทุกขั้น และสั่ง `refresh()` เมื่อกล่องใดเลื่อน (`smoothScroll: false`) จึงไฮไลต์ตรงตำแหน่งเสมอ — ตรวจแล้วทุกขั้นของ ฟอร์ม / รายละเอียด / ประกันกลุ่ม / พนักงาน ที่ 1920×1000 (ต่าง 0px)
- ระบบจำว่าดูแล้วแยกต่อหน้า (localStorage) · ไฟล์ driver.js โหลดเมื่อใช้งานเท่านั้น
- กล่องแนะนำใช้สี/ฟอนต์จาก design tokens จึงเปลี่ยนตามโหมดมืดอัตโนมัติ

| ต้องการ | แก้ที่ |
|---|---|
| เปิด/ปิดทั้งระบบ, ปิดเปิดอัตโนมัติ, ซ่อนปุ่ม ? | `tour/tour.config.js` → `enabled`, `autoStart`, `showHelpButton` |
| ข้อความปุ่ม, ความทึบพื้นหลัง, ระยะขอบไฮไลต์, ห้ามคลิกส่วนที่ไฮไลต์ ฯลฯ | `tour/tour.config.js` → `driver: { … }` (ส่งให้ driver.js ตรง ๆ — [ตัวเลือกทั้งหมด](https://driverjs.com/docs/configuration)) |
| แก้/เพิ่ม/ลบขั้นของแต่ละหน้า | `tour/steps.js` → `{ element, title, text, side, align }` |
| ให้ผู้ใช้เห็นแนะนำใหม่หลังแก้เนื้อหา | เฉพาะหน้าที่แก้: ใส่/เพิ่ม `version` ของหน้านั้นใน `steps.js` · ทุกหน้า: เพิ่ม `version` ใน `tour.config.js` |
| สีกล่อง / ปุ่ม / ลูกศร | `app.css` หัวข้อ "Tour" (`.driver-popover.hl-tour`) |
| เพิ่มแนะนำให้หน้าใหม่ | เพิ่มคีย์ใน `steps.js` ให้ตรงกับ `initPage('id')` (หรือ `initPage('menu', { tour: 'id' })` เมื่อ id ของเมนูกับแนะนำต่างกัน) |
| ปิดแนะนำอัตโนมัติในเครื่องทดสอบ | Console: `localStorage.setItem('hl-tour-disabled', '1')` |
| หน้าที่มีหลายแท็บ ให้แต่ละแท็บมีคำแนะนำของตัวเอง | `initPage('dashboard', { tour: () => 'dashboard-' + tab })` + เรียก `startTourIfNew(id)` เมื่อเปลี่ยนแท็บ (ดู `pages/dashboard.js`) |

ตัวอย่างขั้นใน `steps.js`:
```js
employees: {
  ready: '.xgrid td[data-r]',             // รอให้ตารางโหลดก่อนเริ่ม
  steps: [
    { element: '#filters', title: 'ค้นหาและกรอง', text: 'ทุกช่องเลือก <b>พิมพ์เพื่อค้นหาได้</b>', side: 'bottom' },
    { title: 'ไม่มี element = กล่องกลางจอ', text: 'ใช้เป็นข้อความต้อนรับ' },
  ],
},
```

---

## 11. หน้าจอ (Pages)

| หน้า | องค์ประกอบ | UX ที่ต้องมี |
|---|---|---|
| **เข้าสู่ระบบ** | ฟอร์มชื่อผู้ใช้/รหัสผ่าน · จดจำฉัน · บัญชีทดลอง (mock) | ข้อ 10.9 · อนิเมชันเมื่อสำเร็จ |
| **ภาพรวม & ติดตามงาน** (`index.html`) | **หน้าเดียว ไม่มีแท็บ — ทั้งหน้าเป็น bento dashboard** (`#bento` · grid 12 คอลัมน์ · สูงตามเนื้อหา เลื่อนทั้งหน้า): แถว 1–2 ① **รอบแจ้งประกันถัดไป** ช่องใหญ่ 7×2 พื้นไล่สี (วันที่ · นับถอยหลังตัวใหญ่ · แจ้งเข้า/ออก กดไปหน้าประกันกลุ่ม · ปุ่มส่งออกไฟล์) ② **แจ้งออกทันทีค้าง** (แดงทั้งช่องเมื่อมีค้าง) ③ **ชุดฟอร์มค้างแจก** · แถว 3 (ช่องละ 1/3) ④ **พนักงานปัจจุบัน** ตัวเลข + แถบสัดส่วนแยกบริษัท + รายบริษัท ⑤ **จะครบสิทธิใน 30 วัน** ตาราง 5 คนต่อหน้า (แถบแบ่งหน้าแบบย่อ) ⑥ **บันทึกกิจกรรม** (`#activity` · เลื่อนในช่อง สูงสุด 520px · กรองประเภท · โหลดเพิ่ม) · แถว 4 ⑦ **คิวงาน** (`#queue` เต็มแถว · ตัวเลข ด่วน/ต้องทำ/ติดตาม = ปุ่มกรอง กดซ้ำยกเลิก · chip ประเภทงาน · ค้นหา · ตาราง) · จอ < 1280px: ช่องใหญ่/กิจกรรม/คิวงานเต็มแถว ช่องอื่นครึ่งแถว · มือถือทีละช่อง · ลิงก์เก่า `?tab=queue|activity` (monitor.html) = เลื่อนไปช่องนั้น | Stat คลิกไปหน้าที่เกี่ยวข้อง · แจ้งออกทันทีค้าง > 0 → Alert แดงด้านบน + ปุ่ม "ไปส่งแจ้ง" |
| **พนักงาน** | **นำเข้า Excel** (ปุ่มในแถบเครื่องมือ · สิทธิ์ `employees.edit` · `pages/_employeeImport.js` + `application/usecases/employeeImport.js`): ไฟล์ "เข้าใหม่" / "ลาออก" ประจำเดือนของ HR (.xlsx/.xls) **หรือ template 2 ชีต** (อ่านทุกชีตที่มีรายชื่อ ชีตว่างข้าม · `planWorkbookImport` รวมเป็นแผนเดียว · คนที่อยู่ทั้งชีตเข้าใหม่และลาออก = เพิ่มแถวเดียวเป็นพ้นสภาพ · สรุปบอกชีต · แถว) — หาแถวหัวตารางเอง (แถวที่มี "รหัสพนักงาน") จับคอลัมน์ตามชื่อหัว · มีคอลัมน์ "วันพ้นสภาพ" = ไฟล์ลาออก · วันที่ปี พ.ศ. → ค.ศ. · "นายสมชาย ใจดี" → คำนำหน้า/ชื่อ/สกุล/เพศ · "ระดับ 3" → 3 · **เข้าใหม่** = แถวใหม่ (ประเภท: คอลัมน์ "ประเภทพนักงาน" ถ้ากรอก (Pro Site ต้องเป็น PRO) ไม่งั้นเดา: PRO + หน่วยงาน "PRO/FM/…" หรือ "Pro Site …" = Pro Site · CNS + แม่บ้าน = แม่บ้าน CNS · อื่น = ส่วนกลาง · หน่วยงานจับคู่ชื่อในบริษัทเดียวกัน · ฝ่ายจับคู่กลุ่ม/ฝ่ายของระบบ · ที่เดาไม่ได้ปล่อยว่างเป็นช่องแดง) รหัสซ้ำในระบบ/บริษัทไม่รู้จัก = ข้าม · **ลาออก** = แก้พนักงานเดิมตามรหัส → พ้นสภาพ + วันพ้นสภาพ (= วันทำงานสุดท้ายไว้ก่อน) + เหตุผลจากหมายเหตุ (ขาดงาน/ขางาน = ขาดงาน 3 วัน · ทุจริต/กระทำผิด = กระทำผิด · เลิกจ้าง · อื่น = ลาออก) · พ้นสภาพแล้ว = ข้าม · ไม่พบในระบบ = ข้าม หรือติ๊ก "เพิ่มเป็นพนักงานที่พ้นสภาพ" · **Template / ส่งออกรายเดือน** (ปุ่มข้าง "นำเข้า Excel" · `openTemplateDialog` · ExcelJS): ไฟล์ 2 ชีต "เข้าใหม่" / "ลาออก" หัวตารางแถว 2 ชุดเดียวกับไฟล์ HR + "ประเภทพนักงาน" (`TEMPLATE_SHEETS`) · แช่แข็งหัว · วันที่เป็นเซลล์วันที่แสดงปี พ.ศ. (`[$-th-TH]d/m/bbbb`) · รหัส/เลขบัตรเป็นข้อความ · ช่องเลือก บริษัท / ระดับ / ประเภท / หมายเหตุลาออก (`OUT_NOTE_HINTS`) · คำอธิบายที่หัวคอลัมน์ — **template เปล่า** หรือ **ส่งออกเข้า-ออกของเดือน** (`monthlyTemplateRows`: เข้าใหม่ = วันเริ่มงานในเดือน · ลาออก = พ้นสภาพและวันพ้นสภาพในเดือน · Pro Site เขียนหน่วยงานเป็น "PRO/FM/<ไซต์>" · หมายเหตุ = เหตุผลพ้นสภาพ · ไฟล์ "เข้า-ออก เดือน<เดือน> <ปี พ.ศ.>.xlsx") → นำเข้ากลับได้ค่าเดิม · **กล่องสรุปก่อนนำเข้า** (เพิ่ม / บันทึกพ้นสภาพ / ข้าม + เหตุผลรายแถว + สิ่งที่ต้องตรวจ) → ใส่ในตารางเป็นแถว**ยังไม่บันทึก** (เขียว/เหลือง · `ExcelGrid.stage`) + ล้างตัวกรองให้เห็นทุกคน + แสดงเฉพาะที่ยังไม่บันทึก (ปุ่มสลับในแถบยังไม่บันทึก) → HR ตรวจช่องแดงแล้วกด "บันทึก" (ไม่บันทึกอะไรก่อนกด) · หน่วยงานที่ยังไม่ได้เลือก (0) ไม่ถูกเดาให้เมื่อแก้ช่องอื่น · **คำนวณให้อัตโนมัติ:** คอลัมน์ **อายุ** (จากวันเกิด ณ วันนี้ — แก้ไม่ได้) · **ผ่านทดลองงาน** = วันเริ่มงาน + 119 วัน (แถวใหม่/แก้วันเริ่มงาน → เลื่อนตาม เว้นแต่แก้เองไว้ · ล้างค่า = คำนวณใหม่ · บันทึกแล้วว่าง = backend เติมให้ · ข้อมูลเดิมที่ว่างเติมด้วย `backend/sql/012_probation_autofill.sql`) · รายละเอียดพนักงานแสดง "วันเกิด / อายุ" · **ช่องค้นหา** รหัส/ชื่อ + **แท็กกรองเร็ว** สถานะ / ประเภท / บริษัท (กลุ่มละ 1 ค่า แตะซ้ำ = ยกเลิก · ตัวเลขบนแท็ก = จำนวนที่จะได้ นับตามคำค้นและแท็กกลุ่มอื่น · "ล้างแท็ก" · เก็บใน URL `?q=&status=&type=&company=` · มือถือแท็กเป็นแถวเดียวปัดซ้าย-ขวา · กำหนดกลุ่มที่ `TAG_GROUPS` ใน `pages/employees.js`) · **ตาราง Excel = CRUD ทั้งหมด (ไม่มีฟอร์มเต็มแล้ว)** — คอลัมน์: รหัส ชื่อ นามสกุล บริษัท หน่วยงาน ประเภท ฝ่าย ระดับ วันเกิด อายุ วันเริ่มงาน ผ่านทดลองงาน · **ข้อมูลแจ้งประกัน** คำนำหน้า (เลือกแล้วเลือกเพศให้) เพศ เลขบัตร (ตรวจหลักสุดท้าย) โทร อีเมล · **สถานะ / เหตุผลพ้นสภาพ / ทำงานวันสุดท้าย / วันพ้นสภาพ** · **ไม่มีเงินเดือนในระบบ** (ไม่ต้องกรอก) · **ไม่มีคอลัมน์ตำแหน่ง / สัญญาในตาราง** (ตำแหน่งยังรับจากไฟล์นำเข้า "ชื่อตำแหน่ง" — ใช้จับกฎชุดฟอร์ม Pro Site · สัญญาแถวใหม่ = ปกติ ค่าเดิมคงไว้) · **ไม่ตรวจ/ไม่บังคับเงินเดือนและตำแหน่ง** ทั้งหน้าเว็บ (`validateEmployee`) และ backend (`validate_employee`) — Pro Site ไม่มีตำแหน่งบันทึกได้ · "+ เพิ่มแถว" · ปุ่มเปิดรายละเอียด / ลบ ท้ายแถว | ค้นหาแบบ debounce 250ms · ล้างตัวกรอง · บันทึกอัตโนมัติรายแถว · ลบต้องยืนยัน |
| **รายละเอียดพนักงาน** | **เปิดเป็น popup** — ลิงก์ `employee.html?id=` จากทุกหน้า (ชื่อพนักงานในตาราง, ปุ่มเปิดในตารางพนักงาน, คิวงาน) เปิดรายละเอียดซ้อนบนหน้าเดิม ไม่เปลี่ยนหน้า (Ctrl/⌘-คลิก หรือปุ่ม "เปิดเต็มหน้า" ใน popup = หน้าเต็ม `employee.html?id=` เนื้อหาเดียวกัน · `pages/_employeeDetail.js`) · บันทึกแจก/ส่งเบิกใน popup แล้วหน้าที่เปิดอยู่รีเฟรชเอง (event `employee:changed`) · popup ซ้อนกัน Esc ปิดเฉพาะอันบนสุด · Header: Avatar, ชื่อ, รหัส, Badge สถานะ, ปุ่มแก้ไข · แถบข้อมูลย่อ (บริษัท, หน่วยงาน, ประเภท, สัญญา, อายุงาน) · การ์ดประกันกลุ่ม · การ์ดชุดฟอร์ม (ตารางแต่ละรอบ + เลือกไซซ์ + "บันทึกแจก" + ยกเลิกการแจก) · **ประวัติการเปลี่ยนแปลง** | การ์ดสิทธิ = Badge ใหญ่ + timeline (เริ่มงาน → ครบสิทธิ → รอบแจ้งเข้า → แจ้งออก) · ไม่มีสิทธิ = แสดงเหตุผลเป็นข้อๆ |
| **ประกันกลุ่ม** | เลือกรอบ (เดือนละ 2 รอบ: วันที่ 5 พนักงานทั่วไป · วันที่ 6 พนักงานรายวัน · ย้อนหลัง 6 / ล่วงหน้า 3 เดือน) · **แท็บ**: แจ้งออกทันที / แจ้งเข้า / แจ้งออก / ประวัติการส่งออก — ตัวเลขบนแท็บ = จำนวนยังไม่ส่งออก (แดง/ฟ้า/เหลือง) · คอลัมน์ "บริษัทประกัน" · **ไม่มีปุ่มส่งแจ้ง/checkbox** · ปุ่ม **"ส่งออกไฟล์แจ้งประกัน"** → modal: การ์ดต่อบริษัทประกัน (จำนวนเข้า/ออกต่อบริษัท, เลขกรมธรรม์, เตือนข้อมูลไม่ครบพร้อมลิงก์แก้, ดาวน์โหลด Excel / CSV) + ติ๊ก "บันทึกว่าแจ้งรอบนี้แล้ว" + เตือนบริษัทที่ยังไม่ผูกแบบฟอร์ม (ข้อ 7.4) · **แท็บประวัติการส่ง**: 1 แถว = ส่งออก 1 ครั้ง · คอลัมน์ "เข้า / ออก" (จำนวนแจ้งเข้า · แจ้งออกทันที · แจ้งออก) · คอลัมน์ "รายชื่อ" (2 ชื่อแรก + "+N" · ค้นหาชื่อที่หัวคอลัมน์ได้) · **คลิกแถว / "ดูรายชื่อ" → modal รายชื่อใน batch** (ประเภทแจ้งต่อแถว, รหัส-ชื่อ ลิงก์ไปหน้าพนักงาน, บริษัท·ประเภท, หน่วยงาน, วันครบสิทธิ/วันมีผล, เหตุผล · ค้นหาในรายชื่อเมื่อ > 5 ราย · ส่งออก CSV เฉพาะ batch · ยกเลิกการส่ง) · ลิงก์ตรง `?batch=<id>` · **ยกเลิก batch** · **คอลัมน์ "จัดการ" เป็นปุ่มไอคอน** (มี tooltip): ดูรายชื่อ · **ดาวน์โหลดไฟล์แจ้งประกันอีกครั้ง** (ไฟล์หาย — Excel ตามแบบฟอร์มปัจจุบัน รายชื่อเดิมของครั้งนั้น ไม่บันทึกประวัติซ้ำ · ไม่มีแบบฟอร์ม Excel → CSV · มีปุ่มเดียวกันใน modal รายชื่อ) · ยกเลิก | ตัวนับในหัว section · เลือกทั้งหมด · Modal ยืนยัน "ส่งแจ้งเข้า 5 ราย รอบ 5 พ.ย. 69?" · แถวที่ส่งแล้วแสดง Badge เขียว checkbox ปิด |
| **แบบฟอร์มประกัน** (`insurers.html`, เมนูตั้งค่า) | **ภาพรวม**: ① การ์ดบริษัทประกัน (ไฟล์ Excel · ชีต · จำนวนคอลัมน์/ช่องที่เติม · ผู้อัปโหลด · บริษัทที่ผูก · แก้ไข / ดาวน์โหลดไฟล์ Excel) ② **ตาราง ExcelGrid** "บริษัทในเครือส่งแจ้งกับบริษัทประกันไหน" แบบเดียวกับหน้าอื่น (บริษัทในเครือ · ส่งแจ้งกับ [เลือก/ไม่ส่งแจ้ง + ป้ายเตือน ปิดอยู่/ยังไม่มีไฟล์] · เลขกรมธรรม์ · ผู้ถือกรมธรรม์ · แผน — แก้ในเซลล์ สีเหลือง = ยังไม่บันทึก · กดบันทึก) · **แก้แบบฟอร์ม** (`?id=`): หน้าเดียว — ซ้าย: ไฟล์ Excel ของบริษัทประกัน (ชื่อ/ชื่อย่อ + ลากวางไฟล์ · สรุปจุดที่ระบบเติม) + การตั้งค่า · ขวา: ตัวอย่างพร้อมข้อมูลสมมติ (อัปเดตเอง · เปิดใน Excel) | ยังไม่มีไฟล์ → กล่องขวาบอกให้อัปโหลดก่อน · เตือนไฟล์ .xls · แจ้งว่าล้างรายชื่อในไฟล์ก่อนเก็บ · มีงานค้างแล้วออก → ถามก่อน |
| **ชุดฟอร์ม** | แท็บ "ค้างแจก" (เลือกไซซ์ + บันทึกแจกในแถว) / "ประวัติการแจก" · สรุปจำนวนตามแบบเสื้อ (วางแผนสั่งผลิต) | แถวเกินกำหนด > 30 วัน Badge แดง · บันทึกแล้วแถวหายพร้อม Toast |
| **เงื่อนไขสวัสดิการ** | แท็บ: ประกันกลุ่ม / ชุดฟอร์ม / ค่าตั้งค่า (read-only ในเฟส 1) + รายการประเด็นที่รอยืนยันกับ HR · **กลุ่ม / ฝ่าย** (ท้ายแท็บค่าตั้งค่า · สิทธิ์ `rules.edit` · `backend/api/dept_groups.php` · `application/deptGroupRules.js` · ตาราง `dept_groups` จาก `sql/014`): จำเป็น — พนักงานส่วนกลางต้องมีกลุ่ม และกฎชุดฟอร์มส่วนกลางแยกจำนวนตามกลุ่ม · ตาราง ชื่อ / จำนวนพนักงาน / จำนวนกฎ (ใช้อยู่+รอมีผล) · เพิ่ม (ต่อท้าย · ชื่อห้ามว่าง/ซ้ำไม่สนตัวพิมพ์/มี ",") · **เปลี่ยนชื่อ = แก้ชื่อในพนักงาน + กฎชุดฟอร์มทุกฉบับรวมประวัติ** (เก็บเป็นชื่อ ไม่ใช่ id) · **ลบได้เฉพาะกลุ่มที่ไม่มีพนักงานและไม่มีกฎที่ใช้อยู่/รอมีผล** (409) · ตารางพนักงาน / ฟอร์มกฎ / นำเข้า Excel (จับคู่ฝ่าย ชื่อยาวก่อน) ใช้รายการนี้ · ยังไม่รัน 014 = ใช้รายการตั้งต้นในโค้ด (`DEPT_GROUPS`) แก้ไม่ได้ · ฟอร์มกฎชุดฟอร์มไม่มีช่องตำแหน่งแล้ว | |
| **หน่วยงาน** | **ตาราง Excel**: บริษัท, ชื่อ, สวิตช์ประกันกลุ่ม, สีโปโล · "+ เพิ่มหน่วยงาน" · ลบท้ายแถว (ไม่มีคอลัมน์รหัส) | สีเพิ่ม/แก้ไข/ลบ + กดบันทึก · ลบได้เฉพาะที่ไม่มีพนักงาน |

**ไฟล์ของแต่ละหน้า:** `web/<หน้า>.html` + `web/assets/js/pages/<หน้า>.js` (ภาพรวม = `index.html` + `dashboard.js`) — ดูตารางพารามิเตอร์ URL ที่ข้อ 5.3

**UI** — ภาษาไทยทั้งหมด · รายละเอียด token/class/component ดู [ข้อ 10](#10-design-system--ux)

---

## 12. เฟส 2 — PHP Backend (PHP 5.2.6 บน AppServ — ✅ ทำแล้ว)

> ตัดสินใจ 19 ต.ค. 2569: ใช้ **PHP 5.2.6 / MySQL 5.0 ของ AppServ เครื่องเดียวกับ stock_hr** (ไม่ใช่ PHP 8.2 ตามแผนเดิม) · ฐานข้อมูลแยกชื่อ `hl_welfare` · สองระบบคุยกันทาง `stock_hr/api/welfare.php` (HMAC) เท่านั้น · เลิกใช้ข้อมูลจำลองในการใช้งานจริง (`apiMode: 'http'`)
> โครงโค้ดตามแบบ stock_hr: ฟังก์ชันล้วน (ไม่มี namespace/closure), `array()`, mysqli + prepared statement, migration เป็นไฟล์ SQL เรียงเลข

### 12.1 โครงไฟล์
```
web/api/index.php            ← ทางเข้าเดียวของ API: api/index.php/<path> (PATH_INFO — ไม่ต้องเปิด mod_rewrite)
backend/                     ← โค้ดทั้งหมด (มี .htaccess Deny from all — เปิดผ่านเว็บไม่ได้)
├── bootstrap.php            ← โหลดทุกไฟล์ + api_handle($req) → คำตอบ (ไม่ exit — เทสต์เรียกตรงได้)
├── config.example.php       ← คัดลอกเป็น config.php (gitignored): DB, cookie_secure, อายุ session, กุญแจสต็อก
├── lib/      util.php (วันนี้, stable_usort, ApiError) · db.php (mysqli prepared, transaction) · http.php (คำขอ/คำตอบ/router/cookie/CSRF) · security.php (สุ่ม, PBKDF2)
├── domain/   date.php · insurance.php · uniform.php · labels.php · rules_check.php      ← คู่แฝดของ web/assets/js/domain (+ employeeRules / insurerFormRules)
├── usecases/ insurance_cycle.php · overview.php (dashboard, workQueue, uniformPending) · insurer_export.php · uniform_stock.php   ← คู่แฝดของ application/usecases
├── repo/repo.php            ← ตาราง → JSON camelCase (ชนิดเดียวกับ MockApi) + audit_write()
├── auth.php                 ← ข้อ 10.9.1
├── api/  routes.php (ตาราง endpoint) · handlers.php (คู่กับเมธอดของ MockApi ทีละตัว) · stock_client.php (HMAC → stock_hr)
├── sql/  001_schema.sql · 002_seed_master.sql · 003_seed_demo.sql  (+ _rollback)
├── bin/user.php             ← จัดการผู้ใช้ (CLI)
├── bin/cleanup.php          ← ล้าง session / refresh token / ประวัติ login เก่า (ตั้งเวลาด้วย Task Scheduler)
└── tests/run.php + fixtures/golden.json
scripts/export-seed.mjs      ← สร้าง sql/002, 003 และ golden.json จาก seed ของ mock (วันเดียวกัน)
```

### 12.2 ข้อกำหนด Backend
- **ชั้น**: `domain/` และ `usecases/` ห้ามแตะ DB/HTTP · `repo/` เท่านั้นที่เขียน SQL อ่านข้อมูล · `api/handlers.php` อ่านคำขอ → เรียกชั้นล่าง → คืนค่า · ข้อความ error/ลำดับ/audit เหมือน `MockApi` ทุกเมธอด
- **แปลงจาก JS บรรทัดต่อบรรทัด** และพิสูจน์ด้วย golden test (ข้อ 15.3) · `Array.sort` ของ JS stable แต่ `usort` ของ PHP 5.2 ไม่ → ใช้ `stable_usort()` เสมอ · วันที่คำนวณบน UTC (`gmmktime`/`gmdate`) · "วันนี้" = `today_iso()` ตามเขตเวลา `Asia/Bangkok`
- **ข้อมูลหลักร้อยแถว** จึงโหลดทั้งตาราง (`repo_world()`) แล้วคำนวณในหน่วยความจำแบบเดียวกับ mock (~0.25 วินาที/คำขอบน AppServ) · เกิน ~2,000 คนค่อยทำแบ่งหน้าฝั่ง PHP (ข้อ 10.7)
- **Prepared statement ทุก query** (`db_all/db_one/db_exec` ผูกค่าด้วย `?`) · ตัวเลขจาก DB แปลงเป็น number, boolean เป็น `true/false`, ฟิลด์ JSON (`companies`, `items`, `form_json`, `stock_items`) `json_decode`
- **transaction** ทุกการเขียนหลายแถว (ส่งออก+บันทึก batch, ผูกบริษัทประกัน, ส่งเบิก, sync) · unique key กันซ้ำ (`uq_emp_direction`, `uq_emp_ent`, `uq_emp_code`)
- **422** ตอบพร้อม `errors: {field: message}` (`validate_employee`, `validate_insurer_form`, `validate_bindings`) — PHP ตรวจซ้ำแม้หน้าเว็บตรวจแล้ว
- **ผู้ทำรายการจาก session เท่านั้น** (ข้อ 10.9.1) · ทุก create/update/delete/cancel เขียน `audit_log`
- **ระบบสต็อก**: `api/stock_client.php` เซ็นคำขอ (`X-Welfare-Timestamp`, `X-Welfare-Signature` = HMAC-SHA256) ด้วย `stock_api_secret` ใน `backend/config.php` (ตัวเดียวกับ `stock_hr/config_ctrl/welfare_key.php`) · หน้าเว็บไม่เห็นกุญแจ · เทสต์แทนด้วยตัวปลอม (`$GLOBALS['hlw_stock_fake']`)
- `web/api/stock_bridge.php` (ตัวกลางเดิมของโหมด mock) **ลบแล้ว** — โหมด http ให้ backend คุยกับสต็อกเอง · โหมด mock (ทดลอง) ใช้ `POST api/index.php/stock/bridge` ที่ต้องเข้าสู่ระบบ
- role: ตอนนี้ตรวจเฉพาะการออก/ยกเลิกใบเบิก (`HR_ADMIN`, `HR_COMPANY`) — สิทธิ์รายหน้า/รายบริษัทเป็นเฟส 3

### 12.3 ข้อจำกัด PHP 5.2 / MySQL 5.0 ที่ต้องรู้เมื่อแก้โค้ด
| เรื่อง | ทำแบบนี้ |
|---|---|
| ไวยากรณ์ | ไม่มี namespace, closure, `[]`, `?:`, `??`, `__DIR__`, `f()['x']` → ใช้ `array()`, `dirname(__FILE__)`, ชื่อฟังก์ชันเป็น string (`stable_usort($rows, '__cmp_due')`) |
| JSON | `json_encode` ไม่มี `JSON_UNESCAPED_UNICODE` (ภาษาไทยออกเป็น `\uXXXX` — เบราว์เซอร์อ่านได้ปกติ) · array ว่างออกเป็น `[]` |
| mysqli | ไม่มี `mysqli_stmt_get_result` → `db_all()` ผูก `bind_result` แบบไดนามิก · ต้อง `SET NAMES utf8` |
| MySQL 5.0 | utf8 (ไม่มี utf8mb4) · ไม่มีชนิด JSON (เก็บเป็น TEXT) · DATETIME ไม่มี DEFAULT → แอปส่ง `db_now()` · TIMESTAMP อัตโนมัติตารางละตัว (ให้ `updated_at`) · ไม่มี generated column · index ใส่ COMMENT ไม่ได้ |
| cookie | `setcookie()` ใส่ `SameSite` ไม่ได้ → `http_set_cookie()` เขียน `Set-Cookie` เอง |
| argv ภาษาไทย | PHP 5.2 บน Windows อ่านภาษาไทยจาก argument ไม่ได้ → `bin/user.php` รับชื่อทาง stdin |
| SQL ภาษาไทย | ส่งเป็นไฟล์เสมอ (`mysql --default-character-set=utf8 hl_welfare < ไฟล์.sql`) ไม่ใช่ `mysql -e "…"` |

### 12.4 หน้าผู้ดูแลระบบ (`admin.html` → `backend/api/admin.php`) — ตามสิทธิ์ (ข้อ 12.5)
ทุก endpoint `/admin/*` ตรวจสิทธิ์ของแท็บนั้น (`cap_require`, ข้อ 12.5) · สิทธิ์การใช้งาน = `admin_require()` (SUPER_ADMIN) · หน้าเว็บใช้ `adminApi` (`infrastructure/http/adminApi.js`, เฉพาะโหมด server)

| แท็บ | ทำอะไรได้ | endpoint |
|---|---|---|
| ผู้ใช้ | รายชื่อ + ออนไลน์/จดจำ/ถูกล็อก · เพิ่ม · แก้ชื่อ/บทบาท/รหัสพนักงาน · ปิด-เปิดบัญชี (ปิด = หลุดทุกอุปกรณ์) · ตั้งรหัสผ่านใหม่ · ออกจากระบบทุกอุปกรณ์ | `GET/POST /admin/users` · `PATCH /admin/users/{id}` · `POST …/{id}/password` · `POST …/{id}/signout` |
| การเข้าสู่ระบบ | ชื่อผู้ใช้/IP ที่ถูกล็อก + ปลดล็อก (ใส่ `cleared_at` ไม่ลบประวัติ) · session ที่ใช้อยู่ (จบได้) · อุปกรณ์ที่จดจำ (เลิกจดจำ = เพิกถอน family) · ประวัติ login | `GET /admin/sessions` · `DELETE /admin/sessions/{id}` · `DELETE /admin/devices/{familyId}` · `GET /admin/login-attempts` · `POST /admin/lockouts/clear` |
| สถานะระบบ | ฐานข้อมูล · PHP (เตือน 5.2 หมดอายุ) · ส่วนขยาย · migration ถึง 006 · ค่าตั้ง (`today_override`, `cookie_secure`, กุญแจสต็อก) · ping stock_hr (`status` ไม่มี ref) · ใบเบิกค้างในขั้นเดิมเกิน 7 วัน · ล็อก · TOKEN_REUSE 7 วัน · จำนวนผู้ดูแล · **ข้อมูลในฐานข้อมูล** (ตารางจัดกลุ่ม ข้อมูลหลัก / งานสวัสดิการ / ผู้ใช้ & ความปลอดภัย · คอลัมน์ ข้อมูล [ชื่อไทย + ชื่อตาราง] · เก็บอะไร · แถว · ป้าย “ล้างได้” ที่ตาราง auth_* · มือถือ: คำอธิบายอยู่ใต้ชื่อ — คำอธิบายอยู่ใน `TABLE_GROUPS` ของ admin.js) · ล้างข้อมูลเก่า (หัวข้อแยก ท้ายการ์ด) | `GET /admin/health[?ping=0]` · `POST /admin/cleanup {days}` |
| ตั้งค่าระบบ | **สต็อก Uniform**: URL, กุญแจ HMAC (แสดงแค่ความยาว + 4 ตัวท้าย · สุ่ม 64 hex + คัดลอกไปใส่ stock_hr), เวลารอเชื่อมต่อ/คำตอบ · ปุ่มทดสอบด้วยค่าที่ยังไม่บันทึก (เตือนถ้าบันทึกโดยยังไม่ทดสอบผ่าน) · **การเข้าสู่ระบบ**: idle / อายุ session, จดจำฉัน, เกณฑ์ล็อก · **ติดตาม**: วันเตือนใบค้าง, วันล้างข้อมูล · ทุกค่ามีป้าย config.php / ตั้งจากหน้านี้ + “ใช้ค่าใน config.php” · ค่าที่แก้ได้เฉพาะ config.php แสดงอ่านอย่างเดียว | `GET/PUT /admin/settings` · `POST /admin/stock/test {url?, secret?}` |
| บันทึกการใช้งาน | audit_log ทุก entity (รวม `USER`, `STOCK_REQUEST`, `SYSTEM`) กรองประเภท/การกระทำ/ผู้ทำ/ข้อความ/ช่วงวันที่ · 1,000 รายการล่าสุด + จำนวนทั้งหมด | `GET /admin/audit` |

- **กันล็อกตัวเอง**: เปลี่ยนบทบาท / ปิดบัญชี / ตั้งรหัสผ่าน / ออกทุกอุปกรณ์ / จบ session ของตัวเองไม่ได้ (422) → มี SUPER_ADMIN ที่ใช้งานได้อย่างน้อย 1 คนเสมอ
- ทุกการกระทำเขียน audit_log (`USER`: CREATE, UPDATE, PASSWORD_RESET, SIGNOUT_ALL, SESSION_REVOKE, DEVICE_REVOKE, UNLOCK · `SYSTEM`: UNLOCK (IP), CLEANUP, SETTINGS — กุญแจบันทึกแค่ 4 ตัวท้าย)
- `GET /activity` (แท็บบันทึกกิจกรรมหน้าภาพรวม) ซ่อน `USER` / `SYSTEM` จากทุกบทบาทยกเว้น SUPER_ADMIN
- **ล้างข้อมูลเก่า**: session ที่หมด/ถูกเพิกถอน · refresh token ทั้ง family ที่ใช้ไม่ได้แล้ว (ตัด `replaced_by` ก่อนลบ) · `auth_login_attempts` — เก่ากว่า N วัน (ค่าเริ่มต้น 90, น้อยสุด = `refresh_days`) · ไม่ลบ audit_log · ดูจำนวนก่อนด้วย `--dry` · ตั้งเวลา:
  `schtasks /Create /TN "hl-welfare cleanup" /SC WEEKLY /D SUN /ST 03:00 /TR "C:\AppServ\php5\php.exe C:\AppServ\www\hl-welfare\backend\bin\cleanup.php"`
- **migration 005** (`backend/sql/005_admin_monitor.sql`) ต้องรันก่อนขึ้นโค้ดนี้ — `auth.php` นับครั้งที่ผิดเฉพาะ `cleared_at IS NULL`
- **ค่าตั้งระบบ** (`backend/lib/settings.php`, migration 006 `system_settings`): `sys_setting(key)` = แถวในตาราง → ไม่มีก็ `config.php` → ไม่มีก็ค่าเริ่มต้นใน `sys_setting_defs()` (key ที่แก้จากเว็บได้มีเท่านี้) · อ่าน DB ครั้งเดียวต่อคำขอ · ยังไม่รัน 006 = ใช้ config.php ทั้งหมด (ไม่ error) · `auth_cfg()` และ `stock_raw()` อ่านผ่าน `sys_setting` แล้ว · ฐานข้อมูล / `cookie_secure` / `timezone` / `today_override` / `refresh_grace_seconds` แก้ได้ที่ config.php เท่านั้น · กุญแจสต็อกเก็บเป็นข้อความในตาราง (ต้องใช้เซ็น HMAC) — สำรองฐานข้อมูลเท่ากับสำรองกุญแจ

### 12.5 สิทธิ์การใช้งานรายบทบาท (`backend/permissions.php` · migration 008 `role_capabilities`)
- **ผู้ดูแลระบบสูงสุด (SUPER_ADMIN)** เข้าได้ทุกเมนู ทำได้ทุกอย่างเสมอ (ไม่มีแถวในตาราง → ล็อกตัวเองไม่ได้) · **บทบาทอื่น** ได้ตามที่ SUPER_ADMIN ติ๊กในเมนู “กำหนดสิทธิ์การใช้งาน” (`admin.html?tab=permissions`, SUPER_ADMIN เท่านั้น — บทบาทอื่นตั้งสิทธิ์ไม่ได้ กันยกระดับตัวเอง)
- **บัญชี SUPER_ADMIN แก้ได้เฉพาะ SUPER_ADMIN** — ผู้จัดการผู้ใช้บทบาทอื่น (เช่น HR Admin) แก้ชื่อ / ปิดบัญชี / ตั้งรหัส / ออกทุกอุปกรณ์ / จบ session / เลิกจดจำ / ปลดล็อก บัญชี SUPER_ADMIN ไม่ได้ และตั้งใครเป็น SUPER_ADMIN ไม่ได้ (403 `PROTECTED`, หน้าเว็บแสดง “ป้องกัน” แทนปุ่ม)
- capability (`perm_defs()`): **เห็นหน้า** `dashboard.view` `employees.view` `insurance.view` `uniform.view` `rules.view` `sites.view` `insurers.view` · **ทำรายการ** `employees.edit` `insurance.export` `insurance.submit` `uniform.issue` `stock.request` `rules.edit` `sites.edit` `insurers.edit` · **ผู้ดูแล** `users.manage` (ค่าเริ่มต้น HR Admin) `security.view` `system.health` `system.settings` `audit.view` (ค่าเริ่มต้น SUPER_ADMIN เท่านั้น)
- ค่าเริ่มต้น = พฤติกรรมเดิม: ทุกบทบาททำได้ทุกอย่าง ยกเว้น `stock.request` (HR Admin, HR บริษัท) · `rules.edit` และ `users.manage` (HR Admin) · ส่วนผู้ดูแลอื่น ๆ (SUPER_ADMIN)
- **เซิร์ฟเวอร์**: route guard `auth_route_guard($req, $handler)` ตรวจ handler ที่อยู่ใน `perm_defs()[…]['handlers']` · handler อื่นเรียก `cap_require($req, 'rules.edit')` เอง · `stock_write_roles()` = `cap_roles('stock.request')` · “เห็นหน้า” ตรวจเฉพาะ endpoint ที่หน้านั้นใช้คนเดียว (รายการที่หลายหน้าใช้ร่วม เช่น พนักงาน หน่วยงาน กฎ ตัวเลขภาพรวม อ่านได้ทุกคนที่ login) · `/activity` แสดง USER/SYSTEM เฉพาะผู้มี `audit.view`
- **หน้าเว็บ**: `AuthUser.caps` (จาก `/auth/login`, `/auth/me`) → `can('employees.edit')` ใน `app/auth.js` · sidebar ซ่อนเมนูตาม `cap` / `anyCap` / `roles` (`app/shell.js`) · เปิดหน้าที่ไม่มีสิทธิ์ → พาไปหน้าแรกที่เปิดได้ + แจ้งเตือน · ปุ่มซ่อนตามสิทธิ์ (ตาราง Excel `readOnly`, ส่งออก/ยกเลิกประกัน, แจก/ส่งเบิก/ยกเลิกชุด, แบบฟอร์มประกัน) · ทุกหน้าอ่านสิทธิ์ล่าสุดเงียบ ๆ ตอนเปิด เปลี่ยนแล้วโหลดหน้าใหม่
- **ขอบเขตบริษัท — HR บริษัท (HR_COMPANY)** เห็นและทำรายการได้เฉพาะพนักงานบริษัทของตัวเอง (`users.company_code` · ผู้ดูแลเลือกได้ในฟอร์มผู้ใช้ และต้องเลือกเมื่อบทบาทเป็น HR บริษัท) · บทบาทอื่นเห็นทุกบริษัท
  - เซิร์ฟเวอร์ (`permissions.php` → `data_scope()`): `repo_employees` / `repo_employee` / `repo_issues` / `repo_batches` กรองให้เอง → ภาพรวม คิวงาน พนักงาน สิทธิรายคน ประกันกลุ่ม ชุดฟอร์ม ส่งเบิก ถูกจำกัดทั้งหมด · พนักงาน/หน่วยงาน/การแจกของบริษัทอื่น = 404 · เพิ่มหรือย้ายไปบริษัทอื่น = 403 `OUT_OF_SCOPE` · บันทึกกิจกรรมเห็นเฉพาะของบริษัทตัวเองและที่ตัวเองทำ
  - การส่งออกประกันที่รวมหลายบริษัท: HR บริษัทยกเลิก/ส่งออกแทนที่ไม่ได้ (ให้ HR ส่วนกลางทำ) · ส่งข้อมูลหลักทั้งหมดไปสต็อก (ปุ่มหน้าหน่วยงาน) ไม่ได้
  - สิทธิ์ที่มีผลทุกบริษัท (`allCompanies` ใน `perm_defs()`: แก้เงื่อนไข แบบฟอร์มประกัน จัดการผู้ใช้ และเมนูระบบทั้งหมด) HR บริษัทได้ไม่ได้เลย — ตารางสิทธิ์แสดงช่องล็อก
  - HR บริษัทที่ยังไม่ได้กำหนดบริษัท → ไม่เห็นข้อมูลใด · โหมด mock ไม่จำกัดบริษัท (ใช้ทดลองเท่านั้น)
- **เมนูผู้ดูแลระบบ** (sidebar หัวข้อ “ผู้ดูแลระบบ”): ผู้ใช้ระบบ (`users.manage`) · กำหนดสิทธิ์การใช้งาน (SUPER_ADMIN) · ระบบ & ความปลอดภัย (แท็บที่มีสิทธิ์: การเข้าสู่ระบบ / สถานะระบบ / ตั้งค่าระบบ / บันทึกการใช้งาน) — หน้าสูงพอดีจอบน desktop (เลื่อนภายในการ์ด) · มือถือเลื่อนทั้งหน้า ตารางสิทธิ์แสดงทีละบทบาท

---

## 13. MySQL Schema (ฐานข้อมูล `hl_welfare` — MySQL 5.0)

ไฟล์จริงคือ **`backend/sql/001_schema.sql`** (แหล่งความจริงแหล่งเดียว — แก้ที่นั่นแล้วเพิ่ม migration ใหม่ `004_…sql` + `_rollback`) · ทุกตารางมีคอลัมน์ audit 4 ตัว `created_at` (DATETIME, แอปส่งค่า), `created_by`, `updated_at` (TIMESTAMP อัตโนมัติ), `updated_by` · InnoDB · utf8

| ตาราง | เก็บอะไร | หมายเหตุ |
|---|---|---|
| `companies` | บริษัทในเครือ (`code`, `name`, `legal_name`) | `legal_name` ใช้ในชีตสรุปไฟล์แจ้งประกัน |
| `sites` | หน่วยงาน (`has_group_insurance`, `polo_color`) | **id ตรงกับ `stock_hr.tb_welfare_site_map`** — ห้ามเปลี่ยน id ของหน่วยงานเดิม |
| `employees` | พนักงาน + ข้อมูลส่วนตัวสำหรับไฟล์แจ้งประกัน (`title`, `gender`, `national_id`, `phone`, `email`) | `uq_emp_code` |
| `insurance_rules`, `uniform_rules`, `uniform_items`, `settings` | กฎข้อ 7 | อาร์เรย์เก็บเป็น JSON ใน TEXT |
| `insurer_forms` | แบบฟอร์มบริษัทประกัน (`name`, `short_name`, `active` + `form_json` LONGTEXT = ส่วนที่เหลือรวมไฟล์ .xlsx base64) | MySQL 5.0 `max_allowed_packet` ค่าเริ่มต้น 1 MB — ไฟล์แบบฟอร์มใหญ่ต้องเพิ่มค่า |
| `insurance_batches` + `insurance_batch_items` | การส่งออกไฟล์แจ้งประกัน 1 ครั้ง = 1 batch · items มี `seq`, `type`, `direction` (แอปคำนวณ: URGENT = OUT) | `uq_emp_direction` กันแจ้งซ้ำ · ลบ batch → items ลบตาม (CASCADE) · `submitted_by_user_id` + `submitted_by_name` |
| `uniform_issues` | แจกชุด: `MANUAL` (บันทึกเอง) หรือ `STOCK` (ส่งเบิกคลัง — `stock_ref`, `stock_doc_id/no`, `stock_stage` ENUM WAITING/REQUESTED/ISSUED/RECEIVED/CANCELLED (WAITING เพิ่มใน 011), `stock_items` JSON …) | `uq_emp_ent` · `issued_by_user_id` + `issued_by_name` |
| `users` | ผู้ใช้ (`password_hash` PBKDF2, `emp_code`, `role`, `is_active`, `session_version`) | ข้อ 10.9.1 |
| `auth_sessions`, `auth_refresh_tokens`, `auth_login_attempts` | session / จดจำฉัน / จำกัดการเดา | เก็บเฉพาะ SHA-256 ของค่าลับ |
| `audit_log` | = ActivityLog (ห้ามแก้/ลบ) · `entity` เพิ่ม `INSURER_FORM`, `STOCK_REQUEST`, `USER` · `action` เพิ่ม `LOGIN`, `LOGOUT`, `PASSWORD_CHANGE`, `TOKEN_REUSE` | `user_id` + `user_name` (ชื่อ ณ ตอนนั้น) |

**ข้อมูลตั้งต้น** (สร้างจาก seed ของ mock ด้วย `node scripts/export-seed.mjs` — ห้ามแก้มือ)
- `002_seed_master.sql` — บริษัท หน่วยงาน กฎ ตั้งค่า แบบฟอร์มประกัน 2 ราย → **ใช้กับระบบจริงด้วย** (HR ปรับต่อในหน้าจอ)
- `003_seed_demo.sql` — พนักงาน 258 คน + ประวัติแจ้งประกัน/แจกชุด/กิจกรรมจำลอง → **เครื่องพัฒนา/เทสต์เท่านั้น ห้ามรันบนระบบจริง**

ติดตั้ง:
```bash
mysql -u root -p1234 -e "CREATE DATABASE hl_welfare DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci"
mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/001_schema.sql
mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/002_seed_master.sql
mysql -u root -p1234 --default-character-set=utf8 hl_welfare < backend/sql/003_seed_demo.sql    # เครื่องพัฒนาเท่านั้น
```

---

## 14. นำขึ้น host / สลับจาก mock → MySQL

### 14.1 นำหน้าเว็บขึ้น host (เช่น `https://develophpg.net/hl-welfare/`)
1. อัปโหลด **ไฟล์ทั้งหมดในโฟลเดอร์ `web/`** ไปไว้ที่โฟลเดอร์ `hl-welfare/` บน host (ไม่ต้อง build ไม่ต้องติดตั้งอะไร)
2. เปิด `https://develophpg.net/hl-welfare/` (= `index.html`)
3. ไม่ต้องตั้งค่า `.htaccess` / mod_rewrite — ทุกหน้าเป็นไฟล์ `.html` จริง ลิงก์เป็น path แบบ relative วางใต้โฟลเดอร์ไหนก็ได้

- ทดสอบแล้วบน **Apache 2.2.8 (AppServ) ที่ปิด mod_rewrite** วางใต้ sub-folder — ทุกหน้าแสดงผล และผ่านชุดทดสอบการใช้งานจริง (ข้อ 15.2)
- ไฟล์ `.js` ต้องถูกส่งเป็น `application/javascript` หรือ `text/javascript` (ค่าปกติของทุก web server) — ถ้า host ส่งเป็น `text/plain` หน้าจะว่าง ให้เพิ่ม `AddType text/javascript .js` ใน `.htaccess`
- **อัปเดตเวอร์ชันแล้วหน้าแสดงผลแปลก ๆ** = เบราว์เซอร์ใช้ไฟล์ .js/.css เก่าใน cache ปนกับไฟล์ใหม่ (ไม่มีขั้นตอน build จึงไม่มีชื่อไฟล์แบบ hash) → `web/.htaccess` สั่ง `Cache-Control: no-cache` ให้เบราว์เซอร์ตรวจไฟล์ใหม่ทุกครั้ง (ไฟล์ไม่เปลี่ยนได้ 304 ไม่โหลดซ้ำ) · ต้องเปิด `mod_headers` และ `AllowOverride` บน host (ไม่มีก็ไม่ error แค่ไม่มีผล) · ระหว่างนี้ผู้ใช้กด **Ctrl+F5** ได้ · **เครื่อง AppServ (Apache 2.2) เปิดแล้ว:** `LoadModule headers_module modules/mod_headers.so` ใน `C:AppServApache2.2confhttpd.conf` (สำรองเดิมไว้ `httpd.conf.bak-20261019-084107`) + restart service Apache2.2 — ตรวจด้วย `curl -I .../web/assets/js/ui/table.js` ต้องเห็น `Cache-Control: no-cache` · เครื่อง/host ใหม่ต้องเปิด mod_headers เช่นกัน
- โหมด mock เก็บข้อมูลใน `localStorage` **ของแต่ละเบราว์เซอร์** — เหมาะกับเดโม/ทดลอง ยังไม่ใช่ข้อมูลกลางจนกว่าจะต่อ PHP (เฟส 2)

> 📝 บทเรียนจากเวอร์ชัน React: เคยอัปโหลด source `.tsx` ขึ้น host ตรง ๆ ทำให้เห็นโค้ดแทนหน้าเว็บ และ URL อย่าง `/hl-welfare/monitor` ได้ 404 เพราะไม่มีไฟล์จริง — เวอร์ชัน HTML นี้ไม่มีขั้นตอน build และทุกหน้าเป็นไฟล์จริง จึงไม่เกิดปัญหาทั้งสองแบบ

### 14.2 ใช้ PHP + MySQL (เฟส 2 — ค่าเริ่มต้นแล้ว)
1. วางทั้งโฟลเดอร์ `hl-welfare/` (มี `web/` และ `backend/`) บน host ที่มี PHP ≥ 5.2 + MySQL ≥ 5.0 — host เดียวกับ stock_hr ได้
   - ถ้าวางเฉพาะ `web/` ใต้ document root ให้วาง `backend/` ไว้นอก document root แล้วแก้ path ใน `web/api/index.php` · ถ้าวางทั้งโฟลเดอร์ใต้ document root `backend/.htaccess` (Deny from all) กันไว้แล้ว — ตรวจว่า host อ่าน `.htaccess` (`AllowOverride All`)
2. สร้างฐานข้อมูลตามข้อ 13 (ระบบจริง: `001` + `002` เท่านั้น)
3. `copy backend\config.example.php backend\config.php` แล้วกรอก: ชุดเซิร์ฟเวอร์จริง (DB, `cookie_secure` = true ต้องเป็น HTTPS), `stock_api_url`, `stock_api_secret` (ตัวเดียวกับ `stock_hr/config_ctrl/welfare_key.php`)
4. สร้างผู้ใช้: `echo รหัสผ่าน | php backend/bin/user.php create <username> "<ชื่อ>" HR_ADMIN <รหัสพนักงาน>` (ชื่อภาษาไทยบน Windows ส่งทาง stdin — ดูหัวไฟล์)
5. `web/assets/js/config.js`: `apiMode: 'http'`, `apiBaseUrl: 'api/index.php'` (ค่าเริ่มต้นแล้ว) · `stock.docUrl` = ลิงก์ใบเบิกของ stock_hr บน host
6. ตรวจ: `GET api/index.php/auth/me` ต้องตอบ 401 JSON · เข้าสู่ระบบแล้วเปิดทุกหน้า · `backend/config.php` เปิดผ่านเว็บต้องได้ 403

---

## 15. การทดสอบ

### 15.1 กฎสวัสดิการ + Mock API (Node.js built-in test runner — ไม่ต้องติดตั้งแพ็กเกจ)
```bash
npm test            # = node --test "tests/*.test.js"
```
| ไฟล์ | ครอบคลุม |
|---|---|
| `tests/eligibility.test.js` | ประกันกลุ่ม (30/120 วัน, รอบวันที่ 5, สัญญา 3%, หน่วยงานไม่ได้ประกัน, อายุ 65/66, ขาดงาน +7, เลิกจ้าง urgent, ลาออกก่อนรอบ) · ชุดฟอร์ม (rule 1/2/17/18, CIC ระดับ 7, โปโลสีตามหน่วยงาน, "2+1", ประจำปีย้อน 3 ปี) · seed |
| `tests/mockApi.test.js` | 409 รหัสซ้ำ / ส่งซ้ำ / แจกซ้ำ / ลบที่มีประวัติ · 422 · 404 · CRUD หน่วยงาน · ยกเลิก batch/การแจก · บันทึกกิจกรรม · ลำดับคิวงาน |

ตัวอย่าง:
```js
import { describe, it } from 'node:test';
import { expect } from './_expect.js';
import { insuranceStatus } from '../web/assets/js/domain/eligibility.js';

describe('ประกันกลุ่ม', () => {
  it('ส่วนกลาง ครบ 30 วัน → รอบวันที่ 5 ถัดไป', () => {
    const s = insuranceStatus(emp({ startDate: '2026-10-10' }), site(), rules);
    expect(s.enrollCycleDate).toBe('2026-12-05');
  });
});
```

**Backend** — `backend/tests/run.php` (ข้อ 15.3) เทียบคำตอบของ PHP กับ MockApi ทุก endpoint อ่าน (golden ที่สร้างจาก JS) → รับประกันว่า JS กับ PHP ให้ผลตรงกัน

### 15.2 ทดสอบการใช้งานจริง (ทำแล้วในเฟส 1)
เปิดด้วย Chrome แบบ headless (puppeteer) ผ่าน Apache ในเครื่อง — ผ่าน 17/17:
- Combobox พิมพ์ค้นหา → กรองตาราง + เขียนลง URL
- ตาราง Excel: ดับเบิลคลิกแก้ → Enter บันทึกและคงอยู่หลังรีโหลด · พิมพ์ตัวเลขทับ → Tab · Esc ยกเลิก · เซลล์ select ค้นหาได้ · ข้อมูลผิดไม่บันทึกและแจ้ง error
- หน่วยงาน: เพิ่มแถวบันทึกอัตโนมัติ · สวิตช์บันทึกทันที · ลบหน่วยงานที่มีพนักงาน → ปฏิเสธพร้อมเหตุผล
- ประกันกลุ่ม: เลือกทั้งหมด → ยืนยันส่ง → ยกเลิก batch
- ชุดฟอร์ม: เลือกไซซ์ → บันทึกแจก
- ฟอร์ม: แสดง error ใต้ช่อง · เปลี่ยนเป็น PRO / Pro Site → แสดงช่องตำแหน่ง
- ศูนย์ติดตามงาน: กรองระดับ "ด่วน" · บันทึกกิจกรรมแสดงสิ่งที่เพิ่งทำ
- มือถือ 390px: ตารางเป็นการ์ด ไม่มี scroll แนวนอน · เมนูด้านล่าง + "เพิ่มเติม" เปิด drawer · โหมดมืดจำค่าข้ามหน้า
- มือถือ 360–767px: ช่องค้นหาชิดโลโก้ (ห่าง 10px) ยืดถึงปุ่มด้านขวา · เมนูล่าง 5 ปุ่มกว้างเท่ากัน · แถบปุ่มฟอร์มอยู่เหนือเมนูล่างพอดี · เนื้อหาไม่ถูกบัง
- ตรึงคอลัมน์: ตาราง Excel + ตารางทั่วไป ติดซ้ายเมื่อเลื่อน · จำหลังรีโหลด · แก้เซลล์ในคอลัมน์ที่ตรึงได้ · เลิกตรึงกลับตำแหน่งเดิม
- ทุกหน้าไม่มี JavaScript error ใน console
- เข้าสู่ระบบ: ยังไม่ login → ไปหน้า login พร้อม next · ส่งว่าง/รหัสผิด → แจ้ง · บัญชีทดลอง → สำเร็จ + อนิเมชัน → กลับหน้าเดิม · ชื่อบน topbar และในบันทึกกิจกรรม · ออกจากระบบ → เปิดหน้าอื่นไม่ได้
- กรองคอลัมน์: ค่าในตัวกรอง, กรอง/เรียงตาราง Excel และตารางทั่วไป, ล้างตัวกรอง · แท็บภาพรวม/ประกันกลุ่ม · monitor.html พาไปแท็บคิวงาน
- แนะนำการใช้งาน: เปิดอัตโนมัติครั้งแรกครบทุกหน้าและทุกแท็บ (แสดงครบทุกขั้น) · เปิดหน้าเดิมซ้ำไม่เด้งอีก · ปุ่ม ? เปิดได้ · Esc ปิด · มือถือข้ามขั้นของเมนูที่ซ่อนอยู่
- ความสูงพอดีจอ: 1440×900 และ 1366×768 หน้าต่างไม่เลื่อนในทุกหน้ารายการ

---

### 15.3 Backend PHP 5.2 (ฐานข้อมูลจริง)
```bash
C:\AppServ\php5\php.exe backend\tests\run.php          # ใช้ค่าเชื่อมต่อใน backend/config.php
```
สร้างฐานข้อมูล `hl_welfare_test` ใหม่จาก `backend/sql/001–009` ทุกครั้ง (ชื่อต้องมีคำว่า test — ห้ามใช้ `hl_welfare` เพราะเทสต์ลบฐานทิ้งทั้งก้อน) แล้วเรียก `api_handle()` ตรง ๆ พร้อม cookie jar แยกต่อ "เบราว์เซอร์" — **261 ข้อ** (19 ต.ค. 2569 · รวม `rules_test.php` + `scope_test.php`)
- **ลบฐานทดสอบเองเมื่อรันจบ** (ผ่าน / ไม่ผ่าน / หยุดกลางคัน) — ไม่ค้างในเครื่อง · เก็บไว้ดูตอนเทสต์ไม่ผ่าน: `HLW_KEEP_TEST_DB=1`
- รันพร้อมกันหลายคน/หลาย session: ตั้ง `HLW_TEST_DB` คนละชื่อ (ต้องมีคำว่า test) ไม่งั้นจะลบฐานของกันกลางคัน
- **golden**: ทุก endpoint อ่านข้อมูลตอบเหมือน `MockApi` ทุกตัว ณ วันเดียวกับ seed — dashboard, คิวงาน, พนักงาน (+ ตัวกรอง), กฎ, **สิทธิของพนักงานทั้ง 258 คน**, รอบประกัน 7 รอบ (รวมรอบรายวันวันที่ 6), ประวัติ/รายละเอียด batch, ไฟล์ส่งออกซ้ำ, แบบฟอร์มประกัน, ข้อมูลไฟล์แจ้งประกัน 2 รอบ, ประวัติแจกชุด, ค้างแจก, กิจกรรม · `fixtures/golden.json` สร้างโดย `node scripts/export-seed.mjs` (แก้กฎใน JS แล้วต้องสร้างใหม่ + แก้ PHP ให้ผ่าน)
- ไลบรารี: PBKDF2 ตรง test vector RFC 7914 · hash รหัสผ่านภาษาไทย · ค่าสุ่ม 256 บิต · `stable_usort`
- การเข้าสู่ระบบ: 401 ข้อความเดียวกัน · cookie HttpOnly/SameSite/path · session เก็บ SHA-256 · หมดเมื่อไม่ใช้งาน 31 นาที / ครบ 12 ชม. · refresh หมุนโทเคน · race 409 · reuse เพิกถอนทั้ง family + audit · โทเคนปลอม · logout · เปลี่ยนรหัสผ่าน (เครื่องอื่นหลุด) · ปิดบัญชี · CSRF 415/403 · จำกัดการเดา 429
- เขียนข้อมูล: พนักงาน (201/409/422/พ้นสภาพ/ลบ) · หน่วยงาน · ส่งออก+บันทึก (ผู้ส่งจาก session, ส่งซ้ำแทนที่) · ส่งแจ้งซ้ำ 409 · ยกเลิก batch · แจกชุด (`issuedBy` จาก session แม้ body ปลอมมา) · ส่งเบิกสต็อก (403 Payroll, `requested_by_*` จาก session, `start_date`) · sync ISSUED/CANCELLED · ตัวกลาง `/stock/bridge`
- ผู้ดูแลระบบ (`/admin/*`): 401/403 ทุก endpoint · ปลดล็อกแล้ว login ได้ · สร้างผู้ใช้ (422 รายช่อง / 409 ซ้ำ) · กันแก้ตัวเอง · เปลี่ยนบทบาทมีผลทันที · ปิดบัญชี/ตั้งรหัสผ่าน/ออกทุกอุปกรณ์/เลิกจดจำ → หลุดจริง · audit กรอง + `%` ไม่เป็น wildcard · `/activity` ซ่อน USER · health (ping สต็อก, ใบค้าง, ค่าตั้งผิด) · cleanup ลบ family ที่มี `replaced_by` ได้ ของที่ยังใช้อยู่ไม่หาย · ตั้งค่า: 422 รายช่อง ไม่บันทึกบางส่วน · ค่าใหม่มีผลทันที (เกณฑ์ล็อก) · คืนค่า config.php · ทดสอบสต็อกด้วยค่าที่ยังไม่บันทึก · ทุกคำขอไปสต็อกใช้ URL/กุญแจจาก DB · ไม่ส่ง/ไม่ log กุญแจเต็ม

**หน้าเว็บ** — `tests/serverAuth.test.js` (อยู่ใน `npm test`, 79 ข้อผ่าน รวม `tests/adminApi.test.js`): 401 → refresh → ลองใหม่ · refresh ไม่ได้ → onUnauthorized ครั้งเดียว · 401 พร้อมกัน → refresh ครั้งเดียว · 409 REFRESH_RACE · restore()

**ทดสอบบน AppServ จริง (19 ต.ค. 2569)**: `GET api/index.php/auth/me` = 401 JSON · login ได้ cookie `HLW_SESSION` path `/hl-welfare/web/` และ `HLW_REFRESH` path `/hl-welfare/web/api/index.php/auth` (HttpOnly, SameSite=Lax) · dashboard/พนักงาน/คิวงาน ~0.25 วิ · `backend/config.php` ผ่านเว็บ = 403 · catalog จาก stock_hr จริงผ่าน HMAC ได้ (อ่านอย่างเดียว) · เบราว์เซอร์: login (ไม่แสดงบัญชีทดลอง) → ทุกหน้าแสดงข้อมูลจาก MySQL ไม่มี error · `document.cookie` ว่าง · ลบ session ในฐานข้อมูลแล้วเปิดหน้าใหม่ → ต่ออายุเองด้วย refresh (โทเคนหมุนใน family เดิม)

**ยังไม่ได้ทดสอบ**: HTTPS จริง + `cookie_secure = true` · host จริง (develophpg.net) · ส่งเบิก/ยกเลิกใบกับ stock_hr จริง (ทดสอบกับตัวปลอม — กดจริงจะออกใบ WRQ/NRQ ในสต็อก) · การบันทึกจากหน้าจอทุกปุ่ม (ทดสอบผ่าน API แล้ว) · ไฟล์แบบฟอร์มประกันขนาดใหญ่กับ `max_allowed_packet`

## 16. Checklist

### เฟส 1 — หน้าเว็บ (HTML + JS) + Mock ✅
- [x] กฎสวัสดิการ `domain/*.js` + use-case `application/usecases/*.js` + validation `employeeRules.js`
- [x] `npm test` ผ่าน 51/51 (รวม `tests/insurerExport.test.js` และ `tests/excelTemplate.test.js`: อ่านตำแหน่ง/หัว 2 ชั้น/เซลล์อัตโนมัติ, ล้างข้อมูลบุคคล, เติมข้อมูลลงแบบฟอร์ม + ส่วนท้ายเลื่อน, ผูกบริษัท — ใช้ ExcelJS ตัวเดียวกับในเว็บ) (node:test ไม่ต้องติดตั้งแพ็กเกจ)
- [x] MockApi (localStorage, seed + edge cases, บันทึกกิจกรรม) + HttpApi (พร้อมใช้เฟส 2) + `config.js`
- [x] `app.css` design tokens (โทนสว่าง + โหมดมืด) + responsive (มือถือ/แท็บเล็ต)
- [x] UI: DataTable (แบ่งหน้า + การ์ดมือถือ), ExcelGrid, Combobox (`<select data-combobox>`), Modal/Toast/confirm, ไอคอน SVG ในตัว
- [x] 10 หน้า: ภาพรวม, ศูนย์ติดตามงาน, พนักงาน, รายละเอียด, ฟอร์ม, ประกันกลุ่ม, PVD (ตัดออกภายหลัง), ชุดฟอร์ม, เงื่อนไข, หน่วยงาน
- [x] CRUD ครบ (พนักงาน/หน่วยงาน ลบได้ตามเงื่อนไข, ยกเลิก batch/การแจก)
- [x] ทดสอบการใช้งานจริงด้วย headless Chrome ผ่าน Apache 2.2 ในเครื่อง 17/17
- [x] Desktop สูงพอดีจอ (`page fit` / `fill` / `fill-body`)
- [x] แนะนำการใช้งานด้วย driver.js ทุกหน้า + ไฟล์ตั้งค่าให้ dev ปรับ (`tour/`)
- [x] รวมภาพรวม + ศูนย์ติดตามงาน เป็นเมนูเดียว (แท็บ) · ประกันกลุ่มเป็นแท็บ + badge รอส่ง
- [x] กรอง/เรียงที่หัวคอลัมน์ทุกตาราง
- [x] ตรึงคอลัมน์ไว้ด้านซ้ายทุกตาราง (จำต่อตาราง)
- [x] มือถือ: เมนูด้านล่าง (bottom navigation) ซ่อนเมื่อปัดขึ้น / แสดงเมื่อปัดลง + topbar ช่องค้นหาชิดโลโก้
- [x] หน้าพนักงาน: ช่องค้นหา + แท็กกรองเร็ว (แทน select 3 ช่อง)
- [x] ประวัติการส่งแจ้ง: ดูรายชื่อพนักงานในแต่ละ batch (modal + ค้นหา + CSV) · `GET /api/insurance/batches/{id}`
- [x] ประกันกลุ่ม: เลิกใช้ปุ่มส่งแจ้ง → **ส่งออกไฟล์ Excel ตามแบบฟอร์มของบริษัทประกัน** (ชีตสรุป + ชีตละบริษัท) + บันทึกว่าแจ้งแล้ว / ส่งออกซ้ำ / ยกเลิก
- [x] หน้า "แบบฟอร์มประกัน": **อัปโหลดไฟล์ Excel แบบฟอร์มของบริษัทประกัน** (.xlsx/.xls) → ระบบอ่านตำแหน่งให้ → แก้บนตัวอย่างไฟล์จริง → ล้างข้อมูลบุคคลก่อนเก็บ · ผูกบริษัทในเครือ ↔ บริษัทประกัน · แบบฟอร์มตั้งต้น 2 ราย
- [x] พนักงาน: คำนำหน้า เพศ เลขบัตรประชาชน (ตรวจ check digit) โทร อีเมล
- [x] Loading กลางทั้งระบบ (`ui/loading.js`): **loading กลางจอ** (การ์ดโลโก้ + วงแหวนหมุน + "กำลังโหลด…" บนพื้นหลังเบลอ) อัตโนมัติทุก api/เปลี่ยนหน้า — แสดงเมื่อรอเกิน 250ms อยู่อย่างน้อย 400ms กันกดซ้ำระหว่างแสดง · รีเฟรชอัตโนมัติ/ตัวนับเมนู และ**หน้าล็อกอิน** (มี animation ของตัวเอง: ปุ่มหมุน + เครื่องหมายถูก) ใช้ `progress.quiet` ไม่ขึ้น loading · loader, ปุ่ม busy, spinner
- [x] แถบแบ่งหน้าใหม่ทั้งระบบ: หน้าแรก/สุดท้าย, แถวต่อหน้าแบบ segmented, ช่องไปหน้า, มือถือพิมพ์เลขหน้าได้
- [x] หน้า login + อนิเมชันเมื่อสำเร็จ + ป้องกันทุกหน้า (mock) · ธีม gradient น้ำเงิน → เขียวทั้งระบบ
- [x] Responsive ใหม่: breakpoints 1024/900/768/640, การ์ดบนมือถือ, พื้นที่กดบนจอสัมผัส, scrollbar ชิดขอบจอ, tour ไฮไลต์ตรงตำแหน่ง
- [ ] ส่งออก CSV เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน (ใส่ UTF-8 BOM แล้ว — รอทดสอบเปิดใน Excel จริง)
- [ ] อัปโหลด `web/` ขึ้น host หน่วยงานและเปิดใช้งานจริง

### เฟส 2 — PHP 5.2 + MySQL 5.0 (AppServ เดียวกับ stock_hr) ✅
- [x] ฐานข้อมูลแยก `hl_welfare` — `backend/sql/001_schema.sql` (+ rollback) · seed จาก mock (`002` ใช้จริง, `003` จำลอง)
- [x] Router, คำขอ/คำตอบ, mysqli prepared, transaction (`backend/lib/`)
- [x] domain + use-case คู่แฝดของ JS ครบ (สิทธิประกัน/ชุดฟอร์ม, รอบประกัน, ไฟล์แจ้งประกัน, ภาพรวม, คิวงาน, ค้างแจก, ส่งเบิกสต็อก) — golden test ตรงกับ MockApi ทุก endpoint อ่าน
- [x] ทุก endpoint ในข้อ 8 (CRUD, ส่งออก+บันทึก, แบบฟอร์มประกัน + ผูกบริษัท, แจกชุด, ส่งเบิก/ซิงก์สต็อก, `/monitor/tasks`, `/activity`)
- [x] Validation + transaction + unique key กันซ้ำ · 422 พร้อม `errors`
- [x] การเข้าสู่ระบบ (ข้อ 10.9.1): session ใน DB, จดจำฉัน (refresh token หมุน + ตรวจจับรั่ว), จำกัดการเดา, CSRF, เปลี่ยนรหัสผ่าน, `bin/user.php`
- [x] audit_log ทุกการเขียน — `user_id` + `user_name` จาก session · ส่งเบิกสต็อกส่ง `requested_by_*` จาก session
- [x] `config.js` → `apiMode: 'http'` · ทุกหน้าทำงานกับ MySQL (ทดสอบบนเบราว์เซอร์แล้ว)
- [ ] ขึ้น host จริง (HTTPS, `cookie_secure = true`) + สร้างผู้ใช้จริง
- [x] หน้าเปลี่ยนรหัสผ่าน / จัดการผู้ใช้ (บัญชีของฉัน · ผู้ดูแลระบบ)

### เฟส 3 (ภายหลัง)
- [x] สิทธิ์ตาม role / แยกบริษัท (กำหนดสิทธิ์การใช้งาน + HR บริษัทเห็นเฉพาะบริษัทตัวเอง ข้อ 12.5)
- [x] แก้ไขกฎสวัสดิการผ่านหน้าจอ (มี effective date)
- [ ] นำเข้าพนักงาน/รายชื่อลาออกจาก Excel ของ Payroll (ส่วนกลาง + CNS)
- [ ] รับ flag ขาดงาน 3 วันจากระบบลงเวลา
- [x] สต็อกชุดฟอร์ม (ส่งเบิกไปสต็อก Uniform + ส่งข้อมูลหลัก sync_master)

---

## 17. ประเด็นที่ต้องยืนยันกับ HR
- [ ] **บริษัทประกัน 2 ราย แบ่งกันอย่างไร?** ไฟล์ ก.พ. 68 = เมืองไทย (AS, CNS, HL, PRO) · ไฟล์ ก.พ. 69 = ไทยประกัน (ทุกบริษัท) — ระบบตั้งต้นให้ไทยประกันเปิดใช้ทุกบริษัท และเมืองไทยปิดไว้ · ถ้าใช้พร้อมกัน แบ่งตามบริษัทในเครือใช่ไหม (1 บริษัท = 1 บริษัทประกัน) หรือแบ่งตามประเภทพนักงาน/ความคุ้มครอง?
- [ ] เลขกรมธรรม์ของ AS และ HL (ไฟล์ไทยประกันเว้นไว้ "จี…") และเลขกรมธรรม์เมืองไทยทุกบริษัท
- [ ] "วันที่มีผลบังคับ" ในไฟล์ไทยประกัน = วันที่รอบ (5) ทุกแถวตามไฟล์ตัวอย่าง ใช่ไหม หรือควรเป็นวันครบสิทธิ/วันออกจริง (เปลี่ยนได้ในแบบฟอร์ม)
- [ ] "สถานะพนักงาน (E)" และ "แผนประกัน" ในไฟล์ไทยประกัน ต้องกรอกค่าอะไร
- [ ] "ทำงานครบ 30/120 วัน" นับวันปฏิทินหรือวันทำงาน? นับวันเริ่มงานเป็นวันที่ 1 ไหม? (ระบบตอนนี้: `startDate + N วันปฏิทิน`)
- [ ] ครบสิทธิหลังวันที่ 5 → เข้ารอบเดือนถัดไปใช่ไหม?
- [ ] อายุ 65 ตรวจเฉพาะตอนแจ้งเข้า หรือต้องแจ้งออกเมื่ออายุครบ 65 ระหว่างเป็นสมาชิกด้วย?
- [ ] ขาดงาน 3 วันแล้วกลับมาทำงาน → แจ้งเข้าใหม่ + นับอายุงานใหม่ไหม?
- [ ] พนักงานรายวัน CNS / CIC / PRO ได้ประกันกลุ่มไหม (ไฟล์ระบุแค่ HL, AS)?
- [ ] ชุดฟอร์มส่วนกลาง: ช่อง "วันเริ่มงาน" ว่าง = ไม่ได้จนกว่าจะผ่านทดลองงาน ใช่ไหม?
- [ ] ช่างทีมโมบาย "2+1" = ชุดช่าง 2 + โปโล 1 ใช่ไหม?
- [ ] แจกชุดประจำปีเดือนไหน และต้องทำงานครบกี่เดือนก่อนรอบแจก?
- [ ] CIC ระดับ 6 ขึ้นไป ได้ชุดฟอร์มกี่ตัว?
- [ ] แม่บ้าน CNS และพนักงานรายวัน ได้ชุดฟอร์มไหม?
- [ ] ระดับพนักงาน "6 ขึ้นไป" สูงสุดถึงระดับเท่าไร?

## 18. ประเด็นเปิด — backend / การเข้าสู่ระบบ (ต้องตัดสินใจ)
- [ ] **อายุ session / จดจำฉัน**: idle 30 นาที, สูงสุด 12 ชม., refresh 30 วัน (นับใหม่ทุกครั้งที่หมุน → ใช้ทุกวันจะไม่หมด) — ต้องมีอายุสูงสุดของ family (เช่น 90 วันแล้วต้องกรอกรหัสใหม่) ไหม?
- [ ] **ล็อกบัญชีจากการเดารหัส**: ผิด 5 ครั้ง/15 นาที ล็อกชื่อผู้ใช้นั้น → คนอื่นแกล้งล็อกบัญชีได้ · ยอมรับได้ไหม หรือล็อกตาม IP + ชื่อผู้ใช้คู่กัน
- [ ] **สิทธิ์ส่งเบิกคลัง**: ตอนนี้ HR_ADMIN + HR_COMPANY · ผู้ดูแลสต็อก (STOCK) ควรยกเลิกใบได้ไหม · HR_COMPANY ส่งเบิกได้เฉพาะพนักงานบริษัทตัวเอง (เฟส 3)?
- [ ] **บัญชีผู้ใช้จริง**: ใครบ้าง บทบาทอะไร · `username` ควรตรงกับ `tb_user.username` ใน stock_hr (สต็อกใช้ส่งลิงก์เซ็นรับ) — ตอนนี้ stock_hr มีแค่ `admin` · `emp_code` ของผู้ใช้ใครกรอก
- [ ] **ข้อมูลพนักงานจริง**: นำเข้าจากไหน (ไฟล์ HR / ระบบเงินเดือน) — ตอนนี้เครื่องพัฒนาใช้ข้อมูลจำลอง (`003_seed_demo.sql`) ห้ามรันบนระบบจริง
- [ ] **PHP 5.2 / MySQL 5.0 หมดอายุซัพพอร์ตแล้ว** (ไม่มีแพตช์ความปลอดภัย) — ทำตามที่ตัดสินใจไว้เพื่อให้อยู่เครื่องเดียวกับ stock_hr · โค้ดเลี่ยงฟีเจอร์ใหม่ ย้ายขึ้น PHP 7/8 + MySQL 8 ได้โดยไม่ต้องแก้มาก (`password_hash` แทน PBKDF2, `random_bytes` แทน GUID) — ควรวางแผนพร้อม stock_hr
- [x] **ล้างข้อมูลเก่า** (ทำแล้ว — `bin/cleanup.php` + ปุ่มในหน้า admin, ข้อ 12.4 · เหลือตั้ง Task Scheduler บนเซิร์ฟเวอร์จริง): งานตั้งเวลาลบ `auth_sessions` / `auth_refresh_tokens` ที่หมดอายุ/ถูกเพิกถอนเกิน 90 วัน และ `auth_login_attempts` เกิน 90 วัน (ทำแบบ `stock_hr/cron/`)
- [x] **audit_log entity ใหม่** (ทำแล้ว — ป้าย/ไอคอนครบ, `/activity` ซ่อน USER/SYSTEM จากบทบาทอื่น, ดูทั้งหมดที่ admin.html) `USER`, `STOCK_REQUEST`, `INSURER_FORM`: แท็บบันทึกกิจกรรมต้องเพิ่มป้าย/ตัวกรอง (`ActivityEntity` ใน `domain/types.js`) หรือซ่อน `USER` จากผู้ใช้ทั่วไป
- [ ] **ไฟล์แบบฟอร์มประกันขนาดใหญ่**: เก็บ base64 ใน `insurer_forms.form_json` — MySQL 5.0 `max_allowed_packet` ค่าเริ่มต้น 1 MB · ไฟล์ > ~700 KB บันทึกไม่ได้ ต้องเพิ่มค่าหรือย้ายไปเก็บเป็นไฟล์
- [ ] **โหมด mock**: ยังเก็บไว้สำหรับ `npm test` และทดลอง (ตั้ง `apiMode: 'mock'`) — ใช้ส่งเบิกจริงได้เฉพาะเมื่อ login กับ backend (`auth.provider: 'server'`) · จะลบโหมดนี้ออกทั้งหมดไหม
