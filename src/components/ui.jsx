import React, { useState } from 'react';

export const TIER_LABEL = {
  A: 'ข้อมูล ททท.',
  B: 'AI สกัดจากข้อความ',
  D: 'ผู้ใช้รายงานหลังไปจริง',
  C: 'ไม่มีข้อมูล',
};

/** ป้ายชั้นข้อมูล — ส่ง label มาแทนได้ เช่นช่องที่ถูกยกระดับซึ่งที่มาไม่ใช่ AI สกัด */
export function Tier({ tier, label }) {
  const text = label || TIER_LABEL[tier];
  return (
    <span className={`tier ${tier}`} title={text}>
      <i className="bullet" />
      ชั้น {tier} · {text}
    </span>
  );
}

/** ที่มาที่ควรเขียนบนป้าย เมื่อช่องนั้นมาจากการยกระดับโดยผู้ตรวจ */
export const PROMOTED_LABEL = {
  B: 'ผู้ตรวจรับรองแล้ว',
  A: 'ระเบียนทางการ ททท.',
};

export function Badge({ badge }) {
  const level = badge.level === 'warn' ? 'warn' : badge.level === 'good' ? 'good' : 'info';
  return (
    <span className={`badge ${level}`} title={badge.code}>
      {level === 'warn' ? '▲' : '●'} {badge.msg}
    </span>
  );
}

export function Meter({ value }) {
  return (
    <div className="meter">
      <i style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Loading({ text = 'กำลังโหลด…' }) {
  return <div className="loading">{text}</div>;
}

export function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

/** ช่องข้อมูล 1 เรื่องของ 1 แหล่ง — แสดงชั้นข้อมูลและกดดูประโยคต้นฉบับได้ */
export function FieldCell({ name, field }) {
  const [open, setOpen] = useState(false);
  const p = field.primary || { tier: 'C', value: null };
  const promo = field.promotion;
  const hasEvidence = Boolean(p.evidence) && (p.tier === 'B' || Boolean(promo));

  return (
    <div>
      <div className="row" style={{ gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
        <Tier tier={p.tier} label={promo ? PROMOTED_LABEL[promo.to] : undefined} />
        {promo && <span className="pill green" title={`${promo.from} → ${promo.to}`}>ยกระดับจากชั้น {promo.from}</span>}
        {field.conflict && <span className="pill orange">ขัดกัน — แสดงทั้งคู่</span>}
      </div>
      <div style={{ fontSize: 13.5, marginTop: 4 }}>
        {p.tier === 'C' ? (
          <span className="muted">ไม่พบในชุดข้อมูล — ระบบไม่เดาแทน</span>
        ) : (
          <>
            {String(p.value)}
            {p.field && <span className="muted tiny"> · จากฟิลด์ {p.field}</span>}
            {p.tier === 'D' && (
              <span className="muted tiny"> · ยืนยันโดย {p.confirmations} คน{p.confirmed ? '' : ' (รอยืนยันอีก 1 คน)'}</span>
            )}
          </>
        )}
      </div>

      {field.conflict && field.source && (
        <div className="tiny muted" style={{ marginTop: 4 }}>
          ข้อมูล ททท. ระบุ: {String(field.source.value)} — ผู้ใช้รายงาน: {String(field.community.value)} (ให้ผู้ใช้ตัดสินเอง)
        </div>
      )}

      {promo && (
        <div className="tiny muted" style={{ marginTop: 4 }}>
          ยกจากชั้น {promo.from} เป็นชั้น {promo.to} โดย <b>{promo.by}</b> เมื่อ {String(promo.at).slice(0, 10)}
          {promo.note ? ` — ${promo.note}` : ''}
        </div>
      )}

      {hasEvidence && (
        <>
          <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setOpen((v) => !v)}>
            {open ? 'ซ่อนประโยคต้นฉบับ' : 'ดูประโยคต้นฉบับ'}
          </button>
          {open && (
            <div className="evidence">
              “{p.evidence}”
              <div className="tiny" style={{ marginTop: 6, opacity: 0.8 }}>
                {promo
                  ? `หลักฐานที่ ${promo.by} ใช้ตรวจก่อนยกระดับ`
                  : `ยกมาจากฟิลด์ ${p.field} ของชุดข้อมูล ททท.`}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
