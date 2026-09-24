import { Router } from 'express'
import * as XLSX from 'xlsx'
import * as store from '../store.js'

import { isPriced } from '../../shared/evaluation.js'

const router = Router()

// For each RFQ line decide which supplier "won" it and at what rate.
// Award-aware: full award -> that supplier; split -> per-line supplier; else cheapest quote.
function resolveWinners(rfq, quotes) {
  const rateOf = (supplierId, lineId) => {
    const q = quotes.find((x) => x.supplierId === supplierId)
    const ql = q?.lines.find((l) => l.lineId === lineId)
    return ql ? Number(ql.rate) || 0 : null
  }

  return rfq.lines.map((line) => {
    let supplierId = null
    if (rfq.award?.type === 'full') {
      supplierId = rfq.award.supplierId
    } else if (rfq.award?.type === 'split') {
      const split = rfq.award.splits?.find((s) => s.lineIds?.includes(line.lineId))
      supplierId = split?.supplierId || null
    }
    // Fallback / no award: cheapest quote for this line.
    if (!supplierId && !rfq.award) {
      let best = null
      for (const q of quotes) {
        const ql = q.lines.find((l) => l.lineId === line.lineId)
        if (isPriced(ql) && (best === null || Number(ql.rate) < best.rate)) best = { supplierId: q.supplierId, rate: Number(ql.rate) || 0 }
      }
      supplierId = best?.supplierId || null
    }
    const supplier = supplierId ? store.find('suppliers', supplierId) : null
    const rate = supplierId ? rateOf(supplierId, line.lineId) || 0 : 0
    return { line, supplierId, supplierName: supplier?.name || '', rate }
  })
}

function sendWorkbook(res, wb, filename) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(buf)
}

// GET /api/export/po/:rfqId  — Zoho "Import PO" style sheet.
// NOTE: column set is a sensible default; swap to the exact Zoho template
// columns once Madhu shares the official "Import PO" file.
router.get('/po/:rfqId', (req, res) => {
  const rfq = store.find('rfqs', req.params.rfqId)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const quotes = store.all('quotes').filter((q) => q.rfqId === rfq.id)
  const winners = resolveWinners(rfq, quotes)

  const rows = winners.map(({ line, supplierName, rate }) => ({
    'PO Number': rfq.id,
    'Vendor Name': supplierName,
    'Item Name': line.name,
    'Description': [line.spec, line.description].filter(Boolean).join(' — '),
    'Secondary Requirements': line.secondaryRequirements || '',
    'Brand': line.brand || '',
    'Model': line.model || '',
    'Part No': line.partNo || '',
    'Quantity': line.qty,
    'UOM': line.uom,
    'Rate': rate,
    'Amount': +(rate * (Number(line.qty) || 0)).toFixed(2),
    'Required Delivery Date': line.requiredDeliveryDate || '',
    'Payment Terms': rfq.paymentTerms || '',
    'Currency': rfq.currency || 'USD',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Import PO')
  sendWorkbook(res, wb, `${rfq.id}-PO.xlsx`)
})

// GET /api/export/costing/:rfqId?stock={"LN-1":10}
// Two sheets: Without OPRO Stock and With OPRO Stock (net of available stock).
router.get('/costing/:rfqId', (req, res) => {
  const rfq = store.find('rfqs', req.params.rfqId)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const quotes = store.all('quotes').filter((q) => q.rfqId === rfq.id)
  const winners = resolveWinners(rfq, quotes)

  let stock = {}
  try { stock = req.query.stock ? JSON.parse(req.query.stock) : {} } catch { stock = {} }

  const without = winners.map(({ line, supplierName, rate }) => {
    const qty = Number(line.qty) || 0
    return {
      'Item Name': line.name, 'Spec': line.spec || '', 'Vendor': supplierName,
      'Quantity': qty, 'UOM': line.uom, 'Rate': rate,
      'Amount': +(rate * qty).toFixed(2),
    }
  })

  const withStock = winners.map(({ line, supplierName, rate }) => {
    const qty = Number(line.qty) || 0
    const onHand = Number(stock[line.lineId]) || 0
    const net = Math.max(0, qty - onHand)
    return {
      'Item Name': line.name, 'Spec': line.spec || '', 'Vendor': supplierName,
      'Required Qty': qty, 'OPRO Stock': onHand, 'Net Qty to Buy': net, 'UOM': line.uom, 'Rate': rate,
      'Amount': +(rate * net).toFixed(2),
    }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(without), 'Without OPRO Stock')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(withStock), 'With OPRO Stock')
  sendWorkbook(res, wb, `${rfq.id}-Costing.xlsx`)
})

// GET /api/export/rfq-items/:rfqId — the RFQ item list for a supplier to fill in
// (includes an empty "Unit Price" column).
router.get('/rfq-items/:rfqId', (req, res) => {
  const rfq = store.find('rfqs', req.params.rfqId)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const rows = rfq.lines.map((l, i) => ({
    'S.No': i + 1,
    'Item Name': l.name,
    'Specification': [l.spec, l.description].filter(Boolean).join(' — '),
    'Brand': l.brand || '',
    'Model No': l.model || '',
    'Part No': l.partNo || '',
    'Quantity': l.qty,
    'Unit': l.uom,
    'Remark': l.remark || '',
    'Unit Price': '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Item Name': '', 'Quantity': '', 'Unit Price': '' }])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'RFQ Items')
  sendWorkbook(res, wb, `${rfq.id}-RFQ.xlsx`)
})

// GET /api/export/comparison/:rfqId — the full side-by-side comparison grid.
router.get('/comparison/:rfqId', (req, res) => {
  const rfq = store.find('rfqs', req.params.rfqId)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const quotes = store.all('quotes').filter((q) => q.rfqId === rfq.id)
  const sup = quotes.map((q) => ({ id: q.supplierId, name: q.supplierName, lines: Object.fromEntries(q.lines.map((l) => [l.lineId, l])) }))

  const rows = rfq.lines.map((line, i) => {
    const row = { 'S.No': i + 1, 'Item': line.name, 'Requirement': [line.spec, line.description].filter(Boolean).join(' — '), 'Qty': line.qty }
    let bestRate = Infinity, bestRateSup = '', bestQ = -1, bestQSup = ''
    for (const s of sup) {
      const l = s.lines[line.lineId]
      const rate = l ? Number(l.rate) || 0 : 0
      const total = rate * (Number(line.qty) || 0)
      row[`${s.name} Rate`] = rate || ''
      row[`${s.name} Total`] = total || ''
      row[`ETA ${s.name}`] = l?.eta || ''
      row[`Quality ${s.name}`] = l?.qualityScore ?? ''
      row[`Notes ${s.name}`] = l?.specNotes || l?.remark || ''
      if (rate > 0 && rate < bestRate) { bestRate = rate; bestRateSup = s.name }
      if (rate > 0 && l?.qualityScore != null && l.qualityScore > bestQ) { bestQ = l.qualityScore; bestQSup = s.name }
    }
    row['Lower Price'] = bestRateSup
    row['Quality Winner'] = bestQSup
    return row
  })

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Item: '' }])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Comparison')
  sendWorkbook(res, wb, `${rfq.id}-Comparison.xlsx`)
})

export default router
