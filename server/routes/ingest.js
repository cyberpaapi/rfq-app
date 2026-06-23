import { Router } from 'express'
import * as store from '../store.js'
import { newId } from '../store.js'
import { upload } from '../lib/upload.js'
import { extractDocument } from '../lib/extract.js'
import { extractItems } from '../lib/ai.js'
import { deriveBaseName } from '../lib/tags.js'

const router = Router()

// POST /api/ingest  (multipart: file)  [?attachTo=RFQ-id]
// Pipeline: extract -> AI split into distinct items -> upsert into catalogue (dedup) -> return review list.
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' })
    const extraction = await extractDocument({ buffer: req.file.buffer, filename: req.file.originalname })
    const { items, engine, note } = await extractItems(extraction)

    // Reconcile each extracted item against the standardized catalogue.
    // name stays the clean base name; spec keeps variants distinct; all other
    // detail lives in description. Auxiliary requirements get a "Secondary" tag.
    const reconciled = items.map((it) => {
      const spec = (it.spec || '').trim()
      const extraTags = it.secondary ? ['Secondary'] : []
      const { item, created } = store.upsertItem({
        name: it.name,
        spec,
        baseName: deriveBaseName(it.name),
        uom: it.uom,
        brand: it.brand,
        model: it.model,
        partNo: it.partNo,
        description: it.description,
        extraTags,
      })
      return {
        name: it.name,
        spec,
        description: it.description || '',
        secondary: !!it.secondary,
        quantity: it.quantity ?? 1,
        uom: it.uom || item?.uom || 'PCS',
        itemId: item?.id || null,
        baseName: item?.baseName,
        tags: item?.tags || [],
        isNew: created,
      }
    })

    let rfq = null
    const attachTo = req.query.attachTo
    if (attachTo) {
      rfq = store.find('rfqs', attachTo)
      if (rfq) {
        const newLines = reconciled.map((r) => ({ lineId: newId('LN'), itemId: r.itemId, name: r.name, spec: r.spec, description: r.description, qty: r.quantity, uom: r.uom }))
        store.update('rfqs', rfq.id, { lines: [...rfq.lines, ...newLines] })
      }
    }

    res.json({
      engine,
      note,
      sourceKind: extraction.kind,
      meta: extraction.meta,
      count: reconciled.length,
      newItems: reconciled.filter((r) => r.isNew).length,
      items: reconciled,
      attachedTo: rfq?.id || null,
    })
  } catch (err) {
    console.error('[ingest] error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
