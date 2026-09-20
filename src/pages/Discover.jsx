import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { MetaContext } from '../App.jsx';
import { Badge, Loading, Empty, Meter } from '../components/ui.jsx';

const INTEREST_OPTIONS = ['ธรรมชาติ', 'ศาสนสถาน', 'พิพิธภัณฑ์', 'ชุมชน', 'ตลาด', 'ไร่/สวน', 'น้ำตก', 'จุดชมวิว', 'อุทยาน'];

export default function Discover() {
  const meta = useContext(MetaContext);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({
    province: '', hours: '', maxKm: '', interests: [], ev: false, rangeKm: '', avoidUnknown: false,
  });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const run = async (f = form) => {
    setLoading(true);
    try {
      const r = await api.recommend({
        province: f.province,
        hours: f.hours,
        maxKm: f.maxKm,
        interests: f.interests,
        ev: f.ev,
        rangeKm: f.ev ? f.rangeKm : '',
        avoidUnknown: f.avoidUnknown,
        limit: 12,
      });
      setResults(r.results);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { run(); api.stats().then(setStats); /* eslint-disable-next-line */ }, []);

  const toggleInterest = (i) => {
    const next = { ...form, interests: form.interests.includes(i) ? form.interests.filter((x) => x !== i) : [...form.interests, i] };
    setForm(next);
  };

  return (
    <>
      <section className="hero">
        <h1>ไปไกล<em>ให้คุ้ม</em></h1>
        <p>
          แหล่งท่องเที่ยวนอกเมืองในชุดข้อมูล ททท. ถูกจัดเป็น “pod” ทริปวันเดียว
          ระบบบอกล่วงหน้าว่าทริปนั้น<strong> รู้อะไรแน่ ๆ และยังไม่รู้อะไร</strong> แทนที่จะซ่อนช่องว่างของข้อมูล
        </p>
        {stats && (
          <div className="hero-stats">
            <div><b>{stats.pods}</b><span>ทริป pod ที่จัดชุดแล้ว</span></div>
            <div><b>{stats.attractions.toLocaleString()}</b><span>แหล่งในชุดทริป</span></div>
            <div><b>{stats.provinces}</b><span>จังหวัด</span></div>
            <div><b>{stats.avgCompleteness}%</b><span>ความครบของข้อมูลเฉลี่ย</span></div>
            <div><b>{stats.fieldReports}</b><span>ข้อมูลที่ผู้ใช้เติมกลับมา</span></div>
          </div>
        )}
      </section>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="grid cols-4" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>จังหวัดที่คุณอยู่</label>
            <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })}>
              <option value="">ทุกจังหวัด</option>
              {meta?.provinces?.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label>เวลาที่มี (ชั่วโมง)</label>
            <input type="number" min="2" max="14" placeholder="เช่น 8" value={form.hours}
              onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          </div>
          <div className="field">
            <label>ยอมขับไกลสุด (กม.)</label>
            <input type="number" min="30" step="10" placeholder="เช่น 80" value={form.maxKm}
              onChange={(e) => setForm({ ...form, maxKm: e.target.value })} />
          </div>
          <div className="field">
            <label>ประเภทรถ</label>
            <select value={form.ev ? 'ev' : 'ice'} onChange={(e) => setForm({ ...form, ev: e.target.value === 'ev' })}>
              <option value="ice">น้ำมัน / ไฮบริด</option>
              <option value="ev">รถไฟฟ้า (EV)</option>
            </select>
          </div>
        </div>

        {form.ev && (
          <div className="grid cols-4" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>ระยะวิ่งต่อการชาร์จ (กม.)</label>
              <input type="number" placeholder="เช่น 300" value={form.rangeKm}
                onChange={(e) => setForm({ ...form, rangeKm: e.target.value })} />
            </div>
          </div>
        )}

        <div className="field" style={{ marginBottom: 14 }}>
          <label>สนใจแนวไหน (เลือกได้หลายอย่าง)</label>
          <div className="chips">
            {INTEREST_OPTIONS.map((i) => (
              <button key={i} className={`chip ${form.interests.includes(i) ? 'on' : ''}`} onClick={() => toggleInterest(i)}>{i}</button>
            ))}
          </div>
        </div>

        <div className="spread">
          <label className="row tiny muted" style={{ gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={form.avoidUnknown}
              onChange={(e) => setForm({ ...form, avoidUnknown: e.target.checked })} />
            ไม่เอาทริปที่ข้อมูลน้อยเกินไป (ความครบต่ำกว่า 25%)
          </label>
          <button className="btn primary" onClick={() => run()}>แนะนำทริปให้ฉัน</button>
        </div>
      </div>

      {loading ? <Loading /> : results.length === 0 ? (
        <Empty text="ไม่พบทริปที่ตรงเงื่อนไข — ลองผ่อนเงื่อนไขระยะทางหรือความสนใจ" />
      ) : (
        <div className="grid cols-3">
          {results.map((r, i) => <PodCard key={r.id} pod={r} rank={i + 1} />)}
        </div>
      )}
    </>
  );
}

function PodCard({ pod, rank }) {
  return (
    <Link to={`/pods/${pod.id}`} className="card pod-card">
      <div className="top">
        <div>
          <div className="pid">POD {pod.id} · {pod.region || '—'}</div>
          <h3>{pod.province} · {pod.siteCount} แห่ง</h3>
        </div>
        <span className="rank">#{rank} · {pod.score}</span>
      </div>

      <div className="metrics">
        <div><b>{pod.kmFromHub}</b><span>กม. จากเมืองหลัก</span></div>
        <div><b>{pod.diameterKm}</b><span>กม. รัศมีชุด</span></div>
        <div><b>{pod.categoriesPresent.length}</b><span>หมวด</span></div>
      </div>

      <div>
        <div className="spread tiny muted" style={{ marginBottom: 4 }}>
          <span>ความครบของข้อมูลสำหรับวางแผน</span><b>{pod.completeness}%</b>
        </div>
        <Meter value={pod.completeness} />
      </div>

      <div className="tiny muted" style={{ lineHeight: 1.6 }}>
        {pod.siteNames.slice(0, 4).join(' · ')}{pod.siteNames.length > 4 ? ` · +${pod.siteNames.length - 4}` : ''}
      </div>

      <ul className="reasons">
        {pod.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
      </ul>

      <div className="row">
        {pod.badges.slice(0, 2).map((b) => <Badge key={b.code} badge={b} />)}
        {pod.badges.length > 2 && <span className="pill ghost">+{pod.badges.length - 2} เตือน</span>}
      </div>
    </Link>
  );
}
