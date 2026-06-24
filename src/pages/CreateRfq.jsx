import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, FileSpreadsheet, ListTree, Search,
  Plus, Trash2, ChevronRight, Star, Upload, Loader2, Sparkles,
} from 'lucide-react'
import { Items, Suppliers, Rfqs, Ingest } from '../api/client'
import { categories } from '../data/mock'
import { Card, Avatar, Empty, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { Lock } from 'lucide-react'

const steps = ['Details', 'Items', 'Suppliers', 'Review']

export default function CreateRfq() {
  const nav = useNavigate()
  const { can } = useAuth()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    title: '', description: '', currency: 'USD', deadline: '', validity: '',
    deliveryLocation: '', paymentTerms: '30 days net', category: 'Electronics', budget: '',
  })
  const [catalogue, setCatalogue] = useState([])
  const [imported, setImported] = useState([]) // items parsed from an Excel/doc upload
  const [lines, setLines] = useState([])        // selected RFQ lines
  const [suppliers, setSuppliers] = useState([])
  const [picked, setPicked] = useState([])
  const [openGroups, setOpenGroups] = useState([])
  const [catFilter, setCatFilter] = useState('All')
  const [itemQuery, setItemQuery] = useState('')
  const [supQuery, setSupQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    Items.list().then((items) => {
      setCatalogue(items)
      setOpenGroups([...new Set(items.map((i) => i.category || 'General'))])
    })
    Suppliers.list().then(setSuppliers)
  }, [])

  // Group catalogue + imported items into a pickable tree.
  const groups = useMemo(() => {
    const all = [
      ...imported.map((i) => ({ ...i, _group: 'Imported from file' })),
      ...catalogue.map((i) => ({ ...i, _group: i.category || 'General' })),
    ].filter((i) => {
      if (!itemQuery) return true
      const q = itemQuery.toLowerCase()
      return (i.name || '').toLowerCase().includes(q) || (i.baseName || '').toLowerCase().includes(q) || (i.tags || []).some((t) => t.toLowerCase().includes(q))
    })
    const map = {}
    for (const it of all) { (map[it._group] ??= []).push(it) }
    // Imported group first.
    return Object.entries(map).sort((a, b) => (a[0] === 'Imported from file' ? -1 : b[0] === 'Imported from file' ? 1 : 0))
  }, [catalogue, imported, itemQuery])

  const lineKey = (it) => it.itemId || it.id || it.name
  const addItem = (it) => {
    const key = lineKey(it)
    if (lines.find((x) => x._key === key)) return
    setLines((prev) => [...prev, {
      _key: key, itemId: it.itemId || it.id || null, name: it.name, spec: it.spec || '',
      description: it.description || '', brand: it.brand || '', model: it.model || '', partNo: it.partNo || '',
      uom: it.uom || 'PCS', qty: it.quantity || 1, secondaryRequirements: it.secondaryRequirements || '', remark: '', requiredDeliveryDate: '', photo: '', attachment: '',
    }])
  }
  const removeItem = (key) => setLines((prev) => prev.filter((x) => x._key !== key))
  const updItem = (key, k, v) => setLines((prev) => prev.map((x) => (x._key === key ? { ...x, [k]: v } : x)))
  const toggleGroup = (g) => setOpenGroups((o) => (o.includes(g) ? o.filter((x) => x !== g) : [...o, g]))
  const toggleSupplier = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const importExcel = async (file) => {
    if (!file) return
    setImporting(true)
    try {
      const res = await Ingest(file)
      // Land parsed rows in the "Imported" group so the user can pick which to include.
      setImported(res.items.map((it) => ({ ...it, id: it.itemId || `imp-${it.name}-${it.spec}` })))
      setOpenGroups((o) => (o.includes('Imported from file') ? o : ['Imported from file', ...o]))
    } finally { setImporting(false) }
  }

  const sortedSuppliers = useMemo(() => {
    return [...suppliers]
      .filter((s) => catFilter === 'All' || s.category === catFilter)
      .filter((s) => !supQuery || s.name.toLowerCase().includes(supQuery.toLowerCase()) || (s.tags || []).some((t) => t.toLowerCase().includes(supQuery.toLowerCase())))
      .sort((a, b) => Number(b.previouslyInvited) - Number(a.previouslyInvited))
  }, [suppliers, catFilter, supQuery])

  const canNext =
    (step === 0 && form.title && form.deadline) ||
    (step === 1 && lines.length > 0) ||
    (step === 2 && picked.length > 0) ||
    step === 3

  const save = async (publish) => {
    setSaving(true)
    try {
      const rfq = await Rfqs.create({
        title: form.title, description: form.description, category: form.category,
        currency: form.currency, deadline: form.deadline, validity: form.validity,
        deliveryLocation: form.deliveryLocation, paymentTerms: form.paymentTerms,
        budget: Number(form.budget) || 0,
        lines: lines.map((l) => ({
          itemId: l.itemId, name: l.name, spec: l.spec, description: l.description,
          qty: Number(l.qty) || 1, uom: l.uom, brand: l.brand, model: l.model, partNo: l.partNo,
          secondaryRequirements: l.secondaryRequirements, remark: l.remark, requiredDeliveryDate: l.requiredDeliveryDate, photo: l.photo, attachment: l.attachment,
        })),
      })
      // Assign the chosen suppliers (full RFQ). This also moves status to Published.
      if (publish) {
        for (const supplierId of picked) await Rfqs.assign(rfq.id, { supplierId, type: 'full' })
      }
      nav(`/rfqs/${rfq.id}`)
    } finally { setSaving(false) }
  }

  if (!can('rfq.create')) {
    return (
      <Card className="p-10">
        <Empty icon={Lock} title="You can't create RFQs" hint="Only Procurement Buyers and Administrators can create RFQs." />
        <div className="text-center"><Link to="/rfqs" className="btn-outline">Back to RFQs</Link></div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/rfqs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"><ArrowLeft size={16} /> Cancel</Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Create RFQ</h1>
          <p className="mt-1 text-sm text-ink-500">RFQ number is assigned automatically on save. Prefer AI Import for big documents — <Link to="/import" className="font-semibold text-brand-600">try it</Link>.</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <div className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white ring-4 ring-brand-500/15' : 'bg-ink-100 text-ink-400'}`}>{i < step ? <Check size={15} /> : i + 1}</div>
              <span className={`text-sm font-semibold ${i === step ? 'text-brand-700' : 'text-ink-400'}`}>{s}</span>
            </div>
            {i < steps.length - 1 && <div className={`mx-3 h-0.5 flex-1 rounded ${i < step ? 'bg-emerald-400' : 'bg-ink-100'}`} />}
          </div>
        ))}
      </div>

      <Card className="p-6">
        {/* STEP 0 — Details */}
        {step === 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label">RFQ Title *</label><input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Landscape Lighting — Phase 2" /></div>
            <div className="sm:col-span-2"><label className="label">Description</label><textarea className="input min-h-24" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Scope, context and special instructions…" /></div>
            <div><label className="label">Category</label><select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label">Currency</label><select className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)}><option>USD</option><option>INR</option><option>EUR</option></select></div>
            <div><label className="label">Submission Deadline *</label><input type="date" className="input" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} /></div>
            <div><label className="label">Validity Period</label><input type="date" className="input" value={form.validity} onChange={(e) => set('validity', e.target.value)} /></div>
            <div><label className="label">Delivery Location</label><input className="input" value={form.deliveryLocation} onChange={(e) => set('deliveryLocation', e.target.value)} placeholder="OPRO Warehouse, Pune" /></div>
            <div><label className="label">Payment Terms</label><input className="input" value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} /></div>
            <div><label className="label">Budget (optional)</label><input type="number" min="0" className="input" value={form.budget} onChange={(e) => set('budget', e.target.value)} placeholder="9500" /></div>
            <div className="sm:col-span-2">
              <label className="label">Supporting Documents</label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 py-6 text-sm text-ink-400 hover:bg-ink-50">
                <Upload size={16} /> Attach specs, drawings or compliance docs
                <input type="file" hidden multiple onChange={(e) => {
                  const names = [...e.target.files].map((f) => ({ name: f.name }))
                  set('attachments', [...(form.attachments || []), ...names])
                }} />
              </label>
              {form.attachments?.length > 0 && <p className="mt-2 text-xs text-ink-500">{form.attachments.map((a) => a.name).join(', ')}</p>}
            </div>
          </div>
        )}

        {/* STEP 1 — Items */}
        {step === 1 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="btn-outline cursor-pointer text-xs">
                  {importing ? <><Loader2 size={14} className="animate-spin" /> Reading…</> : <><FileSpreadsheet size={14} /> Import from Excel</>}
                  <input type="file" hidden accept=".xlsx,.xls,.csv,.txt,.pdf" onChange={(e) => e.target.files[0] && importExcel(e.target.files[0])} />
                </label>
                <span className="text-xs text-ink-400">or pick from the catalogue</span>
              </div>
              <div className="relative mb-2">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} className="input py-2 pl-9" placeholder="Search items…" />
              </div>
              <div className="rounded-xl border border-ink-100">
                <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2 text-xs font-semibold text-ink-500"><ListTree size={14} /> Item Catalogue</div>
                <div className="max-h-96 overflow-auto p-2">
                  {groups.length === 0 && <p className="py-8 text-center text-sm text-ink-400">No items. Import a file or add to the catalogue.</p>}
                  {groups.map(([group, items]) => (
                    <div key={group} className="mb-1">
                      <button onClick={() => toggleGroup(group)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                        <ChevronRight size={14} className={`transition ${openGroups.includes(group) ? 'rotate-90' : ''}`} />
                        {group === 'Imported from file' && <Sparkles size={13} className="text-brand-500" />}
                        {group}
                        <span className="ml-auto text-xs font-normal text-ink-400">{items.length}</span>
                      </button>
                      {openGroups.includes(group) && (
                        <div className="ml-4 space-y-1 border-l border-ink-100 pl-2">
                          {items.map((it) => {
                            const added = lines.find((x) => x._key === lineKey(it))
                            return (
                              <button key={lineKey(it)} onClick={() => addItem(it)} disabled={!!added}
                                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${added ? 'cursor-default text-ink-300' : 'text-ink-600 hover:bg-brand-50 hover:text-brand-700'}`}>
                                <span className="flex-1">{it.name} {it.spec && <span className="text-xs text-ink-400">· {it.spec}</span>}</span>
                                {added ? <Check size={14} className="text-emerald-500" /> : <Plus size={14} />}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold text-ink-800">Selected Items</p>
                <span className="chip bg-brand-50 text-brand-700">{lines.length}</span>
              </div>
              {lines.length === 0 ? (
                <div className="grid h-64 place-items-center rounded-xl border-2 border-dashed border-ink-200 text-sm text-ink-400">Add items from the catalogue</div>
              ) : (
                <div className="max-h-96 space-y-2 overflow-auto pr-1">
                  {lines.map((it) => (
                    <div key={it._key} className="rounded-xl border border-ink-100 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-800">{it.name}{it.spec && <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-500">{it.spec}</span>}</p>
                          <p className="text-xs text-ink-400">{[it.brand, it.model, it.partNo].filter(Boolean).join(' · ') || '—'}</p>
                        </div>
                        <button onClick={() => removeItem(it._key)} className="text-ink-300 hover:text-rose-500"><Trash2 size={16} /></button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5">
                          <input type="number" min={1} value={it.qty} onChange={(e) => updItem(it._key, 'qty', Math.max(1, +e.target.value))} className="input w-20 py-1.5" />
                          <span className="text-xs text-ink-400">{it.uom}</span>
                        </div>
                        <input type="date" value={it.requiredDeliveryDate} onChange={(e) => updItem(it._key, 'requiredDeliveryDate', e.target.value)} title="Required delivery date" className="input py-1.5" />
                        <input value={it.remark} onChange={(e) => updItem(it._key, 'remark', e.target.value)} placeholder="Remark" className="input col-span-2 py-1.5" />
                        <input value={it.secondaryRequirements} onChange={(e) => updItem(it._key, 'secondaryRequirements', e.target.value)} placeholder="Secondary requirements (e.g. panel board for a fan)" className="input col-span-2 py-1.5" />
                        <label className="col-span-2 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-ink-200 px-2 py-1.5 text-xs text-ink-400 hover:bg-ink-50">
                          <Upload size={13} /> {it.photo || 'Photo (browse)'}
                          <input type="file" hidden accept="image/*" onChange={(e) => e.target.files[0] && updItem(it._key, 'photo', e.target.files[0].name)} />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2 — Suppliers */}
        {step === 2 && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input value={supQuery} onChange={(e) => setSupQuery(e.target.value)} className="input pl-9" placeholder="Search suppliers…" />
              </div>
              <div className="flex items-center gap-1.5">
                {['All', ...categories].map((c) => (
                  <button key={c} onClick={() => setCatFilter(c)} className={`chip border ${catFilter === c ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500 hover:bg-ink-50'}`}>{c}</button>
                ))}
              </div>
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Previously invited suppliers appear first</p>
            {sortedSuppliers.length === 0 ? <Empty icon={Search} title="No suppliers match" /> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {sortedSuppliers.map((s) => {
                  const sel = picked.includes(s.id)
                  return (
                    <button key={s.id} onClick={() => toggleSupplier(s.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${sel ? 'border-brand-400 bg-brand-50/60 ring-2 ring-brand-500/10' : 'border-ink-100 hover:bg-ink-50'}`}>
                      <Avatar name={s.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-semibold text-ink-800">{s.name}</p>
                          {s.previouslyInvited && <span className="chip bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">Recent</span>}
                        </div>
                        <p className="flex items-center gap-2 text-xs text-ink-400">{s.category}<span className="flex items-center gap-0.5"><Star size={11} className="fill-amber-400 text-amber-400" />{s.rating}</span>{!s.qualified && <span className="text-rose-500">· Not qualified</span>}</p>
                      </div>
                      <div className={`grid h-5 w-5 place-items-center rounded-md border ${sel ? 'border-brand-500 bg-brand-600 text-white' : 'border-ink-300'}`}>{sel && <Check size={13} />}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — Review */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="rounded-xl bg-ink-50 p-4">
              <p className="text-lg font-bold text-ink-900">{form.title || 'Untitled RFQ'}</p>
              <p className="text-sm text-ink-500">{form.description || 'No description'}</p>
            </div>
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              {[['Category', form.category], ['Currency', form.currency], ['Deadline', form.deadline || '—'], ['Validity', form.validity || '—'], ['Delivery', form.deliveryLocation || '—'], ['Payment', form.paymentTerms]].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-ink-100 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{k}</p><p className="font-semibold text-ink-800">{v}</p></div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-ink-100 p-4">
                <p className="mb-2 font-bold text-ink-800">{lines.length} Items</p>
                <ul className="space-y-1 text-sm text-ink-600">
                  {lines.map((it) => <li key={it._key}>· {it.name} × {it.qty} {it.uom}</li>)}
                  {lines.length === 0 && <li className="text-ink-400">No items added</li>}
                </ul>
              </div>
              <div className="rounded-xl border border-ink-100 p-4">
                <p className="mb-2 font-bold text-ink-800">{picked.length} Suppliers</p>
                <ul className="space-y-1 text-sm text-ink-600">
                  {picked.map((id) => <li key={id}>· {suppliers.find((s) => s.id === id)?.name}</li>)}
                  {picked.length === 0 && <li className="text-ink-400">No suppliers selected (save as draft)</li>}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Footer nav */}
        <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-5">
          <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ArrowLeft size={16} /> Back</button>
          {step < steps.length - 1 ? (
            <button className="btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next <ArrowRight size={16} /></button>
          ) : (
            <div className="flex gap-2">
              <button className="btn-outline" disabled={saving || lines.length === 0} onClick={() => save(false)}>{saving ? <Loader2 size={16} className="animate-spin" /> : 'Save as Draft'}</button>
              <button className="btn-primary" disabled={saving || lines.length === 0 || picked.length === 0} onClick={() => save(true)}>{saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Check size={16} /> Publish RFQ</>}</button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
