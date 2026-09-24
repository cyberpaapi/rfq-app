import { Router } from 'express'
import * as XLSX from 'xlsx'
import * as store from '../store.js'
import { newId } from '../store.js'
import { addTagUnique, normalize } from '../lib/tags.js'
import { upload } from '../lib/upload.js'
import { roleCan } from '../../shared/roles.js'
import { randomBytes } from 'node:crypto'
import { hashPassword } from '../lib/auth.js'
import { encryptAccountPassword } from '../lib/account-passwords.js'

const router = Router()
const SUPPLIER_ROLE_ID = 'supplier-portal'

const pick = (row, ...names) => {
  const keys = Object.keys(row)
  for (const n of names) {
    const k = keys.find((key) => normalize(key) === normalize(n))
    if (k != null && row[k] != null) return String(row[k]).trim()
  }
  return ''
}

// Build a supplier record from a loose body (used by create + bulk upload).
const makeSupplier = (b) => {
  let tags = []
  for (const t of b.tags || []) tags = addTagUnique(tags, t)
  return {
    id: newId('SUP'),
    name: b.name,
    category: b.category || 'General',
    email: b.email || '',
    phone: b.phone || '',
    location: b.location || '',
    qualified: b.qualified ?? true,
    rating: b.rating ?? 0,
    scores: b.scores || { price: 70, quality: 70, delivery: 70 },
    ratings: [],
    previouslyInvited: false,
    notes: b.notes || '',
    tags,
    createdAt: Date.now(),
  }
}

// GET /api/suppliers?q=&tag=&category=
router.get('/', (req, res) => {
  const { q, tag, category } = req.query
  let list = store.all('suppliers')
  if (q) {
    const needle = normalize(q)
    list = list.filter(
      (s) => normalize(s.name).includes(needle) || s.tags.some((t) => normalize(t).includes(needle)),
    )
  }
  if (tag) list = list.filter((s) => s.tags.some((t) => normalize(t) === normalize(tag)))
  if (category && category !== 'All') list = list.filter((s) => s.category === category)
  if (!roleCan(req.accessRole, 'workspace.view')) return res.json(list.filter((s) => s.id === req.supplierId).map(({ id, name, category }) => ({ id, name, category })))
  const canSeeLogins = roleCan(req.accessRole, 'supplier.create') || roleCan(req.accessRole, 'supplier.manage')
  res.json(canSeeLogins ? list.map((s) => ({ ...s, loginUsername: store.getUsers().find((u) => u.supplierId === s.id && u.roleId === SUPPLIER_ROLE_ID)?.username || '' })) : list)
})

router.post('/', (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'name is required' })
  const supplier = makeSupplier(b)
  store.insert('suppliers', supplier)
  store.registerTags(supplier.tags)
  res.status(201).json(supplier)
})

// A supplier login has only portal permissions. It is linked to its supplier
// record, so a creator cannot grant it access to the internal workspace.
router.get('/:id/credentials', (req, res) => {
  if (!roleCan(req.accessRole, 'supplier.create') && !roleCan(req.accessRole, 'supplier.manage')) return res.status(403).json({ error: 'Not allowed to manage supplier logins.' })
  if (!store.find('suppliers', req.params.id)) return res.status(404).json({ error: 'Supplier not found.' })
  const user = store.getUsers().find((u) => u.supplierId === req.params.id && u.roleId === SUPPLIER_ROLE_ID)
  res.setHeader('Cache-Control', 'no-store')
  res.json(user ? { username: user.username, enabled: user.enabled } : null)
})

