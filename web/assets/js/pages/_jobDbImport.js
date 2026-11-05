// ดึงพนักงานจากระบบสัญญาจ้าง: CNS รายวัน (job_db_cns) · PRO Pro Site (hr-pro) — แสดงตัวอย่างก่อน แล้ว HR เลือกเองว่าจะบันทึกรายการไหน
//   เพิ่มใหม่ = ติ๊กไว้ให้ · ข้อมูลต่างกัน = ไม่ติ๊ก (HR ตรวจแล้วเลือกเอง) · ข้าม = แสดงเหตุผล
// backend/api/job_db.php อ่านต้นทางซ้ำตอนบันทึก หน้านี้ส่งแค่รหัสที่เลือก
import { api } from '../app/api.js';
import { html, raw, render } from '../shared/dom.js';
import { thaiDateFull } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { alertBox, emptyState, errorState } from '../ui/components.js';
import { loader } from '../ui/loading.js';
import { errorMessage, openModal, toast } from '../ui/overlay.js';

export const jobDbButton = () =>
  html`<button type="button" class="btn btn-sm" data-job-db="cns" title="ดึงพนักงาน CNS รายวันจาก job_db_cns — ตรวจก่อนบันทึก">${raw(icon('refresh-cw'))} ดึงสัญญาจ้าง CNS</button>
    <button type="button" class="btn btn-sm" data-job-db="pro" title="ดึงพนักงาน PRO Pro Site จาก hr-pro — ตรวจก่อนบันทึก">${raw(icon('refresh-cw'))} ดึงสัญญาจ้าง PRO</button>`;

const DATE_FIELDS = ['birthDate', 'startDate'];
const shown = (c, v) => (v === null || v === '' ? '–' : DATE_FIELDS.includes(c.field) ? thaiDateFull(v) : v);

function section(title, kind, rows, checked) {
  if (!rows.length) return '';
  return html`<section style="margin-top:16px">
    <div class="row" style="justify-content:space-between;gap:8px;margin-bottom:6px">
      <b>${title} <span class="muted">(${rows.length})</span></b>
      ${kind ? html`<label class="small"><input type="checkbox" data-all-kind="${kind}" ${checked ? raw('checked') : ''} /> เลือกทั้งหมด</label>` : ''}
    </div>
    <div style="overflow-x:auto">
      <table class="table">
        <thead><tr>${kind ? html`<th></th>` : ''}<th>รหัส</th><th>ชื่อ-สกุล</th><th>หน่วยงาน</th><th>${kind === 'update' ? 'สิ่งที่ต่างกัน (ปัจจุบัน → ระบบสัญญาจ้าง)' : kind ? 'ตำแหน่ง' : 'เหตุผล'}</th></tr></thead>
        <tbody>
          ${rows.map(
            (r) => html`<tr>
              ${kind ? html`<td><input type="checkbox" data-pick-kind="${kind}" value="${r.empCode}" ${checked ? raw('checked') : ''} aria-label="เลือก ${r.empCode}" /></td>` : ''}
              <td class="num nowrap">${r.empCode ?? '–'}</td>
              <td>${r.name || '–'}</td>
              <td>${r.siteName ?? '–'}${r.siteName && !r.siteExists ? html` <span class="small muted">(ยังไม่มี)</span>` : ''}</td>
              <td class="small">
                ${kind === 'update'
                  ? r.changes.map((c) => html`<div>${c.label}: ${shown(c, c.from)} → <b>${shown(c, c.to)}</b></div>`)
                  : kind
                    ? (r.position ?? '–')
                    : r.reasons.join(' · ')}
                ${r.warnings.map((w) => html`<div class="muted">${w}</div>`)}
              </td>
            </tr>`,
          )}
        </tbody>
      </table>
    </div>
  </section>`;
}

const SOURCE_TEXT = { cns: 'CNS ประเภทรายวัน', pro: 'PRO ประเภท Pro Site' };

