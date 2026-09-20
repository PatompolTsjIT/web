import { db } from './db.js';
import { activePromotion, promotionHistory, PROMOTE_D_TO_B_MIN_CONFIRMATIONS } from './promote.js';

/* ------------------------------------------------------------------ */
/*  ฟิลด์ที่จำเป็นต่อการวางแผนทริปนอกเมือง                              */
/* ------------------------------------------------------------------ */
export const FIELD_SPECS = [
  { key: 'season', label: 'ฤดูกาลที่เหมาะ', weight: 5, question: 'ช่วงไหนของปีเหมาะไปที่นี่ที่สุด' },
  { key: 'payment', label: 'ช่องทางชำระเงิน', weight: 5, question: 'ที่นี่จ่ายด้วยบัตร/สแกนได้ไหม หรือต้องใช้เงินสด' },
  { key: 'facilities', label: 'ห้องน้ำ/ที่จอดรถ', weight: 4, question: 'มีห้องน้ำและที่จอดรถหรือไม่' },
  { key: 'food', label: 'จุดอาหาร/ร้านค้า', weight: 4, question: 'มีร้านอาหารหรือร้านค้าใกล้ ๆ หรือไม่' },
  { key: 'fee', label: 'ค่าเข้าชม', weight: 3, question: 'ค่าเข้าชมเท่าไร (ถ้าไม่เก็บให้ตอบ 0)' },
  { key: 'hours', label: 'เวลาเปิด-ปิด', weight: 3, question: 'เปิด-ปิดกี่โมง ตรงกับที่ระบบแสดงไหม' },
  { key: 'ev', label: 'จุดชาร์จรถ EV', weight: 2, question: 'มีจุดชาร์จรถ EV ที่นี่หรือระหว่างทางหรือไม่' },
];
export const FIELD_MAP = Object.fromEntries(FIELD_SPECS.map((f) => [f.key, f]));

export const TIER_INFO = {
  A: { label: 'ข้อมูล ททท.', color: 'green', note: 'ฟิลด์ต้นทางจากชุดข้อมูล ททท.' },
  B: { label: 'AI สกัดจากข้อความ', color: 'amber', note: 'สกัดจากข้อความต้นฉบับ กดดูประโยคอ้างอิงได้' },
  D: { label: 'ผู้ใช้รายงานหลังไปจริง', color: 'blue', note: 'ต้องมีคนยืนยันตรงกัน 2 คนจึงแสดงเป็นข้อมูลยืนยัน' },
  C: { label: 'ไม่มีข้อมูล', color: 'grey', note: 'ไม่พบในชุดข้อมูล — ระบบไม่เดาแทน' },
};

const CONFIRM_THRESHOLD = 2;

/* ------------------------------------------------------------------ */
/*  รวมชั้นข้อมูล D (ผู้ใช้รายงาน) เข้ากับชั้น A/B โดยไม่ทับกัน          */
/* ------------------------------------------------------------------ */
let reportIndex = null;
let reportIndexSize = -1;

function ensureReportIndex() {
  const list = db().fieldReports;
  if (reportIndex && reportIndexSize === list.length) return reportIndex;
  reportIndex = new Map();
  for (const r of list) {
    const key = `${r.siteId}|${r.field}`;
    if (!reportIndex.has(key)) reportIndex.set(key, []);
    reportIndex.get(key).push(r);
  }
  reportIndexSize = list.length;
  return reportIndex;
}

export function invalidateReportIndex() {
  reportIndex = null;
  reportIndexSize = -1;
}

export function reportsFor(siteId, fieldKey) {
  return ensureReportIndex().get(`${siteId}|${fieldKey}`) || [];
}

function consolidateReports(reports) {
  if (!reports.length) return null;
  const groups = new Map();
  for (const r of reports) {
    const norm = String(r.value).trim().toLowerCase();
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push(r);
  }
  let best = null;
  for (const [, list] of groups) {
    if (!best || list.length > best.length) best = list;
  }
  const latest = best[best.length - 1];
  return {
    tier: 'D',
    value: latest.value,
    field: 'user-report',
    confirmations: best.length,
    confirmed: best.length >= CONFIRM_THRESHOLD,
    reportedAt: latest.createdAt,
    reporters: best.map((r) => r.by || 'ผู้ใช้'),
  };
}

