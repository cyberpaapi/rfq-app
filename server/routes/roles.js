import { Router } from 'express'
import * as store from '../store.js'
import { validateRole } from '../../shared/roles.js'
const router = Router()
const auditValue = (role) => JSON.stringify({ label: role.label, enabled: role.enabled, readOnly: role.readOnly, permissions: role.permissions })
router.get('/', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(store.getRoles()) })
router.post('/', (req, res) => {
  if (req.accessRole?.id !== 'admin') return res.status(403).json({ error: 'Only Administrator can create roles.' })
  try {
    const role = { ...validateRole(req.body || {}, store.getRoles()), id: store.newId('role'), builtIn: false, version: 1 }
    store.insert('roles', role)
    store.logAudit({ user: 'Administrator', action: 'Created role', field: role.id, value: auditValue(role) })
    res.status(201).json(role)
  } catch (e) { res.status(400).json({ error: e.message }) }
})
router.put('/:id', (req, res) => {
  if (req.accessRole?.id !== 'admin') return res.status(403).json({ error: 'Only Administrator can edit roles.' })
  const role = store.getRoles().find((r) => r.id === req.params.id)
  if (!role) return res.status(404).json({ error: 'Role not found.' })
  if (role.id === 'admin') return res.status(403).json({ error: 'Administrator is protected and always has full access.' })
  if (req.body.version !== role.version) return res.status(409).json({ error: 'This role changed elsewhere. Reload before saving.' })
  try {
    const patch = validateRole(req.body || {}, store.getRoles(), role)
    const old = auditValue(role)
    const result = store.update('roles', role.id, { ...patch, version: role.version + 1 })
    store.logAudit({ user: 'Administrator', action: 'Updated role permissions and restrictions', field: role.id, old, value: auditValue(result) })
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})
export default router
