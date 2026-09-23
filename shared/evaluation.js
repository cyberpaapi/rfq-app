// A missing/zero price means "not quoted" in document imports.
export const isPriced = (line) => !!line && Number.isFinite(Number(line.rate)) && Number(line.rate) > 0

export function quoteCoverage(lines, quote) {
  const priced = lines.filter((line) => isPriced(quote?.lines?.find((q) => q.lineId === line.lineId)))
  return { count: priced.length, complete: lines.length > 0 && priced.length === lines.length,
    total: priced.reduce((sum, line) => sum + Number(quote.lines.find((q) => q.lineId === line.lineId).rate) * Number(line.qty), 0) }
}

export function scoreCandidates(candidates, weights, suppliers = {}) {
  if (!candidates.length) return []
  const minRate = Math.min(...candidates.map((c) => c.rate))
  const dates = candidates.map((c) => Date.parse(c.eta)).filter(Number.isFinite)
  const minDate = Math.min(...dates), maxDate = Math.max(...dates)
  const total = Number(weights.price) + Number(weights.quality) + Number(weights.delivery)
  return candidates.map((c) => {
    const history = suppliers[c.sid]?.scores || {}
    const date = Date.parse(c.eta)
    const price = minRate / c.rate * 100
    const quality = Number(c.quality ?? history.quality ?? 60)
    const delivery = Number.isFinite(date) ? (minDate === maxDate ? 100 : (maxDate - date) / (maxDate - minDate) * 100) : Number(history.delivery ?? 60)
    return { ...c, price, quality, delivery, score: total > 0 ? (price * weights.price + quality * weights.quality + delivery * weights.delivery) / total : 0 }
  }).sort((a, b) => b.score - a.score || a.rate - b.rate || a.sid.localeCompare(b.sid))
}

export function validateAward(rfq, quotes, suppliers, body) {
  if (rfq.award || ['Awarded', 'Closed', 'Cancelled'].includes(rfq.status)) throw new Error('This RFQ is already finalized.')
  const { type = 'full', supplierId, awards = [] } = body
  if (!['full', 'split', 'reject'].includes(type)) throw new Error('Invalid award type.')
  if (type === 'reject') return { type, reason: body.reason || '', at: Date.now() }
  if (!rfq.lines.length) throw new Error('Add RFQ items before awarding.')
  const groups = type === 'full' ? [{ supplierId, lineIds: rfq.lines.map((l) => l.lineId) }] : awards
  if (!Array.isArray(groups) || !groups.length) throw new Error('Select suppliers for every RFQ item.')
  const seen = new Set(), supplierIds = new Set()
  const splits = groups.map((group) => {
    const supplier = suppliers.find((s) => s.id === group.supplierId)
    if (!supplier || supplier.qualified === false) throw new Error('Select a qualified supplier.')
    if (supplierIds.has(supplier.id)) throw new Error('Duplicate supplier in split award.')
    supplierIds.add(supplier.id)
    if (!Array.isArray(group.lineIds) || !group.lineIds.length) throw new Error('Each supplier must have at least one item.')
    const quote = quotes.find((q) => q.supplierId === supplier.id)
    let amount = 0
    for (const id of group.lineIds) {
      const line = rfq.lines.find((l) => l.lineId === id)
      if (!line || seen.has(id)) throw new Error('Award contains duplicate or unknown RFQ items.')
      const ql = quote?.lines.find((l) => l.lineId === id)
      if (!isPriced(ql)) throw new Error(`Supplier ${supplier.name} has no valid price for ${line.name}.`)
      if (!Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0) throw new Error('Item quantities must be positive.')
      seen.add(id)
      amount += Number(ql.rate) * Number(line.qty)
    }
    return { supplierId: supplier.id, supplierName: supplier.name, lineIds: group.lineIds, amount: Math.round(amount * 100) / 100 }
  })
  if (seen.size !== rfq.lines.length) throw new Error('Select a priced supplier for every RFQ item before awarding.')
  const amount = Math.round(splits.reduce((sum, s) => sum + s.amount, 0) * 100) / 100
  return type === 'full' ? { type, supplierId: splits[0].supplierId, supplierName: splits[0].supplierName, amount, at: Date.now() }
    : { type, splits, amount, at: Date.now() }
}
