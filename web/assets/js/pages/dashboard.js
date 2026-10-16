// หน้า: ภาพรวม (index.html)
import { api } from '../app/api.js';
import { initPage } from '../app/shell.js';
import { html, raw, render } from '../shared/dom.js';
import { int, relativeDays, thaiDate, thaiDateLong } from '../shared/format.js';
import { alertBox, badge, emptyState, employeeCell, errorState, skeletonCards, statCard } from '../ui/components.js';
import { DataTable } from '../ui/table.js';

initPage('dashboard');

const COMPANY_COLOR = { HL: '#6366f1', PRO: '#0ea5e9', CNS: '#10b981', CIC: '#f59e0b', AS: '#ec4899' };
const h = new Date().getHours();
render(document.getElementById('greeting'), `${h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'} 👋`);
render(document.getElementById('stats'), skeletonCards(4));

const upcoming = new DataTable(document.getElementById('upcoming'), {
  rowKey: (r) => `${r.employee.id}-${r.benefit}`,
  pageSize: 10,
  columns: [
    { key: 'emp', header: 'พนักงาน', cell: (r) => employeeCell(r.employee, { link: true }) },
    {
      key: 'benefit',
      header: 'สิทธิ',
      mobile: 'aside',
      cell: (r) => (r.benefit === 'INSURANCE' ? badge('ประกันกลุ่ม', 'info') : badge('PVD', 'primary')),
    },
    {
      key: 'date',
      header: 'วันที่ครบ',
      align: 'right',
      cell: (r) => html`<span class="two-line"><span class="num">${thaiDate(r.date)}</span><span class="sub">${relativeDays(r.date, today)}</span></span>`,
    },
  ],
  empty: emptyState({ iconName: 'calendar-clock', title: 'ไม่มีพนักงานที่จะครบสิทธิใน 30 วัน' }),
});

let today = "";

try {
  const d = await api.getDashboard();
  today = d.today;
  render(document.getElementById('today'), `ภาพรวมสวัสดิการ ณ ${thaiDateLong(d.today)}`);

  if (d.urgentPending > 0) {
    const box = document.getElementById('urgent-alert');
    box.classList.remove('hidden');
    render(
      box,
      alertBox({
        tone: 'danger',
        title: `มีพนักงาน ${d.urgentPending} รายที่ต้องแจ้งออกจากประกันกลุ่มทันที`,
        body: 'กรณีเลิกจ้าง / กระทำผิด ต้องแจ้งบริษัทประกันโดยไม่รอรอบวันที่ 5',
        action: html`<a class="btn btn-danger btn-sm" href="insurance.html">ไปส่งแจ้ง</a>`,
      }),
    );
  }

  render(
    document.getElementById('stats'),
    html`${statCard({ label: 'พนักงานปัจจุบัน', value: int(d.activeTotal), hint: 'ทุกบริษัทในเครือ', iconName: 'users', href: 'employees.html?status=ACTIVE' })}
    ${statCard({
      label: `รอบแจ้งประกัน ${thaiDate(d.nextCycleDate)}`,
      value: html`${d.nextCycleIn}<small>เข้า</small>${d.nextCycleOut}<small>ออก</small>`,
      hint: relativeDays(d.nextCycleDate, d.today),
      iconName: 'shield-plus',
      tone: 'info',
      href: 'insurance.html',
    })}
    ${statCard({
      label: 'แจ้งออกทันทีค้าง',
      value: d.urgentPending,
      hint: d.urgentPending ? 'ต้องดำเนินการวันนี้' : 'ไม่มีรายการค้าง',
      iconName: 'shield-alert',
      tone: d.urgentPending ? 'danger' : 'success',
      href: 'insurance.html',
    })}
    ${statCard({ label: 'ชุดฟอร์มค้างแจก', value: d.uniformPending, hint: 'รายการที่ถึงกำหนดแล้ว', iconName: 'shirt', tone: 'warning', href: 'uniform.html' })}`,
  );

  const max = Math.max(1, ...d.activeByCompany.map((c) => c.count));
  render(
    document.getElementById('by-company'),
    html`<ul class="bars">
      ${d.activeByCompany.map(
        (c) => html`<li>
          <div class="bar-head"><b>${c.companyCode}</b><span class="muted num">${int(c.count)} คน</span></div>
          <div class="track"><div class="fill" style="width:${(c.count / max) * 100}%;background:${COMPANY_COLOR[c.companyCode]}"></div></div>
        </li>`,
      )}
    </ul>`,
  );

  upcoming.setRows(d.upcomingEligible);
} catch (e) {
  render(document.getElementById('stats'), raw(''));
  render(document.getElementById('urgent-alert'), errorState(e));
  document.getElementById('urgent-alert').classList.remove('hidden');
}
