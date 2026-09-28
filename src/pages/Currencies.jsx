import { useEffect, useState } from 'react'
import { Coins, Plus } from 'lucide-react'
import { Currencies as CurrencyApi } from '../api/client'
import { Card } from '../components/ui'

export default function Currencies() {
  const [items, setItems] = useState(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { CurrencyApi.list().then(setItems).catch((failure) => setError(failure.message)) }, [])
  const create = async (event) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy('create')
    try {
      const item = await CurrencyApi.create({ code, name })
      setItems((previous) => [...previous, item].sort((a, b) => a.code.localeCompare(b.code)))
      setCode(''); setName(''); setNotice(`${item.code} added and active.`)
    } catch (failure) { setError(failure.message) }
    finally { setBusy('') }
  }
  const toggle = async (item) => {
    setError(''); setNotice(''); setBusy(item.code)
    try {
      const updated = await CurrencyApi.update(item.code, { name: item.name, active: !item.active })
      setItems((previous) => previous.map((entry) => entry.code === item.code ? updated : entry))
      setNotice(`${item.code} is now ${updated.active ? 'active' : 'inactive'}.`)
    } catch (failure) { setError(failure.message) }
    finally { setBusy('') }
  }

  return <div className="space-y-5">
    <div><h1 className="flex items-center gap-2 text-2xl font-extrabold text-ink-900"><Coins size={26} /> Currencies</h1><p className="mt-1 text-sm text-ink-500">Choose which currencies appear when creating an RFQ. USD is the base currency and stays active.</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    <Card className="p-5"><h2 className="mb-4 font-bold text-ink-900">Add currency</h2><form onSubmit={create} className="flex flex-wrap items-end gap-3"><label className="block"><span className="label">Code</span><input className="input w-28 uppercase" maxLength={3} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="e.g. NZD" required /></label><label className="min-w-[220px] flex-1"><span className="label">Currency name</span><input className="input" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. New Zealand dollar" required /></label><button className="btn-primary" disabled={!!busy}><Plus size={16} /> {busy === 'create' ? 'Adding…' : 'Add currency'}</button></form></Card>
    <Card className="overflow-hidden"><div className="border-b border-ink-100 px-5 py-4"><h2 className="font-bold text-ink-900">Currency list</h2><p className="text-sm text-ink-500">Inactive currencies remain on saved RFQs but cannot be selected for new RFQs.</p></div>{items === null ? <p className="p-5 text-sm text-ink-500">Loading currencies…</p> : <div className="divide-y divide-ink-100">{items.map((item) => <div key={item.code} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div className="flex items-center gap-3"><span className="w-12 font-mono font-bold text-ink-800">{item.code}</span><span className="text-sm text-ink-700">{item.name}</span>{item.base && <span className="chip bg-brand-50 text-brand-700">Base</span>}</div><div className="flex items-center gap-3"><span className={`text-xs font-semibold ${item.active ? 'text-emerald-700' : 'text-ink-400'}`}>{item.active ? 'Active' : 'Inactive'}</span><button type="button" className="btn-outline py-1.5 text-xs" onClick={() => toggle(item)} disabled={!!busy || item.base}>{busy === item.code ? 'Saving…' : item.active ? 'Make inactive' : 'Activate'}</button></div></div>)}</div>}</Card>
  </div>
}
