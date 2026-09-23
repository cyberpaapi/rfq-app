import { useEffect, useMemo, useState } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { Award as AwardIcon, Trophy, Check, X, Scale, Coins, Lock, ShieldCheck, Split, ChevronRight, Sparkles, Wand2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { isPriced, quoteCoverage, scoreCandidates } from '../../shared/evaluation'
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
  const [params] = useSearchParams()
  const requestedId = params.get('rfq')
  const [error, setError] = useState('')
  const [candidates, setCandidates] = useState(null)
  const [rfqId, setRfqId] = useState('')
  const [rfq, setRfq] = useState(null)
  const [suppliers, setSuppliers] = useState({})
  const [weights, setWeights] = useState({ price: 40, quality: 35, delivery: 25 })
  const [method, setMethod] = useState(() => params.get('method') === 'ai' ? 'ai' : 'lowest')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [allocation, setAllocation] = useState(null) // lineId -> supplierId

  useEffect(() => {
    Promise.all([Rfqs.list(), Suppliers.list()]).then(([rfqs, sups]) => {
      const cands = rfqs.filter((r) => r.quoteCount >= 2 || r.status === 'Awarded')
      setCandidates(cands)
      setRfqId(cands.some((r) => r.id === requestedId) ? requestedId : cands[0]?.id || '')
      setSuppliers(Object.fromEntries(sups.map((s) => [s.id, s])))
    }).catch((e) => setError(e.message))
  }, [requestedId])

  const load = () => Rfqs.get(rfqId).then(setRfq).catch((e) => setError(e.message))
  useEffect(() => {
    let active = true
    setRfq(null); setAllocation(null); setError('')
    if (rfqId) Rfqs.get(rfqId).then((r) => { if (active) { setRfq(r); if (r.recommendWeights && params.get('method') === 'ai') setWeights(r.recommendWeights) } }).catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [rfqId]) // eslint-disable-line react-hooks/exhaustive-deps

  const quotes = rfq?.quotes || []
  const supIds = [...new Set(quotes.map((q) => q.supplierId))]
  const scoresOf = (sid) => suppliers[sid]?.scores || { price: 70, quality: 70, delivery: 70 }
  const nameOf = (sid) => quotes.find((q) => q.supplierId === sid)?.supplierName || suppliers[sid]?.name || sid || 'No eligible supplier'

  const totals = quotes.map((q) => ({ sid: q.supplierId, ...quoteCoverage(rfq?.lines || [], q) }))
  const eligibleTotals = totals.filter((t) => t.complete && suppliers[t.sid]?.qualified !== false)
  const totalWeight = weights.price + weights.quality + weights.delivery
  const ranked = scoreCandidates(eligibleTotals.map((t) => {
    const quote = quotes.find((q) => q.supplierId === t.sid)
    const lines = (rfq?.lines || []).map((l) => quote.lines.find((q) => q.lineId === l.lineId))
    const quality = lines.reduce((sum, l) => sum + Number(l?.qualityScore ?? suppliers[t.sid]?.scores?.quality ?? 60), 0) / (lines.length || 1)
    const dates = lines.map((l) => Date.parse(l?.eta))
    const eta = dates.length && dates.every(Number.isFinite) ? new Date(Math.max(...dates)).toISOString() : ''
    return { sid: t.sid, rate: t.total, quality, eta }
  }), weights, suppliers)

  // Grouped view derived from the (editable) allocation. Declared BEFORE the
  // early returns so hook order stays stable.
  const groups = useMemo(() => {
    if (!allocation || !rfq) return null
    const bySup = {}
    for (const line of rfq.lines) {
      const sid = allocation[line.lineId]
      if (!sid || suppliers[sid]?.qualified === false) continue
      const priced = quotes.find((q) => q.supplierId === sid)?.lines.find((l) => l.lineId === line.lineId)
      if (!isPriced(priced)) continue
      const ql = quotes.find((q) => q.supplierId === sid)?.lines.find((l) => l.lineId === line.lineId)
      const rate = ql ? Number(ql.rate) || 0 : 0
      const qty = Number(line.qty) || 0
      bySup[sid] ??= { supplierId: sid, supplierName: nameOf(sid), lines: [], totalCost: 0, totalQty: 0 }
      bySup[sid].lines.push({ lineId: line.lineId, name: line.name, spec: line.spec, qty, rate, total: rate * qty })
      bySup[sid].totalCost += rate * qty
      bySup[sid].totalQty += qty
    }
    return Object.values(bySup).map((s) => ({ ...s, lineCount: s.lines.length })).sort((a, b) => b.totalCost - a.totalCost)
  }, [allocation, rfq, quotes]) // eslint-disable-line react-hooks/exhaustive-deps

  // In AI Recommended mode, pre-fill the allocation from any stored recommendation
  // (e.g. produced earlier from the Quote Comparison page).
  useEffect(() => {
    if (method !== 'ai' || !rfq?.recommendation || allocation) return
    const saved = rfq.recommendWeights
    if (saved && ['price', 'quality', 'delivery'].some((k) => Math.abs(saved[k] / (saved.price + saved.quality + saved.delivery) - weights[k] / totalWeight) > 0.0001)) return
    const alloc = {}
    for (const line of rfq.lines) { const x = rfq.recommendation[line.lineId]; if (x) alloc[line.lineId] = x.supplierId }
    if (Object.keys(alloc).length) setAllocation(alloc)
  }, [method, rfq, weights]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !rfq) return <Card className="p-6 text-rose-700">{error}</Card>
  if (candidates === null) return <Card><Spinner label="Loading evaluation…" /></Card>
  if (candidates.length === 0) return <Card className="p-8"><Empty icon="award" title="Nothing to evaluate yet" hint="An RFQ needs ≥2 responses before award." /></Card>
  if (!rfq) return <Card><Spinner /></Card>

  const cheapest = eligibleTotals.length ? eligibleTotals.reduce((a, b) => (a.total <= b.total ? a : b)) : null
  const winner = rfq.award?.type === 'full' ? rfq.award.supplierId : method === 'lowest' ? cheapest?.sid : method === 'weighted' ? ranked[0]?.sid : null
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
    try { await Rfqs.award(rfqId, { type: 'full', supplierId: winner, amount: totalFor(winner) }); flash(`Awarded to ${nameOf(winner)}`); load() } catch (e) { flash(e.message) } finally { setBusy(false) }
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
          if (isPriced(ql) && suppliers[q.supplierId]?.qualified !== false && (best === null || Number(ql.rate) < best.rate)) best = { sid: q.supplierId, rate: Number(ql.rate) }
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
    } catch (e) { flash(e.message) } finally { setBusy(false) }
  }
  const rejectAll = async () => { setBusy(true); try { await Rfqs.award(rfqId, { type: 'reject' }); flash('All quotes rejected'); load() } catch (e) { flash(e.message) } finally { setBusy(false) } }
  const approve = async (role) => { setBusy(true); try { await Rfqs.approve(rfqId, { role, decision: 'approved' }); flash(`${role.toUpperCase()} approved`); load() } catch (e) { flash(e.message) } finally { setBusy(false) } }

  // Suppliers that priced a given line (options for the move-to dropdown).
  const suppliersForLine = (lineId) => quotes.map((q) => {
    const ql = q.lines.find((l) => l.lineId === lineId)
    return isPriced(ql) && suppliers[q.supplierId]?.qualified !== false ? { sid: q.supplierId, name: q.supplierName, rate: Number(ql.rate) } : null
  }).filter(Boolean)

  // Segregate (Lowest Cost): each line to its cheapest quoting supplier.
  const segregate = () => {
    const alloc = {}
    for (const line of rfq.lines) {
      let best = null
      for (const c of suppliersForLine(line.lineId)) if (best === null || c.rate < best.rate) best = c
      if (best) alloc[line.lineId] = best.sid
    }
    setAllocation(alloc); flash('Segregated by lowest cost per line')
  }

  // AI Evaluate (Weighted): score each supplier per line on price + quality (spec
  // match) + delivery (ETA), pick the best per line, auto-segregate.
  const aiEvaluate = () => {
    const alloc = {}
    for (const line of rfq.lines) {
      const cands = quotes.map((q) => {
        const ql = q.lines.find((l) => l.lineId === line.lineId)
        return isPriced(ql) && suppliers[q.supplierId]?.qualified !== false ? { sid: q.supplierId, rate: Number(ql.rate), eta: ql.eta, quality: ql.qualityScore } : null
      }).filter(Boolean)
      if (!cands.length) continue
      const scored = scoreCandidates(cands, weights, suppliers)
      alloc[line.lineId] = scored[0].sid
    }
    setAllocation(alloc); flash('Allocated by weighted quote score')
  }

  // AI Recommended: send each item's whole row (every supplier's rate/eta/quality/
  // description) + the weights to the model, which picks the best supplier per item
  // with a reason. Batched server-side (20 items/parallel). Fills the allocation.
  const recommendation = rfq.recommendation || {}
  const reasonOf = (lineId) => recommendation[lineId]?.supplierId === allocation?.[lineId] ? recommendation[lineId]?.reason : 'Manually reassigned; review this supplier’s quote.'
  const runAiRecommend = async () => {
    setBusy(true)
    try {
      const r = await Rfqs.recommend(rfqId, weights)
      const fresh = await Rfqs.get(rfqId); setRfq(fresh)
      const rec = fresh.recommendation || {}
      const alloc = {}
      for (const line of fresh.lines) { const x = rec[line.lineId]; if (x) alloc[line.lineId] = x.supplierId }
      setAllocation(alloc)
      flash(`AI recommended a supplier for ${r.count}/${r.items} items`)
    } catch (e) { flash(e.message) } finally { setBusy(false) }
  }

  const moveLine = (lineId, sid) => setAllocation((a) => ({ ...a, [lineId]: sid }))

  const awardSegregation = async () => {
    if (!groups) return
    setBusy(true)
    try {
      const awards = groups.map((s) => ({ supplierId: s.supplierId, lineIds: s.lines.map((l) => l.lineId), amount: s.totalCost }))
      const amount = awards.reduce((a, x) => a + x.amount, 0)
      await Rfqs.award(rfqId, { type: 'split', awards, amount })
      flash(`Awarded across ${awards.length} suppliers`); load()
    } catch (e) { flash(e.message) } finally { setBusy(false) }
  }

  const awarded = rfq.status === 'Awarded' || rfq.award
  const canAward = can('award.decide') && !['Cancelled', 'Closed'].includes(rfq.status)
  const allocatedCount = groups?.reduce((sum, g) => sum + g.lineCount, 0) || 0
  const splitComplete = rfq.lines.length > 0 && rfq.lines.every((line) => suppliersForLine(line.lineId).length > 0)
  const chooseMethod = (value) => { setAllocation(null); setMethod(value) }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Evaluation & Award</h1>
          <p className="mt-1 text-sm text-ink-500">{rfq.id} — {rfq.title}</p>
        </div>
        <select value={rfqId} onChange={(e) => setRfqId(e.target.value)} disabled={busy} aria-label="Select RFQ" className="input w-auto py-2">
          {candidates.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.title}</option>)}
        </select>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => chooseMethod('lowest')} className={`btn ${method === 'lowest' ? 'btn-primary' : 'btn-outline'}`}><Coins size={16} /> Lowest Cost</button>
          <button onClick={() => chooseMethod('weighted')} className={`btn ${method === 'weighted' ? 'btn-primary' : 'btn-outline'}`}><Scale size={16} /> Weighted Scoring</button>
          <button onClick={() => chooseMethod('ai')} className={`btn ${method === 'ai' ? 'btn-primary' : 'btn-outline'}`}><Wand2 size={16} /> AI Recommended</button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {(method === 'weighted' || method === 'ai') && (
            <Card className="p-5">
              <SectionTitle action={<span className={`chip ${totalWeight === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>Total {totalWeight}%</span>}>Scoring Weights{method === 'ai' && <span className="ml-2 text-xs font-normal text-ink-400">— used by the AI recommendation</span>}</SectionTitle>
              <div className="space-y-5">
                {CRITERIA.map((c) => (
                  <div key={c.key}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="font-semibold text-ink-700">{c.label}</span>
                      <span className="font-semibold text-brand-600">{weights[c.key]}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={5} value={weights[c.key]} onChange={(e) => (setAllocation(null), setWeights((w) => ({ ...w, [c.key]: +e.target.value })))} className="w-full accent-brand-600" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <SectionTitle>Supplier Ranking</SectionTitle>
            <p className="mb-3 text-xs text-ink-500">Full RFQ ranking requires a positive price for every item. Weighted scoring uses the current quote total, average item quality and latest delivery date; missing quality or delivery uses supplier history.</p>
            {totals.filter((t) => !t.complete).map((t) => <p key={t.sid} className="mb-2 text-sm text-amber-700">{nameOf(t.sid)}: {t.count}/{rfq.lines.length} items priced — eligible for a split only.</p>)}
            {!eligibleTotals.length && <p className="text-sm text-amber-700">No supplier has a complete qualified quote. Review a split allocation below.</p>}
            <div className="space-y-3">
              {(method === 'lowest' || method === 'ai' ? [...eligibleTotals].sort((a, b) => a.total - b.total).map((t) => ({ sid: t.sid })) : ranked).map((r, i) => {
                const sid = r.sid
                const isWin = sid === winner
                const q = quotes.find((x) => x.supplierId === sid)
                return (
                  <div key={sid} className={`flex items-center gap-4 rounded-xl border p-4 ${isWin ? 'border-emerald-300 bg-emerald-50/50' : 'border-ink-100'}`}>
                    <div className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-500'}`}>{i === 0 ? <Trophy size={16} /> : i + 1}</div>
                    <Avatar name={nameOf(sid)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink-900">{nameOf(sid)}</p>
                      {method === 'weighted' && <p className="text-xs text-ink-500">Price {r.price.toFixed(1)} · Quality {r.quality.toFixed(1)} · Delivery {r.delivery.toFixed(1)}</p>}
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

          {/* Allocation — segregate (lowest) or AI evaluate (weighted); editable via move-to */}
          {!awarded && (
            <Card className="p-5">
              <SectionTitle action={
                method === 'ai'
                  ? <button className="btn-primary py-1.5 text-xs" disabled={!can('ai.use') || !can('rfq.evaluate') || busy || totalWeight <= 0} onClick={runAiRecommend}><Wand2 size={14} /> {allocation ? 'Re-run AI' : 'Run AI Recommendation'}</button>
                  : method === 'weighted'
                    ? <button className="btn-primary py-1.5 text-xs" disabled={busy || totalWeight <= 0} onClick={aiEvaluate}><Sparkles size={14} /> Evaluate quotes</button>
                    : <button className="btn-primary py-1.5 text-xs" disabled={busy} onClick={segregate}><Split size={14} /> Segregate</button>
              }>
                {method === 'ai' ? 'AI Recommended (best supplier per item + reasoning)' : method === 'weighted' ? 'Weighted evaluation per item' : 'Segregate by Line Item'}
              </SectionTitle>
              {!groups ? (
                <p className="text-sm text-ink-400">{method === 'ai'
                  ? 'The AI reviews each item\'s whole row (every supplier\'s price, ETA, quality and description) and picks the best supplier for your weights — with a one-line reason for each choice.'
                  : method === 'weighted'
                    ? 'Score each supplier per item on price + quality (spec match) + delivery (ETA) using your weights, then auto-assign each item to the best supplier.'
                    : 'Auto-assign each item to its cheapest quoting supplier.'} Review and reassign items below.</p>
              ) : groups.length === 0 ? (
                <p className="text-sm text-ink-400">No priced quote lines to allocate.</p>
              ) : (
                <div className="space-y-2">
                  {groups.map((s) => <SupplierAwardCard key={s.supplierId} s={s} suppliersForLine={suppliersForLine} onMove={moveLine} reasonOf={method === 'ai' ? reasonOf : null} />)}
                  <div className="flex items-center justify-between rounded-xl bg-ink-50 p-3">
                    <span className="text-sm font-semibold text-ink-700">Grand total ({groups.reduce((a, s) => a + s.lineCount, 0)} items · {groups.reduce((a, s) => a + s.totalQty, 0)} qty)</span>
                    <span className="text-lg font-extrabold text-ink-900">{fmt(groups.reduce((a, s) => a + s.totalCost, 0))}</span>
                  </div>
                  {allocatedCount < rfq.lines.length && <p className="text-sm text-amber-700">{rfq.lines.length - allocatedCount} items still need a priced supplier.</p>}
                  {canAward && <button className="btn-primary w-full" disabled={busy || allocatedCount !== rfq.lines.length} onClick={awardSegregation}><Check size={16} /> Award this split</button>}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle>Historical Supplier Performance</SectionTitle>
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
              <Avatar name={rfq.award?.type === 'split' ? 'Split award' : nameOf(winner)} size={44} />
              <div>
                <p className="font-bold text-ink-900">{rfq.award?.type === 'split' ? `${rfq.award.splits?.length} suppliers (split)` : rfq.award?.type === 'reject' ? 'All quotes rejected' : method === 'ai' && !awarded ? 'Review the per-item AI allocation' : nameOf(winner)}</p>
                {(awarded || winner) && <p className="text-sm text-ink-500">{fmt(awarded ? rfq.award?.amount : totalFor(winner))}{rfq.budget > 0 ? ` · budget difference ${fmt(rfq.budget - (awarded ? rfq.award?.amount || 0 : totalFor(winner)))}` : ''}</p>}
              </div>
            </div>

            {awarded ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-100/60 p-3 text-sm font-semibold text-emerald-700"><Check size={16} /> {rfq.award?.type === 'reject' ? 'This RFQ was cancelled.' : 'This RFQ has been awarded.'}</div>
            ) : canAward ? (
              <div className="mt-4 space-y-2">
                <button className="btn-primary w-full" disabled={busy || !winner || method === 'ai' || (method === 'weighted' && totalWeight <= 0)} onClick={awardFull}><Check size={16} /> Award Full RFQ</button>
                <button className="btn-outline w-full" disabled={busy || !splitComplete} onClick={awardSplit}>Split Award (per-line cheapest)</button>
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

// Per-supplier award block — collapsed by default (totals only), expands to the
// awarded line items.
function SupplierAwardCard({ s, suppliersForLine, onMove, reasonOf }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl border border-ink-100">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-ink-50/60">
        <ChevronRight size={15} className={`shrink-0 text-ink-400 transition ${open ? 'rotate-90' : ''}`} />
        <Avatar name={s.supplierName} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink-800">{s.supplierName}</p>
          <p className="text-xs text-ink-400">{s.lineCount} line item{s.lineCount > 1 ? 's' : ''} · {s.totalQty} total qty</p>
        </div>
        <p className="text-base font-extrabold text-ink-900">{fmt(s.totalCost)}</p>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-ink-100 px-3 py-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Rate</th><th className="py-1 text-right">Total</th>
                {onMove && <th className="py-1 text-right">Move to</th>}
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l) => {
                const options = suppliersForLine ? suppliersForLine(l.lineId) : []
                return (
                  <tr key={l.lineId} className="border-t border-ink-50 align-top">
                    <td className="py-1.5 text-ink-700">{l.name}{l.spec && <span className="ml-1 text-xs text-ink-400">· {l.spec}</span>}{reasonOf && reasonOf(l.lineId) && <p className="mt-0.5 max-w-md text-xs font-normal text-amber-700">{reasonOf(l.lineId)}</p>}</td>
                    <td className="py-1.5 text-right text-ink-600">{l.qty}</td>
                    <td className="py-1.5 text-right text-ink-600">{fmt(l.rate)}</td>
                    <td className="py-1.5 text-right font-semibold text-ink-800">{fmt(l.total)}</td>
                    {onMove && (
                      <td className="py-1.5 text-right">
                        <select value={s.supplierId} onChange={(e) => onMove(l.lineId, e.target.value)}
                          className="rounded-lg border border-ink-200 bg-white px-1.5 py-0.5 text-xs outline-none focus:border-brand-400">
                          {options.map((o) => <option key={o.sid} value={o.sid}>{o.name} · {fmt(o.rate)}</option>)}
                        </select>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-100 font-bold">
                <td className="py-1.5">Total · {s.lineCount} items · {s.totalQty} qty</td><td></td><td></td>
                <td className="py-1.5 text-right text-ink-900">{fmt(s.totalCost)}</td>
                {onMove && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
