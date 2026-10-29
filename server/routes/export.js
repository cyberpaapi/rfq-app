import { Router } from 'express'
import * as XLSX from 'xlsx'
import * as store from '../store.js'
import { assignedRfqLines } from '../../shared/assignments.js'

import { isPriced, quoteComparisonTotals } from '../../shared/evaluation.js'

const router = Router()

// For each RFQ line decide which supplier "won" it and at what rate.
// Award-aware: full award -> that supplier; split -> per-line supplier; else cheapest quote.
function resolveWinners(rfq, quotes) {
  const rateOf = (supplierId, quoteId, lineId) => {
    const q = quoteId ? quotes.find((x) => x.id === quoteId && x.supplierId === supplierId) : quotes.find((x) => x.supplierId === supplierId)
    const ql = q?.lines.find((l) => l.lineId === lineId)
    return ql ? Number(ql.rate) || 0 : null
  }

  return rfq.lines.map((line) => {
    let supplierId = null, quoteId = null
    if (rfq.award?.type === 'full') {
      supplierId = rfq.award.supplierId
      quoteId = rfq.award.quoteId
    } else if (rfq.award?.type === 'split') {
      const split = rfq.award.splits?.find((s) => s.lineIds?.includes(line.lineId))
      supplierId = split?.supplierId || null
      quoteId = split?.quoteId || null
    }
    // Fallback / no award: cheapest quote for this line.
    if (!supplierId && !rfq.award) {
      let best = null
      for (const q of quotes) {
        const ql = q.lines.find((l) => l.lineId === line.lineId)
        if (isPriced(ql) && (best === null || Number(ql.rate) < best.rate)) best = { supplierId: q.supplierId, quoteId: q.id, rate: Number(ql.rate) || 0 }
      }
      supplierId = best?.supplierId || null
      quoteId = best?.quoteId || null
    }
    const supplier = supplierId ? store.find('suppliers', supplierId) : null
    const rate = supplierId ? rateOf(supplierId, quoteId, line.lineId) || 0 : 0
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
  const winners = resolveWinners(rfq, quotes).filter((winner) => !rfq.award || !!winner.supplierId)

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

// GET /api/export/costing/:rfqId
// Two sheets: Without OPRO Stock and With OPRO Stock (net of available stock).
router.get('/costing/:rfqId', (req, res) => {
  const rfq = store.find('rfqs', req.params.rfqId)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const quotes = store.all('quotes').filter((q) => q.rfqId === rfq.id)
  const winners = resolveWinners(rfq, quotes)

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
    const onHand = Number(line.oproStock) || 0
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

// GET /api/export/rfq-items/:rfqId — fixed RFQ template for suppliers to fill in.
const rfqItemHeaders = [
  'S.No', 'Quote', 'Item Name', 'Specification', 'Description', 'Secondary Requirements',
  'Brand', 'Model No', 'Part No', 'Quantity', 'Unit', 'RFQ Photo', 'Remark',
  'Required Delivery Date', 'Offered Item Name', 'Offered Description', 'Offered Brand',
  'Offered Model No', 'Offered Part No', 'Supplier Photo', 'Unit Price',
  'Ready to Send Date', 'Delivery Lead Time', 'ETA', 'Payment Terms', 'Warranty',
  'Supplier Remarks', 'Attachments',
]
router.get('/rfq-items/:rfqId', (req, res) => {
  const rfq = store.find('rfqs', req.params.rfqId)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const visibleLines = req.supplierId ? assignedRfqLines(rfq, req.supplierId) : rfq.lines
  const rows = visibleLines.map((l, i) => ({
    'S.No': i + 1,
    'Quote': '',
    'Item Name': l.name,
    'Specification': l.spec || '',
    'Description': l.description || '',
    'Secondary Requirements': l.secondaryRequirements || '',
    'Brand': l.brand || '',
    'Model No': l.model || '',
    'Part No': l.partNo || '',
    'Quantity': l.qty,
    'Unit': l.uom,
    'RFQ Photo': l.photo ? 'Available in RFQ portal' : '',
    'Remark': l.remark || '',
    'Required Delivery Date': l.requiredDeliveryDate || '',
    'Offered Item Name': '',
    'Offered Description': '',
    'Offered Brand': '',
    'Offered Model No': '',
    'Offered Part No': '',
    'Supplier Photo': '',
    'Unit Price': '',
    'Ready to Send Date': '',
    'Delivery Lead Time': '',
    'ETA': '',
    'Payment Terms': '',
    'Warranty': '',
    'Supplier Remarks': '',
    'Attachments': '',
  }))
  const ws = XLSX.utils.aoa_to_sheet([rfqItemHeaders, ...rows.map((row) => rfqItemHeaders.map((key) => row[key]))])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'RFQ Items')
  sendWorkbook(res, wb, `${rfq.id}-RFQ.xlsx`)
})

// GET /api/export/comparison/:rfqId — the full side-by-side comparison grid.
router.get('/comparison/:rfqId', (req, res) => {
  const rfq = store.find('rfqs', req.params.rfqId)
  if (!rfq) return res.status(404).json({ error: 'rfq not found' })
  const quotes = store.all('quotes').filter((q) => q.rfqId === rfq.id)
  const sup = quotes.map((q) => ({ id: q.id, name: `${q.supplierName}-Q${q.optionNumber || 1}`, lines: Object.fromEntries(q.lines.map((l) => [l.lineId, l])), totals: quoteComparisonTotals(rfq.lines, q) }))

  const rows = rfq.lines.map((line, i) => {
    const row = { 'S.No': i + 1, 'Item': line.name, 'Requirement': [line.spec, line.description].filter(Boolean).join(' — '), 'Qty': line.qty }
    let bestRate = Infinity, bestRateSup = '', bestQ = -1, bestQSup = ''
    for (const s of sup) {
      const l = s.lines[line.lineId]
      const rate = l ? Number(l.rate) || 0 : 0
      const total = rate * (Number(line.qty) || 0)
      row[`${s.name} Rate`] = rate || ''
      row[`${s.name} Total`] = total || ''
      row[`Forecasted ETA ${s.name}`] = l?.eta || ''
      row[`Ready to Send ${s.name}`] = l?.readyToSendDate || ''
      row[`Quality ${s.name}`] = l?.qualityScore ?? ''
      row[`Notes ${s.name}`] = l?.specNotes || l?.remark || ''
      if (rate > 0 && rate < bestRate) { bestRate = rate; bestRateSup = s.name }
      if (rate > 0 && l?.qualityScore != null && l.qualityScore > bestQ) { bestQ = l.qualityScore; bestQSup = s.name }
    }
    row['Lower Price'] = bestRateSup
    row['Quality Winner'] = bestQSup
    return row
  })

  const summary = [['Total', 'total'], ['Duties', 'duties'], ['Freight Charges', 'freightCharges'], ['Grand Total', 'grandTotal']].map(([label, field]) => ({
    Item: label,
    ...Object.fromEntries(sup.map((supplier) => [`${supplier.name} Total`, supplier.totals[field]])),
  }))
  const ws = XLSX.utils.json_to_sheet([...(rows.length ? rows : [{ Item: '' }]), ...summary])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Comparison')
  sendWorkbook(res, wb, `${rfq.id}-Comparison.xlsx`)
})

export default router
