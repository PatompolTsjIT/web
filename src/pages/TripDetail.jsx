import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, FieldCell, Loading, Meter } from '../components/ui.jsx';
import { BriefingCard, RouteCard } from './PodDetail.jsx';

const SUGGESTIONS = {
  payment: ['เงินสดเท่านั้น', 'สแกนจ่าย/พร้อมเพย์ได้', 'รับบัตรเครดิต'],
  facilities: ['มีห้องน้ำและที่จอดรถ', 'มีที่จอดรถ ไม่มีห้องน้ำ', 'ไม่มีทั้งสองอย่าง'],
  food: ['มีร้านอาหารในพื้นที่', 'มีร้านค้า/ของว่าง', 'ไม่มีร้านใด ๆ'],
  season: ['ตลอดทั้งปี', 'ฤดูหนาว (พ.ย.–ก.พ.)', 'ฤดูฝน (มิ.ย.–ต.ค.)', 'ฤดูร้อน (มี.ค.–พ.ค.)'],
  fee: ['0 (ไม่เก็บค่าเข้า)', '20', '50', '100'],
  hours: ['เปิดตรงกับที่ระบบแสดง', 'ทุกวัน 08.00-17.00 น.', 'ปิดวันจันทร์'],
  ev: ['มีจุดชาร์จในพื้นที่', 'มีจุดชาร์จระหว่างทาง', 'ไม่พบจุดชาร์จเลย'],
};

