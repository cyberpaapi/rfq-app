import { Router } from 'express'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import multer from 'multer'
import { waitUntil } from '@vercel/functions'
import * as store from '../store.js'
import { newId } from '../store.js'
import { deriveBaseName, addTagUnique } from '../lib/tags.js'
import { upload } from '../lib/upload.js'
import { inspectUploadedFile, readQueuedBlob } from '../lib/documents.js'
import { extractDocument } from '../lib/extract.js'
import { extractQuote, matchQuoteLines, scoreQuality, recommendBestPerItem } from '../lib/ai.js'

import { isPriced, validateAward } from '../../shared/evaluation.js'
import { recordAction } from '../lib/diagnostics.js'
import { documentDownload } from '../lib/documents.js'
import { roleCan } from '../../shared/roles.js'
import { rfqCreationDate, validDate } from '../../shared/rfqDates.js'
import { MAX_UPLOAD_BYTES, validateUpload } from '../../shared/uploads.js'

const router = Router()
const queuedMultipart = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } })
const queuedUploadDir = () => join(process.env.RFQ_DATA_DIR || join(process.cwd(), 'server', 'data'), 'queued-uploads')
const finalized = (rfq) => !!rfq.award || ['Awarded', 'Closed', 'Cancelled'].includes(rfq.status)
const invalidateRecommendation = (id) => store.update('rfqs', id, { recommendation: null, recommendedAt: null })
const evaluationSnapshot = (id) => JSON.stringify({ rfq: store.find('rfqs', id), quotes: store.all('quotes').filter((q) => q.rfqId === id).map(stripFile) })

// Canonical workflow order (mirrors the frontend tracker).
const WORKFLOW = ['Draft', 'Published', 'Responses Received', 'Evaluation', 'Pending Approval', 'Awarded']

const withLineIds = (lines = []) =>
  lines.filter((l) => typeof l?.name === 'string' && l.name.trim()).map((l) => ({
    lineId: l.lineId || newId('LN'),
    itemId: l.itemId || null,
    sku: l.sku || '',
    name: l.name.trim(),
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

// Access control replaces this header with the authenticated account's role.
const actor = (req) => req.get('x-user-name') || req.body?.actor || 'System'
const publicQuoteJob = (job) => ({ id: job.id, supplierId: job.supplierId, status: job.status, fileName: job.file?.name,
  attempts: job.attempts, createdAt: job.createdAt, updatedAt: job.updatedAt, completedAt: job.completedAt,
  error: job.error || '', result: job.result || null })

router.get('/', (req, res) => {
  const internal = roleCan(req.accessRole, 'workspace.view')
  const list = store.all('rfqs').filter((r) => internal || r.assignments?.some((a) => a.supplierId === req.supplierId))
  res.json(list.map((r) => internal ? { ...r, quoteJobs: (r.quoteJobs || []).map(publicQuoteJob), quoteCount: store.all('quotes').filter((q) => q.rfqId === r.id && q.lines?.some(isPriced)).length } : { id: r.id, title: r.title, status: r.status, creationDate: rfqCreationDate(r), assignments: r.assignments.filter((a) => a.supplierId === req.supplierId) }))
})

// Don't ship the (potentially large) base64 file blob in the normal payload.
const stripFile = (q) => { const { fileData, fileBlob, ...rest } = q; return { ...rest, hasFile: !!fileData || !!fileBlob, fileExpiresAt: fileBlob?.expiresAt || null } }

router.get('/:id', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'not found' })
  const quotes = store.all('quotes').filter((q) => q.rfqId === rfq.id).map(stripFile)
  if (!roleCan(req.accessRole, 'workspace.view')) {
    const assignments = rfq.assignments.filter((a) => a.supplierId === req.supplierId)
    return res.json({ id: rfq.id, title: rfq.title, description: rfq.description, status: rfq.status, creationDate: rfqCreationDate(rfq), deadline: rfq.deadline, assignments, lines: rfq.lines, quotes: quotes.filter((q) => q.supplierId === req.supplierId), quoteJobs: (rfq.quoteJobs || []).filter((job) => job.supplierId === req.supplierId).map(publicQuoteJob) })
  }
  res.json({ ...rfq, quoteJobs: (rfq.quoteJobs || []).map(publicQuoteJob), recommendation: rfq.recommendationVersion === 2 ? rfq.recommendation : null, quotes })
})

