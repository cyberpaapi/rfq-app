import { useMemo, useState } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts'
import { Award as AwardIcon, Trophy, Check, X, Scale, Coins, Lock } from 'lucide-react'
import { rfqs, supplierById, fmt } from '../data/mock'
import { Card, SectionTitle, Avatar } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const CRITERIA = [
  { key: 'price', label: 'Price', def: 30 },
  { key: 'quality', label: 'Quality', def: 40 },
  { key: 'delivery', label: 'Delivery', def: 30 },
]

// Derived per-supplier scores (0-100) for the candidate RFQ.
const SCORES = {
  'SUP-001': { price: 92, quality: 70, delivery: 85 },
  'SUP-002': { price: 74, quality: 90, delivery: 78 },
}

export default function Award() {
  const { can } = useAuth()
  const candidate = rfqs.find((r) => Object.keys(r.quotes).length >= 2)
  const [weights, setWeights] = useState({ price: 30, quality: 40, delivery: 30 })
  const [method, setMethod] = useState('weighted')
  const supIds = candidate.invited.filter((id) => candidate.quotes[id])

  const totalWeight = weights.price + weights.quality + weights.delivery

  const totals = supIds.map((sid) => ({
    sid,
    total: candidate.items.reduce((a, it) => a + candidate.quotes[sid].lines[it.sno] * it.qty, 0),
  }))
  const cheapest = totals.reduce((a, b) => (a.total <= b.total ? a : b))

  const ranked = useMemo(() => {
    return supIds
      .map((sid) => {
        const s = SCORES[sid]
        const weighted = (s.price * weights.price + s.quality * weights.quality + s.delivery * weights.delivery) / (totalWeight || 1)
        return { sid, ...s, score: weighted }
      })
      .sort((a, b) => b.score - a.score)
  }, [weights, supIds, totalWeight])

  const radarData = CRITERIA.map((c) => {
    const row = { criteria: c.label }
    supIds.forEach((sid) => (row[sid] = SCORES[sid][c.key]))
    return row
  })

  const winner = method === 'lowest' ? cheapest.sid : ranked[0].sid
  const colors = { 'SUP-001': '#3563ff', 'SUP-002': '#22c55e' }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Evaluation & Award</h1>
        <p className="mt-1 text-sm text-ink-500">{candidate.id} — {candidate.title}</p>
      </div>

      {/* Method toggle */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMethod('lowest')}
            className={`btn ${method === 'lowest' ? 'btn-primary' : 'btn-outline'}`}>
            <Coins size={16} /> Lowest Cost
          </button>
          <button onClick={() => setMethod('weighted')}
            className={`btn ${method === 'weighted' ? 'btn-primary' : 'btn-outline'}`}>
            <Scale size={16} /> Weighted Scoring
          </button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {method === 'weighted' && (
            <Card className="p-5">
              <SectionTitle action={
                <span className={`chip ${totalWeight === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  Total {totalWeight}%
                </span>
              }>
                Scoring Weights
              </SectionTitle>
              <div className="space-y-5">
                {CRITERIA.map((c) => (
                  <div key={c.key}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="font-semibold text-ink-700">{c.label}</span>
                      <span className="font-semibold text-brand-600">{weights[c.key]}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={5} value={weights[c.key]}
                      onChange={(e) => setWeights((w) => ({ ...w, [c.key]: +e.target.value }))}
                      className="w-full accent-brand-600" />
                  </div>
                ))}
              </div>
              {totalWeight !== 100 && <p className="mt-3 text-xs text-rose-500">Weights should total 100% for a balanced score.</p>}
            </Card>
          )}

          <Card className="p-5">
            <SectionTitle>Supplier Ranking</SectionTitle>
            <div className="space-y-3">
              {(method === 'lowest' ? [...totals].sort((a, b) => a.total - b.total) : ranked).map((r, i) => {
                const sid = r.sid
                const s = supplierById(sid)
                const isWin = sid === winner
                return (
                  <div key={sid} className={`flex items-center gap-4 rounded-xl border p-4 ${isWin ? 'border-emerald-300 bg-emerald-50/50' : 'border-ink-100'}`}>
                    <div className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-500'}`}>
                      {i === 0 ? <Trophy size={16} /> : i + 1}
                    </div>
                    <Avatar name={s.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink-900">{s.name}</p>
                      <p className="text-xs text-ink-400">
                        Quote {fmt(totals.find((t) => t.sid === sid).total)} · {candidate.quotes[sid].leadTime} · {candidate.quotes[sid].warranty}
                      </p>
                    </div>
                    <div className="text-right">
                      {method === 'weighted' ? (
                        <>
                          <p className="text-xl font-extrabold text-ink-900">{r.score.toFixed(1)}</p>
                          <p className="text-xs text-ink-400">weighted score</p>
                        </>
                      ) : (
                        <p className="text-lg font-extrabold text-ink-900">{fmt(totals.find((t) => t.sid === sid).total)}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle>Criteria Comparison</SectionTitle>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius={80}>
                  <PolarGrid stroke="#eceef2" />
                  <PolarAngleAxis dataKey="criteria" fontSize={12} stroke="#66728e" />
                  {supIds.map((sid) => (
                    <Radar key={sid} dataKey={sid} stroke={colors[sid]} fill={colors[sid]} fillOpacity={0.18} strokeWidth={2} />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1">
              {supIds.map((sid) => (
                <div key={sid} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[sid] }} />
                  <span className="text-ink-600">{supplierById(sid)?.name}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
            <div className="mb-2 flex items-center gap-2 text-emerald-700">
              <AwardIcon size={18} /><span className="font-bold">Recommended Award</span>
            </div>
            <div className="flex items-center gap-3">
              <Avatar name={supplierById(winner).name} size={44} />
              <div>
                <p className="font-bold text-ink-900">{supplierById(winner)?.name}</p>
                <p className="text-sm text-ink-500">{fmt(totals.find((t) => t.sid === winner).total)} · saves {fmt(candidate.budget - totals.find((t) => t.sid === winner).total)}</p>
              </div>
            </div>
            {can('award.decide') ? (
              <div className="mt-4 space-y-2">
                <button className="btn-primary w-full"><Check size={16} /> Award Full RFQ</button>
                <button className="btn-outline w-full">Split Award</button>
                <button className="btn-outline w-full text-rose-600 hover:bg-rose-50"><X size={16} /> Reject All Quotes</button>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-ink-50 p-3 text-xs text-ink-500">
                <Lock size={14} /> Your role can review but not award. Award requires a Buyer or Finance Head.
              </div>
            )}
            <p className="mt-3 text-xs text-ink-400">Requires Department HOD &amp; Finance Head approval. Costing sheet approved by Finance only.</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
