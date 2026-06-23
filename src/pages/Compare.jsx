import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { GitCompareArrows, Download, Info, FileSpreadsheet } from 'lucide-react'
import { rfqs, supplierById, fmt } from '../data/mock'
import { Card, SectionTitle } from '../components/ui'

// Build comparison rows from an RFQ that has quotes from >= 2 suppliers.
function buildComparison(rfq) {
  const supIds = rfq.invited.filter((id) => rfq.quotes[id])
  const rows = rfq.items.map((it) => {
    const cells = supIds.map((sid) => {
      const q = rfq.quotes[sid]
      const rate = q.lines[it.sno]
      return { sid, rate, total: rate * it.qty, note: q.notes[it.sno] }
    })
    const valid = cells.filter((c) => c.rate != null)
    const min = Math.min(...valid.map((c) => c.total))
    const winner = valid.find((c) => c.total === min)
    return { it, cells, winnerSid: winner?.sid }
  })
  return { supIds, rows }
}

export default function Compare() {
  const candidates = rfqs.filter((r) => Object.keys(r.quotes).length >= 2)
  const [rfqId, setRfqId] = useState(candidates[0]?.id)
  const rfq = rfqs.find((r) => r.id === rfqId)
  const [oproStock, setOproStock] = useState({})

  if (!rfq) {
    return (
      <Card className="p-10 text-center">
        <GitCompareArrows className="mx-auto mb-3 text-ink-300" size={32} />
        <p className="font-semibold text-ink-700">No comparable RFQs yet</p>
        <p className="text-sm text-ink-400">Comparison needs at least two supplier responses.</p>
      </Card>
    )
  }

  const { supIds, rows } = buildComparison(rfq)
  const totalsBySupplier = supIds.map((sid) => ({
    sid,
    total: rows.reduce((a, r) => {
      const c = r.cells.find((x) => x.sid === sid)
      return a + (c?.total || 0)
    }, 0),
  }))
  const bestTotal = Math.min(...totalsBySupplier.map((t) => t.total))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Quote Comparison</h1>
          <p className="mt-1 text-sm text-ink-500">Side-by-side item analysis with spec compliance flags.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={rfqId} onChange={(e) => setRfqId(e.target.value)} className="input w-auto py-2">
            {candidates.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.title}</option>)}
          </select>
          <button className="btn-outline"><FileSpreadsheet size={16} /> Export to Zoho PO</button>
          <button className="btn-primary"><Download size={16} /> Report</button>
        </div>
      </div>

      {/* Legend */}
      <Card className="flex flex-wrap items-center gap-4 p-4 text-sm">
        <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-emerald-100 ring-1 ring-emerald-300" /> Lower price / compliant</span>
        <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-amber-100 ring-1 ring-amber-300" /> Higher price</span>
        <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-blue-100 ring-1 ring-blue-300" /> Spec note flagged</span>
        <Link to={`/rfqs/${rfq.id}`} className="ml-auto text-sm font-semibold text-brand-600 hover:text-brand-700">Open RFQ →</Link>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">S.No</th>
                <th className="px-4 py-3">Item Description</th>
                <th className="px-4 py-3 text-right">Qty</th>
                {supIds.map((sid) => (
                  <th key={sid} className="px-4 py-3 text-right" colSpan={2}>
                    {supplierById(sid)?.name}
                  </th>
                ))}
                <th className="px-4 py-3">Lower Price</th>
                <th className="px-4 py-3">Spec Notes</th>
                <th className="px-4 py-3 text-right">OPRO Stock</th>
              </tr>
              <tr className="border-b border-ink-100 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <th colSpan={3}></th>
                {supIds.map((sid) => (
                  <Fragment key={sid}>
                    <th className="px-4 py-2 text-right">Rate</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </Fragment>
                ))}
                <th colSpan={3}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {rows.map((row) => (
                <tr key={row.it.sno} className="align-top">
                  <td className="px-4 py-3 text-ink-400">{row.it.sno}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink-800">{row.it.name}</p>
                    <p className="text-xs text-ink-400">{row.it.desc}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-600">{row.it.qty}</td>
                  {supIds.map((sid) => {
                    const c = row.cells.find((x) => x.sid === sid)
                    const isWinner = row.winnerSid === sid
                    const hasNote = !!c?.note
                    const cellBg = isWinner ? 'bg-emerald-50' : 'bg-amber-50'
                    return (
                      <Fragment key={sid}>
                        <td className={`px-4 py-3 text-right ${cellBg} ${hasNote ? 'border-l-2 border-blue-300' : ''}`}>
                          {c?.rate != null ? fmt(c.rate) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${cellBg} ${isWinner ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {c?.total != null ? fmt(c.total) : '—'}
                        </td>
                      </Fragment>
                    )
                  })}
                  <td className="px-4 py-3">
                    <span className="chip bg-emerald-50 text-emerald-700">{supplierById(row.winnerSid)?.name?.split(' ')[0]}</span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {row.cells.some((c) => c.note) ? (
                      <div className="space-y-1">
                        {row.cells.filter((c) => c.note).map((c) => (
                          <p key={c.sid} className="flex items-start gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">
                            <Info size={12} className="mt-0.5 shrink-0" />
                            <span><b>{supplierById(c.sid)?.name?.split(' ')[0]}:</b> {c.note}</span>
                          </p>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-400">Compliant</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number" min={0} placeholder="0"
                      value={oproStock[row.it.sno] ?? ''}
                      onChange={(e) => setOproStock((s) => ({ ...s, [row.it.sno]: e.target.value }))}
                      className="input w-20 py-1.5 text-right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink-100 bg-ink-50/60 font-bold">
                <td className="px-4 py-3" colSpan={3}>Grand Total</td>
                {totalsBySupplier.map((t) => (
                  <td key={t.sid} className={`px-4 py-3 text-right ${t.total === bestTotal ? 'text-emerald-700' : 'text-ink-700'}`} colSpan={2}>
                    {fmt(t.total)}
                  </td>
                ))}
                <td className="px-4 py-3 text-emerald-700" colSpan={3}>
                  Best: {supplierById(totalsBySupplier.find((t) => t.total === bestTotal)?.sid)?.name}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <p className="text-xs text-ink-400">
        Tip: enter required quantities under <b>OPRO Stock</b> to generate the costing sheet (With / Without OPRO Stock) for Finance approval.
      </p>
    </div>
  )
}
