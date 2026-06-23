import {
  BarChart, Bar, LineChart, Line, ResponsiveContainer, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { TrendingDown, FileText, Users, Clock, Download } from 'lucide-react'
import { rfqs, suppliers, STATUS, fmt } from '../data/mock'
import { Card, Stat, SectionTitle, Progress } from '../components/ui'

const priceHistory = [
  { yr: '2023', wallLight: 1.85, spikeLight: 18.4 },
  { yr: '2024', wallLight: 1.62, spikeLight: 16.9 },
  { yr: '2025', wallLight: 1.44, spikeLight: 15.8 },
  { yr: '2026', wallLight: 1.32, spikeLight: 15.73 },
]

export default function Reports() {
  const awarded = rfqs.filter((r) => r.awardedPrice)
  const totalBudget = awarded.reduce((a, r) => a + r.budget, 0)
  const totalAwarded = awarded.reduce((a, r) => a + r.awardedPrice, 0)
  const savings = totalBudget - totalAwarded
  const savingsPct = Math.round((savings / totalBudget) * 100)

  const participation = suppliers.map((s) => ({ name: s.id, received: s.rfqsReceived, response: s.responseRate }))

  const open = rfqs.filter((r) => ![STATUS.AWARDED, STATUS.CLOSED, STATUS.CANCELLED].includes(r.status))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Reports</h1>
          <p className="mt-1 text-sm text-ink-500">Spend, savings, supplier participation & aging.</p>
        </div>
        <button className="btn-outline"><Download size={16} /> Export</button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={TrendingDown} label="Total Savings" value={fmt(savings)} sub={`${savingsPct}% vs budget`} tone="emerald" />
        <Stat icon={FileText} label="RFQs Awarded" value={awarded.length} sub="this period" tone="brand" />
        <Stat icon={Users} label="Avg Response Rate" value={`${Math.round(suppliers.reduce((a, s) => a + s.responseRate, 0) / suppliers.length)}%`} tone="violet" />
        <Stat icon={Clock} label="Open RFQs" value={open.length} sub="in pipeline" tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Savings — Budget vs Awarded</SectionTitle>
          <div className="space-y-3">
            {awarded.map((r) => {
              const pct = Math.round(((r.budget - r.awardedPrice) / r.budget) * 100)
              return (
                <div key={r.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="truncate text-ink-700">{r.title}</span>
                    <span className="font-semibold text-emerald-600">{fmt(r.budget - r.awardedPrice)} ({pct}%)</span>
                  </div>
                  <Progress value={pct} tone="emerald" />
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-emerald-50 p-3">
            <span className="text-sm font-semibold text-emerald-700">Total cost savings</span>
            <span className="text-lg font-extrabold text-emerald-700">{fmt(savings)}</span>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Price Trend — Purchased Items (3 yr)</SectionTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceHistory} margin={{ left: -20, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                <XAxis dataKey="yr" tickLine={false} axisLine={false} fontSize={12} stroke="#8591aa" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#8591aa" />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="wallLight" name="Wall Light" stroke="#3563ff" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="spikeLight" name="Spike Light" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle>Supplier Participation</SectionTitle>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={participation} margin={{ left: -18, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="#8591aa" />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#8591aa" />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="received" name="RFQs received" radius={[6, 6, 0, 0]} fill="#8b5cf6" />
              <Bar dataKey="response" name="Response rate %" radius={[6, 6, 0, 0]} fill="#3563ff" />
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
              {rfqs.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50/60">
                  <td className="px-5 py-3 font-semibold text-ink-700">{r.id}</td>
                  <td className="px-5 py-3 text-ink-600">{r.title}</td>
                  <td className="px-5 py-3 text-ink-600">{r.status}</td>
                  <td className="px-5 py-3 text-center text-ink-600">{r.invited.length}</td>
                  <td className="px-5 py-3 text-center text-ink-600">{r.responded.length}</td>
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
