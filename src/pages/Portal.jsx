import { useEffect, useState } from 'react'
import { Store, UploadCloud, Loader2, FileText, PackageCheck, LogOut, MessageSquare, Send, CheckCircle2, AlertCircle } from 'lucide-react'
import { Rfqs, Suppliers } from '../api/client'
import { Card, Avatar, Spinner, Empty } from '../components/ui'

const SESSION_KEY = 'rfq.supplierSession'

export default function Portal() {
  const [suppliers, setSuppliers] = useState(null)
  const [supplierId, setSupplierId] = useState(() => localStorage.getItem(SESSION_KEY) || '')
  const [rfqs, setRfqs] = useState([])
  const [rfqId, setRfqId] = useState('')
  const [rfq, setRfq] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [clarifyMsg, setClarifyMsg] = useState('')
  const [clarifySent, setClarifySent] = useState(false)

  useEffect(() => { Suppliers.list().then(setSuppliers) }, [])

  // The 3 demo sign-in profiles (Supplier 1/2/3) — no password.
  const profiles = (suppliers || []).filter((s) => /^supplier\s*\d/i.test(s.name))
  const supplier = suppliers?.find((s) => s.id === supplierId)

  // Load RFQs assigned to the signed-in supplier.
  useEffect(() => {
    if (!supplierId) { setRfqs([]); setRfqId(''); setRfq(null); return }
    Rfqs.list().then((all) => {
      const mine = all.filter((r) => r.assignments?.some((a) => a.supplierId === supplierId))
      setRfqs(mine)
      setRfqId(mine[0]?.id || '')
    })
  }, [supplierId])

  useEffect(() => {
    setResult(null); setError(null); setClarifySent(false)
    if (!rfqId) { setRfq(null); return }
    Rfqs.get(rfqId).then(setRfq)
  }, [rfqId])

  const signIn = (id) => { localStorage.setItem(SESSION_KEY, id); setSupplierId(id) }
  const signOut = () => { localStorage.removeItem(SESSION_KEY); setSupplierId(''); setRfq(null) }

  const myLines = rfq ? (() => {
    const mine = rfq.assignments.filter((a) => a.supplierId === supplierId).flatMap((a) => a.lineIds)
    return rfq.lines.filter((l) => mine.includes(l.lineId))
  })() : []
  const alreadyQuoted = rfq?.quotes?.some((q) => q.supplierId === supplierId)

  const upload = async (file) => {
    if (!file) return
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

  // ---- Sign-in screen --------------------------------------------------------
  if (!supplierId || !supplier) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white">
          <div className="flex items-center gap-2 text-brand-100"><Store size={18} /> Supplier Portal</div>
          <h1 className="mt-1 text-2xl font-extrabold">Sign in</h1>
          <p className="mt-1 text-sm text-brand-100">Choose your supplier profile to continue. (Demo — no password.)</p>
        </div>
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold text-ink-700">Sign in as</p>
          <div className="space-y-2">
            {profiles.map((s) => (
              <button key={s.id} onClick={() => signIn(s.id)} className="flex w-full items-center gap-3 rounded-xl border border-ink-100 p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/50">
                <Avatar name={s.name} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-800">{s.name}</p>
                  <p className="text-xs text-ink-400">{s.category} · {s.email}</p>
                </div>
                <Send size={16} className="text-brand-500" />
              </button>
            ))}
            {profiles.length === 0 && <Empty icon={Store} title="No supplier profiles" hint="Reset the demo data to seed Supplier 1/2/3." />}
          </div>
        </Card>
      </div>
    )
  }

  // ---- Signed-in -------------------------------------------------------------
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white">
        <div>
          <div className="flex items-center gap-2 text-brand-100"><Store size={18} /> Supplier Portal</div>
          <h1 className="mt-1 text-2xl font-extrabold">Welcome, {supplier.name}</h1>
          <p className="mt-1 text-sm text-brand-100">Upload your quotation document for the RFQs assigned to you.</p>
        </div>
        <button onClick={signOut} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold backdrop-blur hover:bg-white/25"><LogOut size={15} /> Sign out</button>
      </div>

      <Card className="p-4">
        <label className="label">Assigned RFQ</label>
        {rfqs.length === 0 ? (
          <p className="py-2 text-sm text-ink-400">No RFQs assigned to you yet.</p>
        ) : (
          <select value={rfqId} onChange={(e) => setRfqId(e.target.value)} className="input">
            {rfqs.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.title}</option>)}
          </select>
        )}
      </Card>

      {!rfq ? (
        rfqs.length > 0 ? <Card><Spinner /></Card> : <Card className="p-6"><Empty icon={FileText} title="Nothing assigned" hint="The buyer hasn't assigned an RFQ to you yet." /></Card>
      ) : (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-ink-900">{rfq.title} <span className="text-sm font-normal text-ink-400">· {myLines.length} items to quote</span></h2>
            <label className={`btn-primary cursor-pointer ${uploading ? 'pointer-events-none opacity-70' : ''}`}>
              {uploading ? <><Loader2 size={16} className="animate-spin" /> Reading document…</> : <><UploadCloud size={16} /> {alreadyQuoted ? 'Re-upload quote' : 'Upload quote document'}</>}
              <input type="file" hidden accept=".xlsx,.xls,.csv,.txt,.pdf,.png,.jpg,.jpeg" onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
            </label>
          </div>

          {error && <div className="mb-3 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}</div>}

          {/* The items the supplier must quote (read-only) */}
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
                      <td className="px-3 py-2 text-ink-600"><span className="line-clamp-2">{[l.spec, l.description].filter(Boolean).join(' · ') || '—'}</span></td>
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

          {result && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
              <PackageCheck size={18} className="shrink-0" />
              <span>Quote submitted from <b>{result.quote.source}</b> — matched <b>{result.matched}/{result.total}</b> line items{result.unmatched?.length ? `; couldn't match: ${result.unmatched.join(', ')}` : ''}. The buyer has been notified.</span>
            </div>
          )}
          {!result && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-400"><CheckCircle2 size={13} /> Quantities are fixed by the buyer — your document is matched to these items by name + quantity (any order is fine).</p>
          )}
        </Card>
      )}

      {/* Clarification thread */}
      {rfq && (
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
              <button className="btn-outline" disabled={!clarifyMsg.trim()} onClick={sendClarification}><Send size={14} /> Send</button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
