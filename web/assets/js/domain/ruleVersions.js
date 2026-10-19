// กฎสวัสดิการแบบมีวันที่มีผล — คู่แฝดของ backend/domain/rule_versions.php (แก้ที่หนึ่งต้องแก้อีกที่)
//
// กฎแต่ละข้อมี "ฉบับ" (revision) ได้หลายฉบับ: { id (= รหัสกฎ คงที่ทุกฉบับ), revisionId, effectiveFrom, deleted, ...ค่าของกฎ }
// กฎที่ใช้ ณ วันที่ d = ฉบับล่าสุดที่ effectiveFrom <= d ของแต่ละรหัสกฎ (ฉบับที่ลบ = กฎนั้นไม่มีผลแล้ว)
// แก้กฎ = เพิ่มฉบับใหม่ที่มีวันที่มีผล — ฉบับเก่ายังอยู่เป็นประวัติ · การแจ้ง/แจกที่ทำไปแล้วไม่เปลี่ยน

/** วันที่มีผลของกฎตั้งต้น (ใช้ตั้งแต่เริ่มระบบ) */
export const RULE_EPOCH = '2000-01-01';

/** ฉบับที่ใหม่กว่า: วันที่มีผลหลังกว่า หรือวันเดียวกันแต่บันทึกทีหลัง */
const newer = (a, b) => a.effectiveFrom > b.effectiveFrom || (a.effectiveFrom === b.effectiveFrom && a.revisionId > b.revisionId);

/** ฉบับที่ใช้อยู่ของแต่ละรหัสกฎ ณ วันที่ asOf (รวมฉบับที่ลบ) */
function latestByRule(revisions, asOf) {
  const best = new Map();
  for (const r of revisions) {
    if (r.effectiveFrom > asOf) continue;
    const cur = best.get(r.id);
    if (!cur || newer(r, cur)) best.set(r.id, r);
  }
  return best;
}

/** กฎที่มีผล ณ วันที่ asOf เรียงตามรหัสกฎ — ตัด revisionId / deleted ออก (หน้าตาเดียวกับกฎทั่วไป) */
export function activeRules(revisions, asOf) {
  return [...latestByRule(revisions, asOf).values()]
    .filter((r) => !r.deleted)
    .sort((a, b) => a.id - b.id)
    .map(({ revisionId: _r, deleted: _d, ...rule }) => rule);
}

/** ค่าตั้งค่าที่มีผล ณ วันที่ asOf จากแถว { key, value, effectiveFrom } */
export function activeSettings(rows, asOf) {
  const best = new Map();
  for (const s of rows) {
    if (s.effectiveFrom > asOf) continue;
    const cur = best.get(s.key);
    if (!cur || s.effectiveFrom >= cur.effectiveFrom) best.set(s.key, s);
  }
  return Object.fromEntries([...best.values()].map((s) => [s.key, s.value]));
}

/**
 * ประวัติ + การเปลี่ยนแปลงที่รอมีผลของกฎทุกข้อ (หน้าเงื่อนไขสวัสดิการ)
 * @returns {{ id: number, current: object|null, pending: object[], history: object[] }[]}  เรียงตามรหัสกฎ
 */
export function ruleTimeline(revisions, asOf) {
  const latest = latestByRule(revisions, asOf);
  const ids = [...new Set(revisions.map((r) => r.id))].sort((a, b) => a - b);
  return ids.map((id) => {
    const mine = revisions.filter((r) => r.id === id).sort((a, b) => (newer(a, b) ? -1 : 1));
    const cur = latest.get(id) ?? null;
    return {
      id,
      current: cur && !cur.deleted ? cur : null,
      pending: mine.filter((r) => r.effectiveFrom > asOf).reverse(),
      history: mine.filter((r) => r.effectiveFrom <= asOf),
    };
  });
}

/** ฉบับตั้งต้นจากกฎชุดเดียว (seed / ข้อมูลรุ่นก่อน) */
export const toRevisions = (rules) =>
  rules.map((r) => ({ ...r, revisionId: r.id, effectiveFrom: r.effectiveFrom ?? RULE_EPOCH, deleted: false }));