// Download the exact response document a supplier uploaded.
router.get('/:id/quote-file/:supplierId', async (req, res, next) => {
  try {
    const quote = store.all('quotes').find((q) => q.rfqId === req.params.id && q.supplierId === req.params.supplierId)
    if (quote?.fileBlob) {
      res.setHeader('Cache-Control', 'no-store')
      return res.redirect(302, await documentDownload(quote.fileBlob))
    }
    if (!quote?.fileData) return res.status(404).json({ error: 'no file on record for that supplier' })
    res.setHeader('Content-Type', quote.fileMime || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${quote.fileName || 'response'}"`)
    res.send(Buffer.from(quote.fileData, 'base64'))
  } catch (error) { next(error) }
})

// Edit a supplier's quote in the comparison grid — merge per-line patches
// (rate / eta / specNotes / qualityScore) by lineId. `etaAll` sets one ETA on
// every line (a whole-consignment ETA).
router.put('/:id/quotes/:supplierId', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  if (finalized(rfq)) return res.status(409).json({ error: 'This RFQ is finalized.' })
  const quote = store.all('quotes').find((q) => q.rfqId === req.params.id && q.supplierId === req.params.supplierId)
  if (!quote) return res.status(404).json({ error: 'quote not found' })
  const { lines = [], etaAll } = req.body || {}
  if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines must be an array' })
  for (const line of lines) {
    if (!rfq.lines.some((l) => l.lineId === line.lineId)) return res.status(400).json({ error: 'Unknown RFQ item.' })
    if (line.rate !== undefined && (!Number.isFinite(Number(line.rate)) || Number(line.rate) < 0)) return res.status(400).json({ error: 'Rate must be a non-negative number.' })
    if (line.qualityScore != null && line.qualityScore !== '' && (!Number.isFinite(Number(line.qualityScore)) || Number(line.qualityScore) < 0 || Number(line.qualityScore) > 99)) return res.status(400).json({ error: 'Quality must be between 0 and 99.' })
  }
  const patchById = Object.fromEntries(lines.map((l) => [l.lineId, l]))
  const existing = new Set(quote.lines.map((l) => l.lineId))
  const allLines = [...quote.lines, ...lines.filter((l) => !existing.has(l.lineId)).map((l) => ({ lineId: l.lineId, rate: 0 }))]
  const next = allLines.map((l) => {
    const p = patchById[l.lineId] || {}
    const merged = { ...l }
    if (p.rate !== undefined) merged.rate = Number(p.rate) || 0
    if (p.eta !== undefined) merged.eta = p.eta
    if (p.specNotes !== undefined) merged.specNotes = p.specNotes
    if (p.remark !== undefined) merged.remark = p.remark
    if (p.qualityScore !== undefined) merged.qualityScore = p.qualityScore === '' || p.qualityScore == null ? null : Math.max(0, Math.min(99, Number(p.qualityScore)))
    if (etaAll !== undefined && (p.eta === undefined)) merged.eta = etaAll
    return merged
  })
  const updated = store.update('quotes', quote.id, { lines: next })
  invalidateRecommendation(rfq.id)
  res.json(stripFile(updated))
})

// AI quality scoring: for every matched supplier line, compare the VENDOR's
// description to the RFQ line's description → a 0-99 quality score AND a short
// comparison note. Fills qualityScore + specNotes. Batched (20/parallel) inside
// scoreQuality so it scales to ~250 items × several suppliers.
router.post('/:id/score-quality', async (req, res) => {
  try {
    const rfq = store.find('rfqs', req.params.id)
    if (!rfq) return res.status(404).json({ error: 'rfq not found' })
    if (finalized(rfq)) return res.status(409).json({ error: 'This RFQ is finalized.' })
    const snapshot = evaluationSnapshot(rfq.id)
    const reqOf = (lineId) => {
      const l = rfq.lines.find((x) => x.lineId === lineId)
      return l ? [l.name, l.spec, l.description].filter(Boolean).join(' — ') : ''
    }
    const quotes = store.all('quotes').filter((q) => q.rfqId === rfq.id)
    const pairs = []
    const ref = [] // index -> { quoteId, lineId }
    quotes.forEach((q) => q.lines.forEach((l) => {
      if (!(Number(l.rate) > 0)) return
      // offer = the vendor sheet's description for this item
      const vendorDesc = l.description || l.specNotes || l.remark || ''
      pairs.push({ i: pairs.length, requirement: reqOf(l.lineId), offer: [l.name, vendorDesc].filter(Boolean).join(' — ') || '(no spec provided)' })
      ref.push({ quoteId: q.id, lineId: l.lineId })
    }))
    const scores = await scoreQuality(pairs) // { i: { score, note } }
    if (evaluationSnapshot(rfq.id) !== snapshot) return res.status(409).json({ error: 'Quotes changed while scoring. Please run scoring again.' })
    // apply back — qualityScore + AI comparison note into specNotes
    const byQuote = {}
    ref.forEach((r, i) => { if (scores[i] != null) (byQuote[r.quoteId] ??= {})[r.lineId] = scores[i] })
    for (const q of quotes) {
      const s = byQuote[q.id]
      if (!s) continue
      store.update('quotes', q.id, { lines: q.lines.map((l) => {
        const v = s[l.lineId]
        return v != null ? { ...l, qualityScore: v.score, specNotes: v.note || l.specNotes } : l
      }) })
    }
    const scored = Object.values(byQuote).reduce((a, m) => a + Object.keys(m).length, 0)
    if (pairs.length && !scored) return res.status(503).json({ error: 'AI quality scoring is unavailable. Enter quality scores manually or try again.' })
    invalidateRecommendation(rfq.id)
    res.json({ scored, engine: process.env.OPENAI_API_KEY ? 'gpt-5.4-mini' : 'skipped (no key)' })
  } catch (err) {
    console.error('[score-quality] error:', err)
    res.status(500).json({ error: err.message })
  }
})

