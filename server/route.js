/**
 * ระบบเส้นทางและระยะทาง
 *
 *  1. ระยะเส้นตรง (haversine) — คำนวณเองจากพิกัดในชุดข้อมูล ททท. ใช้ได้เสมอแม้ออฟไลน์
 *  2. ลำดับการแวะ — nearest-neighbour + 2-opt จากจุดเริ่ม เพื่อไม่ให้ขับวนไปกลับ
 *  3. ระยะถนนจริง — ขอจาก OSRM (OpenStreetMap) ถ้าติดต่อได้ ถ้าไม่ได้บอกตรง ๆ ว่าใช้เส้นตรงแทน
 *
 * กติกา Track 1: ไม่เดาแทนข้อมูลที่ไม่มี — ทุกตัวเลขบอกที่มาว่ามาจาก OSRM หรือเส้นตรง
 */

const OSRM_BASE = process.env.OSRM_BASE || 'http://router.project-osrm.org';
const OSRM_TIMEOUT_MS = Number(process.env.OSRM_TIMEOUT_MS || 6000);

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function hasCoords(s) {
  return typeof s?.lat === 'number' && typeof s?.lng === 'number' && !Number.isNaN(s.lat) && !Number.isNaN(s.lng);
}

/** จัดลำดับการแวะแบบ nearest-neighbour แล้วขัดด้วย 2-opt (ชุดละไม่กี่จุด จึงเร็วพอ) */
export function orderStops(stops, start = null) {
  const pts = stops.filter(hasCoords);
  if (pts.length <= 2) return pts;

  const origin = start && hasCoords(start) ? start : pts[0];
  const remaining = [...pts];
  const path = [];
  let cur = origin;
  while (remaining.length) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const dist = haversineKm(cur, remaining[i]);
      if (dist < bd) { bd = dist; bi = i; }
    }
    cur = remaining[bi];
    path.push(cur);
    remaining.splice(bi, 1);
  }

  // 2-opt: สลับช่วงที่ทำให้เส้นทางตัดกันเองออก
  const legLen = (arr) => {
    let t = haversineKm(origin, arr[0]);
    for (let i = 0; i < arr.length - 1; i += 1) t += haversineKm(arr[i], arr[i + 1]);
    return t;
  };
  let best = path;
  let bestLen = legLen(best);
  let improved = true;
  let guard = 0;
  while (improved && guard < 40) {
    improved = false;
    guard += 1;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const len = legLen(cand);
        if (len < bestLen - 1e-9) { best = cand; bestLen = len; improved = true; }
      }
    }
  }
  return best;
}

/** ขอเส้นทางถนนจริงจาก OSRM — คืน null ถ้าติดต่อไม่ได้ (ไม่ throw, ไม่เดาแทน) */
export async function osrmRoute(points) {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&annotations=false`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes?.length) return null;
    const r = json.routes[0];
    return {
      distanceKm: Number((r.distance / 1000).toFixed(2)),
      durationMin: Number((r.duration / 60).toFixed(1)),
      geometry: r.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) || [],
      legs: (r.legs || []).map((l) => ({
        distanceKm: Number((l.distance / 1000).toFixed(2)),
        durationMin: Number((l.duration / 60).toFixed(1)),
      })),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * แผนเส้นทางของ pod หนึ่งชุด
 * @param {object} pod
 * @param {Array}  sites  แหล่งในชุด (ต้องมี lat/lng)
 * @param {{start?:{lat,lng,name?}, roads?:boolean}} opts
 */
export async function buildRoute(pod, sites, { start = null, roads = true } = {}) {
  const origin = start && hasCoords(start)
    ? { ...start, name: start.name || 'จุดเริ่มต้นที่คุณเลือก', isOrigin: true }
    : pod.center && hasCoords(pod.center)
      ? { lat: pod.center.lat, lng: pod.center.lng, name: 'จุดศูนย์กลางของชุด', isOrigin: true }
      : null;

  const ordered = orderStops(sites, origin);
  const skipped = sites.filter((s) => !hasCoords(s)).map((s) => ({ id: s.id, name: s.name }));

  if (!ordered.length) {
    return {
      podId: pod.id, origin, stops: [], legs: [], skipped,
      totals: { straightKm: 0, roadKm: null, durationMin: null },
      source: 'none',
      note: 'ไม่มีพิกัดของแหล่งใดในชุดนี้ จึงวาดเส้นทางไม่ได้',
    };
  }

  const sequence = origin ? [origin, ...ordered] : ordered;

  const legs = [];
  let straightTotal = 0;
  for (let i = 0; i < sequence.length - 1; i += 1) {
    const km = haversineKm(sequence[i], sequence[i + 1]);
    straightTotal += km;
    legs.push({
      fromId: sequence[i].id ?? 'origin',
      fromName: sequence[i].name,
      toId: sequence[i + 1].id,
      toName: sequence[i + 1].name,
      straightKm: Number(km.toFixed(2)),
      roadKm: null,
      durationMin: null,
    });
  }

  let road = null;
  if (roads && sequence.length >= 2) road = await osrmRoute(sequence);

  if (road) {
    road.legs.forEach((l, i) => {
      if (!legs[i]) return;
      legs[i].roadKm = l.distanceKm;
      legs[i].durationMin = l.durationMin;
    });
  }

  return {
    podId: pod.id,
    origin,
    stops: sequence.map((s, i) => ({
      order: i,
      id: s.id ?? 'origin',
      name: s.name,
      type: s.type || null,
      lat: s.lat,
      lng: s.lng,
      isOrigin: Boolean(s.isOrigin),
    })),
    legs,
    skipped,
    geometry: road?.geometry || null,
    totals: {
      straightKm: Number(straightTotal.toFixed(2)),
      roadKm: road?.distanceKm ?? null,
      durationMin: road?.durationMin ?? null,
      detourRatio: road ? Number((road.distanceKm / (straightTotal || 1)).toFixed(2)) : null,
    },
    source: road ? 'osrm' : 'straight-line',
    attribution: road
      ? 'ระยะถนนและเวลาขับจาก OSRM (ข้อมูลถนน © OpenStreetMap contributors)'
      : 'ติดต่อ OSRM ไม่ได้ — ตัวเลขที่แสดงเป็นระยะเส้นตรงจากพิกัด ไม่ใช่ระยะถนนจริง',
    note: road
      ? 'ลำดับการแวะจัดด้วย nearest-neighbour + 2-opt บนระยะเส้นตรง แล้วจึงวัดระยะถนนจริงตามลำดับนั้น'
      : 'ลำดับการแวะจัดด้วย nearest-neighbour + 2-opt บนระยะเส้นตรง',
  };
}