export function mergedFields(site) {
  const out = {};
  for (const spec of FIELD_SPECS) {
    const base = site.fields?.[spec.key] || { tier: 'C', value: null };
    const d = consolidateReports(reportsFor(site.id, spec.key));
    const promo = activePromotion(site.id, spec.key);

    /* การยกระดับโดยผู้ตรวจ = คำตัดสินของคน จึงถือเป็นค่าที่ใช้จริง
       แต่ยังเก็บค่าต้นทางไว้ให้ตรวจสอบย้อนหลังได้ทุกเมื่อ */
    const promoted = promo
      ? {
          tier: promo.to,
          value: promo.value,
          field: promo.to === 'A' ? 'ททท.-verified' : 'reviewed-user-report',
          confirmations: promo.basis?.confirmations ?? null,
          confirmed: true,
          evidence: promo.basis?.evidence || null,
          promotion: {
            id: promo.id,
            from: promo.from,
            to: promo.to,
            by: promo.by,
            note: promo.note,
            at: promo.createdAt,
            basis: promo.basis || null,
          },
        }
      : null;

    const organic = d && (d.confirmed || base.tier === 'C') ? d : base;
    const primary = promoted || organic;

    out[spec.key] = {
      label: spec.label,
      primary,
      source: base.tier === 'C' ? null : base,
      community: d,
      promotion: promoted?.promotion || null,
      promotionCount: promo ? promotionHistory(site.id, spec.key).length : 0,
      /** ชั้น D ไม่ทับชั้น A — ถ้าขัดกันแสดงทั้งคู่ (ยกเว้นมีผู้ตรวจตัดสินแล้ว) */
      conflict: Boolean(!promoted && d && base.tier === 'A' && String(d.value).trim() !== String(base.value).trim()),
      known: Boolean(promoted || (d && (d.confirmed || base.tier === 'C')) || base.tier !== 'C'),
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  คิวงานยกระดับชั้นข้อมูล — ช่องไหนพร้อมยก D→B หรือ B→A แล้วบ้าง      */
/* ------------------------------------------------------------------ */

/** ตัวตรวจจริง — รับช่องข้อมูลที่รวมชั้นแล้ว เพื่อไม่ต้องคำนวณ mergedFields ซ้ำ */
function checkMerged(merged, to) {
  const current = merged.primary?.tier || 'C';

  if (to === 'B') {
    const c = merged.community;
    if (!c) return { allowed: false, reason: 'ยังไม่มีรายงานจากผู้ใช้สำหรับช่องนี้', current };
    if ((c.confirmations || 0) < PROMOTE_D_TO_B_MIN_CONFIRMATIONS) {
      return {
        allowed: false,
        reason: `มีผู้รายงานตรงกัน ${c.confirmations} คน — ต้องครบ ${PROMOTE_D_TO_B_MIN_CONFIRMATIONS} คนก่อน`,
        current,
      };
    }
    if (current === 'B' || current === 'A') {
      return { allowed: false, reason: `ช่องนี้อยู่ชั้น ${current} อยู่แล้ว`, current };
    }
    return {
      allowed: true,
      current,
      from: 'D',
      value: c.value,
      basis: {
        confirmations: c.confirmations,
        reporters: c.reporters,
        reportedAt: c.reportedAt,
        evidence: `ผู้ไปจริง ${c.confirmations} คนรายงานตรงกันว่า “${c.value}” (ล่าสุด ${String(c.reportedAt).slice(0, 10)})`,
        sourceTierValue: merged.source ? String(merged.source.value) : null,
      },
    };
  }

  if (to === 'A') {
    if (current !== 'B') {
      return { allowed: false, reason: `ยกเป็นชั้น A ได้เฉพาะช่องที่อยู่ชั้น B — ตอนนี้อยู่ชั้น ${current}`, current };
    }
    const p = merged.primary;
    return {
      allowed: true,
      current,
      from: 'B',
      value: p.value,
      basis: {
        evidence: p.evidence || null,
        sourceField: p.field || null,
        confirmations: p.confirmations ?? null,
        viaPromotion: merged.promotion?.id || null,
      },
    };
  }

  return { allowed: false, reason: 'ยกระดับได้เฉพาะเป็นชั้น B หรือชั้น A', current };
}

/** ตรวจว่าช่องข้อมูลหนึ่งยกระดับไปชั้นที่ขอได้หรือไม่ พร้อมเหตุผลที่อธิบายได้ */
export function checkPromotable(site, fieldKey, to) {
  if (!FIELD_MAP[fieldKey]) return { allowed: false, reason: 'ไม่รู้จักฟิลด์นี้' };
  return checkMerged(mergedFields(site)[fieldKey], to);
}

/** คิวรวมทุกช่องที่พร้อมยกระดับ เรียงตามความคุ้มค่า (น้ำหนักฟิลด์ × ความต้องการจริงของ pod) */
export function promotionQueue({ to = null, province = '', limit = 50 } = {}) {
  const d = db();
  const targets = to ? [to] : ['B', 'A'];
  const rows = [];
  const ctxBySite = new Map();

  for (const pod of d.pods) {
    if (province && pod.province !== province) continue;
    const viewed = d.activity.filter((a) => String(a.podId) === String(pod.id) && a.type === 'view').length;
    const planned = d.plans.filter((p) => String(p.podId) === String(pod.id)).length;
    const demand = 1 + viewed * 0.1 + planned * 1.5;
    for (const id of pod.siteIds) {
      const prev = ctxBySite.get(id);
      if (!prev || demand > prev.demand) ctxBySite.set(id, { demand, podId: pod.id, province: pod.province });
    }
  }

  /* ถ้าขอเฉพาะ D→B ให้ดูแค่แหล่งที่มีรายงานจากผู้ใช้จริง — ประหยัดการคำนวณมหาศาล */
  const onlyReported = targets.length === 1 && targets[0] === 'B'
    ? new Set(d.fieldReports.map((r) => String(r.siteId)))
    : null;

  for (const [siteId, ctx] of ctxBySite) {
    if (onlyReported && !onlyReported.has(siteId)) continue;
    const site = d.attractions[siteId];
    if (!site) continue;
    const merged = mergedFields(site);
    for (const spec of FIELD_SPECS) {
      const m = merged[spec.key];
      for (const target of targets) {
        const check = checkMerged(m, target);
        if (!check.allowed) continue;
        rows.push({
          siteId: site.id,
          siteName: site.name,
          province: site.province || ctx.province,
          district: site.district || null,
          podId: ctx.podId,
          field: spec.key,
          fieldLabel: spec.label,
          from: check.from,
          to: target,
          rule: `${check.from}->${target}`,
          value: check.value,
          basis: check.basis,
          sourceValue: m.source ? String(m.source.value) : null,
          sourceTier: m.source?.tier || null,
          weight: spec.weight,
          demand: Number(ctx.demand.toFixed(2)),
          impact: Number((spec.weight * ctx.demand).toFixed(2)),
        });
      }
    }
  }

  rows.sort((a, b) => b.impact - a.impact);
  return { total: rows.length, rows: rows.slice(0, Number(limit)) };
}

/* ------------------------------------------------------------------ */
/*  มุมมอง pod                                                         */
/* ------------------------------------------------------------------ */
export function getPod(podId) {
  return db().pods.find((p) => String(p.id) === String(podId)) || null;
}

export function podSites(pod) {
  const d = db();
  return pod.siteIds.map((id) => d.attractions[id]).filter(Boolean);
}

export function podDetail(pod) {
  const sites = podSites(pod).map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    category: s.category,
    district: s.district,
    lat: s.lat,
    lng: s.lng,
    detail: s.detail,
    nearby: s.nearby,
    tel: s.tel,
    address: s.address,
    online: s.online,
    updatedDate: s.updatedDate,
    fields: mergedFields(s),
  }));

  const coverage = {};
  for (const spec of FIELD_SPECS) {
    const known = sites.filter((s) => s.fields[spec.key].known).length;
    coverage[spec.key] = { label: spec.label, known, total: sites.length };
  }

  const badges = computeBadges(pod, sites, coverage);
  const score = completeness(coverage);

  return {
    ...pod,
    sites,
    coverage,
    badges,
    completeness: score,
    categoriesPresent: [...new Set(sites.map((s) => s.category || s.type).filter(Boolean))],
    onlinePresence: sites.filter((s) => s.online?.any).length,
    stats: {
      viewed: db().activity.filter((a) => String(a.podId) === String(pod.id) && a.type === 'view').length,
      planned: db().plans.filter((p) => String(p.podId) === String(pod.id)).length,
      reports: db().fieldReports.filter((r) => pod.siteIds.includes(r.siteId)).length,
    },
  };
}

