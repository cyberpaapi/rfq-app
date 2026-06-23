import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Calendar, MapPin, CreditCard, Wallet, Check, GitCompareArrows,
  Paperclip, Send, Ban, Users, Package,
} from 'lucide-react'
import { rfqById, supplierById, WORKFLOW, fmt, STATUS } from '../data/mock'
import { Card, StatusBadge, SectionTitle, Avatar, Empty } from '../components/ui'

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
              <div
                className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition ${
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white ring-4 ring-brand-500/15' : 'bg-ink-100 text-ink-400'
                }`}
              >
                {done ? <Check size={15} /> : i + 1}
              </div>
              <span className={`whitespace-nowrap text-[11px] font-semibold ${active ? 'text-brand-700' : done ? 'text-emerald-600' : 'text-ink-400'}`}>
                {step}
              </span>
            </div>
            {i < WORKFLOW.length - 1 && (
              <div className={`mx-2 mb-5 h-0.5 w-10 rounded sm:w-16 ${i < current ? 'bg-emerald-400' : 'bg-ink-100'}`} />
            )}
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
        <p className="text-sm font-semibold text-ink-800">{value}</p>
      </div>
    </div>
  )
}

export default function RfqDetail() {
  const { id } = useParams()
  const rfq = rfqById(id)

  if (!rfq) {
    return (
      <Card className="p-8">
        <Empty icon={Package} title="RFQ not found" hint={`No record for ${id}`} />
        <div className="text-center"><Link to="/rfqs" className="btn-outline">Back to RFQs</Link></div>
      </Card>
    )
  }

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
          <p className="mt-1 text-sm text-ink-500">{rfq.id} · Buyer {rfq.buyer} · Created {rfq.created}</p>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">{rfq.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/compare" className="btn-outline"><GitCompareArrows size={16} /> Compare</Link>
          {rfq.status === STATUS.DRAFT && <button className="btn-primary"><Send size={16} /> Publish</button>}
          {canCancel && <button className="btn-outline text-rose-600 hover:bg-rose-50"><Ban size={16} /> Cancel RFQ</button>}
        </div>
      </div>

      <Card className="p-6">
        <WorkflowTracker status={rfq.status} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <SectionTitle action={<span className="text-xs font-semibold text-ink-400">{rfq.items.length} lines</span>}>
              Item Details
            </SectionTitle>
            {rfq.items.length === 0 ? (
              <Empty icon={Package} title="No item lines on this RFQ" />
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
                      <th className="py-2">Delivery</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {rfq.items.map((it) => (
                      <tr key={it.sno}>
                        <td className="py-3 pr-3 text-ink-400">{it.sno}</td>
                        <td className="py-3 pr-3">
                          <p className="font-semibold text-ink-800">{it.name}</p>
                          <p className="text-xs text-ink-400">{it.desc}</p>
                        </td>
                        <td className="py-3 pr-3 text-ink-600">{it.brand} · {it.model}</td>
                        <td className="py-3 pr-3 text-ink-600">{it.part}</td>
                        <td className="py-3 pr-3 text-right font-semibold text-ink-800">{it.qty.toLocaleString()}</td>
                        <td className="py-3 pr-3 text-ink-600">{it.uom}</td>
                        <td className="py-3 text-ink-600">{it.delivery}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle>Invited Suppliers</SectionTitle>
            {rfq.invited.length === 0 ? (
              <Empty icon={Users} title="No suppliers invited yet" hint="Add suppliers before publishing." />
            ) : (
              <div className="space-y-2">
                {rfq.invited.map((sid) => {
                  const s = supplierById(sid)
                  const responded = rfq.responded.includes(sid)
                  return (
                    <div key={sid} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
                      <Avatar name={s.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink-800">{s.name}</p>
                        <p className="text-xs text-ink-400">{s.category} · {s.location}</p>
                      </div>
                      <span className={`chip ${responded ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-500'}`}>
                        {responded ? 'Responded' : 'Awaiting'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle>RFQ Information</SectionTitle>
            <div className="space-y-4">
              <Meta icon={Calendar} label="Submission Deadline" value={rfq.deadline} />
              <Meta icon={Calendar} label="Validity Until" value={rfq.validity} />
              <Meta icon={MapPin} label="Delivery Location" value={rfq.deliveryLocation} />
              <Meta icon={CreditCard} label="Payment Terms" value={rfq.paymentTerms} />
              <Meta icon={Wallet} label="Budget Price" value={fmt(rfq.budget)} />
            </div>
          </Card>

          {rfq.awardedTo && (
            <Card className="border-emerald-200 bg-emerald-50/40 p-5">
              <SectionTitle>Award</SectionTitle>
              <p className="text-sm text-ink-600">Awarded to</p>
              <p className="text-lg font-bold text-ink-900">{supplierById(rfq.awardedTo)?.name}</p>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-3">
                <span className="text-sm text-ink-500">Awarded Price</span>
                <span className="font-bold text-emerald-700">{fmt(rfq.awardedPrice)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-xl bg-white p-3">
                <span className="text-sm text-ink-500">Savings vs budget</span>
                <span className="font-bold text-emerald-700">{fmt(rfq.budget - rfq.awardedPrice)}</span>
              </div>
            </Card>
          )}

          <Card className="p-5">
            <SectionTitle>Attachments</SectionTitle>
            <div className="space-y-2">
              {['Technical-Spec-v2.pdf', 'Site-Drawing.dwg', 'Compliance-Cert.pdf'].map((f) => (
                <div key={f} className="flex items-center gap-3 rounded-xl border border-ink-100 p-2.5 text-sm hover:bg-ink-50">
                  <Paperclip size={15} className="text-ink-400" />
                  <span className="flex-1 truncate text-ink-700">{f}</span>
                  <span className="text-xs text-ink-400">v2</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
