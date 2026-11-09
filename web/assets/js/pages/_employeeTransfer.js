// กล่อง "โอนย้าย / เปลี่ยนรหัส" (หน้าพนักงาน · เลือกได้หลายคน) — มีวันที่มีผล บันทึกทันที (ไม่ใช่แถวยังไม่บันทึก)
//
//   ประกันกลุ่ม: อายุงานนับต่อ · ติ๊ก "แจ้งบริษัทประกัน" = แจ้งออกจากที่เดิม (วันก่อนย้าย) + แจ้งเข้าที่ใหม่ (วันย้าย)
//     เปลี่ยนรหัสอย่างเดียว + ติ๊ก = แถว "แจ้งเปลี่ยนแปลง" · ย้ายไปหน่วยงานที่ไม่ได้รับประกัน = แจ้งออกเสมอ
//   เลือกหลายคน = ย้ายไปที่เดียวกัน (รหัสคงเดิม — เปลี่ยนรหัสได้ทีละคน)
//   แก้ข้อมูลที่กรอกผิด (ไม่ใช่การย้ายจริง) ยังแก้ในตารางได้ตามเดิม — ไม่มีประวัติ / ไม่มีรายการแจ้งประกัน
import { api } from '../app/api.js';
import { companyChoices } from '../app/auth.js';
import { COMPANY_CODES, companyOf, defaultTypeFor, isTypeActive, typeInfo, typesFor } from '../domain/catalog.js';
import { addDays, todayISO } from '../domain/date.js';
import { html, raw } from '../shared/dom.js';
import { thaiDate } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { alertBox } from '../ui/components.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';

const opt = (v, label, sel) => html`<option value="${v}" ${String(v) === String(sel) ? 'selected' : ''}>${label}</option>`;

/**
 * @param {object[]} rows  พนักงานที่เลือก (ทำงานอยู่)
 * @param {{sites: object[], onDone: () => void}} ctx
 */
