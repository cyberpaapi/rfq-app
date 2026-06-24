import { Router } from 'express'
import * as store from '../store.js'
import { newId } from '../store.js'
import { deriveBaseName, addTagUnique, normalize } from '../lib/tags.js'
import { upload } from '../lib/upload.js'
import { extractDocument } from '../lib/extract.js'
import { extractItems } from '../lib/ai.js'

const router = Router()

// Match supplier-quote lines back onto an RFQ's lines. Order is unreliable but
// quantity is always identical, so quantity is a strong signal alongside a
// fuzzy name-token overlap. Greedy best-match, each quote line used once.
function matchQuoteToRfq(rfqLines, quoteLines) {
  const tokens = (s) => normalize(s).split(/\s+/).filter(Boolean)
  const sim = (a, b) => {
    const A = new Set(tokens(a)), B = new Set(tokens(b))
    if (!A.size || !B.size) return 0
    let inter = 0
    A.forEach((t) => { if (B.has(t)) inter++ })
    return inter / Math.max(A.size, B.size)
  }
  const used = new Set()
  return rfqLines.map((L) => {
    let best = null, bestScore = 0
    quoteLines.forEach((q, qi) => {
      if (used.has(qi)) return
      const qtyEq = Number(q.quantity) === Number(L.qty)
      const score = sim(L.name + ' ' + (L.spec || ''), q.name + ' ' + (q.spec || '')) + (qtyEq ? 0.5 : 0)
      if (score > bestScore) { bestScore = score; best = { q, qi } }
    })
    // Accept a match on decent name overlap or an exact-quantity + any name hit.
    const ok = best && (bestScore >= 0.8 || bestScore >= 0.3)
    if (ok) used.add(best.qi)
    return { line: L, match: ok ? best.q : null, score: bestScore }
  })
}

const actorName = (req) => req.get('x-user-name') || 'System'

// Canonical workflow order (mirrors the frontend tracker).
const WORKFLOW = ['Draft', 'Published', 'Responses Received', 'Evaluation', 'Pending Approval', 'Awarded']

const withLineIds = (lines = []) =>
  lines.map((l) => ({
    lineId: l.lineId || newId('LN'),
    itemId: l.itemId || null,
    name: l.name,
    spec: l.spec || '',
    description: l.description || '',
    qty: l.qty ?? 1,
    uom: l.uom || 'PCS',
    brand: l.brand || '',
    model: l.model || '',
    partNo: l.partNo || '',
    secondaryRequirements: l.secondaryRequirements || '',
    photo: l.photo || '',
    remark: l.remark || '',
    requiredDeliveryDate: l.requiredDeliveryDate || '',
    attachment: l.attachment || '',
  }))

// Pull the buyer name off the request (demo auth passes it as a header).
const actor = (req) => req.get('x-user-name') || req.body?.actor || 'System'

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
    buyer: b.buyer || actor(req),
    category: b.category || 'General',
    currency: b.currency || 'USD',
    deadline: b.deadline || '',
    validity: b.validity || '',
    deliveryLocation: b.deliveryLocation || '',
    paymentTerms: b.paymentTerms || '',
    budget: Number(b.budget) || 0,
    attachments: b.attachments || [],
    approvals: {},
    clarifications: [],
    lines: withLineIds(b.lines),
    assignments: [],
    createdAt: Date.now(),
  }
  store.insert('rfqs', rfq)
  store.logAudit({ rfqId: rfq.id, user: rfq.buyer, action: 'Created RFQ', field: 'Status', old: '—', value: rfq.status })
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

// Explicit status transition (Publish, move to Evaluation, Cancel, Close…).
router.post('/:id/status', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'not found' })
  const next = req.body?.status
  if (!next) return res.status(400).json({ error: 'status is required' })
  const old = rfq.status
  const updated = store.update('rfqs', rfq.id, { status: next })
  store.logAudit({ rfqId: rfq.id, user: actor(req), action: `Status → ${next}`, field: 'Status', old, value: next })
  if (next === 'Published') store.notify({ type: 'response', title: `${rfq.title} published to suppliers`, rfqId: rfq.id })
  if (next === 'Cancelled') store.notify({ type: 'deadline', title: `${rfq.title} was cancelled`, rfqId: rfq.id })
  res.json(updated)
})

