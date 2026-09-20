import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { MetaContext } from '../App.jsx';
import { Badge, FieldCell, Loading, Meter } from '../components/ui.jsx';
import OsmMap, { RouteLegs, RouteSummary } from '../components/OsmMap.jsx';

export default function PodDetail() {
  const { id } = useParams();
  const meta = useContext(MetaContext);
  const nav = useNavigate();
  const [pod, setPod] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [plan, setPlan] = useState({
    travelerName: '', tripDate: '', partySize: 2, hours: 8, vehicleType: 'ice', rangeKm: 300, notes: '',
  });
  const [saving, setSaving] = useState(false);

  const loadBriefing = (p = plan) => {
    api.planPreview(id, {
      hours: p.hours,
      partySize: p.partySize,
      vehicle: p.vehicleType,
      evRange: p.vehicleType === 'ev' ? p.rangeKm : '',
    }).then(setBriefing);
  };

  useEffect(() => {
    api.pod(id).then(setPod);
    loadBriefing();
    // eslint-disable-next-line
  }, [id]);

  if (!pod) return <Loading />;

  const fieldSpecs = meta?.fields || [];

  const save = async () => {
    setSaving(true);
    try {
      const created = await api.createPlan({
        podId: pod.id,
        title: `ทริป ${pod.province} · pod ${pod.id}`,
        tripDate: plan.tripDate || null,
        travelerName: plan.travelerName || 'ไม่ระบุชื่อ',
        partySize: Number(plan.partySize),
        hours: Number(plan.hours),
        vehicle: plan.vehicleType === 'ev'
          ? { type: 'ev', rangeKm: Number(plan.rangeKm), reservePct: 20 }
          : { type: 'ice' },
        notes: plan.notes,
      });
      nav(`/trips/${created.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <Link to="/" className="tiny muted">← กลับหน้าแนะนำทริป</Link>
        <h1>POD {pod.id} · {pod.province}</h1>
        <p>
          {pod.siteCount} แห่งในรัศมี {pod.diameterKm} กม. · ห่างเมืองหลัก {pod.kmFromHub} กม. (เส้นตรง) ·
          หมวด: {pod.categoriesPresent.join(' / ') || '—'}
        </p>
      </div>

      <div className="split">
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="card">
            <div className="spread" style={{ marginBottom: 10 }}>
              <b>Trip Risk Badge — สิ่งที่ควรรู้ก่อนออกรถ</b>
              <span className="tiny muted">คำนวณสดจากข้อมูลล่าสุด</span>
            </div>
            <div className="row">
              {pod.badges.length === 0
                ? <span className="badge good">ข้อมูลครบทุกเรื่องที่ระบบตรวจ</span>
                : pod.badges.map((b) => <Badge key={b.code} badge={b} />)}
            </div>
            <div className="sep" />
            <div className="spread tiny muted" style={{ marginBottom: 6 }}>
              <span>ความครบของข้อมูลสำหรับวางแผน</span><b>{pod.completeness}%</b>
            </div>
            <Meter value={pod.completeness} />
            <div className="grid cols-4" style={{ marginTop: 14 }}>
              {fieldSpecs.map((f) => {
                const c = pod.coverage[f.key];
                return (
                  <div key={f.key} className="card flat" style={{ padding: 12 }}>
                    <div className="tiny muted">{f.label}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: c.known ? 'var(--ink)' : 'var(--grey)' }}>
                      {c.known}/{c.total}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <RouteCard podId={pod.id} />

          {pod.sites.map((s, i) => (
            <div className="card" key={s.id}>
              <div className="spread">
                <div>
                  <div className="pid tiny muted">แหล่งที่ {i + 1} · {s.type || '—'}</div>
                  <h3 style={{ margin: '2px 0 4px' }}>{s.name}</h3>
                  <div className="tiny muted">
                    {[s.district, pod.province].filter(Boolean).join(' · ')}
                    {s.updatedDate ? ` · อัปเดต ${String(s.updatedDate).slice(0, 10)}` : ''}
                  </div>
                </div>
                <div className="row">
                  {s.online?.any ? <span className="pill ghost">มีช่องทางออนไลน์</span> : <span className="pill ghost">ไม่มีตัวตนออนไลน์</span>}
                  {s.tel && <span className="pill ghost">โทร {s.tel}</span>}
                </div>
              </div>

              {s.detail && <p className="tiny muted" style={{ lineHeight: 1.8, marginTop: 10 }}>{s.detail.slice(0, 340)}{s.detail.length > 340 ? '…' : ''}</p>}
              {s.nearby && <div className="tiny muted">ใกล้เคียง: {s.nearby}</div>}

              <div className="sep" />
              <div className="grid cols-2">
                {fieldSpecs.map((f) => (
                  <FieldCell key={f.key} name={f.label} field={s.fields[f.key]} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <aside style={{ display: 'grid', gap: 18, position: 'sticky', top: 82 }}>
          <div className="card">
            <b>วางแผนทริปนี้</b>
            <div className="grid" style={{ gap: 10, marginTop: 12 }}>
              <div className="field">
                <label>ชื่อผู้เดินทาง</label>
                <input type="text" value={plan.travelerName} placeholder="เช่น ทีมไปไกลให้คุ้ม"
                  onChange={(e) => setPlan({ ...plan, travelerName: e.target.value })} />
              </div>
              <div className="row" style={{ gap: 10 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>วันที่ไป</label>
                  <input type="date" value={plan.tripDate} onChange={(e) => setPlan({ ...plan, tripDate: e.target.value })} />
                </div>
                <div className="field" style={{ width: 92 }}>
                  <label>กี่คน</label>
                  <input type="number" min="1" value={plan.partySize} onChange={(e) => setPlan({ ...plan, partySize: e.target.value })} />
                </div>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <div className="field" style={{ width: 110 }}>
                  <label>เวลาที่มี (ชม.)</label>
                  <input type="number" min="2" value={plan.hours}
                    onChange={(e) => { const p = { ...plan, hours: e.target.value }; setPlan(p); loadBriefing(p); }} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>ประเภทรถ</label>
                  <select value={plan.vehicleType}
                    onChange={(e) => { const p = { ...plan, vehicleType: e.target.value }; setPlan(p); loadBriefing(p); }}>
                    <option value="ice">น้ำมัน / ไฮบริด</option>
                    <option value="ev">รถไฟฟ้า (EV)</option>
                  </select>
                </div>
              </div>
              {plan.vehicleType === 'ev' && (
                <div className="field">
                  <label>ระยะวิ่งต่อการชาร์จ (กม.) — กรอกค่าจริงของรถคุณ</label>
                  <input type="number" value={plan.rangeKm}
                    onChange={(e) => { const p = { ...plan, rangeKm: e.target.value }; setPlan(p); loadBriefing(p); }} />
                </div>
              )}
              <div className="field">
                <label>บันทึกเพิ่มเติม</label>
                <textarea value={plan.notes} onChange={(e) => setPlan({ ...plan, notes: e.target.value })}
                  placeholder="เช่น แวะตลาดเช้าก่อนออกเมือง" />
              </div>
              <button className="btn primary" disabled={saving} onClick={save}>
                {saving ? 'กำลังบันทึก…' : 'บันทึกทริปนี้'}
              </button>
              <div className="tiny muted">บันทึกลงไฟล์ sources/database-attraction.json</div>
            </div>
          </div>

          {briefing && <BriefingCard briefing={briefing} />}

          <div className="card">
            <b>ถ้าคุณไปแล้ว ระบบจะถาม 3 ข้อนี้</b>
            <div className="tiny muted" style={{ margin: '6px 0 12px' }}>
              คำถามถูกเลือกจากช่องที่ว่าง คูณกับความต้องการจริงของ pod นี้ ไม่ใช่ฟอร์มรีวิวทั่วไป
            </div>
            <div className="grid" style={{ gap: 10 }}>
              {pod.questions.map((q, i) => (
                <div className="qcard" key={i}>
                  <div className="qh"><b>{q.question}</b><span className="pill orange">คุ้ม {q.value}</span></div>
                  <div className="site">{q.siteName} · {q.fieldLabel}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

/**
 * การ์ดแผนที่ + เส้นทาง
 * ระยะถนนและเวลาขับมาจาก OSRM (OpenStreetMap) — ถ้าติดต่อไม่ได้ระบบจะบอกตรง ๆ
 * แล้วถอยไปใช้ระยะเส้นตรง แทนการเดาตัวเลขถนนขึ้นมาเอง
 */
export function RouteCard({ podId }) {
  const [route, setRoute] = useState(null);
  const [err, setErr] = useState(null);
  const [roads, setRoads] = useState(true);
  const [showLegs, setShowLegs] = useState(false);

  const load = (useRoads) => {
    setRoute(null);
    setErr(null);
    api.route(podId, { roads: useRoads ? undefined : 'false' })
      .then(setRoute)
      .catch((e) => setErr(e.message));
  };

  useEffect(() => { load(roads); /* eslint-disable-next-line */ }, [podId, roads]);

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 10 }}>
        <b>แผนที่และเส้นทางในชุดนี้</b>
        <label className="tiny muted row" style={{ gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={roads} style={{ width: 'auto' }}
            onChange={(e) => setRoads(e.target.checked)} />
          ใช้ระยะถนนจริง (OSRM)
        </label>
      </div>

      {err && <div className="note tiny">โหลดเส้นทางไม่สำเร็จ: {err}</div>}
      {!route && !err && <Loading text="กำลังคำนวณลำดับการแวะและระยะทาง…" />}

      {route && (
        <>
          <OsmMap route={route} />
          <div style={{ marginTop: 12 }}><RouteSummary route={route} /></div>

          <div className="sep" />
          <div className="spread">
            <b style={{ fontSize: 13 }}>ลำดับการแวะที่ระบบจัดให้</b>
            <button className="btn ghost sm" onClick={() => setShowLegs((v) => !v)}>
              {showLegs ? 'ซ่อนรายละเอียดแต่ละช่วง' : 'ดูรายละเอียดแต่ละช่วง'}
            </button>
          </div>
          <ol className="stop-list">
            {route.stops.filter((s) => !s.isOrigin).map((s) => (
              <li key={s.id}>{s.name}{s.type ? <span className="muted tiny"> · {s.type}</span> : null}</li>
            ))}
          </ol>
          {showLegs && <RouteLegs route={route} />}
        </>
      )}
    </div>
  );
}

export function BriefingCard({ briefing }) {
  return (
    <div className="card">
      <b>Pre-trip Briefing</b>
      <div className="tiny muted" style={{ margin: '4px 0 12px' }}>
        ประเมินใช้เวลา ~{briefing.estimate.hours} ชม. · {briefing.estimate.basis}
      </div>

      {briefing.checklist.length > 0 && (
        <div className="note" style={{ marginBottom: 12 }}>
          <b>เตรียมตัวก่อนออกรถ</b>
          <ul className="reasons" style={{ color: 'inherit', marginTop: 6 }}>
            {briefing.checklist.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>รู้แน่ ๆ</div>
      <ul className="reasons">{briefing.know.map((k, i) => <li key={i}>{k}</li>)}</ul>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '10px 0 4px' }}>ยังไม่รู้ (ระบบไม่เดาแทน)</div>
      <ul className="reasons">{briefing.dontKnow.map((k, i) => <li key={i}>{k}</li>)}</ul>

      {briefing.evPlan && (
        <>
          <div className="sep" />
          <b style={{ fontSize: 13 }}>แผนสำหรับรถ EV</b>
          <div className="tiny" style={{ lineHeight: 1.8, marginTop: 6 }}>
            ไป-กลับเส้นตรง {briefing.evPlan.roundTripStraightKm} กม. · ประมาณการตามถนน ~{briefing.evPlan.roundTripEstimateKm} กม.
            {briefing.evPlan.rangeKm ? ` · ระยะวิ่งที่ปลอดภัย ${briefing.evPlan.usableKm} กม.` : ''}
            <div className="muted">{briefing.evPlan.estimateNote}</div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {briefing.evPlan.verdict === 'ok' && <span className="badge good">ไป-กลับได้โดยไม่ต้องชาร์จ (ตามค่าที่กรอก)</span>}
            {briefing.evPlan.verdict === 'tight' && <span className="badge warn">เฉียดฉิว — ควรชาร์จเผื่อ</span>}
            {briefing.evPlan.verdict === 'charge_required' && <span className="badge warn">ต้องชาร์จอย่างน้อย 1 ครั้ง</span>}
            {briefing.evPlan.badges.map((b) => <Badge key={b.code} badge={b} />)}
          </div>
        </>
      )}

      {briefing.citations.length > 0 && (
        <>
          <div className="sep" />
          <b style={{ fontSize: 13 }}>ข้อมูลชั้น B ที่ AI สกัดมา ({briefing.citations.length} รายการ)</b>
          <div className="grid" style={{ gap: 8, marginTop: 8 }}>
            {briefing.citations.slice(0, 4).map((c, i) => (
              <div className="evidence" key={i}>
                <b>{c.siteName} · {c.fieldLabel}: {c.value}</b>
                <div style={{ marginTop: 4 }}>“{c.evidence}”</div>
                <div className="tiny" style={{ opacity: 0.8, marginTop: 4 }}>จากฟิลด์ {c.sourceField}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="dark-note" style={{ marginTop: 12 }}>
        {briefing.disclaimer.map((d, i) => <div key={i}>• {d}</div>)}
      </div>
    </div>
  );
}
