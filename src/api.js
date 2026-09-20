const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json().catch(() => ({ ok: false, error: 'ตอบกลับไม่ใช่ JSON' }));
  if (!res.ok || json.ok === false) throw new Error(json.error || `คำขอล้มเหลว (${res.status})`);
  return json.data;
}

const qs = (params) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    u.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
};

export const api = {
  meta: () => request('/meta'),
  stats: () => request('/stats'),
  recommend: (params) => request('/recommend' + qs(params)),
  pods: (params) => request('/pods' + qs(params)),
  pod: (id) => request(`/pods/${id}`),
  planPreview: (podId, params) => request(`/plan/preview/${podId}` + qs(params)),
  createPlan: (body) => request('/plans', { method: 'POST', body: JSON.stringify(body) }),
  plans: () => request('/plans'),
  plan: (id) => request(`/plans/${id}`),
  updatePlan: (id, body) => request(`/plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePlan: (id) => request(`/plans/${id}`, { method: 'DELETE' }),
  questions: (podId, limit) => request(`/questions/${podId}` + qs({ limit })),
  sendFeedback: (body) => request('/feedback', { method: 'POST', body: JSON.stringify(body) }),
  feedback: () => request('/feedback'),
  gaps: (params) => request('/gaps' + qs(params)),

  /* ---- ยกระดับชั้นความน่าเชื่อถือ D→B→A ---- */
  promotionQueue: (params) => request('/promotions/queue' + qs(params)),
  promotions: (params) => request('/promotions' + qs(params)),
  promote: (body) => request('/promotions', { method: 'POST', body: JSON.stringify(body) }),
  revokePromotion: (id, body) => request(`/promotions/${id}/revoke`, { method: 'POST', body: JSON.stringify(body) }),
  promotionHistory: (siteId, field) => request(`/promotions/history/${siteId}/${field}`),

  /* ---- แผนที่ / เส้นทาง ---- */
  route: (podId, params) => request(`/route/${podId}` + qs(params)),
};
