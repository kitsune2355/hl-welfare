// โอนย้ายพนักงาน — กล่อง "โอนย้าย" + การ์ดประวัติสังกัด (ใช้ในรายละเอียดพนักงาน pages/_employeeDetail.js)
//   วันที่มีผล <= วันนี้ = มีผลทันที · หลังวันนี้ = รอมีผล (ข้อมูลพนักงานยังเป็นค่าเดิม — ถึงวันแล้วระบบย้ายให้เอง)
//   นับวันรอสิทธิ์: ต่อจากเดิม (ค่าเริ่มต้น) หรือ เริ่มนับใหม่จากวันที่ย้าย (ประกันกลุ่ม + สวัสดิการเพิ่มเติมที่นับจากวันเริ่มงาน)
//   ตรวจด้วย domain/transfer.js ก่อนส่ง (เซิร์ฟเวอร์ตรวจซ้ำ + กฎพนักงาน + ของที่ปิดใช้งาน)
import { api } from '../app/api.js';
import { can } from '../app/auth.js';
import { companyList, defaultTypeFor, employeeTypeList, isTypeActive, typeAllows, typeInfo } from '../domain/catalog.js';
import { todayISO } from '../domain/date.js';
import { assignmentChanges, assignmentOf, assignmentPeriods, validateTransfer } from '../domain/transfer.js';
import { html, raw } from '../shared/dom.js';
import { relativeDays, tenure, thaiDateFull } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { DEPT_GROUPS, EMPLOYEE_TYPE_LABEL } from '../shared/labels.js';
import { alertBox, badge, card, companyChip } from '../ui/components.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';
import { showErrors } from './_welfareShared.js';

/** ปุ่มโอนย้ายแสดงไหม */
export const canTransfer = (emp) => can('employees.edit') && emp.status === 'ACTIVE' && emp.active !== false;

/** "ฝ่าย Support Line · ระดับ 3" / "ช่างเทคนิค" */
const roleText = (a) => [a.position, a.deptGroup, a.level !== null && a.level !== undefined ? `ระดับ ${a.level}` : ''].filter(Boolean).join(' · ') || '–';

/**
 * การ์ด "ประวัติสังกัด / โอนย้าย" — ช่วงเวลาที่อยู่แต่ละที่ + การย้ายที่รอมีผล (ยกเลิกได้)
 * @param {Map<number, {name: string}>} siteById
 */
export function assignmentCard(emp, transfers, siteById) {
  const periods = assignmentPeriods(emp, transfers).reverse(); // ปัจจุบันอยู่บน
  const pending = transfers.filter((t) => t.status === 'PENDING');
  const siteName = (id) => siteById.get(id)?.name ?? `#${id}`;
  const body = html`<div class="assign-history">
    ${pending.map(
      (t) => html`${alertBox({
        tone: 'info',
        title: `รอมีผล ${thaiDateFull(t.effectiveDate)} (${relativeDays(t.effectiveDate, todayISO())})`,
        body: html`ย้ายไป ${t.to.companyCode} · ${siteName(t.to.siteId)} · ${EMPLOYEE_TYPE_LABEL[t.to.employeeType] ?? t.to.employeeType} · ${roleText(t.to)}${t.resetWait
          ? ' · นับวันรอสิทธิ์ใหม่'
          : ''}${t.note ? html`<br /><span class="small muted">${t.note}</span>` : ''}`,
        action: can('employees.edit')
          ? html`<button class="btn btn-sm" data-cancel-transfer="${t.id}" data-date="${t.effectiveDate}">${raw(icon('undo-2'))} ยกเลิกการย้าย</button>`
          : '',
      })}`,
    )}
    <ol class="assign-periods">
      ${periods.map((p) => {
        const t = transfers.find((x) => x.id === p.transferId);
        return html`<li class="${p.current ? 'current' : ''}">
          <div class="assign-when">
            <b class="num">${thaiDateFull(p.since)}</b> – <b class="num">${p.until ? thaiDateFull(p.until) : 'ปัจจุบัน'}</b>
            <span class="small muted">${tenure(p.since, p.until ?? todayISO())}</span>
          </div>
          <div class="assign-where">
            ${companyChip(p.assignment.companyCode)} <span>${siteName(p.assignment.siteId)}</span>
            ${badge(EMPLOYEE_TYPE_LABEL[p.assignment.employeeType] ?? p.assignment.employeeType, 'neutral', { dot: false })}
            <span class="muted">${roleText(p.assignment)}</span>
          </div>
          ${t
            ? html`<div class="small muted">โอนย้ายโดย ${t.createdBy}${t.resetWait ? ' · นับวันรอสิทธิ์ใหม่จากวันที่ย้าย' : ''}${t.note ? ` · ${t.note}` : ''}</div>`
            : p.since === emp.startDate
              ? html`<div class="small muted">เริ่มงาน</div>`
              : ''}
        </li>`;
      })}
    </ol>
  </div>`;
  return card({
    title: 'ประวัติสังกัด / โอนย้าย',
    description: 'อยู่บริษัท / หน่วยงานไหน ตั้งแต่วันไหนถึงวันไหน',
    iconName: 'arrow-left-right',
    actions: canTransfer(emp) && !pending.length ? html`<button class="btn btn-sm" data-transfer>${raw(icon('arrow-left-right'))} โอนย้าย</button>` : '',
    body,
  });
}

