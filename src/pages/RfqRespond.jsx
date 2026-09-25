import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, UploadCloud, Loader2, FileText, PackageCheck, AlertCircle, Store } from 'lucide-react'
import { Rfqs } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { rfqCreationDate } from '../../shared/rfqDates'

// Generated response link inside the protected workspace. Supplier-only roles
// submit through the assigned supplier portal instead.
export default function RfqRespond() {
  const { can } = useAuth()
  const { id } = useParams()
  const [rfq, setRfq] = useState(undefined) // undefined = loading, null = not found
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { Rfqs.get(id).then(setRfq).catch(() => setRfq(null)) }, [id])

  const submit = async () => {
    if (!name.trim() || !file) return
    setBusy(true); setError(null)
    try { setResult(await Rfqs.respond(id, file, name.trim())) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (rfq === undefined) return <div className="grid min-h-screen place-items-center bg-ink-50 text-ink-400"><Loader2 className="animate-spin" /></div>
  if (rfq === null) return <div className="grid min-h-screen place-items-center bg-ink-50"><div className="rounded-2xl bg-white p-8 text-center shadow-card"><p className="font-bold text-ink-800">RFQ not found</p><p className="mt-1 text-sm text-ink-400">This link is invalid or the RFQ was removed.</p></div></div>

  return (
    <div className="min-h-screen bg-ink-50 px-4 py-10">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white">
          <div className="flex items-center gap-2 text-brand-100"><Store size={18} /> Request for Quotation</div>
          <h1 className="mt-1 text-2xl font-extrabold">{rfq.title}</h1>
          <p className="mt-1 text-sm text-brand-100">{rfq.id}{rfqCreationDate(rfq) ? ` · Created ${rfqCreationDate(rfq)}` : ''} · {rfq.lines.length} item{rfq.lines.length !== 1 ? 's' : ''} to quote{rfq.deadline ? ` · respond by ${rfq.deadline}` : ''}</p>
        </header>

        {result ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-card">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><PackageCheck size={28} /></div>
            <p className="text-lg font-bold text-ink-900">Response submitted</p>
            <p className="mt-1 text-sm text-ink-500">Thanks, <b>{name}</b> — matched <b>{result.matched}/{result.total}</b> line items{result.unmatched?.length ? `; couldn't match: ${result.unmatched.join(', ')}` : ''}.</p>
            {(result.usedUsdColumn || (result.currency && result.currency !== 'USD')) && (
              <p className="mx-auto mt-3 inline-block rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-700">💱 {result.usedUsdColumn ? 'Both currencies were present — USD prices were used.' : `Prices in ${result.currency} were converted to USD at ${result.rate} (${result.rateSource}).`}</p>
            )}
            <button className="btn-outline mt-5" onClick={() => { setResult(null); setFile(null) }}>Submit another document</button>
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl bg-white p-6 shadow-card">
            <div>
              <p className="text-sm font-semibold text-ink-700">1. Download the RFQ</p>
              <p className="mb-2 text-xs text-ink-400">Get the item list (with an empty Unit Price column to fill in).</p>
              {(can('workspace.view') || can('portal.access')) && <a href={Rfqs.exportRfqItemsUrl(id)} className="btn-outline"><Download size={16} /> Download RFQ (.xlsx)</a>}
            </div>

            <div className="border-t border-ink-100 pt-4">
              <label className="label">2. Your name <span className="text-rose-500">*</span></label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Company or contact name" />
            </div>

            <div className="border-t border-ink-100 pt-4">
              <p className="label">3. Upload your response document <span className="text-rose-500">*</span></p>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-ink-200 px-4 py-5 transition hover:bg-ink-50">
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${file ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-400'}`}><FileText size={20} /></div>
                <div className="min-w-0">
                  {file ? <p className="truncate font-semibold text-ink-800">{file.name}</p> : <p className="font-semibold text-ink-700">Click to choose a file</p>}
                  <p className="text-xs text-ink-400">.xlsx .csv .pdf .png .jpg — up to 50 MB. Prices auto-converted to USD. Hosted originals are retained for 15 days; extracted data stays saved.</p>
                </div>
                <input type="file" hidden accept=".xlsx,.xls,.csv,.txt,.pdf,.png,.jpg,.jpeg" onChange={(e) => e.target.files[0] && setFile(e.target.files[0])} />
              </label>
            </div>

            {error && <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}</div>}

            {!can('ai.use') && <p className="text-sm text-amber-700">This role cannot use AI document extraction.</p>}
            <button className="btn-primary w-full" disabled={busy || !can('ai.use') || !name.trim() || !file} onClick={submit}>
              {busy ? <><Loader2 size={16} className="animate-spin" /> Reading your document…</> : <><UploadCloud size={16} /> Submit response</>}
            </button>
          </div>
        )}
        <p className="text-center text-xs text-ink-400">Powered by OPRO</p>
      </div>
    </div>
  )
}
