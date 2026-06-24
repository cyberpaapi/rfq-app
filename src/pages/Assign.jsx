import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Search, Star, BadgeCheck, Check, Users, Send, Split, Package, X, ChevronDown,
  SlidersHorizontal, Trophy, Pencil, Plus, Trash2, Loader2, ListPlus,
} from 'lucide-react'
import { Rfqs, Suppliers, Tags, weightedScore } from '../api/client'
import { Card, Avatar, Spinner, Tag, Empty, StatusBadge, Drawer } from '../components/ui'

const CATEGORIES = ['Electronics', 'Raw Materials', 'Services', 'General']
const SCORE_META = [
  { k: 'price', label: 'Price', color: 'bg-emerald-500' },
  { k: 'quality', label: 'Quality', color: 'bg-brand-500' },
  { k: 'delivery', label: 'Delivery', color: 'bg-amber-500' },
]

// Always-visible Price / Quality / Delivery score bars.
function ScoreBars({ scores = {}, compact }) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {SCORE_META.map((m) => (
        <div key={m.k} className="flex items-center gap-1.5">
          <span className={`${compact ? 'w-12' : 'w-14'} text-[10px] font-semibold uppercase tracking-wide text-ink-400`}>{m.label}</span>
          <div className="h-1.5 flex-1 rounded-full bg-ink-100">
            <div className={`h-full rounded-full ${m.color}`} style={{ width: `${scores?.[m.k] || 0}%` }} />
          </div>
          <span className="w-6 text-right text-[11px] font-bold text-ink-700">{scores?.[m.k] ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

export default function Assign() {
  const { id } = useParams()
  const nav = useNavigate()
  const [rfqs, setRfqs] = useState(null)
  const [rfq, setRfq] = useState(null)
  const [sel, setSel] = useState([])
  const [list, setList] = useState([])
  const [supMap, setSupMap] = useState({}) // all suppliers by id (for assignment scores)
  const [allTags, setAllTags] = useState([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [activeTag, setActiveTag] = useState(null)
  const [toast, setToast] = useState(null)
  const [weights, setWeights] = useState({ price: 30, quality: 40, delivery: 30 })
  const [showWeights, setShowWeights] = useState(false)
  const [rating, setRating] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const ranked = useMemo(() => {
    return [...list]
      .map((s) => ({ s, score: weightedScore(s, weights) }))
      .sort((a, b) => b.score - a.score || Number(b.s.previouslyInvited) - Number(a.s.previouslyInvited))
  }, [list, weights])

  const loadRfq = useCallback(async (rid) => {
    const data = await Rfqs.get(rid)
    setRfq(data)
    setSel(data.lines.map((l) => l.lineId))
  }, [])

  useEffect(() => {
    Rfqs.list().then((all) => {
      setRfqs(all)
      const target = id || all[0]?.id
      if (target) loadRfq(target)
    })
    Tags().then(setAllTags)
    Suppliers.list().then((all) => setSupMap(Object.fromEntries(all.map((s) => [s.id, s]))))
  }, [id, loadRfq])

  const loadSuppliers = useCallback(async () => {
    setList(await Suppliers.list({ q, category: cat === 'All' ? '' : cat, tag: activeTag || '' }))
  }, [q, cat, activeTag])
  useEffect(() => { loadSuppliers() }, [loadSuppliers])

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600) }

  const toggleLine = (lineId) =>
    setSel((s) => (s.includes(lineId) ? s.filter((x) => x !== lineId) : [...s, lineId]))

  const assign = async (supplier, type) => {
    const lineIds = type === 'full' ? rfq.lines.map((l) => l.lineId) : sel
    if (type === 'partial' && lineIds.length === 0) return flash('Select at least one item for a partial RFQ.')
    const res = await Rfqs.assign(rfq.id, { supplierId: supplier.id, type, lineIds })
    await loadRfq(rfq.id)
    await loadSuppliers()
    setAllTags(await Tags())
    flash(`Sent ${type === 'full' ? 'full RFQ' : `${lineIds.length} item(s)`} to ${supplier.name}. Tags updated: ${res.supplierTags.slice(-2).join(', ')}`)
  }

  const unassign = async (supplierId) => { await Rfqs.unassign(rfq.id, supplierId); loadRfq(rfq.id) }

  const submitRating = async ({ stars, note }) => {
    await Suppliers.rate(rating.id, { stars, note, rfqId: rfq.id })
    setRating(null)
    await loadSuppliers()
    flash(`Rated ${rating.name} ${stars}★`)
  }

  const onItemsSaved = async () => { setEditorOpen(false); await loadRfq(rfq.id); flash('Items updated') }

  if (rfqs === null) return <Card><Spinner label="Loading…" /></Card>
  if (!rfq) return <Card className="p-6"><Empty icon={Package} title="No RFQs yet" hint="Import a document to create one." /></Card>

  const assignedTo = (lineId) => rfq.assignments.filter((a) => a.lineIds.includes(lineId))
  const partialCount = sel.length
  const allSelected = partialCount === rfq.lines.length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Assign RFQ</h1>
            <StatusBadge status={rfq.status} />
          </div>
          <p className="mt-1 text-sm text-ink-500">Pick items on the left, choose suppliers on the right. Send the whole RFQ or a partial set.</p>
        </div>
        <RfqPicker rfqs={rfqs} current={rfq} onPick={(rid) => nav(`/assign/${rid}`)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* LEFT — items */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-bold text-ink-900">{rfq.title}</h2>
              <div className="flex items-center gap-3">
                <button onClick={() => setEditorOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  <Pencil size={13} /> Edit / Add items
                </button>
                <button onClick={() => setSel(allSelected ? [] : rfq.lines.map((l) => l.lineId))}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  {allSelected ? 'Clear selection' : 'Select all'}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {rfq.lines.length === 0 && <Empty icon={Package} title="No items yet" hint="Use “Edit / Add items” to add line items." />}
              {rfq.lines.map((l) => {
                const checked = sel.includes(l.lineId)
                const aTo = assignedTo(l.lineId)
                return (
                  <div key={l.lineId} className={`flex items-center gap-3 rounded-xl border p-3 transition ${checked ? 'border-brand-300 bg-brand-50/40' : 'border-ink-100'}`}>
                    <button onClick={() => toggleLine(l.lineId)}
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${checked ? 'border-brand-500 bg-brand-600 text-white' : 'border-ink-300'}`}>
                      {checked && <Check size={13} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-800">
                        {l.name}
                        {l.spec && <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-xs font-medium text-ink-500">{l.spec}</span>}
                      </p>
                      <p className="text-xs text-ink-400">{l.qty} {l.uom}{[l.brand, l.model].filter(Boolean).length ? ` · ${[l.brand, l.model].filter(Boolean).join(' ')}` : ''}{l.requiredDeliveryDate ? ` · by ${l.requiredDeliveryDate}` : ''}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {aTo.map((a) => <span key={a.id} className="chip bg-emerald-50 text-emerald-700">{a.supplierName.split(' ')[0]}</span>)}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-ink-400">{partialCount} of {rfq.lines.length} items selected for partial send.</p>
              <button onClick={() => setEditorOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-ink-300 px-2.5 py-1 text-xs font-semibold text-ink-500 hover:border-brand-300 hover:text-brand-600">
                <ListPlus size={13} /> Add item
              </button>
            </div>
          </Card>

          {rfq.assignments.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-1 font-bold text-ink-900">Current Assignments</h3>
              <p className="mb-3 text-xs text-ink-400">Rate a supplier once their order is complete.</p>
              <div className="space-y-2">
                {rfq.assignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
                    <Avatar name={a.supplierName} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-800">{a.supplierName}</p>
                      <p className="text-xs text-ink-400">{a.type === 'full' ? 'Full RFQ' : `${a.lineIds.length} item(s)`}</p>
                    </div>
                    <div className="hidden w-40 shrink-0 sm:block"><ScoreBars scores={supMap[a.supplierId]?.scores} compact /></div>
                    <span className={`chip ${a.type === 'full' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'}`}>{a.type}</span>
                    <button onClick={() => setRating({ id: a.supplierId, name: a.supplierName })} title="Rate supplier"
                      className="rounded-lg p-1.5 text-ink-400 hover:bg-amber-50 hover:text-amber-600"><Star size={16} /></button>
                    <button onClick={() => unassign(a.supplierId)} title="Remove" className="text-ink-300 hover:text-rose-500"><X size={16} /></button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT — supplier search panel, ranked by weighted score */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-ink-800"><Users size={16} className="text-brand-500" /> Find suppliers</div>
              <button onClick={() => setShowWeights((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                <SlidersHorizontal size={13} /> Weights
              </button>
            </div>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} className="input py-2 pl-9" placeholder="Search name or tag…" />
            </div>

            {showWeights && (
              <div className="mt-3 space-y-2 rounded-xl bg-ink-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Ranking weights</p>
                {['price', 'quality', 'delivery'].map((k) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-16 text-xs capitalize text-ink-600">{k}</span>
                    <input type="range" min="0" max="100" step="5" value={weights[k]}
                      onChange={(e) => setWeights((w) => ({ ...w, [k]: +e.target.value }))} className="flex-1 accent-brand-600" />
                    <span className="w-8 text-right text-xs font-semibold text-brand-600">{weights[k]}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-1">
              {['All', ...CATEGORIES].map((c) => (
                <button key={c} onClick={() => setCat(c)}
                  className={`chip border text-[11px] ${cat === c ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500 hover:bg-ink-50'}`}>{c}</button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {allTags.slice(0, 12).map((t) => (
                <button key={t} onClick={() => setActiveTag(activeTag === t ? null : t)}>
                  <Tag tone={activeTag === t ? 'brand' : 'ink'}>{t}</Tag>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-400">Sorted best-first by weighted score.</p>
          </Card>

          <div className="space-y-2">
            {ranked.map(({ s, score }, i) => (
              <Card key={s.id} className={`p-3 ${i === 0 ? 'ring-1 ring-emerald-200' : ''}`}>
                <div className="flex items-center gap-3">
                  <Avatar name={s.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate font-semibold text-ink-800">
                      {i === 0 && <Trophy size={13} className="shrink-0 text-amber-500" />}
                      {s.name} {s.qualified && <BadgeCheck size={14} className="shrink-0 text-emerald-500" />}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-ink-400"><Star size={11} className="fill-amber-400 text-amber-400" />{s.rating} · {s.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold leading-none text-ink-900">{score.toFixed(0)}</p>
                    <p className="text-[10px] uppercase text-ink-400">score</p>
                  </div>
                </div>
                {/* Always-visible score breakdown — critical for the assign decision. */}
                <div className="mt-2.5 rounded-lg bg-ink-50/70 p-2"><ScoreBars scores={s.scores} /></div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.tags.slice(0, 5).map((t) => <Tag key={t} tone={activeTag === t ? 'brand' : 'ink'}>{t}</Tag>)}
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => assign(s, 'full')} className="btn-primary flex-1 py-1.5 text-xs"><Send size={13} /> Full RFQ</button>
                  <button onClick={() => assign(s, 'partial')} className="btn-outline flex-1 py-1.5 text-xs"><Split size={13} /> Partial</button>
                </div>
              </Card>
            ))}
            {ranked.length === 0 && <Card className="p-5"><Empty icon={Search} title="No suppliers match" /></Card>}
          </div>
        </div>
      </div>

      <ItemsEditor open={editorOpen} rfq={rfq} onClose={() => setEditorOpen(false)} onSaved={onItemsSaved} />
      <RatingDialog supplier={rating} onClose={() => setRating(null)} onSubmit={submitRating} />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-card-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}

// Add / edit / remove RFQ line items, then persist via PUT /rfqs/:id.
function ItemsEditor({ open, rfq, onClose, onSaved }) {
  const [lines, setLines] = useState([])
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { if (open) { setLines(rfq.lines.map((l) => ({ ...l }))); setExpanded(null) } }, [open, rfq])

  const upd = (i, k, v) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const add = () => setLines((ls) => [...ls, { name: '', spec: '', qty: 1, uom: 'PCS', brand: '', model: '', partNo: '', remark: '', requiredDeliveryDate: '', description: '' }])
  const remove = (i) => setLines((ls) => ls.filter((_, idx) => idx !== i))

  const save = async () => {
    setSaving(true)
    try {
      const clean = lines.filter((l) => (l.name || '').trim()).map((l) => ({
        lineId: l.lineId, itemId: l.itemId || null, name: l.name, spec: l.spec || '', description: l.description || '',
        qty: Number(l.qty) || 1, uom: l.uom || 'PCS', brand: l.brand || '', model: l.model || '', partNo: l.partNo || '',
        remark: l.remark || '', requiredDeliveryDate: l.requiredDeliveryDate || '', photo: l.photo || '', attachment: l.attachment || '',
      }))
      // Drop any removed lines from existing assignments so they don't dangle.
      const keptIds = new Set(clean.map((l) => l.lineId).filter(Boolean))
      const assignments = (rfq.assignments || [])
        .map((a) => ({ ...a, lineIds: a.lineIds.filter((lid) => keptIds.has(lid)) }))
        .filter((a) => a.lineIds.length > 0)
      await Rfqs.update(rfq.id, { lines: clean, assignments })
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <Drawer open={open} title="Edit items" subtitle="Add, edit or remove RFQ line items." onClose={onClose} width="max-w-xl"
      footer={<>
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Save items'}</button>
      </>}>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="rounded-xl border border-ink-100 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input value={l.name} onChange={(e) => upd(i, 'name', e.target.value)} placeholder="Item name" className="input min-w-40 flex-1 py-1.5 font-semibold" />
              <input value={l.spec} onChange={(e) => upd(i, 'spec', e.target.value)} placeholder="spec" className="input w-32 py-1.5" />
              <input type="number" min="1" value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} className="input w-16 py-1.5 text-right" title="Qty" />
              <input value={l.uom} onChange={(e) => upd(i, 'uom', e.target.value)} placeholder="UOM" className="input w-16 py-1.5" />
              <button onClick={() => remove(i)} className="rounded-lg p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
            </div>
            <button onClick={() => setExpanded(expanded === i ? null : i)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
              <ChevronDown size={12} className={`transition ${expanded === i ? 'rotate-180' : ''}`} /> More fields
            </button>
            {expanded === i && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <input value={l.brand || ''} onChange={(e) => upd(i, 'brand', e.target.value)} placeholder="Brand" className="input py-1.5 text-sm" />
                  <input value={l.model || ''} onChange={(e) => upd(i, 'model', e.target.value)} placeholder="Model" className="input py-1.5 text-sm" />
                  <input value={l.partNo || ''} onChange={(e) => upd(i, 'partNo', e.target.value)} placeholder="Part No." className="input py-1.5 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={l.remark || ''} onChange={(e) => upd(i, 'remark', e.target.value)} placeholder="Remark" className="input py-1.5 text-sm" />
                  <input type="date" value={l.requiredDeliveryDate || ''} onChange={(e) => upd(i, 'requiredDeliveryDate', e.target.value)} title="Required delivery date" className="input py-1.5 text-sm" />
                </div>
              </div>
            )}
          </div>
        ))}
        {lines.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No items. Add one below.</p>}
      </div>
      <button onClick={add} className="mt-1 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-ink-300 px-3 py-2 text-sm font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600">
        <Plus size={15} /> Add item
      </button>
    </Drawer>
  )
}

function RatingDialog({ supplier, onClose, onSubmit }) {
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [note, setNote] = useState('')
  useEffect(() => { if (supplier) { setStars(0); setHover(0); setNote('') } }, [supplier])
  return (
    <Drawer
      open={!!supplier}
      title={`Rate ${supplier?.name || ''}`}
      subtitle="Recorded against this RFQ and blended into the supplier's score."
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!stars} onClick={() => onSubmit({ stars, note })}>Submit rating</button>
        </>
      }
    >
      <div>
        <label className="label">Rating</label>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onMouseEnter={() => setHover(n)} onClick={() => setStars(n)}>
              <Star size={30} className={(hover || stars) >= n ? 'fill-amber-400 text-amber-400' : 'text-ink-200'} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} className="input min-h-28"
          placeholder="On-time? Quality issues? Communication? Anything to remember next time." />
      </div>
    </Drawer>
  )
}

function RfqPicker({ rfqs, current, onPick }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-outline">
        {current.id} <ChevronDown size={15} className="text-ink-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card-lg">
            {rfqs.map((r) => (
              <button key={r.id} onClick={() => { onPick(r.id); setOpen(false) }}
                className="block w-full px-4 py-2.5 text-left hover:bg-ink-50">
                <p className="text-sm font-semibold text-ink-800">{r.title}</p>
                <p className="text-xs text-ink-400">{r.id} · {r.lines.length} items</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