export function completeness(coverage) {
  let got = 0;
  let max = 0;
  for (const spec of FIELD_SPECS) {
    const c = coverage[spec.key];
    max += spec.weight * c.total;
    got += spec.weight * c.known;
  }
  return max ? Math.round((got / max) * 100) : 0;
}

/* ------------------------------------------------------------------ */
/*  Trip Risk Badge — คำนวณสดทุกครั้ง จึงเปลี่ยนตาม feedback ที่เข้ามา   */
/* ------------------------------------------------------------------ */
export function computeBadges(pod, sites, coverage) {
  const badges = [];
  const n = sites.length || 1;
  const miss = (k) => coverage[k].total - coverage[k].known;

  if (miss('season') > 0) {
    badges.push({ code: 'SEASON_UNKNOWN', level: 'warn', msg: `ไม่ทราบฤดูกาลที่เหมาะ ${miss('season')}/${n} แห่ง` });
  }
  if (coverage.payment.known === 0) {
    badges.push({ code: 'CASH_RISK', level: 'warn', msg: 'ไม่ทราบช่องทางชำระเงิน — ควรพกเงินสด' });
  }
  if (coverage.food.known === 0) {
    badges.push({ code: 'NO_FOOD', level: 'warn', msg: 'ไม่พบจุดอาหาร/ตลาดในชุดข้อมูลนี้ — ควรเตรียมเสบียง (ไม่ได้แปลว่าไม่มีร้านจริง)' });
  }
  if (coverage.facilities.known === 0) {
    badges.push({ code: 'NO_FACILITY_DATA', level: 'info', msg: 'ไม่มีข้อมูลห้องน้ำ/ที่จอดรถทุกแห่ง' });
  }
  if (miss('fee') > 0) {
    badges.push({ code: 'FEE_UNKNOWN', level: 'info', msg: `ไม่ทราบค่าเข้าชม ${miss('fee')}/${n} แห่ง` });
  }
  if (coverage.ev.known === 0) {
    badges.push({ code: 'NO_CHARGER_IN_DATA', level: 'info', msg: 'ไม่พบจุดชาร์จ EV ในข้อมูล — ไม่ได้แปลว่าไม่มีจริง' });
  }
  if (pod.kmFromHub >= 90) {
    badges.push({ code: 'LONG_HAUL', level: 'warn', msg: `ไกลจากเมืองหลัก ${pod.kmFromHub} กม. (เส้นตรง) — เผื่อเวลาเดินทาง` });
  }
  const oldest = sites
    .map((s) => s.updatedDate)
    .filter(Boolean)
    .sort()[0];
  if (oldest && Number(String(oldest).slice(0, 4)) <= new Date().getFullYear() - 5) {
    badges.push({ code: 'STALE', level: 'warn', msg: `ข้อมูลเก่าสุดอัปเดต ${String(oldest).slice(0, 10)}` });
  }
  if (sites.filter((s) => s.online?.any).length === 0) {
    badges.push({ code: 'NO_ONLINE', level: 'info', msg: 'ไม่มีแหล่งไหนในชุดนี้มีเว็บ/โซเชียลให้ติดต่อล่วงหน้า' });
  }
  return badges;
}

