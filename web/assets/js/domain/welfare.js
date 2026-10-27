// สวัสดิการเพิ่มเติมที่ HR สร้างเอง (คู่แฝด: backend/domain/welfare.php — แก้ที่หนึ่งต้องแก้อีกที่)
//
//   WelfareProgram = { id, name, icon, description, active, sortOrder,
//                      frequency, waitFrom, unit, rules: WelfareRule[], fields: WelfareField[] }
//   WelfareRule    = { id, label, companies, employeeTypes, deptGroups, positions, genders  (null = ทุกค่า)
//                      levelMin, levelMax (null = ไม่จำกัด), waitDays, amount (null = ไม่กำหนดจำนวน), note }
//   WelfareField   = { key, label, type: 'text'|'number'|'date'|'select', options: string[], required }
//   WelfareRecord  = { id, programId, employeeId, periodKey, date, amount, data: {key: value}, note, recordedBy, createdAt }
//
//   กฎเลือกตามลำดับ — ข้อแรกที่ตรงทุกเงื่อนไขคือสิทธิ์ของพนักงาน (เรียงข้อเฉพาะไว้ก่อนข้อทั่วไป)
//   รอบ (periodKey): ONCE = ครั้งเดียว · Y-2026 = ปีละครั้ง · M-2026-03 = เดือนละครั้ง
//                    ANYTIME = เบิกได้หลายครั้งในปี (Y-2026) ไม่เกินวงเงินต่อปี (amount — null = ไม่จำกัด)
import { addDays } from './date.js';
import { probationDueDate } from './employee.js';
import { waitStartDate } from './transfer.js';

export const WELFARE_FREQUENCIES = ['ONCE', 'YEARLY', 'MONTHLY', 'ANYTIME'];
export const WELFARE_WAIT_FROM = ['START', 'PROBATION'];
export const WELFARE_FIELD_TYPES = ['text', 'number', 'date', 'select'];
/** รอบย้อนหลังที่ยังให้ได้ (เหมือนชุดฟอร์มประจำปี) */
export const WELFARE_YEARS_BACK = 3;
export const WELFARE_MONTHS_BACK = 12;
export const WELFARE_MAX_RULES = 50;
export const WELFARE_MAX_FIELDS = 20;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round(n * 100) / 100;
const inList = (list, v) => list === null || (v !== null && v !== undefined && list.includes(v));
const pad2 = (n) => String(n).padStart(2, '0');

/** กฎข้อแรกที่พนักงานตรงทุกเงื่อนไข — null = ไม่มีสิทธิ์ */
export function matchWelfareRule(emp, rules) {
  return (
    rules.find(
      (r) =>
        inList(r.companies, emp.companyCode) &&
        inList(r.employeeTypes, emp.employeeType) &&
        inList(r.deptGroups, emp.deptGroup) &&
        inList(r.positions, emp.position) &&
        inList(r.genders, emp.gender) &&
        (r.levelMin === null || (emp.level !== null && emp.level >= r.levelMin)) &&
        (r.levelMax === null || (emp.level !== null && emp.level <= r.levelMax)),
    ) ?? null
  );
}

/** วันสุดท้ายที่นับสิทธิ์ — พ้นสภาพแล้ว = วันพ้นสภาพ (ถ้าก่อนวันนี้) */
function limitDate(emp, today) {
  const end = emp.status === 'INACTIVE' ? (emp.endDate ?? emp.lastWorkingDate ?? today) : null;
  return end !== null && end < today ? end : today;
}

/** รอบที่ถึงกำหนดแล้ว ตั้งแต่วันครบสิทธิ์ถึงวัน limit — เก่าสุดก่อน */
function periodsBetween(frequency, eligibleDate, limit) {
  if (frequency === 'ONCE') return [{ key: 'ONCE', dueDate: eligibleDate }];
  const ly = Number(limit.slice(0, 4));
  if (frequency === 'MONTHLY') {
    const lm = ly * 12 + Number(limit.slice(5, 7)) - 1;
    const em = Number(eligibleDate.slice(0, 4)) * 12 + Number(eligibleDate.slice(5, 7)) - 1;
    const out = [];
    for (let m = Math.max(em, lm - WELFARE_MONTHS_BACK + 1); m <= lm; m++) {
      const first = `${Math.floor(m / 12)}-${pad2((m % 12) + 1)}-01`;
      out.push({ key: `M-${first.slice(0, 7)}`, dueDate: first > eligibleDate ? first : eligibleDate });
    }
    return out;
  }
  // YEARLY: ย้อนหลังได้ · ANYTIME: วงเงินปีปัจจุบันเท่านั้น (ไม่สะสม)
  const from = frequency === 'ANYTIME' ? ly : Math.max(Number(eligibleDate.slice(0, 4)), ly - WELFARE_YEARS_BACK + 1);
  const out = [];
  for (let y = from; y <= ly; y++) {
    const first = `${y}-01-01`;
    out.push({ key: `Y-${y}`, dueDate: first > eligibleDate ? first : eligibleDate });
  }
  return out;
}

