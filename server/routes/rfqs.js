import { Router } from 'express'
import * as store from '../store.js'
import { newId } from '../store.js'
import { deriveBaseName, addTagUnique } from '../lib/tags.js'

const router = Router()

const withLineIds = (lines = []) =>
  lines.map((l) => ({
    lineId: l.lineId || newId('LN'),
    itemId: l.itemId || null,
    name: l.name,
    spec: l.spec || '',
    description: l.description || '',
    qty: l.qty ?? 1,
    uom: l.uom || 'PCS',
  }))

router.get('/', (_req, res) => res.json(store.all('rfqs')))

router.get('/:id', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'not found' })
  const quotes = store.all('quotes').filter((q) => q.rfqId === rfq.id)
  res.json({ ...rfq, quotes })
})

router.post('/', (req, res) => {
  const b = req.body || {}
  const rfq = {
    id: newId('RFQ'),
    title: b.title || 'Untitled RFQ',
    description: b.description || '',
    status: b.status || 'Draft',
    currency: b.currency || 'USD',
    lines: withLineIds(b.lines),
    assignments: [],
    createdAt: Date.now(),
  }
  store.insert('rfqs', rfq)
  res.status(201).json(rfq)
})

router.put('/:id', (req, res) => {
  const b = { ...req.body }
  if (b.lines) b.lines = withLineIds(b.lines)
  delete b.id
  const updated = store.update('rfqs', req.params.id, b)
  if (!updated) return res.status(404).json({ error: 'not found' })
  res.json(updated)
})

// Assign whole RFQ or a partial set of lines to a supplier.
// Auto-tags the supplier with the base name of every assigned item (no duplicate tags).
router.post('/:id/assign', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const { supplierId, type = 'full', lineIds = [] } = req.body || {}
  const supplier = store.find('suppliers', supplierId)
  if (!supplier) return res.status(404).json({ error: 'supplier not found' })

  const targetIds = type === 'full' ? rfq.lines.map((l) => l.lineId) : lineIds
  const targetLines = rfq.lines.filter((l) => targetIds.includes(l.lineId))

  // Auto-tagging: base name only — size doesn't matter.
  let tags = supplier.tags
  for (const line of targetLines) {
    const linked = line.itemId ? store.find('items', line.itemId) : null
    const base = linked?.baseName || deriveBaseName(line.name)
    if (base) { tags = addTagUnique(tags, base); store.registerTag(base) }
  }
  store.update('suppliers', supplier.id, { tags })

  const assignment = {
    id: newId('ASG'),
    supplierId,
    supplierName: supplier.name,
    type,
    lineIds: targetIds,
    createdAt: Date.now(),
  }
  const assignments = [...rfq.assignments.filter((a) => a.supplierId !== supplierId), assignment]
  store.update('rfqs', rfq.id, { assignments, status: rfq.status === 'Draft' ? 'Published' : rfq.status })
  res.json({ assignment, supplierTags: tags })
})

router.delete('/:id/assign/:supplierId', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const assignments = rfq.assignments.filter((a) => a.supplierId !== req.params.supplierId)
  store.update('rfqs', rfq.id, { assignments })
  res.json({ ok: true })
})

// Supplier portal quote submission (structured lines, e.g. from the parsed upload or the form).
router.post('/:id/quote', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const b = req.body || {}
  const quote = {
    id: newId('QTE'),
    rfqId: rfq.id,
    supplierId: b.supplierId || null,
    supplierName: b.supplierName || '',
    lines: (b.lines || []).map((l) => ({
      lineId: l.lineId || null, name: l.name, rate: Number(l.rate) || 0, qty: l.qty ?? 1,
      leadTime: l.leadTime || '', warranty: l.warranty || '', remark: l.remark || '',
    })),
    paymentTerms: b.paymentTerms || '',
    notes: b.notes || '',
    submittedAt: Date.now(),
  }
  store.insert('quotes', quote)
  res.status(201).json(quote)
})

export default router
