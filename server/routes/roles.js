import { Router } from 'express'
import * as store from '../store.js'
import { validateRole } from '../../shared/roles.js'
import { hashPassword, publicAccount } from '../lib/auth.js'
import { encryptAccountPassword, decryptAccountPassword } from '../lib/account-passwords.js'
const router = Router()
const auditValue = (role) => JSON.stringify({ label: role.label, username: role.username, enabled: role.enabled, readOnly: role.readOnly, permissions: role.permissions })
const checkSupplier = (role) => {
  if (role.supplierId && !store.find('suppliers', role.supplierId)) throw new Error('Select a valid supplier profile.')
}
router.get('/', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(store.getRoles().map(publicAccount)) })
router.post('/', async (req, res) => {
  if (req.accessRole?.id !== 'admin') return res.status(403).json({ error: 'Only Administrator can create roles.' })
  try {
    const validated = validateRole(req.body || {}, store.getRoles())
    checkSupplier(validated)
    const id = store.newId('role')
    const passwordHash = await hashPassword(req.body?.password)
    const passwordCiphertext = encryptAccountPassword(req.body.password, id)
    const role = { ...validated, passwordHash, passwordCiphertext, id, builtIn: false, version: 1 }
    store.insert('roles', role)
    store.logAudit({ user: 'Administrator', action: 'Created role', field: role.id, value: auditValue(role) })
    res.status(201).json(publicAccount(role))
  } catch (e) { res.status(400).json({ error: e.message }) }
})
router.get('/:id/password', (req, res) => {
  if (req.accessRole?.id !== 'admin') return res.status(403).json({ error: 'Only Administrator can view account passwords.' })
  res.setHeader('Cache-Control', 'no-store')
  const role = store.getRoles().find((account) => account.id === req.params.id)
  if (!role) return res.status(404).json({ error: 'Account not found.' })
  if (role.id === 'admin') return res.status(403).json({ error: 'The Administrator password cannot be viewed here.' })
  if (!role.passwordCiphertext) return res.status(409).json({ error: 'This account predates password viewing. Set a new password in Edit account first.' })
  try {
    const password = decryptAccountPassword(role.passwordCiphertext, role.id)
    store.logAudit({ user: 'Administrator', action: 'Viewed account password', field: role.id })
    res.json({ username: role.username, password })
  } catch (error) { res.status(503).json({ error: error.message }) }
})
router.put('/:id', async (req, res) => {
  if (req.accessRole?.id !== 'admin') return res.status(403).json({ error: 'Only Administrator can edit roles.' })
  const role = store.getRoles().find((r) => r.id === req.params.id)
  if (!role) return res.status(404).json({ error: 'Role not found.' })
  if (role.id === 'admin') return res.status(403).json({ error: 'Administrator is protected and always has full access.' })
  if (req.body.version !== role.version) return res.status(409).json({ error: 'This role changed elsewhere. Reload before saving.' })
  try {
    const patch = validateRole(req.body || {}, store.getRoles(), role)
    checkSupplier(patch)
    if (req.body?.password) {
      patch.passwordCiphertext = encryptAccountPassword(req.body.password, role.id)
      patch.passwordHash = await hashPassword(req.body.password)
    }
    const old = auditValue(role)
    const result = store.update('roles', role.id, { ...patch, version: role.version + 1 })
    store.logAudit({ user: 'Administrator', action: 'Updated role permissions and restrictions', field: role.id, old, value: auditValue(result) })
    res.json(publicAccount(result))
  } catch (e) { res.status(400).json({ error: e.message }) }
})
router.delete('/:id', (req, res) => {
  if (req.params.id === 'admin') return res.status(403).json({ error: 'Administrator is protected.' })
  const role = store.getRoles().find((r) => r.id === req.params.id)
  if (!role) return res.status(404).json({ error: 'Account not found.' })
  store.remove('roles', role.id)
  store.logAudit({ user: 'Administrator', action: 'Deleted account', field: role.id, old: auditValue(role) })
  res.status(204).end()
})
export default router