// AI best-supplier recommendation: for each RFQ line, pass the whole row (every
// supplier's rate/eta/quality/description) to the model, which picks the best
// supplier by the given weights and justifies it. Batched (20 items/parallel).
// Stores rfq.recommendation = { [lineId]: { supplierId, supplierName, reason } }
// so both the Quote Comparison grid and the Evaluation page can read it.
router.post('/:id/recommend', async (req, res) => {
  try {
    const rfq = store.find('rfqs', req.params.id)
    if (!rfq) return res.status(404).json({ error: 'rfq not found' })
    if (finalized(rfq)) return res.status(409).json({ error: 'This RFQ is finalized.' })
    const rawWeights = req.body?.weights || { price: 40, quality: 35, delivery: 25 }
    const weights = Object.fromEntries(['price', 'quality', 'delivery'].map((k) => [k, Number(rawWeights[k])]))
    const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0)
    if (Object.values(weights).some((v) => !Number.isFinite(v) || v < 0) || weightTotal <= 0) return res.status(400).json({ error: 'Choose non-negative weights with a positive total.' })
    for (const key of Object.keys(weights)) weights[key] = weights[key] / weightTotal * 100
    const snapshot = evaluationSnapshot(rfq.id)
    const quotes = store.all('quotes').filter((q) => q.rfqId === rfq.id)
    const nameOf = (sid) => store.find('suppliers', sid)?.name || quotes.find((q) => q.supplierId === sid)?.supplierName || sid

    const rows = []
    const ref = [] // rowIndex -> { lineId, suppliers:[{ id, name }] }
    rfq.lines.forEach((line) => {
      const cands = []
      quotes.forEach((q) => {
        const ql = q.lines.find((l) => l.lineId === line.lineId)
        if (!isPriced(ql) || store.find('suppliers', q.supplierId)?.qualified === false) return
        cands.push({ id: q.supplierId, name: nameOf(q.supplierId), rate: Number(ql.rate) || 0, eta: ql.eta || '', quality: ql.qualityScore ?? null, description: ql.description || ql.specNotes || ql.remark || '' })
      })
      if (!cands.length) return
      ref.push({ lineId: line.lineId, suppliers: cands })
      rows.push({ i: rows.length, item: [line.name, line.spec, line.description].filter(Boolean).join(' — '), qty: line.qty, suppliers: cands.map(({ id, ...s }) => ({ supplierId: id, ...s })) })
    })

    recordAction('recommendation.started', { rfqId: rfq.id, weights, eligibleItems: rows.length, totalItems: rfq.lines.length })
    const picks = await recommendBestPerItem(rows, weights) // { i: { supplier, reason } }
    if (evaluationSnapshot(rfq.id) !== snapshot) return res.status(409).json({ error: 'Quotes changed while recommending. Please run the recommendation again.' })
    const recommendation = {}
    ref.forEach((r, i) => {
      const pick = picks[i]
      if (!pick?.supplierId) return
      const chosen = r.suppliers.find((s) => s.id === pick.supplierId)
      if (!chosen) return
      recommendation[r.lineId] = { supplierId: chosen.id, supplierName: chosen.name, reason: pick.reason }
    })
    if (rows.length && !Object.keys(recommendation).length) return res.status(503).json({ error: 'AI could not produce valid recommendations. Use weighted scoring or try again.' })
    recordAction('recommendation.result', { rfqId: rfq.id, supplierItemCounts: Object.values(recommendation).reduce((counts, pick) => { counts[pick.supplierId] = (counts[pick.supplierId] || 0) + 1; return counts }, {}) })
    store.update('rfqs', rfq.id, { recommendation, recommendationVersion: 2, recommendWeights: weights, recommendedAt: Date.now() })
    store.logAudit({ rfqId: rfq.id, user: actor(req), action: 'AI best-supplier recommendation', field: 'Recommendation', old: '', value: `${Object.keys(recommendation).length} items` })
    res.json({ recommendation, count: Object.keys(recommendation).length, items: rows.length, engine: process.env.OPENAI_API_KEY ? 'gpt-5.4-mini' : 'skipped (no key)' })
  } catch (err) {
    console.error('[recommend] error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Persist the (edited) comparison state and move the RFQ into Evaluation.
router.post('/:id/forward-evaluation', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const patch = { comparisonForwarded: true }
  if (finalized(rfq)) return res.status(409).json({ error: 'This RFQ is finalized.' })
  if (['Published', 'Responses Received'].includes(rfq.status)) patch.status = 'Evaluation'
  if (rfq.status === 'Draft' && store.all('quotes').some((q) => q.rfqId === rfq.id)) patch.status = 'Evaluation'
  store.update('rfqs', rfq.id, patch)
  store.logAudit({ rfqId: rfq.id, user: actor(req), action: 'Forwarded comparison to Evaluation', field: 'Status', old: rfq.status, value: 'Evaluation' })
  res.json(store.find('rfqs', rfq.id))
})

router.post('/', (req, res) => {
  const b = req.body || {}
  if (b.status && b.status !== 'Draft') return res.status(400).json({ error: 'Create a draft, then use the publish or award workflow.' })
  if (b.creationDate !== undefined && !validDate(b.creationDate)) return res.status(400).json({ error: 'Enter a valid RFQ creation date.' })
  if (b.lines !== undefined && !Array.isArray(b.lines)) return res.status(400).json({ error: 'Items must be an array.' })
  const lines = withLineIds(b.lines)
  if (lines.some((line) => !Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0)) return res.status(400).json({ error: 'Every named item needs a positive quantity.' })
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
    lines,
    assignments: [],
    creationDate: b.creationDate || new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
  }
  store.insert('rfqs', rfq)
  store.logAudit({ rfqId: rfq.id, user: rfq.buyer, action: 'Created RFQ', field: 'Status', old: '—', value: rfq.status })
  res.status(201).json(rfq)
})

router.put('/:id', (req, res) => {
  const current = store.find('rfqs', req.params.id)
  if (!current) return res.status(404).json({ error: 'rfq not found' })
  const b = { ...req.body }
  if (finalized(current)) {
    if (b.lines === undefined && b.creationDate === undefined) return res.status(409).json({ error: 'Only item or creation date edits are allowed on this finalized RFQ.' })
    for (const key of Object.keys(b)) if (key !== 'lines' && key !== 'creationDate') delete b[key]
  }
  // Workflow decisions must go through their validated endpoints.
  for (const key of ['award', 'awardHistory', 'status', 'approvals', 'deliveries', 'assignments', 'recommendation', 'recommendedAt']) delete b[key]
  delete b.createdAt
  if (b.creationDate !== undefined && !validDate(b.creationDate)) return res.status(400).json({ error: 'Enter a valid RFQ creation date.' })
  if (b.lines !== undefined) {
    if (!Array.isArray(b.lines)) return res.status(400).json({ error: 'Items must be an array.' })
    b.lines = withLineIds(b.lines)
    if (b.lines.some((l) => !Number.isFinite(Number(l.qty)) || Number(l.qty) <= 0)) return res.status(400).json({ error: 'Every named item needs a positive quantity.' })
    if (new Set(b.lines.map((l) => l.lineId)).size !== b.lines.length) return res.status(400).json({ error: 'Duplicate item IDs.' })
    const changed = JSON.stringify(withLineIds(current.lines)) !== JSON.stringify(b.lines)
    const kept = new Set(b.lines.map((l) => l.lineId))
    b.assignments = current.assignments.map((a) => ({ ...a, lineIds: a.type === 'full' ? [...kept] : a.lineIds.filter((id) => kept.has(id)) })).filter((a) => a.lineIds.length)
    if (changed) {
      b.recommendation = null
      b.recommendedAt = null
      for (const quote of store.all('quotes').filter((q) => q.rfqId === current.id)) {
        store.update('quotes', quote.id, { lines: (quote.lines || []).filter((line) => kept.has(line.lineId)).map((line) => {
          const item = b.lines.find((candidate) => candidate.lineId === line.lineId)
          return { ...line, name: item.name, qty: item.qty }
        }) })
      }
      if (current.award || ['Awarded', 'Closed', 'Cancelled'].includes(current.status)) {
        b.awardHistory = [...(current.awardHistory || []), ...(current.award ? [{ ...current.award, approvals: current.approvals || {}, deliveries: current.deliveries || [], reopenedAt: Date.now() }] : [])]
        b.award = null
        b.deliveries = []
        b.approvals = {}
        b.status = 'Evaluation'
        store.removeItemPurchasesForRfq(current.id)
        store.logAudit({ rfqId: current.id, user: actor(req), action: 'Reopened award after item changes', field: 'Award', old: current.award?.type || current.status, value: 'Evaluation' })
      }
      store.logAudit({ rfqId: current.id, user: actor(req), action: 'Updated RFQ items', field: 'Items', old: `${current.lines.length} item(s)`, value: `${b.lines.length} item(s)` })
    }
  }
  delete b.id
  const updated = store.update('rfqs', req.params.id, b)
  if (!updated) return res.status(404).json({ error: 'not found' })
  if (b.creationDate && b.creationDate !== current.creationDate) store.logAudit({ rfqId: current.id, user: actor(req), action: 'Changed RFQ creation date', field: 'Creation Date', old: current.creationDate || '', value: b.creationDate })
  res.json(updated)
})

// Explicit status transition (Publish, move to Evaluation, Cancel, Close…).
router.post('/:id/status', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'not found' })
  const next = req.body?.status
  if (!WORKFLOW.includes(next) && !['Cancelled', 'Closed'].includes(next)) return res.status(400).json({ error: 'Invalid status.' })
  if (finalized(rfq) || next === 'Awarded' || next === 'Closed') return res.status(409).json({ error: 'Use the award and delivery workflow to finalize this RFQ.' })
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

  if (finalized(rfq)) return res.status(409).json({ error: 'This RFQ is finalized.' })
  if (supplier.qualified === false) return res.status(400).json({ error: 'Supplier is not qualified.' })
  if (rfq.status === 'Draft' && !roleCan(req.accessRole, 'rfq.publish')) return res.status(403).json({ error: 'Inviting suppliers to a draft requires Publish RFQ permission.' })
  if (!['full', 'partial'].includes(type) || !Array.isArray(lineIds)) return res.status(400).json({ error: 'Invalid assignment.' })
  const targetIds = type === 'full' ? rfq.lines.map((l) => l.lineId) : [...new Set(lineIds)]
  if (!targetIds.length || targetIds.some((id) => !rfq.lines.some((l) => l.lineId === id))) return res.status(400).json({ error: 'Select valid RFQ items.' })
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
  if (finalized(rfq)) return res.status(409).json({ error: 'This RFQ is finalized.' })
  const assignments = rfq.assignments.filter((a) => a.supplierId !== req.params.supplierId)
  store.update('rfqs', rfq.id, { assignments })
  res.json({ ok: true })
})

