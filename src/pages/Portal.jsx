import { useEffect, useState } from 'react'
import { Store, UploadCloud, Send, Loader2, FileText, PackageCheck } from 'lucide-react'
import { Rfqs, Suppliers, Ingest } from '../api/client'
import { Card, Avatar, Spinner, Empty } from '../components/ui'

export default function Portal() {
  const [suppliers, setSuppliers] = useState(null)
  const [supplierId, setSupplierId] = useState('')
  const [rfqs, setRfqs] = useState([])
  const [rfqId, setRfqId] = useState('')
  const [rfq, setRfq] = useState(null)
  const [lines, setLines] = useState([])
  const [meta, setMeta] = useState({ paymentTerms: '', notes: '' })
  const [parsing, setParsing] = useState(false)
  const [submitted, setSubmitted] = useState(null)

  useEffect(() => { Suppliers.list().then((s) => { setSuppliers(s); setSupplierId(s[0]?.id || '') }) }, [])

  // Load RFQs assigned to the chosen supplier.
  useEffect(() => {
    if (!supplierId) return
    Rfqs.list().then((all) => {
      const mine = all.filter((r) => r.assignments?.some((a) => a.supplierId === supplierId))
      setRfqs(mine)
      setRfqId(mine[0]?.id || '')
      if (!mine.length) { setRfq(null); setLines([]) }
    })
    setSubmitted(null)
  }, [supplierId])

  // Load the chosen RFQ's assigned lines.
  useEffect(() => {
    if (!rfqId) { setRfq(null); setLines([]); return }
    Rfqs.get(rfqId).then((r) => {
      setRfq(r)
      const mine = r.assignments.filter((a) => a.supplierId === supplierId).flatMap((a) => a.lineIds)
      const assignedLines = r.lines.filter((l) => mine.includes(l.lineId))
      setLines(assignedLines.map((l) => ({ ...l, rate: '', leadTime: '', warranty: '', remark: '' })))
    })
    setSubmitted(null)
  }, [rfqId, supplierId])

  const setLine = (lineId, k, v) => setLines((ls) => ls.map((l) => (l.lineId === lineId ? { ...l, [k]: v } : l)))

  const parseUpload = async (file) => {
    setParsing(true)
    try {
      const res = await Ingest(file)
      // Match parsed quantities/names back onto the assigned lines by name.
      setLines((ls) => ls.map((l) => {
        const hit = res.items.find((it) => it.name.toLowerCase() === l.name.toLowerCase())
        return hit ? { ...l, remark: l.remark || `from upload: ${hit.quantity} ${hit.uom}` } : l
      }))
    } finally {
      setParsing(false)
    }
  }

  const submit = async () => {
    const supplier = suppliers.find((s) => s.id === supplierId)
    const quote = await Rfqs.quote(rfqId, {
      supplierId,
      supplierName: supplier?.name,
      lines: lines.map((l) => ({ lineId: l.lineId, name: l.name, qty: l.qty, rate: l.rate, leadTime: l.leadTime, warranty: l.warranty, remark: l.remark })),
      paymentTerms: meta.paymentTerms,
      notes: meta.notes,
    })
    setSubmitted(quote)
  }

  const total = lines.reduce((a, l) => a + (Number(l.rate) || 0) * (Number(l.qty) || 0), 0)
  const supplier = suppliers?.find((s) => s.id === supplierId)

  if (suppliers === null) return <Card><Spinner /></Card>

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white">
        <div className="flex items-center gap-2 text-brand-100"><Store size={18} /> Supplier Portal</div>
        <h1 className="mt-1 text-2xl font-extrabold">Submit your quotation</h1>
        <p className="mt-1 text-sm text-brand-100">View the RFQs assigned to you, then quote by filling the form or uploading your quote document.</p>
      </div>

      {/* Identity + RFQ selectors */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <label className="label">Signed in as (supplier)</label>
          <div className="flex items-center gap-3">
            <Avatar name={supplier?.name || '?'} />
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="input">
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </Card>
        <Card className="p-4">
          <label className="label">Assigned RFQ</label>
          {rfqs.length === 0 ? (
            <p className="py-2 text-sm text-ink-400">No RFQs assigned to this supplier yet.</p>
          ) : (
            <select value={rfqId} onChange={(e) => setRfqId(e.target.value)} className="input">
              {rfqs.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.title}</option>)}
            </select>
          )}
        </Card>
      </div>

      {submitted ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><PackageCheck size={28} /></div>
          <p className="text-lg font-bold text-ink-900">Quotation submitted</p>
          <p className="mt-1 text-sm text-ink-500">Ref {submitted.id} · {submitted.lines.length} lines · the buyer has been notified.</p>
          <button className="btn-outline mt-4" onClick={() => setSubmitted(null)}>Submit another</button>
        </Card>
      ) : !rfq || lines.length === 0 ? (
        <Card className="p-6"><Empty icon={FileText} title="Nothing to quote" hint="Select a supplier and an assigned RFQ above." /></Card>
      ) : (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-ink-900">{rfq.title} <span className="text-sm font-normal text-ink-400">· {lines.length} items to quote</span></h2>
            <label className="btn-outline cursor-pointer">
              {parsing ? <><Loader2 size={16} className="animate-spin" /> Reading…</> : <><UploadCloud size={16} /> Upload quote doc</>}
              <input type="file" hidden accept=".xlsx,.xls,.csv,.txt,.pdf,.png,.jpg,.jpeg"
                onChange={(e) => e.target.files[0] && parseUpload(e.target.files[0])} />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2 pr-3">Rate</th>
                  <th className="py-2 pr-3">Lead time</th>
                  <th className="py-2 pr-3">Warranty</th>
                  <th className="py-2 text-right">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {lines.map((l) => (
                  <tr key={l.lineId}>
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-ink-800">{l.name}</p>
                      {l.remark && <p className="text-xs text-ink-400">{l.remark}</p>}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-ink-600">{l.qty} {l.uom}</td>
                    <td className="py-2.5 pr-3"><input type="number" min="0" step="0.01" value={l.rate} onChange={(e) => setLine(l.lineId, 'rate', e.target.value)} className="input w-24 py-1.5" placeholder="0.00" /></td>
                    <td className="py-2.5 pr-3"><input value={l.leadTime} onChange={(e) => setLine(l.lineId, 'leadTime', e.target.value)} className="input w-28 py-1.5" placeholder="e.g. 14 days" /></td>
                    <td className="py-2.5 pr-3"><input value={l.warranty} onChange={(e) => setLine(l.lineId, 'warranty', e.target.value)} className="input w-28 py-1.5" placeholder="e.g. 2 yrs" /></td>
                    <td className="py-2.5 text-right font-semibold text-ink-800">{((Number(l.rate) || 0) * (Number(l.qty) || 0)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><label className="label">Payment terms</label><input value={meta.paymentTerms} onChange={(e) => setMeta((m) => ({ ...m, paymentTerms: e.target.value }))} className="input" placeholder="e.g. 30 days net" /></div>
            <div><label className="label">Remarks</label><input value={meta.notes} onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))} className="input" placeholder="Anything the buyer should know" /></div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
            <div>
              <p className="text-xs text-ink-400">Quote total</p>
              <p className="text-xl font-extrabold text-ink-900">{total.toFixed(2)}</p>
            </div>
            <button className="btn-primary" onClick={submit}><Send size={16} /> Submit quotation</button>
          </div>
        </Card>
      )}
    </div>
  )
}