/* ------------------------------------------------------------------ */
/*  3 คำถามที่ "ถามแล้วคุ้มที่สุด" ของ pod                              */
/* ------------------------------------------------------------------ */
export function topQuestions(pod, limit = 3) {
  const detail = podDetail(pod);
  const demand = 1 + detail.stats.viewed * 0.1 + detail.stats.planned * 1.5;
  const items = [];
  for (const site of detail.sites) {
    for (const spec of FIELD_SPECS) {
      const f = site.fields[spec.key];
      if (f.known) continue;
      items.push({
        siteId: site.id,
        siteName: site.name,
        field: spec.key,
        fieldLabel: spec.label,
        question: spec.question,
        value: Number((spec.weight * demand).toFixed(2)),
        why: `ช่องนี้ว่างอยู่ และ pod นี้ถูกเปิดดู ${detail.stats.viewed} ครั้ง / วางแผนแล้ว ${detail.stats.planned} ทริป`,
      });
    }
  }
  // กระจายคำถามไปหลายแหล่ง ไม่ถามซ้ำแหล่งเดิม
  items.sort((a, b) => b.value - a.value);
  const picked = [];
  const usedSite = new Set();
  const usedField = new Set();
  for (const it of items) {
    if (picked.length >= limit) break;
    if (usedSite.has(it.siteId) && usedField.has(it.field)) continue;
    picked.push(it);
    usedSite.add(it.siteId);
    usedField.add(it.field);
  }
  for (const it of items) {
    if (picked.length >= limit) break;
    if (!picked.includes(it)) picked.push(it);
  }
  return picked;
}

