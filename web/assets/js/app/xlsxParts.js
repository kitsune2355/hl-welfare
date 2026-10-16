// ส่วนของไฟล์ .xlsx ที่ ExcelJS ไม่คงไว้ — แก้ที่ระดับ XML ด้วย JSZip เพื่อให้ไฟล์ส่งออก "เหมือนแบบฟอร์มต้นฉบับ"
//
//   partsOf(buffer)                           รูปภาพ / กล่องข้อความ / รูปทรง ของแต่ละชีต + จานสีของไฟล์ (แสดงในตัวอย่าง)
//   carryParts(srcBuffer, outBuffer, sheets)  ใส่ส่วนที่หายกลับลงไฟล์ที่ ExcelJS เขียน:
//       - drawing ของชีต (รูปภาพ กล่องข้อความ รูปทรง) — ตำแหน่งแถวเลื่อนตามส่วนท้าย
//       - ธีมสี + จานสี (indexedColors) — สีในเซลล์ตรงกับต้นฉบับ
//       - ฟอนต์ตั้งต้นของไฟล์ (มีผลกับความกว้างคอลัมน์และเซลล์ที่ไม่ได้กำหนดฟอนต์)
import { loadJsZip } from '../shared/excel.js';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';
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
const relsXml = (list) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target.replace(/&/g, '&amp;')}"${r.external ? ' TargetMode="External"' : ''}/>`)
    .join('')}</Relationships>`;

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

// ---------- ใส่ส่วนที่หายกลับลงไฟล์ ----------
function shiftAnchors(xml, row) {
  return xml.replace(/<((?:\w+:)?)(from|to)>([\s\S]*?)<\/\1\2>/g, (all, ns, tag, body) =>
    `<${ns}${tag}>${body.replace(/<((?:\w+:)?)row>(\d+)<\/\1row>/, (_m, p, r) => `<${p}row>${row(Number(r) + 1) - 1}</${p}row>`)}</${ns}${tag}>`,
  );
}

/** แทรก <drawing r:id> ในตำแหน่งที่ถูกต้องตาม schema ของ worksheet */
function insertDrawingTag(sheetXml, rid) {
  const tag = `<drawing r:id="${rid}"/>`;
  const before = sheetXml.search(/<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b|<\/worksheet>/);
  let xml = sheetXml.slice(0, before) + tag + sheetXml.slice(before);
  if (!/<worksheet\b[^>]*xmlns:r=/.test(xml)) xml = xml.replace(/<worksheet\b/, `<worksheet xmlns:r="${REL.slice(0, -1)}"`);
  return xml;
}

/**
 * @param {ArrayBuffer} srcBuffer   ไฟล์ต้นฉบับ (แบบฟอร์ม)
 * @param {ArrayBuffer} outBuffer   ไฟล์ที่ ExcelJS เขียน
 * @param {{src:string, out:string, row:(r:number)=>number}[]} sheets   ชีตต้นฉบับ → ชีตในไฟล์ใหม่ + ตำแหน่งแถวใหม่ (1-based)
 * @returns {Promise<ArrayBuffer>}
 */
export async function carryParts(srcBuffer, outBuffer, sheets) {
  const JSZip = await loadJsZip();
  const src = await JSZip.loadAsync(srcBuffer);
  const out = await JSZip.loadAsync(outBuffer);
  const S = await workbookParts(src);
  const O = await workbookParts(out);
  let types = (await text(out, '[Content_Types].xml')) ?? '';
  const addType = (frag, test) => {
    if (!test.test(types)) types = types.replace('</Types>', `${frag}</Types>`);
  };

  // ธีมสี
  if (S.theme && O.theme) {
    const theme = await text(src, S.theme);
    if (theme) out.file(O.theme, theme);
  }
  // ฟอนต์ตั้งต้น = ฟอนต์แรกใน styles.xml · จานสี (ไฟล์เก่า/จาก .xls มักกำหนดจานสีเอง)
  if (S.styles && O.styles) {
    const first = (xml) => xml?.match(/<fonts\b[^>]*>\s*(<font\b[\s\S]*?<\/font>|<font\s*\/>)/)?.[1];
    const ss = await text(src, S.styles);
    let os = await text(out, O.styles);
    const f = first(ss);
    const g = first(os);
    if (f && g) os = os.replace(g, f);
    const colors = ss?.match(/<colors>[\s\S]*?<\/colors>/)?.[0];
    if (colors) {
      os = os.replace(/<colors>[\s\S]*?<\/colors>/, '');
      const at = os.search(/<extLst\b|<\/styleSheet>/);
      os = os.slice(0, at) + colors + os.slice(at);
    }
    out.file(O.styles, os);
  }

  // drawing ของแต่ละชีต
  let nDrawing = 0;
  let nMedia = 0;
  const media = new Map(); // path ต้นฉบับ → path ในไฟล์ใหม่
  for (const s of sheets) {
    const srcPath = S.sheets.get(s.src);
    const outPath = O.sheets.get(s.out);
    if (!srcPath || !outPath) continue;
    const d = await sheetDrawing(src, srcPath);
    if (!d) continue;
    const outRels = await rels(out, outPath);
    if (outRels.some((r) => r.type === `${REL}drawing`)) continue; // ชีตมี drawing แล้ว (ไม่ทับ)

    let xml = shiftAnchors(d.xml, s.row);
    const keep = [];
    for (const r of d.rels) {
      if (r.external) keep.push(r);
      else if (r.type === `${REL}image` && src.file(r.path)) {
        if (!media.has(r.path)) {
          while (out.file(`xl/media/form${++nMedia}.${extOf(r.path)}`));
          const p = `xl/media/form${nMedia}.${extOf(r.path)}`;
          out.file(p, await src.file(r.path).async('uint8array'));
          media.set(r.path, p);
          const ext = extOf(r.path);
          if (MIME[ext]) addType(`<Default Extension="${ext}" ContentType="${MIME[ext]}"/>`, new RegExp(`Extension="${ext}"`, 'i'));
        }
        keep.push({ ...r, target: `../media/${media.get(r.path).split('/').pop()}` });
      } else {
        // ส่วนที่ไม่รองรับ (เช่น แผนภูมิ) → ตัด anchor ที่อ้างถึงออก ไม่ให้ไฟล์เสีย
        xml = xml.replace(ANCHOR_RE, (all) => (new RegExp(`"${r.id}"`).test(all) ? '' : all));
      }
    }
    while (out.file(`xl/drawings/drawing${++nDrawing}.xml`));
    const dPath = `xl/drawings/drawing${nDrawing}.xml`;
    out.file(dPath, xml);
    if (keep.length) out.file(relsPath(dPath), relsXml(keep));
    addType(`<Override PartName="/${dPath}" ContentType="${CT_DRAWING}"/>`, new RegExp(`PartName="/${dPath}"`));

    let n = 1;
    while (outRels.some((r) => r.id === `rIdForm${n}`)) n++;
    const rid = `rIdForm${n}`;
    outRels.push({ id: rid, type: `${REL}drawing`, target: `../drawings/drawing${nDrawing}.xml` });
    out.file(relsPath(outPath), relsXml(outRels));
    out.file(outPath, insertDrawingTag(await text(out, outPath), rid));
  }
  out.file('[Content_Types].xml', types);
  return out.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