// Assign whole RFQ or a partial set of lines to a supplier.
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
  store.update('suppliers', supplier.id, { tags, previouslyInvited: true })

  const assignment = {
    id: newId('ASG'),
    supplierId,
    supplierName: supplier.name,
    type,
    lineIds: targetIds,
    createdAt: Date.now(),
  }
  const assignments = [...rfq.assignments.filter((a) => a.supplierId !== supplierId), assignment]
  const status = rfq.status === 'Draft' ? 'Published' : rfq.status
  store.update('rfqs', rfq.id, { assignments, status })
  store.logAudit({ rfqId: rfq.id, user: actor(req), action: `Invited ${supplier.name}`, field: 'Suppliers', old: '', value: supplier.name })
  store.notify({ type: 'response', title: `${supplier.name} invited to ${rfq.title}`, rfqId: rfq.id })
  res.json({ assignment, supplierTags: tags })
})

router.delete('/:id/assign/:supplierId', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const assignments = rfq.assignments.filter((a) => a.supplierId !== req.params.supplierId)
  store.update('rfqs', rfq.id, { assignments })
  res.json({ ok: true })
})

// Supplier portal quote submission (structured lines).
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
      leadTime: l.leadTime || '', warranty: l.warranty || '', eta: l.eta || '', remark: l.remark || '',
    })),
    paymentTerms: b.paymentTerms || '',
    notes: b.notes || '',
    submittedAt: Date.now(),
  }
  store.insert('quotes', quote)
  // First response moves a Published RFQ forward.
  if (rfq.status === 'Published') store.update('rfqs', rfq.id, { status: 'Responses Received' })
  store.logAudit({ rfqId: rfq.id, user: quote.supplierName || 'Supplier', action: 'Submitted quotation', field: 'Quotes', old: '', value: quote.id })
  store.notify({ type: 'response', title: `New quote from ${quote.supplierName} on ${rfq.title}`, rfqId: rfq.id })
  res.status(201).json(quote)
})

// Supplier portal: upload a quote DOCUMENT. The AI extracts each quoted line +
// unit price, which is matched back onto the RFQ's lines (by name + quantity)
// and saved as a structured quote. [?supplierId=]
router.post('/:id/quote-upload', upload.single('file'), async (req, res) => {
  try {
    const rfq = store.find('rfqs', req.params.id)
    if (!rfq) return res.status(404).json({ error: 'rfq not found' })
    if (!req.file) return res.status(400).json({ error: 'file is required' })
    const supplierId = req.query.supplierId || req.body?.supplierId
    const supplier = supplierId ? store.find('suppliers', supplierId) : null
    if (!supplier) return res.status(400).json({ error: 'supplierId is required' })

    const extraction = await extractDocument({ buffer: req.file.buffer, filename: req.file.originalname })
    const { items: quoteLines, engine } = await extractItems(extraction, { quote: true })

    const matched = matchQuoteToRfq(rfq.lines, quoteLines)
    const lines = matched.map(({ line, match }) => ({
      lineId: line.lineId, name: line.name, qty: line.qty,
      rate: match ? Number(match.unitPrice) || 0 : 0,
      leadTime: match?.leadTime || '', warranty: match?.warranty || '', eta: '',
      remark: match ? '' : 'no match found in document',
    }))

    // Replace any earlier quote from this supplier on this RFQ.
    const existing = store.all('quotes').filter((q) => q.rfqId === rfq.id && q.supplierId === supplier.id)
    existing.forEach((q) => store.remove('quotes', q.id))

    const quote = store.insert('quotes', {
      id: newId('QTE'), rfqId: rfq.id, supplierId: supplier.id, supplierName: supplier.name,
      lines, paymentTerms: '', notes: `Parsed from ${req.file.originalname}`, source: req.file.originalname, submittedAt: Date.now(),
    })
    if (rfq.status === 'Published') store.update('rfqs', rfq.id, { status: 'Responses Received' })
    store.logAudit({ rfqId: rfq.id, user: supplier.name, action: 'Uploaded quotation document', field: 'Quotes', old: '', value: req.file.originalname })
    store.notify({ type: 'response', title: `New quote from ${supplier.name} on ${rfq.title}`, rfqId: rfq.id })

    res.status(201).json({
      quote, engine,
      extracted: quoteLines.length,
      matched: matched.filter((m) => m.match).length,
      total: rfq.lines.length,
      unmatched: matched.filter((m) => !m.match).map((m) => m.line.name),
    })
  } catch (err) {
    console.error('[quote-upload] error:', err)
    res.status(500).json({ error: err.message })
  }
})

