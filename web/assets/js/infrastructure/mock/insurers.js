// แบบฟอร์มตั้งต้นของบริษัทประกัน 2 ราย — ไฟล์ Excel อยู่ที่ assets/templates/ (โครงเดียวกับไฟล์ที่ HR ใช้ ไม่มีข้อมูลบุคคล)
//   ไทยประกันชีวิต     ← โครงตาม "1. แจ้งเข้า-ออก 5-2-2569.xls"
//   เมืองไทยประกันชีวิต ← โครงตาม "1 PMAV-แจ้งเข้า ยกเลิก ก.พ. 68.xlsx"
// ตำแหน่ง (layout) ได้จากการอ่านไฟล์อัตโนมัติ (application/usecases/templateDetect.js) แบบเดียวกับตอน HR อัปโหลด
// HR อัปโหลดไฟล์จริงของตัวเองแทนได้ที่หน้า "แบบฟอร์มประกัน" · ข้อมูลผู้แจ้ง (ชื่อ/โทร) เว้นว่างให้ HR กรอก
const SIGNER = { name: '', department: 'สวัสดิการ สรรหา และฝึกอบรม', phone: '' };
const SYSTEM = 'ระบบ (แบบฟอร์มตั้งต้น)';

export function defaultInsurers() {
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
      inMark: '✓',
      outMark: '✓',
      fileName: 'แจ้งเข้า-ออก {insurer} {cycleDate}',
      sheetName: '{companyCode}',
      includeEmptySheets: true,
      signer: { ...SIGNER },
      template: {
        fileName: 'แจ้งเข้า-ออก ไทยประกันชีวิต (แบบฟอร์มตั้งต้น).xlsx',
        url: 'assets/templates/thai-life.xlsx',
        uploadedAt: null,
        uploadedBy: SYSTEM,
        converted: false,
        ...{
        sheet: 'AS',
        headerRow: 8,
        headerEnd: 10,
        dataRow: 11,
        footerRow: 12,
        columns: [
          {
            col: 1,
            header: 'ลำดับที่ (No)',
            group: '',
            source: 'seq',
            only: ''
          },
          {
            col: 2,
            header: 'รหัสพนักงาน (Emp. Code)',
            group: '',
            source: 'empCode',
            only: ''
          },
          {
            col: 3,
            header: 'รายชื่อผู้เอาประกัน (Insured Name)',
            group: '',
            source: 'titleFullName',
            only: ''
          },
          {
            col: 4,
            header: 'เพศ (Sex)',
            group: '',
            source: 'gender',
            only: 'IN'
          },
          {
            col: 5,
            header: 'สถานะ พนักงาน (E)',
            group: '',
            source: 'blank',
            only: ''
          },
          {
            col: 6,
            header: 'วันเดือนปีเกิด (Date of Birth)',
            group: '',
            source: 'birthDate',
            only: 'IN'
          },
          {
            col: 7,
            header: 'ตำแหน่ง (Position)',
            group: '',
            source: 'position',
            only: 'IN'
          },
          {
            col: 8,
            header: 'เลขที่ บัตรประชาชน (ID card No.)',
            group: '',
            source: 'nationalId',
            only: 'IN'
          },
          {
            col: 9,
            header: 'ธนาคาร (Bank)',
            group: '',
            source: 'blank',
            only: ''
          },
          {
            col: 10,
            header: 'เลขที่บัญชี (Account No.)',
            group: '',
            source: 'blank',
            only: ''
          },
          {
            col: 11,
            header: 'หมายเลข โทรศัพท์มือถือ (Telephone number)',
            group: '',
            source: 'phone',
            only: 'IN'
          },
          {
            col: 12,
            header: 'อีเมล์ (E-Mail)',
            group: '',
            source: 'email',
            only: 'IN'
          },
          {
            col: 13,
            header: 'แผนประกัน (Plan)',
            group: '',
            source: 'plan',
            only: 'IN'
          },
          {
            col: 14,
            header: 'เข้าใหม่ (New)',
            group: '',
            source: 'inMark',
            only: ''
          },
          {
            col: 15,
            header: 'ลาออก (Retire)',
            group: '',
            source: 'outMark',
            only: ''
          },
          {
            col: 16,
            header: 'เปลี่ยนแปลง (Changed)',
            group: '',
            source: 'blank',
            only: ''
          },
          {
            col: 17,
            header: 'มรณกรรม (Death)',
            group: '',
            source: 'blank',
            only: ''
          },
          {
            col: 18,
            header: 'วันที่มีผลบังคับ (Effective date) วัน / เดือน / ปี (DD/MM/YYYY)',
            group: '',
            source: 'cycleDate',
            only: ''
          },
          {
            col: 19,
            header: 'ใบคำขอ เอาประกันภัย (Application Form)',
            group: '',
            source: 'blank',
            only: ''
          },
          {
            col: 20,
            header: 'หมายเหตุ (Remark)',
            group: '',
            source: 'blank',
            only: ''
          }
        ],
        cells: {
          C6: '{policyNo}',
          H6: '{companyName}',
          T6: '{month}',
          N13: '{signerName}',
          N14: '{signerPhone}',
          N15: '{exportDate}'
        },
        summary: {
          sheet: 'สรุป',
          headerRow: 4,
          headerEnd: 4,
          dataRow: 5,
          footerRow: 6,
          columns: [
            {
              col: 1,
              header: 'ลำดับ',
              group: '',
              source: 'seq',
              only: ''
            },
            {
              col: 2,
              header: 'สังกัดบริษัท',
              group: '',
              source: 'companyName',
              only: ''
            },
            {
              col: 3,
              header: 'ตัวย่อ',
              group: '',
              source: 'companyCode',
              only: ''
            },
            {
              col: 4,
              header: 'แจ้งเข้าใหม่',
              group: '',
              source: 'in',
              only: ''
            },
            {
              col: 5,
              header: 'แจ้งออก',
              group: '',
              source: 'out',
              only: ''
            },
            {
              col: 6,
              header: 'โอนย้าย/เปลี่ยนแปลง',
              group: '',
              source: 'change',
              only: ''
            },
            {
              col: 7,
              header: 'รวม',
              group: '',
              source: 'total',
              only: ''
            }
          ],
          cells: {
            A3: 'ประจำเดือน  {month}',
            D6: '{in}',
            E6: '{out}',
            F6: '0',
            G6: '{total}'
          }
        }
      },
      },
    },
    {
      id: 2,
      name: 'บริษัท เมืองไทยประกันชีวิต จำกัด (มหาชน)',
      shortName: 'เมืองไทยประกันชีวิต',
      // ปิดไว้ก่อน: ไฟล์ล่าสุด (ก.พ. 69) ส่งไทยประกันชีวิตครบทุกบริษัท — ผูกบริษัทใหม่ได้ที่หน้า "แบบฟอร์มประกัน"
      active: false,
      companies: [],
      dateFormat: 'D/M/YYYY',
      dateEra: 'BE',
      inMark: '✓',
      outMark: '✓',
      fileName: 'PMAV-แจ้งเข้า ยกเลิก {insurer} {cycleDate}',
      sheetName: '{companyCode}',
      includeEmptySheets: true,
      signer: { ...SIGNER },
      template: {
        fileName: 'PMAV-แจ้งเข้า ยกเลิก (แบบฟอร์มตั้งต้น).xlsx',
        url: 'assets/templates/muang-thai.xlsx',
        uploadedAt: null,
        uploadedBy: SYSTEM,
        converted: false,
        ...{
        sheet: 'AS',
        headerRow: 8,
        headerEnd: 11,
        dataRow: 12,
        footerRow: 13,
        columns: [
          {
            col: 1,
            header: 'ลำดับ',
            group: '',
            source: 'seq',
            only: ''
          },
          {
            col: 2,
            header: 'รหัสพนักงาน',
            group: '',
            source: 'empCode',
            only: ''
          },
          {
            col: 3,
            header: 'ชื่อ - สกุล สมาชิก',
            group: '',
            source: 'titleFullName',
            only: ''
          },
          {
            col: 4,
            header: 'แผนประกัน',
            group: 'ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เข้าใหม่',
            source: 'plan',
            only: 'IN'
          },
          {
            col: 5,
            header: 'วันที่มีผลบังคับ',
            group: 'ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เข้าใหม่',
            source: 'inEffectiveDate',
            only: ''
          },
          {
            col: 6,
            header: 'ว/ด/ป/ เกิด',
            group: 'ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เข้าใหม่',
            source: 'birthDate',
            only: 'IN'
          },
          {
            col: 7,
            header: 'เงินเดือน',
            group: 'ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เข้าใหม่',
            source: 'salary',
            only: 'IN'
          },
          {
            col: 8,
            header: 'เลขที่บัตรประชาชน',
            group: 'ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เข้าใหม่',
            source: 'nationalId',
            only: 'IN'
          },
          {
            col: 9,
            header: 'ยกเลิก วันที่มีผลบังคับ',
            group: 'ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม',
            source: 'outEffectiveDate',
            only: ''
          },
          {
            col: 10,
            header: 'จากแผน',
            group: 'เปลี่ยนแปลง > ความคุ้มครอง',
            source: 'blank',
            only: ''
          },
          {
            col: 11,
            header: 'เป็นแผน',
            group: 'เปลี่ยนแปลง > ความคุ้มครอง',
            source: 'blank',
            only: ''
          },
          {
            col: 12,
            header: 'วันที่มีผลบังคับ',
            group: 'ประกันชีวิตกลุ่มและประกันสุขภาพกลุ่ม > เปลี่ยนแปลง',
            source: 'blank',
            only: ''
          },
          {
            col: 13,
            header: 'หมายเลขบัญชี',
            group: '',
            source: 'blank',
            only: ''
          },
          {
            col: 14,
            header: 'หมายเหตุ เปลี่ยนแปลงอื่นๆ (ระบุ) เช่น เลขที่บัญชี',
            group: '',
            source: 'blank',
            only: ''
          }
        ],
        cells: {
          B4: '{exportDate}',
          A5: 'ชื่อนายจ้าง / ผู้ถือกรรมธรรม์  {companyName}',
          A6: 'เลขที่กรมธรรม์ : ชีวิตกลุ่ม {policyNo}',
          C15: '{in}',
          F15: '0',
          I15: '{out}',
          L15: '{total}',
          C17: '{signerName}',
          C18: '{signerDept}',
          C20: '{signerPhone}',
          C21: '{exportDate}'
        },
        summary: {
          sheet: 'สรุป',
          headerRow: 4,
          headerEnd: 4,
          dataRow: 5,
          footerRow: 6,
          columns: [
            {
              col: 1,
              header: 'ลำดับ',
              group: '',
              source: 'seq',
              only: ''
            },
            {
              col: 2,
              header: 'สังกัดบริษัท',
              group: '',
              source: 'companyName',
              only: ''
            },
            {
              col: 3,
              header: 'ตัวย่อ',
              group: '',
              source: 'companyCode',
              only: ''
            },
            {
              col: 4,
              header: 'แจ้งเข้าใหม่',
              group: '',
              source: 'in',
              only: ''
            },
            {
              col: 5,
              header: 'แจ้งออก',
              group: '',
              source: 'out',
              only: ''
            },
            {
              col: 6,
              header: 'โอนย้าย/เปลี่ยนแปลง',
              group: '',
              source: 'change',
              only: ''
            },
            {
              col: 7,
              header: 'รวม',
              group: '',
              source: 'total',
              only: ''
            }
          ],
          cells: {
            A3: 'ประจำเดือน  {month}',
            D6: '{in}',
            E6: '{out}',
            F6: '0',
            G6: '{total}'
          }
        }
      },
      },
    },
  ];
}
