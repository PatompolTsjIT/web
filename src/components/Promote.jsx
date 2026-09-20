import React, { useState } from 'react';
import { api } from '../api.js';
import { Tier } from './ui.jsx';

/** ป้ายลูกศรบอกทิศทางการยกระดับ เช่น ชั้น D → ชั้น B */
export function TierArrow({ from, to }) {
  return (
    <span className="tier-arrow">
      <Tier tier={from} />
      <b>→</b>
      <Tier tier={to} />
    </span>
  );
}

/**
 * กล่องยืนยันการยกระดับ 1 ช่องข้อมูล
 * บังคับให้กรอกชื่อผู้รับผิดชอบเสมอ — ไม่มีการยกระดับแบบไม่มีเจ้าของ
 */
export function PromoteForm({ row, onDone, onCancel }) {
  const [by, setBy] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!by.trim()) { setErr('ต้องระบุผู้รับผิดชอบ'); return; }
    setBusy(true);
    setErr(null);
    try {
      const out = await api.promote({ siteId: row.siteId, field: row.field, to: row.to, by: by.trim(), note });
      onDone?.(out);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="promote-form">
      <div className="spread" style={{ marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>{row.siteName} · {row.fieldLabel}</b>
        <TierArrow from={row.from} to={row.to} />
      </div>

      <div className="promote-value">ค่าที่จะรับรอง: <b>{row.value}</b></div>

      {row.basis?.evidence && <div className="evidence" style={{ marginTop: 8 }}>{row.basis.evidence}</div>}

      {row.basis?.reporters?.length > 0 && (
        <div className="tiny muted" style={{ marginTop: 6 }}>ผู้รายงาน: {row.basis.reporters.join(', ')}</div>
      )}
      {row.sourceValue && row.sourceTier && String(row.sourceValue) !== String(row.value) && (
        <div className="note tiny" style={{ marginTop: 8 }}>
          ค่าเดิมชั้น {row.sourceTier} คือ “{row.sourceValue}” — การยกระดับนี้จะทำให้ระบบใช้ค่าใหม่แทน
        </div>
      )}

      <div className="grid" style={{ gap: 10, marginTop: 12 }}>
        <div className="field">
          <label>ผู้รับผิดชอบ (บังคับ)</label>
          <input type="text" value={by} placeholder={row.to === 'A' ? 'เช่น ททท. สำนักงานเชียงใหม่' : 'เช่น ทีมตรวจข้อมูล'}
            onChange={(e) => setBy(e.target.value)} />
        </div>
        <div className="field">
          <label>เหตุผล / หลักฐานที่ใช้ตรวจ</label>
          <textarea value={note} placeholder="เช่น โทรสอบถามเจ้าหน้าที่แหล่งแล้ว ตรงกับที่ผู้ใช้รายงาน"
            onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {err && <div className="note tiny" style={{ marginTop: 8 }}>{err}</div>}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary sm" disabled={busy} onClick={submit}>
          {busy ? 'กำลังบันทึก…' : `ยืนยันยกเป็นชั้น ${row.to}`}
        </button>
        <button className="btn ghost sm" disabled={busy} onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  );
}

/** กล่องถอนการยกระดับ */
export function RevokeForm({ promotion, onDone, onCancel }) {
  const [by, setBy] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!by.trim()) { setErr('ต้องระบุผู้ถอน'); return; }
    setBusy(true);
    setErr(null);
    try {
      const out = await api.revokePromotion(promotion.id, { by: by.trim(), reason });
      onDone?.(out);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="promote-form">
      <b style={{ fontSize: 14 }}>ถอนการยกระดับ {promotion.id}</b>
      <div className="tiny muted" style={{ marginTop: 4 }}>
        ข้อมูลจะกลับไปชั้นเดิมทันที ประวัติยังเก็บไว้ในสมุดบันทึก
      </div>
      <div className="grid" style={{ gap: 10, marginTop: 12 }}>
        <div className="field">
          <label>ผู้ถอน (บังคับ)</label>
          <input type="text" value={by} onChange={(e) => setBy(e.target.value)} />
        </div>
        <div className="field">
          <label>เหตุผลที่ถอน</label>
          <input type="text" value={reason} placeholder="เช่น พบว่าร้านปิดถาวรแล้ว" onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      {err && <div className="note tiny" style={{ marginTop: 8 }}>{err}</div>}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn sm" disabled={busy} onClick={submit}>{busy ? 'กำลังถอน…' : 'ยืนยันถอน'}</button>
        <button className="btn ghost sm" disabled={busy} onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  );
}
