import { useState } from 'react'
import { isPriced } from '../../shared/evaluation'
import { Rfqs } from '../api/client'

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const dash = (value) => value || '—'

export default function QuoteReviewTable({ rfq, supplierId, allowImageUpload = false, onChanged }) {
  const [uploadingLine, setUploadingLine] = useState('')
  const [uploadingAttachment, setUploadingAttachment] = useState('')
  const [uploadingWhole, setUploadingWhole] = useState(false)
  const [imageError, setImageError] = useState('')
  const quote = rfq.quotes?.find((entry) => entry.supplierId === supplierId)
  const quotedLines = new Map((quote?.lines || []).map((line) => [line.lineId, line]))
  const images = new Map((rfq.itemImages || []).filter((image) => image.supplierId === supplierId).map((image) => [image.lineId, image]))
  const itemAttachments = (rfq.itemAttachments || []).filter((file) => file.supplierId === supplierId)
  const attachmentsByLine = new Map()
  for (const file of itemAttachments) attachmentsByLine.set(file.lineId, [...(attachmentsByLine.get(file.lineId) || []), file])
  const wholeAttachments = (rfq.supplierAttachments || []).filter((file) => file.supplierId === supplierId)
  const priced = rfq.lines.filter((line) => isPriced(quotedLines.get(line.lineId))).length
  const uploadImage = async (lineId, file) => {
    if (!file) return
    setUploadingLine(lineId); setImageError('')
    try { await Rfqs.uploadItemImage(rfq.id, lineId, file, supplierId); await onChanged?.() }
    catch (error) { setImageError(error.message) }
    finally { setUploadingLine('') }
  }
  const uploadAttachment = async (lineId, file) => {
    if (!file) return
    setUploadingAttachment(lineId); setImageError('')
    try { await Rfqs.uploadItemAttachment(rfq.id, lineId, file, supplierId); await onChanged?.() }
    catch (error) { setImageError(error.message) }
    finally { setUploadingAttachment('') }
  }
  const uploadWholeAttachment = async (file) => {
    if (!file) return
    setUploadingWhole(true); setImageError('')
    try { await Rfqs.uploadQuoteAttachment(rfq.id, file, supplierId); await onChanged?.() }
    catch (error) { setImageError(error.message) }
    finally { setUploadingWhole(false) }
  }

  return <section aria-label="Supplier quotation review">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div><h3 className="font-bold text-ink-900">RFQ items and supplier response</h3><p className="text-xs text-ink-500">{priced} of {rfq.lines.length} items have a saved price. Prices shown in USD.</p></div>
      {quote?.hasFile && <a className="text-xs font-semibold text-brand-700 hover:underline" href={Rfqs.quoteFileUrl(rfq.id, supplierId)}>View uploaded response: {quote.fileName || quote.source}</a>}
    </div>
    <div className="mb-3 rounded-xl border border-ink-100 bg-ink-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3"><b>Whole-response attachments</b>{allowImageUpload && <label className="cursor-pointer font-semibold text-brand-700 hover:underline">{uploadingWhole ? 'Uploading…' : 'Attach document'}<input type="file" hidden disabled={uploadingWhole} onChange={(event) => { uploadWholeAttachment(event.target.files?.[0]); event.target.value = '' }} /></label>}</div>
      <div className="mt-2 flex flex-wrap gap-2">{wholeAttachments.length ? wholeAttachments.map((file) => <a key={file.id} href={Rfqs.quoteAttachmentUrl(rfq.id, file.id)} className="font-medium text-brand-700 hover:underline">{file.name}</a>) : <span className="text-ink-500">No supporting files attached.</span>}</div>
    </div>
    {imageError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{imageError}</p>}
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[3200px] text-sm">
        <thead><tr className="bg-ink-50 text-left text-xs font-bold uppercase tracking-wide text-ink-600">
          <th className="px-3 py-2.5">Item name / description</th><th className="px-3 py-2.5">RFQ Brand</th><th className="px-3 py-2.5">RFQ Model No.</th><th className="px-3 py-2.5">Part No.</th><th className="px-3 py-2.5 text-right">Quantity</th><th className="px-3 py-2.5">UOM</th><th className="px-3 py-2.5">RFQ Photo</th><th className="px-3 py-2.5">RFQ Remark</th><th className="px-3 py-2.5">Required Delivery Date</th><th className="px-3 py-2.5">Secondary Requirements</th><th className="px-3 py-2.5">Offered item / description</th><th className="px-3 py-2.5">Offered Brand</th><th className="px-3 py-2.5">Offered Model No.</th><th className="px-3 py-2.5">Offered Part No.</th><th className="px-3 py-2.5">Supplier Photo</th><th className="px-3 py-2.5 text-right">Unit price (USD)</th><th className="px-3 py-2.5 text-right">Line total (USD)</th><th className="px-3 py-2.5">Ready to send</th><th className="px-3 py-2.5">Delivery lead time</th><th className="px-3 py-2.5">ETA</th><th className="px-3 py-2.5">Payment terms</th><th className="px-3 py-2.5">Warranty</th><th className="px-3 py-2.5">Supplier remarks</th><th className="px-3 py-2.5">Item attachments</th><th className="px-3 py-2.5">Status</th>
        </tr></thead>
        <tbody className="divide-y divide-ink-100">{rfq.lines.map((line) => {
          const offered = quotedLines.get(line.lineId)
          const hasPrice = isPriced(offered)
          const image = images.get(line.lineId)
          return <tr key={line.lineId} className="align-top">
            <td className="px-3 py-2"><b className="text-ink-800">{line.name}</b><span className="block text-ink-600">{dash([line.spec, line.description].filter(Boolean).join(' · '))}</span></td>
            <td className="px-3 py-2">{dash(line.brand)}</td><td className="px-3 py-2">{dash(line.model)}</td><td className="px-3 py-2">{dash(line.partNo)}</td>
            <td className="px-3 py-2 text-right">{line.qty}</td><td className="px-3 py-2">{dash(line.uom)}</td>
            <td className="px-3 py-2">{line.photo?.startsWith?.('data:image') ? <a href={line.photo} target="_blank" rel="noreferrer"><img className="h-12 w-12 rounded object-cover" src={line.photo} alt={`RFQ ${line.name}`} /></a> : dash(line.photo)}</td>
            <td className="px-3 py-2">{dash(line.remark)}</td><td className="px-3 py-2 whitespace-nowrap">{dash(line.requiredDeliveryDate)}</td><td className="px-3 py-2">{dash(line.secondaryRequirements)}</td>
            <td className="px-3 py-2">{dash([offered?.offeredName, offered?.offeredSpec, offered?.description].filter(Boolean).join(' · '))}</td>
            <td className={`px-3 py-2 ${line.brand && offered?.brand && line.brand.trim().toLowerCase() !== offered.brand.trim().toLowerCase() ? 'bg-amber-50 font-semibold text-amber-800' : ''}`}>{dash(offered?.brand)}</td><td className={`px-3 py-2 ${line.model && offered?.model && line.model.trim().toLowerCase() !== offered.model.trim().toLowerCase() ? 'bg-amber-50 font-semibold text-amber-800' : ''}`}>{dash(offered?.model)}</td><td className="px-3 py-2">{dash(offered?.partNo)}</td>
            <td className="px-3 py-2">{image && <a href={Rfqs.itemImageUrl(rfq.id, line.lineId, supplierId)} target="_blank" rel="noreferrer"><img className="mb-1 h-12 w-12 rounded object-cover" src={Rfqs.itemImageUrl(rfq.id, line.lineId, supplierId)} alt={`Supplier ${line.name}`} /></a>}{allowImageUpload && <label className="cursor-pointer text-xs font-semibold text-brand-700 hover:underline">{uploadingLine === line.lineId ? 'Uploading…' : image ? 'Replace image' : 'Upload image'}<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" disabled={!!uploadingLine} onChange={(event) => { uploadImage(line.lineId, event.target.files?.[0]); event.target.value = '' }} /></label>}{!image && !allowImageUpload && '—'}</td>
            <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{hasPrice ? money(Number(offered.rate)) : '—'}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">{hasPrice ? money(Number(offered.rate) * Number(line.qty || 0)) : '—'}</td>
            <td className="px-3 py-2 whitespace-nowrap">{dash(offered?.readyToSendDate)}</td>
            <td className="px-3 py-2">{dash(offered?.leadTime)}</td>
            <td className="px-3 py-2 whitespace-nowrap">{dash(offered?.eta)}</td>
            <td className="px-3 py-2">{dash(offered?.paymentTerms || quote?.paymentTerms)}</td>
            <td className="px-3 py-2">{dash(offered?.warranty)}</td>
            <td className="px-3 py-2 text-ink-600">{dash(offered?.remark)}</td>
            <td className="px-3 py-2"><div className="space-y-1">{(attachmentsByLine.get(line.lineId) || []).map((file) => <a key={file.id} className="block text-xs font-semibold text-brand-700 hover:underline" href={Rfqs.itemAttachmentUrl(rfq.id, line.lineId, file.id)}>{file.name}</a>)}{allowImageUpload && <label className="block cursor-pointer text-xs font-semibold text-brand-700 hover:underline">{uploadingAttachment === line.lineId ? 'Uploading…' : 'Attach file'}<input type="file" hidden disabled={!!uploadingAttachment} onChange={(event) => { uploadAttachment(line.lineId, event.target.files?.[0]); event.target.value = '' }} /></label>}</div></td>
            <td className="px-3 py-2">{hasPrice ? <span className="chip bg-emerald-50 text-emerald-700">Quoted</span> : <span className="chip bg-amber-50 text-amber-700">No price</span>}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </section>
}
