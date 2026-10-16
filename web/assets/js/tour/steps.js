// ===== เนื้อหา "แนะนำการใช้งาน" ของแต่ละหน้า — แก้ข้อความ/ลำดับ/เพิ่มขั้นได้ที่นี่ =====
//
// คีย์ = id ของหน้า (ตัวเดียวกับ initPage('...') ในไฟล์ pages/*.js)
//   ready : selector ที่ต้องมีในหน้าก่อนเริ่ม (รอข้อมูลโหลด) — ไม่ใส่ก็ได้
//   steps : รายการขั้น
//     element : CSS selector ของสิ่งที่จะไฮไลต์ · ไม่ใส่ = กล่องข้อความกลางจอ
//               ถ้าหา element ไม่เจอ/ถูกซ่อน (เช่น ไม่มีรายการด่วน) ขั้นนั้นจะถูกข้ามอัตโนมัติ
//     title, text : หัวข้อ / คำอธิบาย (ใส่ <b>, <kbd>, <br> ได้)
//     side  : 'top' | 'right' | 'bottom' | 'left' (ไม่ใส่ = driver.js เลือกให้)
//     align : 'start' | 'center' | 'end'
//
// แก้เนื้อหาแล้วอยากให้ผู้ใช้เห็นใหม่ → เพิ่ม version ใน tour.config.js

