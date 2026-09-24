import { useEffect, useState } from 'react'
import { Store, UploadCloud, Loader2, PackageCheck, MessageSquare, Send, CheckCircle2, AlertCircle } from 'lucide-react'
import { Rfqs, Suppliers } from '../api/client'
import { Card, Spinner, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import QuoteEditor from '../components/QuoteEditor'
import { isPriced } from '../../shared/evaluation'

export default function Portal() {
  const { can, current } = useAuth()
  const internalResponder = can('supplier.response.edit') && can('workspace.view')
  const [suppliers, setSuppliers] = useState(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [rfqs, setRfqs] = useState([])
  const [rfqId, setRfqId] = useState('')
  const [rfq, setRfq] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [clarifyMsg, setClarifyMsg] = useState('')
  const [clarifySent, setClarifySent] = useState(false)
  const assignedSuppliers = (rfq?.assignments || []).map((assignment) => suppliers?.find((item) => item.id === assignment.supplierId)).filter(Boolean)
  const supplierId = internalResponder ? assignedSuppliers.some((item) => item.id === selectedSupplierId) ? selectedSupplierId : '' : current.supplierId || ''

  useEffect(() => { Suppliers.list().then(setSuppliers).catch((e) => { setError(e.message); setSuppliers([]) }) }, [])

  const supplier = suppliers?.find((s) => s.id === supplierId)

  // Internal response editors see every RFQ; supplier accounts see only theirs.
  useEffect(() => {
    if (!internalResponder && !current.supplierId) { setRfqs([]); setRfqId(''); setRfq(null); return }
    Rfqs.list().then((all) => {
      const mine = internalResponder ? all : all.filter((r) => r.assignments?.some((a) => a.supplierId === current.supplierId))
      setRfqs(mine)
      setRfqId((previous) => mine.some((r) => r.id === previous) ? previous : mine[0]?.id || '')
    }).catch((e) => setError(e.message))
  }, [internalResponder, current.supplierId])

  useEffect(() => {
    setResult(null); setError(null); setClarifySent(false)
    if (!rfqId) { setRfq(null); return }
    Rfqs.get(rfqId).then(setRfq).catch((e) => setError(e.message))
  }, [rfqId])

  useEffect(() => {
    if (internalResponder && rfq) setSelectedSupplierId((previous) => rfq.assignments?.some((a) => a.supplierId === previous) ? previous : rfq.assignments?.[0]?.supplierId || '')
  }, [internalResponder, rfq?.id, rfq?.assignments])

  const myLines = rfq?.lines || []
  const alreadyQuoted = rfq?.quotes?.some((q) => q.supplierId === supplierId && q.lines?.some(isPriced))

  const upload = async (file) => {
    if (!file || !supplierId) return
    setUploading(true); setError(null); setResult(null)
    try {
      const res = await Rfqs.quoteUpload(rfqId, file, supplierId)
      setResult(res)
      Rfqs.get(rfqId).then(setRfq)
    } catch (e) { setError(e.message) } finally { setUploading(false) }
  }

  const sendClarification = async () => {
    if (!clarifyMsg.trim()) return
    await Rfqs.clarify(rfqId, { from: supplier?.name || 'Supplier', supplierId, message: clarifyMsg })
    setClarifyMsg(''); setClarifySent(true)
  }

  if (suppliers === null) return <Card><Spinner /></Card>

  if (!internalResponder && (!supplierId || !supplier)) return <Card className="p-8"><Empty icon="portal" title="No supplier linked" hint="Ask Administrator to link this login to a supplier profile in Accounts & Access." /></Card>

  // ---- Signed-in -------------------------------------------------------------
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white">
        <div>
          <div className="flex items-center gap-2 text-brand-100"><Store size={18} /> {internalResponder ? 'Supplier response entry' : 'Supplier Portal'}</div>
          <h1 className="mt-1 text-2xl font-extrabold">{internalResponder ? 'Enter a supplier response' : `Welcome, ${supplier.name}`}</h1>
          <p className="mt-1 text-sm text-brand-100">{internalResponder ? 'Choose an RFQ and one of its selected suppliers, then enter item prices or upload their quote.' : 'Quote individual RFQ items or upload a quotation document.'}</p>
        </div>
      </div>

      <Card className="p-4">
        <label className="label">{internalResponder ? 'RFQ' : 'Assigned RFQ'}</label>
        {rfqs.length === 0 ? (
          <p className="py-2 text-sm text-ink-400">{internalResponder ? 'No RFQs available yet.' : 'No RFQs assigned to you yet.'}</p>
        ) : (
          <select value={rfqId} onChange={(e) => { setRfq(null); setSelectedSupplierId(''); setRfqId(e.target.value) }} className="input">
            {rfqs.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.title}</option>)}
          </select>
        )}
      </Card>

      {!rfq ? (
        rfqs.length > 0 ? <Card><Spinner /></Card> : <Card className="p-6"><Empty icon="rfq" title={internalResponder ? 'No RFQs' : 'Nothing assigned'} hint={internalResponder ? 'Create an RFQ to enter supplier responses.' : "The buyer hasn't assigned an RFQ to you yet."} /></Card>
      ) : (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-bold text-ink-900">{rfq.title} <span className="text-sm font-normal text-ink-400">· {myLines.length} RFQ items</span></h2>{rfq.description && <p className="mt-1 text-sm text-ink-600">{rfq.description}</p>}{rfq.deadline && <p className="mt-1 text-xs text-ink-500">Response deadline: {rfq.deadline}</p>}</div>
            <label className={`btn-primary cursor-pointer ${uploading || !supplierId || !(can('quote.submit') || internalResponder) || !can('ai.use') ? 'pointer-events-none opacity-70' : ''}`}>
              {uploading ? <><Loader2 size={16} className="animate-spin" /> Reading document…</> : <><UploadCloud size={16} /> {alreadyQuoted ? 'Re-upload quote' : 'Upload quote document'}</>}
              <input type="file" hidden disabled={!supplierId || !(can('quote.submit') || internalResponder) || !can('ai.use')} accept=".xlsx,.xls,.csv,.txt,.pdf,.png,.jpg,.jpeg" onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
            </label>
          </div>

          {internalResponder && <label className="mb-4 block max-w-md"><span className="label">Respond on behalf of supplier</span><select className="input" value={supplierId} onChange={(e) => { setSelectedSupplierId(e.target.value); setResult(null) }} disabled={!assignedSuppliers.length}><option value="">Select supplier</option>{assignedSuppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="mt-1 block text-xs text-ink-500">{assignedSuppliers.length ? 'Only suppliers selected for this RFQ are shown.' : 'No suppliers selected for this RFQ. Assign a supplier before entering a response.'}</span></label>}

          {error && <div className="mb-3 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}</div>}
          <p className="mb-3 text-xs text-ink-400">Up to 50 MB per file. Hosted originals are available for 15 days; extracted quote data stays saved.</p>

          {/* The full RFQ remains visible even when a supplier quotes only a few items. */}
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-left text-xs font-bold uppercase tracking-wide text-ink-600">
                  <th className="px-3 py-2.5">Item</th>
                  <th className="px-3 py-2.5">Specification</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5">Unit</th>
                  {result && <th className="px-3 py-2.5 text-right">Your Rate</th>}
                  {result && <th className="px-3 py-2.5">Status</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {myLines.map((l) => {
                  const q = result?.quote?.lines.find((x) => x.lineId === l.lineId)
                  const matched = q && Number(q.rate) > 0
                  return (
                    <tr key={l.lineId} className="align-top">
                      <td className="px-3 py-2 font-semibold text-ink-800">{l.name}</td>
                      <td className="px-3 py-2 text-ink-600"><span>{[l.spec, l.description, l.secondaryRequirements, [l.brand, l.model, l.partNo].filter(Boolean).join(' / '), l.requiredDeliveryDate ? `Required delivery: ${l.requiredDeliveryDate}` : ''].filter(Boolean).join(' · ') || '—'}</span></td>
                      <td className="px-3 py-2 text-right text-ink-700">{l.qty}</td>
                      <td className="px-3 py-2 text-ink-600">{l.uom}</td>
                      {result && <td className="px-3 py-2 text-right font-semibold text-ink-800">{q && Number(q.rate) ? Number(q.rate).toFixed(2) : '—'}</td>}
                      {result && <td className="px-3 py-2">{matched ? <span className="chip bg-emerald-50 text-emerald-700">matched</span> : <span className="chip bg-amber-50 text-amber-700">not found</span>}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {(can('quote.submit') || internalResponder) && <div className="mt-5 border-t border-ink-100 pt-5"><h3 className="mb-3 font-bold text-ink-900">Quote individual items</h3>{!supplierId ? <p className="text-sm text-ink-500">Select a supplier to enter item prices.</p> : <QuoteEditor rfq={rfq} supplierId={supplierId} disabled={['Awarded', 'Closed', 'Cancelled'].includes(rfq.status) || !!rfq.award} onSaved={async () => setRfq(await Rfqs.get(rfqId))} />}</div>}

          {result && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                <PackageCheck size={18} className="shrink-0" />
                <span>Quote submitted from <b>{result.quote.source}</b> — matched <b>{result.matched}/{result.total}</b> line items{result.unmatched?.length ? `; couldn't match: ${result.unmatched.join(', ')}` : ''}. The buyer has been notified.</span>
              </div>
              {(result.usedUsdColumn || (result.currency && result.currency !== 'USD')) && (
                <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-700">
                  💱 {result.usedUsdColumn
                    ? 'Document showed both currencies — the USD prices were used directly.'
                    : `Prices were in ${result.currency} and converted to USD at ${result.rate} per ${result.currency} (${result.rateSource}).`}
                </p>
              )}
            </div>
          )}
          {!result && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-400"><CheckCircle2 size={13} /> Quantities are fixed by the buyer — your document is matched to these items by name + quantity (any order is fine).</p>
          )}
        </Card>
      )}

      {/* Clarification thread */}
      {!internalResponder && rfq && (
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold text-ink-900"><MessageSquare size={16} className="text-brand-500" /> Ask a Clarification</h3>
          {rfq.clarifications?.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {rfq.clarifications.map((c) => (
                <div key={c.id} className="rounded-lg bg-ink-50 px-3 py-2 text-xs"><b className="text-ink-700">{c.from}:</b> <span className="text-ink-600">{c.message}</span></div>
              ))}
            </div>
          )}
          {clarifySent ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Clarification sent — the buyer has been notified.</p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={clarifyMsg} onChange={(e) => setClarifyMsg(e.target.value)} className="input flex-1 text-sm" placeholder="e.g. Is Triac dimming acceptable for the wall light?" />
              <button className="btn-outline" disabled={!can('quote.submit') || !clarifyMsg.trim()} onClick={sendClarification}><Send size={14} /> Send</button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
