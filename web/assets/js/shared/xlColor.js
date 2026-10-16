// สีใน Excel → #RRGGBB (ใช้แสดงตัวอย่างไฟล์ให้ตรงกับที่เห็นใน Excel)
//   { argb } · { theme, tint } (ธีมสีของไฟล์) · { indexed } (จานสีมาตรฐาน 64 สี)

const INDEXED = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
];
// ธีม Office ตั้งต้น (ใช้เมื่อไฟล์ไม่มีธีม)
const OFFICE = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];

/** theme1.xml → จานสีตามลำดับ index ของ Excel (0 lt1, 1 dk1, 2 lt2, 3 dk2, 4–9 accent1–6, 10 hlink, 11 folHlink) */
export function themePalette(xml) {
  const scheme = xml?.match(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/)?.[0];
  if (!scheme) return OFFICE;
  const get = (name) => scheme.match(new RegExp(`<a:${name}>[\\s\\S]*?(?:val|lastClr)="([0-9A-Fa-f]{6})"`))?.[1] ?? null;
  const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  return order.map((n, i) => get(n) ?? OFFICE[i]);
}

function tinted(hex, tint) {
  if (!tint) return hex;
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const f = (p, q, t) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    [r, g, b] = [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
  }
  return [r, g, b].map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** สีของ ExcelJS → '#RRGGBB' หรือ '' (ไม่มี / สีอัตโนมัติ) · indexed = จานสีของไฟล์ (ถ้ากำหนดเอง) */
export function resolveColor(c, palette = OFFICE, indexed = null) {
  if (!c) return '';
  let hex = null;
  if (c.argb) hex = String(c.argb).slice(-6);
  else if (c.theme !== undefined) hex = palette[c.theme] ?? null;
  else if (c.indexed !== undefined) hex = (indexed ?? INDEXED)[c.indexed] ?? null; // 64 = สีอัตโนมัติ
  return hex ? `#${tinted(hex.toUpperCase(), c.tint)}` : '';
}
