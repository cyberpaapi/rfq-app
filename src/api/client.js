// Thin fetch wrapper. Requests hit /api which Vite proxies to the Express server.
const base = '/api'

async function handle(res) {
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json()).error || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

const qs = (params = {}) => {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, v) })
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  get: (path, params) => fetch(base + path + qs(params)).then(handle),
  post: (path, body) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(handle),
  put: (path, body) =>
    fetch(base + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(handle),
  del: (path) => fetch(base + path, { method: 'DELETE' }).then(handle),
  upload: (path, file, params) => {
    const fd = new FormData()
    fd.append('file', file)
    return fetch(base + path + qs(params), { method: 'POST', body: fd }).then(handle)
  },
}

// Small hook-free helpers
export const Suppliers = {
  list: (params) => api.get('/suppliers', params),
  create: (b) => api.post('/suppliers', b),
  update: (id, b) => api.put(`/suppliers/${id}`, b),
  remove: (id) => api.del(`/suppliers/${id}`),
  rate: (id, b) => api.post(`/suppliers/${id}/rate`, b),
}

// Weighted supplier score (0-100) from performance scores + weights.
export const weightedScore = (s, w = { price: 30, quality: 40, delivery: 30 }) => {
  const sc = s.scores || { price: 0, quality: 0, delivery: 0 }
  const total = (w.price + w.quality + w.delivery) || 1
  return (sc.price * w.price + sc.quality * w.quality + sc.delivery * w.delivery) / total
}
export const Items = {
  list: (params) => api.get('/items', params),
  create: (b) => api.post('/items', b),
  update: (id, b) => api.put(`/items/${id}`, b),
  remove: (id) => api.del(`/items/${id}`),
}
export const Rfqs = {
  list: () => api.get('/rfqs'),
  get: (id) => api.get(`/rfqs/${id}`),
  create: (b) => api.post('/rfqs', b),
  assign: (id, b) => api.post(`/rfqs/${id}/assign`, b),
  unassign: (id, supplierId) => api.del(`/rfqs/${id}/assign/${supplierId}`),
  quote: (id, b) => api.post(`/rfqs/${id}/quote`, b),
}
export const Ingest = (file, params) => api.upload('/ingest', file, params)
export const Tags = () => api.get('/tags')
