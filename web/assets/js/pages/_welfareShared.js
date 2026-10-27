// ชิ้นส่วนของสวัสดิการเพิ่มเติมที่หลายหน้าใช้ร่วมกัน (welfare.html · welfare-setup.html · รายละเอียดพนักงาน)
//   ป้ายสถานะ / ข้อความรอบ-จำนวน · กล่อง "บันทึกการให้" (ตรวจด้วย domain/welfare.js ก่อนส่ง — เซิร์ฟเวอร์ตรวจซ้ำ)
import { api } from '../app/api.js';
import { todayISO } from '../domain/date.js';
import { validateWelfareRecord, welfarePeriodLabel } from '../domain/welfare.js';
import { html, raw } from '../shared/dom.js';
import { thaiDate } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { badge } from '../ui/components.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';

export const FREQUENCY_LABEL = { ONCE: 'ครั้งเดียว', YEARLY: 'ปีละครั้ง', MONTHLY: 'เดือนละครั้ง', ANYTIME: 'เบิกได้หลายครั้ง (วงเงินต่อปี)' };
export const FREQUENCY_HINT = {
  ONCE: 'ให้ครั้งเดียวตลอดการทำงาน เช่น เงินช่วยเหลือแต่งงาน',
  YEARLY: 'ให้ปีละ 1 ครั้ง — ค้างย้อนหลังได้ไม่เกิน 3 ปี เช่น ตรวจสุขภาพประจำปี',
  MONTHLY: 'ให้เดือนละ 1 ครั้ง — ค้างย้อนหลังได้ไม่เกิน 12 เดือน เช่น ค่าเดินทาง',
  ANYTIME: 'เบิกได้หลายครั้งไม่เกินวงเงินต่อปี (ไม่สะสมข้ามปี) เช่น ค่ารักษาพยาบาล — ไม่ใส่วงเงิน = ไม่จำกัด',
};
export const WAIT_FROM_LABEL = { START: 'วันเริ่มงาน', PROBATION: 'วันผ่านทดลองงาน' };
export const FIELD_TYPE_LABEL = { text: 'ข้อความ', number: 'ตัวเลข', date: 'วันที่', select: 'ตัวเลือก' };
export const STATE_LABEL = { NONE: 'ไม่มีสิทธิ์', WAITING: 'รอครบสิทธิ์', DUE: 'ค้างให้', DONE: 'ให้ครบแล้ว' };
export const STATE_TONE = { NONE: 'neutral', WAITING: 'info', DUE: 'warning', DONE: 'success' };

const fmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
/** "1,500 บาท" — ไม่มีจำนวน = '' */
export const amountText = (n, unit) => (n === null || n === undefined ? '' : `${fmt.format(n)}${unit ? ` ${unit}` : ''}`);

/** ป้ายสถานะ — เบิกได้หลายครั้ง: "ใช้ได้อีก 500 บาท" แทน "ค้างให้" */
export function stateBadge(program, st, opts = {}) {
  if (st.state === 'DUE' && program.frequency === 'ANYTIME') {
    const p = st.periods.at(-1);
    return badge(p?.remaining === null || p?.remaining === undefined ? 'ใช้สิทธิ์ได้' : `ใช้ได้อีก ${amountText(p.remaining, program.unit)}`, 'info', opts);
  }
  if (st.state === 'DUE' && st.due > 1) return badge(`ค้างให้ ${st.due} รอบ`, 'warning', opts);
  return badge(STATE_LABEL[st.state], STATE_TONE[st.state], opts);
}

/** ปุ่มบันทึกการให้ใช้ได้ไหม (สถานะมีรอบเปิด + สวัสดิการเปิดใช้งาน) */
export const canRecord = (program, st) => program.active && st.state === 'DUE';

