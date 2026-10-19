// ส่งเบิกชุดฟอร์มผ่านระบบสต็อก HR — แปลงข้อมูลไป/กลับระหว่างสิทธิ์ของระบบนี้กับใบเบิกของสต็อก
// (ใช้ทั้ง MockApi และ PHP backend เฟส 2 — ไม่มีการเรียกเครือข่ายในไฟล์นี้)

/** รหัสอ้างอิงสิทธิ์ที่ระบบสต็อกใช้กันส่งซ้ำ — หนึ่งสิทธิ์มีใบที่มีผลได้ใบเดียว */
export const stockRef = (employeeId, entitlementKey) => `${employeeId}:${entitlementKey}`;

/** จำนวนตั้งต้นต่อรายการ: รองเท้า 1 คู่ นอกนั้นตามจำนวนของสิทธิ์ (แก้ได้ในหน้าส่งเบิก) */
export const defaultLineQty = (itemCode, qty) => (itemCode === 'SAFETY_SHOES' ? 1 : qty);

/** แบบที่ควรเลือกให้ก่อน — แบบชาย/หญิงตามเพศของพนักงาน ถ้ามีข้อมูล */
function preferredVariant(variants, gender) {
  const want = gender === 'F' ? 'หญิง' : gender === 'M' ? 'ชาย' : null;
  const i = want ? variants.findIndex((v) => v.label.includes(want)) : -1;
  return i >= 0 ? i : 0;
}

/**
 * ตัวเลือกในหน้าส่งเบิก จากคำตอบ catalog ของระบบสต็อก
 * @param {{key: string, event: string, qty: number, items: string[]}} ent สิทธิ์ (UniformEntitlement)
 * @param {{department: object|null, items: {item_code: string, variants: object[]}[]}} catalog
 * @param {{gender?: string|null}} emp
 */
export function buildStockOptions(ent, catalog, emp) {
  const byCode = new Map(catalog.items.map((i) => [i.item_code, i]));
  const items = ent.items.map((code) => {
    const variants = (byCode.get(code)?.variants ?? []).map((v) => ({
      subCategoryId: v.sub_category_id,
      label: v.variant_label,
      name: v.sub_category_name,
      products: v.products.map((p) => ({ productId: p.product_id, code: p.product_code, name: p.product_name, size: p.size, onHand: p.on_hand })),
    }));
    return { itemCode: code, qty: defaultLineQty(code, ent.qty), variants, variantIndex: preferredVariant(variants, emp.gender) };
  });
  const d = catalog.department;
  return {
    department: d ? { id: d.department_id, name: d.department_name, company: d.company_name } : null,
    items,
    /** ส่งเบิกได้เมื่อหน่วยงานจับคู่แล้ว และทุกรายการมีแบบในสต็อก */
    blockers: [
      ...(d ? [] : ['หน่วยงานของพนักงานยังไม่ได้จับคู่กับหน่วยงานในระบบสต็อก']),
      ...items.filter((i) => !i.variants.length).map((i) => `ยังไม่ได้จับคู่ "${i.itemCode}" กับสินค้าในระบบสต็อก`),
    ],
  };
}

/** ข้อมูลที่ส่งให้คำสั่ง submit ของระบบสต็อก */
export function stockSubmitPayload(emp, site, ent, logo, lines, byName) {
  return {
    action: 'submit',
    employee_id: emp.id,
    employee_code: emp.empCode,
    employee_name: `${emp.firstName} ${emp.lastName}`,
    position_name: emp.position ?? emp.deptGroup ?? '',
    company_code: emp.companyCode,
    logo,
    site_id: emp.siteId,
    site_name: site?.name ?? '',
    event: ent.event,
    entitlement_key: ent.key,
    requested_by_name: byName,
    lines: lines.map((l) => ({ item_code: l.itemCode, product_id: l.productId, qty: l.qty })),
  };
}

/** สถานะ 1 สิทธิ์จากคำสั่ง status → StockRequest ที่เก็บในระบบนี้ */
export function toStockRequest(ref, s) {
  return {
    ref,
    docId: s.doc_id,
    docNo: s.doc_no,
    stage: s.stage,
    issuedAt: s.issued_at ?? null,
    receivedAt: s.received_at ?? null,
    cancelNote: s.cancel_note ?? '',
    items: (s.items ?? []).map((i) => ({ productId: i.product_id, name: i.product_name, size: i.size, qty: i.qty })),
  };
}

/** ไซซ์ของทุกบรรทัดต่อกัน ใช้แสดงในคอลัมน์ "ไซซ์" ของประวัติ */
export const stockSizes = (stock) => [...new Set(stock.items.map((i) => i.size))].join(' · ') || '–';

/**
 * เทียบสถานะเดิมกับที่ระบบสต็อกตอบ → การเปลี่ยนแปลงที่ต้องบันทึก
 * @returns {'NONE'|'UPDATE'|'ISSUED'|'RECEIVED'|'CANCELLED'}
 */
export function stockChange(prev, next) {
  if (!next) return 'NONE';
  if (next.stage === 'CANCELLED') return 'CANCELLED';
  if (next.stage !== prev.stage) return next.stage === 'REQUESTED' ? 'UPDATE' : next.stage;
  return JSON.stringify(next.items) === JSON.stringify(prev.items) ? 'NONE' : 'UPDATE';
}
