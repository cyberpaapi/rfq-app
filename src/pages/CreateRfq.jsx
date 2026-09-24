import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, FileSpreadsheet, Search,
  Plus, Trash2, ChevronRight, Star, Upload, Loader2,
} from 'lucide-react'
import { Items, Suppliers, Rfqs, Ingest } from '../api/client'
import { categories } from '../data/mock'
import { Card, Avatar, Empty, Spinner } from '../components/ui'
import ItemsTable from '../components/ItemsTable'
import { useAuth } from '../context/AuthContext'
import { Lock } from 'lucide-react'
import { catalogueMatches } from '../../shared/catalogue'
import BrandIcon from '../components/BrandIcon'

const steps = ['Details', 'Items', 'Suppliers', 'Review']

export default function CreateRfq() {
  const nav = useNavigate()
  const { can } = useAuth()
  const [mode, setMode] = useState(null)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    title: '', description: '', currency: 'USD', deadline: '', validity: '',
    deliveryLocation: '', paymentTerms: '30 days net', category: '', budget: '',
  })
  const [catalogue, setCatalogue] = useState([])
  const [catalogueCategories, setCatalogueCategories] = useState([])
  const [catalogueError, setCatalogueError] = useState('')
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
  const [saveError, setSaveError] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    Items.meta().then((meta) => setCatalogueCategories(meta.categories)).catch((e) => setCatalogueError(e.message))
    Suppliers.list().then(setSuppliers)
  }, [])

  useEffect(() => {
    let active = true
    setCatalogue([])
    const timer = setTimeout(() => {
      Items.page({ q: itemQuery, limit: 100 }).then((value) => {
        if (active) { setCatalogue(value.items); setCatalogueError('') }
      }).catch((e) => { if (active) setCatalogueError(e.message) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [itemQuery])

  // Group catalogue + imported items into a pickable tree.
  const groups = useMemo(() => {
    const all = [
      ...imported.map((i) => ({ ...i, _group: 'Imported from file' })),
      ...catalogue.map((i) => ({ ...i, _group: i.category || 'General' })),
    ].filter((i) => {
      if (!itemQuery) return true
      return catalogueMatches(i, itemQuery)
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
      _key: key, itemId: it.itemId || it.id || null, sku: it.sku || '', name: it.name, spec: it.spec || '',
      description: it.description || '', brand: it.brand || '', model: it.model || '', partNo: it.partNo || '',
      uom: it.uom || 'PCS', quantity: it.quantity || 1, secondaryRequirements: it.secondaryRequirements || '', remark: '', requiredDeliveryDate: '', photo: '', attachment: '',
    }])
  }
  const addBlank = () => setLines((prev) => [...prev, { _key: 'new-' + Date.now() + Math.random(), itemId: null, sku: '', name: '', spec: '', description: '', brand: '', model: '', partNo: '', uom: 'PCS', quantity: 1, secondaryRequirements: '', remark: '', requiredDeliveryDate: '', photo: '', attachment: '' }])
  // Index-based handlers for the shared ItemsTable.
  const onLineChange = (i, patch) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const onLineRemove = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i))
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
  const readyLines = lines.filter((line) => typeof line.name === 'string' && line.name.trim())

  const canNext =
    (step === 0 && form.title) ||
    (step === 1 && readyLines.length > 0) ||
    (step === 2 && picked.length > 0) ||
    step === 3

  const save = async (publish) => {
    setSaving(true); setSaveError('')
    try {
      const rfq = await Rfqs.create({
        title: form.title, description: form.description, category: form.category,
        currency: form.currency, deadline: form.deadline, validity: form.validity,
        deliveryLocation: form.deliveryLocation, paymentTerms: form.paymentTerms,
        budget: Number(form.budget) || 0,
        lines: readyLines.map((l) => ({
          itemId: l.itemId, sku: l.sku || '', name: l.name, spec: l.spec, description: l.description,
          qty: Number(l.quantity) || 1, uom: l.uom, brand: l.brand, model: l.model, partNo: l.partNo,
          secondaryRequirements: l.secondaryRequirements, remark: l.remark, requiredDeliveryDate: l.requiredDeliveryDate, photo: l.photo, attachment: l.attachment,
        })),
      })
      // Assign the chosen suppliers (full RFQ). This also moves status to Published.
      if (publish) {
        for (const supplierId of picked) await Rfqs.assign(rfq.id, { supplierId, type: 'full' })
      }
      nav(`/rfqs/${rfq.id}`)
    } catch (error) { setSaveError(error.message) } finally { setSaving(false) }
  }

  if (!can('rfq.create')) {
    return (
      <Card className="p-10">
        <Empty icon="rfq" title="You can't create RFQs" hint="Only Procurement Buyers and Administrators can create RFQs." />
        <div className="text-center"><Link to="/rfqs" className="btn-outline">Back to RFQs</Link></div>
      </Card>
    )
  }

  if (!mode) return (
    <div className="space-y-6">
      <Link to="/rfqs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"><ArrowLeft size={16} /> Back to RFQs</Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Create RFQ</h1>
        <p className="mt-1 text-sm text-ink-500">Choose how to prepare the requested items.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <button type="button" onClick={() => setMode('manual')} className="rounded-2xl border border-ink-200 bg-white p-7 text-left shadow-sm transition hover:border-brand-400 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
          <BrandIcon name="create" size={56} className="mb-5" />
          <span className="block text-xl font-bold text-ink-900">Manual</span>
          <span className="mt-2 block text-sm leading-6 text-ink-600">Enter RFQ details, find items in the catalogue, or add each item yourself. Then choose suppliers and review before saving.</span>
          <span className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-brand-600">Continue manually <ArrowRight size={16} /></span>
        </button>
        {can('ai.use') ? <Link to="/import" className="rounded-2xl border border-ink-200 bg-white p-7 text-left shadow-sm transition hover:border-brand-400 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
          <BrandIcon name="ai" size={56} className="mb-5" />
          <span className="block text-xl font-bold text-ink-900">AI Upload</span>
          <span className="mt-2 block text-sm leading-6 text-ink-600">Upload an item list or specification document. Review and correct the extracted items before creating the RFQ.</span>
          <span className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-brand-600">Upload a document <ArrowRight size={16} /></span>
        </Link> : <div className="rounded-2xl border border-ink-200 bg-ink-50 p-7 text-left opacity-70">
          <span className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-ink-100 text-ink-500"><Lock size={24} /></span>
          <span className="block text-xl font-bold text-ink-900">AI Upload</span>
          <span className="mt-2 block text-sm leading-6 text-ink-600">This role needs AI permission to upload and extract document items.</span>
        </div>}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => setMode(null)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"><ArrowLeft size={16} /> Choose another method</button>

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
            <div><label className="label">Category</label><select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}><option value="">Select category</option>{catalogueCategories.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label">Currency</label><select className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)}><option>USD</option><option>INR</option><option>EUR</option></select></div>
            <div><label className="label">Submission Deadline <span className="font-normal lowercase text-ink-400">(optional)</span></label><input type="date" className="input" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} /></div>
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

        {/* STEP 1 — Items (table) */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-outline cursor-pointer text-sm">
                {importing ? <><Loader2 size={14} className="animate-spin" /> Reading…</> : <><FileSpreadsheet size={14} /> Import from Excel</>}
                <input type="file" hidden accept=".xlsx,.xls,.csv,.txt,.pdf" onChange={(e) => e.target.files[0] && importExcel(e.target.files[0])} />
              </label>
              <button className="btn-outline text-sm" onClick={addBlank}><Plus size={14} /> Add item</button>
              <div className="relative min-w-48 flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} className="input py-2 pl-9" placeholder="Search the catalogue to add an item…" />
              </div>
              <span className="chip bg-brand-50 text-brand-700">{readyLines.length} named items</span>
            </div>

            {catalogueError && <p role="alert" className="text-sm text-rose-700">{catalogueError}</p>}
            {itemQuery && (
              <div className="flex flex-wrap gap-1.5">
                {groups.flatMap(([, items]) => items).slice(0, 14).map((it) => {
                  const added = lines.find((x) => x._key === lineKey(it))
                  return (
                    <button key={lineKey(it)} disabled={!!added} onClick={() => addItem(it)}
                      className={`chip border text-xs ${added ? 'border-ink-200 text-ink-300' : 'border-brand-200 text-brand-700 hover:bg-brand-50'}`}>
                      {added ? <Check size={12} /> : <Plus size={12} />} {it.name}{it.spec ? ` · ${it.spec}` : ''}
                    </button>
                  )
                })}
                {groups.flatMap(([, items]) => items).length === 0 && <span className="text-xs text-ink-400">No catalogue match — use “Add item” to add a blank row.</span>}
              </div>
            )}

            <ItemsTable rows={lines} onChange={onLineChange} onRemove={onLineRemove} mappable emptyHint="Import from Excel, search the catalogue, or click “Add item”." />
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
            {sortedSuppliers.length === 0 ? <Empty icon="suppliers" title="No suppliers match" /> : (
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
                <p className="mb-2 font-bold text-ink-800">{readyLines.length} Items</p>
                <ul className="space-y-1 text-sm text-ink-600">
                  {readyLines.map((it) => <li key={it._key}>· {it.name} × {it.quantity} {it.uom}</li>)}
                  {readyLines.length === 0 && <li className="text-ink-400">No named items added</li>}
                </ul>
                {lines.length > readyLines.length && <p className="mt-2 text-xs text-amber-700">{lines.length - readyLines.length} blank item row(s) will be skipped.</p>}
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
        {saveError && <p role="alert" className="mt-5 text-sm text-rose-700">{saveError}</p>}
        <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-5">
          <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ArrowLeft size={16} /> Back</button>
          {step < steps.length - 1 ? (
            <button className="btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next <ArrowRight size={16} /></button>
          ) : (
            <div className="flex gap-2">
              <button className="btn-outline" disabled={saving || readyLines.length === 0} onClick={() => save(false)}>{saving ? <Loader2 size={16} className="animate-spin" /> : 'Save as Draft'}</button>
              <button className="btn-primary" disabled={!can('rfq.publish') || saving || readyLines.length === 0 || picked.length === 0} onClick={() => save(true)}>{saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Check size={16} /> Publish RFQ</>}</button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
