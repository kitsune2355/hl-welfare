// ตั้งค่าองค์กร — แท็บ "เริ่มต้นตั้งค่า" (ลำดับขั้น + สถานะจริงของแต่ละขั้น) และกล่องอธิบายของแต่ละแท็บ
//
// ลำดับมาจากการอ้างอิงของข้อมูล (ขั้นหลังใช้ข้อมูลของขั้นก่อน):
//   1 บริษัท → 2 ประเภทพนักงาน → 3 กลุ่ม/ฝ่าย → 4 หน่วยงาน → 5 แบบฟอร์มประกัน + ผูกบริษัท
//   → 6 เงื่อนไขสวัสดิการ → 7 ชุดฟอร์มเฉพาะหน่วยงาน (ไม่บังคับ) → 8 ผู้ใช้ HR บริษัท (ไม่บังคับ) → 9 พนักงาน
// สถานะคำนวณจากข้อมูลจริงทุกครั้งที่เปิด (ไม่เก็บ "ทำแล้ว" แยก) — ข้อมูลที่บัญชีนี้ไม่มีสิทธิ์ดู = แสดงว่า "ดูไม่ได้"
import { api } from '../app/api.js';
import { can } from '../app/auth.js';
import { employeeTypeList, typeInfo, typesFor } from '../domain/catalog.js';
import { html, raw, render } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { EMPLOYEE_TYPE_LABEL } from '../shared/labels.js';
import { badge, errorState } from '../ui/components.js';
import { loader } from '../ui/loading.js';

// ===================== กล่องอธิบายของแต่ละแท็บ =====================
/** คืออะไร / ใช้ทำอะไร / ต้องมีอะไรก่อน — ข้อความเดียวกับการ์ดในแท็บเริ่มต้นตั้งค่า */
export const ABOUT = {
  companies: {
    step: 1,
    title: 'บริษัท',
    what: 'บริษัทในเครือ (HL, PRO, CNS …) — ทุกอย่างในระบบอ้างอิงรหัสบริษัท',
    uses: ['หน่วยงานและพนักงานทุกคนสังกัดบริษัท', 'กฎสวัสดิการเลือกได้ว่าใช้กับบริษัทไหน', 'ไฟล์แจ้งประกันแยกชีตตามบริษัท (ใช้ “ชื่อตามทะเบียน”)', 'ผู้ใช้ “HR บริษัท” เห็นเฉพาะบริษัทที่ดูแล'],
    needs: 'ไม่มี — ทำเป็นอย่างแรก',
  },
  types: {
    step: 2,
    title: 'ประเภทพนักงาน',
    what: 'กลุ่มพนักงานที่ได้สิทธิ์ต่างกัน (ส่วนกลาง, Pro Site, รายวัน …) และพฤติกรรมของแต่ละประเภท',
    uses: ['กฎประกันกลุ่ม / ชุดฟอร์มแยกตามประเภท', '“ใช้กับบริษัท” จำกัดว่าเลือกประเภทนี้ได้ในบริษัทไหน', 'ติ๊ก “กลุ่ม/ฝ่าย + ระดับ” = พนักงานประเภทนี้ต้องมีกลุ่มและระดับ', 'ติ๊ก “รอบแจ้งรายวัน” = แจ้งประกันรอบวันที่ 6'],
    needs: 'บริษัท',
  },
  groups: {
    step: 3,
    title: 'กลุ่ม / ฝ่าย',
    what: 'ฝ่ายของพนักงานประเภทที่ใช้ระดับ (เช่น ส่วนกลาง: Support Line, ฝ่ายขาย)',
    uses: ['พนักงานประเภทนั้นต้องเลือกกลุ่ม/ฝ่าย', 'กฎชุดฟอร์มแยกจำนวนตามกลุ่ม/ฝ่ายได้', 'นำเข้า Excel จับคู่ “ฝ่าย” ในไฟล์กับรายการนี้'],
    needs: 'ประเภทที่ติ๊ก “กลุ่ม/ฝ่าย + ระดับ” (ถ้าไม่มีประเภทแบบนั้น ข้ามขั้นนี้ได้)',
  },
  sites: {
    step: 4,
    title: 'หน่วยงาน',
    what: 'สำนักงาน / โครงการ / ไซต์ ที่พนักงานประจำอยู่ — พนักงานทุกคนต้องสังกัด 1 หน่วยงาน',
    uses: [
      'เป็น<b>แผนกในระบบสต็อก Uniform</b> — ใบเบิกชุดฟอร์มไปรอผู้อนุมัติของหน่วยงาน และลงค่าใช้จ่ายที่หน่วยงาน (ระบบส่งให้สต็อกเองทุกครั้งที่บันทึก)',
      '<b>ได้รับประกันกลุ่ม</b> ใช้กับกฎประกันที่ติ๊ก “เฉพาะหน่วยงานที่ได้รับประกันกลุ่ม” (เช่น แม่บ้าน CNS) — ประเภทอื่นไม่ดูช่องนี้',
      '<b>สีโปโล</b> ใช้กับกฎชุดฟอร์มที่ตั้ง “สีตามหน่วยงาน” (Pro Site)',
      '<b>ชุดฟอร์ม</b> ตั้งจำนวนเฉพาะหน่วยงานนี้ได้ (ทับกฎกลาง) — ไม่ตั้ง = ตามกฎกลาง',
      'นำเข้า Excel จับคู่ “ชื่อหน่วยงาน” ในไฟล์กับชื่อนี้',
    ],
    needs: 'บริษัท (เลือกตอนเพิ่ม — สร้างแล้วย้ายบริษัทไม่ได้)',
  },
};