// Supplier portal quote submission (structured lines).
router.post('/:id/quote', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  if (finalized(rfq)) return res.status(409).json({ error: 'This RFQ is finalized.' })
  const b = req.body || {}
  const supplier = store.find('suppliers', b.supplierId)
  const assignment = rfq.assignments?.find((a) => a.supplierId === b.supplierId)
  if (!supplier) return res.status(400).json({ error: 'Select a valid supplier.' })
  if (!assignment) return res.status(400).json({ error: 'Supplier must be assigned to this RFQ.' })
  const replaceLines = b.replaceLines === true
  if (!Array.isArray(b.lines) || (!b.lines.length && !replaceLines) || b.lines.some((l) => !rfq.lines.some((item) => item.lineId === l.lineId) || !Number.isFinite(Number(l.rate)) || Number(l.rate) < 0) || new Set(b.lines.map((l) => l.lineId)).size !== b.lines.length) return res.status(400).json({ error: 'Quote must contain unique RFQ items with non-negative prices.' })
  const existing = store.all('quotes').find((q) => q.rfqId === rfq.id && q.supplierId === supplier.id)
  const priced = b.lines.filter(isPriced)
  if (!priced.length && !existing) return res.status(400).json({ error: 'Enter at least one positive price before submitting.' })
  const changed = new Map(b.lines.map((l) => [l.lineId, l]))
  const lines = [...(replaceLines ? [] : (existing?.lines || []).filter((l) => !changed.has(l.lineId))), ...priced.map((l) => {
    const item = rfq.lines.find((r) => r.lineId === l.lineId)
    const old = existing?.lines?.find((r) => r.lineId === l.lineId) || {}
    return { ...old, lineId: item.lineId, name: item.name, qty: item.qty, rate: Number(l.rate),
      leadTime: l.leadTime ?? old.leadTime ?? '', warranty: l.warranty ?? old.warranty ?? '',
      eta: l.eta ?? old.eta ?? '', remark: l.remark ?? old.remark ?? '' }
  })]
  const quote = {
    ...(existing || {}), id: existing?.id || newId('QTE'),
    rfqId: rfq.id,
    supplierId: b.supplierId || null,
    supplierName: supplier.name,
    lines,
    paymentTerms: b.paymentTerms ?? existing?.paymentTerms ?? '',
    notes: b.notes ?? existing?.notes ?? '',
    submittedAt: Date.now(),
  }
  if (!lines.length) {
    store.remove('quotes', existing.id)
    invalidateRecommendation(rfq.id)
    if (rfq.status === 'Responses Received' && !store.all('quotes').some((q) => q.rfqId === rfq.id && q.lines?.some(isPriced))) store.update('rfqs', rfq.id, { status: 'Published' })
    store.logAudit({ rfqId: rfq.id, user: actor(req), action: 'Cleared supplier quotation', field: 'Quotes', value: supplier.name })
    return res.json({ supplierId: supplier.id, lines: [] })
  }
  if (existing) store.update('quotes', existing.id, quote)
  else store.insert('quotes', quote)
  invalidateRecommendation(rfq.id)
  // First response moves a Published RFQ forward.
  if (rfq.status === 'Published') store.update('rfqs', rfq.id, { status: 'Responses Received' })
  store.logAudit({ rfqId: rfq.id, user: actor(req), action: existing ? 'Updated supplier quotation' : 'Submitted supplier quotation', field: 'Quotes', old: '', value: `${supplier.name}: ${lines.length} quoted item(s)` })
  store.notify({ type: 'response', title: `New quote from ${quote.supplierName} on ${rfq.title}`, rfqId: rfq.id })
  res.status(existing ? 200 : 201).json(stripFile(quote))
})

