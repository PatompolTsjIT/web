import express from 'express';
import cors from 'cors';
import { db, load, persist, nextId } from './db.js';
import {
  FIELD_SPECS, FIELD_MAP, TIER_INFO,
  getPod, podDetail, podSites, recommend, buildBriefing, topQuestions, gapQueue, overallStats,
  invalidateReportIndex, mergedFields, checkPromotable, promotionQueue,
} from './engine.js';
import {
  PROMOTION_RULES, recordPromotion, revokePromotion, allPromotions, promotionHistory,
} from './promote.js';
import { buildRoute } from './route.js';
import { DB_FILE } from './paths.js';

const app = express();
const PORT = process.env.PORT || 5174;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, code, msg) => res.status(code).json({ ok: false, error: msg });

/* ---------------------------- meta / stats ---------------------------- */

app.get('/api/meta', (req, res) => {
  const d = db();
  const provinces = [...new Set(d.pods.map((p) => p.province))].sort((a, b) => a.localeCompare(b, 'th'));
  const regions = [...new Set(d.pods.map((p) => p.region))].filter(Boolean).sort();
  const categories = [...new Set(Object.values(d.attractions).map((a) => a.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  ok(res, {
    app: d.meta.app,
    tagline: d.meta.tagline,
    dataSnapshot: d.meta.dataSnapshot,
    seededAt: d.meta.seededAt,
    seededFrom: d.meta.seededFrom,
    dbFile: DB_FILE,
    counts: d.meta.counts,
    provinces, regions, categories,
    fields: FIELD_SPECS,
    tiers: TIER_INFO,
  });
});

app.get('/api/stats', (req, res) => ok(res, overallStats()));

/* ------------------------------- pods -------------------------------- */

app.get('/api/pods', (req, res) => {
  ok(res, recommend({ ...req.query, interests: toArray(req.query.interests), limit: req.query.limit || 50 }));
});

app.get('/api/pods/:id', (req, res) => {
  const pod = getPod(req.params.id);
  if (!pod) return fail(res, 404, 'ไม่พบ pod นี้');
  const d = db();
  d.activity.push({ type: 'view', podId: pod.id, at: new Date().toISOString() });
  persist();
  ok(res, { ...podDetail(pod), questions: topQuestions(pod) });
});

/* --------------------------- ระบบแนะนำสถานที่ -------------------------- */

app.get('/api/recommend', (req, res) => {
  const params = {
    ...req.query,
    interests: toArray(req.query.interests),
    ev: req.query.ev === 'true' || req.query.ev === '1',
    avoidUnknown: req.query.avoidUnknown === 'true' || req.query.avoidUnknown === '1',
  };
  ok(res, { params, results: recommend(params) });
});

/* ----------------------------- ระบบวางแผน ---------------------------- */

app.get('/api/plan/preview/:podId', (req, res) => {
  const pod = getPod(req.params.podId);
  if (!pod) return fail(res, 404, 'ไม่พบ pod นี้');
  const vehicle = req.query.evRange
    ? { type: 'ev', rangeKm: Number(req.query.evRange), reservePct: Number(req.query.reservePct || 20) }
    : { type: req.query.vehicle || 'ice' };
  ok(res, buildBriefing(pod, { vehicle, hours: req.query.hours, partySize: req.query.partySize }));
});

app.post('/api/plans', (req, res) => {
  const { podId, title, tripDate, travelerName, partySize = 2, hours = null, vehicle = null, notes = '' } = req.body || {};
  const pod = getPod(podId);
  if (!pod) return fail(res, 400, 'ต้องระบุ podId ที่มีอยู่จริง');

  const briefing = buildBriefing(pod, { vehicle, hours, partySize });
  const plan = {
    id: nextId('plan'),
    podId: pod.id,
    province: pod.province,
    title: title || `ทริป ${pod.province} · pod ${pod.id}`,
    tripDate: tripDate || null,
    travelerName: travelerName || 'ไม่ระบุชื่อ',
    partySize: Number(partySize) || 1,
    hours: hours ? Number(hours) : null,
    vehicle: vehicle || { type: 'ice' },
    notes,
    status: 'planned',
    briefing,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  const d = db();
  d.plans.push(plan);
  d.activity.push({ type: 'plan', podId: pod.id, planId: plan.id, at: plan.createdAt });
  persist({ immediate: true });
  ok(res, plan);
});

app.get('/api/plans', (req, res) => {
  const d = db();
  const list = [...d.plans].reverse().map((p) => ({
    ...p,
    feedbackCount: d.feedback.filter((f) => f.planId === p.id).length,
  }));
  ok(res, list);
});

app.get('/api/plans/:id', (req, res) => {
  const d = db();
  const plan = d.plans.find((p) => p.id === req.params.id);
  if (!plan) return fail(res, 404, 'ไม่พบทริปนี้');
  const pod = getPod(plan.podId);
  ok(res, {
    ...plan,
    pod: pod ? podDetail(pod) : null,
    questions: pod ? topQuestions(pod) : [],
    feedback: d.feedback.filter((f) => f.planId === plan.id),
  });
});

app.patch('/api/plans/:id', (req, res) => {
  const d = db();
  const plan = d.plans.find((p) => p.id === req.params.id);
  if (!plan) return fail(res, 404, 'ไม่พบทริปนี้');
  const { status, notes, tripDate } = req.body || {};
  if (status) {
    plan.status = status;
    if (status === 'completed') plan.completedAt = new Date().toISOString();
  }
  if (notes !== undefined) plan.notes = notes;
  if (tripDate !== undefined) plan.tripDate = tripDate;
  persist({ immediate: true });
  ok(res, plan);
});

app.delete('/api/plans/:id', (req, res) => {
  const d = db();
  const i = d.plans.findIndex((p) => p.id === req.params.id);
  if (i < 0) return fail(res, 404, 'ไม่พบทริปนี้');
  const [removed] = d.plans.splice(i, 1);
  persist({ immediate: true });
  ok(res, removed);
});

/* --------------------------- ระบบ feedback loop ----------------------- */

/** 3 คำถามที่ระบบคำนวณเองว่า "ถามแล้วคุ้มที่สุด" ของ pod นั้น */
app.get('/api/questions/:podId', (req, res) => {
  const pod = getPod(req.params.podId);
  if (!pod) return fail(res, 404, 'ไม่พบ pod นี้');
  ok(res, topQuestions(pod, Number(req.query.limit || 3)));
});

app.post('/api/feedback', (req, res) => {
  const { planId = null, podId, by = 'ผู้ใช้', rating = null, comment = '', answers = [] } = req.body || {};
  const pod = getPod(podId);
  if (!pod) return fail(res, 400, 'ต้องระบุ podId ที่มีอยู่จริง');

  const d = db();
  const now = new Date().toISOString();
  const created = [];

  for (const a of answers) {
    if (!a || !a.siteId || !a.field) continue;
    if (a.value === undefined || a.value === null || String(a.value).trim() === '') continue;
    if (!FIELD_MAP[a.field]) continue;
    if (!pod.siteIds.includes(String(a.siteId))) continue;
    const report = {
      id: nextId('report'),
      siteId: String(a.siteId),
      podId: pod.id,
      field: a.field,
      value: String(a.value).trim(),
      by,
      planId,
      createdAt: now,
    };
    d.fieldReports.push(report);
    created.push(report);
  }
  invalidateReportIndex();

  const entry = {
    id: nextId('feedback'),
    planId,
    podId: pod.id,
    by,
    rating: rating === null ? null : Number(rating),
    comment,
    answerCount: created.length,
    reportIds: created.map((r) => r.id),
    createdAt: now,
  };
  d.feedback.push(entry);

  if (planId) {
    const plan = d.plans.find((p) => p.id === planId);
    if (plan) {
      plan.status = 'completed';
      plan.completedAt = plan.completedAt || now;
    }
  }

  persist({ immediate: true });
  ok(res, { feedback: entry, reports: created, pod: podDetail(pod), nextQuestions: topQuestions(pod) });
});

app.get('/api/feedback', (req, res) => {
  const d = db();
  const list = [...d.feedback].reverse().map((f) => ({
    ...f,
    reports: d.fieldReports.filter((r) => f.reportIds?.includes(r.id)),
  }));
  ok(res, list);
});

/* ----------------------------- Gap Queue ----------------------------- */

app.get('/api/gaps', (req, res) => ok(res, gapQueue({ province: req.query.province || '', limit: req.query.limit || 20 })));

/* ----------------- ยกระดับชั้นความน่าเชื่อถือ (D→B, B→A) ---------------- */

/** คิวงาน: ช่องไหนพร้อมยกระดับแล้วบ้าง เรียงตามผลกระทบ */
app.get('/api/promotions/queue', (req, res) => {
  const to = req.query.to === 'A' || req.query.to === 'B' ? req.query.to : null;
  ok(res, {
    rules: PROMOTION_RULES,
    ...promotionQueue({ to, province: req.query.province || '', limit: req.query.limit || 50 }),
  });
});

/** สมุดบันทึกการยกระดับทั้งหมด — ตรวจสอบย้อนหลังได้ ไม่ลบของเดิม */
app.get('/api/promotions', (req, res) => {
  const d = db();
  const list = allPromotions({ includeRevoked: req.query.includeRevoked !== 'false' }).map((p) => ({
    ...p,
    siteName: d.attractions[p.siteId]?.name || p.siteId,
    province: d.attractions[p.siteId]?.province || null,
    fieldLabel: FIELD_MAP[p.field]?.label || p.field,
  }));
  ok(res, { rules: PROMOTION_RULES, total: list.length, rows: list.slice(0, Number(req.query.limit || 100)) });
});

/** ยกระดับหนึ่งช่อง — ตรวจเงื่อนไขก่อนเสมอ แล้วแช่แข็งหลักฐานที่ใช้ตัดสินไว้ใน ledger */
app.post('/api/promotions', (req, res) => {
  const { siteId, field, to, by = '', note = '' } = req.body || {};
  if (!siteId || !field || !to) return fail(res, 400, 'ต้องระบุ siteId, field และ to');
  if (to !== 'B' && to !== 'A') return fail(res, 400, 'ยกระดับได้เฉพาะเป็นชั้น B หรือชั้น A');

  const site = db().attractions[String(siteId)];
  if (!site) return fail(res, 404, 'ไม่พบแหล่งท่องเที่ยวนี้');
  if (!FIELD_MAP[field]) return fail(res, 400, 'ไม่รู้จักฟิลด์นี้');
  if (!String(by).trim()) return fail(res, 400, 'ต้องระบุผู้รับผิดชอบ — ทุกการยกระดับต้องมีเจ้าของ');

  const check = checkPromotable(site, field, to);
  if (!check.allowed) return fail(res, 409, check.reason);

  const entry = recordPromotion({
    siteId: site.id,
    field,
    from: check.from,
    to,
    value: check.value,
    by: String(by).trim(),
    note,
    basis: check.basis,
  });

  db().activity.push({ type: 'promote', siteId: site.id, field, to, at: entry.createdAt });
  persist({ immediate: true });

  ok(res, { promotion: entry, field: mergedFields(site)[field], rule: PROMOTION_RULES[entry.rule] || null });
});

/** ถอนการยกระดับ — ข้อมูลกลับไปชั้นเดิมทันที ประวัติยังอยู่ */
app.post('/api/promotions/:id/revoke', (req, res) => {
  const { by = '', reason = '' } = req.body || {};
  if (!String(by).trim()) return fail(res, 400, 'ต้องระบุผู้ถอน');
  const entry = revokePromotion(req.params.id, { by: String(by).trim(), reason });
  if (!entry) return fail(res, 404, 'ไม่พบรายการยกระดับนี้');
  const site = db().attractions[entry.siteId];
  ok(res, { promotion: entry, field: site ? mergedFields(site)[entry.field] : null });
});

/** ประวัติการยกระดับของหนึ่งช่องข้อมูล */
app.get('/api/promotions/history/:siteId/:field', (req, res) => {
  const site = db().attractions[String(req.params.siteId)];
  if (!site) return fail(res, 404, 'ไม่พบแหล่งท่องเที่ยวนี้');
  ok(res, {
    siteId: site.id,
    siteName: site.name,
    field: req.params.field,
    fieldLabel: FIELD_MAP[req.params.field]?.label || req.params.field,
    current: mergedFields(site)[req.params.field] || null,
    history: promotionHistory(site.id, req.params.field),
    canPromoteToB: checkPromotable(site, req.params.field, 'B'),
    canPromoteToA: checkPromotable(site, req.params.field, 'A'),
  });
});

/* --------------------- แผนที่ / เส้นทาง (OpenStreetMap) ------------------ */

/** เส้นทางของ pod — ลำดับการแวะ + ระยะถนนจริงจาก OSRM (ถ้าต่อไม่ได้จะบอกว่าใช้เส้นตรง) */
app.get('/api/route/:podId', async (req, res) => {
  const pod = getPod(req.params.podId);
  if (!pod) return fail(res, 404, 'ไม่พบ pod นี้');

  const start = req.query.startLat && req.query.startLng
    ? { lat: Number(req.query.startLat), lng: Number(req.query.startLng), name: req.query.startName || 'จุดเริ่มต้นที่คุณเลือก' }
    : null;

  try {
    const route = await buildRoute(pod, podSites(pod), {
      start,
      roads: req.query.roads !== 'false',
    });
    ok(res, route);
  } catch (e) {
    fail(res, 502, `คำนวณเส้นทางไม่สำเร็จ: ${e.message}`);
  }
});

/* ------------------------------ helpers ------------------------------ */

function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

app.use('/api', (req, res) => fail(res, 404, 'ไม่พบเส้นทาง API นี้'));

/* -------------------------------- boot -------------------------------- */

console.log('── ไปไกลให้คุ้ม · API ──');
load();
const d = db();
console.log(`ฐานข้อมูล: ${DB_FILE}`);
console.log(`   ${d.pods.length} pod · ${Object.keys(d.attractions).length} แหล่ง · ${d.plans.length} ทริป · ${d.fieldReports.length} รายงานจากผู้ใช้`);
app.listen(PORT, () => console.log(`API พร้อมที่ http://localhost:${PORT}/api/meta`));
