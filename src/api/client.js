// Thin fetch wrapper. Requests hit /api which Vite proxies to the Express server.
const base = '/api'

// The current demo user's name is sent so the backend can attribute audit
// entries. AuthContext keeps this in sync on identity switch.
let actorName = 'System'
export const setActor = (name) => { actorName = name || 'System' }
const authHeaders = () => ({ 'x-user-name': actorName })

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
  get: (path, params) => fetch(base + path + qs(params), { headers: authHeaders() }).then(handle),
  post: (path, body) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body || {}) }).then(handle),
  put: (path, body) =>
    fetch(base + path, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body || {}) }).then(handle),
  del: (path) => fetch(base + path, { method: 'DELETE', headers: authHeaders() }).then(handle),
  upload: (path, file, params) => {
    const fd = new FormData()
    fd.append('file', file)
    return fetch(base + path + qs(params), { method: 'POST', headers: authHeaders(), body: fd }).then(handle)
  },
}

// Absolute URL for file-download endpoints (opened in a new tab / window).
export const fileUrl = (path, params) => base + path + qs(params)

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
  update: (id, b) => api.put(`/rfqs/${id}`, b),
  setStatus: (id, status) => api.post(`/rfqs/${id}/status`, { status }),
  assign: (id, b) => api.post(`/rfqs/${id}/assign`, b),
  unassign: (id, supplierId) => api.del(`/rfqs/${id}/assign/${supplierId}`),
  quote: (id, b) => api.post(`/rfqs/${id}/quote`, b),
  quoteUpload: (id, file, supplierId) => api.upload(`/rfqs/${id}/quote-upload`, file, { supplierId }),
  approve: (id, b) => api.post(`/rfqs/${id}/approve`, b),
  award: (id, b) => api.post(`/rfqs/${id}/award`, b),
  clarify: (id, b) => api.post(`/rfqs/${id}/clarifications`, b),
  exportPoUrl: (id) => fileUrl(`/export/po/${id}`),
  exportCostingUrl: (id, stock) => fileUrl(`/export/costing/${id}`, stock ? { stock: JSON.stringify(stock) } : {}),
}
export const Reports = () => api.get('/reports')
export const Audit = (params) => api.get('/audit', params)
export const Notifications = {
  list: () => api.get('/notifications'),
  read: (id) => api.post(`/notifications/${id}/read`),
  readAll: () => api.post('/notifications/read-all'),
}
export const Ingest = (file, params) => api.upload('/ingest', file, params)
export const Cluster = (items) => api.post('/ingest/cluster', { items })
export const Tags = () => api.get('/tags')