const KEY = (tab) => `hl-org-about:${tab}`;
const hidden = (tab) => {
  try {
    return localStorage.getItem(KEY(tab)) === 'hidden';
  } catch {
    return false;
  }
};

/** กล่องอธิบายของแท็บ (ซ่อนได้ — จำต่อเบราว์เซอร์) */
export function aboutBox(tab) {
  const a = ABOUT[tab];
  if (!a) return '';
  if (hidden(tab)) {
    return html`<div class="org-about-mini"><button type="button" class="btn btn-ghost btn-sm" data-about-show="${tab}">${raw(icon('info'))} ${a.title} คืออะไร / ใช้ทำอะไร</button></div>`;
  }
  return html`<section class="org-about" aria-label="${a.title} คืออะไร">
    <span class="org-about-step num">${a.step}</span>
    <div class="grow">
      <b>${a.title}</b> — ${a.what}
      <ul>${a.uses.map((u) => html`<li>${raw(u)}</li>`)}</ul>
      <small class="muted">ต้องมีก่อน: ${a.needs}</small>
    </div>
    <button type="button" class="btn-icon sm" data-about-hide="${tab}" title="ซ่อนคำอธิบาย" aria-label="ซ่อนคำอธิบาย">${raw(icon('x'))}</button>
  </section>`;
}

/** ผูกปุ่มซ่อน/แสดงคำอธิบาย — redraw() วาดกล่องใหม่ */
export function wireAbout(el, redraw) {
  el.addEventListener('click', (e) => {
    const h = e.target.closest('[data-about-hide]');
    const s = e.target.closest('[data-about-show]');
    if (!h && !s) return;
    try {
      if (h) localStorage.setItem(KEY(h.dataset.aboutHide), 'hidden');
      else localStorage.removeItem(KEY(s.dataset.aboutShow));
    } catch {
      /* ใช้ไม่ได้ — แสดงตลอด */
    }
    redraw();
  });
}

// ===================== แท็บเริ่มต้นตั้งค่า =====================
const settle = async (p) => {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: e };
  }
};

/** ข้อมูลที่ใช้คำนวณสถานะ (ทุกตัวพลาดได้ — เช่น ไม่มีสิทธิ์ / ยังไม่รัน migration) */
async function loadData() {
  const [companies, types, groups, sites, insurers, rules, employees] = await Promise.all([
    settle(api.listCompanies({ usage: true })),
    settle(api.listEmployeeTypes({ usage: true })),
    settle(api.listDeptGroups()),
    settle(api.listSites()),
    settle(api.listInsurers()),
    settle(api.getRules()),
    settle(api.listEmployees({})),
  ]);
  return { companies, types, groups, sites, insurers, rules, employees };
}

const plural = (list, n = 4) => list.slice(0, n).join(', ') + (list.length > n ? ` และอีก ${list.length - n}` : '');

/**
 * สถานะของแต่ละขั้น: state = done | warn | todo | optional | unknown · lines = สิ่งที่เห็น / สิ่งที่ขาด
 * @returns {{id, title, what, state, lines: string[], go: {label, tab?, href?}, needs: string}[]}
 */
