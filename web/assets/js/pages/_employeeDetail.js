// รายละเอียดพนักงาน — ใช้ทั้งหน้า employee.html?id= และ popup จากทุกหน้า
//
//   openEmployeeDetail(id)              popup (คลิกลิงก์ employee.html?id= ที่ไหนก็ได้ → shell เปิด popup นี้แทนเปลี่ยนหน้า)
//   renderEmployeeDetail(root, id, o)   วาดลงกล่องที่ให้มา (หน้าเต็มใช้ตัวนี้)
//
// แก้ข้อมูลชุดฟอร์มใน popup แล้ว → ส่ง event 'employee:changed' ให้หน้าที่เปิดอยู่รีเฟรชตัวเอง
import { api } from '../app/api.js';
import { refreshCounts } from '../app/shell.js';
import { typeInfo } from '../domain/catalog.js';
import { diffDays, todayISO } from '../domain/date.js';
import { ageOf } from '../domain/employee.js';
import { formatThaiId } from '../domain/thaiId.js';
import { html, on, raw, render } from '../shared/dom.js';
import { money, relativeDays, tenure, thaiDate } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import {
  CONTRACT_LABEL,
  EMPLOYEE_TYPE_LABEL,
  EMPLOYEE_TYPE_TONE,
  END_REASON_LABEL,
  GENDER_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  UNIFORM_EVENT_LABEL,
  UNIFORM_ITEM_LABEL,
} from '../shared/labels.js';
import { alertBox, avatar, badge, card, emptyState, errorState, infoList } from '../ui/components.js';
import { loader } from '../ui/loading.js';
import { confirmAction, openModal, toast } from '../ui/overlay.js';
import { DataTable } from '../ui/table.js';
import { STOCK_STAGE, activityFeed, canCancelIssue, enhanceIssueActions, issueAction, stockDocLink, syncStockQuietly, wireIssueActions } from './_shared.js';

const today = todayISO();
const part = (root, name) => root.querySelector(`[data-part="${name}"]`);

const reasons = (list) => html`<ul class="reasons">${list.map((r) => html`<li>${r}</li>`)}</ul>`;

function timeline(steps) {
  return html`<ol class="timeline">
    ${steps.map(
      (s) => html`<li class="${s.date && s.date <= today ? 'done' : ''} ${s.tone ?? ''}"><span>${s.label}</span><b class="num">${thaiDate(s.date)}</b></li>`,
    )}
  </ol>`;
}

/** วันครบอายุ 65 อยู่ไกลเกินนี้ = ยังไม่นับว่า "กำลังจะออก" (แสดงเป็นวันในไทม์ไลน์อย่างเดียว) */
const AGE_EXIT_SOON_DAYS = 60;

function insuranceCard(emp, st) {
  const ageExit = st.exitReason === 'AGE';
  const leaving = !!st.exitDate && (!ageExit || diffDays(today, st.exitCycleDate) <= AGE_EXIT_SOON_DAYS);
  let b = badge('ไม่มีสิทธิ', 'danger', { lg: true });
  if (st.eligible) {
    if (st.exitUrgent) b = badge('แจ้งออกทันที', 'danger', { lg: true });
    else if (leaving) b = badge(ageExit ? 'แจ้งออก (อายุครบ)' : 'แจ้งออก', 'warning', { lg: true });
    else if (st.eligibleDate && st.eligibleDate > today) b = badge('รอครบสิทธิ', 'info', { lg: true });
    else b = badge('มีสิทธิ', 'success', { lg: true });
  }
  const steps = [
    { label: 'เริ่มงาน', date: emp.startDate },
    { label: 'ครบอายุงาน', date: st.eligibleDate },
    { label: 'รอบแจ้งเข้า', date: st.enrollCycleDate },
  ];
  if (st.exitDate) {
    steps.push({ label: ageExit ? 'อายุครบ 65 ปี' : 'วันมีผลออก', date: st.exitDate, tone: st.exitUrgent ? 'danger' : leaving ? 'warning' : '' });
    if (!st.exitUrgent) steps.push({ label: 'รอบแจ้งออก', date: st.exitCycleDate, tone: leaving ? 'warning' : '' });
  }
  const body = st.eligible
    ? html`<div style="display:grid;gap:16px">
        ${st.enrollCycleDate && st.enrollCycleDate >= today && !leaving
          ? html`<p class="small muted">แจ้งเข้า <b style="color:var(--fg)">${thaiDate(st.enrollCycleDate)}</b> · ${relativeDays(st.enrollCycleDate, today)}</p>`
          : ''}
        ${st.exitUrgent ? alertBox({ tone: 'danger', title: 'ต้องแจ้งออกทันที', body: 'เลิกจ้าง/กระทำผิด — ไม่รอรอบวันที่ 5' }) : ''} ${timeline(steps)}
      </div>`
    : reasons(st.reasons);
  return card({ title: 'ประกันกลุ่ม', iconName: 'shield-plus', actions: b, body });
}

