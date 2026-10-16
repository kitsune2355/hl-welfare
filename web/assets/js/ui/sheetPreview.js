// แสดงชีต Excel (grid จาก app/excelTemplate.js → gridFromWorksheet) เป็นตาราง HTML
//   - ส่วนของแบบฟอร์มระบายสี: ส่วนบน · หัวตาราง · แถวข้อมูล · ส่วนท้าย
//   - แถว "ข้อมูล" เหนือหัวคอลัมน์: แต่ละคอลัมน์ใส่ข้อมูลอะไร (คลิกเพื่อเลือก)
//   - เซลล์ที่ระบบเติมให้ (เลขกรมธรรม์ เดือน ฯลฯ) ไฮไลต์ + แสดงข้อมูลที่จะใส่
//   - แถวข้อมูลตัวอย่างในไฟล์ยาว ๆ ย่อเหลือ 3 แถว
import { esc, html, raw } from '../shared/dom.js';

const colLetter = (n) => {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const cellAddr = (r, c) => `${colLetter(c)}${r}`;

/**
 * @param {*} grid
 * @param {{
 *   layout?: {headerRow:number, headerEnd:number, dataRow:number, footerRow:number} | null,
 *   columns?: Record<number, {label:string, only?:string, blank?:boolean}>,   ป้ายข้อมูลของแต่ละคอลัมน์
 *   cells?: Record<string, string>,      ข้อความ HTML ของเซลล์ที่ระบบเติม (แทนข้อความเดิม)
 *   selected?: {col?:number, addr?:string},
 *   showSample?: number,                 แถวข้อมูลตัวอย่างที่แสดง (ที่เหลือย่อ)
 *   maxRows?: number,
 *   interactive?: boolean,
 *   sampleNote?: string,
 * }} o
 */
export function sheetPreviewHtml(grid, o = {}) {
  const L = o.layout ?? null;
  const showSample = o.showSample ?? 3;
  const maxRows = Math.min(grid.nRows, o.maxRows ?? 120);
  const nCols = grid.nCols;
  const region = (r) => (!L ? '' : r < L.headerRow ? 'top' : r <= L.headerEnd ? 'head' : r < L.dataRow ? 'top' : r < L.footerRow ? 'data' : 'foot');
  // แถวที่ซ่อน: ข้อมูลตัวอย่างเกิน showSample แถว
  const hidden = new Set();
  if (L) for (let r = L.dataRow + showSample; r < L.footerRow; r++) hidden.add(r);
  const visible = [];
  for (let r = 1; r <= maxRows; r++) if (!hidden.has(r)) visible.push(r);
  const span = new Map();
  const covered = new Set();
  for (const m of grid.merges) {
    const rows = visible.filter((r) => r >= m.top && r <= m.bottom);
    if (!rows.length) continue;
    span.set(`${rows[0]},${m.left}`, { rs: rows.length, cs: m.right - m.left + 1 });
    for (const r of rows) for (let c = m.left; c <= m.right; c++) if (r !== rows[0] || c !== m.left) covered.add(`${r},${c}`);
  }
  const sel = o.selected ?? {};
  const head = html`<tr class="sp-letters">
      <th class="sp-corner"></th>
      ${Array.from({ length: nCols }, (_, i) => html`<th class="sp-cl${sel.col === i + 1 ? ' sel' : ''}" ${o.interactive ? raw(`data-col="${i + 1}"`) : ''}>${colLetter(i + 1)}</th>`)}
    </tr>
    ${o.columns
      ? html`<tr class="sp-map">
          <th class="sp-corner sp-map-label">ข้อมูล</th>
          ${Array.from({ length: nCols }, (_, i) => {
            const m = o.columns[i + 1];
            return html`<th class="${sel.col === i + 1 ? 'sel' : ''}" ${o.interactive ? raw(`data-col="${i + 1}"`) : ''}>
              ${m ? html`<span class="sp-chip${m.blank ? ' blank' : ''}" title="${m.label}">${m.label}${m.only ? html`<i>${m.only === 'IN' ? 'เข้า' : 'ออก'}</i>` : ''}</span>` : ''}
            </th>`;
          })}
        </tr>`
      : ''}`;
  const rows = [];
  for (const r of visible) {
    const reg = region(r);
    const tds = [];
    for (let c = 1; c <= nCols; c++) {
      if (covered.has(`${r},${c}`)) continue;
      const a = cellAddr(r, c);
      const sp = span.get(`${r},${c}`);
      const st = grid.style(r, c);
      const auto = o.cells?.[a];
      // ข้อความยาวในเซลล์เดี่ยวที่ไม่ตัดบรรทัด → ล้นไปทับเซลล์ว่างทางขวา (เหมือน Excel)
      const spill = !sp && !st.wrap && (auto !== undefined || grid.text(r, c)) && c < nCols && !grid.text(r, c + 1) && !covered.has(`${r},${c + 1}`);
      const cls = ['sp-td', spill ? 'spill' : '', st.bold ? 'b' : '', st.align === 'center' ? 'c' : st.align === 'right' ? 'r' : '', st.border ? 'bd' : '', st.wrap ? 'wr' : '', auto !== undefined ? 'auto' : '', sel.addr === a ? 'sel' : '', sel.col === c && reg === 'data' ? 'selcol' : ''].filter(Boolean).join(' ');
      const style = [st.fill ? `background:${st.fill}` : '', st.size && st.size > 11 ? `font-size:${Math.min(16, Math.round(st.size * 0.95))}px` : ''].filter(Boolean).join(';');
      const body = auto !== undefined ? raw(auto) : raw(esc(grid.text(r, c)).replace(/\n/g, '<br>'));
      tds.push(
        html`<td class="${cls}" ${o.interactive ? raw(`data-addr="${a}" data-c="${c}" data-r="${r}"`) : ''} ${sp?.rs > 1 ? raw(`rowspan="${sp.rs}"`) : ''} ${sp?.cs > 1 ? raw(`colspan="${sp.cs}"`) : ''} style="${style}">${body}</td>`,
      );
    }
    rows.push(html`<tr class="sp-row ${reg}"><th class="sp-rn ${reg}">${r}</th>${tds}</tr>`);
    if (L && r === L.dataRow + showSample - 1 && hidden.size) {
      rows.push(html`<tr class="sp-row data sp-more"><th class="sp-rn data">⋮</th><td colspan="${nCols}">อีก ${hidden.size} แถว${o.sampleNote ? ` — ${o.sampleNote}` : ''}</td></tr>`);
    }
  }
  // table-layout: fixed ใช้ได้เมื่อกำหนดความกว้างตาราง → ความกว้างคอลัมน์ตามไฟล์จริง
  const px = Array.from({ length: nCols }, (_, i) => Math.max(28, Math.round(Math.min(grid.widths[i] || 9, 80) * 7.2)));
  return html`<table class="sp${o.interactive ? ' interactive' : ''}" style="width:${38 + px.reduce((s, w) => s + w, 0)}px">
    <colgroup>
      <col style="width:38px" />
      ${px.map((w) => html`<col style="width:${w}px" />`)}
    </colgroup>
    <thead>
      ${head}
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

export { cellAddr, colLetter };