export function setupSteps(d) {
  const val = (r, fallback) => (r.ok ? r.value : fallback);
  const companies = val(d.companies, []);
  const types = val(d.types, employeeTypeList());
  const groups = val(d.groups, []);
  const sites = val(d.sites, []);
  const forms = val(d.insurers, []);
  const rules = val(d.rules, { insurance: [], uniform: [] });
  const emps = val(d.employees, []);
  const active = emps.filter((e) => e.status === 'ACTIVE');
  const steps = [];

  // 1 บริษัท
  {
    const noLegal = companies.filter((c) => !c.legalName).map((c) => c.code);
    steps.push({
      id: 'companies',
      state: !d.companies.ok ? 'unknown' : !companies.length ? 'todo' : noLegal.length ? 'warn' : 'done',
      lines: [
        companies.length ? `${companies.length} บริษัท: ${plural(companies.map((c) => c.code), 8)}` : 'ยังไม่มีบริษัท',
        ...(noLegal.length ? [`ยังไม่ใส่ชื่อตามทะเบียน: ${plural(noLegal)} — ใช้ในไฟล์แจ้งประกัน`] : []),
      ],
      go: { label: 'ตั้งบริษัท', tab: 'companies' },
    });
  }
  // 2 ประเภท
  steps.push({
    id: 'types',
    state: !types.length ? 'todo' : 'done',
    lines: [`${types.length} ประเภท: ${plural(types.map((t) => t.name), 6)}`],
    go: { label: 'ตั้งประเภทพนักงาน', tab: 'types' },
  });
  // 3 กลุ่ม/ฝ่าย — จำเป็นเฉพาะเมื่อมีประเภทที่ใช้กลุ่ม/ฝ่าย
  {
    const need = types.filter((t) => t.usesDeptGroup).map((t) => t.name);
    steps.push({
      id: 'groups',
      state: !need.length ? 'optional' : !d.groups.ok ? 'unknown' : groups.length ? 'done' : 'todo',
      lines: need.length
        ? [groups.length ? `${groups.length} กลุ่ม: ${plural(groups.map((g) => g.name), 5)}` : 'ยังไม่มีกลุ่ม / ฝ่าย', `ใช้กับประเภท: ${need.join(', ')}`]
        : ['ไม่มีประเภทที่ใช้กลุ่ม/ฝ่าย — ข้ามขั้นนี้ได้'],
      go: { label: 'ตั้งกลุ่ม / ฝ่าย', tab: 'groups' },
    });
  }
  // 4 หน่วยงาน — ทุกบริษัทควรมีอย่างน้อย 1 หน่วยงาน (ไม่งั้นเพิ่มพนักงานของบริษัทนั้นไม่ได้)
  {
    const empty = companies.filter((c) => !sites.some((s) => s.companyCode === c.code)).map((c) => c.code);
    steps.push({
      id: 'sites',
      state: !d.sites.ok ? 'unknown' : !sites.length ? 'todo' : empty.length ? 'warn' : 'done',
      lines: [
        sites.length ? `${sites.length} หน่วยงาน ใน ${new Set(sites.map((s) => s.companyCode)).size} บริษัท` : 'ยังไม่มีหน่วยงาน',
        ...(empty.length ? [`บริษัทที่ยังไม่มีหน่วยงาน: ${plural(empty)} — เพิ่มพนักงานของบริษัทนี้ไม่ได้`] : []),
      ],
      go: { label: 'ตั้งหน่วยงาน', tab: 'sites' },
    });
  }
  // 5 แบบฟอร์มประกัน + ผูกบริษัท — บริษัทที่มีพนักงานแต่ยังไม่ผูก = ไม่อยู่ในไฟล์แจ้งประกัน
  {
    const bound = new Set(forms.flatMap((f) => (f.companies ?? []).map((c) => c.companyCode)));
    const unbound = companies.filter((c) => !bound.has(c.code) && active.some((e) => e.companyCode === c.code)).map((c) => c.code);
    steps.push({
      id: 'insurers',
      state: !d.insurers.ok ? 'unknown' : !forms.length ? 'todo' : unbound.length ? 'warn' : 'done',
      lines: d.insurers.ok
        ? [
            forms.length ? `${forms.length} บริษัทประกัน: ${plural(forms.map((f) => f.shortName))}` : 'ยังไม่มีแบบฟอร์มบริษัทประกัน',
            ...(unbound.length ? [`บริษัทที่มีพนักงานแต่ยังไม่ผูกบริษัทประกัน: ${plural(unbound)} — ไม่อยู่ในไฟล์แจ้งประกัน`] : []),
          ]
        : ['ดูไม่ได้ — บัญชีนี้ไม่มีสิทธิ์หน้าแบบฟอร์มประกัน'],
      go: { label: 'ไปแบบฟอร์มประกัน', href: 'insurers.html' },
    });
  }
  // 6 เงื่อนไขสวัสดิการ — ประเภท × บริษัท ที่มีพนักงานแต่ไม่มีกฎ = ไม่ได้สิทธิ์
  {
    const covered = (list, t, c) => list.some((r) => r.employeeType === t && (r.companies === null || r.companies.includes(c)));
    const gaps = (list) => {
      const out = [];
      for (const t of types) {
        for (const c of companies.map((x) => x.code).filter((code) => typesFor(code).includes(t.code))) {
          if (active.some((e) => e.employeeType === t.code && e.companyCode === c) && !covered(list, t.code, c)) out.push(`${EMPLOYEE_TYPE_LABEL[t.code] ?? t.name} · ${c}`);
        }
      }
      return out;
    };
    const ins = gaps(rules.insurance ?? []);
    const uni = gaps(rules.uniform ?? []);
    steps.push({
      id: 'rules',
      state: !d.rules.ok ? 'unknown' : !(rules.insurance?.length || rules.uniform?.length) ? 'todo' : ins.length || uni.length ? 'warn' : 'done',
      lines: [
        `กฎประกันกลุ่ม ${rules.insurance?.length ?? 0} ข้อ · กฎชุดฟอร์ม ${rules.uniform?.length ?? 0} ข้อ`,
        ...(ins.length ? [`มีพนักงานแต่ไม่มีกฎประกัน: ${plural(ins, 3)}`] : []),
        ...(uni.length ? [`มีพนักงานแต่ไม่มีกฎชุดฟอร์ม (ไม่ได้ชุด — ถ้าตั้งใจ ข้ามได้): ${plural(uni, 3)}`] : []),
      ],
      go: { label: 'ไปเงื่อนไขสวัสดิการ', href: 'rules.html' },
    });
  }
  // 7 ชุดฟอร์มเฉพาะหน่วยงาน — ไม่บังคับ
  {
    const custom = sites.filter((s) => (s.uniformOverrides ?? []).length).length;
    steps.push({
      id: 'site-uniform',
      state: 'optional',
      lines: [custom ? `${custom} หน่วยงานตั้งจำนวนเอง · ที่เหลือใช้ตามกฎกลาง` : 'ทุกหน่วยงานใช้ตามกฎกลาง — ตั้งเฉพาะหน่วยงานที่ได้ไม่เท่ากฎ'],
      go: { label: 'ตั้งที่คอลัมน์ “ชุดฟอร์ม”', tab: 'sites' },
    });
  }
  // 8 ผู้ใช้ HR บริษัท — ไม่บังคับ · ต้องมีบริษัทก่อน
  steps.push({
    id: 'users',
    state: 'optional',
    lines: ['บัญชีบทบาท “HR บริษัท” ต้องเลือกบริษัทที่ดูแล — เห็นและทำรายการเฉพาะบริษัทนั้น'],
    go: can('users.manage') ? { label: 'ไปผู้ใช้ระบบ', href: 'admin.html?tab=users' } : null,
  });
  // 9 พนักงาน — ตรวจที่ยังไม่ครบ
  {
    const noSite = active.filter((e) => !e.siteId).length;
    const noGroup = active.filter((e) => typeInfo(e.employeeType)?.usesDeptGroup && !e.deptGroup).length;
    steps.push({
      id: 'employees',
      state: !d.employees.ok ? 'unknown' : !emps.length ? 'todo' : noSite || noGroup ? 'warn' : 'done',
      lines: [
        `ทำงานอยู่ ${active.length.toLocaleString('th-TH')} คน (ทั้งหมด ${emps.length.toLocaleString('th-TH')})`,
        ...(noSite ? [`ยังไม่มีหน่วยงาน ${noSite} คน`] : []),
        ...(noGroup ? [`ยังไม่มีกลุ่ม/ฝ่าย ${noGroup} คน`] : []),
      ],
      go: { label: 'ไปพนักงาน', href: 'employees.html' },
    });
  }
  return steps;
}

