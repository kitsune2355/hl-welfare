// อ่านโครงไฟล์ Excel แบบฟอร์มของบริษัทประกัน (ที่ HR อัปโหลด) แล้วเดาตำแหน่งให้อัตโนมัติ — ฟังก์ชันล้วน ทดสอบได้ใน Node
//
// grid = { nRows, nCols, text(r, c), merges: [{ top, left, bottom, right }] }   (แถว/คอลัมน์เริ่มที่ 1 แบบ Excel)
//   text(r, c) คืนข้อความของเซลล์ "หลัก" ที่ครอบเซลล์นั้น (ถ้าอยู่ในช่วง merge)
//
// ผลลัพธ์ (layout):
//   headerRow / headerEnd   แถวหัวตาราง (หลายแถวได้ เช่น หัว 2 ชั้น)
//   dataRow                 แถวแรกของข้อมูลพนักงาน — ใช้รูปแบบแถวนี้กับทุกแถวที่สร้าง
//   footerRow               แถวแรกหลังข้อมูล (หมายเหตุ / สรุปจำนวน / ลงชื่อ) — ระบบเลื่อนลงตามจำนวนคน
//   columns                 [{ col, header, group, source, only }] — คอลัมน์ไหนใส่ข้อมูลอะไร
//   cells                   { 'C6': '{policyNo}', 'A5': 'ชื่อนายจ้าง {companyName}', … } — เซลล์นอกตารางที่เปลี่ยนตามไฟล์

const clean = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** คำที่บอกว่าเป็นหัวตารางของชีตบริษัท / ชีตสรุป */
const HEADER_WORDS = {
  company: /ลำดับ|รหัสพนักงาน|ชื่อ|สกุล|เพศ|เกิด|บัตรประชาชน|ตำแหน่ง|แผนประกัน|เข้าใหม่|ลาออก|ยกเลิก|วันที่มีผล|เงินเดือน|emp\.? ?code|insured|date of birth|plan|effective/i,
  summary: /ลำดับ|สังกัด|ตัวย่อ|แจ้งเข้า|แจ้งออก|ลาออก|โอนย้าย|เปลี่ยนแปลง|รวม/,
};
/** แถวที่เริ่มส่วนท้ายเอกสาร */
const FOOTER_WORDS = /^(หมายเหตุ|ลงชื่อ|ผู้แจ้ง|เข้าใหม่$|รวมทั้งหมด|รวม$|บันทึกโดย)/;

function rowTexts(grid, r) {
  const out = [];
  for (let c = 1; c <= grid.nCols; c++) out.push(clean(grid.text(r, c)));
  return out;
}

function mergeAt(grid, r, c) {
  return grid.merges.find((m) => r >= m.top && r <= m.bottom && c >= m.left && c <= m.right) ?? null;
}

/** ข้อมูลที่คอลัมน์นี้ควรเป็น จากข้อความหัวคอลัมน์ (leaf) และกลุ่มที่ครอบ (parent) */
export function suggestSource(path, kind = 'company') {
  const leaf = path[path.length - 1] ?? '';
  const parents = path.slice(0, -1).join(' ');
  const all = `${parents} ${leaf}`;
  if (kind === 'summary') {
    if (/ลำดับ/.test(leaf)) return { source: 'seq' };
    if (/ตัวย่อ/.test(leaf)) return { source: 'companyCode' };
    if (/สังกัด|บริษัท/.test(leaf)) return { source: 'companyName' };
    if (/โอน|เปลี่ยน/.test(leaf)) return { source: 'change' };
    if (/รวม/.test(leaf)) return { source: 'total' };
    if (/เข้า/.test(leaf)) return { source: 'in' };
    if (/ออก|ยกเลิก/.test(leaf)) return { source: 'out' };
    return { source: 'blank' };
  }
  const IN = { only: 'IN' };
  if (/เปลี่ยนแปลง|changed|change/i.test(parents)) return { source: 'blank' };
  if (/ลำดับ|^no\b|\(no\)/i.test(leaf)) return { source: 'seq' };
  if (/รหัส|emp\.? ?code/i.test(leaf)) return { source: 'empCode' };
  if (/คำนำหน้า/.test(leaf)) return { source: 'title' };
  if (/บัตร|id ?card/i.test(all)) return { source: 'nationalId', ...IN };
  if (/ชื่อ|สกุล|name/i.test(leaf)) return { source: 'titleFullName' };
  if (/เพศ|sex|gender/i.test(leaf)) return { source: 'gender', ...IN };
  if (/เกิด|birth/i.test(leaf)) return { source: 'birthDate', ...IN };
  if (/ตำแหน่ง|position/i.test(leaf)) return { source: 'position', ...IN };
  if (/โทร|tel|mobile|phone/i.test(leaf)) return { source: 'phone', ...IN };
  if (/อีเมล|e-?mail/i.test(leaf)) return { source: 'email', ...IN };
  if (/เงินเดือน|salary/i.test(leaf)) return { source: 'salary', ...IN };
  if (/สถานะ|ธนาคาร|bank|บัญชี|account|มรณ|death|ใบคำขอ|application|หมายเหตุ|remark|ความคุ้มครอง|จากแผน|เป็นแผน|เปลี่ยนแปลง|changed/i.test(leaf)) return { source: 'blank' };
  if (/วันที่มีผล|มีผลบังคับ|effective/i.test(leaf)) {
    if (/เข้าใหม่|new/i.test(all)) return { source: 'inEffectiveDate' };
    if (/ยกเลิก|ลาออก|retire/i.test(all)) return { source: 'outEffectiveDate' };
    return { source: 'cycleDate' };
  }
  if (/แผน|plan/i.test(leaf)) return { source: 'plan', ...IN };
  if (/เข้าใหม่|new/i.test(leaf)) return { source: 'inMark' };
  if (/ลาออก|ยกเลิก|retire|resign/i.test(leaf)) return { source: 'outMark' };
  return { source: 'blank' };
}

