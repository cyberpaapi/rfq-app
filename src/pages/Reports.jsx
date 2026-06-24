import { useEffect, useState } from 'react'
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { TrendingDown, FileText, Users, Clock } from 'lucide-react'
import { Reports as ReportsApi } from '../api/client'
import { fmt } from '../data/mock'
import { Card, Stat, SectionTitle, Progress, Spinner, StatusBadge } from '../components/ui'

export default function Reports() {
  const [rep, setRep] = useState(null)
  useEffect(() => { ReportsApi().then(setRep) }, [])
  if (!rep) return <Card><Spinner label="Building reports…" /></Card>

  const { summary, savingsByRfq, participation, aging, summaryRows } = rep

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Reports</h1>
        <p className="mt-1 text-sm text-ink-500">Spend, savings, supplier participation & aging — computed live.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={TrendingDown} label="Total Savings" value={fmt(summary.savings)} sub={`${summary.savingsPct}% vs budget`} tone="emerald" />
        <Stat icon={FileText} label="RFQs Awarded" value={summary.awardedCount} sub="this period" tone="brand" />
        <Stat icon={Users} label="Avg Response Rate" value={`${summary.avgResponseRate}%`} tone="violet" />
        <Stat icon={Clock} label="Open RFQs" value={summary.openRfqs} sub={`${summary.expiredCount} expired`} tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Savings — Budget vs Awarded</SectionTitle>
          {savingsByRfq.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No awarded RFQs yet.</p>
          ) : (
            <div className="space-y-3">
              {savingsByRfq.map((r) => (
                <div key={r.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="truncate text-ink-700">{r.title}</span>
                    <span className="font-semibold text-emerald-600">{fmt(r.savings)} ({r.pct}%)</span>
                  </div>
                  <Progress value={Math.max(0, r.pct)} tone="emerald" />
                </div>
              ))}
              <div className="mt-4 flex items-center justify-between rounded-xl bg-emerald-50 p-3">
                <span className="text-sm font-semibold text-emerald-700">Total cost savings</span>
                <span className="text-lg font-extrabold text-emerald-700">{fmt(summary.savings)}</span>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle>RFQ Aging</SectionTitle>
          {aging.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No open RFQs.</p>
          ) : (
            <div className="space-y-2">
              {aging.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-ink-100 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-800">{r.title}</p>
                    <p className="text-xs text-ink-400">{r.id} · due {r.deadline || '—'}</p>
                  </div>
                  {r.expired ? <span className="chip bg-rose-50 text-rose-600">Expired</span> : <StatusBadge status={r.status} />}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle>Supplier Participation</SectionTitle>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={participation} margin={{ left: -18, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
              <XAxis dataKey="id" tickLine={false} axisLine={false} fontSize={11} stroke="#8591aa" />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#8591aa" />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="received" name="RFQs received" radius={[6, 6, 0, 0]} fill="#8b5cf6" />
              <Bar dataKey="responseRate" name="Response rate %" radius={[6, 6, 0, 0]} fill="#3563ff" />
              <Bar dataKey="awardRate" name="Award rate %" radius={[6, 6, 0, 0]} fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4"><h2 className="text-base font-bold text-ink-900">RFQ Summary Report</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="px-5 py-3">RFQ Number</th>
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-center">Invited</th>
                <th className="px-5 py-3 text-center">Responded</th>
                <th className="px-5 py-3 text-right">Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {summaryRows.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50/60">
                  <td className="px-5 py-3 font-semibold text-ink-700">{r.id}</td>
                  <td className="px-5 py-3 text-ink-600">{r.title}</td>
                  <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-5 py-3 text-center text-ink-600">{r.invited}</td>
                  <td className="px-5 py-3 text-center text-ink-600">{r.responded}</td>
                  <td className="px-5 py-3 text-right font-semibold text-ink-800">{fmt(r.budget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