router.post('/:id/credentials', async (req, res) => {
  const supplier = store.find('suppliers', req.params.id)
  if (!supplier) return res.status(404).json({ error: 'Supplier not found.' })
  try {
    if (!store.getRoles().some((r) => r.id === SUPPLIER_ROLE_ID)) {
      store.insert('roles', { id: SUPPLIER_ROLE_ID, label: 'Supplier Portal', desc: 'Supplier access to assigned RFQs and quotation submission.', enabled: true, readOnly: false, builtIn: true, version: 1, color: 'ink', permissions: ['portal.access', 'quote.submit'] })
    }
    const portalRole = store.getRoles().find((r) => r.id === SUPPLIER_ROLE_ID)
    if (!portalRole.enabled || portalRole.readOnly || portalRole.permissions.length !== 2 || !['portal.access', 'quote.submit'].every((p) => portalRole.permissions.includes(p))) throw new Error('Supplier portal role is misconfigured.')
    const existing = store.getUsers().find((u) => u.supplierId === supplier.id && u.roleId === SUPPLIER_ROLE_ID)
    const base = `supplier.${supplier.id.toLowerCase()}`
    let username = existing?.username || base
    if (!existing) for (let n = 2; store.getUsers().some((u) => u.username === username); n++) username = `${base}.${n}`
    const password = randomBytes(24).toString('base64url')
    const id = existing?.id || store.newId('user')
    const passwordHash = await hashPassword(password)
    const passwordCiphertext = encryptAccountPassword(password, id)
    const user = existing
      ? store.update('users', id, { passwordHash, passwordCiphertext, enabled: true, readOnly: false, version: existing.version + 1 })
      : store.insert('users', { id, username, passwordHash, passwordCiphertext, roleId: SUPPLIER_ROLE_ID, supplierId: supplier.id, enabled: true, readOnly: false, version: 1 })
    store.logAudit({ user: req.accessRole.username, action: existing ? 'Reset supplier login' : 'Created supplier login', field: supplier.id, value: username })
    res.setHeader('Cache-Control', 'no-store')
    res.status(existing ? 200 : 201).json({ username: user.username, password, supplierId: supplier.id })
  } catch (error) { res.status(400).json({ error: error.message }) }
})

// POST /api/suppliers/upload  (multipart: file)
// Headers: Name | Category | Email | Phone | Location | Other Notes
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' })
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : []
    let added = 0, skipped = 0
    const suppliers = []
    for (const row of rows) {
      const name = pick(row, 'Name', 'Supplier Name', 'Supplier')
      if (!name) { skipped++; continue }
      const s = makeSupplier({
        name,
        category: pick(row, 'Category', 'Category Name') || 'General',
        email: pick(row, 'Email', 'Email Address'),
        phone: pick(row, 'Phone', 'Phone Number', 'Mobile'),
        location: pick(row, 'Location', 'City', 'Address'),
        notes: pick(row, 'Other Notes', 'Other Note', 'Notes', 'Note'),
      })
      store.insert('suppliers', s)
      suppliers.push(s)
      added++
    }
    res.json({ added, skipped, total: rows.length, suppliers })
  } catch (e) {
    console.error('[suppliers/upload] error:', e)
    res.status(500).json({ error: e.message })
  }
})

// Rate a supplier when an order completes (1-5 stars + optional note).
// Recomputes the average rating and nudges the performance scores.
router.post('/:id/rate', (req, res) => {
  const s = store.find('suppliers', req.params.id)
  if (!s) return res.status(404).json({ error: 'not found' })
  const { stars, note = '', rfqId = null } = req.body || {}
  const n = Math.max(1, Math.min(5, Number(stars) || 0))
  const ratings = [...(s.ratings || []), { stars: n, note, rfqId, at: Date.now() }]
  const avg = ratings.reduce((a, r) => a + r.stars, 0) / ratings.length
  // Blend the new rating (as a 0-100 signal) gently into quality & delivery scores.
  const signal = n * 20
  const blend = (cur) => Math.round((Number(cur) || 70) * 0.8 + signal * 0.2)
  const scores = { ...(s.scores || {}), quality: blend(s.scores?.quality), delivery: blend(s.scores?.delivery) }
  const updated = store.update('suppliers', s.id, { ratings, rating: Math.round(avg * 10) / 10, scores })
  res.json(updated)
})

router.put('/:id', (req, res) => {
  const b = req.body || {}
  const patch = { ...b }
  if (b.tags) {
    let tags = []
    for (const t of b.tags) tags = addTagUnique(tags, t)
    patch.tags = tags
    store.registerTags(tags)
  }
  delete patch.id
  const updated = store.update('suppliers', req.params.id, patch)
  if (!updated) return res.status(404).json({ error: 'not found' })
  res.json(updated)
})

router.delete('/:id', (req, res) => {
  if (store.getUsers().some((u) => u.supplierId === req.params.id)) return res.status(409).json({ error: 'Remove linked supplier logins and users before deleting this supplier.' })
  const ok = store.remove('suppliers', req.params.id)
  if (!ok) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

export default router