export default function TripDetail() {
  const { id } = useParams();
  const [trip, setTrip] = useState(null);
  const [answers, setAnswers] = useState({});
  const [by, setBy] = useState('');
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState('');
  const [result, setResult] = useState(null);
  const [before, setBefore] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.plan(id).then((t) => {
      setTrip(t);
      setBefore(t.pod?.completeness ?? 0);
      setBy(t.travelerName === 'ไม่ระบุชื่อ' ? '' : t.travelerName);
    });
  }, [id]);

  if (!trip) return <Loading />;
  const pod = result?.pod || trip.pod;
  const questions = result?.nextQuestions || trip.questions;

  const submit = async () => {
    setSending(true);
    try {
      const payload = {
        planId: trip.id,
        podId: trip.podId,
        by: by || 'ผู้ใช้ไม่ระบุชื่อ',
        rating,
        comment,
        answers: (trip.questions || []).map((q) => ({
          siteId: q.siteId,
          field: q.field,
          value: answers[`${q.siteId}|${q.field}`] || '',
        })).filter((a) => a.value),
      };
      const r = await api.sendFeedback(payload);
      setResult(r);
      setAnswers({});
      const fresh = await api.plan(id);
      setTrip({ ...fresh, questions: r.nextQuestions });
    } finally {
      setSending(false);
    }
  };

  const answeredCount = Object.values(answers).filter(Boolean).length;

  return (
    <>
      <div className="page-head">
        <Link to="/trips" className="tiny muted">← กลับรายการทริป</Link>
        <h1>{trip.title}</h1>
        <p>
          {trip.id} · <Link to={`/pods/${trip.podId}`} style={{ color: 'var(--orange-600)', fontWeight: 600 }}>POD {trip.podId}</Link> ·
          {' '}{trip.travelerName} · {trip.partySize} คน{trip.tripDate ? ` · ${trip.tripDate}` : ''} ·
          {' '}<span className={`status ${trip.status}`}>{trip.status === 'completed' ? 'ไปมาแล้ว' : 'วางแผนไว้'}</span>
        </p>
      </div>

      <div className="split">
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="card">
            <div className="spread">
              <b>สถานะข้อมูลของทริปนี้</b>
              {result && (
                <span className="pill orange">
                  ความครบ {before}% → {pod.completeness}% {pod.completeness > before ? `(+${pod.completeness - before})` : ''}
                </span>
              )}
            </div>
            <div style={{ marginTop: 10 }}><Meter value={pod?.completeness ?? 0} /></div>
            <div className="row" style={{ marginTop: 12 }}>
              {(pod?.badges || []).map((b) => <Badge key={b.code} badge={b} />)}
            </div>
          </div>

          <RouteCard podId={trip.podId} />

          <div className="card">
            <b>เก็บข้อมูลหลังทริป — 3 คำถามที่ระบบเลือกเองว่าถามแล้วคุ้มที่สุด</b>
            <div className="tiny muted" style={{ margin: '6px 0 14px' }}>
              เลือกจากช่องที่ยังว่างอยู่ × ความต้องการจริงของ pod นี้ (ถูกเปิดดู/วางแผนกี่ครั้ง) — คำตอบจะกลายเป็นข้อมูล “ชั้น D” และต้องมีคนตอบตรงกัน 2 คนจึงนับเป็นข้อมูลยืนยัน
            </div>

            <div className="grid" style={{ gap: 12 }}>
              {questions.map((q, i) => {
                const key = `${q.siteId}|${q.field}`;
                return (
                  <div className="qcard" key={key + i}>
                    <div className="qh">
                      <b>{i + 1}. {q.question}</b>
                      <span className="pill orange">คุ้ม {q.value}</span>
                    </div>
                    <div className="site" style={{ marginBottom: 8 }}>{q.siteName} · {q.fieldLabel} · {q.why}</div>
                    <input
                      type="text"
                      list={`sug-${q.field}`}
                      placeholder="พิมพ์สิ่งที่คุณเจอจริง (เว้นว่างได้ถ้าไม่แน่ใจ)"
                      value={answers[key] || ''}
                      onChange={(e) => setAnswers({ ...answers, [key]: e.target.value })}
                    />
                    <datalist id={`sug-${q.field}`}>
                      {(SUGGESTIONS[q.field] || []).map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                );
              })}
            </div>

            <div className="sep" />
            <div className="grid cols-2">
              <div className="field">
                <label>ชื่อผู้รายงาน</label>
                <input type="text" value={by} onChange={(e) => setBy(e.target.value)} placeholder="เช่น ก้อง" />
              </div>
              <div className="field">
                <label>ให้คะแนนทริปนี้</label>
                <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} ดาว</option>)}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>เล่าสั้น ๆ ว่าไปแล้วเจออะไร</label>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="เช่น ถนนช่วงสุดท้ายเป็นลูกรัง ควรใช้รถสูง" />
            </div>

            <div className="spread" style={{ marginTop: 14 }}>
              <span className="tiny muted">ตอบแล้ว {answeredCount}/{questions.length} ข้อ</span>
              <button className="btn primary" disabled={sending || answeredCount === 0} onClick={submit}>
                {sending ? 'กำลังบันทึก…' : 'ส่งข้อมูลกลับเข้าระบบ'}
              </button>
            </div>

            {result && (
              <div className="note" style={{ marginTop: 14 }}>
                บันทึกแล้ว {result.reports.length} รายการลง <code>database-attraction.json</code> —
                ช่องที่เคยเป็น “ไม่มีข้อมูล” กลายเป็นข้อมูลชั้น D ทันที และทริปนี้จะถูกจัดอันดับใหม่ในหน้าแนะนำ
              </div>
            )}
          </div>

          {pod && (
            <div className="card">
              <b>ข้อมูลรายแหล่งหลังอัปเดต</b>
              <div className="tiny muted" style={{ margin: '4px 0 12px' }}>
                สีเทา = ไม่มีข้อมูล · เขียว = ฟิลด์ ททท. · เหลือง = AI สกัด (กดดูประโยคต้นฉบับ) · ฟ้า = ผู้ใช้รายงาน
              </div>
              <div className="grid" style={{ gap: 14 }}>
                {pod.sites.map((s) => (
                  <div key={s.id} className="card flat">
                    <b style={{ fontSize: 14 }}>{s.name}</b>
                    <div className="grid cols-2" style={{ marginTop: 10 }}>
                      {Object.entries(s.fields).map(([k, f]) => (
                        <FieldCell key={k} name={f.label} field={f} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside style={{ display: 'grid', gap: 18 }}>
          {trip.briefing && <BriefingCard briefing={trip.briefing} />}

          {trip.feedback?.length > 0 && (
            <div className="card">
              <b>ประวัติการเติมข้อมูลของทริปนี้</b>
              <div className="timeline" style={{ marginTop: 12 }}>
                {trip.feedback.slice().reverse().map((f) => (
                  <div className="t-item" key={f.id}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{f.by} · {f.answerCount} ช่อง</div>
                    <div className="tiny muted">{new Date(f.createdAt).toLocaleString('th-TH')}{f.rating ? ` · ${f.rating} ดาว` : ''}</div>
                    {f.comment && <div className="tiny" style={{ marginTop: 4 }}>“{f.comment}”</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
