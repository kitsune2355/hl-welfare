// หน้า: รายละเอียดพนักงาน (employee.html?id=) — เปิดตรง ๆ / จาก "เปิดเต็มหน้า" ใน popup
// เนื้อหาเดียวกับ popup (pages/_employeeDetail.js) · ลิงก์ employee.html?id= ในหน้าอื่นเปิดเป็น popup แทน (app/shell.js)
import { initPage } from '../app/shell.js';
import { $, getParam, render } from '../shared/dom.js';
import { renderEmployeeDetail } from './_employeeDetail.js';

initPage('employees', { tour: 'employee' });

renderEmployeeDetail($('#detail'), Number(getParam('id')), {
  onLoaded: (e) => {
    const name = `${e.firstName} ${e.lastName}`;
    document.title = `${name} · HL Welfare`;
    render($('#crumb'), name);
  },
});