/** @param {{source: 'cns'|'pro', onDone: () => void}} o onDone เรียกหลังบันทึกสำเร็จ อย่างน้อย 1 รายการ */
export async function openJobDbImport({ source, onDone }) {
  const m = openModal({
    size: 'lg',
    title: 'ดึงจากระบบสัญญาจ้าง',
    description: `พนักงาน ${SOURCE_TEXT[source]} จากสัญญาที่เซ็นแล้ว — ยังไม่บันทึกจนกว่าจะกดปุ่ม`,
    body: html`<div data-job-body>${loader({ text: 'กำลังอ่านข้อมูลจากระบบสัญญาจ้าง' })}</div>`,
    footer: html`<button class="btn btn-ghost" data-close>ปิด</button>
      <button class="btn btn-primary" data-ok data-label="บันทึกที่เลือก" disabled>บันทึกที่เลือก</button>`,
  });
  const body = m.el.querySelector('[data-job-body]');
  const ok = m.el.querySelector('[data-ok]');
  let plan;
  try {
    plan = await api.previewJobDbEmployees(source);
  } catch (e) {
    render(body, errorState(e));
    return;
  }
  const of = (action) => plan.rows.filter((r) => r.action === action);
  const s = plan.summary;
  const picked = (kind) => [...body.querySelectorAll(`[data-pick-kind="${kind}"]:checked`)].map((i) => i.value);
  const refresh = () => {
    const n = picked('new').length + picked('update').length;
    ok.disabled = n === 0;
    ok.textContent = n ? `บันทึกที่เลือก (${n})` : 'บันทึกที่เลือก';
  };
  render(
    body,
    html`<p class="small muted" style="margin:0">
        พบ ${s.total} คน · เพิ่มใหม่ ${s.new} · ข้อมูลต่างกัน ${s.update} · ตรงกันแล้ว ${s.same} · ข้าม ${s.skip}
      </p>
      ${s.new + s.update + s.skip === 0 ? emptyState({ iconName: 'circle-check', title: 'ข้อมูลตรงกันทั้งหมดแล้ว' }) : ''}
      ${plan.missingSites.length
        ? html`<div style="margin-top:12px">
            ${alertBox({
              tone: plan.canCreateSites ? 'info' : 'warning',
              body: html`ยังไม่มีหน่วยงาน ${plan.missingSites.length} แห่งในบริษัท ${plan.company}: ${plan.missingSites.join(', ')}${plan.canCreateSites ? '' : ' — บัญชีนี้ไม่มีสิทธิ์เพิ่มหน่วยงาน รายการของหน่วยงานเหล่านี้จะบันทึกไม่สำเร็จ'}`,
            })}
            ${plan.canCreateSites ? html`<label class="small" style="display:block;margin-top:8px"><input type="checkbox" data-create-sites checked /> สร้างหน่วยงานที่ยังไม่มีให้อัตโนมัติ</label>` : ''}
          </div>`
        : ''}
      ${section('เพิ่มใหม่', 'new', of('new'), true)}
      ${section('ข้อมูลต่างกัน — เลือกรายการที่จะอัปเดตตามระบบสัญญาจ้าง', 'update', of('update'), false)}
      ${section('ข้าม (นำเข้าไม่ได้)', '', of('skip'), false)}`,
  );
  body.addEventListener('change', (e) => {
    const all = e.target.closest('[data-all-kind]');
    if (all) body.querySelectorAll(`[data-pick-kind="${all.dataset.allKind}"]`).forEach((i) => (i.checked = all.checked));
    refresh();
  });
  refresh();
  ok.onclick = async () => {
    m.busy(true, ok);
    try {
      const r = await api.importJobDbEmployees({
        source,
        create: picked('new'),
        update: picked('update'),
        createSites: !!body.querySelector('[data-create-sites]')?.checked,
      });
      m.busy(false, ok);
      const done = r.created + r.updated;
      if (done || r.sitesCreated) onDone();
      if (r.failed.length) {
        toast.error(`บันทึกไม่สำเร็จ ${r.failed.length} รายการ`);
        ok.disabled = true;
        render(
          body,
          html`<p class="small">เพิ่ม ${r.created} · อัปเดต ${r.updated} · หน่วยงานใหม่ ${r.sitesCreated}</p>
            ${alertBox({ tone: 'danger', title: `ไม่สำเร็จ ${r.failed.length} รายการ`, body: html`<ul style="margin:0;padding-left:18px">${r.failed.map((f) => html`<li>${f.empCode} ${f.name}: ${f.message}</li>`)}</ul>` })}`,
        );
        return;
      }
      toast.success(`บันทึกแล้ว — เพิ่ม ${r.created} · อัปเดต ${r.updated}${r.sitesCreated ? ` · หน่วยงานใหม่ ${r.sitesCreated}` : ''}`);
      m.close();
    } catch (err) {
      toast.error(errorMessage(err));
      m.busy(false, ok);
    }
  };
}
