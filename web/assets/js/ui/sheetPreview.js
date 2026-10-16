// แสดงชีต Excel (grid จาก app/excelTemplate.js → gridFromWorksheet) เป็นตาราง HTML ให้หน้าตาใกล้ Excel
//   - สีพื้น สีตัวอักษร ตัวหนา/เอียง/ขีดเส้นใต้ เส้นขอบแต่ละด้าน ความกว้างคอลัมน์ ความสูงแถว
//   - รูปภาพ / กล่องข้อความ / รูปทรง วางทับตามตำแหน่งในไฟล์ (วางหลังแสดงผล — วัดตำแหน่งแถวจริง)
//   - ส่วนของแบบฟอร์มระบายสี (เซลล์ที่ไม่มีสีพื้นในไฟล์): ส่วนบน · หัวตาราง · แถวข้อมูล · ส่วนท้าย
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

const PT_PX = 4 / 3;
const EDGE = {
  thin: '1px solid',
  hair: '1px dotted',
  dotted: '1px dotted',
  dashed: '1px dashed',
  dashDot: '1px dashed',
  dashDotDot: '1px dashed',
  medium: '2px solid',
  mediumDashed: '2px dashed',
  mediumDashDot: '2px dashed',
  mediumDashDotDot: '2px dashed',
  slantDashDot: '2px dashed',
  thick: '3px solid',
  double: '3px double',
};
const cssFont = (name) => (name ? `'${name.replace(/'/g, '')}', Tahoma, var(--font)` : '');

/** รูปแบบของเซลล์ → CSS inline */
function cellCss(st) {
  const out = [];
  if (st.fill) out.push(`background:${st.fill}`);
  if (st.color && st.color !== '#000000') out.push(`color:${st.color}`);
  if (st.italic) out.push('font-style:italic');
  if (st.underline || st.strike) out.push(`text-decoration:${[st.underline ? 'underline' : '', st.strike ? 'line-through' : ''].filter(Boolean).join(' ')}`);
  if (st.font) out.push(`font-family:${cssFont(st.font)}`);
  if (st.size) out.push(`font-size:${Math.max(8, Math.min(28, Math.round(st.size * PT_PX * 10) / 10))}px`);
  if (st.valign) out.push(`vertical-align:${st.valign === 'middle' ? 'middle' : st.valign === 'top' ? 'top' : 'bottom'}`);
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const e = st.edges?.[side];
    if (e) out.push(`border-${side}:${EDGE[e.style] ?? '1px solid'} ${e.color}`);
  }
  return out.join(';');
}

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
  watchDrawings();
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
  const rowPx = (r) => Math.max(4, Math.round((grid.heights?.[r - 1] || 15) * PT_PX));
  const span = new Map();
  const covered = new Set();
  for (const m of grid.merges) {
    const rows = visible.filter((r) => r >= m.top && r <= m.bottom);
    if (!rows.length) continue;
    span.set(`${rows[0]},${m.left}`, { rs: rows.length, cs: m.right - m.left + 1, h: rows.reduce((s, r) => s + rowPx(r), 0), fixed: rows.every((r) => grid.fixedRows?.[r - 1]) });
    for (const r of rows) for (let c = m.left; c <= m.right; c++) if (r !== rows[0] || c !== m.left) covered.add(`${r},${c}`);
  }
  const sel = o.selected ?? {};
  const hid = (c) => !!grid.hiddenCols?.[c - 1];
  const head = html`<tr class="sp-letters">
      <th class="sp-corner"></th>
      ${Array.from({ length: nCols }, (_, i) => html`<th class="sp-cl${sel.col === i + 1 ? ' sel' : ''}${hid(i + 1) ? ' hid' : ''}" ${o.interactive ? raw(`data-col="${i + 1}"`) : ''}>${hid(i + 1) ? '' : colLetter(i + 1)}</th>`)}
    </tr>
    ${o.columns
      ? html`<tr class="sp-map">
          <th class="sp-corner sp-map-label">ข้อมูล</th>
          ${Array.from({ length: nCols }, (_, i) => {
            const m = o.columns[i + 1];
            return html`<th class="${sel.col === i + 1 ? 'sel' : ''}${hid(i + 1) ? ' hid' : ''}" ${o.interactive ? raw(`data-col="${i + 1}"`) : ''}>
              ${m && !hid(i + 1) ? html`<span class="sp-chip${m.blank ? ' blank' : ''}" title="${m.label}">${m.label}${m.only ? html`<i>${m.only === 'IN' ? 'เข้า' : 'ออก'}</i>` : ''}</span>` : ''}
            </th>`;
          })}
        </tr>`
      : ''}`;
  const rows = [];
  for (const r of visible) {
    const reg = region(r);
    const tds = [];
    const h = rowPx(r);
    const fixed = !!grid.fixedRows?.[r - 1];
    for (let c = 1; c <= nCols; c++) {
      if (covered.has(`${r},${c}`)) continue;
      const a = cellAddr(r, c);
      const sp = span.get(`${r},${c}`);
      const st = grid.style(r, c);
      const auto = o.cells?.[a];
      // ข้อความยาวในเซลล์เดี่ยวที่ไม่ตัดบรรทัด → ล้นไปทับเซลล์ว่างทางขวา (เหมือน Excel)
      const spill = !sp && !st.wrap && (auto !== undefined || grid.text(r, c)) && c < nCols && !grid.text(r, c + 1) && !covered.has(`${r},${c + 1}`);
      const cls = ['sp-td', spill ? 'spill' : '', st.bold ? 'b' : '', st.align === 'center' || st.align === 'centerContinuous' ? 'c' : st.align === 'right' ? 'r' : '', st.border ? 'bd' : '', st.fill ? 'filled' : '', st.wrap ? 'wr' : '', auto !== undefined ? 'auto' : '', sel.addr === a ? 'sel' : '', sel.col === c && reg === 'data' ? 'selcol' : '', hid(c) ? 'hid' : ''].filter(Boolean).join(' ');
      const body = auto !== undefined ? raw(auto) : raw(esc(grid.text(r, c)).replace(/\n/g, '<br>'));
      // แถวที่กำหนดความสูงเอง: ตัดข้อความที่เกินความสูงแถว (เหมือน Excel)
      const clip = (sp ? sp.fixed : fixed) && auto === undefined && !spill ? `<div class="sp-clip" style="max-height:${Math.max(4, (sp?.h ?? h) - 3)}px">` : '';
      tds.push(
        html`<td class="${cls}" ${o.interactive ? raw(`data-addr="${a}" data-c="${c}" data-r="${r}"`) : ''} ${sp?.rs > 1 ? raw(`rowspan="${sp.rs}"`) : ''} ${sp?.cs > 1 ? raw(`colspan="${sp.cs}"`) : ''} style="${cellCss(st)}">${raw(clip)}${hid(c) ? '' : body}${raw(clip ? '</div>' : '')}</td>`,
      );
    }
    rows.push(html`<tr class="sp-row ${reg}" data-r="${r}" style="height:${h}px"><th class="sp-rn ${reg}">${r}</th>${tds}</tr>`);
    if (L && r === L.dataRow + showSample - 1 && hidden.size) {
      rows.push(html`<tr class="sp-row data sp-more"><th class="sp-rn data">⋮</th><td colspan="${nCols}">อีก ${hidden.size} แถว${o.sampleNote ? ` — ${o.sampleNote}` : ''}</td></tr>`);
    }
  }
  // table-layout: fixed ใช้ได้เมื่อกำหนดความกว้างตาราง → ความกว้างคอลัมน์ตามไฟล์จริง (หน่วย Excel ≈ 7px + ขอบ)
  const px = Array.from({ length: nCols }, (_, i) => (hid(i + 1) ? 4 : Math.max(8, Math.round(Math.min(grid.widths[i] || 9, 120) * 7 + 5))));
  const xs = [38];
  for (const w of px) xs.push(xs[xs.length - 1] + w);
  const drawings = (grid.drawings ?? []).filter((d) => d.from.row <= maxRows);
  return html`<div class="sp-canvas" data-xs="${xs.join(',')}">
    <table class="sp${o.interactive ? ' interactive' : ''}" style="width:${xs[xs.length - 1]}px">
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
    </table>
    ${drawings.map((d) => {
      const at = [d.from.row, d.from.col, d.from.rowOff, d.from.colOff, d.to?.row ?? '', d.to?.col ?? '', d.to?.rowOff ?? '', d.to?.colOff ?? '', d.size?.w ?? '', d.size?.h ?? ''].join(',');
      if (d.kind === 'pic') return html`<img class="sp-dr pic" data-at="${at}" src="${d.src}" alt="" />`;
      const style = [
        d.fill && d.fill !== 'none' ? `background:${d.fill}` : '',
        d.line === 'none' || !d.line ? 'border-color:transparent' : `border-color:${d.line}`,
        d.fontPx ? `font-size:${d.fontPx}px` : '',
        d.bold ? '' : 'font-weight:400',
        `text-align:${d.align === 'ctr' ? 'center' : d.align === 'r' ? 'right' : 'left'}`,
      ]
        .filter(Boolean)
        .join(';');
      return html`<div class="sp-dr shape" data-at="${at}" style="${style}">${d.text ?? ''}</div>`;
    })}
  </div>`;
}