/** แถวหัวตาราง: แถวที่มีคำของหัวตารางมากที่สุด (40 แถวแรก) */
function findHeaderRow(grid, kind) {
  let best = 0;
  let row = 0;
  for (let r = 1; r <= Math.min(grid.nRows, 40); r++) {
    const n = rowTexts(grid, r).filter((t, i) => t && HEADER_WORDS[kind].test(t) && (i === 0 || t !== rowTexts(grid, r)[i - 1])).length;
    if (n > best) {
      best = n;
      row = r;
    }
  }
  if (best < 2) return 0;
  // ขยายขึ้นด้านบน: หัวตารางหลายชั้น (merge แนวตั้งจากแถวบน หรือแถวบนที่ยังเป็นคำหัวตาราง)
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of grid.merges) {
      if (m.top < row && m.bottom >= row && m.top >= row - 4) {
        row = m.top;
        changed = true;
      }
    }
    if (row > 1 && rowTexts(grid, row - 1).filter((x) => x && HEADER_WORDS[kind].test(x)).length >= 2) {
      row--;
      changed = true;
    }
  }
  return row;
}

/** หัวตารางกี่แถว: ตาม merge ที่เริ่มในหัวตาราง + แถวถัดไปที่ยังเป็นข้อความหัวตาราง */
function findHeaderEnd(grid, headerRow, kind) {
  let end = headerRow;
  for (const m of grid.merges) if (m.top >= headerRow && m.top <= headerRow + 3 && m.bottom <= headerRow + 4) end = Math.max(end, m.bottom);
  for (let r = end + 1; r <= headerRow + 3; r++) {
    // ข้อความที่ "เริ่ม" ในแถวนี้ (ไม่นับเซลล์ที่ถูก merge ลงมาจากแถวบน)
    const own = rowTexts(grid, r).filter((t, i) => {
      const m = mergeAt(grid, r, i + 1);
      return t && (!m || m.top === r);
    });
    const hasWords = own.some((t) => HEADER_WORDS[kind].test(t) || /^[ก-๙a-z ()/.]+$/i.test(t));
    const hasNumber = own.some((t) => /^\d+([./]\d+)*$/.test(t));
    if (own.length && hasWords && !hasNumber) end = r;
    else break;
  }
  return end;
}

function isEmptyRow(grid, r) {
  return rowTexts(grid, r).every((t) => !t);
}