/**
 * สิทธิ์สวัสดิการ 1 อย่างของพนักงาน 1 คน
 * state: NONE ไม่มีสิทธิ์ · WAITING รอครบสิทธิ์ · DUE มีรอบที่ยังไม่ได้ให้ (ANYTIME = ยังมีวงเงิน) · DONE ให้ครบแล้ว
 */
export function welfareStatus(emp, program, records, today) {
  const none = (reason, partial = {}) => ({
    state: 'NONE',
    eligible: false,
    reasons: [reason],
    ruleId: null,
    ruleLabel: null,
    amount: null,
    eligibleDate: null,
    periods: [],
    due: 0,
    ...partial,
  });
  const rule = matchWelfareRule(emp, program.rules);
  if (!rule) return none('ไม่ตรงเงื่อนไขของสวัสดิการนี้');
  const base = program.waitFrom === 'PROBATION' ? (emp.probationPassDate ?? probationDueDate(emp.startDate)) : waitStartDate(emp);
  const eligibleDate = addDays(base, rule.waitDays);
  const limit = limitDate(emp, today);
  const head = { ruleId: rule.id, ruleLabel: rule.label, amount: rule.amount, eligibleDate };
  if (eligibleDate > limit) {
    if (emp.status !== 'ACTIVE') return none('พ้นสภาพก่อนครบสิทธิ์', head);
    return { ...head, state: 'WAITING', eligible: true, reasons: [], periods: [], due: 0 };
  }
  const mine = records.filter((r) => r.employeeId === emp.id && r.programId === program.id);
  const periods = periodsBetween(program.frequency, eligibleDate, limit).map((p) => {
    const recs = mine.filter((r) => r.periodKey === p.key);
    const used = round2(recs.reduce((s, r) => s + (r.amount ?? 0), 0));
    const anytime = program.frequency === 'ANYTIME';
    const remaining = anytime && rule.amount !== null ? round2(rule.amount - used) : null;
    return {
      key: p.key,
      dueDate: p.dueDate,
      used,
      remaining,
      done: anytime ? remaining !== null && remaining <= 0 : recs.length > 0,
      recordIds: recs.map((r) => r.id),
    };
  });
  const due = periods.filter((p) => !p.done).length;
  return { ...head, state: due ? 'DUE' : 'DONE', eligible: true, reasons: [], periods, due };
}

/** ค่าว่างของช่องข้อมูล */
const blank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * ตรวจการบันทึกให้สิทธิ์ — status = welfareStatus ของพนักงานคนนั้น ณ วันนี้
 * @returns {Object<string, string>} ช่อง → ข้อความ (data.<key> = ช่องข้อมูลของสวัสดิการ)
 */
