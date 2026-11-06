// ===== คู่มือ "ทีละขั้น" — สอนงานทีละเรื่อง สำหรับผู้ใช้ที่ไม่คุ้นกับระบบ =====
//
// 1 คู่มือ = 1 งานที่ทำจริง (เช่น เพิ่มพนักงานใหม่ · แจ้งประกันประจำเดือน) · ข้ามหน้าได้
// เปิดจากปุ่ม ? ที่แถบด้านบน → เลือกเรื่อง · ตัวขับเคลื่อน: app/tour.js · ตั้งค่า: tour/tour.config.js
//
// คู่มือ (GUIDES):
//   id, title, summary (1 บรรทัด), icon
//   pages    : หน้า/แท็บที่แนะนำเรื่องนี้ (id เดียวกับ initPage / tour ของหน้า) — เรื่องแรกที่ตรงหน้าแสดงเป็น "แนะนำ"
//   practice : true (ค่าเริ่มต้น) = เปิดใน "โหมดฝึก" ข้อมูลตัวอย่าง ไม่กระทบข้อมูลจริง (app/practice.js)
//              false = ใช้ข้อมูลจริง แค่ชี้ให้ดู (หน้าผู้ดูแลระบบ · บัญชีของฉัน)
//   need     : (ไม่ใส่ก็ได้) สิทธิ์ที่ต้องมีถึงจะเห็นเรื่องนี้ — capability เดียวกับ can()
//   steps    : ขั้น
//     page    : หน้าที่ขั้นนี้อยู่ (id หน้า) · href : ไปหน้านี้ก่อน (string หรือ async (h) => string)
//     before  : async (h) => {} ทำก่อนชี้ เช่น กดแท็บ ใส่ข้อมูลตัวอย่าง (h = ตัวช่วยใน app/tour.js)
//               ต้องทำซ้ำได้ — กด "ย้อนกลับ" จะทำ before ของขั้นนั้นอีกครั้ง (h.open / h.close / h.clickTab ทำซ้ำได้อยู่แล้ว)
//     key     : ชื่อขั้น (ให้ backTo อ้าง)
//     backTo / undo : ขั้นหลังจากที่ระบบบันทึก/ใส่ในตารางแทนไปแล้ว — กด "ย้อนกลับ" = undo(h) แล้วกลับไปขั้น key = backTo
//               (ย้อนไปขั้นก่อนหน้าตรง ๆ ไม่ได้ เช่น บันทึกแล้วปุ่มบันทึกหายไป)
//     element : selector ของสิ่งที่ชี้ (หลายตัวคั่นด้วย , = ตัวแรกที่มองเห็น) · ไม่ใส่/ไม่เจอ = กล่องกลางจอ
//     title, text : หัวข้อ / คำอธิบาย (ใส่ <b> <br> ได้) · side / align : ตำแหน่งกล่อง
//
// แนวการเขียน: ประโยคสั้น · 1 ขั้น = 1 การกระทำ · บอกว่า "กดอะไร" แล้ว "จะเห็นอะไร" · เลี่ยงศัพท์ระบบ
import { isPractice } from '../app/practice.js';
import { addDays, todayISO } from '../domain/date.js';
import { thaiIdCheckDigit } from '../domain/thaiId.js';
import { isHandedOut } from '../domain/uniform.js';

const today = todayISO();
/** เลขบัตรตัวอย่างที่ผ่านการตรวจหลักสุดท้าย */
const sampleId = (() => {
  const first12 = '110170023999';
  return first12 + thaiIdCheckDigit(first12);
})();
export const SAMPLE_EMP_CODE = 'HL9001';
/** รหัสพนักงานตัวอย่างของรอบนี้ — ฝึกซ้ำ (HL9001 มีแล้ว) = ใช้เลขถัดไป ไม่งั้นบันทึกไม่ผ่านเพราะรหัสซ้ำ */
let sampleCode = SAMPLE_EMP_CODE;
async function freeSampleCode(api) {
  const used = new Set((await api.listEmployees({ q: 'HL9' }).catch(() => [])).map((e) => e.empCode));
  let n = 9001;
  while (used.has(`HL${n}`)) n++;
  return `HL${n}`;
}

/** แก้ชื่อคนแรกให้ดู (ข้อมูลตัวอย่าง ยังไม่บันทึก) — แก้ค้างอยู่แล้ว = ไม่ทำซ้ำ */
async function stageSampleEdit(h) {
  const grid = h.get('grid');
  if (!grid || grid.hasPending()) return;
  const box = document.querySelector('.xgrid tbody tr:first-child [data-row-check]');
  if (box && !box.checked) box.click();
  const [e] = grid.selectedEntries();
  if (e) grid.stage({ edits: [{ key: e.key, row: { ...e.row, firstName: `${e.row.firstName}ตัวอย่าง` } }] });
  await h.wait('[data-grid-act="save-all"]');
}

/** แถวแรกของตารางประวัติการส่งออกประกัน (กดแล้วเปิดกล่องรายละเอียด) + กล่องโหลดเสร็จ */
const BATCH_ROW = '#batches tbody tr:first-child td:nth-child(2)';
const BATCH_READY = '.modal [data-batch-file]:not([disabled])';

/** ปิดกล่องที่เปิดอยู่ แล้วติ๊ก n แถวแรกของตาราง (ตารางวาดใหม่ทุกครั้งที่ติ๊ก) — ทำซ้ำได้ */
async function tickRows(h, table, n = 2) {
  if (document.querySelector('.modal-layer')) {
    h.close();
    await h.sleep(300);
  }
  for (let k = 0; k < n; k++) {
    const box = document.querySelectorAll(`${table} tbody [data-row-check]`)[k];
    if (box && !box.checked) box.click();
    await h.sleep(80);
  }
  await h.wait(`${table} [data-bulk]`);
}

/** กล่องส่งเบิกล่วงหน้าของคนแรกในชุด — เปิดอยู่แล้ว = ไม่เปิดซ้ำ · ย้อนกลับมา (ปิดกล่องแล้วการติ๊กหาย) = ติ๊กใหม่ก่อน */
async function openBulkAdvance(h) {
  if (document.querySelector('.modal .stock-line')) return;
  await tickRows(h, '#upcoming');
  await h.open('#upcoming [data-bulk="stock"]', '.modal .stock-line');
}

/** ใบเบิกตัวอย่างสำหรับสอนยกเลิก — เฉพาะโหมดฝึก (ห้ามออกใบจริงในระบบสต็อก) · มีใบรอคลังอยู่แล้ว = ไม่สร้างเพิ่ม */
async function sampleStockRequest(h) {
  if (!isPractice()) return;
  if ((await h.api.listUniformIssues()).some((i) => !isHandedOut(i))) return;
  const [p] = await h.api.listUniformPending();
  if (!p) return;
  const opt = await h.api.getUniformStockOptions(p.employee.id, p.entitlementKey);
  const lines = opt.items.map((it) => ({ itemCode: it.itemCode, productId: it.variants[0].products[1].productId, qty: it.qty }));
  await h.api.requestUniformFromStock({ employeeId: p.employee.id, entitlementKey: p.entitlementKey, lines });
  document.dispatchEvent(new Event('employee:changed')); // หน้าชุดฟอร์มโหลดรายการใหม่
  await h.wait('#waiting [data-cancel-issue]', 6000);
}

