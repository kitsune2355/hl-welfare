// อ่านส่วนของไฟล์ .xlsx ที่ ExcelJS ไม่ให้ข้อมูล — ใช้แสดงตัวอย่างไฟล์ในหน้าเว็บ
//   partsOf(buffer)   รูปภาพ / กล่องข้อความ / รูปทรง ของแต่ละชีต + จานสีของไฟล์
// (การสร้างไฟล์ส่งออกอยู่ที่ xlsxDirect.js — แก้ไฟล์ต้นฉบับโดยตรง)
import { loadJsZip } from '../shared/excel.js';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/x-emf', wmf: 'image/x-wmf', svg: 'image/svg+xml' };

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], unesc(m[2])]));
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
const extOf = (p) => p.slice(p.lastIndexOf('.') + 1).toLowerCase();

async function text(zip, path) {
  const f = zip.file(path);
  return f ? f.async('string') : null;
}
async function rels(zip, path) {
  const xml = await text(zip, relsPath(path));
  if (!xml) return [];
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const a = attrs(m[0]);
    return { id: a.Id, type: a.Type, target: a.Target, external: a.TargetMode === 'External', path: a.TargetMode === 'External' ? null : resolvePath(path, a.Target) };
  });
}

/** ชื่อชีต → path ของ worksheet xml + path ของ theme/styles */
async function workbookParts(zip) {
  const wb = (await text(zip, 'xl/workbook.xml')) ?? '';
  const wbRels = await rels(zip, 'xl/workbook.xml');
  const byId = new Map(wbRels.map((r) => [r.id, r]));
  const sheets = new Map();
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    const rel = byId.get(a['r:id'] ?? Object.entries(a).find(([k]) => k.endsWith(':id'))?.[1]);
    if (rel?.path) sheets.set(a.name, rel.path);
  }
  const theme = wbRels.find((r) => r.type.endsWith('/theme'))?.path ?? null;
  const styles = wbRels.find((r) => r.type.endsWith('/styles'))?.path ?? null;
  return { sheets, theme, styles };
}

async function sheetDrawing(zip, sheetPath) {
  const rel = (await rels(zip, sheetPath)).find((r) => r.type === `${REL}drawing`);
  if (!rel?.path) return null;
  const xml = await text(zip, rel.path);
  return xml ? { path: rel.path, xml, rels: await rels(zip, rel.path) } : null;
}

// ---------- อ่าน drawing สำหรับแสดงตัวอย่าง ----------
const ANCHOR_RE = /<((?:\w+:)?)(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/\1\2>/g;
const EMU_PX = 9525;
function point(xml, tag) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`));
  if (!m) return null;
  const n = (k) => Number(m[1].match(new RegExp(`<(?:\\w+:)?${k}>(-?\\d+)<`))?.[1] ?? 0);
  return { col: n('col') + 1, colOff: n('colOff') / EMU_PX, row: n('row') + 1, rowOff: n('rowOff') / EMU_PX };
}
function color(xml) {
  if (!xml) return null;
  if (/<a:noFill\s*\/>/.test(xml)) return 'none';
  const c = xml.match(/<a:solidFill>\s*<a:(?:srgbClr|sysClr)\b[^>]*?(?:val|lastClr)="([0-9A-Fa-f]{6})"/);
  return c ? `#${c[1]}` : null;
}

const indexedColors = (stylesXml) => {
  const c = stylesXml?.match(/<indexedColors>([\s\S]*?)<\/indexedColors>/)?.[1];
  return c ? [...c.matchAll(/rgb="([0-9A-Fa-f]{6,8})"/g)].map((m) => m[1].slice(-6).toUpperCase()) : null;
};

/**
 * @returns {Promise<{indexed: string[]|null, drawings: Record<string, {kind:'pic'|'shape', from:{col,colOff,row,rowOff}, to:{col,colOff,row,rowOff}|null, size:{w,h}|null, src?:string, text?:string, fill?:string|null, line?:string|null}[]>}>}
 */
export async function partsOf(buffer) {
  const JSZip = await loadJsZip();
  const zip = await JSZip.loadAsync(buffer);
  const { sheets, styles } = await workbookParts(zip);
  const indexed = indexedColors(styles ? await text(zip, styles) : null);
  const out = {};
  for (const [name, path] of sheets) {
    const d = await sheetDrawing(zip, path);
    if (!d) continue;
    const relById = new Map(d.rels.map((r) => [r.id, r]));
    const items = [];
    for (const m of d.xml.matchAll(ANCHOR_RE)) {
      const body = m[3];
      const from = point(body, 'from');
      if (!from) continue;
      const to = point(body, 'to');
      const ext = body.match(/<(?:\w+:)?ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
      const size = ext ? { w: Number(ext[1]) / EMU_PX, h: Number(ext[2]) / EMU_PX } : null;
      const blip = body.match(/<a:blip\b[^>]*r:embed="([^"]+)"/);
      if (blip) {
        const rel = relById.get(blip[1]);
        const file = rel?.path && zip.file(rel.path);
        const mime = MIME[extOf(rel?.path ?? '')];
        if (!file || !mime || mime.includes('x-')) continue; // emf/wmf แสดงในเบราว์เซอร์ไม่ได้
        items.push({ kind: 'pic', from, to, size, src: `data:${mime};base64,${await file.async('base64')}` });
        continue;
      }
      if (!/<(?:\w+:)?(sp|grpSp|cxnSp)\b/.test(body)) continue;
      const paras = [...body.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((p) => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => unesc(t[1])).join(''));
      const spPr = body.match(/<(?:\w+:)?spPr>([\s\S]*?)<\/(?:\w+:)?spPr>/)?.[1] ?? '';
      const ln = spPr.match(/<a:ln\b[^>]*>([\s\S]*?)<\/a:ln>/)?.[1] ?? null;
      const run = body.match(/<a:(?:rPr|defRPr)\b[^>]*>/)?.[0] ?? '';
      const sz = Number(run.match(/\bsz="(\d+)"/)?.[1] ?? 1100);
      items.push({
        kind: 'shape',
        from,
        to,
        size,
        text: paras.join('\n').trim(),
        fill: color(spPr.replace(/<a:ln\b[\s\S]*?<\/a:ln>/, '')),
        line: color(ln),
        fontPx: Math.round(((sz / 100) * 4) / 3),
        bold: /\bb="1"/.test(run),
        align: body.match(/<a:pPr\b[^>]*algn="(\w+)"/)?.[1] ?? 'l',
      });
    }
    if (items.length) out[name] = items;
  }
  return { drawings: out, indexed };
}
