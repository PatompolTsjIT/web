import React, { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api.js';
import Discover from './pages/Discover.jsx';
import PodDetail from './pages/PodDetail.jsx';
import Trips from './pages/Trips.jsx';
import TripDetail from './pages/TripDetail.jsx';
import Dashboard from './pages/Dashboard.jsx';

export const MetaContext = React.createContext(null);

export default function App() {
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setErr(e.message));
  }, []);

  return (
    <MetaContext.Provider value={meta}>
      <div className="app">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">
              <span className="dot" />
              ไปไกลให้คุ้ม
              <small>ข้อมูลแหล่งท่องเที่ยว ททท. → ทริปวันเดียวที่ไปแล้วไม่เสียเที่ยว</small>
            </div>
            <nav className="nav">
              <NavLink to="/" end>แนะนำทริป</NavLink>
              <NavLink to="/trips">ทริปของฉัน</NavLink>
              <NavLink to="/dashboard">แดชบอร์ด ททท.</NavLink>
            </nav>
          </div>
        </header>

        <main className="main">
          {err && <div className="note" style={{ marginBottom: 16 }}>เชื่อมต่อ API ไม่ได้: {err} — ตรวจว่ารัน <code>npm run dev</code> อยู่หรือไม่</div>}
          <Routes>
            <Route path="/" element={<Discover />} />
            <Route path="/pods/:id" element={<PodDetail />} />
            <Route path="/trips" element={<Trips />} />
            <Route path="/trips/:id" element={<TripDetail />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>

        <footer className="footer">
          <div className="footer-inner">
            <span>ข้อมูลต้นทาง: ชุดข้อมูลแหล่งท่องเที่ยว ททท. (attraction.json){meta?.dataSnapshot ? ` · snapshot ${meta.dataSnapshot}` : ''}</span>
            <span>ระยะทางเป็นเส้นตรงจากพิกัด ไม่ใช่ระยะถนนจริง</span>
            <span>“ไม่พบ” = ไม่พบในชุดข้อมูล ไม่ได้แปลว่าไม่มีจริง</span>
            {meta && <span>บันทึกลง sources/database-attraction.json</span>}
          </div>
        </footer>
      </div>
    </MetaContext.Provider>
  );
}