function renderUniform(box, emp, st) {
  const pending = st.entitlements.filter((e) => !e.issued && !e.requested).length;
  const waiting = st.entitlements.filter((e) => e.requested).length;
  const b =
    st.ruleId === null
      ? badge('ไม่พบสิทธิ', 'danger', { lg: true })
      : pending
        ? badge(`ค้างแจก ${pending}`, 'warning', { lg: true })
        : waiting
          ? badge(`ส่งเบิกแล้ว ${waiting}`, 'info', { lg: true })
          : badge('ครบแล้ว', 'success', { lg: true });
  render(
    box,
    card({
      title: 'ชุดฟอร์ม',
      description: st.style ?? '',
      iconName: 'shirt',
      actions: b,
      padded: false,
      body: st.ruleId === null ? html`<p class="small muted" style="padding:20px">${st.reasons.join(' · ')}</p>` : raw('<div data-uniform-table></div>'),
    }),
  );
  if (st.ruleId === null) return;
  const t = new DataTable(box.querySelector('[data-uniform-table]'), {
    rowKey: (e) => e.key,
    onRender: enhanceIssueActions,
    columns: [
      { key: 'event', header: 'รอบ', cell: (e) => html`<b style="font-weight:500">${UNIFORM_EVENT_LABEL[e.event]}${e.event === 'ANNUAL' ? ` ${Number(e.key.slice(7)) + 543}` : ''}</b>` },
      { key: 'due', header: 'ครบกำหนด', sort: (e) => e.dueDate, cell: (e) => html`<span class="num">${thaiDate(e.dueDate)}</span>` },
      { key: 'qty', header: 'จำนวน', align: 'right', cell: (e) => html`<span class="num">${e.qtyLabel} ตัว</span>` },
      { key: 'items', header: 'รายการ', hideOnMobile: true, cell: (e) => html`<span class="muted">${e.items.map((i) => UNIFORM_ITEM_LABEL[i]).join(', ')}</span>` },
      {
        key: 'act',
        header: '',
        align: 'right',
        cell: (e) =>
          e.stock
            ? // ผ่านคลัง: ยกเลิกได้เฉพาะตอนรอคลังจ่าย (คลังจ่ายแล้วต้องยกเลิกที่ระบบสต็อก)
              html`<span class="row" style="justify-content:flex-end;gap:6px">${stockDocLink(e.stock)} ${badge(STOCK_STAGE[e.stock.stage].label, STOCK_STAGE[e.stock.stage].tone)}
                ${e.requested && canCancelIssue(true)
                  ? html`<button class="btn-icon sm danger" data-cancel-issue="${e.issueId}" data-stock="1" data-label="${UNIFORM_EVENT_LABEL[e.event]}" title="ยกเลิกการส่งเบิก" aria-label="ยกเลิกการส่งเบิก">${raw(icon('undo-2'))}</button>`
                  : ''}</span>`
            : e.issued
              ? html`<span class="row" style="justify-content:flex-end">${badge('แจกแล้ว', 'success')}
                ${canCancelIssue(false) ? html`<button class="btn-icon sm danger" data-cancel-issue="${e.issueId}" data-label="${UNIFORM_EVENT_LABEL[e.event]}" title="ยกเลิกการแจก" aria-label="ยกเลิกการแจก">${raw(icon('undo-2'))}</button>` : ''}</span>`
              : emp.status === 'ACTIVE'
                ? issueAction({ employeeId: emp.id, entitlementKey: e.key, event: e.event, qty: e.qty, name: `${emp.firstName} ${emp.lastName}` })
                : badge('ไม่ได้แจก', 'neutral'),
      },
    ],
    empty: emptyState({ iconName: 'shirt', title: 'ยังไม่ถึงรอบแจกชุดฟอร์ม', description: 'จะได้รับเมื่อเริ่มงาน / ผ่านทดลองงาน / รอบประจำปี ตามกฎ' }),
  });
  t.setRows([...st.entitlements].reverse());
}

