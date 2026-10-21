// เติมข้อมูลลงไฟล์ Excel ของบริษัทประกัน "ตัวจริง" — แก้เฉพาะ XML ของชีตที่ต้องเติม ส่วนอื่นของไฟล์คงเดิมทุกไบต์
// (สไตล์ ธีม รูปภาพ กล่องข้อความ แผนภูมิ หมายเหตุ ตั้งค่าหน้ากระดาษ ฯลฯ ไม่ถูกสร้างใหม่)
//
//   sanitizeXlsx(buffer, keep)   เก็บแบบฟอร์ม: เหลือเฉพาะชีตที่ใช้ · แถวข้อมูลตัวอย่างเหลือ 1 แถวว่าง · เซลล์ที่ระบบเติมเหลือแต่ป้าย
//                                ล้างข้อความที่ไม่ใช้ใน sharedStrings + ชื่อผู้สร้างไฟล์ (ไม่เก็บข้อมูลบุคคล)
//   fillXlsx(buffer, plan)       ส่งออก: ชีตสรุป + ชีตละบริษัท (สำเนาชีตต้นแบบ) · แถวข้อมูลตามจำนวนคน (สำเนาแถวต้นแบบ)
//                                ส่วนท้าย / merge / สูตร / พื้นที่พิมพ์ / ไฮไลต์ตามเงื่อนไข / รูปภาพ เลื่อนตาม
//
// แถว/คอลัมน์ 1-based แบบ Excel · layout = { dataRow, footerRow } (แถว dataRow..footerRow-1 = แถวข้อมูล ใช้แถวแรกเป็นต้นแบบ)
import { loadJsZip } from '../shared/excel.js';

const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = `${NS_R}/`;
const CT_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';

