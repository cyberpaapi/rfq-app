import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Search, Star, BadgeCheck, MapPin, Mail, Phone, Pencil, Trash2, Tag as TagIcon, Filter,
} from 'lucide-react'
import { Suppliers, Tags } from '../api/client'
import { Card, Avatar, Spinner, Tag, TagInput, Drawer, Empty, ClampList } from '../components/ui'

const CATEGORIES = ['Electronics', 'Raw Materials', 'Services', 'General']
const empty = { name: '', category: 'General', email: '', phone: '', location: '', qualified: true, rating: 4, notes: '', tags: [] }

export default function SuppliersManage() {
  const [list, setList] = useState(null)
  const [allTags, setAllTags] = useState([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [activeTag, setActiveTag] = useState(null)
  const [drawer, setDrawer] = useState(null) // null | 'new' | supplier object

  const load = useCallback(async () => {
    const data = await Suppliers.list({ q, category: cat === 'All' ? '' : cat, tag: activeTag || '' })
    setList(data)
    setAllTags(await Tags())
  }, [q, cat, activeTag])

  useEffect(() => { load() }, [load])

  const save = async (form) => {
    if (drawer === 'new') await Suppliers.create(form)
    else await Suppliers.update(drawer.id, form)
    setDrawer(null)
    load()
  }
  const del = async (id) => { if (confirm('Delete this supplier?')) { await Suppliers.remove(id); load() } }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Suppliers</h1>
          <p className="mt-1 text-sm text-ink-500">Add, edit, categorise and tag your vendors. Tags are searchable.</p>
        </div>
        <button className="btn-primary" onClick={() => setDrawer('new')}><Plus size={16} /> Add Supplier</button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        {/* Main list (left) */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" placeholder="Search name or tag…" />
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
                <Filter size={14} /> Filtered by tag:
                <Tag tone="brand" onRemove={() => setActiveTag(null)}>{activeTag}</Tag>
              </div>
            )}
          </Card>

          {list === null ? (
            <Card><Spinner label="Loading suppliers…" /></Card>
          ) : list.length === 0 ? (
            <Card className="p-6"><Empty icon={Search} title="No suppliers found" hint="Adjust your search or add a new one." /></Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {list.map((s) => (
                <Card key={s.id} className="group p-5 transition hover:shadow-card-lg">
                  <div className="flex items-start gap-3">
                    <Avatar name={s.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-bold text-ink-900">{s.name}</p>
                        {s.qualified && <BadgeCheck size={16} className="shrink-0 text-emerald-500" />}
                      </div>
                      <p className="text-xs text-ink-400">{s.category}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => setDrawer(s)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><Pencil size={15} /></button>
                      <button onClick={() => del(s.id)} className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-ink-500">
                    {s.email && <p className="flex items-center gap-1.5"><Mail size={13} />{s.email}</p>}
                    {s.phone && <p className="flex items-center gap-1.5"><Phone size={13} />{s.phone}</p>}
                    {s.location && <p className="flex items-center gap-1.5"><MapPin size={13} />{s.location}</p>}
                    <p className="flex items-center gap-1.5">
                      <Star size={13} className="fill-amber-400 text-amber-400" />{s.rating || '—'}
                      {s.ratings?.length > 0 && <span className="text-xs text-ink-400">· {s.ratings.length} review{s.ratings.length > 1 ? 's' : ''}</span>}
                    </p>
                  </div>
                  <div className="mt-3">
                    {s.tags.length === 0 ? (
                      <span className="text-xs text-ink-300">No tags</span>
                    ) : (
                      <ClampList
                        items={s.tags}
                        limit={5}
                        render={(t) => (
                          <button key={t} onClick={() => setActiveTag(t)}>
                            <Tag tone={activeTag === t ? 'brand' : 'ink'}>{t}</Tag>
                          </button>
                        )}
                      />
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right side panel — searchable tags */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-800">
              <TagIcon size={16} className="text-brand-500" /> Tags
            </div>
            <p className="mb-3 text-xs text-ink-400">Click a tag to filter suppliers that carry it.</p>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((t) => (
                <button key={t} onClick={() => setActiveTag(activeTag === t ? null : t)}>
                  <Tag tone={activeTag === t ? 'brand' : 'ink'}>{t}</Tag>
                </button>
              ))}
              {allTags.length === 0 && <span className="text-xs text-ink-300">No tags yet</span>}
            </div>
          </Card>
        </div>
      </div>

      <SupplierDrawer
        open={!!drawer}
        supplier={drawer === 'new' ? null : drawer}
        suggestions={allTags}
        onClose={() => setDrawer(null)}
        onSave={save}
      />
    </div>
  )
}

function SupplierDrawer({ open, supplier, suggestions, onClose, onSave }) {
  const [form, setForm] = useState(empty)
  useEffect(() => { setForm(supplier ? { ...empty, ...supplier } : empty) }, [supplier, open])
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Drawer
      open={open}
      title={supplier ? 'Edit Supplier' : 'Add Supplier'}
      subtitle="Tags are auto-added when you assign RFQ items too."
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!form.name} onClick={() => onSave(form)}>Save</button>
        </>
      }
    >
      <div><label className="label">Name *</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
      <div>
        <label className="label">Category</label>
        <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
      </div>
      <div><label className="label">Location</label><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Rating</label><input type="number" min="0" max="5" step="0.1" className="input" value={form.rating} onChange={(e) => set('rating', +e.target.value)} /></div>
        <div className="flex items-end pb-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
            <input type="checkbox" checked={form.qualified} onChange={(e) => set('qualified', e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Qualified
          </label>
        </div>
      </div>
      <div>
        <label className="label">Tags <span className="font-normal lowercase text-ink-400">(unlimited)</span></label>
        <TagInput value={form.tags} onChange={(t) => set('tags', t)} suggestions={suggestions} />
      </div>
      <div><label className="label">Notes</label><textarea className="input min-h-20" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
    </Drawer>
  )
}
