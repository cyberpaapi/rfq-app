import { Router } from 'express'
import * as XLSX from 'xlsx'
import * as store from '../store.js'
import { deriveBaseName, addTagUnique, normalize } from '../lib/tags.js'
import { upload } from '../lib/upload.js'

const router = Router()

// Read a cell by any of several possible header names (case-insensitive).
const pick = (row, ...names) => {
  const keys = Object.keys(row)
  for (const n of names) {
    const k = keys.find((key) => normalize(key) === normalize(n))
    if (k != null && row[k] != null) return String(row[k]).trim()
  }
  return ''
}

// GET /api/items?q=&tag=&category=
router.get('/', (req, res) => {
  const { q, tag, category } = req.query
  let list = store.all('items')
  if (q) {
    const needle = normalize(q)
    list = list.filter(
      (i) =>
        normalize(i.name).includes(needle) ||
        normalize(i.sku || '').includes(needle) ||
        normalize(i.baseName).includes(needle) ||
        i.tags.some((t) => normalize(t).includes(needle)),
    )
  }
  if (tag) list = list.filter((i) => i.tags.some((t) => normalize(t) === normalize(tag)))
  if (category && category !== 'All') list = list.filter((i) => i.category === category)
  // Cap the payload so a huge catalogue can't freeze the UI; search/filter still
  // runs over the full set above, so anything is findable by narrowing.
  const LIMIT = 500
  if (list.length > LIMIT) list = list.slice(-LIMIT).reverse() // most-recent first
  res.json(list)
})

// Manual create — dedup-aware (reuses an existing item with the same name).
router.post('/', (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'name is required' })
  const { item, created } = store.upsertItem({
    name: b.name, sku: b.sku, spec: b.spec, uom: b.uom, category: b.category,
    brand: b.brand, model: b.model, partNo: b.partNo, description: b.description, extraTags: b.tags || [],
  })
  res.status(created ? 201 : 200).json({ item, created })
})

// POST /api/items/upload  (multipart: file)
// Headers expected: Item Name | SKU | Category Name | Usage unit
//  - Item Name is mandatory (rows without it are ignored)
//  - names are kept unique: a clash gets the SKU appended (then a counter)
//  - every item gets an auto UID; empty fields stay empty
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' })
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : []

    // Map headers → payloads, then insert in ONE efficient batch.
    const payloads = rows.map((row) => ({
      name: pick(row, 'Item Name', 'Item', 'Name'),
      sku: pick(row, 'SKU', 'Sku', 'Sku Code', 'Item Code'),
      category: pick(row, 'Category Name', 'Category') || 'General',
      uom: pick(row, 'Usage unit', 'Usage Unit', 'UOM', 'Unit') || 'PCS',
    }))
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