export const TOUR_STEPS = {
  dashboard: {
    ready: '#upcoming .table, #upcoming .empty',
    steps: [
      {
        title: 'ยินดีต้อนรับสู่ HL Welfare 👋',
        text: 'ระบบจัดการสวัสดิการพนักงานของทุกบริษัทในเครือ — ประกันกลุ่ม, กองทุนสำรองเลี้ยงชีพ และชุดฟอร์ม<br><br>ใช้เวลาประมาณ 1 นาทีพาดูส่วนสำคัญ (กด <kbd>→</kbd> เพื่อไปต่อ หรือ <kbd>Esc</kbd> เพื่อข้าม)',
      },
      { element: '.bottom-nav', title: 'เมนูด้านล่าง', text: 'แตะเพื่อไปหน้าหลัก · ตัวเลขแดง/เหลือง = <b>งานค้าง</b> · “เพิ่มเติม” = PVD, เงื่อนไข, หน่วยงาน และออกจากระบบ', side: 'top' },
      { element: '.nav', title: 'เมนูหลัก', text: 'ตัวเลขสีแดง/เหลืองหลังเมนู = <b>งานค้าง</b> เช่น แจ้งออกประกันทันที หรือชุดฟอร์มที่ยังไม่แจก', side: 'right' },
      { element: '#global-search', title: 'ค้นหาพนักงาน', text: 'พิมพ์รหัสหรือชื่อแล้วกด Enter ได้จากทุกหน้า · กด <kbd>/</kbd> เพื่อมาที่ช่องนี้ทันที', side: 'bottom' },
      { element: '#urgent-alert', title: 'แจ้งเตือนด่วน', text: 'พนักงานที่เลิกจ้าง/กระทำผิด ต้อง <b>แจ้งออกจากประกันทันที</b> ไม่รอรอบวันที่ 5', side: 'bottom' },
      { element: '#tabs', title: 'สรุป · คิวงาน · บันทึกกิจกรรม', text: '<b>คิวงาน</b> รวมทุกเรื่องที่ต้องทำ (ตัวเลขแดง = มีงานด่วน) — แนะนำให้เปิดดูทุกเช้า · <b>บันทึกกิจกรรม</b> = ใครทำอะไรเมื่อไร', side: 'bottom', align: 'start' },
      { element: '#auto', title: 'รีเฟรชอัตโนมัติ', text: 'หน้านี้อัปเดตเองทุก 60 วินาที เหมาะเปิดค้างไว้ · ปิดได้ที่สวิตช์นี้', side: 'bottom', align: 'end' },
      { element: '#stats', title: 'ตัวเลขสรุป', text: 'คลิกการ์ดเพื่อไปยังหน้าที่เกี่ยวข้อง เช่น คลิก "รอบแจ้งประกัน" เพื่อไปส่งแจ้ง', side: 'bottom' },
      { element: '#upcoming', title: 'จะครบสิทธิใน 30 วัน', text: 'พนักงานที่กำลังจะได้สิทธิประกันกลุ่มหรือ PVD — คลิกชื่อเพื่อดูรายละเอียด', side: 'left' },
      { element: '#help-btn', title: 'ดูคำแนะนำอีกครั้ง', text: 'ทุกหน้ามีคำแนะนำของตัวเอง กดปุ่มนี้เมื่อไรก็ได้', side: 'bottom', align: 'end' },
      { element: '#reset-btn', title: 'ข้อมูลจำลอง', text: 'ตอนนี้ใช้ข้อมูลทดลอง แก้ไขได้ตามสบาย · กดปุ่มนี้เพื่อคืนค่าเริ่มต้น', side: 'right', align: 'end' },
    ],
  },

  // แท็บ "คิวงาน" ของหน้าภาพรวม (index.html?tab=queue)
  'dashboard-queue': {
    ready: '#tasks .table, #tasks .empty',
    steps: [
      { element: '#sev-stats', title: 'ระดับความเร่งด่วน', text: '<b>ด่วน</b> = เลยกำหนด/ต้องทำทันที · <b>ต้องทำ</b> = ภายใน 7 วัน · <b>ติดตาม</b> = รอรอบถัดไป<br>คลิกการ์ดเพื่อกรองเฉพาะระดับนั้น', side: 'bottom' },
      { element: '#kinds', title: 'กรองตามประเภทงาน', text: 'เลือกดูเฉพาะงานแจ้งประกัน, แจกชุดฟอร์ม หรือข้อมูลที่ยังไม่ครบ', side: 'bottom' },
      { element: '#tasks .table thead', title: 'กรองที่หัวคอลัมน์', text: 'คลิกไอคอนกรวยที่หัวคอลัมน์เพื่อ <b>เรียง</b> หรือ <b>เลือกค่าที่ต้องการดู</b> แบบ Excel', side: 'bottom' },
      { element: '#tasks', title: 'คิวงาน', text: 'เรียงงานด่วนก่อน และบอกว่าเลยกำหนดมากี่วัน · ปุ่มท้ายแถวพาไปหน้าที่ใช้ทำงานนั้น', side: 'top' },
    ],
  },

  // แท็บ "บันทึกกิจกรรม" ของหน้าภาพรวม (index.html?tab=activity)
  'dashboard-activity': {
    ready: '#feed .feed, #feed .empty',
    steps: [
      { element: '#feed', title: 'บันทึกกิจกรรม', text: 'ทุกการเพิ่ม/แก้ไข/ลบ/ส่งแจ้ง ถูกบันทึกว่า <b>ใคร ทำอะไร เมื่อไร</b> — คลิกข้อความเพื่อไปหน้าพนักงาน', side: 'top' },
      { element: '#entity__combo', title: 'กรองตามประเภท', text: 'ดูเฉพาะกิจกรรมของพนักงาน, หน่วยงาน, ประกันกลุ่ม หรือชุดฟอร์ม', side: 'bottom', align: 'end' },
    ],
  },

  employees: {
    ready: '.xgrid td[data-r], .xgrid-wrap .empty',
    steps: [
      { element: '#filters', title: 'ค้นหาและกรอง', text: 'ทุกช่องเลือก <b>พิมพ์เพื่อค้นหาได้</b> · ตัวกรองถูกเก็บในลิงก์ แชร์ให้เพื่อนร่วมงานได้', side: 'bottom' },
      { element: '.xgrid thead .th-filter', title: 'กรองที่หัวคอลัมน์', text: 'คลิกไอคอนกรวย เพื่อ <b>เรียง</b>, <b>ติ๊กเลือกค่าที่ต้องการ</b> แบบ Excel AutoFilter หรือ <b>ตรึงคอลัมน์ไว้ด้านซ้าย</b> (เลื่อนตารางแล้วคอลัมน์นั้นอยู่กับที่)', side: 'bottom', align: 'start' },
      { element: '.xgrid tbody tr:first-child td[data-col="firstName"]', title: 'แก้ไขเหมือน Excel', text: '<b>ดับเบิลคลิก</b> หรือเลือกเซลล์แล้ว <b>พิมพ์ได้เลย</b><br><kbd>Enter</kbd> / <kbd>Tab</kbd> = บันทึก · <kbd>Esc</kbd> = ยกเลิก · ลูกศร = เลื่อนเซลล์', side: 'bottom' },
      { element: '.xgrid thead', title: 'ช่องที่ต้องกรอก', text: 'หัวคอลัมน์ที่มี <b style="color:var(--danger)">*</b> ต้องกรอก · ช่องสีเทาแก้ไม่ได้สำหรับพนักงานประเภทนั้น (เช่น ระดับ ของ Pro Site)', side: 'bottom' },
      { element: '.xgrid tbody tr:first-child .stick-left', title: 'สถานะการบันทึก', text: 'ระบบบันทึกอัตโนมัติทีละแถว: ⟳ กำลังบันทึก · ✓ บันทึกแล้ว · ⚠ ข้อมูลไม่ถูกต้อง (คลิกแถวเพื่อดูสาเหตุ)', side: 'right' },
      { element: '[data-grid-act="add"]', title: 'เพิ่มพนักงาน', text: 'เพิ่มแถวใหม่ด้านบน กรอกให้ครบทุกช่องที่มี * แล้วระบบจะบันทึกให้เอง', side: 'bottom', align: 'start' },
      { element: '.xgrid tbody tr:first-child .row-actions', title: 'เปิดรายละเอียด / ลบ', text: 'ดูสิทธิสวัสดิการรายคน หรือลบข้อมูลที่บันทึกผิด (ลบได้เฉพาะคนที่ยังไม่มีประวัติ)', side: 'left' },
      { element: '#grid .pager', title: 'แบ่งหน้า', text: 'เลือกจำนวนแถวต่อหน้าได้ 10 / 25 / 50 / 100', side: 'top' },
      { element: 'a[href="employee-form.html"]', title: 'ฟอร์มเต็ม', text: 'ถ้าชอบกรอกทีละช่องแบบฟอร์ม ใช้ปุ่มนี้แทนได้', side: 'bottom', align: 'end' },
    ],
  },

  employee: {
    ready: '#insurance .card',
    steps: [
      { element: '#head', title: 'ข้อมูลพนักงาน', text: 'ปุ่ม <b>แก้ไข / บันทึกพ้นสภาพ</b> อยู่ด้านขวา — ใช้เมื่อพนักงานลาออก ขาดงาน หรือถูกเลิกจ้าง', side: 'bottom' },
      { element: '#insurance', title: 'สิทธิประกันกลุ่ม', text: 'เส้นเวลาแสดง เริ่มงาน → ครบอายุงาน → รอบแจ้งเข้า → แจ้งออก · ถ้าไม่มีสิทธิจะบอกเหตุผล', side: 'right' },
      { element: '#pvd', title: 'กองทุนสำรองเลี้ยงชีพ', text: 'วันเป็นสมาชิก ยอดหัก/สมทบต่อเดือน และ % สิทธิในเงินสมทบ (vesting)', side: 'left' },
      { element: '#uniform', title: 'ชุดฟอร์ม', text: 'สิทธิแต่ละรอบ — เลือกไซซ์แล้วกด <b>บันทึกแจก</b> ได้ที่นี่ · บันทึกผิดกดย้อนกลับ ↶ ได้', side: 'top' },
      { element: '#activity', title: 'ประวัติการเปลี่ยนแปลง', text: 'ทุกการแก้ไขของพนักงานคนนี้ เรียงจากล่าสุด', side: 'top' },
    ],
  },

  'employee-form': {
    ready: '#companyCode__combo',
    steps: [
      { element: '#empCode', title: 'กรอกข้อมูล', text: 'ช่องที่มี <b style="color:var(--danger)">*</b> ต้องกรอก · ถ้ากรอกไม่ครบ ระบบจะบอกใต้ช่องนั้น', side: 'bottom' },
      { element: '#companyCode__combo', title: 'ช่องเลือกค้นหาได้', text: 'คลิกแล้ว <b>พิมพ์เพื่อค้นหา</b> · หน่วยงานจะกรองตามบริษัทที่เลือกให้อัตโนมัติ', side: 'bottom' },
      { element: '#employeeType__combo', title: 'ประเภทพนักงาน', text: 'เลือกแล้วช่องที่เกี่ยวข้องจะแสดงเอง: ส่วนกลาง → ฝ่าย + ระดับ · Pro Site → ตำแหน่ง + สัญญา', side: 'bottom' },
      { element: '#inactive', title: 'บันทึกพ้นสภาพ', text: 'เปิดสวิตช์เมื่อพนักงานลาออก/ขาดงาน/ถูกเลิกจ้าง · เลิกจ้างหรือกระทำผิดต้องไปแจ้งออกประกัน <b>ทันที</b>', side: 'left' },
      { element: '#save', title: 'บันทึก', text: 'ระบบคำนวณสิทธิประกัน / PVD / ชุดฟอร์มใหม่ให้ทันทีหลังบันทึก', side: 'top', align: 'end' },
    ],
  },

  insurance: {
    ready: '#sections .card:not(.hidden) .table, #sections .card:not(.hidden) .empty',
    steps: [
      { element: '#cycle__combo', title: 'เลือกรอบ', text: 'แจ้งบริษัทประกันทุก <b>วันที่ 5</b> ของเดือน · ดูย้อนหลังได้ 6 เดือน ล่วงหน้า 3 เดือน', side: 'bottom' },
      { element: '#tabs', title: 'แท็บตามประเภทการแจ้ง', text: 'ตัวเลขบนแท็บ = <b>จำนวนรอส่ง</b> · สีแดง = แจ้งออกทันที (เลิกจ้าง/กระทำผิด) ต้องส่งก่อน', side: 'bottom', align: 'start' },
      { element: '#sections .card:not(.hidden) [data-submit]', title: 'ส่งแจ้ง', text: 'ติ๊กเลือกรายชื่อ (หรือเลือกทั้งหมดที่หัวตาราง) แล้วกดปุ่มนี้ — ระบบจะให้ยืนยันก่อนเสมอ', side: 'left' },
      { element: '#export', title: 'ส่งออก CSV', text: 'ไฟล์เปิดด้วย Excel ได้ ภาษาไทยไม่เพี้ยน — ใช้ส่งให้บริษัทประกัน', side: 'bottom', align: 'end' },
      { element: '.tab[data-tab="history"]', title: 'ประวัติการส่ง', text: 'ส่งผิด? เข้าแท็บนี้แล้วกด <b>ยกเลิก</b> รายชื่อจะกลับไปรอส่ง (อย่าลืมแจ้งบริษัทประกันด้วย)', side: 'bottom' },
    ],
  },

  pvd: {
    ready: '#list .table, #list .empty',
    steps: [
      { element: '#vesting-alert', title: 'ค่าตัวอย่าง', text: 'ตาราง vesting ยังรอ HR ยืนยัน — ตัวเลข % อาจเปลี่ยน', side: 'bottom' },
      { element: '#stats', title: 'ยอดรวมต่อเดือน', text: 'จำนวนสมาชิก และยอดที่พนักงานหัก / บริษัทสมทบ (2% ของเงินเดือน)', side: 'bottom' },
      { element: '#tabs', title: 'แยกตามสถานะ', text: 'สมาชิก · รอครบสิทธิ (ส่วนกลางต้องครบ 120 วัน) · พ้นสภาพ', side: 'bottom' },
      { element: '#list', title: 'รายชื่อ', text: 'คลิกแถวเพื่อดูรายละเอียดของพนักงาน', side: 'top' },
      { element: '#export', title: 'ส่งออก CSV', text: 'ใช้ส่งให้ฝ่ายบัญชี / กองทุน', side: 'bottom', align: 'end' },
    ],
  },

  uniform: {
    ready: '#pending .table, #pending .empty',
    steps: [
      { element: '#tabs', title: 'ค้างแจก / ประวัติ', text: 'สลับดูรายการที่ต้องแจก หรือประวัติที่แจกไปแล้ว (ยกเลิกได้ถ้าบันทึกผิด)', side: 'bottom' },
      { element: '#pending [data-issue]', title: 'บันทึกแจก', text: 'เลือกไซซ์ (พิมพ์ค้นหาได้) แล้วกด <b>บันทึกแจก</b> — รายการจะหายจากหน้านี้', side: 'left' },
      { element: '#summary', title: 'สรุปตามแบบเสื้อ', text: 'จำนวนตัวที่ต้องแจกแยกตามแบบ — ใช้วางแผนสั่งผลิต', side: 'left' },
      { element: '#export', title: 'ส่งออกรายการค้าง', text: 'ดาวน์โหลดเป็น CSV สำหรับเตรียมของ', side: 'bottom', align: 'end' },
    ],
  },

  rules: {
    ready: '#content .card',
    steps: [
      { element: '#tabs', title: 'เงื่อนไขสวัสดิการ', text: 'กฎทั้งหมดที่ระบบใช้คำนวณสิทธิ แยกตามประเภท (ดูอย่างเดียว)', side: 'bottom' },
      { element: '.tab[data-tab="open"]', title: 'รอ HR ยืนยัน', text: 'ประเด็นที่ยังไม่ชัดเจนในเงื่อนไข — ถ้าตอบได้แล้วแจ้งทีม dev เพื่อปรับระบบ', side: 'bottom' },
    ],
  },

  sites: {
    ready: '.xgrid td[data-r]',
    steps: [
      { element: '[data-grid-act="add"]', title: 'เพิ่มหน่วยงาน', text: 'เลือกบริษัทและพิมพ์ชื่อ ระบบบันทึกให้อัตโนมัติ', side: 'bottom', align: 'start' },
      { element: '.xgrid tbody tr:first-child td[data-col="hasGroupInsurance"]', title: 'ได้รับประกันกลุ่ม', text: 'คลิกสวิตช์เพื่อเปลี่ยนและบันทึกทันที — มีผลกับ <b>แม่บ้าน CNS</b> ในหน่วยงานนั้น', side: 'bottom' },
      { element: '.xgrid tbody tr:first-child td[data-col="poloColor"]', title: 'สีโปโล', text: 'สีโปโลของ <b>Pro Site</b> ในหน่วยงานนี้ — ระบบใช้กำหนดชุดฟอร์มที่จะแจก', side: 'bottom' },
      { element: '.xgrid tbody tr:first-child [data-grid-act="delete"]', title: 'ลบหน่วยงาน', text: 'ลบได้เฉพาะหน่วยงานที่ไม่มีพนักงานอยู่', side: 'left' },
    ],
  },
};
