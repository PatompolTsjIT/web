import fs from 'node:fs';
import path from 'node:path';
import { ATTRACTION_FILE, PODS_FILE, DB_FILE, SOURCES_DIR } from './paths.js';
import { stripHtml, isEmpty, extractOne, hasOnlinePresence } from './extract.js';

export const SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ */
/*  1. SEED — ดึงข้อมูลตั้งต้นจาก attraction.json "ครั้งแรกครั้งเดียว"   */
/* ------------------------------------------------------------------ */

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** attraction.json ห่อ array ไว้ใต้ key เดียว (ข้อความ SQL) — ดึง array ออกมา */
function unwrapAttractionRows(raw) {
  if (Array.isArray(raw)) return raw;
  const key = Object.keys(raw).find((k) => Array.isArray(raw[k]));
  if (!key) throw new Error('attraction.json: ไม่พบ array ของข้อมูลแหล่งท่องเที่ยว');
  return raw[key];
}

function tierA(value, field) {
  if (isEmpty(value)) return null;
  return { tier: 'A', value: String(value).trim(), field, confirmations: null };
}

function unknown() {
  return { tier: 'C', value: null, field: null };
}

function buildAttraction(row, podSite) {
  const detail = stripHtml(row.ATT_DETAIL_TH);
  const texts = [
    { field: 'ATT_DETAIL_TH', text: detail },
    { field: 'ATT_HILIGHT', text: stripHtml(row.ATT_HILIGHT) },
    { field: 'ATT_TRAVELER_PRE', text: stripHtml(row.ATT_TRAVELER_PRE) },
    { field: 'ATT_REMARK', text: stripHtml(row.ATT_REMARK) },
    { field: 'ATT_SUITABLE_DURATION', text: stripHtml(row.ATT_SUITABLE_DURATION) },
    { field: 'ATT_START_END', text: stripHtml(row.ATT_START_END) },
  ];

  // ---- ชั้น A: ฟิลด์ต้นทางของ ททท. ----
  const fields = {
    hours: tierA(row.ATT_START_END, 'ATT_START_END') || unknown(),
    fee: tierA(row.ATT_FEE_TH, 'ATT_FEE_TH') || unknown(),
    duration: tierA(row.ATT_SUITABLE_DURATION, 'ATT_SUITABLE_DURATION') || unknown(),
    travelerPre: tierA(row.ATT_TRAVELER_PRE, 'ATT_TRAVELER_PRE') || unknown(),
    facilityContact: tierA(row.ATT_FACILITIES_CONTACT, 'ATT_FACILITIES_CONTACT') || unknown(),
    payment: unknown(),
    season: unknown(),
    facilities: unknown(),
    food: unknown(),
    ev: unknown(),
  };

  const pay = [];
  if (String(row.ATT_CASH || '').toLowerCase() === 'y') pay.push('เงินสด');
  if (String(row.ATT_CREDIT || '').toLowerCase() === 'y') pay.push('บัตรเครดิต');
  if (String(row.ATT_PAYMENT || '').toLowerCase() === 'y') pay.push('ชำระเงินอิเล็กทรอนิกส์');
  if (pay.length) {
    fields.payment = { tier: 'A', value: pay.join(' / '), field: 'ATT_CASH/ATT_CREDIT/ATT_PAYMENT', confirmations: null };
  }

  // ---- ชั้น B: AI สกัดจากข้อความต้นฉบับ พร้อมประโยคอ้างอิง ----
  for (const kind of ['season', 'facilities', 'food', 'payment', 'ev']) {
    if (fields[kind].tier === 'C') {
      const hit = extractOne(kind, texts);
      if (hit) fields[kind] = { ...hit, confirmations: null };
    }
  }

  const lat = podSite?.lat ?? null;
  const lng = podSite?.lng ?? null;

  return {
    id: String(row.ATT_ID),
    name: row.ATT_NAME_TH || podSite?.name || '(ไม่ระบุชื่อ)',
    nameEn: row.ATT_NAME_EN || null,
    province: row.PROVINCE_NAME_TH || null,
    district: row.DISTRICT_NAME_TH || null,
    subdistrict: row.SUBDISTRICT_NAME_TH || null,
    region: row.REGION_NAME_TH || null,
    category: row.ATT_CATEGORY_LABEL || null,
    type: row.ATT_TYPE_LABEL || podSite?.type || null,
    lat,
    lng,
    detail: detail.slice(0, 1200),
    nearby: stripHtml(row.ATT_NEARBY_LOCATION) || podSite?.nearby_raw || null,
    address: [row.ATT_ADDRESS, row.ATT_ADDRESS_ALLEY, row.ATT_ADDRESS_ROAD]
      .filter((x) => !isEmpty(x)).join(' ') || null,
    tel: isEmpty(row.ATT_TEL) ? null : String(row.ATT_TEL).trim(),
    online: {
      any: hasOnlinePresence(row),
      website: isEmpty(row.ATT_WEBSITE) ? null : row.ATT_WEBSITE,
      facebook: isEmpty(row.ATT_FACEBOOK) ? null : row.ATT_FACEBOOK,
      instagram: isEmpty(row.ATT_INSTAGRAM) ? null : row.ATT_INSTAGRAM,
      tiktok: isEmpty(row.ATT_TIKTOK) ? null : row.ATT_TIKTOK,
      youtube: isEmpty(row.ATT_YOUTUBE) ? null : row.ATT_YOUTUBE,
      line: isEmpty(row.ATT_LINE) ? null : row.ATT_LINE,
    },
    updatedDate: row.ATT_UPDATED_DATE || row.ATT_CREATED_DATE || podSite?.verified_date || null,
    fields,
  };
}

