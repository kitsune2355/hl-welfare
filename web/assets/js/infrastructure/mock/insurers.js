// แบบฟอร์มตั้งต้นของบริษัทประกัน 2 ราย — จำลองโครงสร้างจากไฟล์ที่ HR ใช้จริง
//   ไทยประกันชีวิต   ← "1. แจ้งเข้า-ออก 5-2-2569.xls"     (ตารางเดียว 20 คอลัมน์ · เครื่องหมาย P)
//   เมืองไทยประกันชีวิต ← "1 PMAV-แจ้งเข้า ยกเลิก ก.พ. 68.xlsx" (หัวตาราง 2 ชั้น: เข้าใหม่ / ยกเลิก / เปลี่ยนแปลง)
// ข้อมูลผู้แจ้ง (ชื่อ/โทร) เว้นว่างไว้ให้ HR กรอกในหน้า "แบบฟอร์มประกัน"
const SUMMARY_TITLE = 'สรุปข้อมูลประกันชีวิตกลุ่ม สำหรับพนักงานกลุ่มบริษัทในเครือแฮปปี้แลนด์';
const SIGNER = { name: '', department: 'สวัสดิการ สรรหา และฝึกอบรม · ฝ่ายบริหารทรัพยากรบุคคล', phone: '' };

const col = (source, header, width, extra = {}) => ({ source, header, width, group: '', only: '', ...extra });

