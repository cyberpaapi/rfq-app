import { useEffect, useState } from 'react'
import { Rfqs } from '../api/client'

export default function QuoteEditor({ rfq, supplierId, onSaved, disabled = false }) {
  const quote = rfq.quotes?.find((q) => q.supplierId === supplierId)
  const [values, setValues] = useState({})
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setValues(Object.fromEntries((quote?.lines || []).map((line) => [line.lineId, { rate: String(line.rate || ''), eta: line.eta || '', remark: line.remark || '' }])))
    setSelected([]); setError('')
  }, [rfq.id, supplierId, quote?.submittedAt])

  const update = (lineId, field, value) => {
    setValues((previous) => ({ ...previous, [lineId]: { ...previous[lineId], [field]: value } }))
    setSelected((previous) => previous.includes(lineId) ? previous : [...previous, lineId])
  }
  const toggle = (lineId) => setSelected((previous) => previous.includes(lineId) ? previous.filter((id) => id !== lineId) : [...previous, lineId])
  const submit = async (event) => {
    event.preventDefault(); setError(''); setNotice('')
    const lines = rfq.lines.filter((line) => selected.includes(line.lineId)).map((line) => ({ lineId: line.lineId, ...values[line.lineId] }))
    if (!lines.length) return setError('Choose at least one item to quote.')
    if (lines.some((line) => !Number.isFinite(Number(line.rate)) || Number(line.rate) <= 0)) return setError('Enter a positive unit price for every selected item.')
    setSaving(true)
    try {
      await Rfqs.quote(rfq.id, { supplierId, lines })
      setNotice(`Saved ${lines.length} item${lines.length === 1 ? '' : 's'}. Other quoted items were kept.`)
      setSelected([])
      await onSaved?.()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  if (!supplierId) return null
  return <form onSubmit={submit} className="space-y-3">
    <p className="text-sm text-ink-500">Enter a unit price for one or more items. Updating a few items keeps the supplier’s other prices and uploaded file.</p>
    <div className="overflow-x-auto rounded-xl border border-ink-100"><table className="w-full min-w-[720px] text-sm">
      <thead><tr className="bg-ink-50 text-left text-xs font-bold uppercase text-ink-600"><th className="px-3 py-2">Quote</th><th className="px-3 py-2">Item and specification</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2">Unit price (USD)</th><th className="px-3 py-2">ETA</th><th className="px-3 py-2">Note</th></tr></thead>
      <tbody className="divide-y divide-ink-100">{rfq.lines.map((line) => <tr key={line.lineId}>
        <td className="px-3 py-2"><input type="checkbox" aria-label={`Quote ${line.name}`} checked={selected.includes(line.lineId)} onChange={() => toggle(line.lineId)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><p className="font-semibold text-ink-800">{line.name}</p><p className="text-xs text-ink-500">{[line.spec, line.description].filter(Boolean).join(' · ')}</p></td>
        <td className="px-3 py-2 text-right">{line.qty} {line.uom}</td>
        <td className="px-3 py-2"><input aria-label={`Unit price for ${line.name}`} type="number" min="0.01" step="any" className="input w-28" value={values[line.lineId]?.rate || ''} onChange={(e) => update(line.lineId, 'rate', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><input aria-label={`ETA for ${line.name}`} type="date" className="input w-40" value={values[line.lineId]?.eta || ''} onChange={(e) => update(line.lineId, 'eta', e.target.value)} disabled={disabled || saving} /></td>
        <td className="px-3 py-2"><input aria-label={`Note for ${line.name}`} className="input w-40" value={values[line.lineId]?.remark || ''} onChange={(e) => update(line.lineId, 'remark', e.target.value)} disabled={disabled || saving} /></td>
      </tr>)}</tbody>
    </table></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    <button className="btn-primary" disabled={disabled || saving || !selected.length}>{saving ? 'Saving…' : `Save ${selected.length || ''} selected item${selected.length === 1 ? '' : 's'}`}</button>
  </form>
}