export function validateWelfareRecord(program, status, input) {
  const errors = {};
  const period = status.periods.find((p) => p.key === input.periodKey);
  if (!status.eligible) errors.periodKey = status.reasons[0] ?? 'พนักงานไม่มีสิทธิ์สวัสดิการนี้';
  else if (status.state === 'WAITING') errors.periodKey = 'ยังไม่ครบสิทธิ์';
  else if (!period) errors.periodKey = 'ไม่พบรอบนี้ หรือเลยกำหนดย้อนหลังแล้ว';
  else if (period.done) errors.periodKey = program.frequency === 'ANYTIME' ? 'ใช้สิทธิ์ครบวงเงินของปีนี้แล้ว' : 'รอบนี้ให้แล้ว';
  if (!input.date || !ISO.test(input.date)) errors.date = 'กรุณาระบุวันที่ให้';
  const amt = input.amount;
  if (amt !== null && amt !== undefined && !(typeof amt === 'number' && Number.isFinite(amt) && amt >= 0)) errors.amount = 'จำนวนต้องเป็นตัวเลขไม่ติดลบ';
  else if (program.frequency === 'ANYTIME' && status.amount !== null) {
    if (amt === null || amt === undefined || amt <= 0) errors.amount = 'กรุณาระบุจำนวนที่เบิก';
    else if (period && !period.done && amt > period.remaining) errors.amount = `เกินวงเงินคงเหลือ (${period.remaining})`;
  }
  const data = input.data ?? {};
  for (const f of program.fields) {
    const v = data[f.key];
    if (blank(v)) {
      if (f.required) errors[`data.${f.key}`] = `กรุณากรอก${f.label}`;
    } else if (f.type === 'number' && !(typeof v === 'number' && Number.isFinite(v))) errors[`data.${f.key}`] = `${f.label}ต้องเป็นตัวเลข`;
    else if (f.type === 'date' && !(typeof v === 'string' && ISO.test(v))) errors[`data.${f.key}`] = `${f.label}ไม่ใช่วันที่`;
    else if (f.type === 'select' && !f.options.includes(v)) errors[`data.${f.key}`] = `เลือก${f.label}จากรายการ`;
  }
  return errors;
}

// ---------- ตั้งค่าสวัสดิการ ----------
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const intOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);
const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
/** รายการเลือก: null / ว่าง = ทุกค่า */
const listOrNull = (v) => {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean))];
  return out.length ? out : null;
};

/** รหัสที่ยังไม่มี (เงื่อนไขใหม่ = 0 / ช่องข้อมูลใหม่ = '') → ต่อจากเลขมากสุด — รหัสเดิมคงที่ (ข้อมูลที่บันทึกแล้วอ้างอยู่) */
function fillIds(p) {
  let id = Math.max(0, ...p.rules.map((r) => (Number.isInteger(r.id) ? r.id : 0)));
  for (const r of p.rules) if (r.id === 0) r.id = ++id;
  let n = Math.max(0, ...p.fields.map((f) => (/^f\d+$/.test(f.key) ? Number(f.key.slice(1)) : 0)));
  for (const f of p.fields) if (f.key === '') f.key = `f${++n}`;
  return p;
}

/** ค่าจากหน้าเว็บ → สวัสดิการที่เก็บ (ตัดช่องว่าง เติมค่าเริ่มต้น) — ตรวจต่อด้วย validateWelfareProgram */
export function normalizeWelfareProgram(input) {
  return fillIds({
    id: input.id ?? null,
    name: str(input.name, 100),
    icon: str(input.icon, 40) || 'gift',
    description: str(input.description, 500),
    active: input.active === undefined ? true : !!input.active,
    frequency: input.frequency,
    waitFrom: input.waitFrom ?? 'START',
    unit: str(input.unit, 20),
    rules: (Array.isArray(input.rules) ? input.rules : []).map((r) => ({
      id: r.id === undefined || r.id === null || r.id === '' ? 0 : Number(r.id),
      label: str(r.label, 100),
      companies: listOrNull(r.companies),
      employeeTypes: listOrNull(r.employeeTypes),
      deptGroups: listOrNull(r.deptGroups),
      positions: listOrNull(r.positions),
      genders: listOrNull(r.genders),
      levelMin: intOrNull(r.levelMin),
      levelMax: intOrNull(r.levelMax),
      waitDays: intOrNull(r.waitDays) ?? 0,
      amount: numOrNull(r.amount),
      note: str(r.note, 500),
    })),
    fields: (Array.isArray(input.fields) ? input.fields : []).map((f) => ({
      key: str(f.key, 30),
      label: str(f.label, 100),
      type: f.type,
      options: f.type === 'select' && Array.isArray(f.options) ? [...new Set(f.options.map((o) => str(o, 100)).filter(Boolean))] : [],
      required: !!f.required,
    })),
  });
}

/**
 * ตรวจสวัสดิการ (หลัง normalize) — others = สวัสดิการอื่นทั้งหมด (ตรวจชื่อซ้ำ)
 * @returns {Object<string, string>} ช่อง → ข้อความ · rules.<i>.<ช่อง> / fields.<i>.<ช่อง>
 */
