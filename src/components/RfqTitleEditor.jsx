import { useEffect, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { Rfqs } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function RfqTitleEditor({ rfq, onSaved, as: Heading = 'h2', className = 'font-bold text-ink-900' }) {
  const { can, current } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(rfq.title)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const editable = can('rfq.create') && !current.readOnly

  useEffect(() => { setName(rfq.title); setEditing(false); setError('') }, [rfq.id, rfq.title])

  const cancel = () => { setName(rfq.title); setError(''); setEditing(false) }
  const save = async (event) => {
    event.preventDefault()
    const title = name.trim()
    if (!title || title.length > 160) { setError('Enter an RFQ name of 1–160 characters.'); return }
    if (title === rfq.title) { cancel(); return }
    setSaving(true); setError('')
    try {
      const updated = await Rfqs.update(rfq.id, { title })
      onSaved?.(updated)
      setEditing(false)
    } catch (failure) { setError(failure.message) }
    finally { setSaving(false) }
  }

  if (editing) return <form onSubmit={save} className="min-w-0 space-y-1">
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`rfq-name-${rfq.id}`}>RFQ name</label>
      <input id={`rfq-name-${rfq.id}`} autoFocus className="input min-w-48 flex-1" value={name} maxLength={160} onChange={(event) => { setName(event.target.value); setError('') }} aria-invalid={!!error} aria-describedby={error ? `rfq-name-error-${rfq.id}` : undefined} onKeyDown={(event) => { if (event.key === 'Escape') cancel() }} disabled={saving} />
      <button type="submit" className="btn-primary" disabled={saving || !name.trim()}><Check size={15} /> {saving ? 'Saving…' : 'Save name'}</button>
      <button type="button" className="btn-outline" onClick={cancel} disabled={saving}><X size={15} /> Cancel</button>
    </div>
    {error && <p id={`rfq-name-error-${rfq.id}`} role="alert" className="text-xs text-rose-700">{error}</p>}
    <p className="text-xs text-ink-500">RFQ code {rfq.id} stays the same.</p>
  </form>

  return <div className="flex min-w-0 items-center gap-2">
    <Heading className={className}>{rfq.title}</Heading>
    {editable && <button type="button" className="shrink-0 rounded-lg p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600" onClick={() => setEditing(true)} aria-label={`Rename ${rfq.title}`} title="Rename RFQ"><Pencil size={15} /></button>}
  </div>
}