// Parsing can run after the upload request ends; persistence uses a fresh state
// so unrelated writes during AI extraction do not invalidate the quote.
async function parseQuoteFromFile(rfq, file) {
  const extraction = await extractDocument({ buffer: file.buffer, filename: file.originalname })
  const { items: quoteLines, engine, currency, rate, rateSource, usedUsdColumn } = await extractQuote(extraction)
  const { map, engine: matchEngine } = await matchQuoteLines(rfq.lines, quoteLines)

  // Output ALWAYS follows the RFQ's own order and names.
  const lines = rfq.lines.map((line, i) => {
    const q = map[i] >= 0 ? quoteLines[map[i]] : null
    return {
      lineId: line.lineId, name: line.name, qty: line.qty,
      rate: q ? Number(q.unitPrice) || 0 : 0,
      leadTime: q?.leadTime || '', warranty: q?.warranty || '', eta: q?.eta || '',
      remark: q?.remark || (q ? '' : 'no match found in document'),
      // raw vendor description (compared against the RFQ description during scoring)
      description: q?.description || '',
      // specNotes holds the AI comparison note once "Score quality (AI)" is run
      specNotes: '', qualityScore: null,
    }
  })

  return { lines, matchedIds: rfq.lines.filter((_, i) => map[i] >= 0).map((line) => line.lineId),
    rfqLineIds: rfq.lines.map((line) => line.lineId), engine, matchEngine, currency, rate, rateSource, usedUsdColumn,
    extracted: quoteLines.length, matched: map.filter((x) => x >= 0).length,
    total: rfq.lines.length, unmatched: rfq.lines.filter((_, i) => map[i] < 0).map((line) => line.name) }
}

function saveParsedQuote(rfqId, supplierId, file, parsed) {
  const rfq = store.find('rfqs', rfqId)
  const supplier = store.find('suppliers', supplierId)
  if (!rfq || !supplier) throw new Error('RFQ or supplier was removed while processing.')
  if (finalized(rfq)) throw new Error('This RFQ was finalized while the document was processing.')
  if (!rfq.assignments.some((assignment) => assignment.supplierId === supplierId)) throw new Error('Supplier is no longer assigned to this RFQ.')
  if (rfq.lines.map((line) => line.lineId).join('|') !== parsed.rfqLineIds.join('|')) throw new Error('RFQ items changed during processing. Retry this upload.')
  invalidateRecommendation(rfq.id)
  const previous = store.all('quotes').find((q) => q.rfqId === rfq.id && q.supplierId === supplier.id)
  // A partial document must not erase prices entered manually for other items.
  const matchedIds = new Set(parsed.matchedIds)
  const mergedLines = [...(previous?.lines || []).filter((old) => !matchedIds.has(old.lineId)),
    ...parsed.lines.filter(isPriced)]
  const quoteData = {
    ...(previous || {}), id: previous?.id || newId('QTE'), rfqId: rfq.id, supplierId: supplier.id, supplierName: supplier.name,
    lines: mergedLines, paymentTerms: previous?.paymentTerms || '', notes: `Parsed from ${file.originalname}`, source: file.originalname,
    // keep the original file so the buyer can re-download the exact response
    fileBlob: file.blob || null, fileData: file.blob ? null : file.buffer.toString('base64'),
    fileMime: file.mimetype || 'application/octet-stream', fileName: file.originalname,
    currency: 'USD', sourceCurrency: parsed.currency, fxRate: parsed.rate, fxSource: parsed.rateSource, submittedAt: Date.now(),
  }
  const quote = previous ? store.update('quotes', previous.id, quoteData) : store.insert('quotes', quoteData)
  if (rfq.status === 'Published') store.update('rfqs', rfq.id, { status: 'Responses Received' })
  store.logAudit({ rfqId: rfq.id, user: supplier.name, action: 'Uploaded quotation document', field: 'Quotes', old: '', value: file.originalname })
  store.notify({ type: 'response', title: `New quote from ${supplier.name} on ${rfq.title}`, rfqId: rfq.id })

  file.retainBlob = true

  return {
    quote: stripFile(quote), engine: parsed.engine, matchEngine: parsed.matchEngine, currency: parsed.currency,
    rate: parsed.rate, rateSource: parsed.rateSource, usedUsdColumn: parsed.usedUsdColumn,
    extracted: parsed.extracted, matched: parsed.matched, total: parsed.total, unmatched: parsed.unmatched,
  }
}