export function validateWelfareProgram(p, others) {
  const e = {};
  if (!p.name) e.name = 'กรุณาตั้งชื่อสวัสดิการ';
  else if (others.some((o) => o.id !== p.id && o.name.toLowerCase() === p.name.toLowerCase())) e.name = 'มีสวัสดิการชื่อนี้แล้ว';
  if (!WELFARE_FREQUENCIES.includes(p.frequency)) e.frequency = 'กรุณาเลือกรอบการให้สิทธิ์';
  if (!WELFARE_WAIT_FROM.includes(p.waitFrom)) e.waitFrom = 'กรุณาเลือกวันเริ่มนับ';
  if (!p.rules.length) e.rules = 'ต้องมีเงื่อนไขผู้มีสิทธิ์อย่างน้อย 1 ข้อ';
  else if (p.rules.length > WELFARE_MAX_RULES) e.rules = `เงื่อนไขได้ไม่เกิน ${WELFARE_MAX_RULES} ข้อ`;
  const ruleIds = new Set();
  p.rules.forEach((r, i) => {
    const k = `rules.${i}.`;
    if (!Number.isInteger(r.id) || r.id < 1 || ruleIds.has(r.id)) e[`${k}id`] = 'รหัสเงื่อนไขไม่ถูกต้อง';
    ruleIds.add(r.id);
    for (const f of ['levelMin', 'levelMax']) if (r[f] !== null && !(Number.isInteger(r[f]) && r[f] >= 1 && r[f] <= 20)) e[k + f] = 'ระดับต้องเป็นเลข 1–20';
    if (r.levelMin !== null && r.levelMax !== null && !e[`${k}levelMax`] && r.levelMin > r.levelMax) e[`${k}levelMax`] = 'ระดับสูงสุดต้องไม่น้อยกว่าต่ำสุด';
    if (!(Number.isInteger(r.waitDays) && r.waitDays >= 0 && r.waitDays <= 3650)) e[`${k}waitDays`] = 'จำนวนวันต้องเป็นเลข 0–3650';
    if (r.amount !== null && !(Number.isFinite(r.amount) && r.amount >= 0)) e[`${k}amount`] = 'จำนวนต้องเป็นตัวเลขไม่ติดลบ';
    if (r.genders && r.genders.some((g) => g !== 'M' && g !== 'F')) e[`${k}genders`] = 'เพศไม่ถูกต้อง';
  });
  if (p.fields.length > WELFARE_MAX_FIELDS) e.fields = `ช่องข้อมูลได้ไม่เกิน ${WELFARE_MAX_FIELDS} ช่อง`;
  const keys = new Set();
  p.fields.forEach((f, i) => {
    const k = `fields.${i}.`;
    if (!/^[a-z][a-z0-9_]{0,29}$/.test(f.key) || keys.has(f.key)) e[`${k}key`] = 'รหัสช่องข้อมูลไม่ถูกต้อง';
    keys.add(f.key);
    if (!f.label) e[`${k}label`] = 'กรุณาตั้งชื่อช่อง';
    if (!WELFARE_FIELD_TYPES.includes(f.type)) e[`${k}type`] = 'ชนิดข้อมูลไม่ถูกต้อง';
    else if (f.type === 'select' && !f.options.length) e[`${k}options`] = 'ใส่ตัวเลือกอย่างน้อย 1 ค่า';
  });
  return e;
}

/** จำนวนพนักงานที่ยังค้างให้ (ตัวนับบนเมนู) — ANYTIME ไม่นับ (ใช้สิทธิ์เมื่อพนักงานขอ ไม่ใช่งานค้าง) */
export function welfareDueCount(program, employees, records, today) {
  if (program.frequency === 'ANYTIME') return 0;
  return employees.filter((e) => welfareStatus(e, program, records, today).state === 'DUE').length;
}

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** ชื่อรอบ: ONCE = ครั้งเดียว · Y-2026 = ปี 2569 · M-2026-03 = มี.ค. 2569 (พ.ศ.) */
export function welfarePeriodLabel(key) {
  if (key === 'ONCE') return 'ครั้งเดียว';
  let m = /^Y-(\d{4})$/.exec(key);
  if (m) return `ปี ${Number(m[1]) + 543}`;
  m = /^M-(\d{4})-(\d{2})$/.exec(key);
  if (m) return `${MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
  return key;
}
