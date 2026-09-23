import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Package, Pencil, Trash2, Sparkles, Upload, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { Items } from '../api/client'
import { Card, Spinner, Drawer, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { CATALOGUE_COLUMNS } from '../../shared/catalogue'

// Price-over-time line chart from an item's purchase history.
function PriceTrend({ history = [] }) {
  const data = [...history].sort((a, b) => a.at - b.at).map((h) => ({
    d: new Date(h.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }),
    price: +(Number(h.price) || 0).toFixed(2), supplier: h.supplierName || '', rfq: h.rfqId || '',
  }))
  if (!data.length) return <div className="grid h-full place-items-center text-sm text-ink-400">No purchases yet.</div>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ left: -8, right: 12, top: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
        <XAxis dataKey="d" tickLine={false} axisLine={false} fontSize={11} stroke="#8591aa" />
        <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="#8591aa" tickFormatter={(v) => '$' + v} width={48} />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }}
          formatter={(v, _n, p) => [`$${v}` + (p.payload.supplier ? ` · ${p.payload.supplier}` : ''), 'Unit price']} />
        <Line type="monotone" dataKey="price" stroke="#3563ff" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

const empty = Object.fromEntries(CATALOGUE_COLUMNS.map(({ key }) => [key, '']))
const PAGE_SIZE = 100
export default function ItemsPage() {
  const { can } = useAuth()
  const [result, setResult] = useState(null), [meta, setMeta] = useState({ categories: [], subcategories: [], units: [] })
  const [query, setQuery] = useState(''), [search, setSearch] = useState('')
  const [category, setCategory] = useState(''), [subcategory, setSubcategory] = useState('')
  const [page, setPage] = useState(0), [revision, setRevision] = useState(0)
  const [drawer, setDrawer] = useState(null), [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('')
  useEffect(() => { const timer = setTimeout(() => { setSearch(query); setPage(0) }, 250); return () => clearTimeout(timer) }, [query])
  useEffect(() => { let active = true; Items.meta().then((v) => { if (active) setMeta(v) }).catch((e) => { if (active) setError(e.message) }); return () => { active = false } }, [revision])
  useEffect(() => {
    let active = true; setLoading(true)
    Items.page({ q: search, category, subcategory, offset: page * PAGE_SIZE, limit: PAGE_SIZE }).then((v) => {
      if (!active) return
      if (page > 0 && !v.items.length && v.total) { setPage(Math.max(0, Math.ceil(v.total / PAGE_SIZE) - 1)); return }
      setResult(v); setError('')
    }).catch((e) => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [search, category, subcategory, page, revision])
  const save = async (form) => {
    setBusy(true); setError('')
    try { if (drawer === 'new') await Items.create(form); else await Items.update(drawer.id, form); setDrawer(null); setRevision((r) => r + 1) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const remove = async (item) => {
    if (!confirm(`Delete ${item.name} from the catalogue?`)) return
    try { await Items.remove(item.id); setRevision((r) => r + 1) } catch (e) { setError(e.message) }
  }
  const upload = async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return
    setBusy(true); setError('')
    try { const value = await Items.upload(file); setNotice(`Added ${value.added.toLocaleString()} items${value.skipped ? `; skipped ${value.skipped} rows without Item Name` : ''}.`); setRevision((r) => r + 1) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const pages = Math.max(1, Math.ceil((result?.total || 0) / PAGE_SIZE))
  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold text-ink-900">Item Catalogue</h1><p className="mt-1 text-sm text-ink-500">{meta.total?.toLocaleString() || '—'} items · all nine columns from Fully_edited</p></div>
      <div className="flex flex-wrap gap-2">
        {can('ai.use') && <Link to="/import" className="btn-outline"><Sparkles size={16} /> AI Import</Link>}
        <label className={`btn-outline cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Add from spreadsheet
          <input aria-label="Add catalogue spreadsheet" type="file" hidden disabled={busy} accept=".xlsx,.xls,.csv" onChange={upload} />
        </label>
        <button className="btn-primary" onClick={() => { setDrawer('new'); setError('') }}><Plus size={16} /> New Item</button>
      </div>
    </div>
    <p className="text-xs text-ink-500">Column order matches the workbook. Blank source values remain blank. Spreadsheet uploads add items; the Fully_edited tab is used when present.</p>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_200px_200px]">
        <div className="relative sm:col-span-2 xl:col-span-1"><Search size={16} className="absolute left-3 top-3 text-ink-400" /><input aria-label="Search catalogue" className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all items, AI names, SKU, MPN…" /></div>
        <select aria-label="Filter Category" className="input" value={category} onChange={(e) => { setCategory(e.target.value); setPage(0) }}><option value="">All categories</option>{meta.hasBlankCategory && <option value="__blank__">Blank Category</option>}{meta.categories.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Filter Subcategory" className="input" value={subcategory} onChange={(e) => { setSubcategory(e.target.value); setPage(0) }}><option value="">All subcategories</option>{meta.subcategories.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
    </Card>
    <Card className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 text-sm">
        <p role="status">{loading ? 'Loading…' : `${result?.total ? page * PAGE_SIZE + 1 : 0}–${Math.min((page + 1) * PAGE_SIZE, result?.total || 0)} of ${(result?.total || 0).toLocaleString()} items`}</p>
        <div className="flex items-center gap-2"><button className="btn-outline px-2 py-1" disabled={loading || page === 0} onClick={() => setPage(0)}>First</button><button aria-label="Previous page" className="btn-outline p-1.5" disabled={loading || page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={16} /></button><span>Page {page + 1} of {pages}</span><button aria-label="Next page" className="btn-outline p-1.5" disabled={loading || page >= pages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight size={16} /></button><button className="btn-outline px-2 py-1" disabled={loading || page >= pages - 1} onClick={() => setPage(pages - 1)}>Last</button></div>
      </div>
      {loading ? <Spinner label="Loading items…" /> : !result?.items.length ? <div className="p-8"><Empty icon={Package} title="No items match" hint="Try another name, SKU, category or MPN." /></div> : <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[2200px] table-fixed text-sm">
          <thead className="sticky top-0 z-10 bg-ink-50 text-left text-xs font-semibold text-ink-600"><tr>{CATALOGUE_COLUMNS.map(({ key, label }) => <th key={key} className={`px-4 py-3 ${['name', 'aiName', 'description'].includes(key) ? 'w-80' : 'w-44'}`}>{label}</th>)}<th className="w-24 px-3 py-3"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y divide-ink-100">{result.items.map((item) => <tr key={item.id} className="align-top hover:bg-ink-50/60">{CATALOGUE_COLUMNS.map(({ key }) => <td key={key} className={`whitespace-pre-wrap break-words px-4 py-3 ${key === 'name' ? 'font-semibold text-ink-800' : 'text-ink-600'}`}>{item[key] ?? ''}</td>)}<td className="px-3 py-3"><div className="flex gap-1"><button aria-label={`Edit ${item.sku || item.name}`} title="Edit item" className="btn-ghost p-1.5" onClick={() => { setDrawer(item); setError('') }}><Pencil size={15} /></button><button aria-label={`Delete ${item.sku || item.name}`} title="Delete item" className="btn-ghost p-1.5 text-rose-600" onClick={() => remove(item)}><Trash2 size={15} /></button></div></td></tr>)}</tbody>
        </table>
      </div>}
    </Card>
    <ItemDrawer open={!!drawer} item={drawer === 'new' ? null : drawer} meta={meta} busy={busy} error={error} onClose={() => { if (!busy) setDrawer(null) }} onSave={save} />
  </div>
}
function ItemDrawer({ open, item, meta, busy, error, onClose, onSave }) {
  const [form, setForm] = useState(empty)
  useEffect(() => { setForm(item ? { ...empty, ...item } : { ...empty }) }, [item, open])
  return <Drawer open={open} title={item ? 'Edit Item' : 'New Item'} subtitle="Fields match the Fully_edited worksheet." onClose={onClose} footer={<><button className="btn-outline" disabled={busy} onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !form.name.trim()} onClick={() => onSave(form)}>{busy ? 'Saving…' : 'Save'}</button></>}>
    {CATALOGUE_COLUMNS.map(({ key, label }) => <label key={key} className="block"><span className="label">{label}{key === 'name' ? ' *' : ''}</span>{key === 'description' ? <textarea className="input min-h-24" value={form[key] || ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} /> : <input className="input" list={['category', 'subcategory', 'uom'].includes(key) ? `catalogue-${key}` : undefined} value={form[key] || ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />}</label>)}
    <datalist id="catalogue-category">{meta.categories.map((v) => <option key={v} value={v} />)}</datalist><datalist id="catalogue-subcategory">{meta.subcategories.map((v) => <option key={v} value={v} />)}</datalist><datalist id="catalogue-uom">{meta.units.map((v) => <option key={v} value={v} />)}</datalist>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {!!item?.priceHistory?.length && <div><p className="label">Price history</p><div className="h-48"><PriceTrend history={item.priceHistory} /></div></div>}
  </Drawer>
}