// ---------- วางรูปภาพ/กล่องข้อความตามตำแหน่งแถว/คอลัมน์ที่แสดงจริง ----------
/** วางรูปภาพ/กล่องข้อความใน .sp-canvas (เรียกเองอัตโนมัติเมื่อมีตัวอย่างใหม่บนหน้า) */
export function placeDrawings(canvas) {
  canvas.dataset.placed = '1';
  const xs = canvas.dataset.xs.split(',').map(Number);
  const table = canvas.querySelector('table.sp');
  const top0 = table.offsetTop;
  const rowAt = new Map([...table.querySelectorAll('tr[data-r]')].map((tr) => [Number(tr.dataset.r), tr]));
  const x = (col, off) => (xs[col - 1] ?? xs[xs.length - 1]) + Math.min(off, (xs[col] ?? xs[col - 1]) - (xs[col - 1] ?? 0));
  const y = (row, off) => {
    const tr = rowAt.get(row);
    return tr ? top0 + tr.offsetTop + Math.min(off, tr.offsetHeight) : null;
  };
  for (const el of canvas.querySelectorAll('.sp-dr')) {
    const [r1, c1, ro1, co1, r2, c2, ro2, co2, w, h] = el.dataset.at.split(',').map((v) => (v === '' ? null : Number(v)));
    const left = x(c1, co1);
    const top = y(r1, ro1);
    if (top === null) {
      el.hidden = true; // อยู่ในแถวที่ย่อไว้
      continue;
    }
    const bottom = r2 !== null ? y(r2, ro2) : null;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${Math.max(4, c2 !== null ? x(c2, co2) - left : (w ?? 40))}px`;
    el.style.height = `${Math.max(4, bottom !== null ? bottom - top : (h ?? 20))}px`;
    el.hidden = false;
  }
}

let watching = false;
function watchDrawings() {
  if (watching || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  watching = true;
  let queued = false;
  const run = () => {
    queued = false;
    document.querySelectorAll('.sp-canvas:not([data-placed])').forEach(placeDrawings);
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }).observe(document.body, { childList: true, subtree: true });
}

export { cellAddr, colLetter };