/**
 * กล่องโอนย้าย — sites = หน่วยงานทั้งหมด · groups = ชื่อกลุ่ม / ฝ่าย · บันทึกสำเร็จ → onDone()
 */
export async function openTransfer({ employee: emp, transfers, onDone }) {
  const [sites, groups] = await Promise.all([api.listSites(), api.listDeptGroups().catch(() => DEPT_GROUPS.map((name) => ({ name, active: true })))]);
  const today = todayISO();
  const to = assignmentOf(emp);
  const st = { effectiveDate: '', resetWait: false, note: '' };
  const groupNames = groups.filter((g) => g.active !== false).map((g) => g.name);
  const opt = (v, label, sel) => html`<option value="${v}" ${v === sel ? raw('selected') : ''}>${label}</option>`;

  const form = () => {
    const type = typeInfo(to.employeeType);
    const siteOpts = sites.filter((s) => s.companyCode === to.companyCode && (s.active !== false || s.id === emp.siteId));
    const changes = assignmentChanges(assignmentOf(emp), to);
    return html`<div class="form-grid">
      <div class="field full" data-field="effectiveDate">
        <label for="tr-date">วันที่มีผล<span class="req">*</span></label>
        <input class="input" type="date" id="tr-date" value="${st.effectiveDate}" min="${emp.startDate}" />
        <span class="hint">${!st.effectiveDate
          ? 'วันที่เริ่มอยู่สังกัดใหม่ — ตั้งล่วงหน้าได้'
          : st.effectiveDate > today
            ? `รอมีผล (${relativeDays(st.effectiveDate, today)}) — ข้อมูลพนักงานยังเป็นค่าเดิมจนถึงวันนั้น แล้วระบบย้ายให้เอง`
            : 'มีผลทันทีเมื่อบันทึก'}</span>
      </div>
      <div class="field" data-field="companyCode">
        <label for="tr-company">บริษัท<span class="req">*</span></label>
        <select class="input" id="tr-company">${companyList()
          .filter((c) => c.active !== false || c.code === emp.companyCode)
          .map((c) => opt(c.code, `${c.code} · ${c.name}`, to.companyCode))}</select>
      </div>
      <div class="field" data-field="siteId">
        <label for="tr-site">หน่วยงาน<span class="req">*</span></label>
        <select class="input" id="tr-site">
          <option value="">— เลือก —</option>
          ${siteOpts.map((s) => opt(String(s.id), s.name, String(to.siteId)))}
        </select>
      </div>
      <div class="field" data-field="employeeType">
        <label for="tr-type">ประเภทพนักงาน<span class="req">*</span></label>
        <select class="input" id="tr-type">${employeeTypeList()
          .filter((t) => typeAllows(t.code, to.companyCode) && (isTypeActive(t.code) || t.code === emp.employeeType))
          .map((t) => opt(t.code, t.name, to.employeeType))}</select>
      </div>
      <div class="field" data-field="position">
        <label for="tr-position">ตำแหน่ง</label>
        <input class="input" id="tr-position" value="${to.position ?? ''}" maxlength="100" />
      </div>
      ${type?.usesDeptGroup
        ? html`<div class="field" data-field="deptGroup">
              <label for="tr-group">กลุ่ม / ฝ่าย<span class="req">*</span></label>
              <select class="input" id="tr-group">
                <option value="">— เลือก —</option>
                ${[...new Set([...groupNames, ...(to.deptGroup ? [to.deptGroup] : [])])].map((g) => opt(g, g, to.deptGroup))}
              </select>
            </div>
            <div class="field" data-field="level">
              <label for="tr-level">ระดับ<span class="req">*</span></label>
              <input class="input num" type="number" min="1" max="9" id="tr-level" value="${to.level ?? ''}" />
            </div>`
        : ''}
      <div class="field full" data-field="resetWait">
        <label>นับวันรอสิทธิ์ (ประกันกลุ่ม / สวัสดิการเพิ่มเติม)</label>
        <div class="welfare-freqs">
          <label class="welfare-freq"><input type="radio" name="tr-wait" value="0" ${st.resetWait ? '' : raw('checked')} />
            <span><b>ต่อจากเดิม</b><small class="muted">นับจากวันเริ่มงานเหมือนเดิม — ย้ายภายในเครือแบบต่ออายุงาน</small></span></label>
          <label class="welfare-freq"><input type="radio" name="tr-wait" value="1" ${st.resetWait ? raw('checked') : ''} />
            <span><b>เริ่มนับใหม่จากวันที่ย้าย</b><small class="muted">สิทธิ์ที่ต้องทำงานครบ X วัน นับใหม่ตั้งแต่วันที่มีผล (สิทธิ์ที่แจ้ง / ให้ไปแล้วไม่เปลี่ยน)</small></span></label>
        </div>
      </div>
      <div class="field full" data-field="note">
        <label for="tr-note">หมายเหตุ</label>
        <input class="input" id="tr-note" value="${st.note}" maxlength="500" placeholder="เช่น ตามคำสั่งที่ …" />
      </div>
      ${changes.length
        ? html`<p class="small muted full">เปลี่ยน: ${changes.map((k) => ({ companyCode: 'บริษัท', siteId: 'หน่วยงาน', employeeType: 'ประเภท', deptGroup: 'กลุ่ม/ฝ่าย', position: 'ตำแหน่ง', level: 'ระดับ' })[k]).join(', ')}</p>`
        : ''}
    </div>`;
  };

  const m = openModal({
    size: 'md',
    title: 'โอนย้ายพนักงาน',
    description: `${emp.firstName} ${emp.lastName} (${emp.empCode}) · ปัจจุบัน ${emp.companyCode} · ${sites.find((s) => s.id === emp.siteId)?.name ?? ''}`,
    body: html`<div data-transfer-form>${form()}</div>`,
    footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" data-ok data-label="บันทึกการโอนย้าย">บันทึกการโอนย้าย</button>`,
  });
  const box = m.el.querySelector('[data-transfer-form]');
  const q = (s) => box.querySelector(s);
  const read = () => {
    st.effectiveDate = q('#tr-date').value;
    st.resetWait = q('[name="tr-wait"]:checked')?.value === '1';
    st.note = q('#tr-note').value.trim();
    to.companyCode = q('#tr-company').value;
    to.siteId = Number(q('#tr-site').value) || 0;
    to.employeeType = q('#tr-type').value;
    to.position = q('#tr-position').value.trim() || null;
    to.deptGroup = q('#tr-group')?.value || null;
    to.level = q('#tr-level')?.value ? Number(q('#tr-level').value) : null;
  };
  box.addEventListener('change', (e) => {
    read();
    // เปลี่ยนบริษัท → หน่วยงาน/ประเภทต้องเป็นของบริษัทนั้น (เหมือน normalizeEmployee)
    if (e.target.id === 'tr-company') {
      to.siteId = sites.find((s) => s.companyCode === to.companyCode && s.active !== false)?.id ?? 0;
      if (!typeAllows(to.employeeType, to.companyCode)) to.employeeType = defaultTypeFor(to.companyCode);
    }
    if (!typeInfo(to.employeeType)?.usesDeptGroup) Object.assign(to, { deptGroup: null, level: null });
    else to.level ??= 1;
    render();
  });
  const render = () => {
    box.innerHTML = String(form());
  };
  const ok = m.el.querySelector('[data-ok]');
  ok.onclick = async () => {
    read();
    const input = { effectiveDate: st.effectiveDate, to: { ...to }, resetWait: st.resetWait, note: st.note };
    const errs = validateTransfer(input, emp, transfers);
    showErrors(box, errs);
    if (Object.keys(errs).length) return;
    m.busy(true, ok);
    try {
      const r = await api.createTransfer(emp.id, input);
      const applied = r.transfers.at(-1)?.status === 'APPLIED';
      toast.success(applied ? 'โอนย้ายแล้ว — มีผลทันที' : `ตั้งโอนย้ายแล้ว — มีผล ${thaiDateFull(input.effectiveDate)}`);
      m.busy(false, ok);
      m.close();
      onDone?.();
    } catch (e) {
      m.busy(false, ok);
      if (e.details) showErrors(box, e.details);
      toast.error(errorMessage(e));
    }
  };
}
