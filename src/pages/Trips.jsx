import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, Loading } from '../components/ui.jsx';

export default function Trips() {
  const [plans, setPlans] = useState(null);

  useEffect(() => { api.plans().then(setPlans); }, []);

  if (!plans) return <Loading />;

  return (
    <>
      <div className="page-head">
        <h1>ทริปของฉัน</h1>
        <p>ทุกทริปถูกบันทึกลงไฟล์ <code>sources/database-attraction.json</code> · เมื่อกลับจากทริป ระบบจะถาม 3 คำถามที่ขาดมากที่สุดของชุดนั้น</p>
      </div>

      {plans.length === 0 ? (
        <Empty text="ยังไม่มีทริป — เลือกทริปจากหน้าแนะนำแล้วกดบันทึก" />
      ) : (
        <div className="grid cols-2">
          {plans.map((p) => (
            <Link key={p.id} to={`/trips/${p.id}`} className="card pod-card">
              <div className="top">
                <div>
                  <div className="pid">{p.id} · POD {p.podId}</div>
                  <h3>{p.title}</h3>
                </div>
                <span className={`status ${p.status}`}>{p.status === 'completed' ? 'ไปมาแล้ว' : 'วางแผนไว้'}</span>
              </div>
              <div className="metrics">
                <div><b>{p.briefing?.siteCount ?? '—'}</b><span>แหล่ง</span></div>
                <div><b>{p.briefing?.kmFromHub ?? '—'}</b><span>กม.</span></div>
                <div><b>{p.briefing?.completeness ?? 0}%</b><span>ข้อมูลพร้อม</span></div>
                <div><b>{p.feedbackCount}</b><span>ครั้งที่เติมข้อมูล</span></div>
              </div>
              <div className="tiny muted">
                {p.travelerName} · {p.partySize} คน{p.tripDate ? ` · ${p.tripDate}` : ''} · บันทึกเมื่อ {new Date(p.createdAt).toLocaleString('th-TH')}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