export function defaultInsurers() {
  const MT = 'ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม';
  return [
    {
      id: 1,
      name: 'บริษัท ไทยประกันชีวิต จำกัด (มหาชน)',
      shortName: 'ไทยประกันชีวิต',
      active: true,
      companies: [
        { companyCode: 'AS', policyNo: '', holderName: 'บริษัท อาเชี่ยน คอนสตรั๊คชั่น จำกัด', plan: '1' },
        { companyCode: 'CIC', policyNo: 'จี3-7998', holderName: 'บริษัท คอน.อิน.คอน จำกัด', plan: '1' },
        { companyCode: 'CNS', policyNo: 'จี3-8002', holderName: 'บริษัท คลีนนิ่ง โซลูชั่น จำกัด', plan: '1' },
        { companyCode: 'HL', policyNo: '', holderName: 'บริษัท แฮปปี้แลนด์ จำกัด', plan: '1' },
        { companyCode: 'PRO', policyNo: 'จี3-8001', holderName: 'บริษัท โปรแอ็คทีฟ แมเนจเม้นท์ จำกัด', plan: '1' },
      ],
      dateFormat: 'DD/MM/YYYY',
      dateEra: 'CE',
      inMark: 'P',
      outMark: 'P',
      sheetName: '{companyCode}',
      fileName: 'แจ้งเข้า-ออก {insurer} {cycleDate}',
      headerLines: [
        { text: 'บริษัท ไทยประกันชีวิต จำกัด (มหาชน)', align: 'center', bold: true, size: 14 },
        { text: 'รายการแจ้งปรับปรุงข้อมูลพนักงานระหว่างปีกรมธรรม์', align: 'center', bold: true, size: 12 },
        { text: 'เลขที่กรมธรรม์ : {policyNo}        ชื่อผู้ถือกรมธรรม์ : {companyName}        ประจำเดือน {month}', align: 'left', bold: false, size: 11 },
      ],
      columns: [
        col('seq', 'ลำดับที่\n(No)', 6),
        col('empCode', 'รหัสพนักงาน\n(Emp. Code)', 11),
        col('titleFullName', 'รายชื่อผู้เอาประกัน\n(Insured Name)', 28),
        col('gender', 'เพศ\n(Sex)', 6, { only: 'IN' }),
        col('blank', 'สถานะ\nพนักงาน (E)', 8),
        col('birthDate', 'วันเดือนปีเกิด\n(Date of Birth)', 12, { only: 'IN' }),
        col('position', 'ตำแหน่ง\n(Position)', 14, { only: 'IN' }),
        col('nationalId', 'เลขที่\nบัตรประชาชน\n(ID card No.)', 16, { only: 'IN' }),
        col('blank', 'ธนาคาร\n(Bank)', 9),
        col('blank', 'เลขที่บัญชี\n(Account No.)', 12),
        col('phone', 'หมายเลข\nโทรศัพท์มือถือ\n(Telephone number)', 13, { only: 'IN' }),
        col('email', 'อีเมล์\n(E-Mail)', 16, { only: 'IN' }),
        col('plan', 'แผนประกัน\n(Plan)', 8),
        col('inMark', 'เข้าใหม่\n(New)', 8),
        col('outMark', 'ลาออก\n(Retire)', 8),
        col('blank', 'เปลี่ยนแปลง\n(Changed)', 9),
        col('blank', 'มรณกรรม\n(Death)', 8),
        col('cycleDate', 'วันที่มีผลบังคับ\n(Effective date)\nวัน / เดือน / ปี\n(DD/MM/YYYY)', 14),
        col('blank', 'ใบคำขอ\nเอาประกันภัย\n(Application Form)', 11),
        col('blank', 'หมายเหตุ\n(Remark)', 14),
      ],
      totalsLine: '',
      footerLines: [
        'หมายเหตุ : 1. วันที่มีผลบังคับของรายการลาออก หมายถึงวันที่พนักงานไม่ได้มาทำงานแล้ว',
        '2. หากเป็นการเปลี่ยนแปลงโปรดระบุรายการที่เปลี่ยนแปลงในหมายเหตุ เช่น เปลี่ยนชื่อ-สกุล / ปรับเงินเดือน / บัตรหาย / โอนย้ายบริษัท',
        '3. กรณีมีพนักงานลาออกและแจ้งล่าช้า หากมีค่ารักษาพยาบาลที่พนักงานนำไปใช้หลังวันลาออก ผู้ถือกรมธรรม์จะต้องเป็นผู้รับผิดชอบค่าใช้จ่ายที่เกิดขึ้น',
        '',
        'ผู้แจ้ง {signerName}        โทรศัพท์ติดต่อ {signerPhone}        วันที่แจ้ง {exportDate}',
      ],
      summarySheet: true,
      summaryTitle: SUMMARY_TITLE,
      includeEmptySheets: true,
      signer: { ...SIGNER },
    },
    {
      id: 2,
      name: 'บริษัท เมืองไทยประกันชีวิต จำกัด (มหาชน)',
      shortName: 'เมืองไทยประกันชีวิต',
      // ปิดไว้ก่อน: ไฟล์ล่าสุด (ก.พ. 69) ส่งไทยประกันชีวิตครบทุกบริษัท — เปิดใช้แล้วย้ายบริษัทมาที่แบบฟอร์มนี้ได้
      active: false,
      companies: [
        { companyCode: 'AS', policyNo: '', holderName: 'บริษัท อาเชี่ยน คอนสตรั๊คชั่น จำกัด', plan: '1' },
        { companyCode: 'CNS', policyNo: '', holderName: 'บริษัท คลีนนิ่ง โซลูชั่น จำกัด', plan: '1' },
        { companyCode: 'HL', policyNo: '', holderName: 'บริษัท แฮปปี้แลนด์ จำกัด', plan: '1' },
        { companyCode: 'PRO', policyNo: '', holderName: 'บริษัท โปรแอ็คทีฟ แมเนจเม้นท์ จำกัด', plan: '1' },
      ],
      dateFormat: 'D/M/YYYY',
      dateEra: 'BE',
      inMark: 'P',
      outMark: 'P',
      sheetName: '{companyCode}',
      fileName: 'PMAV-แจ้งเข้า ยกเลิก {insurer} {cycleDate}',
      headerLines: [
        { text: 'บริษัท เมืองไทยประกันชีวิต จำกัด (มหาชน)        โทรสาร 02-277-9170', align: 'center', bold: true, size: 14 },
        { text: 'แบบฟอร์มแจ้งสมาชิก เข้าใหม่ / ยกเลิก / เปลี่ยนแปลง', align: 'center', bold: true, size: 12 },
        { text: 'ประกันชีวิตกลุ่ม ประกันสุขภาพกลุ่ม และสัญญาเพิ่มเติม', align: 'center', bold: true, size: 12 },
        { text: 'วันที่แจ้ง {exportDate}', align: 'left', bold: false, size: 11 },
        { text: 'ชื่อนายจ้าง / ผู้ถือกรมธรรม์  {companyName}', align: 'left', bold: false, size: 11 },
        { text: 'เลขที่กรมธรรม์ : ชีวิตกลุ่ม  {policyNo}', align: 'left', bold: false, size: 11 },
      ],
      columns: [
        col('seq', 'ลำดับ', 7),
        col('empCode', 'รหัสพนักงาน', 12),
        col('titleFullName', 'ชื่อ - สกุล สมาชิก', 33),
        col('plan', 'แผนประกัน', 9, { group: `${MT} > เข้าใหม่` }),
        col('inEffectiveDate', 'วันที่มีผลบังคับ', 12, { group: `${MT} > เข้าใหม่` }),
        col('birthDate', 'ว/ด/ป/ เกิด', 12, { group: `${MT} > เข้าใหม่`, only: 'IN' }),
        col('salary', 'เงินเดือน', 11, { group: `${MT} > เข้าใหม่`, only: 'IN' }),
        col('nationalId', 'เลขที่บัตรประชาชน', 18, { group: `${MT} > เข้าใหม่`, only: 'IN' }),
        col('outEffectiveDate', 'วันที่มีผลบังคับ', 12, { group: `${MT} > ยกเลิก` }),
        col('blank', 'ความคุ้มครอง\nจากแผน', 9, { group: `${MT} > เปลี่ยนแปลง` }),
        col('blank', 'ความคุ้มครอง\nเป็นแผน', 9, { group: `${MT} > เปลี่ยนแปลง` }),
        col('blank', 'วันที่มีผลบังคับ', 12, { group: `${MT} > เปลี่ยนแปลง` }),
        col('blank', 'หมายเลขบัญชี', 15),
        col('blank', 'เปลี่ยนแปลงอื่นๆ (ระบุ)\nเช่น เลขที่บัญชี', 28, { group: 'หมายเหตุ' }),
      ],
      totalsLine: 'เข้าใหม่ {in} คน        เปลี่ยนแปลง 0 คน        ลาออก {out} คน        รวมทั้งหมด {total} คน',
      footerLines: [
        'ลงชื่อผู้แจ้ง  {signerName}',
        'แผนก / ฝ่าย  {signerDept}',
        'โทร  {signerPhone}',
        'วันที่  {exportDate}',
        '',
        'บันทึกโดยบริษัท เมืองไทยประกันชีวิต จำกัด (มหาชน)    (ลงนาม) ......................................    วันที่ ......................................',
      ],
      summarySheet: true,
      summaryTitle: SUMMARY_TITLE,
      includeEmptySheets: true,
      signer: { ...SIGNER },
    },
  ];
}