/** ข้อความของขั้นที่ไม่ได้อยู่ใน ABOUT (อยู่หน้าอื่น) */
const EXTRA = {
  insurers: { title: 'แบบฟอร์มประกัน + ผูกบริษัท', what: 'ไฟล์ Excel ของแต่ละบริษัทประกัน และบริษัทในเครือไหนส่งแจ้งกับใคร พร้อมเลขกรมธรรม์', needs: 'บริษัท' },
  rules: { title: 'เงื่อนไขสวัสดิการ', what: 'ใครได้ประกันกลุ่มเมื่อไร และได้ชุดฟอร์มอะไรกี่ตัวในแต่ละรอบ — แยกตามประเภท บริษัท กลุ่ม/ฝ่าย ระดับ', needs: 'บริษัท · ประเภท · กลุ่ม/ฝ่าย' },
  'site-uniform': { title: 'ชุดฟอร์มเฉพาะหน่วยงาน', what: 'หน่วยงานที่ได้จำนวนชุดไม่เท่ากฎกลาง (เช่น ไซต์ที่ได้เสื้อช่าง 2 + โปโล 1)', needs: 'หน่วยงาน · กฎชุดฟอร์ม' },
  users: { title: 'ผู้ใช้ HR บริษัท', what: 'บัญชีที่ดูแลเฉพาะบางบริษัท', needs: 'บริษัท' },
  employees: { title: 'พนักงาน', what: 'เพิ่มในตาราง หรือนำเข้า Excel (ไฟล์เข้าใหม่/ลาออก ของ HR หรือไฟล์รายชื่อ) — ระบบคำนวณสิทธิให้เอง', needs: 'ทุกขั้นก่อนหน้า' },
};
const STATE = {
  done: { label: 'เรียบร้อย', tone: 'success' },
  warn: { label: 'ควรตรวจ', tone: 'warning' },
  todo: { label: 'ยังไม่ได้ทำ', tone: 'danger' },
  optional: { label: 'ไม่บังคับ', tone: 'neutral' },
  unknown: { label: 'ดูไม่ได้', tone: 'neutral' },
};

