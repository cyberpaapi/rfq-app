// Thin fetch wrapper. Requests hit /api which Vite proxies to the Express server.
import { put as putBlob } from '@vercel/blob/client'
import { MAX_UPLOAD_BYTES, validateUpload } from '../../shared/uploads'
const base = '/api'

// The current demo user's name is sent so the backend can attribute audit
// entries. AuthContext keeps this in sync on identity switch.
let actorName = 'System'
export const setActor = (name) => { actorName = name || 'System' }
const authHeaders = () => ({ 'x-user-name': actorName })
const validateFileSize = (file) => {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('This app accepts files up to 50 MB.')
}

async function handle(res) {
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json()).error || msg } catch { /* ignore */ }
    const requestId = res.headers.get('x-request-id')
    throw new Error(requestId ? `${msg} (request ${requestId})` : msg)
  }
  return res.status === 204 ? null : res.json()
}

const qs = (params = {}) => {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, v) })
  const s = p.toString()
  return s ? `?${s}` : ''
}

let uploadConfig
async function sendFile(path, file, params, fields = {}) {
  validateFileSize(file)
  validateUpload({ name: file.name, size: file.size, target: path })
  uploadConfig ||= fetch(base + '/uploads/config', { headers: authHeaders() }).then(handle).catch((error) => { uploadConfig = null; throw error })
  const config = await uploadConfig
  if (config.direct) {
    const grant = await fetch(base + '/uploads/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ name: file.name, size: file.size, target: path }) }).then(handle)
    await putBlob(grant.pathname, file, { access: 'private', token: grant.clientToken, contentType: grant.contentType, multipart: true })
    return fetch(base + path + qs(params), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ ...fields, uploadReceipt: grant.receipt }) }).then(handle)
  }
  const fd = new FormData(); fd.append('file', file)
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v ?? ''))
  return fetch(base + path + qs(params), { method: 'POST', headers: authHeaders(), body: fd }).then(handle)
}

export const api = {
  get: (path, params) => fetch(base + path + qs(params), { headers: authHeaders() }).then(handle),
  post: (path, body) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body || {}) }).then(handle),
  put: (path, body) =>
    fetch(base + path, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body || {}) }).then(handle),
  del: (path) => fetch(base + path, { method: 'DELETE', headers: authHeaders() }).then(handle),
  upload: (path, file, params) => sendFile(path, file, params),
  // Multipart upload with extra text fields (e.g. a typed name).
  uploadForm: (path, file, fields = {}) => sendFile(path, file, undefined, fields),
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
  upload: (file) => api.upload('/suppliers/upload', file),
}

// Weighted supplier score (0-100) from performance scores + weights.
export const weightedScore = (s, w = { price: 30, quality: 40, delivery: 30 }) => {
  const sc = { price: 0, quality: 0, delivery: 0, ...s.scores }
  const total = (w.price + w.quality + w.delivery) || 1
  return (sc.price * w.price + sc.quality * w.quality + sc.delivery * w.delivery) / total
}
export const Items = {
  list: (params) => api.get('/items', params),
  create: (b) => api.post('/items', b),
  update: (id, b) => api.put(`/items/${id}`, b),
  remove: (id) => api.del(`/items/${id}`),
  upload: (file) => api.upload('/items/upload', file),
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
  delivery: (id, b) => api.post(`/rfqs/${id}/delivery`, b),
  clarify: (id, b) => api.post(`/rfqs/${id}/clarifications`, b),
  exportPoUrl: (id) => fileUrl(`/export/po/${id}`),
  exportCostingUrl: (id, stock) => fileUrl(`/export/costing/${id}`, stock ? { stock: JSON.stringify(stock) } : {}),
  exportRfqItemsUrl: (id) => fileUrl(`/export/rfq-items/${id}`),
  exportComparisonUrl: (id) => fileUrl(`/export/comparison/${id}`),
  respond: (id, file, name) => api.uploadForm(`/rfqs/${id}/respond`, file, { name }),
  editQuote: (id, supplierId, b) => api.put(`/rfqs/${id}/quotes/${supplierId}`, b),
  quoteFileUrl: (id, supplierId) => fileUrl(`/rfqs/${id}/quote-file/${supplierId}`),
  scoreQuality: (id) => api.post(`/rfqs/${id}/score-quality`),
  recommend: (id, weights) => api.post(`/rfqs/${id}/recommend`, { weights }),
  forwardEvaluation: (id) => api.post(`/rfqs/${id}/forward-evaluation`),
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
