// ===== คู่มือ "ทีละขั้น" — สอนงานทีละเรื่อง สำหรับผู้ใช้ที่ไม่คุ้นกับระบบ =====
//
// 1 คู่มือ = 1 งานที่ทำจริง (เช่น เพิ่มพนักงานใหม่ · แจ้งประกันประจำเดือน) · ข้ามหน้าได้
// เปิดจากปุ่ม ? ที่แถบด้านบน → เลือกเรื่อง · ตัวขับเคลื่อน: app/tour.js · ตั้งค่า: tour/tour.config.js
//
// คู่มือ (GUIDES):
//   id, title, summary (1 บรรทัด), icon, minutes (เวลาโดยประมาณ)
//   pages    : หน้า/แท็บที่แนะนำเรื่องนี้ (id เดียวกับ initPage / tour ของหน้า) — เรื่องแรกที่ตรงหน้าแสดงเป็น "แนะนำ"
//   practice : true (ค่าเริ่มต้น) = เปิดใน "โหมดฝึก" ข้อมูลตัวอย่าง ไม่กระทบข้อมูลจริง (app/practice.js)
//              false = ใช้ข้อมูลจริง แค่ชี้ให้ดู (หน้าผู้ดูแลระบบ · บัญชีของฉัน)
//   need     : (ไม่ใส่ก็ได้) สิทธิ์ที่ต้องมีถึงจะเห็นเรื่องนี้ — capability เดียวกับ can()
//   steps    : ขั้น
//     page    : หน้าที่ขั้นนี้อยู่ (id หน้า) · href : ไปหน้านี้ก่อน (string หรือ async (h) => string)
//     before  : async (h) => {} ทำก่อนชี้ เช่น กดแท็บ ใส่ข้อมูลตัวอย่าง (h = ตัวช่วยใน app/tour.js)
//     element : selector ของสิ่งที่ชี้ (หลายตัวคั่นด้วย , = ตัวแรกที่มองเห็น) · ไม่ใส่/ไม่เจอ = กล่องกลางจอ
//     title, text : หัวข้อ / คำอธิบาย (ใส่ <b> <br> ได้) · side / align : ตำแหน่งกล่อง
//
// แนวการเขียน: ประโยคสั้น · 1 ขั้น = 1 การกระทำ · บอกว่า "กดอะไร" แล้ว "จะเห็นอะไร" · เลี่ยงศัพท์ระบบ
import { addDays, todayISO } from '../domain/date.js';
import { thaiIdCheckDigit } from '../domain/thaiId.js';

const today = todayISO();
/** เลขบัตรตัวอย่างที่ผ่านการตรวจหลักสุดท้าย */
const sampleId = (() => {
  const first12 = '110170023999';
  return first12 + thaiIdCheckDigit(first12);
})();
export const SAMPLE_EMP_CODE = 'HL9001';

/** ขั้นปิดท้ายของทุกเรื่องที่ฝึกในโหมดฝึก */
const practiceEnd = (what) => ({
  title: 'จบแล้ว ลองทำเองได้เลย 🎉',
  text: `ตอนนี้ยังอยู่ใน <b>โหมดฝึก</b> — ลอง${what}ด้วยตัวเองได้ ข้อมูลเป็นตัวอย่าง ไม่กระทบของจริง<br><br>ฝึกเสร็จแล้วกด <b>ออกจากโหมดฝึก</b> ที่แถบสีเหลืองด้านบน`,
});

