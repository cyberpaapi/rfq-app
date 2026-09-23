import { Router } from 'express'
import * as store from '../store.js'
import { validateRole } from '../../shared/roles.js'

const router = Router()
const auditValue = (role) => JSON.stringify({ label: role.label, enabled: role.enabled, readOnly: role.readOnly, permissions: role.permissions })
const publicRole = ({ id, label, desc, enabled, readOnly, permissions, color, version, builtIn }) =>
  ({ id, label, desc, enabled, readOnly, permissions, color, version, builtIn })
const needsSupplier = (role) => role.permissions.some((permission) => permission === 'portal.access' || permission === 'quote.submit')

router.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(store.getRoles().map(publicRole))
})

router.post('/', (req, res) => {
  if (req.accessRole?.id !== 'admin') return res.status(403).json({ error: 'Only Administrator can create roles.' })
  try {
    const validated = validateRole(req.body || {}, store.getRoles())
    const role = { ...validated, id: store.newId('role'), builtIn: false, version: 1 }
    store.insert('roles', role)
    store.logAudit({ user: 'Administrator', action: 'Created role', field: role.id, value: auditValue(role) })
    res.status(201).json(publicRole(role))
  } catch (error) { res.status(400).json({ error: error.message }) }
})

router.put('/:id', (req, res) => {
  if (req.accessRole?.id !== 'admin') return res.status(403).json({ error: 'Only Administrator can edit roles.' })
  const role = store.getRoles().find((item) => item.id === req.params.id)
  if (!role) return res.status(404).json({ error: 'Role not found.' })
  if (role.id === 'admin') return res.status(403).json({ error: 'Administrator is protected and always has full access.' })
  if (req.body.version !== role.version) return res.status(409).json({ error: 'This role changed elsewhere. Reload before saving.' })
  try {
    const patch = validateRole(req.body || {}, store.getRoles(), role)
    if (needsSupplier(patch) && store.getUsers().some((user) => user.roleId === role.id && !user.supplierId)) {
      throw new Error('Assign a supplier profile to every user in this role before enabling supplier portal permissions.')
    }
    const old = auditValue(role)
    const result = store.update('roles', role.id, { ...patch, version: role.version + 1 })
    store.logAudit({ user: 'Administrator', action: 'Updated role permissions and restrictions', field: role.id, old, value: auditValue(result) })
    res.json(publicRole(result))
  } catch (error) { res.status(400).json({ error: error.message }) }
})

router.delete('/:id', (req, res) => {
  if (req.params.id === 'admin') return res.status(403).json({ error: 'Administrator is protected.' })
  const role = store.getRoles().find((item) => item.id === req.params.id)
  if (!role) return res.status(404).json({ error: 'Role not found.' })
  if (store.getUsers().some((user) => user.roleId === role.id)) return res.status(409).json({ error: 'Move or delete users assigned to this role first.' })
  store.remove('roles', role.id)
  store.logAudit({ user: 'Administrator', action: 'Deleted role', field: role.id, old: auditValue(role) })
  res.status(204).end()
})

export default router
