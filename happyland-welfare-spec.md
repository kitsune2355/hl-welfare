# ระบบจัดการสวัสดิการพนักงาน — กลุ่มบริษัทแฮปปี้แลนด์

> เอกสารสเปกสำหรับพัฒนาและนำขึ้น host ของหน่วยงาน
> Stack: **HTML + CSS + JavaScript (ES Modules) ไม่ใช้ framework ไม่ต้อง build** · **PHP 8.2+** · **MySQL 8**
> แนวทาง: **เฟส 1 หน้าเว็บ + ข้อมูลจำลอง (mock) ✅ เสร็จแล้ว → เฟส 2 ต่อ PHP + MySQL จริง**
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
12. [เฟส 2 — PHP Backend](#12-เฟส-2--php-backend)
13. [MySQL Schema](#13-mysql-schema)
14. [นำขึ้น host / สลับจาก mock → MySQL](#14-นำขึ้น-host--สลับจาก-mock--mysql)
15. [การทดสอบ](#15-การทดสอบ)
16. [Checklist](#16-checklist)
17. [ประเด็นที่ต้องยืนยันกับ HR](#17-ประเด็นที่ต้องยืนยันกับ-hr)

---

## 1. ภาพรวม

ระบบกลางให้ HR จัดการสวัสดิการของทุกบริษัทในเครือ:

| โมดูล | ทำอะไร |
|---|---|
| เข้าสู่ระบบ | หน้า login (อนิเมชันเมื่อสำเร็จ), จดจำการเข้าสู่ระบบ, ออกจากระบบ · ชื่อผู้ใช้ถูกบันทึกในทุกกิจกรรม |
| ภาพรวม & ติดตามงาน | แท็บ **สรุป** (ตัวเลขหลัก) · **คิวงาน** (ทุกเรื่องที่ต้องทำ จัดระดับ ด่วน/ต้องทำ/ติดตาม) · **บันทึกกิจกรรม** + รีเฟรชอัตโนมัติ |
| พนักงาน | ทะเบียนพนักงาน (ตารางแบบ Excel) + หน้า "สิทธิสวัสดิการ" รายคน |
| ประกันกลุ่ม | แท็บ แจ้งออกทันที / แจ้งเข้า / แจ้งออก / ประวัติ (ตัวเลขรอส่งบนแท็บ) — คำนวณสิทธิ, ส่งออกไฟล์แจ้งทุกวันที่ 5 (พนักงานรายวันแยกรอบวันที่ 6), ประวัติ 1 รายการต่อการส่งออก 1 ครั้ง |
| กองทุนสำรองเลี้ยงชีพ (PVD) | สิทธิสมาชิก, ยอดหักสะสม/สมทบ 2%, % สิทธิเงินสมทบ (vesting) |
| ชุดฟอร์ม | สิทธิตามกลุ่ม/ระดับ/ตำแหน่ง, รายการค้างแจก, บันทึกการแจก + ไซซ์ |
| เงื่อนไขสวัสดิการ | แสดงกฎทั้งหมด (เฟส 3: แก้ไขได้) |
| หน่วยงาน | เพิ่ม/แก้/ลบหน่วยงาน, ได้ประกันกลุ่มไหม (แม่บ้าน CNS) และสีโปโล (Pro Site) |

**บริษัทในเครือ:** HL (แฮปปี้แลนด์), PRO, CNS, CIC, AS

**หลักการออกแบบ**
- **ไม่ต้อง build** — ไฟล์ที่เขียนคือไฟล์ที่ใช้งานจริง เบราว์เซอร์รัน `<script type="module">` ได้โดยตรง
- **1 หน้า = 1 ไฟล์ HTML** (`employees.html`) + **1 ไฟล์ JS** (`assets/js/pages/employees.js`) — โครงหน้าอยู่ใน HTML, JS เติมข้อมูล
- **Clean Architecture** — กฎสวัสดิการอยู่ใน `domain/` (ฟังก์ชันล้วน ไม่แตะ DOM/fetch/localStorage) ชั้นนอกพึ่งชั้นในเท่านั้น (ข้อ 3)
- หน้าจอเรียกข้อมูลผ่าน `api` ตัวเดียว (`assets/js/app/api.js`) → สลับ **mock ↔ PHP** ได้ด้วย `config.js` บรรทัดเดียว
- ตรรกะคำนวณสิทธิฝั่ง PHP ต้องมีตัวคู่แฝดที่ให้ผลเหมือนกัน (`Domain/Eligibility.php`) โดยใช้ชุด test case เดียวกัน
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
| PHP | 8.2+ (`pdo_mysql`, `mbstring`) | เฟส 2 | เฟส 2 |
| Composer | 2.x | เฟส 2 (autoload PSR-4) | เฟส 2 |
| MySQL | 8.0+ (หรือ MariaDB 10.6+) | เฟส 2 | เฟส 2 |

> ⚠️ เครื่องพัฒนาปัจจุบัน (AppServ) มี **PHP 5.2.6 / MySQL 5.0** — ใช้เปิดหน้าเว็บเฟส 1 ได้ (ทดสอบแล้ว) แต่ใช้กับ backend เฟส 2 ไม่ได้ ต้องติดตั้ง PHP 8.2+ และ MySQL 8 / MariaDB 10.6+ (เช่น Laragon) ก่อนเริ่มเฟส 2 และตรวจเวอร์ชัน PHP ของ host หน่วยงานด้วย

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
| `domain/` | กฎคำนวณสิทธิ (ประกัน / PVD / ชุดฟอร์ม), วันที่, คำศัพท์ภาษาไทยของ enum, `types.js` (JSDoc) | `domain` เท่านั้น | DOM, `fetch`, `localStorage`, ชั้นอื่นทั้งหมด |
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

| ชั้น | Namespace | ตัวอย่าง |
|---|---|---|
| Domain | `App\Domain` | `Dates`, `Eligibility` (คู่แฝดของ JS — pure, ไม่มี PDO) |
| Application | `App\Application` | `Port\EmployeeRepository` (interface), `Service\InsuranceCycleService`, `Service\WorkQueueService` |
| Infrastructure | `App\Infrastructure` | `Config`, `Database`, `Persistence\PdoEmployeeRepository` |
| Interface (HTTP) | `App\Http` | `Router`, `Request`, `Response`, `Controller\*` (บาง — แค่แปลง request → service → JSON) |

---

## 4. โครงสร้างโปรเจกต์

```text
hl-welfare/
├── happyland-welfare-spec.md          ← ไฟล์นี้
├── package.json                       ← ใช้เฉพาะ `npm test` (ไม่มี dependency)
├── tests/                             ← ทดสอบกฎสวัสดิการด้วย node:test
│   ├── _expect.js                     ← ตัวช่วย expect(...).toBe(...)
│   ├── eligibility.test.js            ← ประกัน / PVD / ชุดฟอร์ม / seed
│   └── mockApi.test.js                ← validation 409/422/404, CRUD, คิวงาน, กิจกรรม
│
├── web/                               ← ★ อัปโหลดทั้งโฟลเดอร์นี้ขึ้น host
│   ├── login.html                     ← เข้าสู่ระบบ (ไม่มี sidebar)
│   ├── index.html                     ← ภาพรวม & ติดตามงาน (?tab=summary|queue|activity)
│   ├── monitor.html                   ← (เดิม) พาไป index.html?tab=queue ให้ลิงก์เก่ายังใช้ได้
│   ├── employees.html                 ← พนักงาน (ตาราง Excel)
│   ├── employee.html                  ← รายละเอียดพนักงาน (?id=)
│   ├── employee-form.html             ← ฟอร์มเพิ่ม/แก้ไข/พ้นสภาพ (?id=)
│   ├── insurance.html                 ← ประกันกลุ่ม (?cycle=&tab=urgent|in|out|history&batch=) + ส่งออกไฟล์แจ้งประกัน
│   ├── pvd.html                       ← กองทุนสำรองเลี้ยงชีพ (?tab=)
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
│           │   ├── pvd.js             ← pvdStatus
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
│           │   └── http/httpApi.js    ← fetch → PHP (เฟส 2)
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
│               └── login.js  dashboard.js  employees.js  employee.js  employee-form.js
│                   insurance.js  pvd.js  uniform.js  rules.js  sites.js
│
├── backend/                           ← PHP 8.2+ (เฟส 2 — ยังไม่สร้าง)
│   ├── composer.json
│   ├── .env.example
│   ├── public/  index.php  .htaccess
│   ├── src/  Domain/  Application/{Port,Service}/  Infrastructure/{Persistence}/  Http/{Controller}/
│   ├── database/  schema.sql  seed.sql
│   └── tests/EligibilityTest.php
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
  apiMode: 'mock',        // 'mock' = ข้อมูลจำลองในเบราว์เซอร์ · 'http' = เรียก PHP (เฟส 2)
  apiBaseUrl: 'api',      // URL ของ PHP API (relative จากหน้าเว็บ)
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
| `employee-form.html` | เพิ่ม / แก้ไข / พ้นสภาพ | `?id=` (ไม่ใส่ = เพิ่มใหม่) |
| `insurance.html` | ประกันกลุ่ม | `?cycle=YYYY-MM-05&tab=urgent\|in\|out\|history` (ไม่ระบุ tab = แท็บแรกที่มีรายการรอส่ง) |
| `pvd.html` | กองทุนสำรองฯ | `?tab=members\|waiting\|left` |
| `uniform.html` | ชุดฟอร์ม | `?tab=history` |
| `rules.html` | เงื่อนไขสวัสดิการ | `?tab=insurance\|pvd\|uniform\|settings\|open` |
| `sites.html` | หน่วยงาน | – |
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
  insuranceCycleDay: number;       // 5 — รอบแจ้งประกันของพนักงานทุกประเภทยกเว้นรายวัน
  insuranceCycleDayDaily?: number; // 6 — พนักงานรายวัน (DAILY) ส่งแจ้งแยกรอบ (ไม่กำหนด = ใช้ insuranceCycleDay)
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
  enrollCycleDate: ISODate | null; // รอบที่จะแจ้งเข้า (วันที่ 5 · รายวัน = วันที่ 6)
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

### 7.4 ส่งออกไฟล์แจ้งบริษัทประกัน — เติมลงไฟล์แบบฟอร์มที่ HR อัปโหลด
HR ใช้บริษัทประกันหลัก 2 ราย แต่ละรายมี**ไฟล์ Excel แบบฟอร์มของตัวเอง** — ระบบไม่สร้างหน้าตาไฟล์เอง แต่ **เติมรายชื่อลงไฟล์แบบฟอร์มนั้น** (คงตัวอักษร เส้นขอบ merge ความกว้าง หมายเหตุ ช่องลงนาม ทุกอย่าง)

**ขั้นตอนในหน้า "แบบฟอร์มประกัน"**
1. **อัปโหลดไฟล์** (.xlsx / .xls — .xls แปลงด้วย SheetJS; เส้นขอบบางส่วนอาจหาย ระบบใส่ให้หัวตาราง+แถวข้อมูล) → ระบบอ่านตำแหน่งให้ (`templateDetect.js`)
2. **ตรวจตำแหน่งบนตัวอย่างไฟล์จริง** — คลิกคอลัมน์/เซลล์เพื่อแก้
3. **ตั้งค่าการส่งออก** (เปิดใช้, รูปแบบวันที่, เครื่องหมาย, ชื่อไฟล์/ชีต, ผู้แจ้ง) + **ทดลองสร้างไฟล์** ด้วยข้อมูลสมมติ
4. **บันทึก** → ล้างรายชื่อพนักงานในไฟล์ (ข้อมูลบุคคล) + เซลล์ที่ระบบเติม + ชีตที่ไม่ใช้ แล้วเก็บไฟล์ (`sanitizeTemplate`)
5. **ผูกบริษัท** ที่ตาราง "บริษัทในเครือส่งแจ้งกับบริษัทประกันไหน" (1 บริษัท = 1 บริษัทประกัน + เลขกรมธรรม์ + ผู้ถือกรมธรรม์ + แผน) → `saveInsurerBindings`

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
  listInsurers(): Promise<InsurerForm[]>;
  saveInsurer(form: InsurerForm): Promise<InsurerForm>;   // id = 0 → สร้างใหม่ · template.data = ไฟล์ .xlsx (base64) ที่ล้างข้อมูลบุคคลแล้ว · 422 + errors
  saveInsurerBindings(b: { companyCode: CompanyCode; insurerId: number | null; policyNo: string; holderName: string; plan: string }[]): Promise<InsurerForm[]>;
  deleteInsurer(id: number): Promise<void>;

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

  // ----- เข้าสู่ระบบ -----
  login(username: string, password: string): Promise<{ username: string; name: string; role: string }>; // 401 ถ้าไม่ถูกต้อง
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
| GET | `/api/insurance/batches` | – | `InsuranceBatch[]` (ใหม่ก่อน · แนบ `employees` แบบย่อ) |
| GET | `/api/insurance/batches/{id}` | – | `InsuranceBatchDetail` / 404 |
| POST | `/api/insurance/batches` | `{cycleDate, type, employeeIds}` | `InsuranceBatch` (201, items ประเภทเดียว) — ใช้ภายใน |
| POST | `/api/insurance/exports` | `{cycleDate, insurerId, record}` | `InsurerExport` · record = แทนที่ batch ของรอบ + บริษัทประกันนั้น (transaction) |
| GET | `/api/insurers` | – | `InsurerForm[]` |
| POST | `/api/insurers` | `InsurerForm` | `InsurerForm` (201) / 422 `{error, errors}` |
| PUT | `/api/insurers/{id}` | `InsurerForm` | `InsurerForm` / 422 |
| DELETE | `/api/insurers/{id}` | – | 204 |
| PUT | `/api/insurers/bindings` | `{bindings: [{companyCode, insurerId, policyNo, holderName, plan}]}` | `InsurerForm[]` (ผูกทุกบริษัทในครั้งเดียว · transaction) |
| GET | `/api/pvd/members` | – | `PvdRow[]` |
| GET | `/api/uniform/issues` | `?employeeId=` | `UniformIssue[]` |
| POST | `/api/uniform/issues` | `{employeeId, entitlementKey, event, qty, size, issuedAt}` | `UniformIssue` (201) |
| GET | `/api/uniform/pending` | – | `UniformPendingRow[]` |
| POST | `/api/sites` | `{companyCode, name, hasGroupInsurance, poloColor}` | `Site` (201) |
| DELETE | `/api/sites/{id}` | – | 204 / 409 |
| DELETE | `/api/employees/{id}` | – | 204 / 409 |
| DELETE | `/api/insurance/batches/{id}` | – | 204 |
| DELETE | `/api/uniform/issues/{id}` | – | 204 |
| POST | `/api/auth/login` | `{username, password}` | `{username, name, role}` + ตั้ง session cookie (401 ถ้าผิด) |
| POST | `/api/auth/logout` | – | 204 |
| GET | `/api/auth/me` | – | ผู้ใช้ปัจจุบัน หรือ 401 |
| GET | `/api/monitor/tasks` | – | `MonitorTask[]` (เรียงด่วนก่อน) |
| GET | `/api/activity` | `?entity=&employeeId=&limit=` | `ActivityLog[]` (ใหม่ก่อน) |

**Validation ที่ต้องมีทั้ง mock และ PHP**
- `empCode` ห้ามซ้ำ → 409 `"รหัสพนักงานซ้ำ"`
- ส่งแจ้งประกันซ้ำ (IN ซ้ำ หรือ OUT/URGENT ซ้ำ) → 409 `"มีพนักงานที่ถูกแจ้งไปแล้ว N ราย"`
- `employeeIds` ว่าง → 422 `"ไม่มีรายการที่เลือก"`
- แจกชุดฟอร์มซ้ำ key เดิม → 409 `"รายการนี้แจกไปแล้ว"`
- ไม่พบข้อมูล → 404
- ลบหน่วยงานที่ยังมีพนักงาน / ลบพนักงานที่มีประวัติ → 409 พร้อมข้อความแนะนำทางเลือก
- ทุก create/update/delete/cancel ต้องเขียน `audit_log` (= `ActivityLog`) พร้อม `summary` ภาษาไทย และ `user_name` จาก session
- ทุก endpoint (ยกเว้น `/api/auth/login`) ต้องมี session → ไม่มี = 401 (หน้าเว็บพากลับหน้า login)

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

### `infrastructure/http/httpApi.js` (แกนหลัก)
```js
async req(path, init) {
  let res;
  try {
    res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
      credentials: 'include',
    });
  } catch { throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 0); }
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || body.error !== undefined) throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status);
  return body.data;
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
| `field`, `input`, `input-icon`, `form-section`, `form-grid`, `form-footer` | ฟอร์ม | ดู `employee-form.html` |
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
| `new ExcelGrid(el, { columns, rowKey, validate, onSave, newRow, onDelete, onOpen, pageSize })` | `datagrid.js` | ตารางแบบ Excel — ข้อ 10.6 |
| กรองคอลัมน์ที่หัวตาราง | `columnFilter.js` | **เปิดอัตโนมัติทุกตาราง** — คลิกกรวยที่หัวคอลัมน์: เรียงน้อย→มาก/มาก→น้อย, ค้นหาค่า, ติ๊กเลือกค่า (มีจำนวนแต่ละค่า) · แถบสรุปตัวกรอง + ล้าง · คอลัมน์: `filter: false` = ปิด, `text(row)` = ข้อความที่ใช้กรอง, `sort(row)` = ค่าที่ใช้เรียง (วันที่ ISO, ตัวเลข) · ตาราง Excel: แถวที่เพิ่งแก้ยังแสดงแม้ไม่ตรงตัวกรอง |
| ตรึงคอลัมน์ไว้ด้านซ้าย | `columnFilter.js` (`loadPins`, `savePins`, `orderByPins`, `tableId`) | **เปิดอัตโนมัติทุกตาราง** — ในกล่องกรองของหัวคอลัมน์มีปุ่ม "ตรึงคอลัมน์ไว้ด้านซ้าย" / "เลิกตรึงคอลัมน์" · ตรึงได้หลายคอลัมน์ (ย้ายไปต่อจากเลขแถวตามลำดับเดิม) · ติดอยู่กับที่เมื่อเลื่อนแนวนอน มีเงาที่ขอบคอลัมน์สุดท้าย + ไอคอนหมุดที่หัวคอลัมน์ · จำแยกต่อตาราง/ต่อเครื่องใน `localStorage` คีย์ `hl-pins:<ไฟล์หน้า>#<id ตาราง>` (ระบุเองได้ด้วย `opts.id`) |
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
│  ☺ HL      │  ☰  [🔍 ค้นหาพนักงาน  /]                               ☾   │ ← Topbar (sticky, blur)
│  Welfare   ├───────────────────────────────────────────────────────────┤
│ ▣ ภาพรวม   │  หัวหน้า (24px)                              [ปุ่มหลัก]   │ ← page-head
│ ☑ ติดตามงาน │  คำอธิบายสั้น                                              │
│ ☺ พนักงาน  │  ┌─Stat─┐ ┌─Stat─┐ ┌─Stat─┐ ┌─Stat─┐                       │
│ ⛨ ประกัน ② │  └──────┘ └──────┘ └──────┘ └──────┘                       │
│ ฿ PVD      │  ┌──────── card ────────┐ ┌──── card ────┐                │
│ 👕 ชุดฟอร์ม③│  └──────────────────────┘ └──────────────┘                │
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
│ ☺ [🔍 ค้นหาพนักงาน…        ]  ?  ☾ │ ← Topbar: โลโก้ | ค้นหา (ชิดโลโก้ ยืดเต็มที่เหลือ) | ปุ่ม
├──────────────────────────────────┤
│  เนื้อหา (เว้นล่าง 88px)            │
├──────┬──────┬──────┬──────┬──────┤
│  ▣   │  ☺   │ ⛨②  │ 👕③ │  ⊞   │ ← .bottom-nav (fixed, blur, รองรับ safe-area)
│ภาพรวม│พนักงาน│ประกัน│ชุดฟอร์ม│เพิ่มเติม│   5 ปุ่มกว้างเท่ากัน · หน้าปัจจุบันมีแถบ gradient ด้านบน
└──────┴──────┴──────┴──────┴──────┘
```
- 4 หน้าหลักกำหนดที่ `BOTTOM_NAV` / `BOTTOM_LABEL` ใน `app/shell.js` · ตัวนับงานค้างแสดงบนไอคอนเหมือน sidebar
- **ซ่อนอัตโนมัติ:** ปัดขึ้น (เลื่อนอ่านต่อลงไป) = เมนูล่างเลื่อนหายลงขอบจอ · ปัดลง / กลับบนสุด = แสดงกลับ · แถบปุ่มฟอร์มและ Toast เลื่อนตาม · ปรับความไวได้ที่ `HIDE_AFTER` / `MIN_DELTA` ใน `autoHideBottomNav()` (`app/shell.js`) · เลื่อนตารางแนวนอนหรือเมนูเต็มเปิดอยู่ ไม่มีผล
- "เพิ่มเติม" เปิดเมนูเต็ม (drawer) — PVD, เงื่อนไข, หน่วยงาน, แหล่งข้อมูล, ผู้ใช้/ออกจากระบบ · ไฮไลต์เมื่ออยู่หน้าที่ไม่มีในเมนูล่าง · Esc / แตะพื้นหลัง = ปิด
- แถบปุ่มบันทึกของฟอร์ม (`.form-footer`) และ Toast ขยับขึ้นอยู่เหนือเมนูล่าง
- เมนูแสดง **ตัวนับงานค้าง**: ประกันกลุ่ม = แจ้งออกทันทีค้าง (แดง), ชุดฟอร์ม = ค้างแจก (เหลือง)
- ช่องค้นหาใน Topbar → Enter ไป `employees.html?q=…` · กด `/` เพื่อโฟกัส
- ป้ายแหล่งข้อมูล: `Mock data` (เหลือง) / `API` (เขียว)

### 10.6 ตารางแบบ Excel (`ExcelGrid`)
ใช้กับข้อมูลที่ HR แก้บ่อย: **พนักงาน** และ **หน่วยงาน** · ตารางอ่านอย่างเดียวใช้ `DataTable`

| การใช้งาน | ผลลัพธ์ |
|---|---|
| คลิกเซลล์ | เลือกเซลล์ (กรอบสีหลัก) |
| ดับเบิลคลิก / Enter / F2 / พิมพ์ตัวอักษร | เริ่มแก้ไข (พิมพ์ = แทนค่าด้วยตัวที่พิมพ์) |
| Enter / Tab / Shift+Tab | บันทึกแล้วเลื่อนลง / ขวา / ซ้าย |
| Esc | ยกเลิกการแก้ |
| ← ↑ ↓ → | เลื่อนเซลล์ |
| คลิก / Space บนเซลล์สวิตช์ | สลับค่าและบันทึกทันที |
| เซลล์ select (คลิกซ้ำ / ดับเบิลคลิก / พิมพ์) | เปิดรายการค้นหาได้ในเซลล์ |
| ปุ่ม "+ เพิ่มแถว" | แถวใหม่ขึ้นบนสุด (ป้าย "ใหม่") · ช่องบังคับที่ยังว่างขึ้นกรอบแดง · **บันทึกอัตโนมัติเมื่อกรอกครบ** |

- **บันทึกรายแถวอัตโนมัติ** หลังแก้แต่ละเซลล์ — ถ้ายังไม่ผ่าน `validate` จะยังไม่ส่ง และแสดง ⚠ ที่เลขแถว + ข้อความใต้ตารางเมื่อเลือกแถวนั้น
- สถานะที่คอลัมน์เลขแถว: ⟳ กำลังบันทึก · ✓ บันทึกแล้ว · ⚠ ผิดพลาด · "ใหม่"
- `onSave(row, isNew)` ต้อง **คืนแถวที่บันทึกแล้ว** — ตารางอัปเดตตัวเอง
- เซลล์ที่แก้ไม่ได้สำหรับแถวนั้น (เช่น ระดับ ของ Pro Site) เป็นพื้นเทา · หัวตาราง + เลขแถว + ปุ่มท้ายแถว ติดอยู่กับที่เมื่อเลื่อน
- เปลี่ยนบริษัท/ประเภท → `normalizeEmployee` จัดหน่วยงาน/ฝ่าย/ตำแหน่งให้สอดคล้องอัตโนมัติ
- การพ้นสภาพ (หลายช่อง ผลกระทบสูง) ทำผ่าน `employee-form.html`

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
});
grid.setRows(await api.listSites());
```

### 10.7 การแบ่งหน้า (ข้อมูลเยอะ)
| หน้า | ต่อหน้า | หมายเหตุ |
|---|---|---|
| พนักงาน | 25 | เลขหน้าเก็บใน URL (`?page=`) · เปลี่ยนตัวกรอง → กลับหน้า 1 |
| ประกันกลุ่ม (แต่ละส่วน) / PVD / ชุดฟอร์ม | 25 | ประวัติ batch 10 · เปลี่ยนแท็บ → หน้า 1 |
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
**Desktop (≥1024px) — สูงพอดีจอ:** หน้าต่างไม่เลื่อน · หน้ารายการ (ภาพรวม, ศูนย์ติดตามงาน, พนักงาน, PVD, ชุดฟอร์ม, หน่วยงาน) ให้ตารางยืดเต็มความสูงที่เหลือและเลื่อนภายใน (หัวตาราง/แถบแบ่งหน้าอยู่กับที่) · หน้าที่เนื้อหายาว (ประกันกลุ่ม, รายละเอียด, ฟอร์ม) เลื่อนภายในพื้นที่เนื้อหา · ทดสอบแล้วที่ 1440×900 และ 1366×768

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
| <768 (มือถือ) | **เมนูด้านล่าง 5 ปุ่ม** (ซ่อน ☰) · topbar: ช่องค้นหาชิดโลโก้ ยืดเต็มที่เหลือ · ตารางอ่านอย่างเดียวเป็นการ์ด · **ตาราง Excel (พนักงาน) เป็นการ์ด แตะเพื่อเปิด ปุ่ม "เพิ่มพนักงาน" ไปฟอร์มเต็ม** (`mobileCard`, `mobileAddHref`) · ตาราง Excel อื่นเลื่อนแนวนอน |
| <640 (มือถือเล็ก) | Stat 2×2 กะทัดรัด · หัวหน้าเล็กลง ปุ่มเต็มแถว · แจ้งเตือนที่มีหัวข้อแสดงแค่หัวข้อ + ปุ่ม · ปุ่มรีเฟรช/อัตโนมัติเหลือไอคอน (`hide-sm`) |
| จอสัมผัส (`pointer: coarse`) | ปุ่ม/ไอคอน/เลขหน้า/ชิป/ตัวเลือก ≥ 36–40px · ปุ่มกรองหัวคอลัมน์ 32px · ซ่อนป้ายคีย์ลัด `/` |

- **พื้นที่เนื้อหา (`.page`) กว้างเต็มจอ** แต่จำกัดความกว้างเนื้อหาด้วย padding (`--page-max: 1216px`) → หน้าที่เลื่อนภายใน (ฟอร์ม, รายละเอียด) มี scrollbar อยู่ขอบขวาของจอ ไม่ลอยกลางจอ
- utilities: `hide-sm` (ซ่อน <640), `hide-mobile` / `show-mobile` (ซ่อน/แสดง <768)
- ตรวจแล้วที่ 360, 390, 768, 1024, 1280, 1366, 1440, 1920 px: ไม่มีหน้าล้นแนวนอน
- Contrast ≥ WCAG AA ทั้งสองธีม · ทุก input มี `<label>` · ปุ่มไอคอนมี `aria-label` · Toast ใช้ `role="status"` · `lang="th"`

### 10.9 หน้าเข้าสู่ระบบ & การยืนยันตัวตน
- **login.html**: ฝั่งซ้ายเป็นแบรนด์บนพื้น gradient ที่เลื่อนสีช้า ๆ + วงกลมเบลอลอย · ฝั่งขวาเป็นฟอร์มที่เลื่อนขึ้นทีละส่วน (มือถือซ่อนฝั่งแบรนด์)
- ฟอร์ม: ชื่อผู้ใช้, รหัสผ่าน (แสดง/ซ่อน, เตือน Caps Lock), จดจำฉัน, ลืมรหัสผ่าน (ข้อความตั้งใน `config.js`), บัญชีทดลอง (เฉพาะ mock — คลิกเพื่อกรอก)
- ผิดพลาด: ช่องสั่น + ข้อความแดง · ระหว่างตรวจ: ปุ่มแสดง spinner
- **สำเร็จ**: ปุ่มเปลี่ยนเป็น ✓ → วงกลม gradient ขยายจากปุ่มเต็มจอ → วาดวง + เครื่องหมายถูก → "ยินดีต้อนรับ, ชื่อ" + แถบโหลด → เข้าหน้าที่ต้องการ (~2 วินาที; ผู้ที่ตั้งลดการเคลื่อนไหวจะข้ามทันที)
- ปรับความเร็วอนิเมชันทั้งหน้า: `--login-speed` ใน `login.css`

| เรื่อง | การทำงาน |
|---|---|
| ป้องกันทุกหน้า | สคริปต์ใน `<head>` ของทุกหน้าตรวจ session ก่อนแสดงผล → ไม่มี = ไป `login.html?next=หน้าเดิม` (ไม่มีเนื้อหาแวบให้เห็น) · `initPage()` ตรวจซ้ำอีกชั้น |
| Session | `app/auth.js` เก็บใน sessionStorage (ปิดแท็บ = ออก) หรือ localStorage เมื่อเลือก "จดจำฉัน" · หมดอายุตาม `auth.sessionHours` |
| หลังเข้าสู่ระบบ | กลับหน้าเดิม (`?next=` รับเฉพาะไฟล์ .html ในโฟลเดอร์เดียวกัน กันลิงก์พาไปเว็บอื่น) · ชื่อ + บทบาท + ปุ่มออกจากระบบ ยึดอยู่ล่างสุดของ sidebar (มือถืออยู่ในเมนู drawer) · ทุกกิจกรรมบันทึกชื่อผู้ใช้ |
| ออกจากระบบ | ปุ่มข้างชื่อผู้ใช้ (ล่างสุดของ sidebar) → `login.html?bye=1` |
| ปิดระบบ login | `config.js` → `auth.enabled: false` (เข้าเป็น "ผู้ใช้ทั่วไป" อัตโนมัติ) |
| ผู้ใช้ทดลอง (mock) | `infrastructure/mock/users.js` — ⚠️ ไฟล์นี้ส่งถึงเบราว์เซอร์ ห้ามใส่รหัสผ่านจริง |
| เฟส 2 (PHP) | `POST api/auth/login` ตรวจกับตาราง `users` (`password_hash`/`password_verify`) ตั้ง session cookie (`HttpOnly`, `SameSite=Lax`) · ทุก endpoint ตรวจ session → 401 · **การตรวจในเบราว์เซอร์ใช้เพื่อการนำทางเท่านั้น ความปลอดภัยจริงอยู่ที่ PHP** |

### 10.10 แนะนำการใช้งาน (driver.js)
- ทุกหน้ามี "ทัวร์" สั้น ๆ 2–9 ขั้น ไฮไลต์ส่วนสำคัญพร้อมคำอธิบายภาษาไทย
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
| ให้ผู้ใช้ทุกคนเห็นแนะนำใหม่หลังแก้เนื้อหา | เพิ่ม `version` ใน `tour.config.js` |
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
| **ภาพรวม & ติดตามงาน — แท็บสรุป** | คำทักทาย + วันที่วันนี้ · Stat 4 ใบ: พนักงานปัจจุบัน, รอบแจ้งประกันถัดไป (เข้า/ออก), แจ้งออกทันทีค้าง, ชุดฟอร์มค้างแจก · กราฟแท่งพนักงานแยกบริษัท · "จะครบสิทธิใน 30 วัน" | Stat คลิกไปหน้าที่เกี่ยวข้อง · แจ้งออกทันทีค้าง > 0 → Alert แดงด้านบน + ปุ่ม "ไปส่งแจ้ง" |
| **ภาพรวม & ติดตามงาน — แท็บคิวงาน / บันทึกกิจกรรม** (เดิม: ศูนย์ติดตามงาน) | Stat ด่วน/ต้องทำ/ติดตาม/กิจกรรมวันนี้ (คลิกกรอง) · คิวงาน (ระดับ, งาน, พนักงาน, กำหนด/เลยมา N วัน, ปุ่มไปดำเนินการ) กรองตามประเภท + ค้นหา · บันทึกกิจกรรม (ไทม์ไลน์ กรองตามประเภท, โหลดเพิ่ม) | รีเฟรชอัตโนมัติทุก 60 วิ (ปิดได้) + เมื่อกลับมาที่แท็บ · แสดงเวลาอัปเดตล่าสุด |
| **พนักงาน** | **ช่องค้นหา** รหัส/ชื่อ + **แท็กกรองเร็ว** สถานะ / ประเภท / บริษัท (กลุ่มละ 1 ค่า แตะซ้ำ = ยกเลิก · ตัวเลขบนแท็ก = จำนวนที่จะได้ นับตามคำค้นและแท็กกลุ่มอื่น · "ล้างแท็ก" · เก็บใน URL `?q=&status=&type=&company=` · มือถือแท็กเป็นแถวเดียวปัดซ้าย-ขวา · กำหนดกลุ่มที่ `TAG_GROUPS` ใน `pages/employees.js`) · **ตาราง Excel** แก้ทุกช่องในตาราง (**ไม่แสดงเงินเดือน** — แก้ที่ฟอร์มพนักงาน · เพิ่มแถวจากตารางได้โดยไม่ต้องกรอกเงินเดือน) · "+ เพิ่มแถว" · ปุ่มเปิดรายละเอียด / ลบ ท้ายแถว · ปุ่ม "เพิ่มด้วยฟอร์มเต็ม" | ค้นหาแบบ debounce 250ms · ล้างตัวกรอง · บันทึกอัตโนมัติรายแถว · ลบต้องยืนยัน |
| **รายละเอียดพนักงาน** | Header: Avatar, ชื่อ, รหัส, Badge สถานะ, ปุ่มแก้ไข · แถบข้อมูลย่อ (บริษัท, หน่วยงาน, ประเภท, สัญญา, อายุงาน) · การ์ดประกันกลุ่ม · การ์ด PVD · การ์ดชุดฟอร์ม (ตารางแต่ละรอบ + เลือกไซซ์ + "บันทึกแจก" + ยกเลิกการแจก) · **ประวัติการเปลี่ยนแปลง** | การ์ดสิทธิ = Badge ใหญ่ + timeline (เริ่มงาน → ครบสิทธิ → รอบแจ้งเข้า → แจ้งออก) · ไม่มีสิทธิ = แสดงเหตุผลเป็นข้อๆ |
| **ฟอร์มพนักงาน** | แบ่ง section: ข้อมูลส่วนตัว / **ข้อมูลแจ้งประกัน** (คำนำหน้า → เลือกเพศให้, เพศ, เลขบัตรประชาชน ตรวจหลักสุดท้าย + จัดรูปแบบ 1-2345-67890-12-3, โทร, อีเมล — ไม่บังคับ) / การจ้างงาน / การพ้นสภาพ · บริษัท→หน่วยงาน (กรองตามบริษัท), ประเภท (ส่วนกลางแสดงฝ่าย+ระดับ / Pro Site แสดงตำแหน่ง), สัญญา, เงินเดือน, วันเริ่มงาน, ผ่านทดลองงาน | ช่องที่ไม่เกี่ยวซ่อนอัตโนมัติ · validation ใต้ช่อง · ปุ่มบันทึก sticky ด้านล่าง · บันทึกสำเร็จ → Toast + กลับหน้ารายละเอียด |
| **ประกันกลุ่ม** | เลือกรอบ (เดือนละ 2 รอบ: วันที่ 5 พนักงานทั่วไป · วันที่ 6 พนักงานรายวัน · ย้อนหลัง 6 / ล่วงหน้า 3 เดือน) · **แท็บ**: แจ้งออกทันที / แจ้งเข้า / แจ้งออก / ประวัติการส่งออก — ตัวเลขบนแท็บ = จำนวนยังไม่ส่งออก (แดง/ฟ้า/เหลือง) · คอลัมน์ "บริษัทประกัน" · **ไม่มีปุ่มส่งแจ้ง/checkbox** · ปุ่ม **"ส่งออกไฟล์แจ้งประกัน"** → modal: การ์ดต่อบริษัทประกัน (จำนวนเข้า/ออกต่อบริษัท, เลขกรมธรรม์, เตือนข้อมูลไม่ครบพร้อมลิงก์แก้, ดาวน์โหลด Excel / CSV) + ติ๊ก "บันทึกว่าแจ้งรอบนี้แล้ว" + เตือนบริษัทที่ยังไม่ผูกแบบฟอร์ม (ข้อ 7.4) · **แท็บประวัติการส่ง**: 1 แถว = ส่งออก 1 ครั้ง · คอลัมน์ "เข้า / ออก" (จำนวนแจ้งเข้า · แจ้งออกทันที · แจ้งออก) · คอลัมน์ "รายชื่อ" (2 ชื่อแรก + "+N" · ค้นหาชื่อที่หัวคอลัมน์ได้) · **คลิกแถว / "ดูรายชื่อ" → modal รายชื่อใน batch** (ประเภทแจ้งต่อแถว, รหัส-ชื่อ ลิงก์ไปหน้าพนักงาน, บริษัท·ประเภท, หน่วยงาน, วันครบสิทธิ/วันมีผล, เหตุผล · ค้นหาในรายชื่อเมื่อ > 5 ราย · ส่งออก CSV เฉพาะ batch · ยกเลิกการส่ง) · ลิงก์ตรง `?batch=<id>` · **ยกเลิก batch** | ตัวนับในหัว section · เลือกทั้งหมด · Modal ยืนยัน "ส่งแจ้งเข้า 5 ราย รอบ 5 พ.ย. 69?" · แถวที่ส่งแล้วแสดง Badge เขียว checkbox ปิด |
| **แบบฟอร์มประกัน** (`insurers.html`, เมนูตั้งค่า) | **ภาพรวม**: ① การ์ดบริษัทประกัน (ไฟล์แบบฟอร์ม · ชีต · จำนวนคอลัมน์/ช่องอัตโนมัติ · ผู้อัปโหลด · บริษัทที่ผูก · แก้ไข / ดาวน์โหลดไฟล์แบบฟอร์ม) + การ์ด "เพิ่มบริษัทประกัน" ② ตาราง **บริษัทในเครือส่งแจ้งกับบริษัทประกันไหน** (เลือกบริษัทประกัน/ไม่ส่งแจ้ง + เลขกรมธรรม์ + ผู้ถือกรมธรรม์ + แผน · บันทึกทีเดียว) · **แก้แบบฟอร์ม** (`?id=&step=`): ขั้น ① ไฟล์แบบฟอร์ม (ชื่อ/ชื่อย่อ + ลากวางไฟล์ .xlsx/.xls) ② ตำแหน่งข้อมูล (เลือกชีตบริษัท/ชีตสรุป · แถวหัวตาราง/ข้อมูล/ท้าย · **ตัวอย่างไฟล์จริง** ระบายสี ฟ้า=หัวตาราง เขียว=แถวข้อมูล เทา=ส่วนท้าย ม่วง=เติมอัตโนมัติ · แถวป้าย "ข้อมูล" เหนือคอลัมน์ · คลิกคอลัมน์ → เลือกข้อมูล + ตัวอย่างค่า + เติมในแถว · คลิกเซลล์ → ข้อความที่ใส่ + ปุ่ม "+ เลขกรมธรรม์ / + เดือนของรอบ …" + ผลลัพธ์) ③ ตั้งค่าการส่งออก + ทดลองสร้างไฟล์ (ดูทุกชีต + ดาวน์โหลด) | ขั้น 2–3 ล็อกจนกว่าจะอัปโหลด · เตือนไฟล์ .xls · แจ้งว่าล้างรายชื่อในไฟล์ก่อนเก็บ · เตือนบริษัทที่ผูกกับแบบฟอร์มที่ปิด/ไม่มีไฟล์ · มีงานค้างแล้วออก → ถามก่อน |
| **PVD** | Stat: สมาชิก, หักสะสมรวม/เดือน, สมทบรวม/เดือน · ตารางสมาชิก (วันเป็นสมาชิก, เงินเดือน, หัก, สมทบ, อายุสมาชิก, vesting) · ส่งออก CSV | Alert เหลืองถ้า vesting เป็นค่าตัวอย่าง · vesting แสดงเป็น progress bar |
| **ชุดฟอร์ม** | แท็บ "ค้างแจก" (เลือกไซซ์ + บันทึกแจกในแถว) / "ประวัติการแจก" · สรุปจำนวนตามแบบเสื้อ (วางแผนสั่งผลิต) | แถวเกินกำหนด > 30 วัน Badge แดง · บันทึกแล้วแถวหายพร้อม Toast |
| **เงื่อนไขสวัสดิการ** | แท็บ: ประกันกลุ่ม / PVD / ชุดฟอร์ม / ค่าตั้งค่า (read-only ในเฟส 1) + รายการประเด็นที่รอยืนยันกับ HR | |
| **หน่วยงาน** | **ตาราง Excel**: บริษัท, ชื่อ, สวิตช์ประกันกลุ่ม, สีโปโล · "+ เพิ่มหน่วยงาน" · ลบท้ายแถว | บันทึกทันที · ลบได้เฉพาะที่ไม่มีพนักงาน |

**ไฟล์ของแต่ละหน้า:** `web/<หน้า>.html` + `web/assets/js/pages/<หน้า>.js` (ภาพรวม = `index.html` + `dashboard.js`) — ดูตารางพารามิเตอร์ URL ที่ข้อ 5.3

**UI** — ภาษาไทยทั้งหมด · รายละเอียด token/class/component ดู [ข้อ 10](#10-design-system--ux)

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
APP_BASE_PATH=/hl-welfare   # path ที่วางระบบบน host (ใช้ตัด prefix ใน Router)
CORS_ORIGIN=                 # ว่าง = ไม่เปิด CORS (หน้าเว็บกับ API อยู่ origin เดียวกัน)
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

// CORS (เฉพาะกรณีหน้าเว็บกับ API อยู่คนละ origin)
if (!empty($_ENV['CORS_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_ENV['CORS_ORIGIN']);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
}

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
$r->get('/api/insurance/batches/{id}',        [InsuranceController::class, 'batch']);   // รายชื่อใน batch
$r->post('/api/insurance/batches',            [InsuranceController::class, 'submit']);
$r->post('/api/insurance/exports',            [InsuranceController::class, 'export']);   // ไฟล์แจ้งประกัน
$r->get('/api/insurers',                       [InsurerController::class, 'index']);
$r->post('/api/insurers',                      [InsurerController::class, 'create']);
$r->put('/api/insurers/{id}',                  [InsurerController::class, 'update']);
$r->delete('/api/insurers/{id}',               [InsurerController::class, 'delete']);
$r->put('/api/insurers/bindings',              [InsurerController::class, 'bindings']);
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
- `Domain/Eligibility.php` แปลงจาก `web/assets/js/domain/insurance.js`, `pvd.js`, `uniform.js` แบบบรรทัดต่อบรรทัด · use-case ใน `Application/Service` แปลงจาก `application/usecases/*.js` ใช้ `DateTimeImmutable` + timezone UTC สำหรับคำนวณวัน
- `submitInsuranceBatch`, `exportInsurance(record)` และ `createUniformIssue` ทำใน **transaction** และพึ่ง unique key กันซ้ำ
- ตอบ 422 พร้อม `errors: {field: message}` เมื่อ validation ไม่ผ่าน (HttpApi ส่งต่อเป็น `ApiError.details`)
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
  title                ENUM('นาย','นาง','นางสาว') NULL,
  gender               ENUM('M','F') NULL,
  national_id          CHAR(13) NULL,
  phone                VARCHAR(10) NULL,
  email                VARCHAR(150) NULL,
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
  cycle_date    DATE NOT NULL,                    -- ส่งออก 1 ครั้ง = 1 แถว (เข้า/ออกอยู่ใน insurance_batch_items)
  submitted_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_by  VARCHAR(100) NOT NULL,
  insurer_id    INT UNSIGNED NULL,                -- แบบฟอร์มที่ส่งออก (ลบแบบฟอร์มได้ → ไม่ทำ FK)
  insurer_name  VARCHAR(100) NULL,
  INDEX idx_batch_cycle (cycle_date),
  INDEX idx_batch_cycle_insurer (cycle_date, insurer_id)
) ENGINE=InnoDB;

-- แบบฟอร์ม Excel ของบริษัทประกัน: ค่าที่ซ้อนกัน (คอลัมน์, หัว/ท้ายเอกสาร) เก็บเป็น JSON
CREATE TABLE insurer_forms (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  short_name   VARCHAR(60)  NOT NULL,
  active       TINYINT(1)   NOT NULL DEFAULT 1,
  config_json  LONGTEXT     NOT NULL,             -- InsurerForm ส่วนที่เหลือ (companies, dateFormat, signer, template layout …)
  template_file LONGBLOB    NULL,                 -- ไฟล์ .xlsx แบบฟอร์ม (ล้างข้อมูลบุคคลแล้ว) — API ส่งเป็น base64
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE insurance_batch_items (
  batch_id     INT UNSIGNED NOT NULL,
  employee_id  INT UNSIGNED NOT NULL,
  type         ENUM('IN','OUT','URGENT') NOT NULL,
  direction    ENUM('IN','OUT') AS (IF(type = 'IN', 'IN', 'OUT')) STORED, -- URGENT นับเป็น OUT
  PRIMARY KEY (batch_id, employee_id, direction),
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

-- ผู้ใช้ระบบ (หน้า login) — รหัสผ่านเก็บด้วย password_hash() เท่านั้น
CREATE TABLE users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(50)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  name           VARCHAR(150) NOT NULL,
  role           ENUM('HR_ADMIN','HR_COMPANY','PAYROLL','STOCK','EXECUTIVE') NOT NULL DEFAULT 'HR_ADMIN',
  company_code   VARCHAR(10) NULL,           -- null = ทุกบริษัท (เฟส 3: จำกัดสิทธิ์ตามบริษัท)
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at  DATETIME NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- = ActivityLog ในแท็บบันทึกกิจกรรม (ห้ามแก้/ลบ)
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
 ('insuranceMaxAge','65'),('insuranceCycleDay','5'),('insuranceCycleDayDaily','6'),('absentExtraDays','7'),
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

> ทางลัด: เขียนสคริปต์ `scripts/export-seed.js` (รันด้วย node) ที่ import `buildSeed(today)` จาก `web/assets/js/infrastructure/mock/seed.js` แล้วพิมพ์เป็น `INSERT` ออกมา → ข้อมูล MySQL จะตรงกับ mock ทุกตัว

ติดตั้งฐานข้อมูล:
```bash
mysql -u root -p < backend/database/schema.sql
mysql -u root -p < backend/database/seed.sql
```

---

## 14. นำขึ้น host / สลับจาก mock → MySQL

### 14.1 นำหน้าเว็บขึ้น host (เช่น `https://develophpg.net/hl-welfare/`)
1. อัปโหลด **ไฟล์ทั้งหมดในโฟลเดอร์ `web/`** ไปไว้ที่โฟลเดอร์ `hl-welfare/` บน host (ไม่ต้อง build ไม่ต้องติดตั้งอะไร)
2. เปิด `https://develophpg.net/hl-welfare/` (= `index.html`)
3. ไม่ต้องตั้งค่า `.htaccess` / mod_rewrite — ทุกหน้าเป็นไฟล์ `.html` จริง ลิงก์เป็น path แบบ relative วางใต้โฟลเดอร์ไหนก็ได้

- ทดสอบแล้วบน **Apache 2.2.8 (AppServ) ที่ปิด mod_rewrite** วางใต้ sub-folder — ทุกหน้าแสดงผล และผ่านชุดทดสอบการใช้งานจริง (ข้อ 15.2)
- ไฟล์ `.js` ต้องถูกส่งเป็น `application/javascript` หรือ `text/javascript` (ค่าปกติของทุก web server) — ถ้า host ส่งเป็น `text/plain` หน้าจะว่าง ให้เพิ่ม `AddType text/javascript .js` ใน `.htaccess`
- **อัปเดตเวอร์ชันแล้วหน้าแสดงผลแปลก ๆ** = เบราว์เซอร์ใช้ไฟล์ .js/.css เก่าใน cache ปนกับไฟล์ใหม่ (ไม่มีขั้นตอน build จึงไม่มีชื่อไฟล์แบบ hash) → `web/.htaccess` สั่ง `Cache-Control: no-cache` ให้เบราว์เซอร์ตรวจไฟล์ใหม่ทุกครั้ง (ไฟล์ไม่เปลี่ยนได้ 304 ไม่โหลดซ้ำ) · ต้องเปิด `mod_headers` และ `AllowOverride` บน host (ไม่มีก็ไม่ error แค่ไม่มีผล) · ระหว่างนี้ผู้ใช้กด **Ctrl+F5** ได้
- โหมด mock เก็บข้อมูลใน `localStorage` **ของแต่ละเบราว์เซอร์** — เหมาะกับเดโม/ทดลอง ยังไม่ใช่ข้อมูลกลางจนกว่าจะต่อ PHP (เฟส 2)

> 📝 บทเรียนจากเวอร์ชัน React: เคยอัปโหลด source `.tsx` ขึ้น host ตรง ๆ ทำให้เห็นโค้ดแทนหน้าเว็บ และ URL อย่าง `/hl-welfare/monitor` ได้ 404 เพราะไม่มีไฟล์จริง — เวอร์ชัน HTML นี้ไม่มีขั้นตอน build และทุกหน้าเป็นไฟล์จริง จึงไม่เกิดปัญหาทั้งสองแบบ

### 14.2 สลับไปใช้ PHP + MySQL (เฟส 2)
1. สร้าง DB ตามข้อ 13 และ `cp backend/.env.example backend/.env` แก้รหัสผ่าน
2. ทดสอบ backend
   ```bash
   cd backend
   composer install
   composer serve            # = php -S localhost:8000 -t public
   curl http://localhost:8000/api/companies
   ```
3. วาง backend ให้หน้าเว็บเรียก `api/...` ได้ (same-origin ไม่ต้องตั้ง CORS) เช่น บน host:
   ```text
   hl-welfare/
   ├── index.html, employees.html, …   ← จาก web/
   ├── assets/
   └── api/                            ← ชี้ไปที่ backend/public (index.php + .htaccess)
   ```
   `backend/public/.htaccess`
   ```apache
   RewriteEngine On
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteRule ^ index.php [QSA,L]
   ```
   > Router ใน `index.php` ต้องตัด prefix ของ path ให้เหลือ `/api/...` ตามตารางข้อ 8 (หรือกำหนด `APP_BASE_PATH` ใน `.env`)
4. แก้ `web/assets/js/config.js` → `apiMode: 'http'` (และ `apiBaseUrl` ถ้า API อยู่ที่อื่น)
5. เปิดทุกหน้าเทียบกับโหมด mock — ผลคำนวณสิทธิต้องตรงกัน · ป้ายใน sidebar เปลี่ยนเป็น "API"

---

## 15. การทดสอบ

### 15.1 กฎสวัสดิการ + Mock API (Node.js built-in test runner — ไม่ต้องติดตั้งแพ็กเกจ)
```bash
npm test            # = node --test "tests/*.test.js"
```
| ไฟล์ | ครอบคลุม |
|---|---|
| `tests/eligibility.test.js` | ประกันกลุ่ม (30/120 วัน, รอบวันที่ 5, สัญญา 3%, หน่วยงานไม่ได้ประกัน, อายุ 65/66, ขาดงาน +7, เลิกจ้าง urgent, ลาออกก่อนรอบ) · PVD (วันแรก, 120 วัน, 2%, vesting, กระทำผิด 0%) · ชุดฟอร์ม (rule 1/2/17/18, CIC ระดับ 7, โปโลสีตามหน่วยงาน, "2+1", ประจำปีย้อน 3 ปี) · seed |
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

**Backend (PHPUnit)** — `tests/EligibilityTest.php` ใช้ test case ชุดเดียวกัน
> แนะนำย้าย test case เป็น `shared/eligibility-cases.json` (input + expected) ให้ทั้ง `node --test` และ PHPUnit อ่านไฟล์เดียวกัน → รับประกันว่า JS กับ PHP ให้ผลตรงกัน

### 15.2 ทดสอบการใช้งานจริง (ทำแล้วในเฟส 1)
เปิดด้วย Chrome แบบ headless (puppeteer) ผ่าน Apache ในเครื่อง — ผ่าน 17/17:
- Combobox พิมพ์ค้นหา → กรองตาราง + เขียนลง URL
- ตาราง Excel: ดับเบิลคลิกแก้ → Enter บันทึกและคงอยู่หลังรีโหลด · พิมพ์ตัวเลขทับ → Tab · Esc ยกเลิก · เซลล์ select ค้นหาได้ · ข้อมูลผิดไม่บันทึกและแจ้ง error
- หน่วยงาน: เพิ่มแถวบันทึกอัตโนมัติ · สวิตช์บันทึกทันที · ลบหน่วยงานที่มีพนักงาน → ปฏิเสธพร้อมเหตุผล
- ประกันกลุ่ม: เลือกทั้งหมด → ยืนยันส่ง → ยกเลิก batch
- ชุดฟอร์ม: เลือกไซซ์ → บันทึกแจก
- ฟอร์ม: แสดง error ใต้ช่อง · เปลี่ยนเป็น PRO / Pro Site → แสดงช่องตำแหน่ง → บันทึก → PVD เป็นสมาชิกวันแรก
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

## 16. Checklist

### เฟส 1 — หน้าเว็บ (HTML + JS) + Mock ✅
- [x] กฎสวัสดิการ `domain/*.js` + use-case `application/usecases/*.js` + validation `employeeRules.js`
- [x] `npm test` ผ่าน 51/51 (รวม `tests/insurerExport.test.js` และ `tests/excelTemplate.test.js`: อ่านตำแหน่ง/หัว 2 ชั้น/เซลล์อัตโนมัติ, ล้างข้อมูลบุคคล, เติมข้อมูลลงแบบฟอร์ม + ส่วนท้ายเลื่อน, ผูกบริษัท — ใช้ ExcelJS ตัวเดียวกับในเว็บ) (node:test ไม่ต้องติดตั้งแพ็กเกจ)
- [x] MockApi (localStorage, seed + edge cases, บันทึกกิจกรรม) + HttpApi (พร้อมใช้เฟส 2) + `config.js`
- [x] `app.css` design tokens (โทนสว่าง + โหมดมืด) + responsive (มือถือ/แท็บเล็ต)
- [x] UI: DataTable (แบ่งหน้า + การ์ดมือถือ), ExcelGrid, Combobox (`<select data-combobox>`), Modal/Toast/confirm, ไอคอน SVG ในตัว
- [x] 10 หน้า: ภาพรวม, ศูนย์ติดตามงาน, พนักงาน, รายละเอียด, ฟอร์ม, ประกันกลุ่ม, PVD, ชุดฟอร์ม, เงื่อนไข, หน่วยงาน
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
- [x] Loading กลางทั้งระบบ (`ui/loading.js`): **loading กลางจอ** (การ์ดโลโก้ + วงแหวนหมุน + "กำลังโหลด…" บนพื้นหลังเบลอ) อัตโนมัติทุก api/เปลี่ยนหน้า — แสดงเมื่อรอเกิน 250ms อยู่อย่างน้อย 400ms กันกดซ้ำระหว่างแสดง · รีเฟรชอัตโนมัติ/ตัวนับเมนูใช้ `progress.quiet` ไม่ขึ้น loading · loader, ปุ่ม busy, spinner
- [x] แถบแบ่งหน้าใหม่ทั้งระบบ: หน้าแรก/สุดท้าย, แถวต่อหน้าแบบ segmented, ช่องไปหน้า, มือถือพิมพ์เลขหน้าได้
- [x] หน้า login + อนิเมชันเมื่อสำเร็จ + ป้องกันทุกหน้า (mock) · ธีม gradient น้ำเงิน → เขียวทั้งระบบ
- [x] Responsive ใหม่: breakpoints 1024/900/768/640, การ์ดบนมือถือ, พื้นที่กดบนจอสัมผัส, scrollbar ชิดขอบจอ, tour ไฮไลต์ตรงตำแหน่ง
- [ ] ส่งออก CSV เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน (ใส่ UTF-8 BOM แล้ว — รอทดสอบเปิดใน Excel จริง)
- [ ] อัปโหลด `web/` ขึ้น host หน่วยงานและเปิดใช้งานจริง

### เฟส 2 — PHP + MySQL
- [ ] `schema.sql`, `seed.sql` (ข้อมูลตรงกับ mock)
- [ ] Router, Request, Response, Infrastructure/Database
- [ ] Application/Port (interface) + Infrastructure/Persistence (PDO)
- [ ] `Domain/Eligibility.php` + PHPUnit ผ่าน (case เดียวกับ JS)
- [ ] Service + Controller ครบทุก endpoint ในข้อ 8 (รวม DELETE, `/monitor/tasks`, `/activity`)
- [ ] `Application/Service/WorkQueueService` คู่แฝดของ `usecases/workQueue.js`
- [ ] `InsurerExportService` คู่แฝดของ `usecases/insurerExport.js` (`buildInsurerExport`) + `InsurerController` (CRUD + bindings + `validateInsurerForm`) + ตาราง `insurer_forms` (เก็บไฟล์แบบฟอร์มใน `template_file`) · อ่านตำแหน่ง/ล้าง/เติมไฟล์ยังทำในเบราว์เซอร์ (PHP เก็บไฟล์ + ส่งข้อมูล)
- [ ] `InsuranceCycleService::batchDetail()` คู่แฝดของ `buildBatchDetail` (`usecases/insuranceCycle.js`) + `GET /api/insurance/batches/{id}`
- [ ] Validation + transaction + unique key กันซ้ำ
- [ ] audit_log (user_name จาก session)
- [ ] ตาราง `users` + `POST /api/auth/login|logout`, `GET /api/auth/me` + ตรวจ session ทุก endpoint
- [ ] ตั้ง `apiMode: 'http'` ใน `config.js` แล้วทุกหน้าทำงานเหมือน mock

### เฟส 3 (ภายหลัง)
- [ ] สิทธิ์ตาม role / แยกบริษัท (login ทำแล้วในเฟส 1–2)
- [ ] แก้ไขกฎสวัสดิการผ่านหน้าจอ (มี effective date)
- [ ] นำเข้าพนักงาน/รายชื่อลาออกจาก Excel ของ Payroll (ส่วนกลาง + CNS)
- [ ] รับ flag ขาดงาน 3 วันจากระบบลงเวลา
- [ ] สต็อกชุดฟอร์ม

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
- [ ] PVD: ตาราง vesting จริง และนิยาม "ลาออกถูกต้องตามระเบียบ"
- [ ] ชุดฟอร์มส่วนกลาง: ช่อง "วันเริ่มงาน" ว่าง = ไม่ได้จนกว่าจะผ่านทดลองงาน ใช่ไหม?
- [ ] ช่างทีมโมบาย "2+1" = ชุดช่าง 2 + โปโล 1 ใช่ไหม?
- [ ] แจกชุดประจำปีเดือนไหน และต้องทำงานครบกี่เดือนก่อนรอบแจก?
- [ ] CIC ระดับ 6 ขึ้นไป ได้ชุดฟอร์มกี่ตัว?
- [ ] แม่บ้าน CNS และพนักงานรายวัน ได้ชุดฟอร์มไหม?
- [ ] ระดับพนักงาน "6 ขึ้นไป" สูงสุดถึงระดับเท่าไร?