export function openTransferDialog(rows, { sites, onDone }) {
  const one = rows.length === 1 ? rows[0] : null;
  const first = rows[0];
  const companies = companyChoices(COMPANY_CODES);
  const m = openModal({
    size: 'md',
    title: one ? `โอนย้าย / เปลี่ยนรหัส — ${one.firstName} ${one.lastName}` : `โอนย้าย ${rows.length} คน`,
    description: 'บันทึกทันทีพร้อมประวัติ · อายุงานประกันนับต่อจากวันเริ่มงานเดิม (ไม่ต้องรอ 30 วันใหม่) · แก้ข้อมูลที่กรอกผิดให้แก้ในตารางแทน',
    body: html`<form class="org-form" data-tf>
        <div class="field">
          <label for="tf-date">วันที่มีผล<span class="req">*</span></label>
          <input class="input" type="date" id="tf-date" value="${todayISO()}" required />
        </div>
        <div class="field">
          <label for="tf-company">บริษัท</label>
          <select class="input" id="tf-company">${companies.map((c) => opt(c, `${c} · ${companyOf(c)?.name ?? ''}`, first.companyCode))}</select>
        </div>
        <div class="field">
          <label for="tf-site">หน่วยงาน</label>
          <select class="input" id="tf-site"></select>
        </div>
        <div class="field">
          <label for="tf-type">ประเภท</label>
          <select class="input" id="tf-type"></select>
        </div>
        ${one
          ? html`<div class="field">
              <label for="tf-code">รหัสพนักงาน</label>
              <input class="input" id="tf-code" value="${one.empCode}" maxlength="20" autocomplete="off" />
              <span class="hint">เดิม ${one.empCode} — เปลี่ยนเมื่อได้รหัสใหม่</span>
            </div>`
          : ''}
        <div class="field full">
          <label class="check"><input type="checkbox" id="tf-notify" checked /> <span><b>แจ้งบริษัทประกัน</b></span></label>
          <span class="hint" data-tf-hint></span>
        </div>
        <div class="field full">
          <label for="tf-note">หมายเหตุ</label>
          <input class="input" id="tf-note" maxlength="255" placeholder="ไม่บังคับ เช่น ย้ายตามโครงการ / คำสั่งเลขที่" />
        </div>
      </form>
      ${one ? '' : html`<p class="small muted" style="margin-top:8px">${rows.map((r) => `${r.empCode} ${r.firstName}`).slice(0, 10).join(' · ')}${rows.length > 10 ? ` และอีก ${rows.length - 10} คน` : ''}</p>`}`,
    footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary" data-ok>${raw(icon('arrow-left-right'))} บันทึก</button>`,
  });
  const $ = (s) => m.el.querySelector(s);
  const company = $('#tf-company');
  const site = $('#tf-site');
  const type = $('#tf-type');
  const code = $('#tf-code');
  const notify = $('#tf-notify');
  const date = $('#tf-date');

  const fillSites = () => {
    const c = company.value;
    const list = sites.filter((s) => s.companyCode === c && (s.active !== false || s.id === first.siteId));
    const keep = list.some((s) => s.id === Number(site.value)) ? Number(site.value) : c === first.companyCode ? first.siteId : list[0]?.id;
    site.innerHTML = String(html`${list.map((s) => opt(s.id, `${s.name}${s.hasGroupInsurance ? '' : ' (ไม่ได้รับประกันกลุ่ม)'}`, keep))}`);
    const types = typesFor(c).filter((t) => isTypeActive(t) || t === first.employeeType);
    const tKeep = types.includes(type.value) ? type.value : types.includes(first.employeeType) ? first.employeeType : defaultTypeFor(c);
    type.innerHTML = String(html`${types.map((t) => opt(t, typeInfo(t)?.name ?? t, tKeep))}`);
  };
  /** อธิบายผลต่อประกันกลุ่มตามที่เลือก (เปลี่ยนรหัสอย่างเดียว = ไม่ติ๊กไว้ก่อน — "ไม่เสมอไป") */
  let touched = false;
  const moved = () => company.value !== first.companyCode || Number(site.value) !== first.siteId || type.value !== first.employeeType || rows.length > 1;
  const hint = () => {
    const d = date.value;
    const codeOnly = !moved() && code && code.value.trim() !== one.empCode;
    if (!touched) notify.checked = !codeOnly;
    const target = sites.find((s) => s.id === Number(site.value));
    const text = !d
      ? ''
      : moved()
        ? target && !target.hasGroupInsurance
          ? `หน่วยงานใหม่ไม่ได้รับประกันกลุ่ม → แจ้งออก มีผล ${thaiDate(addDays(d, -1))} (แจ้งเสมอ)`
          : notify.checked
            ? `แจ้งออกจากที่เดิม มีผล ${thaiDate(addDays(d, -1))} + แจ้งเข้าที่ใหม่ มีผล ${thaiDate(d)} (คนที่ยังไม่ครบอายุงาน = แจ้งเข้าครั้งแรกตามวันครบเดิม)`
            : 'ไม่ติ๊ก = คุ้มครองต่อเนื่อง ไม่มีรายการแจ้งบริษัทประกัน'
        : codeOnly
          ? notify.checked
            ? `แถว "แจ้งเปลี่ยนแปลง" มีผล ${thaiDate(d)} ในรอบถัดไป`
            : 'ไม่ติ๊ก = เปลี่ยนรหัสในระบบเท่านั้น'
          : 'ยังไม่ได้เลือกค่าใหม่';
    $('[data-tf-hint]').textContent = text;
  };
  company.onchange = () => {
    fillSites();
    hint();
  };
  site.onchange = hint;
  type.onchange = hint;
  date.oninput = hint;
  code?.addEventListener('input', hint);
  notify.onchange = () => {
    touched = true;
    hint();
  };
  fillSites();
  hint();

  const ok = $('[data-ok]');
  ok.onclick = async () => {
    m.busy(true, ok);
    const done = [];
    const failed = [];
    for (const r of rows) {
      try {
        await api.createEmployeeChange(r.id, {
          effectiveDate: date.value,
          companyCode: company.value,
          siteId: Number(site.value),
          employeeType: type.value,
          empCode: one ? code.value.trim() : r.empCode,
          notifyInsurer: notify.checked,
          note: $('#tf-note').value.trim() || null,
        });
        done.push(r);
      } catch (e) {
        failed.push(`${r.empCode}: ${errorMessage(e)}`);
      }
    }
    m.busy(false, ok);
    if (failed.length && !done.length) {
      $('[data-tf]').insertAdjacentHTML('afterend', String(alertBox({ tone: 'danger', title: 'บันทึกไม่ได้', body: failed.slice(0, 5).join(' · ') })));
      return;
    }
    m.close();
    if (failed.length) toast.error(`บันทึกไม่ได้ ${failed.length} คน — ${failed[0]}`);
    toast.success(`บันทึก${moved() ? 'โอนย้าย' : 'เปลี่ยนรหัส'}แล้ว ${done.length} คน (มีผล ${thaiDate(date.value)})${notify.checked ? ' — ดูรายการแจ้งประกันได้ที่หน้าประกันกลุ่ม' : ''}`);
    onDone();
  };
}