async function buildQuoteFromFile(rfq, supplier, file) {
  if (!rfq.assignments.some((assignment) => assignment.supplierId === supplier.id)) throw new Error('Supplier must be assigned to this RFQ.')
  const parsed = await parseQuoteFromFile(rfq, file)
  return saveParsedQuote(rfq.id, supplier.id, file, parsed)
}

const JOB_TIMEOUT_MS = 6 * 60_000
const findQuoteJob = (rfq, jobId) => rfq?.quoteJobs?.find((job) => job.id === jobId)
const updateQuoteJob = (rfq, jobId, patch) => store.update('rfqs', rfq.id, {
  quoteJobs: (rfq.quoteJobs || []).map((job) => job.id === jobId ? { ...job, ...patch, updatedAt: Date.now() } : job),
})

async function processQueuedQuote(rfqId, jobId) {
  let snapshot
  try {
    snapshot = await store.withFreshState(() => {
      const rfq = store.find('rfqs', rfqId)
      const job = findQuoteJob(rfq, jobId)
      if (!job || job.status === 'completed' || (job.status === 'processing' && Date.now() - job.updatedAt < JOB_TIMEOUT_MS)) return null
      updateQuoteJob(rfq, jobId, { status: 'processing', error: '', attempts: (job.attempts || 0) + 1 })
      return { rfq: structuredClone(rfq), job: structuredClone(job) }
    })
    if (!snapshot) return
    const { job, rfq } = snapshot
    const file = job.file.blob
      ? await readQueuedBlob(job.file.blob)
      : { originalname: job.file.name, mimetype: job.file.contentType, size: job.file.size, buffer: await readFile(job.file.localPath) }
    const parsed = await parseQuoteFromFile(rfq, file)
    await store.withFreshState(() => {
      const current = store.find('rfqs', rfqId)
      const active = findQuoteJob(current, jobId)
      if (!active || active.status === 'completed') return
      const result = saveParsedQuote(rfqId, job.supplierId, file, parsed)
      updateQuoteJob(store.find('rfqs', rfqId), jobId, { status: 'completed', completedAt: Date.now(),
        result: { matched: result.matched, priced: result.quote.lines.filter(isPriced).length, total: result.total, unmatched: result.unmatched, source: file.originalname }, file: { ...job.file, localPath: undefined } })
    })
    if (job.file.localPath) await unlink(job.file.localPath).catch(() => {})
  } catch (error) {
    console.error('[quote-job] failed:', error)
    try { await store.withFreshState(() => {
      const rfq = store.find('rfqs', rfqId)
      if (findQuoteJob(rfq, jobId)?.status === 'processing') updateQuoteJob(rfq, jobId, { status: 'failed', error: String(error.message || 'Processing failed.').slice(0, 240) })
    }) } catch (saveError) { console.error('[quote-job] could not save failure:', saveError) }
  }
}

function scheduleQuoteJob(res, rfqId, jobId, localPath) {
  const task = new Promise((resolve) => res.once('finish', resolve)).then(async () => {
    if (res.statusCode >= 400) { if (localPath) await unlink(localPath).catch(() => {}); return }
    await processQueuedQuote(rfqId, jobId)
  }).catch((error) => console.error('[quote-job] scheduling failed:', error))
  if (process.env.VERCEL) waitUntil(task)
}

// Upload receipt is acknowledged after durable storage; extraction continues
// after the response, so suppliers can close the page immediately.
router.post('/:id/quote-upload-queue', (req, res, next) => req.is('application/json') ? next() : queuedMultipart.single('file')(req, res, next), async (req, res) => {
  let localPath
  try {
    const rfq = store.find('rfqs', req.params.id)
    if (!rfq) return res.status(404).json({ error: 'rfq not found' })
    if (finalized(rfq)) return res.status(409).json({ error: 'This RFQ is finalized.' })
    const supplier = store.find('suppliers', req.query.supplierId || req.body?.supplierId)
    if (!supplier || !rfq.assignments.some((assignment) => assignment.supplierId === supplier.id)) return res.status(403).json({ error: 'Supplier is not assigned to this RFQ.' })
    if ((rfq.quoteJobs || []).some((job) => job.supplierId === supplier.id && ['queued', 'processing'].includes(job.status) && Date.now() - job.updatedAt < JOB_TIMEOUT_MS)) return res.status(409).json({ error: 'A quotation upload is already processing for this RFQ.' })
    const target = `/rfqs/${rfq.id}/quote-upload-queue`
    const id = newId('QJOB')
    let file
    if (req.body?.uploadReceipt) {
      const blob = await inspectUploadedFile(req.body.uploadReceipt, target)
      file = { name: blob.name, size: blob.size, contentType: blob.contentType, blob: { pathname: blob.pathname, size: blob.size, name: blob.name, contentType: blob.contentType, retainedUntil: blob.retainedUntil } }
    } else if (req.file) {
      const checked = validateUpload({ name: req.file.originalname, size: req.file.size, target })
      await mkdir(queuedUploadDir(), { recursive: true })
      localPath = join(queuedUploadDir(), id)
      await writeFile(localPath, req.file.buffer)
      file = { name: checked.name, size: checked.size, contentType: checked.contentType, localPath }
    } else return res.status(400).json({ error: 'Upload a quotation file.' })
    const job = { id, supplierId: supplier.id, rfqId: rfq.id, status: 'queued', attempts: 0, file,
      createdAt: Date.now(), updatedAt: Date.now() }
    store.update('rfqs', rfq.id, { quoteJobs: [...(rfq.quoteJobs || []), job] })
    store.logAudit({ rfqId: rfq.id, user: actor(req), action: 'Queued quotation upload', field: 'Quotes', value: `${supplier.name}: ${file.name}` })
    scheduleQuoteJob(res, rfq.id, id, localPath)
    res.status(202).json({ id, status: 'queued', fileName: file.name })
  } catch (error) {
    if (localPath) await unlink(localPath).catch(() => {})
    res.status(error.status || 500).json({ error: error.message })
  }
})