/** โครงของรายละเอียด (ตำแหน่งแต่ละส่วนเรียกด้วย data-part — ไม่ใช้ id เพราะ popup เปิดซ้อนบนหน้าอื่นได้) */
const skeleton = (inModal) => html`<div class="emp-detail${inModal ? ' in-modal' : ''}">
  <div class="page-head" data-part="head"><div class="skeleton" style="height:56px;width:320px"></div></div>
  <section class="card"><div class="card-body" data-part="info"><div class="skeleton sk-line"></div></div></section>
  <div data-part="insurance"><div class="skeleton sk-block"></div></div>
  <div data-part="uniform"></div>
  <section class="card">
    <header class="card-head">
      <div class="card-title">
        <span class="card-icon">${raw(icon('history'))}</span>
        <div>
          <h2>ประวัติการเปลี่ยนแปลง</h2>
          <p>บันทึกกิจกรรมของพนักงานคนนี้</p>
        </div>
      </div>
    </header>
    <div data-part="activity"></div>
  </section>
</div>`;

/**
 * วาดรายละเอียดพนักงานลง root
 * @param {HTMLElement} root
 * @param {number} id
 * @param {{inModal?: boolean, onLoaded?: (e:any)=>void, onNotFound?: ()=>void}} [o]
 */
export function renderEmployeeDetail(root, id, { inModal = false, onLoaded, onNotFound } = {}) {
  render(root, skeleton(inModal));
  const changed = () => {
    refreshCounts();
    document.dispatchEvent(new CustomEvent('employee:changed', { detail: { id } }));
    load();
  };

  async function load() {
    try {
      const warn = await syncStockQuietly();
      if (warn) toast.error(warn);
      const [b, activity] = await Promise.all([api.getEmployeeBenefits(id), api.listActivity({ employeeId: id, limit: 30 })]);
      const e = b.employee;
      // ข้อมูลที่ไฟล์แจ้งประกันใช้ แต่ยังว่าง
      const missing = () => html`<span class="muted">– ยังไม่กรอก</span>`;
      const name = `${e.firstName} ${e.lastName}`;
      const Title = inModal ? 'h2' : 'h1';
      render(
        part(root, 'head'),
        html`<div class="row" style="gap:16px">
            ${avatar(e.firstName, { lg: true })}
            <div>
              ${raw(`<${Title} class="row wrap">`)}${name} ${badge(STATUS_LABEL[e.status], STATUS_TONE[e.status])}${raw(`</${Title}>`)}
              <p class="num">${e.empCode} · ${EMPLOYEE_TYPE_LABEL[e.employeeType]} · ${e.companyCode}</p>
            </div>
          </div>
          <div class="page-actions">
            <a class="btn" href="employees.html?q=${encodeURIComponent(e.empCode)}">${raw(icon('pencil'))} ${e.status === 'ACTIVE' ? 'แก้ไข / บันทึกพ้นสภาพ' : 'แก้ไข'} ในตาราง</a>
          </div>`,
      );
      render(
        part(root, 'info'),
        infoList([
          { label: 'หน่วยงาน', value: b.site?.name ?? '–' },
          { label: 'ประเภท', value: badge(EMPLOYEE_TYPE_LABEL[e.employeeType], EMPLOYEE_TYPE_TONE[e.employeeType], { dot: false }) },
          { label: typeInfo(e.employeeType)?.usesPosition ? 'ตำแหน่ง' : 'ฝ่าย / ระดับ', value: e.position ?? (e.deptGroup ? `${e.deptGroup} · ระดับ ${e.level ?? '–'}` : '–') },
          { label: 'สัญญา', value: CONTRACT_LABEL[e.contractType] },
          { label: 'วันเริ่มงาน', value: thaiDate(e.startDate) },
          { label: 'ผ่านทดลองงาน', value: thaiDate(e.probationPassDate) },
          { label: 'อายุงาน', value: tenure(e.startDate, e.endDate ?? today) },
          { label: 'เงินเดือน', value: html`<span class="num">${money(e.salary)} ฿</span>` },
          { label: 'วันเกิด / อายุ', value: e.birthDate ? `${thaiDate(e.birthDate)} · ${ageOf(e.birthDate, today)} ปี` : '–' },
          { label: 'คำนำหน้า / เพศ', value: [e.title, GENDER_LABEL[e.gender]].filter(Boolean).join(' · ') || missing() },
          { label: 'เลขบัตรประชาชน', value: e.nationalId ? html`<span class="num">${formatThaiId(e.nationalId)}</span>` : missing() },
          { label: 'โทร / อีเมล', value: [e.phone, e.email].filter(Boolean).join(' · ') || '–' },
          ...(e.status === 'INACTIVE'
            ? [
                { label: 'เหตุผลพ้นสภาพ', value: e.endReason ? END_REASON_LABEL[e.endReason] : '–' },
                { label: 'วันทำงานสุดท้าย', value: thaiDate(e.lastWorkingDate) },
                { label: 'วันพ้นสภาพ', value: thaiDate(e.endDate) },
              ]
            : []),
        ]),
      );
      render(part(root, 'insurance'), insuranceCard(e, b.insurance));
      renderUniform(part(root, 'uniform'), e, b.uniform);
      render(part(root, 'activity'), activityFeed(activity, { linkEmployee: false }));
      onLoaded?.(e);
    } catch (err) {
      if (err?.status === 404 && onNotFound) return onNotFound();
      render(
        root,
        err?.status === 404
          ? card({ body: emptyState({ iconName: 'user-x', title: 'ไม่พบพนักงาน', action: html`<a class="btn" href="employees.html" data-page>กลับไปหน้ารายชื่อ</a>` }) })
          : errorState(err),
      );
    }
  }

  const uniformBox = part(root, 'uniform');
  wireIssueActions(uniformBox, { today, onDone: changed });
  on(uniformBox, 'click', '[data-cancel-issue]', (_e, b) =>
    confirmAction({
      title: b.dataset.stock ? `ยกเลิกการส่งเบิก (${b.dataset.label})?` : `ยกเลิกการแจก (${b.dataset.label})?`,
      body: b.dataset.stock
        ? 'ใบเบิกในระบบสต็อกจะถูกยกเลิกด้วย — ยกเลิกได้เฉพาะใบที่คลังยังไม่จ่าย'
        : 'ใช้กรณีบันทึกผิด เช่น เลือกไซซ์ผิด แล้วบันทึกใหม่ได้ทันที',
      confirmLabel: b.dataset.stock ? 'ยกเลิกการส่งเบิก' : 'ยกเลิกการแจก',
      successMessage: 'ยกเลิกแล้ว — กลับไปเป็น “ค้างแจก”',
      action: async () => {
        await api.cancelUniformIssue(Number(b.dataset.cancelIssue));
        changed();
      },
    }),
  );

  load();
}

/** popup รายละเอียดพนักงาน — ลิงก์ "เปิดเต็มหน้า" ไป employee.html (data-page = ไม่เปิดเป็น popup ซ้ำ) */
export function openEmployeeDetail(id) {
  const m = openModal({
    size: 'lg',
    title: 'รายละเอียดพนักงาน',
    body: html`<div data-emp-detail>${loader({ text: 'กำลังโหลดข้อมูลพนักงาน' })}</div>`,
    footer: html`<a class="btn btn-ghost foot-start" href="employee.html?id=${id}" data-page>${raw(icon('external-link'))} เปิดเต็มหน้า</a>
      <button class="btn btn-primary" data-close>ปิด</button>`,
  });
  m.el.querySelector('.modal').classList.add('modal-emp');
  renderEmployeeDetail(m.el.querySelector('[data-emp-detail]'), id, {
    inModal: true,
    onLoaded: (e) => m.el.querySelector('.modal').setAttribute('aria-label', `${e.firstName} ${e.lastName}`),
  });
  // ลิงก์ในตาราง (แก้ไขในตาราง ฯลฯ) พาไปหน้าอื่น → ปิด popup ก่อน
  m.el.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a && !a.target && !e.defaultPrevented) m.close();
  });
  return m;
}