/* ------------------------------------------------------------------ */
/*  ระบบแนะนำสถานที่ — rule-based scoring + เหตุผลที่อธิบายได้           */
/* ------------------------------------------------------------------ */
export function recommend(params = {}) {
  const {
    province = '',
    region = '',
    q = '',
    interests = [],
    maxKm = null,
    minSites = null,
    hours = null,
    ev = false,
    rangeKm = null,
    avoidUnknown = false,
    limit = 12,
  } = params;

  const d = db();
  const results = [];

  for (const pod of d.pods) {
    if (province && pod.province !== province) continue;
    if (region && pod.region !== region) continue;
    if (maxKm && pod.kmFromHub > Number(maxKm)) continue;
    if (minSites && pod.siteCount < Number(minSites)) continue;

    const detail = podDetail(pod);
    const text = `${pod.province} ${pod.region} ${detail.sites.map((s) => `${s.name} ${s.type || ''} ${s.district || ''}`).join(' ')}`;
    if (q && !text.includes(q)) continue;

    const reasons = [];
    let score = 0;

    // 1) ความครบของข้อมูล (หัวใจของโจทย์: ไปไกลแล้วต้องรู้ว่าจะเจออะไร)
    const dataScore = detail.completeness * 0.45;
    score += dataScore;
    if (detail.completeness >= 40) reasons.push(`ข้อมูลพร้อมวางแผน ${detail.completeness}% (สูงกว่าค่ากลางของชุดนี้)`);

    // 2) ความคุ้มระยะทาง: แหล่งต่อ 10 กม. ที่ต้องขับ
    const worth = pod.siteCount / Math.max(pod.kmFromHub / 10, 1);
    const worthScore = Math.min(worth * 12, 25);
    score += worthScore;
    reasons.push(`${pod.siteCount} แห่งในระยะขับ ${pod.kmFromHub} กม. (คุ้มระยะ ${worth.toFixed(1)} แห่ง/10 กม.)`);

    // 3) ความหลากหลายของหมวด — ทริปวันเดียวที่ไม่ซ้ำซาก
    const variety = Math.min((detail.categoriesPresent.length || 1) * 5, 20);
    score += variety;
    if (detail.categoriesPresent.length >= 3) reasons.push(`ครบ ${detail.categoriesPresent.length} หมวด ไม่ซ้ำแนวในทริปเดียว`);

    // 4) ตรงความสนใจที่ผู้ใช้เลือก
    let interestHits = 0;
    if (interests.length) {
      for (const s of detail.sites) {
        const t = `${s.category || ''} ${s.type || ''}`;
        if (interests.some((i) => t.includes(i))) interestHits += 1;
      }
      score += Math.min(interestHits * 6, 24);
      if (interestHits) reasons.push(`ตรงความสนใจที่เลือก ${interestHits} แห่ง`);
      else score -= 15;
    }

    // 5) เวลาที่มี — ประเมินหยาบ ๆ 1 แห่ง ≈ 45 นาที + เดินทางไป-กลับ 2 × (กม./60 ชม.)
    if (hours) {
      const need = pod.siteCount * 0.75 + (pod.kmFromHub / 60) * 2;
      if (need <= Number(hours)) {
        score += 10;
        reasons.push(`พอดีกับเวลา ${hours} ชม. (ประเมินใช้ ~${need.toFixed(1)} ชม.)`);
      } else {
        score -= Math.min((need - Number(hours)) * 6, 25);
        reasons.push(`อาจใช้เวลา ~${need.toFixed(1)} ชม. มากกว่าที่มี ${hours} ชม.`);
      }
    }

    // 6) ผู้ใช้จริงช่วยเติมข้อมูลแล้ว → น่าเชื่อถือขึ้น (จุดที่ feedback loop ย้อนกลับมา)
    const confirmed = d.fieldReports.filter((r) => pod.siteIds.includes(r.siteId)).length;
    if (confirmed) {
      score += Math.min(confirmed * 3, 18);
      reasons.push(`มีนักท่องเที่ยวรายงานข้อมูลจริงกลับมาแล้ว ${confirmed} รายการ`);
    }

    // 7) รถ EV — ระยะไป-กลับเทียบกับระยะวิ่ง
    let evNote = null;
    if (ev) {
      const roundTrip = pod.kmFromHub * 2;
      const usable = rangeKm ? Number(rangeKm) * 0.8 : null;
      if (usable && roundTrip > usable) {
        score -= 12;
        evNote = `ไป-กลับ ~${roundTrip.toFixed(0)} กม. (เส้นตรง) เกิน 80% ของระยะวิ่ง ${rangeKm} กม. — ต้องชาร์จระหว่างทาง`;
      } else if (usable) {
        score += 8;
        evNote = `ไป-กลับ ~${roundTrip.toFixed(0)} กม. อยู่ในระยะวิ่งที่ปลอดภัย (${usable.toFixed(0)} กม.)`;
      }
      if (detail.coverage.ev.known > 0) {
        score += 10;
        reasons.push('พบการกล่าวถึงจุดชาร์จ EV ในข้อมูลต้นฉบับ');
      }
      if (evNote) reasons.push(evNote);
    }

    // 8) ผู้ใช้ที่ไม่อยากเสี่ยง — ตัด pod ที่ยังไม่รู้อะไรเลย
    const warnCount = detail.badges.filter((b) => b.level === 'warn').length;
    score -= warnCount * 3;
    if (avoidUnknown && detail.completeness < 25) continue;

    results.push({
      id: pod.id,
      province: pod.province,
      region: pod.region,
      siteCount: pod.siteCount,
      kmFromHub: pod.kmFromHub,
      diameterKm: pod.diameterKm,
      center: pod.center,
      completeness: detail.completeness,
      badges: detail.badges,
      categoriesPresent: detail.categoriesPresent,
      siteNames: detail.sites.map((s) => s.name),
      score: Number(score.toFixed(1)),
      reasons,
      evNote,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Number(limit));
}

/* ------------------------------------------------------------------ */
/*  ระบบวางแผน — Pre-trip Briefing ที่บอกทั้ง "รู้อะไร" และ "ไม่รู้อะไร"  */
/* ------------------------------------------------------------------ */
export function buildBriefing(pod, { vehicle = null, hours = null, partySize = 2 } = {}) {
  const detail = podDetail(pod);
  const know = [];
  const dontKnow = [];
  const checklist = [];
  const citations = [];

  for (const spec of FIELD_SPECS) {
    const c = detail.coverage[spec.key];
    if (c.known === 0) {
      dontKnow.push(`ไม่พบข้อมูล${spec.label}เลยทั้ง ${c.total} แห่ง`);
    } else if (c.known < c.total) {
      know.push(`รู้${spec.label} ${c.known}/${c.total} แห่ง`);
      dontKnow.push(`ยังไม่ทราบ${spec.label}อีก ${c.total - c.known} แห่ง`);
    } else {
      know.push(`รู้${spec.label}ครบทั้ง ${c.total} แห่ง`);
    }
  }

  for (const site of detail.sites) {
    for (const spec of FIELD_SPECS) {
      const f = site.fields[spec.key];
      if (f.primary?.tier === 'B' && f.primary.evidence) {
        citations.push({
          siteId: site.id,
          siteName: site.name,
          field: spec.key,
          fieldLabel: spec.label,
          value: f.primary.value,
          sourceField: f.primary.field,
          evidence: f.primary.evidence,
        });
      }
    }
  }

  if (detail.coverage.payment.known === 0) checklist.push('พกเงินสด — ไม่มีข้อมูลว่ารับบัตร/สแกนจ่าย');
  if (detail.coverage.food.known === 0) checklist.push('เตรียมน้ำและเสบียง — ไม่พบจุดอาหารในชุดข้อมูล');
  if (detail.coverage.facilities.known === 0) checklist.push('วางแผนเรื่องห้องน้ำก่อนออกจากตัวเมือง');
  if (detail.coverage.season.known < detail.sites.length) checklist.push('เช็กสภาพอากาศ/ฤดูกาลด้วยตัวเองก่อนออกเดินทาง');
  if (pod.kmFromHub >= 60) checklist.push(`เผื่อเวลาเดินทาง — ห่างเมืองหลัก ${pod.kmFromHub} กม. (วัดเส้นตรง ไม่ใช่ระยะถนน)`);
  if (detail.sites.some((s) => !s.online?.any)) checklist.push('บางแห่งไม่มีช่องทางติดต่อออนไลน์ — โทรถามล่วงหน้าไม่ได้');

  let evPlan = null;
  if (vehicle?.type === 'ev') {
    const roundTripStraight = pod.kmFromHub * 2;
    const est = roundTripStraight * 1.3; // ตัวคูณประมาณการระยะถนน (ค่าที่เราตั้งเอง)
    const range = Number(vehicle.rangeKm || 0);
    const usable = range * (Number(vehicle.reservePct || 20) / 100 ? 1 - Number(vehicle.reservePct || 20) / 100 : 0.8);
    evPlan = {
      roundTripStraightKm: Number(roundTripStraight.toFixed(1)),
      roundTripEstimateKm: Number(est.toFixed(1)),
      estimateNote: 'ประมาณการจากระยะเส้นตรง × 1.3 — ชุดข้อมูล ททท. ไม่มีระยะถนนจริง',
      rangeKm: range || null,
      usableKm: range ? Number(usable.toFixed(1)) : null,
      verdict: !range
        ? 'unknown'
        : est <= usable
          ? 'ok'
          : est <= range
            ? 'tight'
            : 'charge_required',
      chargersInData: detail.coverage.ev.known,
      badges: [
        ...(range && est > usable ? [{ code: 'RANGE_RISK', level: 'warn', msg: 'ระยะไป-กลับประมาณการเกินระยะวิ่งที่ปลอดภัย' }] : []),
        ...(detail.coverage.ev.known === 0 ? [{ code: 'NO_CHARGER_IN_DATA', level: 'info', msg: 'ไม่พบจุดชาร์จในข้อมูล ททท. — ต้องหาจากแหล่งภายนอกและตรวจสิทธิ์ก่อนใช้' }] : []),
      ],
    };
    if (evPlan.verdict === 'charge_required') checklist.push('วางแผนจุดชาร์จอย่างน้อย 1 ครั้ง ก่อนออกเดินทาง');
  }

  const estHours = Number((detail.sites.length * 0.75 + (pod.kmFromHub / 60) * 2).toFixed(1));

  return {
    podId: pod.id,
    province: pod.province,
    siteCount: detail.sites.length,
    kmFromHub: pod.kmFromHub,
    completeness: detail.completeness,
    badges: detail.badges,
    know,
    dontKnow,
    checklist,
    citations,
    evPlan,
    estimate: {
      hours: estHours,
      basis: 'ประเมินจาก 45 นาที/แห่ง + เดินทางไป-กลับที่ 60 กม./ชม. (ค่าที่ระบบตั้งเอง)',
      fits: hours ? estHours <= Number(hours) : null,
      partySize,
    },
    disclaimer: [
      'ระยะทางทั้งหมดเป็นระยะเส้นตรงจากพิกัดในชุดข้อมูล ไม่ใช่ระยะถนนจริง',
      '"ไม่พบ" หมายถึงไม่พบในชุดข้อมูล ททท. ไม่ได้แปลว่าไม่มีอยู่จริง',
      'ระบบไม่เติมข้อเท็จจริงแทนข้อมูลที่หายไป',
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Gap Queue — บอก ททท./จังหวัด ว่าควรเติมข้อมูลแหล่งไหนก่อน            */
/* ------------------------------------------------------------------ */
export function gapQueue({ province = '', limit = 20 } = {}) {
  const d = db();
  const rows = [];
  for (const pod of d.pods) {
    if (province && pod.province !== province) continue;
    const detail = podDetail(pod);
    let gaps = 0;
    const byField = {};
    for (const spec of FIELD_SPECS) {
      const c = detail.coverage[spec.key];
      const missing = c.total - c.known;
      gaps += missing;
      if (missing) byField[spec.key] = { label: spec.label, missing, weight: spec.weight };
    }
    const demand = detail.stats.viewed * 0.5 + detail.stats.planned * 3;
    const readiness = detail.completeness;
    // งานที่ "เติมแล้วขายได้ทันที" = ช่องว่างน้อย + มีคนสนใจ
    const priority = (100 - gaps * 2) * 0.5 + demand * 4 + readiness * 0.4;
    rows.push({
      podId: pod.id,
      province: pod.province,
      region: pod.region,
      siteCount: pod.siteCount,
      kmFromHub: pod.kmFromHub,
      gaps,
      filled: detail.stats.reports,
      byField,
      completeness: readiness,
      demand: Number(demand.toFixed(1)),
      priority: Number(priority.toFixed(1)),
      readyIf: gaps <= 20 ? `เติมอีก ${gaps} ช่อง → พร้อมนำเสนอเป็นทริปได้` : `ต้องเติม ${gaps} ช่อง`,
    });
  }
  rows.sort((a, b) => b.priority - a.priority);
  return rows.slice(0, Number(limit));
}

/* ------------------------------------------------------------------ */
/*  สถิติรวม — ใช้บนหน้าแดชบอร์ดและวัดผลของ feedback loop              */
/* ------------------------------------------------------------------ */
export function overallStats() {
  const d = db();
  const totals = Object.fromEntries(FIELD_SPECS.map((f) => [f.key, {
    label: f.label, known: 0, fromSource: 0, fromUsers: 0, promoted: 0, total: 0,
    tiers: { A: 0, B: 0, D: 0, C: 0 },
  }]));
  const tierTotals = { A: 0, B: 0, D: 0, C: 0 };
  let completenessSum = 0;

  for (const pod of d.pods) {
    const detail = podDetail(pod);
    completenessSum += detail.completeness;
    for (const site of detail.sites) {
      for (const spec of FIELD_SPECS) {
        const f = site.fields[spec.key];
        const t = totals[spec.key];
        t.total += 1;
        const tier = f.known ? f.primary.tier : 'C';
        t.tiers[tier] = (t.tiers[tier] || 0) + 1;
        tierTotals[tier] = (tierTotals[tier] || 0) + 1;
        if (f.promotion) t.promoted += 1;
        if (f.known) {
          t.known += 1;
          if (f.primary.tier === 'D') t.fromUsers += 1;
          else t.fromSource += 1;
        }
      }
    }
  }

  const promotions = Array.isArray(d.promotions) ? d.promotions : [];
  const live = promotions.filter((p) => !p.revokedAt);

  return {
    pods: d.pods.length,
    attractions: Object.keys(d.attractions).length,
    provinces: [...new Set(d.pods.map((p) => p.province))].length,
    plans: d.plans.length,
    feedback: d.feedback.length,
    fieldReports: d.fieldReports.length,
    avgCompleteness: d.pods.length ? Math.round(completenessSum / d.pods.length) : 0,
    coverage: totals,
    tierTotals,
    promotions: {
      total: promotions.length,
      active: live.length,
      revoked: promotions.length - live.length,
      dToB: live.filter((p) => p.rule === 'D->B').length,
      bToA: live.filter((p) => p.rule === 'B->A').length,
      pendingDToB: promotionQueue({ to: 'B', limit: 0 }).total,
      pendingBToA: promotionQueue({ to: 'A', limit: 0 }).total,
    },
    dataSnapshot: d.meta.dataSnapshot,
    seededAt: d.meta.seededAt,
  };
}
