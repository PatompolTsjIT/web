/**
 * ระบบยกระดับชั้นความน่าเชื่อถือของข้อมูล (Evidence Tier Promotion)
 *
 *   ชั้น D → ชั้น B   เจ้าหน้าที่ตรวจรายงานของผู้ใช้ที่ตรงกัน แล้วรับรองเป็น "หลักฐานที่ตรวจแล้ว"
 *   ชั้น B → ชั้น A   เจ้าหน้าที่ ททท. รับข้อมูลเข้าเป็นระเบียนทางการของ ททท.
 *
 * กติกา Track 1: ไม่เดาแทนข้อมูลที่หายไป — ทุกการยกระดับต้องมี
 *   (1) ฐานหลักฐานที่มีอยู่จริง  (2) ผู้รับผิดชอบ  (3) เหตุผล  (4) ย้อนกลับได้
 * ทุกครั้งที่ยกระดับจะบันทึกลง ledger ใน database-attraction.json ไม่ลบของเดิมทิ้ง
 */

import { db, persist, nextId } from './db.js';

/** จำนวนผู้รายงานตรงกันขั้นต่ำก่อนที่ชั้น D จะถูกยกเป็นชั้น B ได้ */
export const PROMOTE_D_TO_B_MIN_CONFIRMATIONS = 2;

export const PROMOTION_RULES = {
  'D->B': {
    from: 'D',
    to: 'B',
    label: 'รับรองรายงานผู้ใช้เป็นหลักฐานที่ตรวจแล้ว',
    requirement: `ต้องมีผู้รายงานค่าเดียวกันอย่างน้อย ${PROMOTE_D_TO_B_MIN_CONFIRMATIONS} คน`,
    reviewerRole: 'ผู้ตรวจข้อมูล',
  },
  'B->A': {
    from: 'B',
    to: 'A',
    label: 'รับเข้าเป็นระเบียนทางการของ ททท.',
    requirement: 'ต้องมีค่าชั้น B อยู่แล้ว (AI สกัด หรือรับรองมาจากชั้น D) และระบุผู้รับผิดชอบ',
    reviewerRole: 'เจ้าหน้าที่ ททท.',
  },
};

/* ------------------------------------------------------------------ */
/*  ดัชนีการยกระดับ — siteId|field → รายการล่าสุดที่ยังไม่ถูกถอน        */
/* ------------------------------------------------------------------ */

let index = null;
let indexSize = -1;

function list() {
  const d = db();
  if (!Array.isArray(d.promotions)) d.promotions = [];
  return d.promotions;
}

function ensureIndex() {
  const all = list();
  if (index && indexSize === all.length) return index;
  index = new Map();
  for (const p of all) {
    if (p.revokedAt) continue;
    const key = `${p.siteId}|${p.field}`;
    const prev = index.get(key);
    // เก็บรายการที่ยกไปถึงชั้นสูงสุด (A ชนะ B) ถ้าเท่ากันเอาอันล่าสุด
    if (!prev || rank(p.to) > rank(prev.to) || (rank(p.to) === rank(prev.to) && p.createdAt >= prev.createdAt)) {
      index.set(key, p);
    }
  }
  indexSize = all.length;
  return index;
}

/** ชั้นไหน "สูง" กว่ากัน — ใช้ตัดสินว่าการยกระดับไหนมีผล */
export function rank(tier) {
  return { C: 0, D: 1, B: 2, A: 3 }[tier] ?? 0;
}

export function invalidatePromotionIndex() {
  index = null;
  indexSize = -1;
}

/** การยกระดับที่มีผลอยู่ของช่องข้อมูลหนึ่ง (null ถ้ายังไม่เคยยก) */
export function activePromotion(siteId, fieldKey) {
  return ensureIndex().get(`${siteId}|${fieldKey}`) || null;
}

/** ประวัติการยกระดับทั้งหมดของช่องข้อมูลหนึ่ง เรียงเก่า → ใหม่ */
export function promotionHistory(siteId, fieldKey) {
  return list().filter((p) => p.siteId === String(siteId) && p.field === fieldKey);
}

/* ------------------------------------------------------------------ */
/*  บันทึกการยกระดับ                                                   */
/* ------------------------------------------------------------------ */

/**
 * @param {object} input
 * @param {string} input.siteId      รหัสแหล่งท่องเที่ยว
 * @param {string} input.field       คีย์ฟิลด์ (season, payment, …)
 * @param {'B'|'A'} input.to         ชั้นปลายทาง
 * @param {string} input.from        ชั้นต้นทางที่ผู้ตรวจเห็นตอนกดยกระดับ
 * @param {string} input.value       ค่าที่รับรอง
 * @param {string} input.by          ชื่อผู้รับผิดชอบ
 * @param {string} input.note        เหตุผล/หลักฐานที่ใช้ตรวจ
 * @param {object} input.basis       สรุปหลักฐานที่ระบบเห็น ณ ตอนยกระดับ (แช่แข็งไว้เพื่อการตรวจสอบย้อนหลัง)
 */
export function recordPromotion({ siteId, field, from, to, value, by, note, basis = null }) {
  const entry = {
    id: nextId('promotion'),
    siteId: String(siteId),
    field,
    from,
    to,
    rule: `${from}->${to}`,
    value: String(value),
    by: by || 'ไม่ระบุผู้รับผิดชอบ',
    note: note || '',
    basis,
    createdAt: new Date().toISOString(),
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
  };
  list().push(entry);
  invalidatePromotionIndex();
  persist({ immediate: true });
  return entry;
}

/** ถอนการยกระดับ — ไม่ลบประวัติ แค่ทำเครื่องหมายว่าถอนแล้ว */
export function revokePromotion(id, { by = 'ไม่ระบุ', reason = '' } = {}) {
  const entry = list().find((p) => p.id === id);
  if (!entry) return null;
  if (entry.revokedAt) return entry;
  entry.revokedAt = new Date().toISOString();
  entry.revokedBy = by;
  entry.revokeReason = reason;
  invalidatePromotionIndex();
  persist({ immediate: true });
  return entry;
}

export function allPromotions({ includeRevoked = true } = {}) {
  const all = [...list()].reverse();
  return includeRevoked ? all : all.filter((p) => !p.revokedAt);
}