/** กฎแถวแรกในตาราง (หน้าเงื่อนไขสวัสดิการ) — ปุ่มแก้ / เลิกใช้ */
const RULE_EDIT = '#rules-table tbody tr:first-child [data-edit]';
const RULE_RETIRE = '#rules-table tbody tr:first-child [data-retire]';
/** วันที่ 1 ของเดือนหน้า = วันที่มีผลตัวอย่าง (เหมือนปุ่ม "1 เดือนหน้า") */
const nextMonth = () => {
  const [y, m] = today.split('-').map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
};
/** กฎที่แก้เป็นตัวอย่าง ("insurance:3") — ใช้หาฉบับรอมีผลของกฎนี้ตอนย้อนกลับ */
let sampleRule = '';
/** เปิดกล่องแก้กฎแถวแรก แล้วเลือก "1 เดือนหน้า" ให้ — เปิดอยู่แล้ว = ไม่เปิดซ้ำ */
async function openRuleSample(h) {
  if (!document.querySelector('.modal #f-from')) sampleRule = document.querySelector(RULE_EDIT)?.dataset.edit ?? sampleRule;
  await h.open(RULE_EDIT, '.modal #f-from');
  h.click('.modal [data-quick="month"]');
}
/** ย้อนกลับ: ยกเลิกฉบับตัวอย่างที่บันทึกไป แล้วกลับแท็บกฎ */
async function undoRuleSample(h) {
  const item = [...document.querySelectorAll('.rev-item.pending')].find((x) => x.querySelector(`[data-edit-rev^="${sampleRule}:"]`));
  item?.querySelector('[data-cancel-rev]')?.click();
  await h.sleep(300);
  h.click(`.tab[data-tab="${sampleRule.split(':')[0]}"]`);
  await h.wait(RULE_EDIT);
}
/** ย้อนกลับมาขั้นที่อยู่อีกแท็บ — อยู่แท็บนั้นแล้ว = ไม่กดซ้ำ (กดซ้ำแล้วฟอร์มวาดใหม่ ค่าที่กรอกหาย) */
async function returnToTab(h, value) {
  if (document.querySelector('.tab.active')?.dataset.tab === value) return;
  h.click(`.tab[data-tab="${value}"]`);
  await h.sleep(300);
}
/** ตั้งวันที่มีผลของค่าตั้งค่าเป็นเดือนหน้า (ตัวอย่าง) */
function setSettingsSampleDate() {
  const from = document.querySelector('#settings-from');
  if (from) from.value = nextMonth();
}

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
    color: '#6366f1',
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
    color: '#0ea5e9',
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
        key: 'add',
        before: async (h) => {
          // ย้อนกลับมา (บันทึกไปแล้ว) — ล้างช่องค้นหาให้เห็นตารางตามปกติ
          const q = document.querySelector('#filters input[name="q"]');
          if (q?.value) await h.type('#filters input[name="q"]', '');
        },
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
          sampleCode = await freeSampleCode(h.api);
          const [group] = (await h.api.listDeptGroups()).filter((g) => g.active !== false);
          const row = grid.o.newRow();
          const start = addDays(today, -10);
          grid.stage({
            add: [
              {
                ...row,
                empCode: sampleCode,
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
          await h.type('#filters input[name="q"]', sampleCode);
          await h.wait('.xgrid tbody tr:first-child td[data-col="empCode"]');
        },
        backTo: 'add', // บันทึกไปแล้ว (ปุ่มบันทึกหายแล้ว) — ย้อนกลับ = เริ่มเพิ่มแถวใหม่อีกรอบ
        element: '.xgrid tbody tr:first-child td[data-col="firstName"]',
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
          const [e] = await h.api.listEmployees({ q: sampleCode });
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
    id: 'employee-edit',
    title: 'ค้นหาและแก้ข้อมูลพนักงาน',
    summary: 'ค้นหา → กรอง → แก้ในตาราง → บันทึก → ส่งออก Excel',
    icon: 'pencil',
    color: '#2563eb',
    pages: ['employees', 'employee'],
    need: 'employees.edit',
    steps: [
      {
        page: 'employees',
        href: 'employees.html',
        title: 'หาคน แก้ข้อมูล แล้วบันทึก',
        text: 'เรื่องนี้สอน: ค้นหา · กรองรายชื่อ · แก้ข้อมูลในตาราง · ส่งออก Excel',
      },
      {
        page: 'employees',
        element: '#filters .search-box',
        title: 'ค้นหา',
        text: 'พิมพ์<b>รหัส</b> หรือ<b>ชื่อ-สกุล</b> รายชื่อจะกรองให้ทันที',
        side: 'bottom',
      },
      {
        page: 'employees',
        element: '#quick-tags',
        title: 'กรองเร็ว',
        text: 'กดป้ายเพื่อดูเฉพาะกลุ่มนั้น กดซ้ำเพื่อเอาออก',
        side: 'bottom',
      },
      {
        page: 'employees',
        element: '.xgrid thead th[data-col="companyCode"] [data-col-filter], .xgrid thead [data-col-filter]',
        title: 'กรองตามคอลัมน์',
        text: 'กดรูปกรวยที่หัวคอลัมน์ แล้วติ๊กค่าที่ต้องการดู',
        side: 'bottom',
      },
      {
        key: 'cell',
        page: 'employees',
        before: (h) => h.get('grid')?.discardAll(),
        element: '.xgrid tbody tr:first-child td[data-col="firstName"]',
        title: 'แก้ข้อมูล = ดับเบิลคลิก',
        text: '<b>ดับเบิลคลิก</b>ที่ช่อง พิมพ์ค่าใหม่ แล้วกด <b>Enter</b>',
        side: 'bottom',
      },
      {
        page: 'employees',
        before: stageSampleEdit,
        element: '.xgrid tbody tr:first-child td[data-col="firstName"]',
        title: 'แถวสีเหลือง = ยังไม่บันทึก',
        text: 'ตัวอย่างนี้เราแก้ชื่อให้แล้ว สีเหลืองแปลว่าแก้แล้วแต่ยังไม่บันทึก',
        side: 'bottom',
      },
      {
        page: 'employees',
        before: stageSampleEdit, // ย้อนกลับมาจากขั้นส่งออก (ล้างตัวอย่างไปแล้ว)
        element: '[data-grid-act="save-all"]',
        title: 'กด “บันทึก”',
        text: 'แก้ครบแล้วกดปุ่มนี้ทีเดียว · แก้ผิดกด <b>ยกเลิกทั้งหมด</b> ข้าง ๆ ได้',
        side: 'bottom',
        align: 'end',
      },
      {
        page: 'employees',
        before: async (h) => {
          h.get('grid')?.discardAll();
          await h.wait('#grid [data-export-excel]');
        },
        element: '#grid [data-export-excel]',
        title: 'ส่งออก Excel',
        text: 'ได้ไฟล์ตามรายชื่อที่กรองอยู่ · ต้องการบางคน ติ๊กแถวแล้วกด <b>Excel ที่เลือก</b>',
        side: 'bottom',
        align: 'end',
      },
      practiceEnd('ค้นหาและแก้ข้อมูล'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'resign',
    title: 'บันทึกพนักงานลาออก',
    summary: 'ค้นหาชื่อ → ติ๊กเลือก → บันทึกพ้นสภาพ → กดบันทึก',
    icon: 'user-x',
    color: '#f43f5e',
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
        before: async (h) => {
          // ปิดกล่อง (ย้อนกลับมา) — ปิดแล้วตารางล้างการเลือก → ติ๊กแถวกลับให้ แถบปุ่มจะขึ้นอีกครั้ง
          if (document.querySelector('.modal-layer')) {
            h.close();
            await h.sleep(300);
          }
          const box = document.querySelector('.xgrid tbody tr:first-child [data-row-check]');
          if (box && !box.checked) box.click();
          await h.wait('[data-bulk="terminate"]');
        },
        element: '[data-bulk="terminate"]',
        title: 'ขั้นที่ 3 · กด “บันทึกพ้นสภาพ”',
        text: 'จะมีกล่องให้เลือกเหตุผลและวันที่',
        side: 'bottom',
      },
      // ---- ในกล่อง "บันทึกพ้นสภาพ" (pages/employees.js bulkTerminate) ----
      {
        page: 'employees',
        before: (h) => h.open('[data-bulk="terminate"]', '#bt-reason'),
        element: '#bt-reason',
        title: 'เลือกเหตุผล',
        text: '<b>ลาออก</b> · <b>ขาดงาน 3 วันติด</b> · <b>เลิกจ้าง</b> · <b>กระทำผิด</b><br>เลิกจ้าง / กระทำผิด = ต้องแจ้งออกประกันทันที',
        side: 'bottom',
      },
      {
        page: 'employees',
        before: (h) => h.open('[data-bulk="terminate"]', '#bt-end'),
        element: '#bt-end',
        title: 'วันพ้นสภาพ',
        text: 'วันที่ออกจากบริษัท (ระบบใส่วันนี้ไว้ให้ เปลี่ยนได้)',
        side: 'bottom',
      },
      {
        page: 'employees',
        before: (h) => h.open('[data-bulk="terminate"]', '#bt-last'),
        element: '#bt-last',
        title: 'ทำงานวันสุดท้าย',
        text: 'วันสุดท้ายที่มาทำงาน — ว่างไว้ = วันเดียวกับวันพ้นสภาพ<br><b>ขาดงาน 3 วันติด</b> ต้องกรอกช่องนี้',
        side: 'bottom',
      },
      {
        page: 'employees',
        key: 'put',
        before: (h) => h.open('[data-bulk="terminate"]', '#bt-reason'),
        element: '.modal [data-ok]',
        title: 'กด “ใส่ในตาราง”',
        text: 'ยังไม่บันทึกเข้าระบบ — ใส่ในตารางเป็นแถวสีเหลืองให้ตรวจก่อน',
        side: 'top',
        align: 'end',
      },
      // ---- ช่องพ้นสภาพในตาราง ----
      {
        page: 'employees',
        before: async (h) => {
          // กด "ใส่ในตาราง" ให้ (ลาออก วันนี้) · กล่องไม่ได้เปิด = ใส่ให้ตรง ๆ
          const ok = document.querySelector('.modal [data-ok]');
          if (ok && document.querySelector('#bt-reason')) {
            ok.click();
            await h.until(() => !document.querySelector('#bt-reason'), 3000);
          } else {
            const grid = h.get('grid');
            const [e] = grid?.selectedEntries() ?? [];
            if (e?.row.status === 'ACTIVE') grid.stage({ edits: [{ key: e.key, row: { ...e.row, status: 'INACTIVE', endReason: 'RESIGN', endDate: today, lastWorkingDate: today } }], onlyPending: false });
          }
          await h.wait('[data-grid-act="save-all"]');
        },
        backTo: 'put', // ใส่ในตารางไปแล้ว — ย้อนกลับ = ยกเลิกที่ใส่ แล้วเปิดกล่องอีกครั้ง
        undo: async (h) => {
          h.get('grid')?.discardAll();
          await h.sleep(200);
          const box = document.querySelector('.xgrid tbody tr:first-child [data-row-check]');
          if (box && !box.checked) box.click();
          await h.wait('[data-bulk="terminate"]');
        },
        element: '.xgrid tbody tr:first-child td[data-col="status"]',
        title: 'แถวเปลี่ยนเป็น “พ้นสภาพ”',
        text: 'แถวสีเหลือง = แก้แล้วแต่ <b>ยังไม่บันทึก</b><br>ตรวจข้อมูลในช่องถัดไปก่อนกดบันทึก',
        side: 'bottom',
      },
      {
        page: 'employees',
        element: '.xgrid tbody tr:first-child td[data-col="endReason"]',
        title: 'เหตุผลพ้นสภาพ — แก้รายคนได้',
        text: '<b>ดับเบิลคลิก</b>ที่ช่อง แล้วเลือก ลาออก / ขาดงาน 3 วันติด / เลิกจ้าง / กระทำผิด',
        side: 'bottom',
      },
      {
        page: 'employees',
        element: '.xgrid tbody tr:first-child td[data-col="lastWorkingDate"]',
        title: 'ทำงานวันสุดท้าย',
        text: 'ระบบใช้วันนี้คำนวณวันแจ้งออกประกัน · ดับเบิลคลิกเพื่อแก้',
        side: 'bottom',
      },
      {
        page: 'employees',
        element: '.xgrid tbody tr:first-child td[data-col="endDate"]',
        title: 'วันพ้นสภาพ',
        text: 'วันที่ออกจากบริษัท · ดับเบิลคลิกเพื่อแก้',
        side: 'bottom',
      },
      {
        page: 'employees',
        element: '[data-grid-act="save-all"]',
        title: 'ขั้นที่ 4 · กด “บันทึก”',
        text: 'กดแล้วจึงเข้าระบบ — ระบบใส่ชื่อในรายการ <b>แจ้งออก</b> ของหน้าประกันกลุ่มให้เอง',
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
    color: '#10b981',
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
        before: (h) => h.close(),
        element: '[data-template-excel]',
        title: 'ขั้นที่ 1 · กด “Template / ส่งออกรายเดือน”',
        text: 'จะมีกล่องให้เลือกว่าจะดาวน์โหลดแบบไหน',
        side: 'bottom',
      },
      // ---- ในกล่อง "Template Excel พนักงาน" (pages/_employeeImport.js openTemplateDialog) ----
      {
        page: 'employees',
        before: (h) => h.open('[data-template-excel]', '.modal [data-tpl-blank]'),
        element: '.modal .tpl-opt:has([data-tpl-blank])',
        title: 'Template เปล่า — ใช้กรอกคนเข้า-ออกใหม่',
        text: 'ไฟล์มี 2 ชีต<br><b>เข้าใหม่</b> = 1 แถวต่อ 1 คน (อายุ เพศ ผ่านทดลองงาน ระบบเติมให้)<br><b>ลาออก</b> = รหัส เหตุผล วันพ้นสภาพ',
        side: 'bottom',
      },
      {
        page: 'employees',
        before: (h) => h.open('[data-template-excel]', '.modal [data-tpl-blank]'),
        element: '.modal [data-tpl-blank]',
        title: 'กด “ดาวน์โหลด”',
        text: 'ได้ไฟล์ Excel เปล่าไปกรอก — หัวคอลัมน์มีช่องเลือกและคำอธิบายให้',
        side: 'left',
      },
      {
        page: 'employees',
        before: (h) => h.open('[data-template-excel]', '.modal [data-tpl-month]'),
        element: '.modal .tpl-opt:has([data-tpl-month-export])',
        title: 'ส่งออกเข้า-ออกประจำเดือน',
        text: 'อยากได้รายชื่อคนเข้า/ออกของเดือนไหน → เลือกเดือน แล้วกด <b>ส่งออก</b><br>ใช้ส่งรายงาน หรือแก้แล้วนำเข้ากลับได้',
        side: 'bottom',
      },
      {
        page: 'employees',
        before: (h) => h.close(),
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
    id: 'job-db-import',
    title: 'ดึงพนักงานจากสัญญาจ้าง CNS / PRO',
    summary: 'กดดึงสัญญาจ้าง → ตรวจรายชื่อ → เลือกคนที่จะบันทึก',
    icon: 'download',
    color: '#0284c7',
    pages: ['employees'],
    need: 'employees.edit',
    steps: [
      {
        page: 'employees',
        href: 'employees.html',
        title: 'ไม่ต้องกรอกเองทีละคน',
        text: 'พนักงานที่เซ็นสัญญาแล้วในระบบสัญญาจ้าง ดึงเข้ามาได้เลย ระบบให้ตรวจก่อน ยังไม่บันทึกจนกว่าจะกดยืนยัน<br>(ตัวอย่างนี้เป็นรายชื่อสมมติ)',
      },
      {
        page: 'employees',
        before: (h) => h.close(),
        element: '[data-job-db="cns"]',
        title: 'CNS = พนักงานรายวัน',
        text: 'กดปุ่มนี้เพื่อดึงพนักงาน <b>CNS ประเภทรายวัน</b>',
        side: 'bottom',
      },
      {
        page: 'employees',
        before: (h) => h.close(),
        element: '[data-job-db="pro"]',
        title: 'PRO = พนักงาน Pro Site',
        text: 'กดปุ่มนี้เพื่อดึงพนักงาน <b>PRO ประเภท Pro Site</b> ขั้นตอนเหมือนกัน',
        side: 'bottom',
      },
      {
        page: 'employees',
        before: (h) => h.open('[data-job-db="pro"]', '.modal [data-pick-kind]'),
        element: '.modal [data-job-body] > p',
        title: 'ดูสรุปก่อน',
        text: 'บอกว่าพบกี่คน เพิ่มใหม่ ข้อมูลต่างกัน ตรงกันแล้ว และข้ามกี่คน',
        side: 'bottom',
      },
      {
        page: 'employees',
        before: (h) => h.open('[data-job-db="pro"]', '.modal [data-pick-kind]'),
        element: '.modal [data-all-kind="new"]',
        title: 'เพิ่มใหม่ = ติ๊กไว้ให้แล้ว',
        text: 'คนที่ยังไม่มีในระบบ ไม่ต้องการคนไหน เอาติ๊กออกได้',
        side: 'left',
      },
      {
        page: 'employees',
        before: (h) => h.open('[data-job-db="pro"]', '.modal [data-pick-kind]'),
        element: '.modal [data-pick-kind="update"]',
        title: 'ข้อมูลต่างกัน = เลือกเอง',
        text: 'ตารางบอกค่าเดิม → ค่าใหม่ ระบบไม่ติ๊กให้ ตรวจก่อนแล้วติ๊กเฉพาะคนที่จะอัปเดต',
        side: 'right',
      },
      {
        page: 'employees',
        before: (h) => h.open('[data-job-db="pro"]', '.modal [data-pick-kind]'),
        element: '.modal label:has([data-create-sites])',
        title: 'หน่วยงานที่ยังไม่มี',
        text: 'ติ๊กไว้ = ระบบสร้างหน่วยงานให้ · ถ้าเอาติ๊กออก คนของหน่วยงานนั้นจะบันทึกไม่ได้',
        side: 'top',
      },
      {
        page: 'employees',
        before: (h) => h.open('[data-job-db="pro"]', '.modal [data-pick-kind]'),
        element: '.modal [data-ok]',
        title: 'กด “บันทึกที่เลือก”',
        text: 'ตัวเลขบนปุ่ม = จำนวนคนที่เลือก · ระบบอ่านข้อมูลต้นทางอีกครั้งตอนบันทึก',
        side: 'top',
        align: 'end',
      },
      {
        page: 'employees',
        before: (h) => h.close(),
        title: 'ขึ้นว่าเชื่อมต่อไม่ได้?',
        text: 'แจ้งผู้ดูแลระบบให้ตรวจการเชื่อมต่อ ส่วน hr-pro ตั้งได้ที่ <b>ระบบ & ความปลอดภัย → ตั้งค่าระบบ</b>',
      },
      practiceEnd('ดึงรายชื่อ'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'insurance-monthly',
    title: 'แจ้งประกันกลุ่มประจำเดือน',
    summary: 'ดูรายชื่อแจ้งเข้า/ออก → ส่งออกไฟล์ → ส่งให้บริษัทประกัน',
    icon: 'shield-plus',
    color: '#14b8a6',
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
        title: 'ขั้นที่ 2 · แท็บ “แจ้งออกทันที”',
        text: 'ตอนนี้อยู่แท็บนี้ — คนที่ <b>เลิกจ้าง / กระทำผิด</b> ต้องแจ้งออกด่วน ไม่รอรอบ<br>ตัวเลขสีแดงบนแท็บ = ยังไม่ได้แจ้ง · รายชื่ออยู่ด้านล่าง',
        side: 'right',
      },
      {
        page: 'insurance',
        before: (h) => h.clickTab('in'),
        element: '.tab[data-tab="in"]',
        title: 'ขั้นที่ 3 · ย้ายไปแท็บ “แจ้งเข้า”',
        text: 'รายชื่อด้านล่าง = คนที่ทำงานครบตามกำหนด ได้สิทธิประกันกลุ่มแล้ว<br>ข้อมูลใครผิด (เช่น เลขบัตร) แก้ที่หน้า <b>พนักงาน</b> ก่อน',
        side: 'right',
      },
      {
        page: 'insurance',
        before: (h) => h.clickTab('out'),
        element: '.tab[data-tab="out"]',
        title: 'ขั้นที่ 4 · ย้ายไปแท็บ “แจ้งออก”',
        text: 'รายชื่อด้านล่าง = คนที่ลาออก / ขาดงาน — มาจากการบันทึกพ้นสภาพในหน้าพนักงาน',
        side: 'right',
      },
      {
        page: 'insurance',
        before: (h) => h.close(),
        element: '#export',
        title: 'ขั้นที่ 5 · กด “ส่งออกไฟล์แจ้งประกัน”',
        text: 'จะมีกล่องให้ดาวน์โหลดไฟล์ของแต่ละบริษัทประกัน',
        side: 'bottom',
        align: 'end',
      },
      // ---- ในกล่อง "ส่งออกไฟล์แจ้งประกัน" (pages/insurance.js openExport) ----
      {
        page: 'insurance',
        before: (h) => h.open('#export', '.modal .export-record'),
        element: '.modal .export-record',
        title: 'ติ๊ก “บันทึกว่าแจ้งรอบนี้แล้ว”',
        text: 'ติ๊กไว้ = คนที่ส่งแล้วจะไม่ขึ้นซ้ำในรอบหน้า<br>ไม่ติ๊ก = ดาวน์โหลดดูเฉย ๆ<br><br>ตอนส่งจริง <b>ติ๊กไว้เสมอ</b>',
        side: 'bottom',
      },
      {
        page: 'insurance',
        before: (h) => h.open('#export', '.modal .export-co'),
        element: '.modal .export-co',
        title: 'ตรวจจำนวนคนของแต่ละบริษัท',
        text: 'แต่ละบรรทัด = 1 บริษัทในเครือ: เลขกรมธรรม์ · เข้ากี่คน · ออกกี่คน<br>“ยังไม่ระบุเลขกรมธรรม์” = ไปใส่ที่เมนู <b>แบบฟอร์มประกัน</b>',
        side: 'bottom',
      },
      {
        page: 'insurance',
        before: (h) => h.open('#export', '.modal [data-export="xlsx"]'),
        element: '.modal [data-export="xlsx"]',
        title: 'กด “ดาวน์โหลดไฟล์ Excel ที่เติมแล้ว”',
        text: 'ได้ไฟล์ Excel หน้าตาเหมือนแบบฟอร์มของบริษัทประกัน มีรายชื่อเติมให้แล้ว<br>มีหลายบริษัทประกัน = กดดาวน์โหลดทีละกล่อง',
        side: 'top',
      },
      {
        page: 'insurance',
        before: (h) => h.close(),
        title: 'ขั้นที่ 6 · ส่งไฟล์ให้บริษัทประกัน',
        text: 'แนบไฟล์ที่ดาวน์โหลด ส่งอีเมลให้บริษัทประกันตามปกติ',
      },
      {
        page: 'insurance',
        before: (h) => h.clickTab('history'),
        element: '.tab[data-tab="history"]',
        title: 'ย้ายไปแท็บ “ประวัติการส่งออก”',
        text: 'เก็บทุกครั้งที่ส่ง (รายการด้านล่าง) ไฟล์หายก็ดาวน์โหลดใหม่ได้',
        side: 'left',
      },
      practiceEnd('ส่งออกไฟล์'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'insurance-history',
    title: 'ดาวน์โหลดซ้ำ / ยกเลิกไฟล์แจ้งประกัน',
    summary: 'ไฟล์หาย หรือส่งผิด → ดูประวัติ → ดาวน์โหลดใหม่หรือยกเลิก',
    icon: 'history',
    color: '#0d9488',
    pages: ['insurance-history'],
    need: 'insurance.view',
    steps: [
      {
        page: 'insurance-history',
        href: 'insurance.html?tab=history',
        title: 'ไฟล์หาย หรือส่งผิด?',
        text: 'ทุกครั้งที่ส่งออกไฟล์ ระบบเก็บไว้ที่นี่ เปิดดู ดาวน์โหลดใหม่ หรือยกเลิกได้',
      },
      {
        page: 'insurance-history',
        before: (h) => h.clickTab('history'),
        element: '.tab[data-tab="history"]',
        title: 'แท็บ “ประวัติการส่งออก”',
        text: 'ตอนนี้อยู่แท็บนี้ รายการด้านล่าง = การส่งออกแต่ละครั้ง',
        side: 'left',
      },
      {
        page: 'insurance-history',
        before: (h) => h.close(),
        element: BATCH_ROW,
        title: 'กดแถวเพื่อดูรายละเอียด',
        text: 'จะมีกล่องแสดงรายชื่อที่แจ้งในครั้งนั้น',
        side: 'bottom',
      },
      {
        page: 'insurance-history',
        before: (h) => h.open(BATCH_ROW, BATCH_READY),
        element: '.modal [data-batch-file]',
        title: 'ดาวน์โหลดไฟล์อีกครั้ง',
        text: 'กดปุ่มนี้เพื่อสร้างไฟล์แจ้งประกันชุดเดิม',
        side: 'top',
      },
      {
        page: 'insurance-history',
        before: (h) => h.open(BATCH_ROW, BATCH_READY),
        element: '.modal [data-batch-cancel]',
        title: 'ส่งผิด? กด “ยกเลิกการส่งออก”',
        text: 'รายชื่อจะกลับไปเป็น <b>ยังไม่ส่งออก</b> แล้วส่งออกใหม่ในรอบนั้นได้',
        side: 'top',
        align: 'start',
      },
      {
        page: 'insurance-history',
        before: (h) => tickRows(h, '#batches'),
        element: '#batches [data-bulk="download"]',
        title: 'หลายครั้งพร้อมกัน',
        text: 'ติ๊กหลายแถวแล้วกดปุ่มนี้ ระบบดาวน์โหลดให้ทีละไฟล์',
        side: 'bottom',
      },
      practiceEnd('ดูประวัติการส่งออก'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'uniform-request',
    title: 'เบิกชุดฟอร์มให้พนักงาน',
    summary: 'ดูคนที่ต้องได้ชุด → ส่งเบิกคลัง → รอคลังจ่าย',
    icon: 'shirt',
    color: '#f59e0b',
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
        element: '.tab[data-tab="pending"]',
        title: 'ขั้นที่ 1 · แท็บ “ค้างแจก”',
        text: 'ตอนนี้อยู่แท็บนี้ — รายชื่อด้านล่าง = คนที่ถึงเวลาได้ชุดแล้ว ระบบคำนวณให้จากวันเริ่มงาน',
        side: 'right',
      },
      {
        page: 'uniform',
        before: (h) => h.close(),
        element: '#pending [data-stock-request]',
        title: 'ขั้นที่ 2 · กด “ส่งเบิกคลัง”',
        text: 'กดที่แถวของพนักงาน จะมีกล่องให้เลือกแบบและไซซ์',
        side: 'left',
      },
      // ---- ในกล่อง "ส่งเบิกชุดฟอร์มไปคลัง" (pages/_shared.js openStockRequest) ----
      {
        page: 'uniform',
        before: async (h) => {
          // คนที่ได้หลายชิ้นที่สุด — ขั้นถัดไปสาธิตการแบ่งไซซ์ได้ (ได้ชิ้นเดียว = ไม่มีปุ่มเพิ่มไซซ์)
          // ตารางอาจวาดใหม่ (ดึงสถานะจากคลัง) ระหว่างกด = ปุ่มเก่าไม่เปิดกล่อง → ลองใหม่ได้ 3 ครั้ง
          const qty = (b) => Number(b.closest('[data-issue]')?.dataset.qty) || 0;
          for (let k = 0; k < 3 && !document.querySelector('.modal [data-stock-body]'); k++) {
            [...document.querySelectorAll('#pending [data-stock-request]')].sort((a, b) => qty(b) - qty(a))[0]?.click();
            await h.wait('.modal [data-stock-body]', 1500);
          }
          await h.wait('.modal .stock-line', 6000);
        },
        element: '.modal .stock-route',
        title: 'ใบเบิกไปที่ไหน',
        text: 'ระบบส่งใบเบิกไปที่หน่วยงานของพนักงานในระบบคลังให้เอง → หัวหน้าอนุมัติ → คลังจ่ายของ',
        side: 'bottom',
      },
      {
        page: 'uniform',
        before: (h) => h.wait('.modal .stock-line', 3000),
        element: '.modal .stock-line [data-variant], .modal .stock-line-head',
        title: 'เลือกแบบ',
        text: '<b>ผู้ชาย / ผู้หญิง</b> — ระบบเลือกตามเพศของพนักงานไว้ให้แล้ว เปลี่ยนได้ถ้าไม่ตรง',
        side: 'bottom',
      },
      {
        page: 'uniform',
        before: (h) => {
          // เลือกไซซ์ให้ทุกรายการ (แถวแรก) — ตัวอย่าง
          // กล่องวาดใหม่ทุกครั้งที่เลือก → หาช่องใหม่ทุกรอบ
          const lines = () => document.querySelectorAll('.modal .stock-line');
          for (let i = 0; i < lines().length; i++) h.choose(lines()[i].querySelector('[data-product]'), 2);
        },
        element: '.modal .stock-line [data-product]',
        title: 'เลือกไซซ์',
        text: 'กดช่องแล้วเลือกไซซ์ ตัวเลขด้านหลัง = จำนวนที่เหลือในคลัง<br>ช่องข้างกันคือ <b>จำนวน</b><br><br>(ตัวอย่างนี้เลือกให้แล้ว)',
        side: 'bottom',
      },
      {
        page: 'uniform',
        before: async (h) => {
          // แบ่งเป็น 2 ไซซ์ให้ดู: เพิ่มไซซ์ แล้วเลือกไซซ์ใหญ่ขึ้น 1 ขนาด
          const line = document.querySelector('.modal .stock-line:has([data-add-row])');
          if (!line || line.querySelectorAll('.size-row').length > 1) return;
          const at = [...document.querySelectorAll('.modal .stock-line')].indexOf(line);
          line.querySelector('[data-add-row]')?.click();
          await h.sleep(150);
          const rows = document.querySelectorAll('.modal .stock-line')[at]?.querySelectorAll('[data-product]') ?? [];
          if (rows[1]) h.choose(rows[1], 3);
        },
        element: '.modal .stock-line:has(.size-row + .size-row), .modal .stock-line',
        title: 'ต่างไซซ์? กด “เพิ่มไซซ์”',
        text: 'ได้หลายตัวแต่คนละไซซ์ กด <b>+ เพิ่มไซซ์</b> แล้วเลือกไซซ์ของแถวใหม่ (ตัวอย่างนี้แบ่งเป็น 2 ไซซ์ให้แล้ว)<br>ป้ายมุมขวาสีเขียว เช่น <b>2 / 2 ตัว</b> = ครบตามสิทธิ์',
        side: 'bottom',
      },
      {
        page: 'uniform',
        element: '.modal [data-ok]',
        title: 'กด “ส่งเบิกคลัง”',
        text: 'ปุ่มกดได้เมื่อเลือกไซซ์ครบทุกรายการ',
        side: 'top',
        align: 'end',
      },
      {
        href: async (h) => {
          // กดส่งในกล่องให้ (ระบบคลังปลอมของโหมดฝึก) แล้วไปดูที่แท็บ "ส่งเบิกแล้ว"
          const ok = document.querySelector('.modal [data-ok]');
          if (ok && !ok.disabled) {
            ok.click();
            await h.until(() => !document.querySelector('.modal [data-stock-body]'), 6000);
          }
          return 'uniform.html?tab=waiting';
        },
        page: 'uniform-waiting',
        element: '.tab[data-tab="waiting"]',
        title: 'ขั้นที่ 3 · ย้ายมาแท็บ “ส่งเบิกแล้ว”',
        text: 'ส่งแล้ว ชื่อย้ายมาอยู่แท็บนี้ (รายการด้านล่าง) รอคลังจ่าย<br>สถานะเปลี่ยนเองเมื่อ หัวหน้าอนุมัติ → คลังจ่ายของ → พนักงานเซ็นรับ',
        side: 'right',
      },
      {
        page: 'uniform-waiting',
        before: async (h) => {
          h.click('.tab[data-tab="waiting"]'); // ย้อนกลับมาจากแท็บค้างแจก
          await h.sleep(300);
        },
        element: '#sync',
        title: 'อยากรู้สถานะล่าสุด',
        text: 'กด <b>ดึงสถานะจากคลัง</b>',
        side: 'bottom',
        align: 'end',
      },
      {
        page: 'uniform-waiting',
        before: (h) => h.clickTab('pending'),
        element: '.tab[data-tab="pending"]',
        title: 'มีหลายคน? กลับมาแท็บ “ค้างแจก”',
        text: 'ส่งเบิกต่อกันทีละหลายคนได้ที่แท็บนี้',
        side: 'right',
      },
      {
        page: 'uniform-waiting',
        before: (h) => tickRows(h, '#pending'),
        element: '#pending [data-bulk="stock"]',
        title: 'ติ๊กหลายคน แล้วกดปุ่มนี้',
        text: 'กด <b>ส่งเบิกคลังทีละคน</b> ระบบเปิดกล่องของแต่ละคนต่อกัน (ตัวอย่างนี้เราติ๊กให้ 2 คน)<br>กด <b>ยกเลิก</b> = หยุด คนที่ส่งแล้วไม่ถูกยกเลิก',
        side: 'bottom',
      },
      practiceEnd('ส่งเบิกชุด'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'uniform-advance',
    title: 'ส่งเบิกชุดฟอร์มล่วงหน้า',
    summary: 'ยังไม่ถึงกำหนดแต่อยากเบิกก่อน — เลือกคนเดียวหรือหลายคนต่อกัน',
    icon: 'calendar-clock',
    color: '#f97316',
    pages: ['uniform-upcoming', 'employee'],
    need: 'stock.request',
    steps: [
      {
        page: 'uniform-upcoming',
        href: 'uniform.html?tab=upcoming',
        title: 'เบิกก่อนถึงกำหนด',
        text: 'รอบที่ยังไม่ถึงกำหนดส่งเบิกล่วงหน้าได้ พอถึงกำหนด ใบเดิมจะตามไปด้วย ไม่ขึ้นค้างแจกซ้ำ',
      },
      {
        page: 'uniform-upcoming',
        before: (h) => h.clickTab('upcoming'),
        element: '.tab[data-tab="upcoming"]',
        title: 'แท็บ “ล่วงหน้า”',
        text: 'รายการด้านล่าง = รอบถัดไปของแต่ละคน เรียงจากใกล้กำหนดที่สุด',
        side: 'right',
      },
      {
        page: 'uniform-upcoming',
        before: async (h) => {
          if (document.querySelector('.modal-layer')) {
            h.close();
            await h.sleep(300);
          }
        },
        element: '#upcoming [data-stock-request]',
        title: 'เบิกคนเดียว',
        text: 'กดปุ่มที่แถวนั้น แล้วเลือกแบบและไซซ์เหมือนส่งเบิกปกติ<br>ในหน้ารายละเอียดพนักงานก็มีปุ่มนี้',
        side: 'left',
      },
      {
        page: 'uniform-upcoming',
        before: (h) => tickRows(h, '#upcoming'),
        element: '#upcoming tbody tr:first-child td.rownum',
        title: 'เบิกหลายคน · ติ๊กเลือก',
        text: 'ติ๊กช่องหน้าชื่อทุกคนที่จะเบิก (ตัวอย่างนี้เราติ๊กให้ 2 คน)<br>ใช้ตัวกรองที่หัวคอลัมน์ช่วยเลือกรอบได้',
        side: 'right',
      },
      {
        page: 'uniform-upcoming',
        before: (h) => tickRows(h, '#upcoming'),
        element: '#upcoming [data-bulk="stock"]',
        title: 'กด “ส่งเบิกล่วงหน้าทีละคน”',
        text: 'ระบบเปิดกล่องของแต่ละคนต่อกัน เพราะไซซ์ของแต่ละคนไม่เหมือนกัน',
        side: 'bottom',
      },
      {
        page: 'uniform-upcoming',
        before: openBulkAdvance,
        element: '.modal .modal-head',
        title: 'ดูว่าถึงคนไหนแล้ว',
        text: 'หัวกล่องบอกลำดับ เช่น <b>(1/2)</b> และชื่อพนักงานของกล่องนี้',
        side: 'bottom',
      },
      {
        page: 'uniform-upcoming',
        before: openBulkAdvance,
        element: '.modal .modal-foot',
        title: 'ส่งแล้วไปคนถัดไปเอง',
        text: 'เลือกไซซ์ครบแล้วกด <b>ส่งเบิกคลัง</b> กล่องของคนถัดไปจะเปิดเอง<br>กด <b>ยกเลิก</b> = หยุด คนที่ส่งไปแล้วไม่ถูกยกเลิก',
        side: 'top',
        align: 'end',
      },
      {
        page: 'uniform-upcoming',
        before: (h) => h.close(),
        title: 'ส่งแล้วไปอยู่ที่ไหน',
        text: 'คนที่ส่งแล้วย้ายไปแท็บ <b>ส่งเบิกแล้ว</b> รอคลังจ่าย เหมือนการส่งเบิกปกติ',
      },
      practiceEnd('ส่งเบิกล่วงหน้า'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'uniform-cancel',
    title: 'ยกเลิกใบเบิกชุดฟอร์ม',
    summary: 'ส่งเบิกผิด หรือบันทึกการแจกผิด — ยกเลิกแล้วกลับไปเป็นค้างแจก',
    icon: 'undo-2',
    color: '#ef4444',
    pages: ['uniform-waiting', 'uniform-history'],
    need: 'uniform.issue',
    steps: [
      {
        page: 'uniform-waiting',
        href: 'uniform.html?tab=waiting',
        before: sampleStockRequest,
        title: 'ส่งเบิกผิด ยกเลิกได้',
        text: 'เราส่งเบิกตัวอย่างไว้ให้ 1 ใบแล้ว ลองดูวิธียกเลิกกัน',
      },
      {
        page: 'uniform-waiting',
        before: (h) => h.close(),
        element: '#waiting [data-cancel-issue]',
        title: 'กดปุ่มยกเลิกท้ายแถว',
        text: 'อยู่ในแท็บ <b>ส่งเบิกแล้ว</b> · ถ้าหลายใบ ติ๊กแถวแล้วกด <b>ยกเลิกการส่งเบิก</b> ด้านบน',
        side: 'left',
      },
      {
        page: 'uniform-waiting',
        before: (h) => h.open('#waiting [data-cancel-issue]', '.modal [data-ok]'),
        element: '.modal [data-ok]',
        title: 'ยืนยันการยกเลิก',
        text: 'ใบเบิกในระบบสต็อกถูกยกเลิกด้วย และรายการกลับไปเป็น <b>ค้างแจก</b>',
        side: 'top',
        align: 'end',
      },
      {
        page: 'uniform-waiting',
        before: async (h) => {
          h.close();
          h.click('.tab[data-tab="waiting"]'); // ย้อนกลับมาจากแท็บประวัติ
          await h.sleep(300);
        },
        title: 'คลังจ่ายแล้ว ยกเลิกที่นี่ไม่ได้',
        text: 'ของออกจากคลังแล้ว ระบบจะไม่ให้ยกเลิก ต้องแจ้งคลังให้จัดการในระบบสต็อก',
      },
      {
        page: 'uniform-waiting',
        before: (h) => h.clickTab('history'),
        element: '.tab[data-tab="history"]',
        title: 'ย้ายไปแท็บ “ประวัติการแจก”',
        text: 'ของที่แจกไปแล้วอยู่ที่แท็บนี้',
        side: 'right',
      },
      {
        page: 'uniform-waiting',
        element: '#history [data-cancel-issue]',
        title: 'บันทึกการแจกผิด',
        text: 'รายการที่บันทึกเองมีปุ่มนี้ท้ายแถว กดแล้วกลับไปเป็นค้างแจก · รายการที่ผ่านคลังไม่มีปุ่มนี้',
        side: 'left',
      },
      practiceEnd('ยกเลิกรายการ'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'settings',
    title: 'ตั้งค่าสวัสดิการ (สำหรับผู้ดูแล)',
    summary: 'ตั้งบริษัท ประเภท หน่วยงาน และเงื่อนไขประกัน/ชุดฟอร์ม ตามลำดับเลข',
    icon: 'building-2',
    color: '#8b5cf6',
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
        element: '.tab[data-tab="insurance"]',
        title: 'ย้ายไปแท็บ “5 ประกันกลุ่ม”',
        text: 'กลุ่ม <b>เงื่อนไขสวัสดิการ</b> (แท็บ 5 – 6) อยู่ด้านขวาของแถบแท็บ',
        side: 'bottom',
      },
      {
        page: 'rules',
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
    id: 'rules-edit',
    title: 'แก้กฎสวัสดิการแบบมีวันที่มีผล',
    summary: 'แก้กฎ → เลือกวันเริ่มใช้ → ก่อนถึงวันยังแก้หรือยกเลิกได้',
    icon: 'calendar-clock',
    color: '#7c3aed',
    pages: ['rules'],
    need: 'rules.edit',
    steps: [
      {
        page: 'rules',
        href: 'rules.html',
        title: 'แก้กฎโดยไม่กระทบวันนี้',
        text: 'เลือกได้ว่ากฎใหม่เริ่มใช้เมื่อไร ก่อนถึงวันนั้นระบบยังใช้กฎเดิม<br>ตัวอย่างนี้ใช้กฎประกันกลุ่ม กฎชุดฟอร์มทำแบบเดียวกัน',
      },
      {
        page: 'rules',
        before: (h) => h.clickTab('insurance'),
        element: '.tab[data-tab="insurance"]',
        title: 'แท็บ “ประกันกลุ่ม”',
        text: 'รายการด้านล่าง = กฎที่ใช้อยู่ตอนนี้',
        side: 'bottom',
      },
      {
        page: 'rules',
        before: (h) => h.close(),
        element: RULE_EDIT,
        title: 'ขั้นที่ 1 · กดปุ่มดินสอ',
        text: 'กดที่แถวของกฎที่จะแก้ หรือดับเบิลคลิกที่แถวก็ได้ แล้วแก้ค่าในกล่องที่เปิดขึ้น',
        side: 'left',
      },
      {
        page: 'rules',
        before: openRuleSample,
        element: '.modal .effective-bar .field',
        title: 'ขั้นที่ 2 · เลือกวันที่มีผล',
        text: '<b>วันนี้</b> = ใช้ทันที · <b>วันข้างหน้า</b> = รอถึงวันนั้น · <b>ย้อนหลัง</b> = สิทธิที่คำนวณวันนี้ใช้ฉบับนี้ทันที',
        side: 'top',
      },
      {
        page: 'rules',
        before: openRuleSample,
        element: '.modal .effective-bar .row',
        title: 'ปุ่มลัดเลือกวัน',
        text: 'กดแทนการเลือกวันเองได้ ตัวอย่างนี้เรากด <b>1 เดือนหน้า</b> ให้แล้ว ดูข้อความข้าง ๆ ว่าจะเริ่มใช้เมื่อไร',
        side: 'top',
      },
      {
        key: 'rule-save',
        page: 'rules',
        before: openRuleSample,
        element: '.modal [data-ok]',
        title: 'ขั้นที่ 3 · กด “บันทึก”',
        text: 'กดถัดไปแล้วเราบันทึกตัวอย่างให้ กฎเดิมยังใช้ต่อจนถึงวันมีผล',
        side: 'top',
        align: 'end',
      },
      {
        page: 'rules',
        before: async (h) => {
          // บันทึกตัวอย่างให้ (ข้อมูลโหมดฝึก) แล้วไปดูที่แท็บรอมีผล
          if (document.querySelector('.modal #f-from')) {
            h.click('.modal [data-ok]');
            await h.until(() => !document.querySelector('.modal #f-from'), 5000);
          }
          await h.clickTab('pending');
        },
        backTo: 'rule-save',
        undo: undoRuleSample,
        element: '.tab[data-tab="pending"]',
        title: 'ย้ายมาแท็บ “รอมีผล”',
        text: 'บันทึกแล้ว การเปลี่ยนแปลงที่ยังไม่ถึงวันมาอยู่แท็บนี้ ตัวเลขบนแท็บ = จำนวนที่รออยู่',
        side: 'bottom',
      },
      {
        page: 'rules',
        element: '#content .rev-item.pending',
        title: 'ก่อนถึงวัน ยังเปลี่ยนใจได้',
        text: 'กด <b>แก้</b> เพื่อเปลี่ยนค่าหรือวันที่ · กด <b>ยกเลิก</b> แล้วกฎเดิมใช้ต่อ · ถึงวันมีผลแล้วระบบเปลี่ยนให้เอง',
        side: 'bottom',
      },
      practiceEnd('แก้กฎ'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'rules-retire',
    title: 'เลิกใช้กฎสวัสดิการ',
    summary: 'กฎไม่ใช้แล้ว → เลือกวันเลิกใช้ · ประวัติเดิมยังอยู่ครบ',
    icon: 'ban',
    color: '#dc2626',
    pages: ['rules'],
    need: 'rules.edit',
    steps: [
      {
        page: 'rules',
        href: 'rules.html',
        title: 'กฎไม่ใช้แล้ว ทำอย่างไร',
        text: 'ระบบไม่ลบกฎทิ้ง แต่เลิกใช้ตั้งแต่วันที่เลือก ประวัติและการแจ้ง/แจกที่ทำไปแล้วยังอยู่ครบ',
      },
      {
        page: 'rules',
        before: (h) => h.clickTab('insurance'),
        element: '.tab[data-tab="insurance"]',
        title: 'เปิดแท็บของกฎนั้น',
        text: 'กฎประกันอยู่แท็บนี้ กฎชุดฟอร์มอยู่แท็บ <b>ชุดฟอร์ม</b> ทำแบบเดียวกัน',
        side: 'bottom',
      },
      {
        page: 'rules',
        before: (h) => h.close(),
        element: RULE_RETIRE,
        title: 'ขั้นที่ 1 · กดปุ่มเลิกใช้',
        text: 'กดปุ่มสีแดงท้ายแถวของกฎนั้น',
        side: 'left',
      },
      {
        page: 'rules',
        before: (h) => h.open(RULE_RETIRE, '.modal #r-from'),
        element: '.modal .effective-bar',
        title: 'ขั้นที่ 2 · เลือกวันที่เลิกใช้',
        text: 'ตั้งแต่วันนี้เป็นต้นไป ระบบจะไม่ใช้กฎนี้คำนวณสิทธิอีก ตั้งล่วงหน้าได้',
        side: 'top',
      },
      {
        page: 'rules',
        before: (h) => h.open(RULE_RETIRE, '.modal #r-from'),
        element: '.modal [data-ok]',
        title: 'ขั้นที่ 3 · กด “เลิกใช้กฎ”',
        text: 'ตรวจให้แน่ใจก่อนกด ตัวอย่างนี้เราจะไม่กดให้ ถ้าตั้งล่วงหน้าแล้วเปลี่ยนใจ ยกเลิกได้ที่แท็บ <b>รอมีผล</b>',
        side: 'top',
        align: 'end',
      },
      {
        page: 'rules',
        before: (h) => tickRows(h, '#rules-table'),
        element: '#rules-table [data-bulk="retire"]',
        title: 'เลิกใช้หลายกฎพร้อมกัน',
        text: 'ติ๊กหลายแถวแล้วกดปุ่มนี้ ทุกกฎจะใช้วันที่เลิกใช้เดียวกัน (ตัวอย่างนี้เราติ๊กให้ 2 แถว)',
        side: 'bottom',
      },
      {
        page: 'rules',
        before: (h) => h.close(),
        element: '#rules-table tbody tr:first-child [data-history]',
        title: 'ดูย้อนหลัง',
        text: 'ปุ่มนี้แสดงทุกฉบับของกฎ · เลิกใช้ไปแล้วดูได้ที่ปุ่ม <b>กฎที่เลิกใช้</b> เหนือตาราง',
        side: 'left',
      },
      practiceEnd('เลิกใช้กฎ'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'rules-settings',
    title: 'ค่าตั้งค่าและรายการรอมีผล',
    summary: 'เปลี่ยนค่ากลางของระบบ → ตั้งวันเริ่มใช้ → ตรวจที่แท็บรอมีผล',
    icon: 'list-checks',
    color: '#0891b2',
    pages: ['rules-settings', 'rules-pending'],
    need: 'rules.edit',
    steps: [
      {
        page: 'rules-settings',
        href: 'rules.html?tab=settings',
        title: 'ค่ากลางที่ทุกกฎใช้ร่วมกัน',
        text: 'เช่น วันส่งแจ้งประกัน และเดือนแจกชุดประจำปี เปลี่ยนแล้วมีผลทั้งระบบ จึงเลือกวันเริ่มใช้ได้',
      },
      {
        page: 'rules-settings',
        before: (h) => h.clickTab('settings'),
        element: '.tab[data-tab="settings"]',
        title: 'แท็บ “ค่าตั้งค่า”',
        text: 'ตอนนี้อยู่แท็บนี้',
        side: 'bottom',
      },
      {
        page: 'rules-settings',
        element: '#content .settings-form',
        title: 'ขั้นที่ 1 · แก้ค่า',
        text: 'ใต้แต่ละช่องบอกหน่วยและช่วงค่าที่ใส่ได้',
        side: 'bottom',
      },
      {
        page: 'rules-settings',
        before: setSettingsSampleDate,
        element: '#content .effective-bar .field',
        title: 'ขั้นที่ 2 · เลือกวันที่มีผล',
        text: 'ก่อนถึงวันนี้ระบบยังใช้ค่าเดิม ตัวอย่างนี้เราเลือกวันที่ 1 ของเดือนหน้าให้',
        side: 'top',
      },
      {
        key: 'settings-save',
        page: 'rules-settings',
        before: setSettingsSampleDate,
        element: '#save-settings',
        title: 'ขั้นที่ 3 · กด “บันทึกค่าตั้งค่า”',
        text: 'กดถัดไปแล้วเราบันทึกตัวอย่างให้',
        side: 'top',
        align: 'end',
      },
      {
        page: 'rules-settings',
        before: async (h) => {
          await returnToTab(h, 'settings');
          if (!document.querySelector('#content [data-cancel-setting]')) {
            h.click('#save-settings');
            await h.wait('#content [data-cancel-setting]', 5000);
          }
        },
        backTo: 'settings-save',
        undo: async (h) => {
          // ยกเลิกค่าตัวอย่างทีละรายการ (หน้าวาดใหม่ทุกครั้ง)
          for (let k = 0; k < 12 && document.querySelector('#content [data-cancel-setting]'); k++) {
            h.click('#content [data-cancel-setting]');
            await h.sleep(150);
          }
        },
        element: '#content .rev-item.pending',
        title: 'ค่าที่ตั้งไว้ล่วงหน้า',
        text: 'แสดงค่าที่รอมีผลใต้ฟอร์ม ระบบบันทึกทุกช่องตามวันที่นี้ เปลี่ยนใจกด <b>ยกเลิก</b> ได้',
        side: 'top',
      },
      {
        page: 'rules-settings',
        before: (h) => h.clickTab('pending'),
        element: '.tab[data-tab="pending"]',
        title: 'ย้ายไปแท็บ “รอมีผล”',
        text: 'รวมทุกการเปลี่ยนแปลงที่ยังไม่ถึงวัน ทั้งกฎประกัน กฎชุดฟอร์ม และค่าตั้งค่า',
        side: 'bottom',
      },
      {
        page: 'rules-settings',
        element: '#content .rev-item.pending',
        title: 'ตรวจก่อนถึงวันมีผล',
        text: 'เรียงจากวันที่ใกล้สุด ไม่มีรายการ = ไม่มีอะไรรอเปลี่ยน<br>กด <b>ยกเลิก</b> ได้จนถึงวันมีผล ส่วนกฎกด <b>แก้</b> ได้ด้วย',
        side: 'bottom',
      },
      practiceEnd('ตั้งค่า'),
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'insurer-form',
    title: 'ใส่แบบฟอร์มของบริษัทประกัน',
    summary: 'อัปโหลดไฟล์ Excel ของบริษัทประกัน แล้วเลือกว่าบริษัทไหนส่งกับใคร',
    icon: 'file-spreadsheet',
    color: '#06b6d4',
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
        text: 'กดปุ่มนี้ จะไปหน้าใส่ข้อมูลบริษัทประกัน',
        side: 'left',
      },
      {
        page: 'insurer-edit',
        href: 'insurers.html?id=new',
        element: '#f-name',
        title: 'ใส่ชื่อบริษัทประกัน',
        text: 'ชื่อเต็ม และ <b>ชื่อย่อ</b> (ชื่อย่อใช้แสดงในหน้าส่งออกและชื่อไฟล์)',
        side: 'bottom',
        align: 'start',
      },
      {
        page: 'insurer-edit',
        element: '#drop',
        title: 'อัปโหลดไฟล์ Excel ของบริษัทประกัน',
        text: 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์ — ใช้ไฟล์ที่เคยส่งจริงได้เลย<br>ระบบหาเองว่าช่องไหนใส่ชื่อ เลขกรมธรรม์ เดือน<br>รายชื่อเดิมในไฟล์จะถูกล้างออกก่อนเก็บ',
        side: 'right',
      },
      {
        page: 'insurer-edit',
        href: async (h) => {
          // ดูแบบฟอร์มที่อัปโหลดแล้ว (ตัวอย่าง) — เห็นตัวอย่างไฟล์ที่เติมรายชื่อ
          const [f] = await h.api.listInsurers().catch(() => []);
          return f ? `insurers.html?id=${f.id}` : 'insurers.html';
        },
        element: '#ed-right',
        title: 'ตัวอย่างไฟล์ที่จะส่งออก',
        text: 'หลังอัปโหลด ด้านขวาแสดงไฟล์ที่เติมรายชื่อตัวอย่างแล้ว<br>ตรวจว่าชื่อ วันที่ เลขกรมธรรม์ ลงช่องถูก',
        side: 'left',
      },
      {
        page: 'insurer-edit',
        element: '[data-switch="active"]',
        title: 'เปิดใช้เมื่อพร้อม',
        text: 'เปิด = บริษัทประกันนี้ขึ้นในกล่องส่งออกของหน้าประกันกลุ่ม',
        side: 'right',
      },
      {
        page: 'insurer-edit',
        element: '#save',
        title: 'กด “บันทึก”',
        text: 'แก้อะไรแล้วต้องกดบันทึก ไม่งั้นการแก้หาย',
        side: 'top',
        align: 'end',
      },
      {
        page: 'insurers',
        href: 'insurers.html',
        element: '#bindings',
        title: 'ขั้นสุดท้าย · บริษัทไหนส่งกับใคร',
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
    color: '#64748b',
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
    color: '#ec4899',
    pages: ['admin-users'],
    practice: false,
    need: 'users.manage',
    steps: [
      { page: 'admin-users', href: 'admin.html?tab=users', element: '#add-user', title: 'เพิ่มผู้ใช้', text: 'กดเพื่อสร้างบัญชีใหม่ ใส่ชื่อ ชื่อผู้ใช้ และเลือก <b>บทบาท</b>', side: 'bottom' },
      { page: 'admin-users', element: '#users tbody tr:first-child td:nth-child(2)', title: 'แก้ไขผู้ใช้', text: '<b>ดับเบิลคลิก</b>ที่แถวเพื่อแก้บทบาท รีเซ็ตรหัสผ่าน หรือปิดบัญชี', side: 'bottom' },
    ],
  },
  {
    id: 'admin-system',
    title: 'ดูความปลอดภัยและสถานะระบบ',
    summary: 'บัญชีที่ถูกล็อก · ใครเข้าระบบอยู่ · ระบบทำงานปกติไหม',
    icon: 'shield-check',
    color: '#3b82f6',
    pages: ['admin-access', 'admin-health'],
    practice: false,
    need: 'security.view',
    steps: [
      { page: 'admin-access', href: 'admin.html?tab=access', element: '#lockouts', title: 'บัญชีที่ถูกล็อก', text: 'ใส่รหัสผิดหลายครั้งจะถูกล็อกชั่วคราว ปลดล็อกได้ที่นี่', side: 'bottom' },
      { page: 'admin-access', element: '#sessions', title: 'ใครเข้าระบบอยู่', text: 'สั่งออกจากระบบได้ ถ้าเห็นการเข้าใช้ที่ไม่รู้จัก', side: 'top' },
      { page: 'admin-health', href: 'admin.html?tab=health', element: '#checks', title: 'สถานะระบบ', text: 'สีเขียว = ปกติ · สีแดง = มีปัญหา ให้แจ้งผู้ดูแลเครื่อง', side: 'bottom' },
    ],
  },
];
