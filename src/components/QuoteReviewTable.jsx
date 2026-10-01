import { useState } from 'react'
import { isPriced } from '../../shared/evaluation'
import { Rfqs } from '../api/client'

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const dash = (value) => value || '—'

export default function QuoteReviewTable({ rfq, supplierId, allowImageUpload = false, onChanged }) {
  const [uploadingLine, setUploadingLine] = useState('')
  const [imageError, setImageError] = useState('')
  const quote = rfq.quotes?.find((entry) => entry.supplierId === supplierId)
  const quotedLines = new Map((quote?.lines || []).map((line) => [line.lineId, line]))
  const images = new Map((rfq.itemImages || []).filter((image) => image.supplierId === supplierId).map((image) => [image.lineId, image]))
  const priced = rfq.lines.filter((line) => isPriced(quotedLines.get(line.lineId))).length
  const uploadImage = async (lineId, file) => {
    if (!file) return
    setUploadingLine(lineId); setImageError('')
    try { await Rfqs.uploadItemImage(rfq.id, lineId, file, supplierId); await onChanged?.() }
    catch (error) { setImageError(error.message) }
    finally { setUploadingLine('') }
  }

  return <section aria-label="Supplier quotation review">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div><h3 className="font-bold text-ink-900">RFQ items and supplier response</h3><p className="text-xs text-ink-500">{priced} of {rfq.lines.length} items have a saved price. Prices shown in USD.</p></div>
      {quote?.hasFile && <a className="text-xs font-semibold text-brand-700 hover:underline" href={Rfqs.quoteFileUrl(rfq.id, supplierId)}>View uploaded response: {quote.fileName || quote.source}</a>}
    </div>
    {imageError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{imageError}</p>}
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[2200px] text-sm">
        <thead><tr className="bg-ink-50 text-left text-xs font-bold uppercase tracking-wide text-ink-600">
          <th className="px-3 py-2.5">Item Name</th><th className="px-3 py-2.5">Specification</th><th className="px-3 py-2.5">RFQ Brand</th><th className="px-3 py-2.5">RFQ Model No.</th><th className="px-3 py-2.5">Part No.</th><th className="px-3 py-2.5 text-right">Quantity</th><th className="px-3 py-2.5">Unit</th><th className="px-3 py-2.5">RFQ Photo</th><th className="px-3 py-2.5">Remark</th><th className="px-3 py-2.5">Required Delivery Date</th><th className="px-3 py-2.5">Secondary Requirements</th><th className="px-3 py-2.5">Offered Brand</th><th className="px-3 py-2.5">Offered Model No.</th><th className="px-3 py-2.5">Offered Part No.</th><th className="px-3 py-2.5">Supplier Image</th><th className="px-3 py-2.5 text-right">Unit price (USD)</th><th className="px-3 py-2.5 text-right">Line total (USD)</th><th className="px-3 py-2.5">Ready to send</th><th className="px-3 py-2.5">Forecasted ETA / lead time</th><th className="px-3 py-2.5">Supplier note</th><th className="px-3 py-2.5">Status</th>
        </tr></thead>
        <tbody className="divide-y divide-ink-100">{rfq.lines.map((line) => {
          const offered = quotedLines.get(line.lineId)
          const hasPrice = isPriced(offered)
          const image = images.get(line.lineId)
          return <tr key={line.lineId} className="align-top">
            <td className="px-3 py-2 font-semibold text-ink-800">{line.name}</td>
            <td className="px-3 py-2 text-ink-600">{dash([line.spec, line.description].filter(Boolean).join(' · '))}</td>
            <td className="px-3 py-2">{dash(line.brand)}</td><td className="px-3 py-2">{dash(line.model)}</td><td className="px-3 py-2">{dash(line.partNo)}</td>
            <td className="px-3 py-2 text-right">{line.qty}</td><td className="px-3 py-2">{dash(line.uom)}</td>
            <td className="px-3 py-2">{line.photo?.startsWith?.('data:image') ? <a href={line.photo} target="_blank" rel="noreferrer"><img className="h-12 w-12 rounded object-cover" src={line.photo} alt={`RFQ ${line.name}`} /></a> : dash(line.photo)}</td>
            <td className="px-3 py-2">{dash(line.remark)}</td><td className="px-3 py-2 whitespace-nowrap">{dash(line.requiredDeliveryDate)}</td><td className="px-3 py-2">{dash(line.secondaryRequirements)}</td>
            <td className="px-3 py-2">{dash(offered?.brand)}</td><td className="px-3 py-2">{dash(offered?.model)}</td><td className="px-3 py-2">{dash(offered?.partNo)}</td>
            <td className="px-3 py-2">{image && <a href={Rfqs.itemImageUrl(rfq.id, line.lineId, supplierId)} target="_blank" rel="noreferrer"><img className="mb-1 h-12 w-12 rounded object-cover" src={Rfqs.itemImageUrl(rfq.id, line.lineId, supplierId)} alt={`Supplier ${line.name}`} /></a>}{allowImageUpload && <label className="cursor-pointer text-xs font-semibold text-brand-700 hover:underline">{uploadingLine === line.lineId ? 'Uploading…' : image ? 'Replace image' : 'Upload image'}<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" disabled={!!uploadingLine} onChange={(event) => { uploadImage(line.lineId, event.target.files?.[0]); event.target.value = '' }} /></label>}{!image && !allowImageUpload && '—'}</td>
            <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{hasPrice ? money(Number(offered.rate)) : '—'}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">{hasPrice ? money(Number(offered.rate) * Number(line.qty || 0)) : '—'}</td>
            <td className="px-3 py-2 whitespace-nowrap">{dash(offered?.readyToSendDate)}</td>
            <td className="px-3 py-2">{dash([offered?.eta, offered?.leadTime].filter(Boolean).join(' · '))}</td>
            <td className="px-3 py-2 text-ink-600">{dash([offered?.description, offered?.remark].filter(Boolean).join(' · '))}</td>
            <td className="px-3 py-2">{hasPrice ? <span className="chip bg-emerald-50 text-emerald-700">Quoted</span> : <span className="chip bg-amber-50 text-amber-700">No price</span>}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </section>
}
