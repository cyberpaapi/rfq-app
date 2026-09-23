import { Router } from 'express'
import * as store from '../store.js'
import { validateUser } from '../../shared/roles.js'
import { hashPassword } from '../lib/auth.js'
import { encryptAccountPassword, decryptAccountPassword } from '../lib/account-passwords.js'

const router = Router()
const publicUser = ({ id, username, roleId, enabled, readOnly, supplierId, version, passwordCiphertext }) =>
  ({ id, username, roleId, enabled, readOnly, supplierId, version, passwordAvailable: !!passwordCiphertext })
const auditValue = (user) => JSON.stringify({ username: user.username, roleId: user.roleId, enabled: user.enabled, readOnly: user.readOnly, supplierId: user.supplierId })
const checkSupplier = (user) => {
  if (user.supplierId && !store.find('suppliers', user.supplierId)) throw new Error('Select a valid supplier profile.')
}

router.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(store.getUsers().map(publicUser))
})

router.post('/', async (req, res) => {
  if (req.accessRole?.id !== 'admin') return res.status(403).json({ error: 'Only Administrator can create users.' })
  try {
    const validated = validateUser(req.body || {}, store.getUsers(), store.getRoles())
    checkSupplier(validated)
    const id = store.newId('user')
    const passwordHash = await hashPassword(req.body?.password)
    const passwordCiphertext = encryptAccountPassword(req.body.password, id)
    const user = { ...validated, id, passwordHash, passwordCiphertext, version: 1 }
    store.insert('users', user)
    store.logAudit({ user: 'Administrator', action: 'Created user', field: id, value: auditValue(user) })
    res.status(201).json(publicUser(user))
  } catch (error) { res.status(400).json({ error: error.message }) }
})

router.get('/:id/password', (req, res) => {
  if (req.accessRole?.id !== 'admin') return res.status(403).json({ error: 'Only Administrator can view user passwords.' })
  res.setHeader('Cache-Control', 'no-store')
  const user = store.getUsers().find((item) => item.id === req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found.' })
  if (user.id === 'admin') return res.status(403).json({ error: 'The Administrator password cannot be viewed here.' })
  if (!user.passwordCiphertext) return res.status(409).json({ error: 'This user predates password viewing. Set a new password first.' })
  try {
    const password = decryptAccountPassword(user.passwordCiphertext, user.id)
    store.logAudit({ user: 'Administrator', action: 'Viewed user password', field: user.id })
    res.json({ username: user.username, password })
  } catch (error) { res.status(503).json({ error: error.message }) }
})

router.put('/:id', async (req, res) => {
  if (req.accessRole?.id !== 'admin') return res.status(403).json({ error: 'Only Administrator can edit users.' })
  const user = store.getUsers().find((item) => item.id === req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found.' })
  if (user.id === 'admin') return res.status(403).json({ error: 'Administrator is protected.' })
  if (req.body.version !== user.version) return res.status(409).json({ error: 'This user changed elsewhere. Reload before saving.' })
  try {
    const patch = validateUser(req.body || {}, store.getUsers(), store.getRoles(), user)
    checkSupplier(patch)
    if (req.body?.password) {
      patch.passwordHash = await hashPassword(req.body.password)
      patch.passwordCiphertext = encryptAccountPassword(req.body.password, user.id)
    }
    const old = auditValue(user)
    const result = store.update('users', user.id, { ...patch, version: user.version + 1 })
    store.logAudit({ user: 'Administrator', action: 'Updated user', field: user.id, old, value: auditValue(result) })
    res.json(publicUser(result))
  } catch (error) { res.status(400).json({ error: error.message }) }
})

router.delete('/:id', (req, res) => {
  if (req.params.id === 'admin') return res.status(403).json({ error: 'Administrator is protected.' })
  const user = store.getUsers().find((item) => item.id === req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found.' })
  store.remove('users', user.id)
  store.logAudit({ user: 'Administrator', action: 'Deleted user', field: user.id, old: auditValue(user) })
  res.status(204).end()
})

export default router
