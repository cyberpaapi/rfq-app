import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Package, Pencil, Trash2, Tag as TagIcon, Sparkles, Filter } from 'lucide-react'
import { Items, Tags } from '../api/client'
import { Card, Spinner, Tag, TagInput, Drawer, Empty, ClampList, ExpandableText } from '../components/ui'

const CATEGORIES = ['Electronics', 'Raw Materials', 'Services', 'General']
const UOMS = ['PCS', 'NOS', 'KG', 'BAG', 'MTR', 'LTR', 'SET', 'BOX']
const empty = { name: '', spec: '', uom: 'PCS', category: 'General', brand: '', model: '', partNo: '', description: '', tags: [] }

export default function ItemsPage() {
  const [list, setList] = useState(null)
  const [allTags, setAllTags] = useState([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [activeTag, setActiveTag] = useState(null)
  const [drawer, setDrawer] = useState(null)

  const load = useCallback(async () => {
    setList(await Items.list({ q, category: cat === 'All' ? '' : cat, tag: activeTag || '' }))
    setAllTags(await Tags())
  }, [q, cat, activeTag])

  useEffect(() => { load() }, [load])

  const save = async (form) => {
    if (drawer === 'new') await Items.create(form)
    else await Items.update(drawer.id, form)
    setDrawer(null); load()
  }
  const del = async (id) => { if (confirm('Delete this item?')) { await Items.remove(id); load() } }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Item Catalogue</h1>
          <p className="mt-1 text-sm text-ink-500">Standardized items. AI-imported items are matched here automatically, or added if new.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/import" className="btn-outline"><Sparkles size={16} /> AI Import</Link>
          <button className="btn-primary" onClick={() => setDrawer('new')}><Plus size={16} /> New Item</button>
        </div>
      </div>

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
                    <th className="px-5 py-3">Base / Tags</th>
                    <th className="px-5 py-3">UOM</th>
                    <th className="px-5 py-3">Category</th>
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
      <div>
        <label className="label">Spec / variant <span className="font-normal lowercase text-ink-400">(keeps variants distinct)</span></label>
        <input className="input" value={form.spec} onChange={(e) => set('spec', e.target.value)} placeholder="e.g. 7.5kW, 3 phase, with VFD" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">UOM</label>
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
    </Drawer>
  )
}
