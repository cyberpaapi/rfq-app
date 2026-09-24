import * as store from '../store.js'
import { roleCan } from '../../shared/roles.js'
import { accountForRequest } from './auth.js'

export function requiredPermissions(method, path, body = {}) {
  if (typeof path !== 'string') return ['users.manage']
  // Express accepts case variants and trailing slashes for the same endpoint.
  path = path.toLowerCase().replace(/\/+$/, '') || '/'
  if (path === '/roles') return ['users.manage']
  if (path.startsWith('/roles/')) return ['users.manage']
  if (path === '/users' || path.startsWith('/users/')) return ['users.manage']
  if (path === '/logs/events' || path === '/uploads/config') return []
  if (path === '/uploads/prepare') return requiredPermissions('POST', body.target || '/invalid', {})
  if (path.startsWith('/logs') || path.startsWith('/audit')) return ['audit.view']
  if (path.startsWith('/reports')) return ['reports.view']
  if (path.startsWith('/export/')) return ['data.export', 'workspace.view']
  if (path === '/reset') return ['users.manage']
  if (path.startsWith('/notifications')) return ['workspace.view']
  if (path.startsWith('/ingest')) return ['rfq.create', 'ai.use']
  if (path.startsWith('/items') || path === '/tags') return method === 'GET' ? ['workspace.view'] : ['rfq.create']
  if (path.startsWith('/suppliers')) {
    if (method === 'GET') return ['workspace.view|portal.access']
    if (path.endsWith('/credentials')) return ['supplier.create']
    if (path === '/suppliers' && method === 'POST') return ['supplier.create|supplier.manage']
    if (path === '/suppliers/upload') return ['supplier.create|supplier.manage']
    return ['supplier.manage']
  }
  if (path.startsWith('/rfqs')) {
    if (method === 'GET') return path.includes('/quote-file/') ? ['data.export', 'workspace.view'] : ['workspace.view|portal.access']
    if (path.endsWith('/quote-upload')) return ['quote.submit|supplier.response.edit', 'ai.use']
    if (path.endsWith('/respond')) return ['quote.submit', 'ai.use']
    if (path.endsWith('/quote')) return ['quote.submit|supplier.response.edit']
    if (path.endsWith('/clarifications')) return ['quote.submit|rfq.create']
    if (path.endsWith('/approve')) return [`approve.${body.role}`]
    if (path.endsWith('/award')) return ['award.decide']
    if (path.endsWith('/status')) return ['rfq.publish']
    if (/\/(recommend|score-quality)$/.test(path)) return ['rfq.evaluate', 'ai.use']
    if (path.includes('/quotes/')) return ['rfq.evaluate|supplier.response.edit']
    if (path.endsWith('/forward-evaluation')) return ['rfq.evaluate']
    return ['rfq.create']
  }
  return ['users.manage']
}
export function checkAccess(role, method, path, body) {
  if (!role?.enabled) return false
  if (role.readOnly && method !== 'GET' && path !== '/logs/events') return false
  return requiredPermissions(method, path, body).every((group) => group.split('|').some((p) => roleCan(role, p)))
}
export function accessControl(req, res, next) {
  const path = req.path
  const active = accountForRequest(req)
  if (!active) return res.status(401).json({ error: 'Please sign in.' })
  const role = active.account
  if (!checkAccess(role, req.method, path, req.body)) return res.status(403).json({ error: 'Your account does not allow this action.' })
  req.accessRole = role
  req.headers['x-user-name'] = role.username
  req.supplierId = role.supplierId || ''
  const targetPath = path === '/uploads/prepare' ? req.body?.target : path
  if (!roleCan(role, 'workspace.view') && typeof targetPath === 'string' && /^\/rfqs\//i.test(targetPath)) {
    const id = targetPath.split('/')[2]
    const rfq = store.find('rfqs', id)
    if (!rfq?.assignments?.some((a) => a.supplierId === req.supplierId)) return res.status(403).json({ error: 'This RFQ is not assigned to your supplier.' })
    if (req.method !== 'GET') {
      if (/\/respond\/?$/i.test(targetPath)) return res.status(403).json({ error: 'Use your assigned supplier portal to submit this quote.' })
      if (path === '/uploads/prepare') return next()
      const supplied = req.query.supplierId || req.body?.supplierId
      if (supplied !== req.supplierId) return res.status(403).json({ error: 'The supplier does not match your account.' })
    }
  }
  next()
}
