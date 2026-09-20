import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * แผนที่ OpenStreetMap พร้อมเส้นทางการแวะ
 *
 * ใช้ Leaflet ตรง ๆ และวาดหมุดด้วย divIcon (ไม่พึ่งไฟล์ภาพของ Leaflet
 * ที่มักหายไปตอน bundle) — เส้นทางรับมาจาก /api/route/:podId
 */
export default function OsmMap({ route, height = 380 }) {
  const holder = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  const stops = useMemo(() => (route?.stops || []).filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number'), [route]);

  useEffect(() => {
    if (!holder.current || map.current) return;
    map.current = L.map(holder.current, { scrollWheelZoom: false, zoomControl: true })
      .setView([13.75, 100.5], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    if (!stops.length) return;

    const roadLine = route?.geometry?.length ? route.geometry : null;

    /* เส้นทาง: ถ้ามีรูปเส้นถนนจริงจาก OSRM วาดทึบ ถ้าไม่มีวาดเส้นประ
       เพื่อให้เห็นชัดว่าเป็นแค่เส้นตรงระหว่างพิกัด ไม่ใช่ถนนจริง */
    if (roadLine) {
      L.polyline(roadLine, { color: '#ff6b00', weight: 5, opacity: 0.85 }).addTo(g);
    } else {
      L.polyline(stops.map((s) => [s.lat, s.lng]), {
        color: '#ff6b00', weight: 3, opacity: 0.8, dashArray: '7 7',
      }).addTo(g);
    }

    stops.forEach((s, i) => {
      const isOrigin = s.isOrigin;
      const n = stops[0]?.isOrigin ? i : i + 1;
      const html = `<span class="pin ${isOrigin ? 'origin' : ''}">${isOrigin ? '◆' : n}</span>`;
      const leg = route?.legs?.[i - 1];
      const legText = leg
        ? `<div class="pop-leg">จากจุดก่อนหน้า ${leg.roadKm != null ? `${leg.roadKm} กม. ตามถนน · ~${Math.round(leg.durationMin)} นาที` : `${leg.straightKm} กม. (เส้นตรง)`}</div>`
        : '';
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: 'pin-wrap', html, iconSize: [26, 26], iconAnchor: [13, 13] }),
      })
        .bindPopup(`<b>${escapeHtml(s.name)}</b>${s.type ? `<div class="pop-type">${escapeHtml(s.type)}</div>` : ''}${legText}`)
        .addTo(g);
    });

    const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng]));
    if (roadLine) roadLine.forEach((p) => bounds.extend(p));
    m.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    // แผนที่ที่ถูกสร้างตอนกล่องยังไม่มีขนาด ต้องสั่งวัดใหม่
    setTimeout(() => m.invalidateSize(), 60);
  }, [route, stops]);

  return (
    <div>
      <div ref={holder} className="osm" style={{ height }} />
      {!stops.length && <div className="empty tiny">ไม่มีพิกัดสำหรับวาดแผนที่</div>}
    </div>
  );
}

/** สรุปตัวเลขเส้นทาง — แยกให้ชัดว่าเลขไหนมาจากถนนจริง เลขไหนเป็นเส้นตรง */
export function RouteSummary({ route }) {
  if (!route) return null;
  const t = route.totals || {};
  const osrm = route.source === 'osrm';
  return (
    <div>
      <div className="route-stats">
        <div>
          <b>{osrm ? `${t.roadKm} กม.` : `${t.straightKm} กม.`}</b>
          <span>{osrm ? 'ระยะขับตามถนนจริง' : 'ระยะเส้นตรงรวม'}</span>
        </div>
        {osrm && (
          <div>
            <b>{formatDuration(t.durationMin)}</b>
            <span>เวลาขับโดยประมาณ</span>
          </div>
        )}
        <div>
          <b>{t.straightKm} กม.</b>
          <span>ระยะเส้นตรงรวม</span>
        </div>
        {osrm && t.detourRatio && (
          <div>
            <b>×{t.detourRatio}</b>
            <span>ถนนจริงยาวกว่าเส้นตรง</span>
          </div>
        )}
        <div>
          <b>{route.stops.filter((s) => !s.isOrigin).length}</b>
          <span>จุดแวะ</span>
        </div>
      </div>
      <div className={osrm ? 'tiny muted' : 'note tiny'} style={{ marginTop: 10, lineHeight: 1.7 }}>
        {route.attribution}
        <div>{route.note}</div>
        {route.skipped?.length > 0 && (
          <div>ไม่ได้ใส่ในเส้นทาง {route.skipped.length} แห่ง เพราะไม่มีพิกัดในชุดข้อมูล</div>
        )}
      </div>
    </div>
  );
}

/** ตารางช่วงการเดินทางทีละช่วง */
export function RouteLegs({ route }) {
  if (!route?.legs?.length) return null;
  return (
    <div className="scroll-x" style={{ marginTop: 12 }}>
      <table className="tbl">
        <thead>
          <tr><th style={{ width: 34 }}>#</th><th>ช่วงการเดินทาง</th><th style={{ width: 110 }}>ตามถนน</th><th style={{ width: 92 }}>เส้นตรง</th><th style={{ width: 96 }}>เวลาขับ</th></tr>
        </thead>
        <tbody>
          {route.legs.map((l, i) => (
            <tr key={i}>
              <td className="muted">{i + 1}</td>
              <td>{l.fromName} → <b>{l.toName}</b></td>
              <td>{l.roadKm != null ? `${l.roadKm} กม.` : <span className="muted tiny">ไม่ทราบ</span>}</td>
              <td className="muted">{l.straightKm} กม.</td>
              <td>{l.durationMin != null ? `~${Math.round(l.durationMin)} นาที` : <span className="muted tiny">ไม่ทราบ</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDuration(min) {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} ชม. ${m} น.` : `${m} นาที`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