/** @type {import('../app/tour.js').Guide[]} */
export const GUIDES = [
  // ------------------------------------------------------------------
  {
    id: 'intro',
    title: 'เริ่มต้นใช้งานระบบ',
    summary: 'ระบบนี้ทำอะไร · เมนูอยู่ตรงไหน · ดูงานที่ต้องทำวันนี้',
    icon: 'compass',
    minutes: 1,
    pages: ['dashboard'],
    steps: [
      {
        page: 'dashboard',
        href: 'index.html',
        title: 'ยินดีต้อนรับ 👋',
        text: 'ระบบนี้ช่วยดูแลสวัสดิการพนักงาน 2 เรื่อง<br>① <b>ประกันกลุ่ม</b> — แจ้งชื่อพนักงานเข้า/ออกประกันทุกเดือน<br>② <b>ชุดฟอร์ม</b> — เบิกชุดให้พนักงาน<br><br>กด <b>ถัดไป</b> เพื่อไปต่อ',
      },
      {
        page: 'dashboard',
        element: '.nav, .bottom-nav',
        title: 'เมนู',
        text: '<b>พนักงาน</b> = รายชื่อทุกคน<br><b>ประกันกลุ่ม</b> = แจ้งเข้า/ออกประกัน<br><b>ชุดฟอร์ม</b> = เบิกชุดให้พนักงาน<br><br>กดชื่อเมนูเพื่อไปหน้านั้น',
        side: 'right',
      },
      {
        page: 'dashboard',
        element: '.nav a[data-nav="insurance"], .bottom-nav a[data-nav="insurance"]',
        title: 'ตัวเลขสีแดง = งานค้าง',
        text: 'ถ้ามีตัวเลขหลังเมนู แปลว่ามีงานรอทำในหน้านั้น',
        side: 'right',
      },
      {
        page: 'dashboard',
        element: '#t-cycle',
        title: 'วันส่งแจ้งประกันครั้งถัดไป',
        text: 'บอกว่าอีกกี่วันถึงวันส่งแจ้ง และมีกี่คนที่ต้องแจ้ง',
        side: 'right',
      },
      {
        page: 'dashboard',
        element: '#sev-row',
        title: 'งานที่ต้องทำ',
        text: '<b>ด่วน</b> = เลยกำหนดแล้ว ทำก่อน · <b>ต้องทำ</b> = ภายใน 7 วัน<br>ดับเบิลคลิกที่รายการ เพื่อไปหน้าที่ต้องทำ<br><br>แนะนำให้เปิดดูทุกเช้า',
        side: 'bottom',
      },
      {
        page: 'dashboard',
        element: '#help-btn',
        title: 'ไม่แน่ใจ กดปุ่มนี้',
        text: 'เลือกเรื่องที่อยากทำ ระบบจะพาทำทีละขั้น เช่น เพิ่มพนักงาน · แจ้งประกัน · เบิกชุด',
        side: 'bottom',
        align: 'end',
      },
      practiceEnd('กดดูเมนูต่าง ๆ'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'new-employee',
    title: 'เพิ่มพนักงานใหม่',
    summary: 'กดเพิ่มแถว → กรอกข้อมูล → กดบันทึก แล้วดูสิทธิที่ระบบคำนวณให้',
    icon: 'user-plus',
    minutes: 2,
    pages: ['employees', 'dashboard'],
    need: 'employees.edit',
    steps: [
      {
        page: 'employees',
        href: 'employees.html',
        title: 'เพิ่มพนักงานใหม่ มี 3 ขั้น',
        text: '① กด <b>เพิ่มแถว</b><br>② กรอกข้อมูล<br>③ กด <b>บันทึก</b><br><br>เราจะทำให้ดูกับข้อมูลตัวอย่าง',
      },
      {
        page: 'employees',
        element: '[data-grid-act="add"]',
        title: 'ขั้นที่ 1 · กด “เพิ่มแถว”',
        text: 'จะมีแถวว่างสีเขียวขึ้นมาด้านบนสุดของตาราง',
        side: 'bottom',
        align: 'start',
      },
      {
        page: 'employees',
        before: async (h) => {
          const grid = h.get('grid');
          if (!grid || grid.newRows.length) return;
          const [group] = (await h.api.listDeptGroups()).filter((g) => g.active !== false);
          const row = grid.o.newRow();
          const start = addDays(today, -10);
          grid.stage({
            add: [
              {
                ...row,
                empCode: SAMPLE_EMP_CODE,
                title: 'นาย',
                firstName: 'สมชาย',
                lastName: 'ตัวอย่าง',
                gender: 'M',
                birthDate: '1995-05-15',
                startDate: start,
                probationPassDate: addDays(start, 119),
                nationalId: sampleId,
                phone: '0812345678',
                deptGroup: row.deptGroup ?? group?.name ?? null,
                level: row.level ?? 3,
              },
            ],
          });
        },
        element: '.xgrid tbody tr.is-new td[data-col="firstName"]',
        title: 'ขั้นที่ 2 · กรอกข้อมูล',
        text: '<b>ดับเบิลคลิก</b>ที่ช่องเพื่อพิมพ์ แล้วกด <b>Enter</b><br>หัวคอลัมน์ที่มี <b style="color:var(--danger)">*</b> ต้องกรอก ถ้าลืม ช่องจะเป็นสีแดง<br><br>(ตัวอย่างนี้เรากรอกให้แล้ว)',
        side: 'bottom',
        align: 'start',
      },
      {
        page: 'employees',
        element: '.xgrid tbody tr.is-new td[data-col="startDate"]',
        title: 'ช่องสำคัญ: วันเริ่มงาน',
        text: 'ระบบใช้วันนี้คำนวณว่าพนักงานจะได้ประกันกลุ่มและชุดฟอร์มเมื่อไร กรอกให้ถูกนะ',
        side: 'bottom',
      },
      {
        page: 'employees',
        element: '[data-grid-act="save-all"]',
        title: 'ขั้นที่ 3 · กด “บันทึก”',
        text: 'ยังไม่กดบันทึก = ข้อมูลยังไม่เข้าระบบ<br>(แถวสีเขียว/เหลือง = ยังไม่บันทึก)',
        side: 'bottom',
      },
      {
        page: 'employees',
        before: async (h) => {
          const grid = h.get('grid');
          if (grid?.newRows.length) {
            h.click('[data-grid-act="save-all"]');
            await h.until(() => !grid.newRows.length && !grid.saving, 5000);
          }
          await h.type('#filters input[name="q"]', SAMPLE_EMP_CODE);
          await h.wait('.xgrid tbody tr:first-child td[data-col="empCode"]');
        },
        element: '.xgrid tbody tr:first-child',
        title: 'บันทึกแล้ว ✓',
        text: 'สมชาย ตัวอย่าง อยู่ในระบบแล้ว<br>ช่องค้นหาด้านบนใช้หาพนักงานด้วยชื่อหรือรหัส',
        side: 'bottom',
      },
      {
        page: 'employees',
        element: '.xgrid tbody tr:first-child .row-actions',
        title: 'ดูสิทธิของพนักงาน',
        text: 'กดปุ่มนี้ท้ายแถว เพื่อดูว่าพนักงานได้สิทธิอะไรบ้าง',
        side: 'left',
      },
      {
        page: 'employee',
        href: async (h) => {
          const [e] = await h.api.listEmployees({ q: SAMPLE_EMP_CODE });
          return e ? `employee.html?id=${e.id}` : 'employees.html';
        },
        element: '[data-part="insurance"]',
        title: 'ระบบคำนวณสิทธิให้เอง',
        text: '<b>วันที่ได้รับสิทธิประกันกลุ่ม</b> = ทำงานครบ 30 วันแล้ววันถัดไป<br><b>รอบแจ้งเข้า</b> = วันที่ต้องส่งชื่อให้บริษัทประกัน<br><br>ไม่ต้องจำเอง ระบบเตือนในหน้าประกันกลุ่ม',
        side: 'right',
      },
      {
        page: 'employee',
        element: '[data-part="uniform"]',
        title: 'ชุดฟอร์มที่จะได้',
        text: 'บอกว่าได้ชุดอะไร กี่ตัว และเมื่อไร',
        side: 'left',
      },
      practiceEnd('เพิ่มพนักงานอีกสักคน'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'resign',
    title: 'บันทึกพนักงานลาออก',
    summary: 'ค้นหาชื่อ → ติ๊กเลือก → บันทึกพ้นสภาพ → กดบันทึก',
    icon: 'user-x',
    minutes: 1,
    pages: ['employees'],
    need: 'employees.edit',
    steps: [
      {
        page: 'employees',
        href: 'employees.html?status=ACTIVE',
        title: 'พนักงานลาออก มี 4 ขั้น',
        text: '① ค้นหาชื่อ<br>② ติ๊กเลือก<br>③ กด <b>บันทึกพ้นสภาพ</b> แล้วเลือกเหตุผลกับวันที่<br>④ กด <b>บันทึก</b>',
      },
      {
        page: 'employees',
        before: async (h) => {
          const [e] = await h.api.listEmployees({ status: 'ACTIVE' });
          if (e) await h.type('#filters input[name="q"]', e.empCode);
          await h.wait('.xgrid tbody tr:first-child td[data-col="empCode"]');
        },
        element: '#filters .search-box',
        title: 'ขั้นที่ 1 · ค้นหา',
        text: 'พิมพ์ <b>ชื่อ</b> หรือ <b>รหัสพนักงาน</b> ตารางจะเหลือแต่คนที่ตรง',
        side: 'bottom',
        align: 'start',
      },
      {
        page: 'employees',
        before: async (h) => {
          const box = document.querySelector('.xgrid tbody tr:first-child [data-row-check]');
          if (box && !box.checked) box.click();
          await h.wait('[data-bulk="terminate"]');
        },
        element: '.xgrid tbody tr:first-child td.stick-left',
        title: 'ขั้นที่ 2 · ติ๊กเลือก',
        text: 'ติ๊กช่องหน้าชื่อ (เลือกหลายคนพร้อมกันได้)',
        side: 'right',
      },
      {
        page: 'employees',
        element: '[data-bulk="terminate"]',
        title: 'ขั้นที่ 3 · กด “บันทึกพ้นสภาพ”',
        text: 'จะมีกล่องให้เลือก <b>เหตุผล</b> (ลาออก / ขาดงาน 3 วัน / เลิกจ้าง / กระทำผิด) และ <b>วันพ้นสภาพ</b>',
        side: 'bottom',
      },
      {
        page: 'employees',
        before: async (h) => {
          // ทำแทนกล่อง "บันทึกพ้นสภาพ" ให้ดู: ลาออก วันนี้ → แถวเหลือง (ยังไม่บันทึก)
          const grid = h.get('grid');
          const [e] = grid?.selectedEntries() ?? [];
          if (!e || e.row.status !== 'ACTIVE') return;
          grid.stage({ edits: [{ key: e.key, row: { ...e.row, status: 'INACTIVE', endReason: 'RESIGN', endDate: today, lastWorkingDate: today } }], onlyPending: false });
          await h.wait('[data-grid-act="save-all"]');
        },
        element: '[data-grid-act="save-all"]',
        title: 'ขั้นที่ 4 · กด “บันทึก”',
        text: '(ตัวอย่างนี้เราเลือก ลาออก วันนี้ ให้แล้ว) แถวเป็นสีเหลือง = ยังไม่บันทึก กดบันทึกแล้วจึงเข้าระบบ<br>ระบบจะใส่ชื่อในรายการ <b>แจ้งออก</b> ของหน้าประกันกลุ่มให้เอง',
        side: 'bottom',
      },
      {
        page: 'employees',
        title: 'เลิกจ้าง / กระทำผิด = ด่วน ⚠️',
        text: 'ถ้าเหตุผลเป็น <b>เลิกจ้าง</b> หรือ <b>กระทำผิด</b> ต้องแจ้งออกประกันทันที ไม่ต้องรอรอบ<br>ไปทำต่อที่เมนู <b>ประกันกลุ่ม</b> แท็บ <b>แจ้งออกทันที</b>',
      },
      practiceEnd('บันทึกพ้นสภาพ'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'monthly-import',
    title: 'นำเข้าพนักงานเข้า-ออกจาก Excel',
    summary: 'ดาวน์โหลดแบบฟอร์ม → กรอกใน Excel → นำเข้า → ตรวจ → บันทึก',
    icon: 'file-spreadsheet',
    minutes: 1,
    pages: ['employees'],
    need: 'employees.edit',
    steps: [
      {
        page: 'employees',
        href: 'employees.html',
        title: 'มีพนักงานเข้า-ออกหลายคน?',
        text: 'กรอกใน Excel ทีเดียว แล้วนำเข้าระบบ เร็วกว่าพิมพ์ทีละแถว',
      },
      {
        page: 'employees',
        element: '[data-template-excel]',
        title: 'ขั้นที่ 1 · ดาวน์โหลดแบบฟอร์ม',
        text: 'กดปุ่มนี้ แล้วเลือก <b>Template เปล่า</b><br>ไฟล์มี 2 ชีต: <b>เข้าใหม่</b> และ <b>ลาออก</b>',
        side: 'bottom',
      },
      {
        page: 'employees',
        title: 'ขั้นที่ 2 · กรอกใน Excel',
        text: 'ชีต <b>เข้าใหม่</b> = 1 แถวต่อ 1 คน<br>ชีต <b>ลาออก</b> = ใส่รหัสพนักงาน เหตุผล และวันที่<br><br>บันทึกไฟล์ไว้ในเครื่อง',
      },
      {
        page: 'employees',
        element: '[data-import-excel]',
        title: 'ขั้นที่ 3 · นำเข้า',
        text: 'กดปุ่มนี้แล้วเลือกไฟล์ที่กรอก ระบบจะสรุปให้ดูก่อนว่า เพิ่มกี่คน · ลาออกกี่คน · มีอะไรต้องแก้',
        side: 'bottom',
      },
      {
        page: 'employees',
        element: '[data-grid-act="save-all"], #grid .grid-toolbar',
        title: 'ขั้นที่ 4 · ตรวจแล้วกดบันทึก',
        text: 'รายชื่อจะขึ้นในตารางเป็นสีเขียว/เหลือง (ยังไม่บันทึก)<br>ช่องสีแดง = ข้อมูลไม่ครบ แก้ก่อน แล้วกด <b>บันทึก</b>',
        side: 'bottom',
      },
      practiceEnd('ดาวน์โหลดแบบฟอร์มดู'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'insurance-monthly',
    title: 'แจ้งประกันกลุ่มประจำเดือน',
    summary: 'ดูรายชื่อแจ้งเข้า/ออก → ส่งออกไฟล์ → ส่งให้บริษัทประกัน',
    icon: 'shield-plus',
    minutes: 2,
    pages: ['insurance', 'insurance-history', 'dashboard'],
    need: 'insurance.view',
    steps: [
      {
        page: 'insurance',
        href: 'insurance.html',
        title: 'ทำทุกเดือน ก่อนวันที่ 5',
        text: 'ส่งรายชื่อพนักงานที่ <b>เข้า</b> และ <b>ออก</b> ประกันกลุ่ม ให้บริษัทประกัน<br>ระบบเตรียมรายชื่อให้แล้ว เราแค่ตรวจแล้วส่งออกไฟล์',
      },
      {
        page: 'insurance',
        element: '#cycle__combo, #cycle',
        title: 'ขั้นที่ 1 · ดูรอบ',
        text: 'ระบบเลือก <b>รอบถัดไป</b> ไว้ให้แล้ว ปกติไม่ต้องเปลี่ยน',
        side: 'bottom',
        align: 'end',
      },
      {
        page: 'insurance',
        before: (h) => h.clickTab('urgent'),
        element: '.tab[data-tab="urgent"]',
        title: 'ขั้นที่ 2 · ดูแจ้งออกทันที (ถ้ามี)',
        text: 'คนที่ <b>เลิกจ้าง / กระทำผิด</b> ต้องแจ้งออกด่วน ไม่รอรอบ<br>ตัวเลขสีแดงบนแท็บ = ยังไม่ได้แจ้ง',
        side: 'bottom',
      },
      {
        page: 'insurance',
        before: (h) => h.clickTab('in'),
        element: '#sections .card:not(.hidden)',
        title: 'ขั้นที่ 3 · ตรวจรายชื่อแจ้งเข้า',
        text: 'คนที่ทำงานครบตามกำหนดแล้ว ได้สิทธิประกันกลุ่ม<br>ถ้าข้อมูลใครผิด (เช่น เลขบัตร) แก้ที่หน้า <b>พนักงาน</b> ก่อน',
        side: 'top',
      },
      {
        page: 'insurance',
        before: (h) => h.clickTab('out'),
        element: '#sections .card:not(.hidden)',
        title: 'ขั้นที่ 4 · ตรวจรายชื่อแจ้งออก',
        text: 'คนที่ลาออก / ขาดงาน — มาจากการบันทึกพ้นสภาพในหน้าพนักงาน',
        side: 'top',
      },
      {
        page: 'insurance',
        element: '#export',
        title: 'ขั้นที่ 5 · กด “ส่งออกไฟล์แจ้งประกัน”',
        text: 'ระบบทำไฟล์ Excel ตามแบบฟอร์มของบริษัทประกันให้<br>ติ๊ก <b>บันทึกว่าแจ้งรอบนี้แล้ว</b> แล้วกด <b>ดาวน์โหลด</b>',
        side: 'bottom',
        align: 'end',
      },
      {
        page: 'insurance',
        title: 'ขั้นที่ 6 · ส่งไฟล์ให้บริษัทประกัน',
        text: 'แนบไฟล์ที่ดาวน์โหลด ส่งอีเมลให้บริษัทประกันตามปกติ<br>รายชื่อที่ส่งแล้วจะไม่ขึ้นซ้ำในรอบหน้า',
      },
      {
        page: 'insurance',
        before: (h) => h.clickTab('history'),
        element: '#sections .card:not(.hidden)',
        title: 'ดูย้อนหลัง / ดาวน์โหลดซ้ำ',
        text: 'แท็บ <b>ประวัติการส่งออก</b> เก็บทุกครั้งที่ส่ง ไฟล์หายก็ดาวน์โหลดใหม่ได้',
        side: 'top',
      },
      practiceEnd('ส่งออกไฟล์'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'uniform-request',
    title: 'เบิกชุดฟอร์มให้พนักงาน',
    summary: 'ดูคนที่ต้องได้ชุด → ส่งเบิกคลัง → รอคลังจ่าย',
    icon: 'shirt',
    minutes: 2,
    pages: ['uniform', 'uniform-waiting', 'uniform-history', 'dashboard'],
    need: 'uniform.view',
    steps: [
      {
        page: 'uniform',
        href: 'uniform.html',
        title: 'เบิกชุดฟอร์ม มี 3 ขั้น',
        text: '① ดูรายชื่อคนที่ต้องได้ชุด<br>② กด <b>ส่งเบิกคลัง</b> เลือกไซซ์<br>③ รอคลังจ่ายชุด',
      },
      {
        page: 'uniform',
        before: (h) => h.clickTab('pending'),
        element: '#pending',
        title: 'ขั้นที่ 1 · แท็บ “ค้างแจก”',
        text: 'รายชื่อคนที่ถึงเวลาได้ชุดแล้ว ระบบคำนวณให้จากวันเริ่มงาน',
        side: 'top',
      },
      {
        page: 'uniform',
        element: '#pending [data-stock-request]',
        title: 'ขั้นที่ 2 · กด “ส่งเบิกคลัง”',
        text: 'เลือก <b>แบบ</b> และ <b>ไซซ์</b> (เสื้อ 2 ตัวคนละไซซ์ได้) แล้วกดส่ง<br>ใบเบิกจะไปที่ระบบคลังให้เอง',
        side: 'left',
      },
      {
        href: async (h) => {
          // ส่งเบิกตัวอย่าง 1 ใบ (ระบบคลังปลอมของโหมดฝึก) ให้เห็นในแท็บ "ส่งเบิกแล้ว"
          const [p] = await h.api.listUniformPending().catch(() => []);
          if (p) {
            const opt = await h.api.getUniformStockOptions(p.employee.id, p.entitlementKey).catch(() => null);
            const lines = opt?.items.map((it) => ({ itemCode: it.itemCode, productId: it.variants[0]?.products[2]?.productId, qty: it.qty })).filter((l) => l.productId);
            if (lines?.length) await h.api.requestUniformFromStock({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, lines }).catch(() => {});
          }
          return 'uniform.html?tab=waiting';
        },
        page: 'uniform-waiting',
        element: '#waiting',
        title: 'ขั้นที่ 3 · รอคลังจ่าย',
        text: 'ส่งเบิกแล้วชื่อย้ายมาแท็บ <b>ส่งเบิกแล้ว</b> (เราส่งตัวอย่างให้ดู 1 ใบ)<br>สถานะเปลี่ยนเองเมื่อคลังอนุมัติ → จ่ายของ → พนักงานเซ็นรับ',
        side: 'top',
      },
      {
        page: 'uniform-waiting',
        element: '#sync',
        title: 'อยากรู้สถานะล่าสุด',
        text: 'กด <b>ดึงสถานะจากคลัง</b>',
        side: 'bottom',
        align: 'end',
      },
      practiceEnd('ส่งเบิกชุด'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'settings',
    title: 'ตั้งค่าสวัสดิการ (สำหรับผู้ดูแล)',
    summary: 'ตั้งบริษัท ประเภท หน่วยงาน และเงื่อนไขประกัน/ชุดฟอร์ม ตามลำดับเลข',
    icon: 'building-2',
    minutes: 2,
    pages: ['sites', 'sites-companies', 'sites-types', 'sites-groups', 'rules', 'rules-settings', 'rules-pending'],
    need: 'sites.view',
    steps: [
      {
        page: 'sites',
        href: 'sites.html',
        title: 'ตั้งค่าครั้งแรกครั้งเดียว',
        text: 'หน้านี้ใช้ตั้งค่าพื้นฐานของระบบ ปกติทำตอนเริ่มใช้ แล้วแก้เป็นครั้งคราว',
      },
      {
        page: 'sites',
        element: '#tabs',
        title: 'ทำตามเลข 1 → 6',
        text: '<b>1 บริษัท</b> → <b>2 ประเภทพนักงาน</b> → <b>3 กลุ่ม/ฝ่าย</b> → <b>4 หน่วยงาน</b> → <b>5 ประกันกลุ่ม</b> → <b>6 ชุดฟอร์ม</b>',
        side: 'bottom',
      },
      {
        page: 'sites',
        element: '#about',
        title: 'อ่านคำอธิบายของแต่ละแท็บ',
        text: 'กล่องนี้บอกว่าแท็บนี้ใช้ทำอะไร และต้องตั้งอะไรก่อน',
        side: 'bottom',
      },
      {
        page: 'sites',
        element: '[data-org="companies"] .xgrid tbody tr:first-child td[data-col="legalName"], .xgrid tbody tr:first-child td[data-r]',
        title: 'แก้ข้อมูล = ดับเบิลคลิก',
        text: 'ดับเบิลคลิกที่ช่อง พิมพ์ แล้วกด <b>บันทึก</b> เหมือนหน้าพนักงาน',
        side: 'bottom',
      },
      {
        page: 'sites',
        element: '.xgrid tbody tr:first-child td[data-col="active"]',
        title: 'ไม่ใช้แล้ว = ปิด ไม่ใช่ลบ',
        text: 'ปิดสวิตช์ <b>ใช้งาน</b> แทนการลบ ข้อมูลเก่ายังอยู่ครบ เปิดกลับได้',
        side: 'left',
      },
      {
        page: 'rules',
        href: 'rules.html',
        element: '#add',
        title: 'เงื่อนไขสวัสดิการ',
        text: 'กำหนดว่า <b>ใครได้ประกัน/ชุดอะไร เมื่อไร</b><br>แก้แล้วเลือก <b>วันที่มีผล</b> ได้ (ตั้งล่วงหน้าได้)',
        side: 'bottom',
      },
      practiceEnd('แก้ค่าตั้งค่า'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'insurer-form',
    title: 'ใส่แบบฟอร์มของบริษัทประกัน',
    summary: 'อัปโหลดไฟล์ Excel ของบริษัทประกัน แล้วเลือกว่าบริษัทไหนส่งกับใคร',
    icon: 'file-spreadsheet',
    minutes: 1,
    pages: ['insurers', 'insurer-edit'],
    need: 'insurers.view',
    steps: [
      {
        page: 'insurers',
        href: 'insurers.html',
        title: 'ทำครั้งเดียว ตอนเริ่มใช้',
        text: 'ระบบจะเติมรายชื่อลงไฟล์ Excel ของบริษัทประกันให้เอง หน้าตาเหมือนไฟล์ที่เคยส่ง',
      },
      {
        page: 'insurers',
        element: '.ic-add, #head-actions .btn',
        title: 'ขั้นที่ 1 · เพิ่มบริษัทประกัน',
        text: 'กดแล้วอัปโหลดไฟล์ Excel ที่บริษัทประกันให้มา ระบบหาเองว่าช่องไหนใส่อะไร',
        side: 'left',
      },
      {
        page: 'insurers',
        element: '#bindings',
        title: 'ขั้นที่ 2 · บริษัทไหนส่งกับใคร',
        text: 'เลือกบริษัทประกันให้แต่ละบริษัทในเครือ และใส่เลขกรมธรรม์ แล้วกด <b>บันทึก</b>',
        side: 'top',
      },
      practiceEnd('ดูแบบฟอร์มตัวอย่าง'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'account',
    title: 'เปลี่ยนรหัสผ่าน / ขนาดตัวอักษร',
    summary: 'ตั้งรหัสผ่านใหม่ และขยายตัวหนังสือให้อ่านง่าย',
    icon: 'key-round',
    minutes: 1,
    pages: ['account', 'account-password', 'account-font'],
    practice: false,
    steps: [
      {
        page: 'account',
        href: 'account.html',
        element: '#password',
        title: 'เปลี่ยนรหัสผ่าน',
        text: 'ใส่รหัสเดิม แล้วใส่รหัสใหม่ 2 ครั้ง กด <b>บันทึก</b>',
        side: 'right',
      },
      {
        page: 'account',
        element: '#font',
        title: 'ตัวหนังสือเล็กไป?',
        text: 'เลือกขนาดตัวอักษรที่อ่านสบาย ใช้กับทุกหน้า',
        side: 'top',
      },
    ],
  },

  // ------------------------------------------------------------------
  // ผู้ดูแลระบบ — ข้อมูลจริง (ไม่มีโหมดฝึก) แค่ชี้ให้ดู
  {
    id: 'admin-users',
    title: 'จัดการผู้ใช้ระบบ',
    summary: 'เพิ่มผู้ใช้ · แก้บทบาท · ปิดบัญชี',
    icon: 'users',
    minutes: 1,
    pages: ['admin-users'],
    practice: false,
    need: 'users.manage',
    steps: [
      { page: 'admin-users', href: 'admin.html?tab=users', element: '#add-user', title: 'เพิ่มผู้ใช้', text: 'กดเพื่อสร้างบัญชีใหม่ ใส่ชื่อ ชื่อผู้ใช้ และเลือก <b>บทบาท</b>', side: 'bottom' },
      { page: 'admin-users', element: '#users tbody tr:first-child', title: 'แก้ไขผู้ใช้', text: '<b>ดับเบิลคลิก</b>ที่แถวเพื่อแก้บทบาท รีเซ็ตรหัสผ่าน หรือปิดบัญชี', side: 'bottom' },
    ],
  },
  {
    id: 'admin-system',
    title: 'ดูความปลอดภัยและสถานะระบบ',
    summary: 'บัญชีที่ถูกล็อก · ใครเข้าระบบอยู่ · ระบบทำงานปกติไหม',
    icon: 'shield-check',
    minutes: 1,
    pages: ['admin-access', 'admin-health', 'admin-settings', 'admin-audit', 'admin-permissions'],
    practice: false,
    need: 'security.view',
    steps: [
      { page: 'admin-access', href: 'admin.html?tab=access', element: '#lockouts', title: 'บัญชีที่ถูกล็อก', text: 'ใส่รหัสผิดหลายครั้งจะถูกล็อกชั่วคราว ปลดล็อกได้ที่นี่', side: 'bottom' },
      { page: 'admin-access', element: '#sessions', title: 'ใครเข้าระบบอยู่', text: 'สั่งออกจากระบบได้ ถ้าเห็นการเข้าใช้ที่ไม่รู้จัก', side: 'top' },
      { page: 'admin-health', href: 'admin.html?tab=health', element: '#checks', title: 'สถานะระบบ', text: 'สีเขียว = ปกติ · สีแดง = มีปัญหา ให้แจ้งผู้ดูแลเครื่อง', side: 'bottom' },
    ],
  },
];
