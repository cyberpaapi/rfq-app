import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, SlidersHorizontal, FileText } from 'lucide-react'
import { rfqs, STATUS, fmt } from '../data/mock'
import { Card, StatusBadge, Empty } from '../components/ui'

const FILTERS = ['All', 'Open', 'Awarded', 'Closed', 'Expired']
const today = '2026-06-19'

export default function RfqList() {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('All')

  const list = useMemo(() => {
    return rfqs.filter((r) => {
      const matchesQ =
        !q ||
        r.id.toLowerCase().includes(q.toLowerCase()) ||
        r.title.toLowerCase().includes(q.toLowerCase()) ||
        r.buyer.toLowerCase().includes(q.toLowerCase())
      const expired = r.deadline < today && ![STATUS.AWARDED, STATUS.CLOSED].includes(r.status)
      const open = ![STATUS.AWARDED, STATUS.CLOSED, STATUS.CANCELLED].includes(r.status)
      const matchesF =
        filter === 'All' ||
        (filter === 'Open' && open) ||
        (filter === 'Awarded' && r.status === STATUS.AWARDED) ||
        (filter === 'Closed' && r.status === STATUS.CLOSED) ||
        (filter === 'Expired' && expired)
      return matchesQ && matchesF
    })
  }, [q, filter])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Request for Quotations</h1>
          <p className="mt-1 text-sm text-ink-500">{rfqs.length} total · {list.length} shown</p>
        </div>
        <Link to="/rfqs/new" className="btn-primary"><Plus size={16} /> Create RFQ</Link>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" placeholder="Search by RFQ number, title or buyer…" />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <SlidersHorizontal size={16} className="mr-1 hidden shrink-0 text-ink-400 sm:block" />
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`chip whitespace-nowrap border transition ${
                  filter === f ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-500 hover:bg-ink-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <Empty icon={FileText} title="No RFQs match your filters" hint="Try a different search or filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-3">RFQ</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Buyer</th>
                  <th className="px-5 py-3">Responses</th>
                  <th className="px-5 py-3">Deadline</th>
                  <th className="px-5 py-3 text-right">Budget</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {list.map((r) => (
                  <tr key={r.id} className="group transition hover:bg-ink-50/60">
                    <td className="px-5 py-3.5">
                      <Link to={`/rfqs/${r.id}`} className="block">
                        <p className="font-semibold text-ink-800 group-hover:text-brand-700">{r.title}</p>
                        <p className="text-xs text-ink-400">{r.id}</p>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-ink-600">{r.category}</td>
                    <td className="px-5 py-3.5 text-ink-600">{r.buyer}</td>
                    <td className="px-5 py-3.5 text-ink-600">{r.responded.length}/{r.invited.length}</td>
                    <td className={`px-5 py-3.5 ${r.deadline < today ? 'text-rose-500' : 'text-ink-600'}`}>{r.deadline}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-ink-800">{fmt(r.budget)}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