// HOD / Finance approval step.
router.post('/:id/approve', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const { role, decision = 'approved', note = '' } = req.body || {}
  if (!['hod', 'finance'].includes(role)) return res.status(400).json({ error: 'role must be hod or finance' })
  const approvals = { ...(rfq.approvals || {}), [role]: { decision, by: actor(req), note, at: Date.now() } }
  const patch = { approvals }
  if (rfq.status === 'Evaluation') patch.status = 'Pending Approval'
  store.update('rfqs', rfq.id, patch)
  store.logAudit({ rfqId: rfq.id, user: actor(req), action: `${role.toUpperCase()} ${decision}`, field: 'Approval', old: '—', value: decision })
  store.notify({ type: 'approval', title: `${role === 'hod' ? 'Dept HOD' : 'Finance'} ${decision} ${rfq.title}`, rfqId: rfq.id })
  res.json(store.find('rfqs', rfq.id))
})

// Award (full / split) or reject all.
router.post('/:id/award', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const { type = 'full', supplierId, awards = [], amount = 0, reason = '' } = req.body || {}

  if (type === 'reject') {
    store.update('rfqs', rfq.id, { status: 'Cancelled', award: { type: 'reject', reason, at: Date.now() } })
    store.logAudit({ rfqId: rfq.id, user: actor(req), action: 'Rejected all quotes', field: 'Award', old: '—', value: 'Rejected' })
    store.notify({ type: 'award', title: `All quotes rejected for ${rfq.title}`, rfqId: rfq.id })
    return res.json(store.find('rfqs', rfq.id))
  }

  let award
  if (type === 'split') {
    award = {
      type: 'split',
      at: Date.now(),
      amount: Number(amount) || 0,
      splits: awards.map((a) => ({ supplierId: a.supplierId, supplierName: store.find('suppliers', a.supplierId)?.name || '', lineIds: a.lineIds || [], amount: Number(a.amount) || 0 })),
    }
  } else {
    const supplier = store.find('suppliers', supplierId)
    if (!supplier) return res.status(404).json({ error: 'supplier not found' })
    award = { type: 'full', supplierId, supplierName: supplier.name, amount: Number(amount) || 0, at: Date.now() }
  }

  store.update('rfqs', rfq.id, { status: 'Awarded', award })
  const who = type === 'split' ? `${award.splits.length} suppliers (split)` : award.supplierName
  store.logAudit({ rfqId: rfq.id, user: actor(req), action: `Awarded to ${who}`, field: 'Award', old: '—', value: who })
  store.notify({ type: 'award', title: `${rfq.title} awarded to ${who}`, rfqId: rfq.id })
  res.json(store.find('rfqs', rfq.id))
})

// Clarification thread between a supplier and the buyer (spec 1.4 / 1.5).
router.post('/:id/clarifications', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const { from = 'Supplier', supplierId = null, message = '' } = req.body || {}
  if (!message.trim()) return res.status(400).json({ error: 'message is required' })
  const entry = { id: newId('CLR'), from, supplierId, message: message.trim(), at: Date.now() }
  const clarifications = [...(rfq.clarifications || []), entry]
  store.update('rfqs', rfq.id, { clarifications })
  store.logAudit({ rfqId: rfq.id, user: from, action: 'Clarification message', field: 'Clarification', old: '', value: message.slice(0, 40) })
  store.notify({ type: 'clarification', title: `Clarification on ${rfq.title} from ${from}`, rfqId: rfq.id })
  res.status(201).json(entry)
})

export default router
export { WORKFLOW }