/** ส่วนท้าย: แถวแรกที่เป็นหมายเหตุ/สรุป/ลงชื่อ (ย้อนกลับไปรวมแถวว่างที่คั่นไว้ด้วย) */
function findFooterRow(grid, dataRow, kind) {
  let footer = 0;
  for (let r = dataRow; r <= grid.nRows; r++) {
    const texts = rowTexts(grid, r).filter(Boolean);
    if (kind === 'summary' ? /^รวม/.test(texts[0] ?? '') : texts.some((t) => FOOTER_WORDS.test(t))) {
      footer = r;
      break;
    }
  }
  if (!footer) {
    let last = dataRow - 1;
    for (let r = dataRow; r <= grid.nRows; r++) if (!isEmptyRow(grid, r)) last = r;
    return Math.max(dataRow + 1, last + 1);
  }
  if (kind !== 'summary') while (footer - 1 > dataRow && isEmptyRow(grid, footer - 1)) footer--;
  return Math.max(footer, dataRow + 1);
}

/**
 * หัวคอลัมน์ + กลุ่ม จากแถวหัวตาราง (ไล่บนลงล่าง)
 *   เซลล์ที่ merge กว้างหลายคอลัมน์ = กลุ่ม (เช่น "ประกันชีวิตกลุ่ม…", "เข้าใหม่")
 *   เซลล์กว้างคอลัมน์เดียวที่ซ้อนกันหลายแถว = ชื่อคอลัมน์ต่อกัน (เช่น "เลขที่บัตร" + "ประชาชน")
 */
function columnHeaders(grid, headerRow, headerEnd) {
  const cols = [];
  for (let c = 1; c <= grid.nCols; c++) {
    const groups = [];
    const names = [];
    let last = '';
    for (let r = headerRow; r <= headerEnd; r++) {
      const t = clean(grid.text(r, c));
      if (!t || t === last) continue;
      last = t;
      const m = mergeAt(grid, r, c);
      (m && m.right > m.left ? groups : names).push(t);
    }
    if (!groups.length && !names.length) continue;
    const leaf = names.length ? names.join(' ') : groups.pop();
    cols.push({ col: c, path: [...groups, leaf] });
  }
  return cols;
}

/** เซลล์นอกตารางที่ต้องเปลี่ยนตามไฟล์: หาจากป้าย เช่น "เลขที่กรมธรรม์" แล้วใช้เซลล์ทางขวา หรือส่วนท้ายของเซลล์เดียวกัน */
// ป้ายยาวมาก่อน (เช่น "ชื่อนายจ้าง / ผู้ถือกรมธรรม์" ทั้งวลี) · ป้ายผู้แจ้งต้องอยู่เดี่ยว ๆ ในเซลล์
const LABELS = [
  { re: /เลขที่กรมธรรม์|เลขที่กรมธรรม|policy no/i, v: '{policyNo}' },
  { re: /ชื่อนายจ้าง\s*\/\s*(ชื่อ)?ผู้ถือกรร?มธรรม์|(ชื่อ)?ผู้ถือกรร?มธรรม์|ชื่อนายจ้าง|policy ?holder/i, v: '{companyName}' },
  { re: /ประจำเดือน/, v: '{month}' },
  { re: /^วันที่แจ้ง\s*[:：]?$/, v: '{exportDate}' },
  { re: /^(ลงชื่อ)?ผู้แจ้ง\s*[:：]?$/, v: '{signerName}', footer: true },
  { re: /^(โทรศัพท์ติดต่อ|โทรศัพท์|โทร)\s*[:：]?$/, v: '{signerPhone}', footer: true },
  { re: /^แผนก\s*[:：]?$/, v: '{signerDept}', footer: true },
  { re: /^วันที่\s*[:：]?$/, v: '{exportDate}', footer: true },
  { re: /^เข้าใหม่$/, v: '{in}', footer: true },
  { re: /^(ลาออก|แจ้งออก)$/, v: '{out}', footer: true },
  { re: /^รวมทั้งหมด$/, v: '{total}', footer: true },
  { re: /^เปลี่ยนแปลง$/, v: '0', footer: true },
];
/** ข้อความเติมที่รอให้กรอก เช่น "00……………", "..........", "____" */
const FILLER = /\s*[0๐]*[.…_\-]{3,}[.…_\-\s]*$/;

export const addr = (r, c) => {
  let s = '';
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return `${s}${r}`;
};
export function parseAddr(a) {
  const m = /^([A-Z]+)(\d+)$/.exec(a);
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]), c };
}

