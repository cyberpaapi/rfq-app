import { Router } from 'express'
import * as XLSX from 'xlsx'
import * as store from '../store.js'
import { newId } from '../store.js'
import { addTagUnique, normalize } from '../lib/tags.js'
import { upload } from '../lib/upload.js'
import { roleCan } from '../../shared/roles.js'

const router = Router()

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
  if (!roleCan(req.accessRole, 'workspace.view')) return res.json(list.filter((s) => s.portalProfile).map(({ id, name, category, portalProfile }) => ({ id, name, category, portalProfile })))
  res.json(list)
})

router.post('/', (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'name is required' })
  const supplier = makeSupplier(b)
  store.insert('suppliers', supplier)
  store.registerTags(supplier.tags)
  res.status(201).json(supplier)
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
  const ok = store.remove('suppliers', req.params.id)
  if (!ok) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

export default router