router.post('/:id/quote-jobs/:jobId/retry', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  const job = findQuoteJob(rfq, req.params.jobId)
  if (!rfq || !job) return res.status(404).json({ error: 'Upload job not found.' })
  if (job.supplierId !== (req.body?.supplierId || req.query.supplierId)) return res.status(403).json({ error: 'This upload belongs to another supplier.' })
  if (finalized(rfq)) return res.status(409).json({ error: 'This RFQ is finalized.' })
  if (job.status === 'completed' || (job.status === 'processing' && Date.now() - job.updatedAt < JOB_TIMEOUT_MS)) return res.status(409).json({ error: 'This upload cannot be retried yet.' })
  updateQuoteJob(rfq, job.id, { status: 'queued', error: '' })
  scheduleQuoteJob(res, rfq.id, job.id, job.file.localPath)
  res.status(202).json({ id: job.id, status: 'queued' })
})

// Supplier portal upload (logged-in supplier). [?supplierId=]
router.post('/:id/quote-upload', upload.single('file'), async (req, res) => {
  try {
    const rfq = store.find('rfqs', req.params.id)
    if (!rfq) return res.status(404).json({ error: 'rfq not found' })
    if (finalized(rfq)) return res.status(409).json({ error: 'This RFQ is finalized.' })
    if (!req.file) return res.status(400).json({ error: 'file is required' })
    const supplier = store.find('suppliers', req.query.supplierId || req.body?.supplierId)
    if (!supplier) return res.status(400).json({ error: 'supplierId is required' })
    if (!rfq.assignments.some((a) => a.supplierId === supplier.id)) return res.status(403).json({ error: 'Supplier is not assigned to this RFQ.' })
    res.status(201).json(await buildQuoteFromFile(rfq, supplier, req.file))
  } catch (err) {
    console.error('[quote-upload] error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Public RFQ-link response: a supplier (identified only by a typed name) uploads
// their response document. A supplier record is found or created by that name.
router.post('/:id/respond', upload.single('file'), async (req, res) => {
  try {
    const rfq = store.find('rfqs', req.params.id)
    if (!rfq) return res.status(404).json({ error: 'rfq not found' })
    if (finalized(rfq)) return res.status(409).json({ error: 'This RFQ is finalized.' })
    if (!req.file) return res.status(400).json({ error: 'file is required' })
    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ error: 'name is required' })

    let supplier = store.all('suppliers').find((s) => s.name.toLowerCase() === name.toLowerCase())
    if (!supplier) {
      supplier = {
        id: newId('SUP'), name, category: 'External', email: '', phone: '', location: '',
        qualified: true, rating: 0, scores: { price: 70, quality: 70, delivery: 70 }, ratings: [],
        previouslyInvited: false, notes: 'Created via RFQ link response.', tags: [], createdAt: Date.now(),
      }
      store.insert('suppliers', supplier)
    }
    // Ensure they're recorded as an invited supplier on this RFQ.
    if (!rfq.assignments?.some((a) => a.supplierId === supplier.id)) {
      const assignment = { id: newId('ASG'), supplierId: supplier.id, supplierName: supplier.name, type: 'full', lineIds: rfq.lines.map((l) => l.lineId), createdAt: Date.now() }
      store.update('rfqs', rfq.id, { assignments: [...(rfq.assignments || []), assignment] })
    }
    res.status(201).json(await buildQuoteFromFile(store.find('rfqs', rfq.id), supplier, req.file))
  } catch (err) {
    console.error('[respond] error:', err)
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
  let award
  try { award = validateAward(rfq, store.all('quotes').filter((q) => q.rfqId === rfq.id), store.all('suppliers'), req.body || {}) }
  catch (error) { return res.status(400).json({ error: error.message }) }
  const { type, reason } = award
  recordAction('award.validated', { rfqId: rfq.id, type, amount: award.amount, supplierId: award.supplierId, splits: award.splits?.map((s) => ({ supplierId: s.supplierId, items: s.lineIds.length })) })

  if (type === 'reject') {
    store.update('rfqs', rfq.id, { status: 'Cancelled', award: { type: 'reject', reason, at: Date.now() } })
    store.logAudit({ rfqId: rfq.id, user: actor(req), action: 'Rejected all quotes', field: 'Award', old: '—', value: 'Rejected' })
    store.notify({ type: 'award', title: `All quotes rejected for ${rfq.title}`, rfqId: rfq.id })
    return res.json(store.find('rfqs', rfq.id))
  }

  store.update('rfqs', rfq.id, { status: 'Awarded', award })
  recordPurchases(rfq.id) // append awarded prices to each linked item's history
  seedDeliveries(rfq.id)  // one delivery to track per winning supplier
  const who = type === 'split' ? `${award.splits.length} suppliers (split)` : award.supplierName
  store.logAudit({ rfqId: rfq.id, user: actor(req), action: `Awarded to ${who}`, field: 'Award', old: '—', value: who })
  store.notify({ type: 'award', title: `${rfq.title} awarded to ${who}`, rfqId: rfq.id })
  res.json(store.find('rfqs', rfq.id))
})

// On award, record the per-line awarded price into each linked catalogue item's
// price history (and its last-bought price). Uses the winning supplier's quote.
function recordPurchases(rfqId) {
  const rfq = store.find('rfqs', rfqId)
  if (!rfq?.award || rfq.award.type === 'reject') return
  const quotes = store.all('quotes').filter((q) => q.rfqId === rfqId)
  const rateOf = (supplierId, lineId) => {
    const q = quotes.find((x) => x.supplierId === supplierId)
    const ql = q?.lines.find((l) => l.lineId === lineId)
    return ql ? Number(ql.rate) || 0 : 0
  }
  const records = []
  for (const line of rfq.lines) {
    if (!line.itemId) continue
    let supplierId = null, supplierName = ''
    if (rfq.award.type === 'full') { supplierId = rfq.award.supplierId; supplierName = rfq.award.supplierName }
    else { const sp = rfq.award.splits?.find((s) => s.lineIds?.includes(line.lineId)); supplierId = sp?.supplierId; supplierName = sp?.supplierName }
    if (!supplierId) continue
    const price = rateOf(supplierId, line.lineId)
    if (!price) continue
    records.push({ itemId: line.itemId, price, qty: line.qty, supplierId, supplierName, rfqId: rfq.id, rfqTitle: rfq.title, at: Date.now() })
  }
  store.recordItemPurchases(records)
}

// One delivery to track per winning supplier (a supplier exports all their
// awarded items in one bulk shipment, so it's tracked per supplier, not per item).
function seedDeliveries(rfqId) {
  const rfq = store.find('rfqs', rfqId)
  if (!rfq?.award || rfq.award.type === 'reject') return
  const entries = rfq.award.type === 'split'
    ? (rfq.award.splits || []).map((s) => ({ supplierId: s.supplierId, supplierName: s.supplierName, lineIds: s.lineIds || [] }))
    : [{ supplierId: rfq.award.supplierId, supplierName: rfq.award.supplierName, lineIds: rfq.lines.map((l) => l.lineId) }]
  const deliveries = entries.map((e) => ({ ...e, items: e.lineIds.length, expectedDate: '', status: 'pending', deliveredAt: null, onTime: null, rated: false }))
  store.update('rfqs', rfq.id, { deliveries })
}

const blend = (cur, signal) => Math.round((Number(cur) || 70) * 0.7 + signal * 0.3)

// Delivery tracking + whole-supplier rating after an award.
// Body (any of): { supplierId, expectedDate }  |  { supplierId, deliver:true, deliveredDate? }
//                | { supplierId, rate:{ stars, note } }
router.post('/:id/delivery', (req, res) => {
  const rfq = store.find('rfqs', req.params.id)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const { supplierId, expectedDate, deliver, deliveredDate, rate } = req.body || {}
  const deliveries = [...(rfq.deliveries || [])]
  const idx = deliveries.findIndex((d) => d.supplierId === supplierId)
  if (idx < 0) return res.status(404).json({ error: 'delivery not found for that supplier' })
  const d = { ...deliveries[idx] }
  const supplier = store.find('suppliers', supplierId)

  if (expectedDate !== undefined) d.expectedDate = expectedDate

  if (deliver) {
    d.status = 'delivered'
    d.deliveredAt = deliveredDate || new Date().toISOString().slice(0, 10)
    d.onTime = d.expectedDate ? d.deliveredAt <= d.expectedDate : null
    // On-time performance is objective → auto-update the supplier's DELIVERY score.
    if (supplier && d.onTime !== null) {
      store.update('suppliers', supplier.id, { scores: { ...supplier.scores, delivery: blend(supplier.scores?.delivery, d.onTime ? 92 : 55) } })
    }
    store.logAudit({ rfqId: rfq.id, user: actor(req), action: `Delivery received from ${d.supplierName}${d.onTime === false ? ' (late)' : d.onTime ? ' (on time)' : ''}`, field: 'Delivery', old: 'pending', value: 'delivered' })
    store.notify({ type: 'response', title: `Delivery received from ${d.supplierName} — ${rfq.title}`, rfqId: rfq.id })
  }

  if (rate && supplier) {
    const stars = Math.max(1, Math.min(5, Number(rate.stars) || 0))
    const ratings = [...(supplier.ratings || []), { stars, note: rate.note || '', rfqId: rfq.id, at: Date.now() }]
    const avg = ratings.reduce((a, r) => a + r.stars, 0) / ratings.length
    // A whole-supplier rating drives the QUALITY score used in weighted scoring.
    store.update('suppliers', supplier.id, { ratings, rating: Math.round(avg * 10) / 10, scores: { ...supplier.scores, quality: blend(supplier.scores?.quality, stars * 20) } })
    d.rated = true
    store.logAudit({ rfqId: rfq.id, user: actor(req), action: `Rated ${d.supplierName} ${stars}★`, field: 'Rating', old: '', value: `${stars}★` })
  }

  deliveries[idx] = d
  const patch = { deliveries }
  if (deliveries.length && deliveries.every((x) => x.status === 'delivered') && rfq.status === 'Awarded' && !rfq.award?.unawardedLineIds?.length) patch.status = 'Closed'
  store.update('rfqs', rfq.id, patch)
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
