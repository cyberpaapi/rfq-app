import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Calendar, MapPin, CreditCard, Wallet, Check, GitCompareArrows,
  Paperclip, Send, Ban, Users, Package, MessageSquare, ShieldCheck, Truck, Star,
} from 'lucide-react'
import { Rfqs } from '../api/client'
import { WORKFLOW, STATUS, fmt } from '../data/mock'
import { useAuth } from '../context/AuthContext'
import { Card, StatusBadge, SectionTitle, Avatar, Empty, Spinner } from '../components/ui'

function WorkflowTracker({ status }) {
  const idx = WORKFLOW.indexOf(status)
  const current = idx === -1 ? (status === STATUS.CLOSED ? WORKFLOW.length - 1 : 0) : idx
  return (
    <div className="flex items-center overflow-x-auto pb-1">
      {WORKFLOW.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition ${
                done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white ring-4 ring-brand-500/15' : 'bg-ink-100 text-ink-400'
              }`}>
                {done ? <Check size={15} /> : i + 1}
              </div>
              <span className={`whitespace-nowrap text-[11px] font-semibold ${active ? 'text-brand-700' : done ? 'text-emerald-600' : 'text-ink-400'}`}>{step}</span>
            </div>
            {i < WORKFLOW.length - 1 && <div className={`mx-2 mb-5 h-0.5 w-10 rounded sm:w-16 ${i < current ? 'bg-emerald-400' : 'bg-ink-100'}`} />}
          </div>
        )
      })}
    </div>
  )
}

function Meta({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500"><Icon size={15} /></div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
        <p className="text-sm font-semibold text-ink-800">{value || '—'}</p>
      </div>
    </div>
  )
}

export default function RfqDetail() {
  const { id } = useParams()
  const { can } = useAuth()
  const [rfq, setRfq] = useState(undefined) // undefined = loading, null = not found
  const [busy, setBusy] = useState(false)
  const [rating, setRating] = useState(null) // delivery being rated

  const load = useCallback(() => {
    Rfqs.get(id).then(setRfq).catch(() => setRfq(null))
  }, [id])
  useEffect(() => { load() }, [load])

  const setStatus = async (status) => {
    setBusy(true)
    try { await Rfqs.setStatus(id, status); load() } finally { setBusy(false) }
  }
  const updateDelivery = async (body) => { setBusy(true); try { await Rfqs.delivery(id, body); load() } finally { setBusy(false) } }
  const submitRating = async ({ stars, note }) => { await Rfqs.delivery(id, { supplierId: rating.supplierId, rate: { stars, note } }); setRating(null); load() }

  if (rfq === undefined) return <Card><Spinner label="Loading RFQ…" /></Card>
  if (rfq === null) {
    return (
      <Card className="p-8">
        <Empty icon="rfq" title="RFQ not found" hint={`No record for ${id}`} />
        <div className="text-center"><Link to="/rfqs" className="btn-outline">Back to RFQs</Link></div>
      </Card>
    )
  }

  const responded = new Set((rfq.quotes || []).map((q) => q.supplierId))
  const created = rfq.createdAt ? new Date(rfq.createdAt).toISOString().slice(0, 10) : '—'
  const canCancel = ![STATUS.AWARDED, STATUS.CLOSED, STATUS.CANCELLED, STATUS.DRAFT].includes(rfq.status)

  return (
    <div className="space-y-6">
      <Link to="/rfqs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800">
        <ArrowLeft size={16} /> All RFQs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{rfq.title}</h1>
            <StatusBadge status={rfq.status} />
          </div>
          <p className="mt-1 text-sm text-ink-500">{rfq.id} · Buyer {rfq.buyer} · Created {created}</p>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">{rfq.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('rfq.evaluate') && <Link to={`/compare?rfq=${encodeURIComponent(rfq.id)}`} className="btn-outline"><GitCompareArrows size={16} /> Compare</Link>}
          {rfq.status === STATUS.DRAFT && can('rfq.publish') && (
            <button className="btn-primary" disabled={busy} onClick={() => setStatus(STATUS.PUBLISHED)}><Send size={16} /> Publish</button>
          )}
          {canCancel && can('rfq.publish') && (
            <button className="btn-outline text-rose-600 hover:bg-rose-50" disabled={busy} onClick={() => setStatus(STATUS.CANCELLED)}><Ban size={16} /> Cancel RFQ</button>
          )}
        </div>
      </div>

      <Card className="p-6"><WorkflowTracker status={rfq.status} /></Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <SectionTitle art="edit" action={<span className="text-xs font-semibold text-ink-400">{rfq.lines.length} lines</span>}>Item Details</SectionTitle>
            {rfq.lines.length === 0 ? (
              <Empty icon="items" title="No item lines on this RFQ" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Item</th>
                      <th className="py-2 pr-3">Brand / Model</th>
                      <th className="py-2 pr-3">Part No.</th>
                      <th className="py-2 pr-3 text-right">Qty</th>
                      <th className="py-2 pr-3">UOM</th>
                      <th className="py-2">Req. Delivery</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {rfq.lines.map((it, i) => (
                      <tr key={it.lineId}>
                        <td className="py-3 pr-3 text-ink-400">{i + 1}</td>
                        <td className="py-3 pr-3">
                          <p className="font-semibold text-ink-800">{it.name}{it.spec && <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-xs font-medium text-ink-500">{it.spec}</span>}</p>
                          {(it.description || it.remark) && <p className="text-xs text-ink-400">{[it.description, it.remark].filter(Boolean).join(' · ')}</p>}
                          {it.secondaryRequirements && <p className="text-xs text-sky-600">+ also needs: {it.secondaryRequirements}</p>}
                        </td>
                        <td className="py-3 pr-3 text-ink-600">{[it.brand, it.model].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="py-3 pr-3 text-ink-600">{it.partNo || '—'}</td>
                        <td className="py-3 pr-3 text-right font-semibold text-ink-800">{Number(it.qty).toLocaleString()}</td>
                        <td className="py-3 pr-3 text-ink-600">{it.uom}</td>
                        <td className="py-3 text-ink-600">{it.requiredDeliveryDate || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle>Invited Suppliers</SectionTitle>
            {(!rfq.assignments || rfq.assignments.length === 0) ? (
              <Empty icon="suppliers" title="No suppliers invited yet" hint="Assign suppliers before publishing." />
            ) : (
              <div className="space-y-2">
                {rfq.assignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
                    <Avatar name={a.supplierName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-800">{a.supplierName}</p>
                      <p className="text-xs text-ink-400">{a.type === 'full' ? 'Full RFQ' : `${a.lineIds.length} item(s)`}</p>
                    </div>
                    <span className={`chip ${responded.has(a.supplierId) ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-500'}`}>
                      {responded.has(a.supplierId) ? 'Responded' : 'Awaiting'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {rfq.deliveries && rfq.deliveries.length > 0 && (
            <Card className="p-5">
              <SectionTitle art="delivery" action={<span className="text-xs text-ink-400">one bulk shipment per supplier</span>}>Delivery & Supplier Rating</SectionTitle>
              <div className="space-y-3">
                {rfq.deliveries.map((d) => (
                  <div key={d.supplierId} className="rounded-xl border border-ink-100 p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Avatar name={d.supplierName} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink-800">{d.supplierName}</p>
                        <p className="text-xs text-ink-400">{d.items} item{d.items !== 1 ? 's' : ''} awarded</p>
                      </div>
                      {d.status === 'delivered'
                        ? <span className={`chip ${d.onTime === false ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>Delivered {d.deliveredAt}{d.onTime === false ? ' · late' : d.onTime ? ' · on time' : ''}</span>
                        : <span className="chip bg-amber-50 text-amber-700">Pending</span>}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="text-xs font-medium text-ink-500">Expected</label>
                      <input type="date" value={d.expectedDate || ''} disabled={!can('rfq.create') || d.status === 'delivered' || busy}
                        onChange={(e) => updateDelivery({ supplierId: d.supplierId, expectedDate: e.target.value })}
                        className="input w-40 py-1.5 text-sm" />
                      {d.status !== 'delivered' ? (
                        <button className="btn-primary py-1.5 text-xs" disabled={!can('rfq.create') || busy} onClick={() => updateDelivery({ supplierId: d.supplierId, deliver: true })}><Truck size={13} /> Mark delivered</button>
                      ) : d.rated ? (
                        <span className="chip bg-ink-100 text-ink-500"><Star size={12} className="fill-amber-400 text-amber-400" /> Rated</span>
                      ) : (
                        <button disabled={!can('rfq.create')} className="btn-outline py-1.5 text-xs" onClick={() => setRating(d)}><Star size={13} /> Rate supplier</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-400">On-time delivery updates the supplier's <b>delivery</b> score; rating updates their <b>quality</b> score — both feed weighted scoring.</p>
            </Card>
          )}

          {rfq.clarifications && rfq.clarifications.length > 0 && (
            <Card className="p-5">
              <SectionTitle art="clarification">Clarifications</SectionTitle>
              <div className="space-y-2">
                {rfq.clarifications.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 rounded-xl bg-ink-50 p-3 text-sm">
                    <MessageSquare size={15} className="mt-0.5 shrink-0 text-brand-500" />
                    <div><span className="font-semibold text-ink-800">{c.from}:</span> <span className="text-ink-600">{c.message}</span></div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle art="deadline">RFQ Information</SectionTitle>
            <div className="space-y-4">
              <Meta icon={Calendar} label="Submission Deadline" value={rfq.deadline} />
              <Meta icon={Calendar} label="Validity Until" value={rfq.validity} />
              <Meta icon={MapPin} label="Delivery Location" value={rfq.deliveryLocation} />
              <Meta icon={CreditCard} label="Payment Terms" value={rfq.paymentTerms} />
              <Meta icon={Wallet} label="Budget Price" value={fmt(rfq.budget)} />
            </div>
          </Card>

          {(rfq.approvals?.hod || rfq.approvals?.finance) && (
            <Card className="p-5">
              <SectionTitle art="approval">Approvals</SectionTitle>
              <div className="space-y-2 text-sm">
                {['hod', 'finance'].map((k) => rfq.approvals?.[k] && (
                  <div key={k} className="flex items-center gap-2">
                    <ShieldCheck size={15} className="text-emerald-500" />
                    <span className="text-ink-600">{k === 'hod' ? 'Dept HOD' : 'Finance'}: <b className="text-ink-800">{rfq.approvals[k].decision}</b> by {rfq.approvals[k].by}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {rfq.award && rfq.award.type !== 'reject' && (
            <Card className="border-emerald-200 bg-emerald-50/40 p-5">
              <SectionTitle art="split">Award</SectionTitle>
              <p className="text-sm text-ink-600">Awarded to</p>
              <p className="text-lg font-bold text-ink-900">{rfq.award.type === 'split' ? `${rfq.award.splits?.length} suppliers (split)` : rfq.award.supplierName}</p>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-3">
                <span className="text-sm text-ink-500">Awarded Price</span>
                <span className="font-bold text-emerald-700">{fmt(rfq.award.amount)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-xl bg-white p-3">
                <span className="text-sm text-ink-500">Savings vs budget</span>
                <span className="font-bold text-emerald-700">{fmt((rfq.budget || 0) - (rfq.award.amount || 0))}</span>
              </div>
            </Card>
          )}

          <Card className="p-5">
            <SectionTitle art="source">Attachments</SectionTitle>
            {(!rfq.attachments || rfq.attachments.length === 0) ? (
              <p className="text-sm text-ink-400">No supporting documents attached.</p>
            ) : (
              <div className="space-y-2">
                {rfq.attachments.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-ink-100 p-2.5 text-sm hover:bg-ink-50">
                    <Paperclip size={15} className="text-ink-400" />
                    <span className="flex-1 truncate text-ink-700">{f.name || f}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <RateDialog delivery={rating} onClose={() => setRating(null)} onSubmit={submitRating} />
    </div>
  )
}

function RateDialog({ delivery, onClose, onSubmit }) {
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [note, setNote] = useState('')
  useEffect(() => { if (delivery) { setStars(0); setHover(0); setNote('') } }, [delivery])
  if (!delivery) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card-lg animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-ink-900">Rate {delivery.supplierName}</h2>
        <p className="mt-0.5 text-sm text-ink-400">Overall quality of this order — feeds the supplier's quality score.</p>
        <div className="mt-4 flex justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onMouseEnter={() => setHover(n)} onClick={() => setStars(n)}>
              <Star size={34} className={(hover || stars) >= n ? 'fill-amber-400 text-amber-400' : 'text-ink-200'} />
            </button>
          ))}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} className="input mt-4 min-h-20 text-sm" placeholder="Quality, packaging, communication, issues…" />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!stars} onClick={() => onSubmit({ stars, note })}>Submit rating</button>
        </div>
      </div>
    </div>
  )
}
