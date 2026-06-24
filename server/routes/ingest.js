import { Router } from 'express'
import * as store from '../store.js'
import { newId } from '../store.js'
import { upload } from '../lib/upload.js'
import { extractDocument } from '../lib/extract.js'
import { extractItems, clusterItems } from '../lib/ai.js'
import { deriveBaseName } from '../lib/tags.js'

const router = Router()

// POST /api/ingest  (multipart: file)  [?attachTo=RFQ-id]
// Pipeline: extract -> AI split into distinct items -> upsert into catalogue (dedup) -> return review list.
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' })
    const extraction = await extractDocument({ buffer: req.file.buffer, filename: req.file.originalname })
    const { items, clubs, engine, clubEngine, note, pages, chunks } = await extractItems(extraction)

    // Reconcile each extracted item against the standardized catalogue.
    // name stays the clean base name; spec keeps variants distinct; all other
    // detail lives in description. Auxiliary requirements get a "Secondary" tag.
    const reconciled = items.map((it) => {
      const spec = (it.spec || '').trim()
      const { item, created } = store.upsertItem({
        name: it.name,
        spec,
        baseName: deriveBaseName(it.name),
        uom: it.uom,
        brand: it.brand,
        model: it.model,
        partNo: it.partNo,
        description: it.description,
      })
      return {
        name: it.name,
        spec,
        description: it.description || '',
        brand: it.brand || '',
        model: it.model || '',
        partNo: it.partNo || '',
        secondaryRequirements: it.secondaryRequirements || '', // auxiliary items needed alongside (e.g. panel board for a fan)
        quantity: it.quantity ?? 1,
        uom: it.uom || item?.uom || 'PCS',
        itemId: item?.id || null,
        baseName: item?.baseName,
        tags: item?.tags || [],
        isNew: created,
        pages: it.pages || [],     // page(s) / row(s) this item was found on
        sources: it.sources || [], // human labels, e.g. "Page 3" / "Row 14"
      }
    })

    let rfq = null
    const attachTo = req.query.attachTo
    if (attachTo) {
      rfq = store.find('rfqs', attachTo)
      if (rfq) {
        const newLines = reconciled.map((r) => ({ lineId: newId('LN'), itemId: r.itemId, name: r.name, spec: r.spec, description: r.description, qty: r.quantity, uom: r.uom, brand: r.brand, model: r.model, partNo: r.partNo, secondaryRequirements: r.secondaryRequirements, photo: '', remark: '', requiredDeliveryDate: '', attachment: '' }))
        store.update('rfqs', rfq.id, { lines: [...rfq.lines, ...newLines] })
      }
    }

    // For the verification view:
    //  - plain text → return the text (scroll to a line)
    //  - spreadsheets → return the structured sheet so it renders AS A TABLE
    //    and scrolls to the exact row (capped to keep the payload sane)
    //  - PDF/images → verified client-side from the original uploaded file
    const sourceText = extraction.kind === 'text' ? String(extraction.text || '').slice(0, 200000) : null
    let sheetData = null
    if (extraction.kind === 'rows') {
      let budget = 8000 // total rows shipped to the browser across all sheets
      sheetData = (extraction.sheets || []).map((s) => {
        const rows = s.rows.slice(0, Math.max(0, budget))
        budget -= rows.length
        return { name: s.name, header: s.header, rows, truncated: rows.length < s.rows.length }
      })
    }

    res.json({
      engine,
      clubEngine,
      note,
      pages,
      chunks,
      sourceKind: extraction.kind,
      meta: extraction.meta,
      count: reconciled.length,
      newItems: reconciled.filter((r) => r.isNew).length,
      items: reconciled,
      clubs: clubs || null,
      sourceText,
      sheetData,
      attachedTo: rfq?.id || null,
    })
  } catch (err) {
    console.error('[ingest] error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ingest/cluster  { items: [{name, spec, uom, quantity, pages, sources}] }
// Re-runs the clubbing pass across an arbitrary (e.g. multi-document) item list.
router.post('/cluster', async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    const { clubs, clubEngine } = await clusterItems(items)
    res.json({ clubs: clubs || null, clubEngine: clubEngine || null })
  } catch (err) {
    console.error('[cluster] error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