export function seed({ force = false, log = console.log } = {}) {
  if (fs.existsSync(DB_FILE) && !force) {
    return { seeded: false, reason: 'มี database-attraction.json อยู่แล้ว — ข้ามการ seed' };
  }
  if (!fs.existsSync(ATTRACTION_FILE)) throw new Error('ไม่พบ sources/attraction.json');
  if (!fs.existsSync(PODS_FILE)) throw new Error('ไม่พบ sources/faraway_pods.json');

  log('· อ่าน faraway_pods.json …');
  const podsRaw = readJson(PODS_FILE);

  log('· อ่าน attraction.json (ไฟล์ใหญ่ ใช้เวลาสักครู่) …');
  const rows = unwrapAttractionRows(readJson(ATTRACTION_FILE));
  const byId = new Map(rows.map((r) => [String(r.ATT_ID), r]));
  log(`  พบ ${rows.length.toLocaleString()} แหล่งในชุดข้อมูลต้นทาง`);

  const attractions = {};
  const pods = [];
  let missing = 0;

  for (const p of podsRaw) {
    const siteIds = [];
    for (const s of p.sites || []) {
      const id = String(s.att_id);
      siteIds.push(id);
      if (attractions[id]) continue;
      const row = byId.get(id);
      if (!row) {
        missing += 1;
        attractions[id] = {
          id,
          name: s.name,
          province: p.province,
          region: p.region,
          type: s.type,
          lat: s.lat,
          lng: s.lng,
          detail: '',
          nearby: s.nearby_raw || null,
          online: { any: false },
          updatedDate: s.verified_date || null,
          fields: {
            hours: s.hours?.value ? { tier: 'A', value: s.hours.value, field: s.hours.field } : unknown(),
            fee: s.fee_thb?.value != null ? { tier: 'A', value: String(s.fee_thb.value), field: s.fee_thb.field } : unknown(),
            season: unknown(), payment: unknown(), facilities: unknown(),
            food: unknown(), ev: unknown(), duration: unknown(),
            travelerPre: unknown(), facilityContact: unknown(),
          },
        };
        continue;
      }
      attractions[id] = buildAttraction(row, s);
    }

    pods.push({
      id: p.pod_id,
      province: p.province,
      region: p.region,
      siteCount: p.site_count ?? siteIds.length,
      categories: p.categories ?? null,
      kmFromHub: p.km_from_hub ?? null,
      diameterKm: p.pod_diameter_km ?? null,
      center: p.center ?? null,
      baseBadges: p.trip_risk_badges ?? [],
      dataSnapshot: p.data_snapshot ?? null,
      siteIds,
    });
  }

  const db = {
    meta: {
      app: 'ไปไกลให้คุ้ม',
      tagline: 'จัดชุดแหล่งนอกเมืองให้เป็นทริปที่ไปแล้วไม่เสียเที่ยว',
      schemaVersion: SCHEMA_VERSION,
      seededAt: new Date().toISOString(),
      seededOnce: true,
      seededFrom: {
        attraction: path.relative(SOURCES_DIR, ATTRACTION_FILE),
        pods: path.relative(SOURCES_DIR, PODS_FILE),
        attractionRows: rows.length,
        sitesNotFoundInSource: missing,
      },
      dataSnapshot: podsRaw[0]?.data_snapshot ?? null,
      counts: { pods: pods.length, attractions: Object.keys(attractions).length },
    },
    pods,
    attractions,
    /* ---- ข้อมูลที่ผู้ใช้บันทึกผ่านหน้าเว็บ ทั้งหมดลงไฟล์นี้ ---- */
    plans: [],
    feedback: [],
    fieldReports: [],
    promotions: [],
    activity: [],
    counters: { plan: 0, feedback: 0, report: 0, promotion: 0 },
  };

  fs.mkdirSync(SOURCES_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db), 'utf8');
  log(`✓ สร้าง database-attraction.json แล้ว — ${pods.length} pod · ${Object.keys(attractions).length} แหล่ง`);
  return { seeded: true, pods: pods.length, attractions: Object.keys(attractions).length, missing };
}

/* ------------------------------------------------------------------ */
/*  2. DB runtime — โหลดเข้าหน่วยความจำ + เขียนกลับไฟล์ทุกครั้งที่บันทึก  */
/* ------------------------------------------------------------------ */

let cache = null;
let writeTimer = null;
let writing = false;

export function load({ log = console.log } = {}) {
  if (cache) return cache;
  seed({ log });
  cache = readJson(DB_FILE);
  if (!cache.counters) cache.counters = { plan: 0, feedback: 0, report: 0, promotion: 0 };
  for (const k of ['plans', 'feedback', 'fieldReports', 'promotions', 'activity']) {
    if (!Array.isArray(cache[k])) cache[k] = [];
  }
  return cache;
}

export function db() {
  return load();
}

function writeNow() {
  if (!cache || writing) return;
  writing = true;
  const tmp = DB_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(cache), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } finally {
    writing = false;
  }
}

/** บันทึกแบบหน่วงสั้น ๆ กันเขียนไฟล์ถี่เกินไป */
export function persist({ immediate = false } = {}) {
  if (!cache) return;
  cache.meta.updatedAt = new Date().toISOString();
  if (immediate) {
    clearTimeout(writeTimer);
    writeTimer = null;
    writeNow();
    return;
  }
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writeNow();
  }, 250);
}

export function nextId(kind) {
  const d = load();
  d.counters[kind] = (d.counters[kind] || 0) + 1;
  const prefix = { plan: 'TRIP', feedback: 'FB', report: 'RP', promotion: 'PM' }[kind] || 'ID';
  return `${prefix}-${String(d.counters[kind]).padStart(5, '0')}`;
}

process.on('exit', () => {
  if (writeTimer) writeNow();
});
