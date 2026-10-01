import { isPriced } from '../../shared/evaluation'

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

export default function QuoteReviewTable({ rfq, supplierId }) {
  const quote = rfq.quotes?.find((entry) => entry.supplierId === supplierId)
  const quotedLines = new Map((quote?.lines || []).map((line) => [line.lineId, line]))
  const priced = rfq.lines.filter((line) => isPriced(quotedLines.get(line.lineId))).length

  return <section aria-label="Supplier quotation review">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div><h3 className="font-bold text-ink-900">Quoted items and prices</h3><p className="text-xs text-ink-500">{priced} of {rfq.lines.length} assigned items have a saved price. Prices shown in USD.</p></div>
      {quote?.source && <p className="text-xs text-ink-500">Latest file: {quote.source}</p>}
    </div>
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[1050px] text-sm">
        <thead><tr className="bg-ink-50 text-left text-xs font-bold uppercase tracking-wide text-ink-600">
          <th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5">RFQ details</th><th className="px-3 py-2.5 text-right">Qty</th><th className="px-3 py-2.5 text-right">Unit price (USD)</th><th className="px-3 py-2.5 text-right">Line total (USD)</th><th className="px-3 py-2.5">Ready to send</th><th className="px-3 py-2.5">Forecasted ETA / lead time</th><th className="px-3 py-2.5">Supplier description / note</th><th className="px-3 py-2.5">Status</th>
        </tr></thead>
        <tbody className="divide-y divide-ink-100">{rfq.lines.map((line) => {
          const offered = quotedLines.get(line.lineId)
          const hasPrice = isPriced(offered)
          return <tr key={line.lineId} className="align-top">
            <td className="px-3 py-2 font-semibold text-ink-800">{line.name}</td>
            <td className="px-3 py-2 text-ink-600">{[line.spec, line.description, line.secondaryRequirements, [line.brand, line.model, line.partNo].filter(Boolean).join(' / '), line.requiredDeliveryDate ? `Required delivery: ${line.requiredDeliveryDate}` : ''].filter(Boolean).join(' · ') || '—'}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">{line.qty} {line.uom}</td>
            <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{hasPrice ? money(Number(offered.rate)) : '—'}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">{hasPrice ? money(Number(offered.rate) * Number(line.qty || 0)) : '—'}</td>
            <td className="px-3 py-2 whitespace-nowrap">{offered?.readyToSendDate || '—'}</td>
            <td className="px-3 py-2">{[offered?.eta, offered?.leadTime].filter(Boolean).join(' · ') || '—'}</td>
            <td className="px-3 py-2 text-ink-600">{[offered?.description, offered?.remark].filter(Boolean).join(' · ') || '—'}</td>
            <td className="px-3 py-2">{hasPrice ? <span className="chip bg-emerald-50 text-emerald-700">Quoted</span> : <span className="chip bg-amber-50 text-amber-700">No price</span>}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </section>
}
