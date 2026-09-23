import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Package, Pencil, Trash2, Tag as TagIcon, Sparkles, Filter, Upload, Loader2, TrendingUp, X } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { Items, Tags } from '../api/client'
import { Card, Spinner, Tag, TagInput, Drawer, Empty, ClampList, ExpandableText } from '../components/ui'

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

const CATEGORIES = ['Electronics', 'Raw Materials', 'Services', 'General']
const UOMS = ['PCS', 'NOS', 'KG', 'BAG', 'MTR', 'LTR', 'SET', 'BOX']
const empty = { name: '', sku: '', spec: '', uom: 'PCS', category: 'General', brand: '', model: '', partNo: '', description: '', tags: [] }

export default function ItemsPage() {
  const [list, setList] = useState(null)
  const [allTags, setAllTags] = useState([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [activeTag, setActiveTag] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const [chartItem, setChartItem] = useState(null) // item whose price-history graph is open

  const load = useCallback(async () => {
    setList(await Items.list({ q, category: cat === 'All' ? '' : cat, tag: activeTag || '' }))
    setAllTags(await Tags())
  }, [q, cat, activeTag])

  useEffect(() => { load() }, [load])

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 4500) }
  const save = async (form) => {
    if (drawer === 'new') await Items.create(form)
    else await Items.update(drawer.id, form)
    setDrawer(null); load()
  }
  const del = async (id) => { if (confirm('Delete this item?')) { await Items.remove(id); load() } }

  const onUpload = async (e) => {
    const f = e.target.files[0]; e.target.value = ''
    if (!f) return
    setUploading(true)
    try {
      const r = await Items.upload(f)
      flash(`Added ${r.added} item(s)${r.skipped ? `, skipped ${r.skipped} row(s) without an Item Name` : ''}.`)
      load()
    } catch (err) { flash('Upload failed: ' + err.message) } finally { setUploading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Item Catalogue</h1>
          <p className="mt-1 text-sm text-ink-500">Standardized items. AI-imported items are matched here automatically, or added if new.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/import" className="btn-outline"><Sparkles size={16} /> AI Import</Link>
          <label className="btn-outline cursor-pointer" title="Upload .xlsx / .csv with headers: Item Name, SKU, Category Name, Usage unit">
            {uploading ? <><Loader2 size={16} className="animate-spin" /> Uploading…</> : <><Upload size={16} /> Upload Xls</>}
            <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={onUpload} />
          </label>
          <button className="btn-primary" onClick={() => setDrawer('new')}><Plus size={16} /> New Item</button>
        </div>
      </div>

      <p className="-mt-2 text-xs text-ink-400">Bulk upload format — headers: <span className="font-semibold text-ink-600">Item Name</span>, <span className="font-semibold text-ink-600">SKU</span>, <span className="font-semibold text-ink-600">Category Name</span>, <span className="font-semibold text-ink-600">Usage unit</span>. Item Name is required; duplicate names get the SKU appended; each item gets a unique ID.</p>

      {toast && <div className="rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white">{toast}</div>}
      {list && list.length >= 500 && <p className="text-xs text-amber-600">Large catalogue — showing the 500 most-recent items. Use search to find any specific item.</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" placeholder="Search name, base name or tag…" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {['All', ...CATEGORIES].map((c) => (
                  <button key={c} onClick={() => setCat(c)}
                    className={`chip border ${cat === c ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500 hover:bg-ink-50'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            {activeTag && (
              <div className="mt-3 flex items-center gap-2 text-sm text-ink-500">
                <Filter size={14} /> Tag: <Tag tone="brand" onRemove={() => setActiveTag(null)}>{activeTag}</Tag>
              </div>
            )}
          </Card>

          {list === null ? (
            <Card><Spinner label="Loading items…" /></Card>
          ) : list.length === 0 ? (
            <Card className="p-6"><Empty icon={Package} title="No items" hint="Add one or import a document." /></Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">Item</th>
                    <th className="px-5 py-3">SKU</th>
                    <th className="px-5 py-3">Base / Tags</th>
                    <th className="px-5 py-3">Usage Unit</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3 text-right">Last Bought</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {list.map((it) => (
                    <tr key={it.id} className="group hover:bg-ink-50/60">
                      <td className="px-5 py-3 max-w-md">
                        <p className="font-semibold text-ink-800">
                          {it.name}
                          {it.spec && <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-xs font-medium text-ink-500">{it.spec}</span>}
                        </p>
                        {it.description && <ExpandableText text={it.description} clamp={90} className="mt-0.5 text-xs text-ink-400" />}
                        <p className="text-xs text-ink-400">{[it.brand, it.model, it.partNo].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-5 py-3 text-ink-600">{it.sku || <span className="text-ink-300">—</span>}</td>
                      <td className="px-5 py-3">
                        <ClampList
                          items={[it.baseName, ...it.tags.filter((t) => t !== it.baseName)]}
                          limit={4}
                          render={(t) =>
                            t === it.baseName ? (
                              <span key={t} className="chip bg-emerald-50 text-emerald-700">{t}</span>
                            ) : (
                              <button key={t} onClick={() => setActiveTag(t)}><Tag tone={activeTag === t ? 'brand' : 'ink'}>{t}</Tag></button>
                            )
                          }
                        />
                      </td>
                      <td className="px-5 py-3 text-ink-600">{it.uom}</td>
                      <td className="px-5 py-3 text-ink-600">{it.category}</td>
                      <td className="px-5 py-3 text-right">
                        {it.lastBoughtPrice != null ? <p className="font-semibold text-ink-800">${Number(it.lastBoughtPrice).toFixed(2)}</p> : <span className="text-ink-300">—</span>}
                        {it.priceHistory?.length > 0 && (
                          <button onClick={() => setChartItem(it)} className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 hover:underline" title="View price history graph">
                            <TrendingUp size={11} /> View graph ({it.priceHistory.length})
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                          <button onClick={() => setDrawer(it)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><Pencil size={15} /></button>
                          <button onClick={() => del(it.id)} className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-800"><TagIcon size={16} className="text-brand-500" /> All Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((t) => (
                <button key={t} onClick={() => setActiveTag(activeTag === t ? null : t)}>
                  <Tag tone={activeTag === t ? 'brand' : 'ink'}>{t}</Tag>
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-4 text-xs text-ink-500">
            <p className="mb-1 font-semibold text-ink-700">How tagging works</p>
            <p><b>Sand 5kg</b> and <b>Sand 10kg</b> are separate items, but both carry the base tag <b>Sand</b> — size is ignored. No duplicate tags are ever created.</p>
          </Card>
        </div>
      </div>

      <ItemDrawer open={!!drawer} item={drawer === 'new' ? null : drawer} suggestions={allTags} onClose={() => setDrawer(null)} onSave={save} />

      {chartItem && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm" onClick={() => setChartItem(null)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-card-lg animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-ink-900">{chartItem.name}</h2>
                <p className="text-sm text-ink-400">Price history · last bought <b className="text-ink-700">${Number(chartItem.lastBoughtPrice).toFixed(2)}</b> · {chartItem.priceHistory.length} purchase{chartItem.priceHistory.length > 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setChartItem(null)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><X size={18} /></button>
            </div>
            <div className="h-64"><PriceTrend history={chartItem.priceHistory} /></div>
            <div className="mt-3 max-h-40 space-y-1 overflow-auto">
              {[...chartItem.priceHistory].sort((a, b) => b.at - a.at).map((h, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-1.5 text-xs">
                  <span className="font-semibold text-ink-800">${Number(h.price).toFixed(2)} <span className="font-normal text-ink-400">× {h.qty ?? '—'} {chartItem.uom}</span></span>
                  <span className="text-ink-400">{h.supplierName || '—'}{h.rfqId ? ` · ${h.rfqId}` : ''} · {new Date(h.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemDrawer({ open, item, suggestions, onClose, onSave }) {
  const [form, setForm] = useState(empty)
  useEffect(() => { setForm(item ? { ...empty, ...item } : empty) }, [item, open])
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  // Live preview of the derived base tag
  const base = (form.name || '').split(/[\s,]+/).filter((t) => t && !/^\d+([.,/x×]\d+)*\s*[a-z"']*$/i.test(t)).join(' ') || form.name

  return (
    <Drawer
      open={open}
      title={item ? 'Edit Item' : 'New Item'}
      subtitle="Keep size in the name (e.g. Sand 5kg) — the base tag is derived."
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!form.name} onClick={() => onSave(form)}>Save</button>
        </>
      }
    >
      <div>
        <label className="label">Item name *</label>
        <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Inlined cabinet type exhaust fan" />
        {form.name && <p className="mt-1.5 text-xs text-ink-400">Base tag → <span className="font-semibold text-emerald-600">{base}</span></p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">SKU</label><input className="input" value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="e.g. PCU-B-100" /></div>
        <div><label className="label">Spec / variant</label><input className="input" value={form.spec} onChange={(e) => set('spec', e.target.value)} placeholder="e.g. 7.5kW, 3 phase" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Usage unit</label>
          <select className="input" value={form.uom} onChange={(e) => set('uom', e.target.value)}>{UOMS.map((u) => <option key={u}>{u}</option>)}</select>
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">Brand</label><input className="input" value={form.brand} onChange={(e) => set('brand', e.target.value)} /></div>
        <div><label className="label">Model</label><input className="input" value={form.model} onChange={(e) => set('model', e.target.value)} /></div>
        <div><label className="label">Part No.</label><input className="input" value={form.partNo} onChange={(e) => set('partNo', e.target.value)} /></div>
      </div>
      <div><label className="label">Description</label><textarea className="input min-h-20" value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
      <div>
        <label className="label">Extra tags</label>
        <TagInput value={form.tags} onChange={(t) => set('tags', t)} suggestions={suggestions} />
      </div>

      {item?.priceHistory?.length > 0 && (
        <div className="border-t border-ink-100 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="label mb-0">Price history</label>
            <span className="text-xs text-ink-400">Last bought <b className="text-ink-800">${Number(item.lastBoughtPrice).toFixed(2)}</b></span>
          </div>
          <div className="h-44 rounded-xl border border-ink-100 p-2"><PriceTrend history={item.priceHistory} /></div>
          <div className="mt-2 space-y-1">
            {[...item.priceHistory].sort((a, b) => b.at - a.at).map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-1.5 text-xs">
                <span className="font-semibold text-ink-800">${Number(h.price).toFixed(2)} <span className="font-normal text-ink-400">× {h.qty ?? '—'} {item.uom}</span></span>
                <span className="text-ink-400">{h.supplierName || '—'}{h.rfqId ? ` · ${h.rfqId}` : ''} · {new Date(h.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Drawer>
  )
}
