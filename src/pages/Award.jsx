import { useEffect, useMemo, useState } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { Award as AwardIcon, Trophy, Check, X, Scale, Coins, Lock, ShieldCheck } from 'lucide-react'
import { Rfqs, Suppliers, Reports } from '../api/client'
import { fmt } from '../data/mock'
import { Card, SectionTitle, Avatar, Spinner, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const CRITERIA = [
  { key: 'price', label: 'Price' },
  { key: 'quality', label: 'Quality' },
  { key: 'delivery', label: 'Delivery' },
]
const COLORS = ['#3563ff', '#22c55e', '#f59e0b', '#8b5cf6']

export default function Award() {
  const { can } = useAuth()
  const [candidates, setCandidates] = useState(null)
  const [rfqId, setRfqId] = useState('')
  const [rfq, setRfq] = useState(null)
  const [suppliers, setSuppliers] = useState({})
  const [weights, setWeights] = useState({ price: 30, quality: 40, delivery: 30 })
  const [method, setMethod] = useState('weighted')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    Promise.all([Rfqs.list(), Reports(), Suppliers.list()]).then(([rfqs, rep, sups]) => {
      const responded = Object.fromEntries(rep.summaryRows.map((s) => [s.id, s.responded]))
      const cands = rfqs.filter((r) => (responded[r.id] || 0) >= 2 || r.status === 'Awarded')
      setCandidates(cands)
      setRfqId(cands[0]?.id || '')
      setSuppliers(Object.fromEntries(sups.map((s) => [s.id, s])))
    })
  }, [])

  const load = () => { if (rfqId) Rfqs.get(rfqId).then(setRfq) }
  useEffect(() => { setRfq(null); load() }, [rfqId]) // eslint-disable-line react-hooks/exhaustive-deps

  const quotes = rfq?.quotes || []
  const supIds = [...new Set(quotes.map((q) => q.supplierId))]
  const scoresOf = (sid) => suppliers[sid]?.scores || { price: 70, quality: 70, delivery: 70 }
  const nameOf = (sid) => quotes.find((q) => q.supplierId === sid)?.supplierName || suppliers[sid]?.name || sid

  // Per-supplier quote total across the RFQ's lines.
  const totals = useMemo(() => supIds.map((sid) => {
    const q = quotes.find((x) => x.supplierId === sid)
    const total = (rfq?.lines || []).reduce((a, line) => {
      const ql = q?.lines.find((l) => l.lineId === line.lineId)
      return a + (ql ? Number(ql.rate) * (Number(line.qty) || 0) : 0)
    }, 0)
    return { sid, total }
  }), [rfq, supIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalWeight = weights.price + weights.quality + weights.delivery
  const ranked = useMemo(() => supIds.map((sid) => {
    const s = scoresOf(sid)
    const weighted = (s.price * weights.price + s.quality * weights.quality + s.delivery * weights.delivery) / (totalWeight || 1)
    return { sid, ...s, score: weighted }
  }).sort((a, b) => b.score - a.score), [supIds, weights]) // eslint-disable-line react-hooks/exhaustive-deps

  if (candidates === null) return <Card><Spinner label="Loading evaluation…" /></Card>
  if (candidates.length === 0) return <Card className="p-8"><Empty icon={AwardIcon} title="Nothing to evaluate yet" hint="An RFQ needs ≥2 responses before award." /></Card>
  if (!rfq) return <Card><Spinner /></Card>

  const cheapest = totals.length ? totals.reduce((a, b) => (a.total <= b.total ? a : b)) : null
  const winner = method === 'lowest' ? cheapest?.sid : ranked[0]?.sid
  const totalFor = (sid) => totals.find((t) => t.sid === sid)?.total || 0
  const radarData = CRITERIA.map((c) => {
    const row = { criteria: c.label }
    supIds.forEach((sid) => (row[sid] = scoresOf(sid)[c.key]))
    return row
  })

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600) }
  const refreshAll = async () => { load(); setCandidates(await Rfqs.list().then((rfqs) => rfqs.filter((r) => candidates.some((c) => c.id === r.id)))) }

  const awardFull = async () => {
    setBusy(true)
    try { await Rfqs.award(rfqId, { type: 'full', supplierId: winner, amount: totalFor(winner) }); flash(`Awarded to ${nameOf(winner)}`); load() } finally { setBusy(false) }
  }
  const awardSplit = async () => {
    setBusy(true)
    try {
      // Each line to its cheapest bidder.
      const bySupplier = {}
      for (const line of rfq.lines) {
        let best = null
        for (const q of quotes) {
          const ql = q.lines.find((l) => l.lineId === line.lineId)
          if (ql && (best === null || Number(ql.rate) < best.rate)) best = { sid: q.supplierId, rate: Number(ql.rate) }
        }
        if (best) {
          bySupplier[best.sid] ??= { supplierId: best.sid, lineIds: [], amount: 0 }
          bySupplier[best.sid].lineIds.push(line.lineId)
          bySupplier[best.sid].amount += best.rate * (Number(line.qty) || 0)
        }
      }
      const awards = Object.values(bySupplier)
      const amount = awards.reduce((a, x) => a + x.amount, 0)
      await Rfqs.award(rfqId, { type: 'split', awards, amount })
      flash(`Split awarded across ${awards.length} suppliers`); load()
    } finally { setBusy(false) }
  }
  const rejectAll = async () => { setBusy(true); try { await Rfqs.award(rfqId, { type: 'reject' }); flash('All quotes rejected'); load() } finally { setBusy(false) } }
  const approve = async (role) => { setBusy(true); try { await Rfqs.approve(rfqId, { role, decision: 'approved' }); flash(`${role.toUpperCase()} approved`); load() } finally { setBusy(false) } }

  const awarded = rfq.status === 'Awarded' || rfq.award
  const canAward = can('award.decide')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Evaluation & Award</h1>
          <p className="mt-1 text-sm text-ink-500">{rfq.id} — {rfq.title}</p>
        </div>
        <select value={rfqId} onChange={(e) => setRfqId(e.target.value)} className="input w-auto py-2">
          {candidates.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.title}</option>)}
        </select>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMethod('lowest')} className={`btn ${method === 'lowest' ? 'btn-primary' : 'btn-outline'}`}><Coins size={16} /> Lowest Cost</button>
          <button onClick={() => setMethod('weighted')} className={`btn ${method === 'weighted' ? 'btn-primary' : 'btn-outline'}`}><Scale size={16} /> Weighted Scoring</button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {method === 'weighted' && (
            <Card className="p-5">
              <SectionTitle action={<span className={`chip ${totalWeight === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>Total {totalWeight}%</span>}>Scoring Weights</SectionTitle>
              <div className="space-y-5">
                {CRITERIA.map((c) => (
                  <div key={c.key}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="font-semibold text-ink-700">{c.label}</span>
                      <span className="font-semibold text-brand-600">{weights[c.key]}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={5} value={weights[c.key]} onChange={(e) => setWeights((w) => ({ ...w, [c.key]: +e.target.value }))} className="w-full accent-brand-600" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <SectionTitle>Supplier Ranking</SectionTitle>
            <div className="space-y-3">
              {(method === 'lowest' ? [...totals].sort((a, b) => a.total - b.total).map((t) => ({ sid: t.sid })) : ranked).map((r, i) => {
                const sid = r.sid
                const isWin = sid === winner
                const q = quotes.find((x) => x.supplierId === sid)
                return (
                  <div key={sid} className={`flex items-center gap-4 rounded-xl border p-4 ${isWin ? 'border-emerald-300 bg-emerald-50/50' : 'border-ink-100'}`}>
                    <div className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-500'}`}>{i === 0 ? <Trophy size={16} /> : i + 1}</div>
                    <Avatar name={nameOf(sid)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink-900">{nameOf(sid)}</p>
                      <p className="text-xs text-ink-400">Quote {fmt(totalFor(sid))}{q?.lines[0]?.leadTime ? ` · ${q.lines[0].leadTime}` : ''}{q?.lines[0]?.warranty ? ` · ${q.lines[0].warranty}` : ''}</p>
                    </div>
                    <div className="text-right">
                      {method === 'weighted' ? (
                        <><p className="text-xl font-extrabold text-ink-900">{r.score.toFixed(1)}</p><p className="text-xs text-ink-400">weighted score</p></>
                      ) : (
                        <p className="text-lg font-extrabold text-ink-900">{fmt(totalFor(sid))}</p>
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
                  {supIds.map((sid, i) => <Radar key={sid} dataKey={sid} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.18} strokeWidth={2} />)}
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1">
              {supIds.map((sid, i) => (
                <div key={sid} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-ink-600">{nameOf(sid)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
            <div className="mb-2 flex items-center gap-2 text-emerald-700"><AwardIcon size={18} /><span className="font-bold">{awarded ? 'Awarded' : 'Recommended Award'}</span></div>
            <div className="flex items-center gap-3">
              <Avatar name={nameOf(winner)} size={44} />
              <div>
                <p className="font-bold text-ink-900">{awarded && rfq.award?.type === 'split' ? `${rfq.award.splits?.length} suppliers (split)` : nameOf(winner)}</p>
                <p className="text-sm text-ink-500">{fmt(awarded ? rfq.award?.amount : totalFor(winner))} · saves {fmt((rfq.budget || 0) - (awarded ? rfq.award?.amount || 0 : totalFor(winner)))}</p>
              </div>
            </div>

            {awarded ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-100/60 p-3 text-sm font-semibold text-emerald-700"><Check size={16} /> This RFQ has been awarded.</div>
            ) : canAward ? (
              <div className="mt-4 space-y-2">
                <button className="btn-primary w-full" disabled={busy} onClick={awardFull}><Check size={16} /> Award Full RFQ</button>
                <button className="btn-outline w-full" disabled={busy} onClick={awardSplit}>Split Award (per-line cheapest)</button>
                <button className="btn-outline w-full text-rose-600 hover:bg-rose-50" disabled={busy} onClick={rejectAll}><X size={16} /> Reject All Quotes</button>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-ink-50 p-3 text-xs text-ink-500"><Lock size={14} /> Your role can review but not award.</div>
            )}

            {/* Approvals */}
            <div className="mt-4 border-t border-emerald-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Approvals</p>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy || !can('approve.hod') || rfq.approvals?.hod} onClick={() => approve('hod')}
                  className={`btn flex-1 py-1.5 text-xs ${rfq.approvals?.hod ? 'btn-outline text-emerald-600' : 'btn-outline'}`}>
                  <ShieldCheck size={13} /> {rfq.approvals?.hod ? 'HOD ✓' : 'Approve HOD'}
                </button>
                <button disabled={busy || !can('approve.finance') || rfq.approvals?.finance} onClick={() => approve('finance')}
                  className={`btn flex-1 py-1.5 text-xs ${rfq.approvals?.finance ? 'btn-outline text-emerald-600' : 'btn-outline'}`}>
                  <ShieldCheck size={13} /> {rfq.approvals?.finance ? 'Finance ✓' : 'Approve Finance'}
                </button>
              </div>
              <p className="mt-2 text-xs text-ink-400">Costing sheet is approved by Finance only.</p>
            </div>
          </Card>
        </div>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-card-lg animate-fade-in">{toast}</div>}
    </div>
  )
}