// ---------- ตัวช่วย XML ----------
const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const reAttr = (name) => new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`);
const attr = (tag, name) => {
  const m = tag.match(reAttr(name));
  return m ? unesc(m[1]) : null;
};
function setAttr(tag, name, value) {
  const re = reAttr(name);
  if (value === null || value === undefined) return tag.replace(re, '');
  if (re.test(tag)) return tag.replace(re, ` ${name}="${escXml(value)}"`);
  return tag.replace(/^<([\w:]+)/, `<$1 ${name}="${escXml(value)}"`);
}
const openTag = (xml) => xml.match(/^<[^>]*>/)[0];

const colNum = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
function colName(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
/** A1 / $A$1 / $1 / A → { colAbs, col, rowAbs, row } */
function parsePart(s) {
  const m = /^(\$?)([A-Z]{1,3})?(\$?)(\d+)?$/.exec(s);
  if (!m || (!m[2] && !m[4])) return null;
  return { colAbs: m[1], col: m[2] ?? '', rowAbs: m[3], row: m[4] ? Number(m[4]) : null };
}
const fmtPart = (p, row) => `${p.colAbs}${p.col}${p.row === null ? '' : `${p.rowAbs}${row}`}`;

// ---------- ตำแหน่งใหม่ของแถว/ช่วงเซลล์ ----------
/**
 * P = { dataRow, footerRow, n, delta }
 *   แถวก่อนแถวข้อมูล = เดิม · แถวส่วนท้าย = +delta · ช่วงที่ครอบแถวข้อมูล = ขยาย/หดตามจำนวนแถวใหม่
 */
function plan(layout, n) {
  const span = layout.footerRow - layout.dataRow;
  const delta = n - span;
  return { dataRow: layout.dataRow, footerRow: layout.footerRow, n, delta, row: (r) => (r >= layout.footerRow ? r + delta : r) };
}
const inData = (r, P) => r >= P.dataRow && r < P.footerRow;

/** ช่วงเดียว เช่น A1 · $A$1:$U$20 · $1:$10 → ช่วงใหม่ หรือ null (ช่วงหายไปทั้งหมด) */
function mapRange(text, P) {
  const [a, b] = text.split(':');
  const pa = parsePart(a);
  const pb = b === undefined ? null : parsePart(b);
  if (!pa || (b !== undefined && !pb)) return text;
  if (!pb) {
    if (pa.row === null) return text;
    const r = pa.row;
    const nr = r >= P.footerRow ? r + P.delta : inData(r, P) ? (r - P.dataRow < P.n ? r : P.dataRow) : r;
    return fmtPart(pa, nr);
  }
  if (pa.row === null || pb.row === null) return text; // ทั้งคอลัมน์
  const top = pa.row >= P.footerRow ? pa.row + P.delta : inData(pa.row, P) ? P.dataRow : pa.row;
  const bottom = pb.row >= P.footerRow ? pb.row + P.delta : inData(pb.row, P) ? P.dataRow + P.n - 1 : pb.row;
  if (bottom < top) return null;
  return `${fmtPart(pa, top)}:${fmtPart(pb, bottom)}`;
}
const mapRanges = (list, P) =>
  list
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => mapRange(x, P))
    .filter(Boolean)
    .join(' ');

// การอ้างเซลล์ในสูตร (ไม่รวมที่อ้างชีตอื่น "Sheet!A1" และชื่อฟังก์ชัน เช่น LOG10()
const REF_RE = /(^|[^A-Za-z0-9_.!'"$\]])(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)(?![A-Za-z0-9_(!])/g;
/** ใช้ fn กับการอ้างเซลล์นอกข้อความในเครื่องหมายคำพูด */
function mapFormula(f, fn) {
  return f
    .split('"')
    .map((seg, i) => (i % 2 ? seg : seg.replace(REF_RE, (_m, pre, ref) => pre + fn(ref))))
    .join('"');
}
/** สูตรในชีตที่แถวเลื่อน: อ้างส่วนท้าย +delta · ช่วงที่ครอบแถวข้อมูลขยายตามจำนวนแถว */
const shiftFormula = (f, P) => mapFormula(f, (ref) => mapRange(ref, P) ?? '#REF!');
/** คัดลอกสูตรลงแถวถัดไป (แบบ Excel): แถวที่ไม่ล็อก ($) +i */
const offsetFormula = (f, i) =>
  mapFormula(f, (ref) =>
    ref
      .split(':')
      .map((x) => {
        const p = parsePart(x);
        return p && p.row !== null && !p.rowAbs ? fmtPart(p, p.row + i) : x;
      })
      .join(':'),
  );

// ---------- ชีต: แยกแถว / เซลล์ ----------
function splitSheet(xml) {
  const open = xml.match(/<sheetData\b[^>]*?(\/?)>/);
  if (!open) throw new Error('อ่านโครงชีตในไฟล์ไม่ได้');
  const start = open.index + open[0].length;
  if (open[1]) return { head: xml.slice(0, open.index) + '<sheetData>', rows: [], tail: '</sheetData>' + xml.slice(start) };
  const end = xml.indexOf('</sheetData>', start);
  const body = xml.slice(start, end);
  const rows = [];
  let prev = 0;
  for (const m of body.matchAll(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)) {
    const r = Number(attr(openTag(m[0]), 'r')) || prev + 1;
    rows.push({ r, xml: m[0] });
    prev = r;
  }
  return { head: xml.slice(0, start), rows, tail: xml.slice(end) };
}
function cellsOf(rowXml) {
  if (/\/>$/.test(openTag(rowXml)) && !rowXml.includes('</row>')) return [];
  const out = [];
  let prev = 0;
  for (const m of rowXml.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
    const ref = attr(openTag(m[0]), 'r');
    const col = ref ? colNum(ref.replace(/\d+$/, '')) : prev + 1;
    out.push({ col, xml: m[0] });
    prev = col;
  }
  return out;
}
function buildRow(rowTag, r, cells) {
  const tag = setAttr(rowTag.replace(/\/>$/, '>'), 'r', String(r));
  return cells.length ? `${tag}${cells.map((c) => c.xml).join('')}</row>` : tag.replace(/>$/, '/>');
}
/** แถวที่เลขแถวใหม่ (เซลล์ทุกช่องเปลี่ยนเลขแถวตาม) — fx = แปลงสูตรในเซลล์ */
function renumberRow(rowXml, r, fx) {
  const cells = cellsOf(rowXml).map((c) => {
    let x = c.xml.replace(/^<c\b[^>]*>/, (t) => setAttr(t, 'r', `${colName(c.col)}${r}`));
    if (fx) x = x.replace(/(<f\b[^>]*>)([\s\S]*?)(<\/f>)/, (_m, a, f, b) => a + escXml(fx(unesc(f))) + b).replace(/<f\b[^>]*>/, (t) => (attr(t, 'ref') && fx.ref ? setAttr(t, 'ref', fx.ref(attr(t, 'ref'))) : t));
    return { col: c.col, xml: x };
  });
  return buildRow(openTag(rowXml), r, cells);
}
/** เซลล์ใหม่ (คงรูปแบบ s) — ตัวเลขเป็นตัวเลข · ข้อความเป็น inline string · ว่าง = เซลล์เปล่า */
function cellXml(ref, s, v) {
  const sa = s ? ` s="${s}"` : '';
  if (v === null || v === undefined || v === '') return `<c r="${ref}"${sa}/>`;
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${sa}><v>${v}</v></c>`;
  return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${escXml(v)}</t></is></c>`;
}
/** ใส่ค่าลงเซลล์ในแถว (สร้างเซลล์ถ้ายังไม่มี — ใช้รูปแบบของแถว/คอลัมน์) */
function setCell(rowXml, r, col, v, ctx) {
  const cells = cellsOf(rowXml);
  const i = cells.findIndex((c) => c.col === col);
  const s = i >= 0 ? attr(openTag(cells[i].xml), 's') : (attr(openTag(rowXml), 'customFormat') === '1' ? attr(openTag(rowXml), 's') : null) ?? ctx.colStyle(col);
  const value = ctx.glyph ? ctx.glyph(s, v) : v;
  const x = { col, xml: cellXml(`${colName(col)}${r}`, s, value) };
  if (i >= 0) cells[i] = x;
  else cells.splice(cells.filter((c) => c.col < col).length, 0, x);
  return buildRow(openTag(rowXml), r, cells);
}
/** ล้างค่าในแถว (คงรูปแบบ) — แถวข้อมูลตัวอย่างในไฟล์ที่อัปโหลด */
function clearRow(rowXml, r) {
  const cells = cellsOf(rowXml).map((c) => ({ col: c.col, xml: cellXml(`${colName(c.col)}${r}`, attr(openTag(c.xml), 's'), null) }));
  return buildRow(openTag(rowXml), r, cells);
}
function colStyles(head) {
  const cols = [...head.matchAll(/<col\b[^>]*>/g)].map((m) => ({ min: Number(attr(m[0], 'min')), max: Number(attr(m[0], 'max')), style: attr(m[0], 'style') }));
  return (c) => cols.find((x) => c >= x.min && c <= x.max)?.style ?? null;
}

/**
 * แปลงชีตต้นแบบ → ชีตที่มีแถวข้อมูล n แถว
 * @param {{dataRow:number, footerRow:number}} layout
 * @param {{n:number, clear?:boolean, rowValues?:(i:number)=>[number, any][], cells?:Record<string, any>, glyph?:Function, selected?:boolean}} o
 *   cells = ค่าที่จะเขียน (ตำแหน่งตามไฟล์ต้นแบบ — ส่วนท้ายเลื่อนให้) · '' = ล้างเซลล์
 */
function transformSheet(xml, layout, o) {
  const P = plan(layout, o.n);
  const { head, rows, tail } = splitSheet(xml);
  const ctx = { colStyle: colStyles(head), glyph: o.glyph };
  const fx = (f) => shiftFormula(f, P);
  fx.ref = (ref) => mapRanges(ref, P) || ref;
  const out = new Map();
  for (const row of rows) {
    if (row.r < P.dataRow) out.set(row.r, renumberRow(row.xml, row.r, fx));
    else if (row.r >= P.footerRow) out.set(row.r + P.delta, renumberRow(row.xml, row.r + P.delta, fx));
  }
  // แถวข้อมูล: สำเนาแถวต้นแบบ (แถวแรกของแถวข้อมูล) n แถว — สูตรในแถวเลื่อนตามแบบ Excel
  const tpl = rows.find((x) => x.r === P.dataRow)?.xml ?? `<row r="${P.dataRow}"/>`;
  const tplTag = openTag(tpl);
  for (let i = 0; i < o.n; i++) {
    const r = P.dataRow + i;
    const f = (x) => offsetFormula(x, i);
    let x = o.clear ? clearRow(tpl, r) : renumberRow(tpl, r, f).replace(/<f\b[^>]*\bt="shared"[^>]*\/>/g, '').replace(/(<f\b[^>]*?)\s(?:t="shared"|ref="[^"]*"|si="[^"]*")/g, '$1');
    for (const [col, v] of o.rowValues?.(i) ?? []) x = setCell(x, r, col, v, ctx);
    out.set(r, x);
  }
  // เซลล์ที่ระบบเติม (ตำแหน่งในส่วนท้ายเลื่อนตาม)
  for (const [a, v] of Object.entries(o.cells ?? {})) {
    const p = parsePart(a);
    if (!p?.col || p.row === null) continue;
    const r = P.row(p.row);
    out.set(r, setCell(out.get(r) ?? `<row r="${r}"/>`, r, colNum(p.col), v, ctx));
  }
  void tplTag;
  const body = [...out.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x).join('');

  // ส่วนหัวของชีต: ขนาดชีต (Excel คำนวณใหม่เอง) · แท็บที่เลือก · ตำแหน่ง cursor
  let h = head.replace(/<dimension\b[^>]*\/>/, '');
  h = h.replace(/<sheetView\b[^>]*>/g, (t, idx) => setAttr(t, 'tabSelected', o.selected && idx === h.indexOf('<sheetView') ? '1' : null));
  h = h.replace(/<(selection|pane)\b[^>]*>/g, (t) => {
    let x = t;
    for (const k of ['activeCell', 'topLeftCell']) if (attr(x, k)) x = setAttr(x, k, mapRange(attr(x, k), P) ?? 'A1');
    if (attr(x, 'sqref')) x = setAttr(x, 'sqref', mapRanges(attr(x, 'sqref'), P) || 'A1');
    return x;
  });

  // ส่วนท้ายของชีต: merge · ไฮไลต์ตามเงื่อนไข · data validation · ลิงก์ · ตัวแบ่งหน้า
  let t = tail.replace(/<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/, (_m, inner) => {
    const list = [];
    for (const m of inner.matchAll(/<mergeCell\b[^>]*>/g)) {
      const [a, b = a] = attr(m[0], 'ref').split(':');
      const pa = parsePart(a);
      const pb = parsePart(b);
      if (!pa?.row || !pb?.row) continue;
      if (pb.row < P.dataRow) list.push(`${a}:${b}`);
      else if (pa.row >= P.footerRow) list.push(`${fmtPart(pa, pa.row + P.delta)}:${fmtPart(pb, pb.row + P.delta)}`);
      else if (pa.row === P.dataRow && pb.row === P.dataRow) for (let i = 0; i < P.n; i++) list.push(`${fmtPart(pa, P.dataRow + i)}:${fmtPart(pb, P.dataRow + i)}`);
      else if (pa.row < P.dataRow && pb.row >= P.footerRow) list.push(`${a}:${fmtPart(pb, pb.row + P.delta)}`);
    }
    return list.length ? `<mergeCells count="${list.length}">${list.map((r) => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>` : '';
  });
  const dropEmpty = (tag) => (re) =>
    (t = t.replace(re, (el) => {
      const open = openTag(el);
      const k = tag === 'hyperlink' ? 'ref' : 'sqref';
      const v = mapRanges(attr(open, k) ?? '', P);
      return v ? el.replace(open, setAttr(open, k, v)) : '';
    }));
  dropEmpty('cf')(/<conditionalFormatting\b[^>]*>[\s\S]*?<\/conditionalFormatting>/g);
  dropEmpty('dv')(/<dataValidation\b[^>]*(?:\/>|>[\s\S]*?<\/dataValidation>)/g);
  dropEmpty('hyperlink')(/<hyperlink\b[^>]*\/>/g);
  t = t.replace(/<dataValidations\b[^>]*>\s*<\/dataValidations>/, '').replace(/(<dataValidations\b[^>]*?)\scount="\d+"/, '$1');
  t = t.replace(/(<formula\d?>)([\s\S]*?)(<\/formula\d?>)/g, (_m, a, f, b) => a + escXml(shiftFormula(unesc(f), P)) + b);
  t = t.replace(/<brk\b[^>]*>/g, (tag) => setAttr(tag, 'id', String(P.row(Number(attr(tag, 'id'))))));
  t = t.replace(/(<autoFilter\b[^>]*)/, (tag) => (attr(tag, 'ref') ? setAttr(tag, 'ref', mapRanges(attr(tag, 'ref'), P) || attr(tag, 'ref')) : tag));
  return { xml: h + body + t, P };
}

/** ตำแหน่งรูปภาพ/กล่องข้อความ (0-based) เลื่อนตามแถว */
function shiftAnchors(xml, P) {
  return xml.replace(/<((?:\w+:)?)(from|to)>([\s\S]*?)<\/\1\2>/g, (all, ns, tag, body) =>
    `<${ns}${tag}>${body.replace(/<((?:\w+:)?)row>(\d+)<\/\1row>/, (_m, p, r) => `<${p}row>${P.row(Number(r) + 1) - 1}</${p}row>`)}</${ns}${tag}>`,
  );
}

// ---------- package (zip) ----------
const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1);
const relsPath = (p) => `${dirOf(p)}_rels/${p.slice(p.lastIndexOf('/') + 1)}.rels`;
function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const out = [];
  for (const x of (dirOf(base) + target).split('/')) {
    if (x === '..') out.pop();
    else if (x !== '.' && x !== '') out.push(x);
  }
  return out.join('/');
}
function relativeTarget(from, to) {
  const a = dirOf(from).split('/').filter(Boolean);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

class Pkg {
  static async open(buffer) {
    const JSZip = await loadJsZip();
    const p = new Pkg();
    p.zip = await JSZip.loadAsync(buffer);
    return p;
  }
  async read(path) {
    const f = this.zip.file(path);
    return f ? f.async('string') : null;
  }
  write(path, s) {
    this.zip.file(path, s);
  }
  remove(path) {
    this.zip.remove(path);
  }
  has(path) {
    return !!this.zip.file(path);
  }
  async rels(path) {
    const xml = await this.read(relsPath(path));
    if (!xml) return [];
    return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
      const external = attr(m[0], 'TargetMode') === 'External';
      const target = attr(m[0], 'Target');
      return { id: attr(m[0], 'Id'), type: attr(m[0], 'Type'), target, external, path: external ? null : resolvePath(path, target) };
    });
  }
  writeRels(path, list) {
    if (!list.length) return this.remove(relsPath(path));
    this.write(
      relsPath(path),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
        .map((r) => `<Relationship Id="${escXml(r.id)}" Type="${escXml(r.type)}" Target="${escXml(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`)
        .join('')}</Relationships>`,
    );
  }
  async loadTypes() {
    this.types = await this.read('[Content_Types].xml');
  }
  override(part, ct) {
    const re = new RegExp(`<Override\\b[^>]*PartName="/${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`);
    this.types = this.types.replace(re, '');
    if (ct) this.types = this.types.replace('</Types>', `<Override PartName="/${part}" ContentType="${ct}"/></Types>`);
  }
  generate() {
    this.write('[Content_Types].xml', this.types);
    return this.zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  }
}

