import { useEffect, useState } from 'react'
import { CheckCircle2, Download, FileUp, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { Rfqs } from '../api/client'
import { useAuth } from '../context/AuthContext'
import QuoteEditor from '../components/QuoteEditor'
import BrandIcon from '../components/BrandIcon'
import QuoteReviewTable from '../components/QuoteReviewTable'

export default function SupplierUpload() {
  const { current, logout, can } = useAuth()
  const supplierId = current.supplierId
  const [rfqs, setRfqs] = useState(null)
  const [rfqId, setRfqId] = useState('')
  const [rfq, setRfq] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [receipt, setReceipt] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Rfqs.list().then((items) => {
      setRfqs(items)
      setRfqId((previous) => items.some((item) => item.id === previous) ? previous : items[0]?.id || '')
    }).catch((failure) => { setRfqs([]); setError(failure.message) })
  }, [])
  useEffect(() => {
    if (!rfqId) { setRfq(null); return }
    Rfqs.get(rfqId).then(setRfq).catch((failure) => setError(failure.message))
  }, [rfqId])
  useEffect(() => {
    if (!rfq?.quoteJobs?.some((job) => ['queued', 'processing'].includes(job.status))) return
    const timer = setInterval(() => Rfqs.get(rfqId).then(setRfq).catch(() => {}), 7000)
    return () => clearInterval(timer)
  }, [rfqId, rfq?.quoteJobs?.map((job) => `${job.id}:${job.status}`).join('|')])

  const upload = async (file) => {
    if (!file || !rfqId) return
    setUploading(true); setError(''); setReceipt('')
    try {
      const job = await Rfqs.quoteUploadQueued(rfqId, file, supplierId)
      setReceipt(`“${job.fileName}” is uploaded. You can close this page now; processing will continue.`)
      setRfq(await Rfqs.get(rfqId))
    } catch (failure) { setError(failure.message) }
    finally { setUploading(false) }
  }
  const retry = async (jobId) => {
    setError('')
    try { await Rfqs.retryQuoteJob(rfqId, jobId, supplierId); setRfq(await Rfqs.get(rfqId)) }
    catch (failure) { setError(failure.message) }
  }
  const refresh = async () => {
    try { setRfq(await Rfqs.get(rfqId)); setError('') }
    catch (failure) { setError(failure.message) }
  }
  const finalized = rfq && (rfq.award || ['Awarded', 'Closed', 'Cancelled'].includes(rfq.status))
  const latestJob = rfq?.quoteJobs?.slice().sort((a, b) => b.createdAt - a.createdAt)[0]
  const stalled = latestJob && ['queued', 'processing'].includes(latestJob.status) && Date.now() - latestJob.updatedAt > 6 * 60_000

  return <main className="min-h-screen bg-ink-50 px-4 py-6 text-ink-900 sm:py-10">
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><BrandIcon name="mark" size={38} /><div><b className="text-lg">OPRO</b><p className="text-xs text-ink-500">Supplier response</p></div></div>
        <button type="button" className="btn-outline text-sm" onClick={logout}><LogOut size={15} /> Sign out</button>
      </header>
      <section className="rounded-2xl bg-white p-5 shadow-card sm:p-7">
        <h1 className="text-2xl font-extrabold">Submit your quotation</h1>
        <p className="mt-1 text-sm text-ink-500">Choose an assigned RFQ and upload your response. Once the upload finishes, you can leave.</p>
        {!supplierId && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">This login is not linked to a supplier. Ask your administrator to create supplier credentials.</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {rfqs === null ? <p className="mt-5 text-sm text-ink-500">Loading assigned RFQs…</p> : rfqs.length === 0 ? <p className="mt-5 text-sm text-ink-500">No RFQs are assigned to your supplier account yet.</p> : <>
          <label className="mt-6 block"><span className="label">Assigned RFQ</span><select className="input" value={rfqId} onChange={(event) => { setRfqId(event.target.value); setReceipt(''); setRfq(null) }}>{rfqs.map((item) => <option key={item.id} value={item.id}>{item.id} — {item.title}</option>)}</select></label>
          {rfq && <>
            <div className="mt-5 rounded-xl border border-ink-100 bg-ink-50 p-4"><h2 className="font-bold">{rfq.title}</h2><p className="mt-1 text-sm text-ink-500">{rfq.lines.length} item{rfq.lines.length === 1 ? '' : 's'}{rfq.deadline ? ` · Deadline: ${rfq.deadline}` : ''}</p>{rfq.description && <p className="mt-2 text-sm text-ink-600">{rfq.description}</p>}</div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
            <a href={Rfqs.exportRfqItemsUrl(rfq.id)} className="btn-outline"><Download size={17} /> Download RFQ (.xlsx)</a>
            <label className={`btn-primary inline-flex cursor-pointer ${uploading || finalized ? 'pointer-events-none opacity-60' : ''}`}>
              {uploading ? <><Loader2 size={17} className="animate-spin" /> Uploading file…</> : <><FileUp size={17} /> Upload response file</>}
              <input type="file" className="sr-only" disabled={uploading || finalized} accept=".xlsx,.xls,.csv,.txt,.pdf,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; upload(file) }} />
            </label>
            </div>
            <p className="mt-2 text-xs text-ink-500">PDF, spreadsheet, CSV, text, or image · up to 50 MB. Keep this page open until “uploaded” appears.</p>
            {receipt && <p role="status" className="mt-4 flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={18} className="shrink-0" /> {receipt}</p>}
            {latestJob && <div className="mt-4 rounded-xl border border-ink-100 p-4 text-sm"><div className="flex items-start justify-between gap-2"><div><b>Latest upload: {latestJob.fileName}</b><p className="mt-1 capitalize text-ink-600">Status: {latestJob.status}</p></div><button type="button" className="btn-outline py-1.5 text-xs" onClick={refresh}><RefreshCw size={13} /> Refresh</button></div>
              {['queued', 'processing'].includes(latestJob.status) && <p className="mt-2 text-ink-500">Your file is stored. Processing continues after you leave.</p>}
              {stalled && <button type="button" className="btn-outline mt-2 text-xs" onClick={() => retry(latestJob.id)}>Retry processing</button>}
              {latestJob.status === 'completed' && <p className="mt-2 text-emerald-700">Processing finished. {latestJob.result?.priced || 0} item{latestJob.result?.priced === 1 ? '' : 's'} now have a price. You may close this page.</p>}
              {latestJob.status === 'completed' && latestJob.result?.unmatched?.length > 0 && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-800">No matching quote was found for: {latestJob.result.unmatched.join(', ')}. These items remain unquoted; check the table below or enter them individually.</p>}
              {latestJob.status === 'completed' && !latestJob.result?.priced && <p className="mt-2 text-amber-700">No positive prices were found in the file. Please use “Quote individual items instead” or upload a clearer response.</p>}
              {latestJob.status === 'failed' && <div className="mt-2"><p className="text-rose-700">{latestJob.error || 'Processing failed.'}</p><button type="button" className="btn-outline mt-2 text-xs" onClick={() => retry(latestJob.id)}>Retry processing</button></div>}
            </div>}
          </>}
        </>}
      </section>
      {rfq?.attachments?.length > 0 && <section className="rounded-2xl bg-white p-5 shadow-card sm:p-7"><h2 className="font-bold">RFQ attachments</h2><p className="mt-1 text-xs text-ink-500">Download the buyer’s specifications and supporting files.</p><div className="mt-3 flex flex-wrap gap-2">{rfq.attachments.map((file, index) => file.id ? <a key={file.id} className="btn-outline text-sm" href={Rfqs.attachmentUrl(rfq.id, file.id)}><Download size={15} /> {file.name}</a> : <span key={index} className="text-sm text-ink-500">{file.name || file} (file unavailable)</span>)}</div></section>}
      {rfq && <div className="rounded-2xl bg-white p-5 shadow-card sm:p-7"><QuoteReviewTable rfq={rfq} supplierId={supplierId} allowImageUpload={can('quote.submit') && !finalized} onChanged={refresh} /></div>}
      {rfq && can('quote.submit') && <details className="rounded-2xl bg-white p-5 shadow-card sm:p-7"><summary className="cursor-pointer font-bold">Quote individual items instead</summary><div className="mt-4"><QuoteEditor rfq={rfq} supplierId={supplierId} disabled={!!finalized} onSaved={refresh} /></div></details>}
    </div>
  </main>
}
