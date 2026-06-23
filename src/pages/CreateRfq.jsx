import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, FileSpreadsheet, ListTree, Search,
  Plus, Trash2, ChevronRight, Star, Upload,
} from 'lucide-react'
import { itemTree, suppliers, categories } from '../data/mock'
import { Card, Avatar, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { Lock } from 'lucide-react'

const steps = ['Details', 'Items', 'Suppliers', 'Review']

export default function CreateRfq() {
  const nav = useNavigate()
  const { can } = useAuth()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    title: '', description: '', currency: 'USD', deadline: '', validity: '',
    location: '', payment: '30 days net', category: 'Electronics',
  })
  const [items, setItems] = useState([])
  const [picked, setPicked] = useState([])
  const [openGroups, setOpenGroups] = useState(() => itemTree.map((g) => g.group))
  const [catFilter, setCatFilter] = useState('All')

  const rfqNo = 'RFQ-2026-' + String(43 + Math.floor(Math.random() * 50)).padStart(4, '0')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const addItem = (it) => {
    if (items.find((x) => x.part === it.part)) return
    setItems((prev) => [...prev, { ...it, qty: 1, desc: '', sno: prev.length + 1 }])
  }
  const removeItem = (part) => setItems((prev) => prev.filter((x) => x.part !== part).map((x, i) => ({ ...x, sno: i + 1 })))
  const updItem = (part, k, v) => setItems((prev) => prev.map((x) => (x.part === part ? { ...x, [k]: v } : x)))

  const toggleSupplier = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const toggleGroup = (g) => setOpenGroups((o) => (o.includes(g) ? o.filter((x) => x !== g) : [...o, g]))

  const sortedSuppliers = [...suppliers]
    .filter((s) => catFilter === 'All' || s.category === catFilter)
    .sort((a, b) => Number(b.previouslyInvited) - Number(a.previouslyInvited))

  const canNext =
    (step === 0 && form.title && form.deadline) ||
    (step === 1 && items.length > 0) ||
    (step === 2 && picked.length > 0) ||
    step === 3

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
      <Link to="/rfqs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800">
        <ArrowLeft size={16} /> Cancel
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Create RFQ</h1>
          <p className="mt-1 text-sm text-ink-500">Auto-generated number <span className="font-semibold text-brand-600">{rfqNo}</span></p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <div className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition ${
                i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white ring-4 ring-brand-500/15' : 'bg-ink-100 text-ink-400'
              }`}>
                {i < step ? <Check size={15} /> : i + 1}
              </div>
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
            <div className="sm:col-span-2">
              <label className="label">RFQ Title *</label>
              <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Landscape Lighting — Phase 2" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea className="input min-h-24" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Scope, context and special instructions…" />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                <option>USD</option><option>INR</option><option>EUR</option>
              </select>
            </div>
            <div>
              <label className="label">Submission Deadline *</label>
              <input type="date" className="input" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
            </div>
            <div>
              <label className="label">Validity Period</label>
              <input type="date" className="input" value={form.validity} onChange={(e) => set('validity', e.target.value)} />
            </div>
            <div>
              <label className="label">Delivery Location</label>
              <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="OPRO Warehouse, Pune" />
            </div>
            <div>
              <label className="label">Payment Terms</label>
              <input className="input" value={form.payment} onChange={(e) => set('payment', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Supporting Documents</label>
              <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 py-6 text-sm text-ink-400">
                <Upload size={16} /> Drag & drop specs, drawings or compliance docs
              </div>
            </div>
          </div>
        )}

        {/* STEP 1 — Items */}
        {step === 1 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <button className="btn-outline text-xs"><FileSpreadsheet size={14} /> Import from Excel</button>
                <span className="text-xs text-ink-400">or pick from the catalogue tree</span>
              </div>
              <div className="rounded-xl border border-ink-100">
                <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2 text-xs font-semibold text-ink-500">
                  <ListTree size={14} /> Item Catalogue
                </div>
                <div className="max-h-96 overflow-auto p-2">
                  {itemTree.map((g) => (
                    <div key={g.group} className="mb-1">
                      <button onClick={() => toggleGroup(g.group)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                        <ChevronRight size={14} className={`transition ${openGroups.includes(g.group) ? 'rotate-90' : ''}`} />
                        {g.group}
                        <span className="ml-auto text-xs font-normal text-ink-400">{g.items.length}</span>
                      </button>
                      {openGroups.includes(g.group) && (
                        <div className="ml-4 space-y-1 border-l border-ink-100 pl-2">
                          {g.items.map((it) => {
                            const added = items.find((x) => x.part === it.part)
                            return (
                              <button
                                key={it.part}
                                onClick={() => addItem(it)}
                                disabled={!!added}
                                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                                  added ? 'cursor-default text-ink-300' : 'text-ink-600 hover:bg-brand-50 hover:text-brand-700'
                                }`}
                              >
                                <span className="flex-1">{it.name} <span className="text-xs text-ink-400">· {it.model}</span></span>
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
                <span className="chip bg-brand-50 text-brand-700">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="grid h-64 place-items-center rounded-xl border-2 border-dashed border-ink-200 text-sm text-ink-400">
                  Add items from the catalogue
                </div>
              ) : (
                <div className="max-h-96 space-y-2 overflow-auto pr-1">
                  {items.map((it) => (
                    <div key={it.part} className="rounded-xl border border-ink-100 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-800">{it.name}</p>
                          <p className="text-xs text-ink-400">{it.brand} · {it.model} · {it.part}</p>
                        </div>
                        <button onClick={() => removeItem(it.part)} className="text-ink-300 hover:text-rose-500"><Trash2 size={16} /></button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number" min={1} value={it.qty}
                          onChange={(e) => updItem(it.part, 'qty', Math.max(1, +e.target.value))}
                          className="input w-24 py-1.5"
                        />
                        <span className="text-xs text-ink-400">{it.uom}</span>
                        <input
                          value={it.desc} onChange={(e) => updItem(it.part, 'desc', e.target.value)}
                          placeholder="Spec / remark" className="input flex-1 py-1.5"
                        />
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
                <input className="input pl-9" placeholder="Search suppliers…" />
              </div>
              <div className="flex items-center gap-1.5">
                {['All', ...categories].map((c) => (
                  <button key={c} onClick={() => setCatFilter(c)}
                    className={`chip border ${catFilter === c ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500 hover:bg-ink-50'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Previously invited suppliers appear first
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {sortedSuppliers.map((s) => {
                const sel = picked.includes(s.id)
                return (
                  <button key={s.id} onClick={() => toggleSupplier(s.id)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                      sel ? 'border-brand-400 bg-brand-50/60 ring-2 ring-brand-500/10' : 'border-ink-100 hover:bg-ink-50'
                    }`}>
                    <Avatar name={s.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-semibold text-ink-800">{s.name}</p>
                        {s.previouslyInvited && <span className="chip bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">Recent</span>}
                      </div>
                      <p className="flex items-center gap-2 text-xs text-ink-400">
                        {s.category}
                        <span className="flex items-center gap-0.5"><Star size={11} className="fill-amber-400 text-amber-400" />{s.rating}</span>
                        {!s.qualified && <span className="text-rose-500">· Not qualified</span>}
                      </p>
                    </div>
                    <div className={`grid h-5 w-5 place-items-center rounded-md border ${sel ? 'border-brand-500 bg-brand-600 text-white' : 'border-ink-300'}`}>
                      {sel && <Check size={13} />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* STEP 3 — Review */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="rounded-xl bg-ink-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{rfqNo}</p>
              <p className="text-lg font-bold text-ink-900">{form.title || 'Untitled RFQ'}</p>
              <p className="text-sm text-ink-500">{form.description || 'No description'}</p>
            </div>
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              {[
                ['Category', form.category], ['Currency', form.currency], ['Deadline', form.deadline || '—'],
                ['Validity', form.validity || '—'], ['Delivery', form.location || '—'], ['Payment', form.payment],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-ink-100 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{k}</p>
                  <p className="font-semibold text-ink-800">{v}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-ink-100 p-4">
                <p className="mb-2 font-bold text-ink-800">{items.length} Items</p>
                <ul className="space-y-1 text-sm text-ink-600">
                  {items.map((it) => <li key={it.part}>· {it.name} × {it.qty} {it.uom}</li>)}
                  {items.length === 0 && <li className="text-ink-400">No items added</li>}
                </ul>
              </div>
              <div className="rounded-xl border border-ink-100 p-4">
                <p className="mb-2 font-bold text-ink-800">{picked.length} Suppliers</p>
                <ul className="space-y-1 text-sm text-ink-600">
                  {picked.map((id) => <li key={id}>· {suppliers.find((s) => s.id === id)?.name}</li>)}
                  {picked.length === 0 && <li className="text-ink-400">No suppliers selected</li>}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Footer nav */}
        <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-5">
          <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft size={16} /> Back
          </button>
          {step < steps.length - 1 ? (
            <button className="btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Next <ArrowRight size={16} />
            </button>
          ) : (
            <div className="flex gap-2">
              <button className="btn-outline" onClick={() => nav('/rfqs')}>Save as Draft</button>
              <button className="btn-primary" onClick={() => nav('/rfqs')}><Check size={16} /> Publish RFQ</button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
