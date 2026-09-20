import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { MetaContext } from '../App.jsx';
import { Loading, Meter, Tier } from '../components/ui.jsx';
import { PromoteForm, RevokeForm, TierArrow } from '../components/Promote.jsx';

export default function Dashboard() {
  const meta = useContext(MetaContext);
  const [stats, setStats] = useState(null);
  const [gaps, setGaps] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [province, setProvince] = useState('');

  const loadGaps = (p = province) => api.gaps({ province: p, limit: 20 }).then(setGaps);
  const loadStats = () => api.stats().then(setStats);

  useEffect(() => {
    loadStats();
    loadGaps('');
    api.feedback().then(setFeedback);
    // eslint-disable-next-line
  }, []);

  if (!stats || !gaps) return <Loading />;

  return (
    <>
      <div className="page-head">
        <h1>แดชบอร์ด ททท.</h1>
        <p>
          ดูว่าข้อมูลชุดไหนยังขาด และชุดไหนพร้อมยกระดับความน่าเชื่อถือ —
          นักท่องเที่ยวรายงานกลับมา (ชั้น D) → เจ้าหน้าที่ตรวจรับรอง (ชั้น B) → รับเข้าระเบียนทางการ ททท. (ชั้น A)
        </p>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <Stat label="ทริป pod ทั้งหมด" value={stats.pods} />
        <Stat label="แหล่งในชุดทริป" value={stats.attractions.toLocaleString()} />
        <Stat label="ความครบเฉลี่ย" value={`${stats.avgCompleteness}%`} />
        <Stat label="ช่องที่ผู้ใช้เติมกลับมา" value={stats.fieldReports} accent />
      </div>

      <TierLadder stats={stats} />

      <PromotionDesk province={province} onChanged={() => { loadStats(); loadGaps(); }} />

      <div className="card" style={{ marginBottom: 20 }}>
        <b>ความครอบคลุมของข้อมูลรายเรื่อง — แยกที่มา</b>
        <div className="tiny muted" style={{ margin: '4px 0 14px' }}>
          จากชุดข้อมูล ททท. + AI สกัด เทียบกับส่วนที่นักท่องเที่ยวรายงานกลับมาหลังทริป
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>เรื่อง</th><th>รู้แล้ว</th><th>จากข้อมูล/AI สกัด</th><th>จากผู้ใช้</th>
                <th>ยกระดับแล้ว</th><th style={{ width: 240 }}>ความครอบคลุม</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.coverage).map(([k, c]) => (
                <tr key={k}>
                  <td><b>{c.label}</b></td>
                  <td>{c.known}/{c.total}</td>
                  <td>{c.fromSource}</td>
                  <td style={{ color: c.fromUsers ? 'var(--blue)' : 'inherit', fontWeight: c.fromUsers ? 700 : 400 }}>{c.fromUsers}</td>
                  <td style={{ color: c.promoted ? 'var(--green)' : 'inherit', fontWeight: c.promoted ? 700 : 400 }}>{c.promoted}</td>
                  <td>
                    <Meter value={(c.known / (c.total || 1)) * 100} />
                    <span className="tiny muted">{Math.round((c.known / (c.total || 1)) * 100)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <b>Gap Queue — ควรเติมชุดไหนก่อน</b>
          <select style={{ width: 220 }} value={province}
            onChange={(e) => { setProvince(e.target.value); loadGaps(e.target.value); }}>
            <option value="">ทุกจังหวัด</option>
            {meta?.provinces?.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>POD</th><th>จังหวัด</th><th>แหล่ง</th><th>กม.</th>
                <th>ช่องว่างที่เหลือ</th><th>เติมแล้ว</th><th>ความต้องการ</th><th>สรุปงาน</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((g) => (
                <tr key={g.podId}>
                  <td><Link to={`/pods/${g.podId}`} style={{ color: 'var(--orange-600)', fontWeight: 700 }}>{g.podId}</Link></td>
                  <td>{g.province}</td>
                  <td>{g.siteCount}</td>
                  <td>{g.kmFromHub}</td>
                  <td><b>{g.gaps}</b></td>
                  <td style={{ color: g.filled ? 'var(--blue)' : 'inherit' }}>{g.filled}</td>
                  <td>{g.demand}</td>
                  <td className="tiny">{g.readyIf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <b>ข้อมูลที่เพิ่งถูกเติมกลับมา</b>
        {feedback.length === 0 ? (
          <div className="tiny muted" style={{ marginTop: 8 }}>ยังไม่มีใครส่งข้อมูลหลังทริป</div>
        ) : (
          <div className="timeline" style={{ marginTop: 12 }}>
            {feedback.slice(0, 12).map((f) => (
              <div className="t-item" key={f.id}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  POD {f.podId} · {f.by} เติม {f.answerCount} ช่อง
                </div>
                <div className="tiny muted">{new Date(f.createdAt).toLocaleString('th-TH')}</div>
                <div className="tiny" style={{ marginTop: 4 }}>
                  {f.reports?.map((r) => `${r.field}: ${r.value}`).join(' · ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  บันไดชั้นข้อมูล — ภาพรวมว่าตอนนี้ข้อมูลทั้งระบบอยู่ชั้นไหนบ้าง       */
/* ------------------------------------------------------------------ */
function TierLadder({ stats }) {
  const t = stats.tierTotals || { A: 0, B: 0, D: 0, C: 0 };
  const total = (t.A + t.B + t.D + t.C) || 1;
  const p = stats.promotions || {};
  const steps = [
    { tier: 'C', count: t.C, note: 'ยังไม่มีข้อมูล' },
    { tier: 'D', count: t.D, note: 'ผู้ใช้รายงานกลับมา' },
    { tier: 'B', count: t.B, note: 'หลักฐานที่ตรวจได้' },
    { tier: 'A', count: t.A, note: 'ระเบียนทางการ ททท.' },
  ];

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="spread" style={{ marginBottom: 12 }}>
        <b>บันไดความน่าเชื่อถือของข้อมูล</b>
        <span className="tiny muted">นับทุกช่องข้อมูลของทุกแหล่งในทุก pod ({total.toLocaleString()} ช่อง)</span>
      </div>

      <div className="ladder">
        {steps.map((s) => (
          <div className="ladder-step" key={s.tier}>
            <Tier tier={s.tier} />
            <b>{s.count.toLocaleString()}</b>
            <span className="tiny muted">{s.note}</span>
            <div className="ladder-bar"><i className={`t${s.tier}`} style={{ width: `${(s.count / total) * 100}%` }} /></div>
            <span className="tiny muted">{((s.count / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>

      <div className="sep" />
      <div className="row" style={{ gap: 20 }}>
        <LadderStat label="ยกระดับแล้วและยังมีผล" value={p.active || 0} />
        <LadderStat label="D → B" value={p.dToB || 0} />
        <LadderStat label="B → A" value={p.bToA || 0} />
        <LadderStat label="ถอนคืนแล้ว" value={p.revoked || 0} />
        <LadderStat label="รอตรวจ D → B" value={p.pendingDToB || 0} highlight={Boolean(p.pendingDToB)} />
        <LadderStat label="รอรับเข้า B → A" value={(p.pendingBToA || 0).toLocaleString()} highlight={Boolean(p.pendingBToA)} />
      </div>
    </div>
  );
}

function LadderStat({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: highlight ? 'var(--orange-600)' : 'var(--ink)' }}>{value}</div>
      <div className="tiny muted">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  โต๊ะตรวจยกระดับ — คิวงาน D→B / B→A และสมุดบันทึกที่ย้อนดูได้        */
/* ------------------------------------------------------------------ */
function PromotionDesk({ province, onChanged }) {
  const [tab, setTab] = useState('B');
  const [queue, setQueue] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [openRow, setOpenRow] = useState(null);
  const [openRevoke, setOpenRevoke] = useState(null);
  const [flash, setFlash] = useState(null);

  const loadQueue = (to = tab, prov = province) =>
    api.promotionQueue({ to, province: prov, limit: 25 }).then(setQueue);
  const loadLedger = () => api.promotions({ limit: 30 }).then(setLedger);

  useEffect(() => {
    if (tab === 'log') { setLedger(null); loadLedger(); return; }
    setQueue(null);
    loadQueue(tab);
    // eslint-disable-next-line
  }, [tab, province]);

  const afterChange = (msg) => {
    setFlash(msg);
    setOpenRow(null);
    setOpenRevoke(null);
    if (tab === 'log') loadLedger(); else loadQueue();
    onChanged?.();
    setTimeout(() => setFlash(null), 6000);
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="spread" style={{ marginBottom: 4 }}>
        <b>โต๊ะตรวจ — ยกระดับชั้นความน่าเชื่อถือ</b>
        <span className="tiny muted">ทุกการยกระดับต้องมีผู้รับผิดชอบ และถอนคืนได้เสมอ</span>
      </div>
      <div className="tiny muted" style={{ marginBottom: 12 }}>
        ชั้น D ยกเป็นชั้น B ได้เมื่อมีผู้ไปจริงรายงานตรงกันอย่างน้อย 2 คน ·
        ชั้น B ยกเป็นชั้น A ได้เมื่อเจ้าหน้าที่ ททท. รับเข้าเป็นระเบียนทางการ
      </div>

      <div className="chips" style={{ marginBottom: 14 }}>
        <button className={`chip ${tab === 'B' ? 'on' : ''}`} onClick={() => setTab('B')}>รอตรวจ · ชั้น D → B</button>
        <button className={`chip ${tab === 'A' ? 'on' : ''}`} onClick={() => setTab('A')}>รอรับเข้า · ชั้น B → A</button>
        <button className={`chip ${tab === 'log' ? 'on' : ''}`} onClick={() => setTab('log')}>สมุดบันทึกการยกระดับ</button>
      </div>

      {flash && <div className="note" style={{ marginBottom: 12 }}>{flash}</div>}

      {tab === 'log'
        ? <Ledger ledger={ledger} openRevoke={openRevoke} onRevoke={setOpenRevoke} afterChange={afterChange} />
        : <Queue tab={tab} queue={queue} openRow={openRow} setOpenRow={setOpenRow} afterChange={afterChange} />}
    </div>
  );
}

function Queue({ tab, queue, openRow, setOpenRow, afterChange }) {
  if (!queue) return <Loading text="กำลังรวบรวมช่องที่พร้อมยกระดับ…" />;
  if (!queue.rows.length) {
    return (
      <div className="empty tiny">
        {tab === 'B'
          ? 'ยังไม่มีช่องไหนมีผู้รายงานตรงกันครบ 2 คน — รอ feedback จากนักท่องเที่ยวก่อน'
          : 'ไม่มีช่องชั้น B ที่รอรับเข้าระเบียนทางการในขอบเขตที่เลือก'}
      </div>
    );
  }

  return (
    <>
      <div className="tiny muted" style={{ marginBottom: 8 }}>
        พบ {queue.total.toLocaleString()} ช่องที่ยกระดับได้ · แสดง {queue.rows.length} รายการแรก
        เรียงตามผลกระทบ (น้ำหนักของเรื่อง × ความต้องการจริงของ pod)
      </div>
      <div className="scroll-x">
        <table className="tbl">
          <thead>
            <tr>
              <th>แหล่ง</th><th>เรื่อง</th><th>ค่าที่จะรับรอง</th>
              <th style={{ width: 150 }}>ชั้น</th><th style={{ width: 80 }}>ผลกระทบ</th><th style={{ width: 118 }} />
            </tr>
          </thead>
          <tbody>
            {queue.rows.map((r) => {
              const key = `${r.siteId}|${r.field}|${r.to}`;
              return (
                <React.Fragment key={key}>
                  <tr>
                    <td>
                      <b>{r.siteName}</b>
                      <div className="tiny muted">{[r.district, r.province].filter(Boolean).join(' · ')} · POD {r.podId}</div>
                    </td>
                    <td>{r.fieldLabel}</td>
                    <td style={{ maxWidth: 280 }}>{r.value}</td>
                    <td><TierArrow from={r.from} to={r.to} /></td>
                    <td><b>{r.impact}</b></td>
                    <td>
                      <button className="btn ghost sm" onClick={() => setOpenRow(openRow === key ? null : key)}>
                        {openRow === key ? 'ปิด' : `ยกเป็นชั้น ${r.to}`}
                      </button>
                    </td>
                  </tr>
                  {openRow === key && (
                    <tr>
                      <td colSpan={6} style={{ background: '#fffaf5' }}>
                        <PromoteForm
                          row={r}
                          onCancel={() => setOpenRow(null)}
                          onDone={(out) => afterChange(
                            `ยกระดับสำเร็จ — ${r.siteName} · ${r.fieldLabel} เป็นชั้น ${out.promotion.to} แล้ว (${out.promotion.id}) โดย ${out.promotion.by}`,
                          )}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Ledger({ ledger, openRevoke, onRevoke, afterChange }) {
  if (!ledger) return <Loading text="กำลังโหลดสมุดบันทึก…" />;
  if (!ledger.rows.length) return <div className="empty tiny">ยังไม่มีการยกระดับชั้นข้อมูล</div>;

  return (
    <div className="scroll-x">
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 92 }}>รหัส</th><th>แหล่ง / เรื่อง</th><th>ค่า</th><th style={{ width: 150 }}>ชั้น</th>
            <th>ผู้รับผิดชอบ</th><th style={{ width: 150 }}>เมื่อ</th><th style={{ width: 92 }} />
          </tr>
        </thead>
        <tbody>
          {ledger.rows.map((p) => (
            <React.Fragment key={p.id}>
              <tr style={p.revokedAt ? { opacity: 0.55 } : undefined}>
                <td className="tiny"><b>{p.id}</b></td>
                <td>
                  <b>{p.siteName}</b>
                  <div className="tiny muted">{p.fieldLabel}{p.province ? ` · ${p.province}` : ''}</div>
                </td>
                <td style={{ maxWidth: 240 }}>{p.value}</td>
                <td><TierArrow from={p.from} to={p.to} /></td>
                <td>
                  {p.by}
                  {p.note && <div className="tiny muted">{p.note}</div>}
                </td>
                <td className="tiny muted">{new Date(p.createdAt).toLocaleString('th-TH')}</td>
                <td>
                  {p.revokedAt
                    ? <span className="pill ghost">ถอนแล้ว</span>
                    : (
                      <button className="btn ghost sm" onClick={() => onRevoke(openRevoke === p.id ? null : p.id)}>
                        {openRevoke === p.id ? 'ปิด' : 'ถอน'}
                      </button>
                    )}
                </td>
              </tr>
              {p.revokedAt && (
                <tr>
                  <td colSpan={7} className="tiny muted" style={{ paddingTop: 0 }}>
                    ถอนโดย {p.revokedBy} เมื่อ {new Date(p.revokedAt).toLocaleString('th-TH')}
                    {p.revokeReason ? ` — ${p.revokeReason}` : ''}
                  </td>
                </tr>
              )}
              {openRevoke === p.id && !p.revokedAt && (
                <tr>
                  <td colSpan={7} style={{ background: '#fffaf5' }}>
                    <RevokeForm
                      promotion={p}
                      onCancel={() => onRevoke(null)}
                      onDone={() => afterChange(`ถอนการยกระดับ ${p.id} แล้ว — ข้อมูลกลับไปชั้นเดิม`)}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="card" style={accent ? { borderColor: 'var(--orange-200)', background: 'var(--orange-50)' } : undefined}>
      <div className="tiny muted">{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent ? 'var(--orange-600)' : 'var(--ink)' }}>{value}</div>
    </div>
  );
}