function stepCard(s, i) {
  const meta = ABOUT[s.id] ?? EXTRA[s.id];
  const st = STATE[s.state];
  return html`<li class="setup-step is-${s.state}">
    <span class="setup-num" aria-hidden="true">${s.state === 'done' ? raw(icon('check')) : i + 1}</span>
    <div class="setup-body">
      <div class="setup-head">
        <b>${meta.title}</b>
        ${badge(st.label, st.tone)}
      </div>
      <p class="setup-what">${meta.what}</p>
      <ul class="setup-lines">${s.lines.map((l) => html`<li>${l}</li>`)}</ul>
      <small class="muted">ต้องมีก่อน: ${meta.needs}</small>
    </div>
    ${s.go
      ? s.go.tab
        ? html`<button type="button" class="btn btn-sm ${s.state === 'todo' || s.state === 'warn' ? 'btn-primary' : ''}" data-go-tab="${s.go.tab}">${s.go.label} ${raw(icon('chevron-right'))}</button>`
        : html`<a class="btn btn-sm ${s.state === 'todo' || s.state === 'warn' ? 'btn-primary' : ''}" href="${s.go.href}">${s.go.label} ${raw(icon('chevron-right'))}</a>`
      : html`<span></span>`}
  </li>`;
}

/** วาดแท็บเริ่มต้นตั้งค่าใน el · onGo(tab) = ไปแท็บของหน้านี้ */
export async function showSetup(el, onGo) {
  render(el, loader({ text: 'กำลังตรวจการตั้งค่า' }));
  let steps;
  try {
    steps = setupSteps(await loadData());
  } catch (e) {
    render(el, html`<div class="panel-pad">${errorState(e)}</div>`);
    return;
  }
  const must = steps.filter((s) => s.state !== 'optional' && s.state !== 'unknown');
  const done = must.filter((s) => s.state === 'done').length;
  const next = steps.find((s) => s.state === 'todo' || s.state === 'warn');
  render(
    el,
    html`<div class="setup">
      <div class="setup-intro">
        <div>
          <h2>ตั้งค่าตามลำดับนี้</h2>
          <p class="muted">ขั้นหลังใช้ข้อมูลของขั้นก่อน — ทำจากบนลงล่าง · สถานะคำนวณจากข้อมูลจริงทุกครั้งที่เปิดแท็บนี้</p>
        </div>
        <div class="setup-progress" title="ขั้นที่จำเป็นที่เรียบร้อยแล้ว">
          <b class="num">${done}/${must.length}</b>
          <span class="progress"><span style="width:${must.length ? (done / must.length) * 100 : 0}%"></span></span>
          <small class="muted">${next ? `ถัดไป: ${(ABOUT[next.id] ?? EXTRA[next.id]).title}` : 'ครบทุกขั้นที่จำเป็นแล้ว'}</small>
        </div>
      </div>
      <ol class="setup-steps">${steps.map(stepCard)}</ol>
    </div>`,
  );
  el.querySelectorAll('[data-go-tab]').forEach((b) => (b.onclick = () => onGo(b.dataset.goTab)));
}
