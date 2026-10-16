// หน้า: หน่วยงาน (sites.html) — ตาราง Excel เพิ่ม/แก้/ลบ
import { api } from '../app/api.js';
import { initPage } from '../app/shell.js';
import { $, html, render } from '../shared/dom.js';
import { COMPANY_CODES } from '../shared/labels.js';
import { badge, emptyState, errorState } from '../ui/components.js';
import { ExcelGrid } from '../ui/datagrid.js';

initPage('sites');

const POLO = {
  BLACK: { label: 'ดำ', swatch: '#111827' },
  NAVY: { label: 'น้ำเงิน', swatch: '#1e3a8a' },
};

const sortSites = (list) => [...list].sort((a, b) => COMPANY_CODES.indexOf(a.companyCode) - COMPANY_CODES.indexOf(b.companyCode) || a.id - b.id);

function drawSummary() {
  const n = grid.getRows().filter((s) => !s.hasGroupInsurance).length;
  render($('#summary'), badge(`ไม่ได้รับประกัน ${n} หน่วยงาน`, n ? 'warning' : 'success'));
}

const grid = new ExcelGrid($('#grid'), {
  rowKey: (s) => s.id,
  addLabel: 'เพิ่มหน่วยงาน',
  newRow: () => ({ id: 0, companyCode: 'HL', name: '', hasGroupInsurance: true, poloColor: 'BLACK' }),
  validate: (s) => (s.name.trim() ? {} : { name: 'กรุณาระบุชื่อหน่วยงาน' }),
  columns: [
    {
      key: 'companyCode',
      header: 'บริษัท',
      width: 100,
      required: true,
      editor: 'select',
      // หน่วยงานที่สร้างแล้วย้ายบริษัทไม่ได้ (พนักงานผูกอยู่) — เลือกได้ตอนสร้างเท่านั้น
      editable: (s) => s.id === 0,
      value: (s) => s.companyCode,
      options: () => COMPANY_CODES.map((c) => ({ value: c, label: c })),
      set: (s, v) => ({ ...s, companyCode: String(v) }),
    },
    { key: 'name', header: 'ชื่อหน่วยงาน', width: 320, required: true, editor: 'text', value: (s) => s.name, set: (s, v) => ({ ...s, name: String(v ?? '').trim() }) },
    {
      key: 'hasGroupInsurance',
      header: 'ได้รับประกันกลุ่ม',
      width: 150,
      align: 'center',
      editor: 'switch',
      value: (s) => s.hasGroupInsurance,
      set: (s, v) => ({ ...s, hasGroupInsurance: !!v }),
    },
    {
      key: 'poloColor',
      header: 'สีโปโล',
      width: 130,
      editor: 'select',
      value: (s) => s.poloColor,
      display: (s) => html`<span class="row"><span class="swatch" style="background:${POLO[s.poloColor].swatch}"></span>${POLO[s.poloColor].label}</span>`,
      options: () => Object.entries(POLO).map(([value, p]) => ({ value, label: p.label })),
      set: (s, v) => ({ ...s, poloColor: v === 'NAVY' ? 'NAVY' : 'BLACK' }),
    },
  ],
  onSave: async (row, isNew) => {
    let saved;
    if (isNew) {
      const { id: _id, ...input } = row;
      saved = await api.createSite(input);
    } else {
      saved = await api.updateSite(row.id, { name: row.name, hasGroupInsurance: row.hasGroupInsurance, poloColor: row.poloColor });
    }
    return saved;
  },
  // ลบจริงตอนกดบันทึก — ลบได้เฉพาะหน่วยงานที่ไม่มีพนักงานอยู่ (API แจ้งเหตุผลถ้าลบไม่ได้)
  onRemove: (s) => api.deleteSite(s.id),
  rowLabel: (s) => `${s.companyCode} · ${s.name}`,
  onSaved: () => drawSummary(),
  empty: emptyState({ iconName: 'building-2', title: 'ยังไม่มีหน่วยงาน' }),
});

try {
  grid.setRows(sortSites(await api.listSites()));
  drawSummary();
} catch (e) {
  render($('#grid'), html`<div style="padding:16px">${errorState(e)}</div>`);
}
