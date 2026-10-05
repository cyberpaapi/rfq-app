import { useEffect, useState } from 'react'
import { Rfqs } from '../api/client'
import { isPriced } from '../../shared/evaluation'

export default function QuoteEditor({ rfq, supplierId, onSaved, disabled = false }) {
  const quote = rfq.quotes?.find((q) => q.supplierId === supplierId)
  const imagesByLine = new Map((rfq.itemImages || []).filter((image) => image.supplierId === supplierId).map((image) => [image.lineId, image]))
  const attachmentsByLine = new Map()
  for (const file of rfq.itemAttachments || []) if (file.supplierId === supplierId) attachmentsByLine.set(file.lineId, [...(attachmentsByLine.get(file.lineId) || []), file])
  const [values, setValues] = useState({})
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  const [touched, setTouched] = useState([])
  const [bulkEta, setBulkEta] = useState('')
  const [bulkReadyDate, setBulkReadyDate] = useState('')
  const [uploadingFile, setUploadingFile] = useState('')
  const [fileError, setFileError] = useState('')

  useEffect(() => {
    setValues(Object.fromEntries((quote?.lines || []).map((line) => [line.lineId, { rate: String(line.rate || ''), offeredName: line.offeredName || '', description: line.description || '', brand: line.brand || '', model: line.model || '', partNo: line.partNo || '', leadTime: line.leadTime || '', eta: line.eta || '', readyToSendDate: line.readyToSendDate || '', paymentTerms: line.paymentTerms || quote?.paymentTerms || '', warranty: line.warranty || '', remark: line.remark || '' }])))
    setSelected((quote?.lines || []).filter(isPriced).map((line) => line.lineId))
    setBulkEta('')
    setBulkReadyDate('')
    setTouched([])
    setDirty(false); setError('')
  }, [rfq.id, supplierId, quote?.submittedAt])

  const update = (lineId, field, value) => {
    setDirty(true)
    setTouched((previous) => previous.includes(lineId) ? previous : [...previous, lineId])
    setValues((previous) => ({ ...previous, [lineId]: { ...previous[lineId], [field]: value } }))
    if (field === 'rate') setSelected((previous) => Number(value) > 0 ? previous.includes(lineId) ? previous : [...previous, lineId] : previous.filter((id) => id !== lineId))
  }
  const toggle = (lineId) => {
    setDirty(true)
    setTouched((previous) => previous.includes(lineId) ? previous : [...previous, lineId])
    setSelected((previous) => previous.includes(lineId) ? previous.filter((id) => id !== lineId) : [...previous, lineId])
  }
  const toggleAll = () => {
    setDirty(true)
    setTouched(rfq.lines.map((line) => line.lineId))
    setSelected((previous) => previous.length === rfq.lines.length ? [] : rfq.lines.map((line) => line.lineId))
  }
  const applyEtaToAll = () => {
    if (!bulkEta) return
    setDirty(true)
    setTouched((previous) => [...new Set([...previous, ...rfq.lines.map((line) => line.lineId)])])
    setNotice('')
    setValues((previous) => Object.fromEntries(rfq.lines.map((line) => [line.lineId, { ...previous[line.lineId], eta: bulkEta }])))
  }
  const applyReadyDateToAll = () => {
    if (!bulkReadyDate) return
    setDirty(true)
    setTouched((previous) => [...new Set([...previous, ...rfq.lines.map((line) => line.lineId)])])
    setNotice('')
    setValues((previous) => Object.fromEntries(rfq.lines.map((line) => [line.lineId, { ...previous[line.lineId], readyToSendDate: bulkReadyDate }])))
  }
  const uploadLineFile = async (lineId, kind, file) => {
    if (!file) return
    setUploadingFile(`${kind}:${lineId}`); setFileError('')
    try {
      if (kind === 'photo') await Rfqs.uploadItemImage(rfq.id, lineId, file, supplierId)
      else await Rfqs.uploadItemAttachment(rfq.id, lineId, file, supplierId)
      await onSaved?.()
    } catch (failure) { setFileError(failure.message) }
    finally { setUploadingFile('') }
  }
  const submit = async (event) => {
    event.preventDefault(); setError(''); setNotice('')
    const lines = rfq.lines.filter((line) => touched.includes(line.lineId)).map((line) => ({
      lineId: line.lineId, ...values[line.lineId], rate: selected.includes(line.lineId) ? values[line.lineId]?.rate || 0 : 0,
    }))
    if (selected.some((lineId) => touched.includes(lineId) && !isPriced(values[lineId]))) return setError('Enter a positive unit price for every checked item, or uncheck it.')
    setSaving(true)
    try {
      await Rfqs.quote(rfq.id, { supplierId, lines })
      setNotice(`Saved ${lines.length} revised item${lines.length === 1 ? '' : 's'}. Other quoted items remain unchanged.`)
      setDirty(false)
      await onSaved?.()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  if (!supplierId) return null
  return <form onSubmit={submit} className="space-y-3">
    <p className="text-sm text-ink-500">Only checked items with a positive unit price count as quoted. Unchecking a previously quoted item removes its price from comparison and awards. Photos and attachments save as soon as their upload finishes.</p>
    <div className="flex flex-wrap items-end gap-3">
      <button type="button" className="btn-outline py-1.5 text-xs" onClick={toggleAll} disabled={disabled || saving || !rfq.lines.length}>{selected.length === rfq.lines.length ? 'Clear all' : 'Select all items'}</button>
      <label className="block"><span className="label">Same ready to send date</span><input aria-label="Ready to send date for all items" type="date" className="input w-40" value={bulkReadyDate} onChange={(event) => setBulkReadyDate(event.target.value)} disabled={disabled || saving} /></label>
      <button type="button" className="btn-outline py-1.5 text-xs" onClick={applyReadyDateToAll} disabled={disabled || saving || !bulkReadyDate || !rfq.lines.length}>Apply ready date to all</button>
      <label className="block"><span className="label">Same forecasted ETA</span><input aria-label="Forecasted ETA for all items" type="date" className="input w-40" value={bulkEta} onChange={(event) => setBulkEta(event.target.value)} disabled={disabled || saving} /></label>
      <button type="button" className="btn-outline py-1.5 text-xs" onClick={applyEtaToAll} disabled={disabled || saving || !bulkEta || !rfq.lines.length}>Apply ETA to all</button>
    </div>
    <div className="overflow-x-auto rounded-xl border border-ink-100"><table className="w-full min-w-[2800px] text-sm">
      <thead><tr className="bg-ink-50 text-left text-xs font-bold uppercase text-ink-600"><th className="px-3 py-2">Quote</th><th className="px-3 py-2">Item name / description</th><th className="px-3 py-2">Brand</th><th className="px-3 py-2">Model No.</th><th className="px-3 py-2">Part No.</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2">UOM</th><th className="px-3 py-2">Photo</th><th className="px-3 py-2">RFQ remark</th><th className="px-3 py-2">Unit price (USD)</th><th className="px-3 py-2">Ready to send</th><th className="px-3 py-2">Delivery lead time</th><th className="px-3 py-2">ETA</th><th className="px-3 py-2">Payment terms</th><th className="px-3 py-2">Warranty</th><th className="px-3 py-2">Supplier remarks</th><th className="px-3 py-2">Attachments</th></tr></thead>
      <tbody className="divide-y divide-ink-100">{rfq.lines.map((line) => <tr key={line.lineId}>
        <td className="px-3 py-2"><input type="checkbox" aria-label={`Quote ${line.name}`} checked={selected.includes(line.lineId)} onChange={() => toggle(line.lineId)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><p className="font-semibold text-ink-800">{line.name}</p><p className="text-xs text-ink-500">{[line.spec, line.description].filter(Boolean).join(' · ')}</p><input aria-label={`Offered item name for ${line.name}`} placeholder="Offered item name" className="input mt-2 w-48" value={values[line.lineId]?.offeredName || ''} onChange={(e) => update(line.lineId, 'offeredName', e.target.value)} disabled={disabled || saving} /><textarea aria-label={`Offered item description for ${line.name}`} placeholder="Offered description" className="input mt-1 min-h-16 w-48" value={values[line.lineId]?.description || ''} onChange={(e) => update(line.lineId, 'description', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><input aria-label={`Offered brand for ${line.name}`} className="input w-32" value={values[line.lineId]?.brand || ''} onChange={(e) => update(line.lineId, 'brand', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><input aria-label={`Offered model for ${line.name}`} className="input w-32" value={values[line.lineId]?.model || ''} onChange={(e) => update(line.lineId, 'model', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><input aria-label={`Offered part number for ${line.name}`} className="input w-32" value={values[line.lineId]?.partNo || ''} onChange={(e) => update(line.lineId, 'partNo', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2 text-right">{line.qty}</td>
        <td className="px-3 py-2">{line.uom}</td>
        <td className="px-3 py-2">{imagesByLine.has(line.lineId) && <a className="block text-xs font-semibold text-brand-700 hover:underline" href={Rfqs.itemImageUrl(rfq.id, line.lineId, supplierId)}>View photo</a>}<label className="cursor-pointer text-xs font-semibold text-brand-700 hover:underline">{uploadingFile === `photo:${line.lineId}` ? 'Uploading…' : 'Browse photo'}<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" disabled={disabled || !!uploadingFile} onChange={(event) => { uploadLineFile(line.lineId, 'photo', event.target.files?.[0]); event.target.value = '' }} /></label></td>
        <td className="px-3 py-2 text-ink-600">{line.remark || '—'}</td>
        <td className="px-3 py-2"><input aria-label={`Unit price for ${line.name}`} type="number" min="0" step="any" className="input w-28" value={values[line.lineId]?.rate || ''} onChange={(e) => update(line.lineId, 'rate', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><input aria-label={`Ready to send date for ${line.name}`} type="date" className="input w-40" value={values[line.lineId]?.readyToSendDate || ''} onChange={(e) => update(line.lineId, 'readyToSendDate', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><input aria-label={`Delivery lead time for ${line.name}`} placeholder="e.g. 4 weeks" className="input w-32" value={values[line.lineId]?.leadTime || ''} onChange={(e) => update(line.lineId, 'leadTime', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><input aria-label={`Forecasted ETA for ${line.name}`} type="date" className="input w-40" value={values[line.lineId]?.eta || ''} onChange={(e) => update(line.lineId, 'eta', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><input aria-label={`Payment terms for ${line.name}`} className="input w-40" value={values[line.lineId]?.paymentTerms || ''} onChange={(e) => update(line.lineId, 'paymentTerms', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><input aria-label={`Warranty for ${line.name}`} className="input w-32" value={values[line.lineId]?.warranty || ''} onChange={(e) => update(line.lineId, 'warranty', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><input aria-label={`Supplier remarks for ${line.name}`} className="input w-40" value={values[line.lineId]?.remark || ''} onChange={(e) => update(line.lineId, 'remark', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2">{(attachmentsByLine.get(line.lineId) || []).map((file) => <a key={file.id} className="block text-xs font-semibold text-brand-700 hover:underline" href={Rfqs.itemAttachmentUrl(rfq.id, line.lineId, file.id)}>{file.name}</a>)}<label className="cursor-pointer text-xs font-semibold text-brand-700 hover:underline">{uploadingFile === `attachment:${line.lineId}` ? 'Uploading…' : 'Attach file'}<input type="file" hidden disabled={disabled || !!uploadingFile} onChange={(event) => { uploadLineFile(line.lineId, 'attachment', event.target.files?.[0]); event.target.value = '' }} /></label></td>
      </tr>)}</tbody>
    </table></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {fileError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{fileError}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    <button className="btn-primary" disabled={disabled || saving || !dirty || (!selected.length && !quote)}>{saving ? 'Saving…' : `Save response (${selected.length} quoted item${selected.length === 1 ? '' : 's'})`}</button>
  </form>
}