async function workbookOf(pkg) {
  const xml = await pkg.read('xl/workbook.xml');
  const rels = await pkg.rels('xl/workbook.xml');
  const sheets = [...(xml.match(/<sheets>[\s\S]*?<\/sheets>/)?.[0] ?? '').matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const rid = attr(m[0], 'r:id');
    return { name: attr(m[0], 'name'), sheetId: attr(m[0], 'sheetId'), rid, tag: m[0], path: rels.find((r) => r.id === rid)?.path };
  });
  const names = [...(xml.match(/<definedNames>([\s\S]*?)<\/definedNames>/)?.[1] ?? '').matchAll(/<definedName\b[^>]*>([\s\S]*?)<\/definedName>/g)].map((m) => ({
    open: openTag(m[0]),
    local: attr(openTag(m[0]), 'localSheetId'),
    body: unesc(m[1]),
  }));
  return { xml, rels, sheets, names };
}
const quoteSheet = (name) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`);
/** ช่วงในชื่อที่กำหนด (พื้นที่พิมพ์ / แถวหัวพิมพ์ซ้ำ) ของชีตเดิม → ชีตใหม่ */
function mapDefinedBody(body, oldName, newName, P) {
  return body
    .split(',')
    .map((part) => {
      const m = part.match(/^(?:'((?:[^']|'')+)'|([^'!]+))!(.+)$/);
      const sheet = m ? (m[1] ?? m[2]).replace(/''/g, "'") : null;
      if (!m || sheet !== oldName) return part;
      const ref = P ? mapRange(m[3], P) : m[3];
      return ref ? `${quoteSheet(newName)}!${ref}` : null;
    })
    .filter(Boolean)
    .join(',');
}
const refersTo = (body, name) => body.includes(`${quoteSheet(name)}!`) || body.includes(`'${name.replace(/'/g, "''")}'!`);

