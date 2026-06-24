import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { FileText, Clock, Award, TrendingDown, ArrowUpRight } from 'lucide-react'
import { Rfqs, Reports } from '../api/client'
import { STATUS, fmt } from '../data/mock'
import { Card, Stat, StatusBadge, SectionTitle, Spinner } from '../components/ui'

const COLORS = ['#3563ff', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6']

export default function Dashboard() {
  const [rfqs, setRfqs] = useState(null)
  const [rep, setRep] = useState(null)

  useEffect(() => {
    Rfqs.list().then(setRfqs)
    Reports().then(setRep)
  }, [])

  if (!rfqs || !rep) return <Card><Spinner label="Loading dashboard…" /></Card>

  const open = rfqs.filter((r) => ![STATUS.AWARDED, STATUS.CLOSED, STATUS.CANCELLED].includes(r.status))
  const respondedById = Object.fromEntries(rep.summaryRows.map((s) => [s.id, s.responded]))
  const topSuppliers = [...rep.participation].sort((a, b) => b.awardRate - a.awardRate).slice(0, 4)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Procurement Dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">Overview of your RFQ pipeline, suppliers and savings.</p>
        </div>
        <Link to="/rfqs/new" className="btn-primary">Create RFQ</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={FileText} label="Open RFQs" value={rep.summary.openRfqs} sub="across all categories" tone="brand" />
        <Stat icon={Clock} label="Pending Approval" value={rep.summary.pendingApproval} sub="HOD & Finance" tone="amber" />
        <Stat icon={Award} label="Awarded" value={rep.summary.awardedCount} sub="contracts closed" tone="violet" />
        <Stat icon={TrendingDown} label="Cost Savings" value={fmt(rep.summary.savings)} sub="budget vs awarded" tone="emerald" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle>Savings by Awarded RFQ</SectionTitle>
          <div className="h-64">
            {rep.savingsByRfq.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-ink-400">No awarded RFQs yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rep.savingsByRfq} margin={{ left: -18, right: 6, top: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                  <XAxis dataKey="id" tickLine={false} axisLine={false} fontSize={10} stroke="#8591aa" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#8591aa" />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }} />
                  <Bar dataKey="budget" name="Budget" radius={[6, 6, 0, 0]} fill="#b0b8c9" />
                  <Bar dataKey="awarded" name="Awarded" radius={[6, 6, 0, 0]} fill="#3563ff" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>RFQs by Category</SectionTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rep.byCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {rep.byCategory.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            {rep.byCategory.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-ink-600">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
                  {c.name}
                </span>
                <span className="font-semibold text-ink-800">{c.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle action={<Link to="/rfqs" className="text-sm font-semibold text-brand-600 hover:text-brand-700">View all</Link>}>
            Active RFQs
          </SectionTitle>
          <div className="-mx-2 divide-y divide-ink-100">
            {open.length === 0 && <p className="px-2 py-6 text-sm text-ink-400">No active RFQs.</p>}
            {open.map((r) => {
              const invited = r.assignments?.length || 0
              const responded = respondedById[r.id] || 0
              const pct = invited ? Math.round((responded / invited) * 100) : 0
              return (
                <Link key={r.id} to={`/rfqs/${r.id}`} className="group flex items-center gap-4 rounded-xl px-2 py-3 hover:bg-ink-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-ink-800">{r.title}</p>
                      <ArrowUpRight size={14} className="text-ink-300 opacity-0 transition group-hover:opacity-100" />
                    </div>
                    <p className="text-xs text-ink-400">{r.id} · {r.buyer} · due {r.deadline || '—'}</p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-xs text-ink-400">Responses</p>
                    <p className="text-sm font-semibold text-ink-700">{responded}/{invited} · {pct}%</p>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              )
            })}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Top Suppliers</SectionTitle>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSuppliers} margin={{ left: -22, right: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                <XAxis dataKey="id" tickLine={false} axisLine={false} fontSize={10} stroke="#8591aa" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="#8591aa" />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }} />
                <Bar dataKey="awardRate" radius={[6, 6, 0, 0]} fill="#3563ff" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-2">
            {topSuppliers.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-ink-600">{s.name}</span>
                <span className="font-semibold text-ink-800">{s.awardRate}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
