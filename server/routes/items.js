import { Router } from 'express'
import * as store from '../store.js'
import { deriveBaseName, addTagUnique, normalize } from '../lib/tags.js'

const router = Router()

// GET /api/items?q=&tag=&category=
router.get('/', (req, res) => {
  const { q, tag, category } = req.query
  let list = store.all('items')
  if (q) {
    const needle = normalize(q)
    list = list.filter(
      (i) =>
        normalize(i.name).includes(needle) ||
        normalize(i.baseName).includes(needle) ||
        i.tags.some((t) => normalize(t).includes(needle)),
    )
  }
  if (tag) list = list.filter((i) => i.tags.some((t) => normalize(t) === normalize(tag)))
  if (category && category !== 'All') list = list.filter((i) => i.category === category)
  res.json(list)
})

// Manual create — dedup-aware (reuses an existing item with the same name).
router.post('/', (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'name is required' })
  const { item, created } = store.upsertItem({
    name: b.name,
    spec: b.spec,
    uom: b.uom,
    category: b.category,
    brand: b.brand,
    model: b.model,
    partNo: b.partNo,
    description: b.description,
    extraTags: b.tags || [],
  })
  res.status(created ? 201 : 200).json({ item, created })
})

router.put('/:id', (req, res) => {
  const b = req.body || {}
  const patch = { ...b }
  delete patch.id
  if (b.name) patch.baseName = deriveBaseName(b.name)
  if (b.tags || b.name) {
    // Always ensure the base tag is present and tags are de-duplicated.
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
