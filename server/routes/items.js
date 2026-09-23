import { Router } from 'express'
import * as store from '../store.js'
import { deriveBaseName, addTagUnique, normalize } from '../lib/tags.js'
import { upload } from '../lib/upload.js'
import { readCatalogue } from '../lib/catalogue.js'
import { catalogueMatches } from '../../shared/catalogue.js'

const router = Router()

// GET /api/items?q=&tag=&category=
router.get('/', (req, res) => {
  const { q, tag, category, subcategory } = req.query
  let list = store.all('items')
  if (q) list = list.filter((i) => catalogueMatches(i, q))
  if (tag) list = list.filter((i) => i.tags.some((t) => normalize(t) === normalize(tag)))
  if (category && category !== 'All') list = list.filter((i) => category === '__blank__' ? !i.category : i.category === category)
  if (subcategory) list = list.filter((i) => i.subcategory === subcategory)
  if (req.query.paged === 'true') {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100))
    const offset = Math.max(0, parseInt(req.query.offset) || 0)
    return res.json({ items: list.slice(offset, offset + limit), total: list.length, offset, limit })
  }
  // Cap the payload so a huge catalogue can't freeze the UI; search/filter still
  // runs over the full set above, so anything is findable by narrowing.
  const LIMIT = 500
  if (list.length > LIMIT) list = list.slice(-LIMIT).reverse() // most-recent first
  res.json(list)
})

router.get('/meta', (_req, res) => {
  const items = store.all('items')
  const distinct = (key) => [...new Set(items.map((i) => i[key] || '').filter(Boolean))].sort((a, b) => a.localeCompare(b))
  res.json({ total: items.length, categories: distinct('category'), subcategories: distinct('subcategory'), units: distinct('uom'), hasBlankCategory: items.some((i) => !i.category) })
})

// Manual create — dedup-aware (reuses an existing item with the same name).
router.post('/', (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'name is required' })
  const { item, created } = store.upsertItem({
    name: b.name, sku: b.sku, spec: b.spec, uom: b.uom, category: b.category,
    brand: b.brand, model: b.model, partNo: b.partNo, description: b.description, extraTags: b.tags || [],
    aiName: b.aiName, subcategory: b.subcategory, unitName: b.unitName,
  })
  res.status(created ? 201 : 200).json({ item, created })
})

// POST /api/items/upload  (multipart: file)
// Supports all nine Fully_edited headers, with legacy aliases for older files.
//  - Item Name is mandatory (rows without it are ignored)
//  - names are kept unique: a clash gets the SKU appended (then a counter)
//  - every item gets an auto UID; all source fields are retained
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' })
    const { items: payloads } = readCatalogue(req.file.buffer)
    const result = store.bulkAddItems(payloads) // { added, skipped, total }
    res.json(result)
  } catch (e) {
    console.error('[items/upload] error:', e)
    res.status(500).json({ error: e.message })
  }
})

router.put('/:id', (req, res) => {
  const b = req.body || {}
  const patch = { ...b }
  delete patch.id
  if (b.name) patch.baseName = deriveBaseName(b.name)
  if (b.tags || b.name) {
    let tags = []
    const base = patch.baseName || deriveBaseName(b.name || store.find('items', req.params.id)?.name || '')
    if (base) tags = addTagUnique(tags, base)
    for (const t of b.tags || store.find('items', req.params.id)?.tags || []) tags = addTagUnique(tags, t)
    patch.tags = tags
    store.registerTags(tags)
  }
  const updated = store.update('items', req.params.id, patch)
  if (!updated) return res.status(404).json({ error: 'not found' })
  res.json(updated)
})

router.delete('/:id', (req, res) => {
  const ok = store.remove('items', req.params.id)
  if (!ok) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

export default router