function detectCells(grid, layout) {
  const cells = {};
  const isLabel = (t) => LABELS.some((l) => l.re.test(t));
  const scan = (from, to, inFooter) => {
    for (let r = from; r <= to; r++) {
      for (let c = 1; c <= grid.nCols; c++) {
        const m = mergeAt(grid, r, c);
        if (m && (m.top !== r || m.left !== c)) continue; // ไม่ใช่เซลล์หลัก
        const t = clean(grid.text(r, c));
        if (!t) continue;
        // ป้ายต้องอยู่ต้นเซลล์ หรือเซลล์สั้น ๆ (กันข้อความยาว เช่น หมายเหตุที่มีคำว่า "ผู้ถือกรมธรรม์")
        const rule = LABELS.find((l) => {
          const m = l.re.exec(t);
          return m && (!l.footer || inFooter) && (m.index === 0 || t.length <= 40);
        });
        if (!rule) continue;
        // ค่าทางขวา (ข้ามเซลล์ที่ merge อยู่กับป้าย)
        let target = null;
        for (let cc = (m ? m.right : c) + 1; cc <= Math.min(grid.nCols, c + 10); cc++) {
          const mm = mergeAt(grid, r, cc);
          if (mm && (mm.top !== r || mm.left !== cc)) continue;
          const v = clean(grid.text(r, cc));
          if (!v) continue;
          if (!isLabel(v) && !/^คน$/.test(v)) target = { r, c: cc };
          break;
        }
        if (target) {
          cells[addr(target.r, target.c)] = rule.v;
          continue;
        }
        // ค่าอยู่ในเซลล์เดียวกัน: แทนส่วนที่เว้นไว้กรอก หรือข้อความหลังป้าย
        const raw = String(grid.text(r, c) ?? '');
        const hit = rule.re.exec(raw);
        if (!hit) continue;
        const after = raw.slice(hit.index + hit[0].length);
        if (FILLER.test(after)) cells[addr(r, c)] = raw.replace(FILLER, ` ${rule.v}`).replace(/\s+$/, '');
        else if (clean(after.replace(/^[\s:：]+/, ''))) cells[addr(r, c)] = `${raw.slice(0, hit.index + hit[0].length)}${/^\s*[:：]/.test(after) ? ' :' : ''}  ${rule.v}`;
      }
    }
  };
  scan(1, layout.headerRow - 1, false);
  scan(layout.footerRow, grid.nRows, true);
  return cells;
}

/** ชีตสรุป: บรรทัดรวมใช้ค่ารวมทุกบริษัท */
function summaryTotalCells(layout) {
  const cells = {};
  const map = { in: '{in}', out: '{out}', total: '{total}', change: '0' };
  for (const col of layout.columns) if (map[col.source]) cells[addr(layout.footerRow, col.col)] = map[col.source];
  return cells;
}

/**
 * วิเคราะห์ชีต → layout ที่เดาให้ (ผู้ใช้แก้ต่อได้ในหน้าแบบฟอร์มประกัน)
 * @param {'company'|'summary'} kind
 */
export function detectLayout(grid, kind = 'company') {
  const headerRow = findHeaderRow(grid, kind);
  if (!headerRow) return null;
  const headerEnd = findHeaderEnd(grid, headerRow, kind);
  const dataRow = headerEnd + 1;
  const footerRow = findFooterRow(grid, dataRow, kind);
  const columns = columnHeaders(grid, headerRow, headerEnd).map(({ col, path }) => {
    const s = suggestSource(path, kind);
    return { col, header: path[path.length - 1], group: path.slice(0, -1).slice(-2).join(' > '), source: s.source, only: s.only ?? '' };
  });
  const layout = { headerRow, headerEnd, dataRow, footerRow, columns, cells: {} };
  layout.cells = { ...detectCells(grid, layout), ...(kind === 'summary' ? summaryTotalCells(layout) : {}) };
  return layout;
}

/** ชีตไหนน่าจะเป็นต้นแบบของบริษัท / สรุป (ชื่อชีต + คะแนนหัวตาราง) */
export function guessSheets(sheets) {
  // sheets = [{ name, grid }]
  const scored = sheets.map((s) => ({ name: s.name, company: findHeaderRow(s.grid, 'company') ? rowTexts(s.grid, findHeaderRow(s.grid, 'company')).filter((t) => HEADER_WORDS.company.test(t)).length : 0 }));
  const summary = sheets.find((s) => /สรุป|summary/i.test(s.name) && findHeaderRow(s.grid, 'summary'))?.name ?? null;
  const company = scored.filter((s) => s.name !== summary).sort((a, b) => b.company - a.company)[0];
  return { company: company?.company ? company.name : null, summary };
}