/** แสดงข้อความผิดพลาดใต้ช่อง (data-field = ชื่อช่อง) */
export function showErrors(root, errs) {
  root.querySelectorAll('[data-field]').forEach((f) => {
    const msg = errs[f.dataset.field];
    if (msg) f.setAttribute('aria-invalid', 'true');
    else f.removeAttribute('aria-invalid');
    let el = f.querySelector(':scope > .error');
    if (msg) {
      if (!el) {
        el = document.createElement('span');
        el.className = 'error';
        f.append(el);
      }
      el.textContent = msg;
    } else el?.remove();
  });
  root.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function fieldInput(f) {
  const id = `wf-${f.key}`;
  if (f.type === 'select')
    return html`<select class="input" id="${id}" data-data="${f.key}">
      <option value="">— เลือก —</option>
      ${f.options.map((o) => html`<option value="${o}">${o}</option>`)}
    </select>`;
  if (f.type === 'number') return html`<input class="input num" type="number" step="any" id="${id}" data-data="${f.key}" />`;
  if (f.type === 'date') return html`<input class="input" type="date" id="${id}" data-data="${f.key}" />`;
  return html`<input class="input" id="${id}" data-data="${f.key}" maxlength="500" />`;
}

/**
 * กล่อง "บันทึกการให้" — employee = {id, firstName, lastName, empCode} · status = welfareStatus ของคนนั้น
 * บันทึกสำเร็จ → onDone()
 */
export function openWelfareRecord({ program, employee, status, onDone }) {
  const open = status.periods.filter((p) => !p.done);
  const anytime = program.frequency === 'ANYTIME';
  const showAmount = program.unit !== '' || status.amount !== null;
  const first = open[0];
  const defaultAmount = anytime ? (first?.remaining ?? '') : (status.amount ?? '');
  const m = openModal({
    size: 'md',
    title: `บันทึกการให้ · ${program.name}`,
    description: `${employee.firstName} ${employee.lastName} (${employee.empCode})${status.ruleLabel ? ` · ${status.ruleLabel}` : ''}`,
    body: html`<div class="form-grid g2 welfare-record-form">
      <div class="field" data-field="periodKey">
        <label for="wr-period">รอบ<span class="req">*</span></label>
        <select class="input" id="wr-period">
          ${open.map(
            (p) => html`<option value="${p.key}">${welfarePeriodLabel(p.key)}${anytime && p.remaining !== null ? ` · คงเหลือ ${amountText(p.remaining, program.unit)}` : ''}</option>`,
          )}
        </select>
        ${open.length > 1 ? html`<span class="hint">ค้าง ${open.length} รอบ — เรียงจากเก่าสุด</span>` : ''}
      </div>
      <div class="field" data-field="date">
        <label for="wr-date">วันที่ให้<span class="req">*</span></label>
        <input class="input" type="date" id="wr-date" value="${todayISO()}" />
      </div>
      ${showAmount
        ? html`<div class="field" data-field="amount">
            <label for="wr-amount">${anytime ? 'จำนวนที่เบิก' : 'จำนวน'}${program.unit ? ` (${program.unit})` : ''}${anytime && status.amount !== null ? html`<span class="req">*</span>` : ''}</label>
            <input class="input num" type="number" min="0" step="any" id="wr-amount" value="${defaultAmount}" />
            ${status.amount !== null ? html`<span class="hint">${anytime ? 'วงเงินต่อปี' : 'สิทธิ์ตามเงื่อนไข'} ${amountText(status.amount, program.unit)}</span>` : ''}
          </div>`
        : ''}
      ${program.fields.map(
        (f) => html`<div class="field${f.type === 'text' ? ' full' : ''}" data-field="data.${f.key}">
          <label for="wf-${f.key}">${f.label}${f.required ? html`<span class="req">*</span>` : ''}</label>
          ${fieldInput(f)}
        </div>`,
      )}
      <div class="field full" data-field="note">
        <label for="wr-note">หมายเหตุ</label>
        <input class="input" id="wr-note" maxlength="500" />
      </div>
    </div>`,
    footer: html`<button class="btn btn-ghost" data-close>ยกเลิก</button>
      <button class="btn btn-primary" data-ok data-label="บันทึกการให้">${raw(icon('check'))} บันทึกการให้</button>`,
  });
  const $ = (sel) => m.el.querySelector(sel);
  const ok = $('[data-ok]');
  const read = () => {
    const data = {};
    for (const f of program.fields) {
      const v = $(`[data-data="${f.key}"]`).value.trim();
      if (v !== '') data[f.key] = f.type === 'number' ? Number(v) : v;
    }
    const amt = $('#wr-amount')?.value.trim() ?? '';
    return { employeeId: employee.id, periodKey: $('#wr-period').value, date: $('#wr-date').value, amount: amt === '' ? null : Number(amt), data, note: $('#wr-note').value.trim() };
  };
  ok.onclick = async () => {
    const input = read();
    const errs = validateWelfareRecord(program, status, input);
    showErrors(m.el, errs);
    if (Object.keys(errs).length) return;
    m.busy(true, ok);
    try {
      await api.createWelfareRecord(program.id, input);
      toast.success(`บันทึกการให้ ${program.name} (${welfarePeriodLabel(input.periodKey)}) แล้ว`);
      m.busy(false, ok);
      m.close();
      onDone?.();
    } catch (e) {
      m.busy(false, ok);
      if (e.details) showErrors(m.el, e.details);
      toast.error(errorMessage(e));
    }
  };
  return m;
}

/** ข้อความสรุปเงื่อนไข 1 ข้อ: "HL, PRO · ส่วนกลาง · ระดับ 6+ · ทำงานครบ 90 วัน · 1,500 บาท" */
export function ruleSummary(program, r, { typeName = (c) => c } = {}) {
  const level =
    r.levelMin !== null && r.levelMax !== null
      ? r.levelMin === r.levelMax
        ? `ระดับ ${r.levelMin}`
        : `ระดับ ${r.levelMin}–${r.levelMax}`
      : r.levelMin !== null
        ? `ระดับ ${r.levelMin} ขึ้นไป`
        : r.levelMax !== null
          ? `ไม่เกินระดับ ${r.levelMax}`
          : '';
  return [
    r.companies ? r.companies.join(', ') : 'ทุกบริษัท',
    r.employeeTypes ? r.employeeTypes.map(typeName).join(', ') : 'ทุกประเภท',
    r.deptGroups?.join(', '),
    r.positions?.join(', '),
    r.genders ? r.genders.map((g) => (g === 'M' ? 'ชาย' : 'หญิง')).join(', ') : '',
    level,
    r.waitDays ? `ทำงานครบ ${r.waitDays} วัน (นับจาก${WAIT_FROM_LABEL[program.waitFrom]})` : '',
    r.amount !== null ? `${program.frequency === 'ANYTIME' ? 'วงเงิน ' : ''}${amountText(r.amount, program.unit)}${program.frequency === 'ANYTIME' ? '/ปี' : ''}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** วันที่แบบสั้น หรือ – */
export const dateText = (d) => (d ? thaiDate(d) : '–');