/** เขียน workbook.xml ใหม่: รายการชีต · ชื่อที่กำหนด · แท็บแรก · คำนวณสูตรใหม่ตอนเปิด */
function writeWorkbook(pkg, wb, sheets, names) {
  let xml = wb.xml.replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets>${sheets.map((s) => s.tag).join('')}</sheets>`);
  const defs = names.map((d) => `${d.open}${escXml(d.body)}</definedName>`).join('');
  xml = xml.replace(/<definedNames>[\s\S]*?<\/definedNames>|<definedNames\/>/, '');
  if (defs) {
    const after = xml.includes('</externalReferences>') ? '</externalReferences>' : '</sheets>';
    xml = xml.replace(after, `${after}<definedNames>${defs}</definedNames>`);
  }
  xml = xml.replace(/<workbookView\b[^>]*>/g, (t) => setAttr(setAttr(t, 'activeTab', null), 'firstSheet', null));
  xml = /<calcPr\b/.test(xml) ? xml.replace(/<calcPr\b[^>]*?(\/?)>/, (t) => setAttr(t, 'fullCalcOnLoad', '1')) : xml.replace(defs ? '</definedNames>' : '</sheets>', (m) => `${m}<calcPr fullCalcOnLoad="1"/>`);
  pkg.write('xl/workbook.xml', xml);
}
async function dropCalcChain(pkg, wb) {
  const rel = wb.rels.find((r) => r.type.endsWith('/calcChain'));
  if (!rel) return wb.rels;
  pkg.remove(rel.path);
  pkg.override(rel.path, null);
  return wb.rels.filter((r) => r !== rel);
}
async function appTitles(pkg, names) {
  const app = await pkg.read('docProps/app.xml');
  if (!app) return;
  const vec = `<vt:vector size="${names.length}" baseType="lpstr">${names.map((n) => `<vt:lpstr>${escXml(n)}</vt:lpstr>`).join('')}</vt:vector>`;
  pkg.write(
    'docProps/app.xml',
    app
      .replace(/<HeadingPairs>[\s\S]*?<\/HeadingPairs>/, `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${names.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>`)
      .replace(/<TitlesOfParts>[\s\S]*?<\/TitlesOfParts>/, `<TitlesOfParts>${vec}</TitlesOfParts>`),
  );
}

/** ส่วนประกอบของชีต (drawing, หมายเหตุ ฯลฯ) — ลบ/สำเนา */
async function sheetParts(pkg, sheetPath) {
  return (await pkg.rels(sheetPath)).filter((r) => !r.external && r.path && pkg.has(r.path));
}
async function removeSheetFiles(pkg, sheetPath, keepPaths) {
  for (const r of await sheetParts(pkg, sheetPath)) {
    if (keepPaths.has(r.path) || /printerSettings/.test(r.path)) continue;
    pkg.remove(r.path);
    pkg.remove(relsPath(r.path));
    pkg.override(r.path, null);
  }
  pkg.remove(sheetPath);
  pkg.remove(relsPath(sheetPath));
  pkg.override(sheetPath, null);
}
function unusedName(pkg, pattern) {
  for (let i = 1; ; i++) if (!pkg.has(pattern(i))) return pattern(i);
}
/** drawing / หมายเหตุของชีต: แก้ตำแหน่งตามแถวใหม่ · clone = ทำสำเนาเป็นไฟล์ใหม่ (ชีตสำเนา) */
async function rewriteParts(pkg, fromSheet, toSheet, P, clone) {
  const rels = await pkg.rels(fromSheet);
  const out = [];
  for (const r of rels) {
    if (r.external || !r.path || !pkg.has(r.path)) {
      out.push({ ...r, target: r.external ? r.target : relativeTarget(toSheet, r.path ?? '') });
      continue;
    }
    const isDrawing = r.type === `${REL}drawing`;
    const isComments = r.type === `${REL}comments`;
    const isVml = r.type === `${REL}vmlDrawing`;
    if (r.type === `${REL}table`) continue; // ตาราง (ListObject) ชื่อซ้ำไม่ได้ — ไม่สำเนา
    if (!isDrawing && !isComments && !isVml) {
      out.push({ ...r, target: relativeTarget(toSheet, r.path) }); // เช่น printerSettings ใช้ร่วมกันได้
      continue;
    }
    let xml = await pkg.read(r.path);
    if (isDrawing) xml = shiftAnchors(xml, P);
    if (isComments) xml = xml.replace(/<comment\b[^>]*>/g, (t) => setAttr(t, 'ref', mapRange(attr(t, 'ref'), P) ?? attr(t, 'ref')));
    let path = r.path;
    if (clone) {
      const ext = path.slice(path.lastIndexOf('.'));
      const stem = path.slice(0, path.lastIndexOf('.')).replace(/\d+$/, '');
      path = unusedName(pkg, (i) => `${stem}${i}${ext}`);
      const ct = isDrawing ? CT_DRAWING : null;
      const src = pkg.types.match(new RegExp(`<Override\\b[^>]*PartName="/${r.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*ContentType="([^"]+)"`))?.[1];
      if (src || ct) pkg.override(path, src ?? ct);
      const sub = await pkg.rels(r.path);
      if (sub.length) pkg.writeRels(path, sub.map((s) => ({ ...s, target: s.external ? s.target : relativeTarget(path, s.path) })));
    }
    pkg.write(path, xml);
    out.push({ ...r, target: relativeTarget(toSheet, path) });
  }
  if (out.length || rels.length) pkg.writeRels(toSheet, out);
}

/** styles.xml: รูปแบบเซลล์ (s) → ชื่อฟอนต์ */
async function fontOfStyle(pkg) {
  const xml = (await pkg.read('xl/styles.xml')) ?? '';
  const fonts = [...(xml.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/)?.[1] ?? '').matchAll(/<font\b[^>]*?(?:\/>|>[\s\S]*?<\/font>)/g)].map((m) => m[0].match(/<name\b[^>]*val="([^"]*)"/)?.[1] ?? '');
  const xfs = [...(xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '').matchAll(/<xf\b[^>]*>/g)].map((m) => Number(attr(m[0], 'fontId') ?? 0));
  return (s) => fonts[xfs[Number(s ?? 0)] ?? 0] ?? '';
}

// ---------- เก็บแบบฟอร์ม ----------
/**
 * @param {ArrayBuffer} buffer
 * @param {{name:string, layout:{dataRow:number, footerRow:number}, cells:Record<string,string>}[]} keep   ชีตที่เก็บ (cells = ป้ายที่เหลือในเซลล์ที่ระบบเติม · '' = ล้าง)
 * @returns {Promise<ArrayBuffer>}
 */
export async function sanitizeXlsx(buffer, keep) {
  const pkg = await Pkg.open(buffer);
  await pkg.loadTypes();
  const wb = await workbookOf(pkg);
  const want = new Map(keep.map((k) => [k.name, k]));
  for (const k of keep) if (!wb.sheets.some((s) => s.name === k.name)) throw new Error(`ไม่พบชีต “${k.name}” ในไฟล์`);
  const kept = wb.sheets.filter((s) => want.has(s.name));
  const removed = wb.sheets.filter((s) => !want.has(s.name));
  // ไฟล์ส่วนประกอบที่ชีตที่เก็บใช้อยู่ (ไม่ลบ)
  const keepPaths = new Set();
  for (const s of kept) for (const r of await sheetParts(pkg, s.path)) keepPaths.add(r.path);
  for (const s of removed) await removeSheetFiles(pkg, s.path, keepPaths);
  let rels = (await dropCalcChain(pkg, wb)).filter((r) => !removed.some((s) => s.rid === r.id));
  pkg.writeRels('xl/workbook.xml', rels);

  // ชีตที่เก็บ: แถวข้อมูลตัวอย่างเหลือ 1 แถวว่าง · เซลล์ที่ระบบเติมเหลือป้าย
  const xmls = new Map();
  for (const [i, s] of kept.entries()) {
    const k = want.get(s.name);
    const { xml, P } = transformSheet(await pkg.read(s.path), k.layout, { n: 1, clear: true, cells: k.cells, selected: i === 0 });
    xmls.set(s.path, xml);
    await rewriteParts(pkg, s.path, s.path, P, false);
    s.P = P;
  }

  // sharedStrings: เหลือเฉพาะข้อความที่ชีตที่เก็บใช้ (รายชื่อตัวอย่าง/ชีตอื่นไม่ติดไปกับไฟล์)
  const sstRel = rels.find((r) => r.type.endsWith('/sharedStrings'));
  if (sstRel) {
    const sst = (await pkg.read(sstRel.path)) ?? '';
    const items = [...sst.matchAll(/<si>[\s\S]*?<\/si>|<si\/>/g)].map((m) => m[0]);
    const map = new Map();
    const used = [];
    const remap = (xml) =>
      xml.replace(/(<c\b[^>]*\bt="s"[^>]*>[\s\S]*?<v>)(\d+)(<\/v>)/g, (_m, a, idx, b) => {
        if (!map.has(idx)) {
          map.set(idx, used.length);
          used.push(items[Number(idx)] ?? '<si><t></t></si>');
        }
        return a + map.get(idx) + b;
      });
    for (const [p, xml] of xmls) xmls.set(p, remap(xml));
    pkg.write(sstRel.path, sst.replace(/<sst\b[^>]*>[\s\S]*<\/sst>/, (all) => `${setAttr(setAttr(openTag(all), 'count', String(used.length)), 'uniqueCount', String(used.length))}${used.join('')}</sst>`));
  }
  for (const [p, xml] of xmls) pkg.write(p, xml);

  // ชื่อที่กำหนด: เหลือของชีตที่เก็บ (เลื่อนตาม) · localSheetId ตามลำดับใหม่
  const names = [];
  for (const d of wb.names) {
    const local = d.local === null ? null : wb.sheets[Number(d.local)];
    if (local && !want.has(local.name)) continue;
    if (removed.some((s) => refersTo(d.body, s.name))) continue;
    let body = d.body;
    for (const s of kept) body = mapDefinedBody(body, s.name, s.name, s.P);
    names.push({ open: local ? setAttr(d.open, 'localSheetId', String(kept.indexOf(local))) : d.open, body });
  }
  writeWorkbook(pkg, wb, kept, names);
  await appTitles(pkg, kept.map((s) => s.name));
  // ชื่อผู้สร้าง/แก้ไขไฟล์ (อาจเป็นชื่อบุคคล)
  const core = await pkg.read('docProps/core.xml');
  if (core) pkg.write('docProps/core.xml', core.replace(/(<dc:creator>)[\s\S]*?(<\/dc:creator>)/, '$1HL Welfare$2').replace(/(<cp:lastModifiedBy>)[\s\S]*?(<\/cp:lastModifiedBy>)/, '$1HL Welfare$2'));
  return pkg.generate();
}

// ---------- ส่งออก ----------
/**
 * @param {ArrayBuffer} buffer   แบบฟอร์มที่เก็บไว้ (sanitizeXlsx แล้ว)
 * @param {{
 *   summary: {sheet:string, name:string, layout:{dataRow,footerRow}, n:number, rowValues:(i)=>[number,any][], cells:Record<string,any>} | null,
 *   template: {sheet:string, layout:{dataRow,footerRow}},
 *   sheets: {name:string, n:number, rowValues:(i)=>[number,any][], cells:Record<string,any>}[],
 *   glyph?: (fontName:string, value:any) => any,     เช่น ✓ ในเซลล์ฟอนต์ Wingdings
 * }} plan
 * @returns {Promise<ArrayBuffer>}
 */
export async function fillXlsx(buffer, plan) {
  if (!plan.sheets.length) throw new Error('ไม่มีชีตให้สร้าง — ไม่มีบริษัทที่ผูกกับบริษัทประกันนี้');
  const pkg = await Pkg.open(buffer);
  await pkg.loadTypes();
  const wb = await workbookOf(pkg);
  const font = await fontOfStyle(pkg);
  const glyph = plan.glyph ? (s, v) => plan.glyph(font(s), v) : null;
  const tpl = wb.sheets.find((s) => s.name === plan.template.sheet);
  if (!tpl) throw new Error(`แบบฟอร์มไม่มีชีต “${plan.template.sheet}”`);
  const sum = plan.summary ? wb.sheets.find((s) => s.name === plan.summary.sheet) : null;
  const tplXml = await pkg.read(tpl.path);
  let rels = await dropCalcChain(pkg, wb);
  const order = [];
  const nameOf = new Map(); // ชีตเดิม → ชื่อใหม่ + plan ของแถว

  if (sum) {
    const { xml, P } = transformSheet(await pkg.read(sum.path), plan.summary.layout, { n: plan.summary.n, rowValues: plan.summary.rowValues, cells: plan.summary.cells, glyph, selected: true });
    pkg.write(sum.path, xml);
    await rewriteParts(pkg, sum.path, sum.path, P, false);
    order.push({ ...sum, tag: setAttr(sum.tag, 'name', plan.summary.name), out: plan.summary.name, from: sum.name, P });
  }
  // ชีตบริษัทแรกใช้ไฟล์ชีตต้นแบบเดิม · บริษัทถัดไปเป็นสำเนา
  const maxId = Math.max(0, ...wb.sheets.map((s) => Number(s.sheetId)));
  for (const [i, s] of plan.sheets.entries()) {
    const path = i === 0 ? tpl.path : unusedName(pkg, (k) => `xl/worksheets/sheet${k}.xml`);
    const { xml, P } = transformSheet(tplXml, plan.template.layout, { n: s.n, rowValues: s.rowValues, cells: s.cells, glyph, selected: !sum && i === 0 });
    if (i > 0) {
      pkg.write(path, xml);
      pkg.override(path, CT_SHEET);
      await rewriteParts(pkg, tpl.path, path, P, true);
      let n = 1;
      while (rels.some((r) => r.id === `rIdHL${n}`)) n++;
      const rid = `rIdHL${n}`;
      rels.push({ id: rid, type: `${REL}worksheet`, target: relativeTarget('xl/workbook.xml', path), path });
      order.push({ tag: `<sheet name="${escXml(s.name)}" sheetId="${maxId + i}" r:id="${rid}"/>`, out: s.name, from: tpl.name, P, path });
    } else {
      order.push({ ...tpl, tag: setAttr(tpl.tag, 'name', s.name), out: s.name, from: tpl.name, P });
    }
  }
  // ชีตต้นแบบเดิมเขียนเป็นบริษัทแรก — แก้ไฟล์หลังทำสำเนาครบ (สำเนาอ่าน drawing เดิมก่อนถูกเลื่อน)
  pkg.write(tpl.path, transformSheet(tplXml, plan.template.layout, { n: plan.sheets[0].n, rowValues: plan.sheets[0].rowValues, cells: plan.sheets[0].cells, glyph, selected: !sum }).xml);
  await rewriteParts(pkg, tpl.path, tpl.path, order.find((o) => o.from === tpl.name).P, false);
  // ชีตอื่นในไฟล์ (เช่น ไฟล์ที่เพิ่งอัปโหลดยังไม่ได้ล้าง) ไม่อยู่ในไฟล์ส่งออก — ชื่ออาจซ้ำกับชีตบริษัท
  const others = wb.sheets.filter((s) => s !== tpl && s !== sum);
  const keepPaths = new Set();
  for (const s of [tpl, sum].filter(Boolean)) for (const r of await sheetParts(pkg, s.path)) keepPaths.add(r.path);
  for (const s of others) await removeSheetFiles(pkg, s.path, keepPaths);
  rels = rels.filter((r) => !others.some((s) => s.rid === r.id));
  pkg.writeRels('xl/workbook.xml', rels);

  // ชื่อที่กำหนด (พื้นที่พิมพ์ / แถวหัวพิมพ์ซ้ำ) ของแต่ละชีตใหม่
  const names = [];
  for (const d of wb.names) {
    const local = d.local === null ? null : wb.sheets[Number(d.local)];
    if (!local) {
      if (![tpl, ...others].some((s) => refersTo(d.body, s.name))) names.push(d);
      continue;
    }
    order.forEach((o, idx) => {
      if (o.from !== local.name) return;
      names.push({ open: setAttr(d.open, 'localSheetId', String(idx)), body: mapDefinedBody(d.body, local.name, o.out, o.P) });
    });
  }
  writeWorkbook(pkg, wb, order.map((o) => ({ tag: o.tag })), names);
  await appTitles(pkg, order.map((o) => o.out));
  return pkg.generate();
}
