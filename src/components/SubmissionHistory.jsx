import { Download } from 'lucide-react'
import { Rfqs } from '../api/client'

export default function SubmissionHistory({ rfq, supplierId, canDownload = true }) {
  const quote = rfq?.quotes?.find((entry) => entry.supplierId === supplierId)
  const submissions = [...(quote?.submissions || [])].reverse()
  if (!supplierId) return null

  return <section className="mt-5 border-t border-ink-100 pt-5">
    <h3 className="font-bold text-ink-900">Submission history</h3>
    <p className="mt-1 text-xs text-ink-500">Each entry records the saved quote after that submission. The latest quote is used for evaluation.</p>
    {!submissions.length ? <p className="mt-3 text-sm text-ink-500">No submissions recorded yet.</p> :
      <div className="mt-3 space-y-2">{submissions.map((entry, index) => <details key={entry.id} className="rounded-xl border border-ink-100 bg-white p-3">
        <summary className="cursor-pointer font-medium text-ink-800">
          {submissions.length - index}. {entry.kind === 'upload' ? 'Document upload' : entry.kind === 'internal edit' ? 'Internal edit' : 'Individual items'}
          <span className="ml-2 text-xs font-normal text-ink-500">{new Date(entry.at).toLocaleString()} · {entry.changedLineIds?.length || 0} item{entry.changedLineIds?.length === 1 ? '' : 's'} updated</span>
        </summary>
        <div className="mt-3 text-sm">
          {entry.fileName && <div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-ink-600">File: {entry.fileName}</span>{entry.hasFile && canDownload && <a className="btn-outline py-1 text-xs" href={Rfqs.quoteSubmissionFileUrl(rfq.id, supplierId, entry.id)}><Download size={13} /> Download original</a>}</div>}
          <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="border-b border-ink-100 text-ink-500"><th className="py-2 pr-3">RFQ item</th><th className="py-2 pr-3">Offered item / brand</th><th className="py-2 pr-3 text-right">Unit price (USD)</th></tr></thead><tbody>{(entry.lines || []).filter((line) => Number(line.rate) > 0).map((line) => <tr key={line.lineId} className="border-b border-ink-50"><td className="py-2 pr-3">{rfq.lines?.find((item) => item.lineId === line.lineId)?.name || line.name || line.lineId}</td><td className="py-2 pr-3">{[line.offeredName, line.brand, line.model].filter(Boolean).join(' · ') || '—'}</td><td className="py-2 pr-3 text-right">{Number(line.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>)}</tbody></table></div>
          {!entry.lines?.some((line) => Number(line.rate) > 0) && <p className="text-ink-500">No priced items in this submission.</p>}
        </div>
      </details>)}</div>}
  </section>
}
