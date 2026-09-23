import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { quoteCoverage } from '../../shared/evaluation'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GitCompareArrows, FileSpreadsheet, Sparkles, Loader2, ChevronDown, ArrowRight, FileDown, ChevronLeft, ChevronRight, Wand2 } from 'lucide-react'
import { Rfqs, Reports } from '../api/client'
import { fmt } from '../data/mock'
import { Card, Spinner } from '../components/ui'

export default function Compare() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const requestedId = params.get('rfq')
  const [error, setError] = useState('')
  const saves = useRef(new Set())
  const [saving, setSaving] = useState(false)
  const trackSave = (promise) => {
    setSaving(true)
    const task = promise.catch((e) => { setError(`Save failed: ${e.message}`); throw e }).finally(() => { saves.current.delete(task); setSaving(saves.current.size > 0) })
    saves.current.add(task); task.catch(() => {}); return task
  }
  const waitForSaves = async () => { await Promise.all([...saves.current]); if (error) throw new Error(error) }
  const [candidates, setCandidates] = useState(null)
  const [rfqId, setRfqId] = useState('')
  const [rfq, setRfq] = useState(null)
  const [quotes, setQuotes] = useState([]) // editable working copy
  const [scoring, setScoring] = useState(false)
  const [recommending, setRecommending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dlOpen, setDlOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600) }

  useEffect(() => {
    Promise.all([Rfqs.list(), Reports()]).then(([rfqs, rep]) => {
      const responded = Object.fromEntries(rep.summaryRows.map((s) => [s.id, s.responded]))
      const cands = rfqs.filter((r) => (responded[r.id] || 0) >= 2)
      setCandidates(cands)
      setRfqId(cands.some((r) => r.id === requestedId) ? requestedId : cands[0]?.id || '')
    }).catch((e) => setError(e.message))
  }, [requestedId])

  const load = () => rfqId && Rfqs.get(rfqId).then((r) => { setRfq(r); setQuotes(r.quotes || []) })
  useEffect(() => {
    let active = true
    setRfq(null); setQuotes([]); setError('')
    if (rfqId) Rfqs.get(rfqId).then((r) => { if (active) { setRfq(r); setQuotes(r.quotes || []) } }).catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [rfqId]) // eslint-disable-line

  const supIds = quotes.map((q) => q.supplierId)
  const nameOf = (sid) => quotes.find((q) => q.supplierId === sid)?.supplierName || sid
  const qline = (sid, lineId) => quotes.find((q) => q.supplierId === sid)?.lines.find((l) => l.lineId === lineId)

  const setCell = (sid, lineId, patch) => {
    setRfq((r) => ({ ...r, recommendation: null }))
    setQuotes((qs) => qs.map((q) => q.supplierId !== sid ? q : { ...q, lines: q.lines.some((l) => l.lineId === lineId) ? q.lines.map((l) => l.lineId === lineId ? { ...l, ...patch } : l) : [...q.lines, { lineId, ...patch }] }))
  }
  const saveCell = (sid, lineId, patch) => trackSave(Rfqs.editQuote(rfqId, sid, { lines: [{ lineId, ...patch }] }))
  const setEtaAll = (sid, eta) => {
    setRfq((r) => ({ ...r, recommendation: null }))
    setQuotes((qs) => qs.map((q) => q.supplierId !== sid ? q : { ...q, lines: q.lines.map((l) => ({ ...l, eta })) }))
    trackSave(Rfqs.editQuote(rfqId, sid, { etaAll: eta }))
  }

  const rows = useMemo(() => (rfq?.lines || []).map((line) => {
    const cells = supIds.map((sid) => {
      const l = qline(sid, line.lineId)
      const rate = l ? Number(l.rate) || 0 : null
      return { sid, l, rate, total: rate != null ? rate * (Number(line.qty) || 0) : null, quality: l?.qualityScore ?? null }
    })
    const priced = cells.filter((c) => c.rate != null && c.rate > 0)
    const minTotal = priced.length ? Math.min(...priced.map((c) => c.total)) : null
    const qs = priced.filter((c) => c.quality != null && c.quality !== '')
    const maxQ = qs.length ? Math.max(...qs.map((c) => c.quality)) : null
    const etaCells = priced.filter((c) => Number.isFinite(Date.parse(c.l?.eta)))
    const fastest = etaCells.length ? etaCells.reduce((a, b) => (new Date(a.l.eta) <= new Date(b.l.eta) ? a : b)) : null
    return { line, cells, priceWinner: priced.find((c) => c.total === minTotal)?.sid, qualityWinner: qs.find((c) => c.quality === maxQ)?.sid, fastestEta: fastest?.sid, fastestEtaDate: fastest?.l?.eta }
  }), [rfq, quotes]) // eslint-disable-line

  // Horizontal scroll arrows (the grid is very wide).
  const scrollRef = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const updateEdges = () => { const el = scrollRef.current; if (!el) return; setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }) }
  useEffect(() => {
    const el = scrollRef.current
    updateEdges()
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => updateEdges())
    ro.observe(el)
    return () => ro.disconnect()
  }, [rfq, quotes])
  const nudge = (dx) => scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' })

  if (error && candidates === null) return <Card className="p-6 text-rose-700">{error}</Card>
  if (candidates === null) return <Card><Spinner label="Loading comparisons…" /></Card>
  if (candidates.length === 0) return (
    <Card className="p-10 text-center">
      <GitCompareArrows className="mx-auto mb-3 text-ink-300" size={32} />
      <p className="font-semibold text-ink-700">No comparable RFQs yet</p>
      <p className="text-sm text-ink-400">Comparison needs at least two supplier responses.</p>
    </Card>
  )

  const totalsBySup = supIds.map((sid) => ({ sid, total: rows.reduce((a, r) => a + (r.cells.find((c) => c.sid === sid)?.total || 0), 0) }))
  const completeTotals = totalsBySup.filter((t) => quoteCoverage(rfq?.lines || [], quotes.find((q) => q.supplierId === t.sid)).complete)
  const bestTotal = completeTotals.length ? Math.min(...completeTotals.map((t) => t.total)) : null
  const withFile = quotes.filter((q) => q.hasFile)
  const recommendation = rfq?.recommendation || {}
  // Default weights the "best suggestion" trades off (Evaluation lets you tune these).
  const RECO_WEIGHTS = { price: 40, quality: 35, delivery: 25 }

  const runScore = async () => { setScoring(true); try { await waitForSaves(); const r = await Rfqs.scoreQuality(rfqId); await load(); flash(`Quality scored for ${r.scored} lines (${r.engine})`) } catch (e) { flash(e.message) } finally { setScoring(false) } }
  const runRecommend = async () => { setRecommending(true); try { await waitForSaves(); const r = await Rfqs.recommend(rfqId, RECO_WEIGHTS); await load(); flash(`AI picked a supplier for ${r.count}/${r.items} items`) } catch (e) { flash(e.message) } finally { setRecommending(false) } }
  const forward = async () => { setBusy(true); try { await waitForSaves(); await Rfqs.forwardEvaluation(rfqId); flash('Forwarded to Evaluation'); nav(`/award?rfq=${encodeURIComponent(rfqId)}${rfq?.recommendation ? '&method=ai' : ''}`) } catch (e) { flash(e.message) } finally { setBusy(false) } }

  return (
    <div className="space-y-5">
      {error && <Card className="p-4 text-rose-700">{error} <button onClick={() => { setError(''); load() }} className="underline">Reload saved values</button></Card>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Quote Comparison</h1>
          <p className="mt-1 text-sm text-ink-500">Editable side-by-side — price, ETA (delivery) and spec quality per supplier.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Select RFQ" disabled={busy || scoring || recommending || saving} value={rfqId} onChange={(e) => setRfqId(e.target.value)} className="input w-auto py-2">
            {candidates.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.title}</option>)}
          </select>
          {/* Download a supplier's original response */}
          <div className="relative">
            <button className="btn-outline" disabled={!withFile.length} onClick={() => setDlOpen((v) => !v)}><FileDown size={16} /> Download response <ChevronDown size={14} /></button>
            {dlOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDlOpen(false)} />
                <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card-lg">
                  {withFile.map((q) => (
                    <a key={q.supplierId} href={Rfqs.quoteFileUrl(rfqId, q.supplierId)} onClick={() => setDlOpen(false)} className="block px-3 py-2 text-sm hover:bg-ink-50">
                      <span className="font-semibold text-ink-800">{q.supplierName}</span>
                      <span className="block truncate text-xs text-ink-400">{q.fileName}</span>
                      {q.fileExpiresAt && <span className="block text-xs text-ink-400">Original expires {new Date(q.fileExpiresAt).toLocaleDateString()}</span>}
                    </a>
                  ))}
                  {!withFile.length && <p className="px-3 py-2 text-xs text-ink-400">No uploaded files.</p>}
                </div>
              </>
            )}
          </div>
          <button className="btn-outline" onClick={runScore} disabled={scoring || recommending || saving || !!error || !!rfq?.award}>{scoring ? <><Loader2 size={16} className="animate-spin" /> Scoring…</> : <><Sparkles size={16} /> Score quality (AI)</>}</button>
          <button className="btn-outline" onClick={runRecommend} disabled={scoring || recommending || saving || !!error || !!rfq?.award} title={`Weighted: price ${RECO_WEIGHTS.price}% · quality ${RECO_WEIGHTS.quality}% · delivery ${RECO_WEIGHTS.delivery}%`}>{recommending ? <><Loader2 size={16} className="animate-spin" /> Choosing…</> : <><Wand2 size={16} /> Process best suggestion</>}</button>
          <button className="btn-outline" onClick={() => window.open(Rfqs.exportComparisonUrl(rfqId), '_blank')}><FileSpreadsheet size={16} /> Download comparison</button>
          <button className="btn-primary" onClick={forward} disabled={busy || scoring || recommending || saving || !!error || !!rfq?.award}>{busy ? <Loader2 size={16} className="animate-spin" /> : <>Forward to Evaluation <ArrowRight size={16} /></>}</button>
        </div>
      </div>

      {!rfq ? <Card><Spinner /></Card> : (
        <>
          {/* Whole-consignment ETA per supplier */}
          <Card className="flex flex-wrap items-center gap-4 p-4 text-sm">
            <span className="font-semibold text-ink-600">Set consignment ETA:</span>
            {supIds.map((sid) => (
              <label key={sid} className="flex items-center gap-1.5">
                <span className="text-ink-500">{nameOf(sid)}</span>
                <input disabled={scoring || recommending || busy || !!rfq?.award} type="date" onChange={(e) => setEtaAll(sid, e.target.value)} className="input w-40 py-1 text-xs" />
              </label>
            ))}
            <span className="ml-auto text-xs text-ink-400">Applies to every item; edit any cell individually below.</span>
          </Card>

          <Card className="overflow-hidden">
            <div className="relative">
              {edges.left && <button type="button" aria-label="Scroll left" onClick={() => nudge(-360)} className="absolute left-1.5 top-1 z-20 grid h-8 w-8 place-items-center rounded-full border border-ink-200 bg-white text-ink-600 shadow-md transition hover:bg-ink-50 hover:text-brand-600"><ChevronLeft size={18} /></button>}
              {edges.right && <button type="button" aria-label="Scroll right" onClick={() => nudge(360)} className="absolute right-1.5 top-1 z-20 grid h-8 w-8 place-items-center rounded-full border border-ink-200 bg-white text-ink-600 shadow-md transition hover:bg-ink-50 hover:text-brand-600"><ChevronRight size={18} /></button>}
              <div ref={scrollRef} onScroll={updateEdges} className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 1520 + supIds.length * 320 }}>
                  <thead>
                    <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2" style={{ minWidth: 300 }}>Item</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      {supIds.map((sid) => <th key={sid} className="border-l border-ink-100 px-3 py-2 text-center" colSpan={4}>{nameOf(sid)}</th>)}
                      <th className="border-l border-ink-100 px-3 py-2" style={{ minWidth: 280 }}>Spec Notes Comparison</th>
                      <th className="border-l border-ink-100 px-3 py-2">Lower Price</th>
                      <th className="px-3 py-2">Quality Winner</th>
                      <th className="px-3 py-2">Fastest ETA</th>
                      <th className="border-l border-ink-100 px-3 py-2">Recommended</th>
                      <th className="px-3 py-2" style={{ minWidth: 240 }}>Reasoning</th>
                    </tr>
                    <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                      <th colSpan={3}></th>
                      {supIds.map((sid) => (
                        <Fragment key={sid}>
                          <th className="border-l border-ink-100 px-3 py-1.5 text-right">Rate</th>
                          <th className="px-3 py-1.5 text-right">Total</th>
                          <th className="px-3 py-1.5">ETA</th>
                          <th className="px-3 py-1.5 text-right">Qual</th>
                        </Fragment>
                      ))}
                      <th colSpan={6}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {rows.map((row, idx) => {
                      const rec = recommendation[row.line.lineId]
                      return (
                      <tr key={row.line.lineId} className="align-top">
                        <td className="px-3 py-2 text-ink-400">{idx + 1}</td>
                        <td className="px-3 py-2" style={{ minWidth: 300 }}><p className="font-semibold text-ink-800">{row.line.name}</p>{(row.line.spec || row.line.description) && <p className="text-xs text-ink-400">{[row.line.spec, row.line.description].filter(Boolean).join(' — ')}</p>}</td>
                        <td className="px-3 py-2 text-right text-ink-600">{row.line.qty}</td>
                        {supIds.map((sid) => {
                          const c = row.cells.find((x) => x.sid === sid)
                          const win = row.priceWinner === sid
                          return (
                            <Fragment key={sid}>
                              <td className={`border-l border-ink-100 px-2 py-2 text-right ${win ? 'bg-emerald-50' : ''}`}>
                                <input disabled={scoring || recommending || busy || !!rfq?.award} type="number" min="0" step="0.01" value={c.l?.rate ?? ''} onChange={(e) => setCell(sid, row.line.lineId, { rate: e.target.value })} onBlur={(e) => saveCell(sid, row.line.lineId, { rate: e.target.value })} className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-right hover:border-ink-200 focus:border-brand-400 focus:bg-white focus:outline-none" />
                              </td>
                              <td className={`px-2 py-2 text-right font-semibold ${win ? 'bg-emerald-50 text-emerald-700' : 'text-ink-700'}`}>{c.total != null ? fmt(c.total) : '—'}</td>
                              <td className={`px-2 py-2 ${row.fastestEta === sid ? 'bg-sky-50' : ''}`}>
                                <input disabled={scoring || recommending || busy || !!rfq?.award} type="date" value={c.l?.eta || ''} onChange={(e) => setCell(sid, row.line.lineId, { eta: e.target.value })} onBlur={(e) => saveCell(sid, row.line.lineId, { eta: e.target.value })} className="w-32 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-ink-200 focus:border-brand-400 focus:bg-white focus:outline-none" />
                                {!c.l?.eta && <span className="text-xs text-ink-300">—</span>}
                              </td>
                              <td className={`px-2 py-2 text-right ${row.qualityWinner === sid ? 'bg-violet-50 font-semibold text-violet-700' : ''}`}>
                                <input disabled={scoring || recommending || busy || !!rfq?.award} type="number" min="0" max="99" value={c.l?.qualityScore ?? ''} placeholder="—" onChange={(e) => setCell(sid, row.line.lineId, { qualityScore: e.target.value })} onBlur={(e) => saveCell(sid, row.line.lineId, { qualityScore: e.target.value })} className="w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-right hover:border-ink-200 focus:border-brand-400 focus:bg-white focus:outline-none" />
                              </td>
                            </Fragment>
                          )
                        })}
                        <td className="border-l border-ink-100 px-3 py-2" style={{ minWidth: 280 }}>
                          <p className="mb-1 text-[11px] font-semibold text-ink-500">Req: <span className="font-normal text-ink-600">{[row.line.spec, row.line.description].filter(Boolean).join(' — ') || '—'}</span></p>
                          <div className="space-y-1">
                            {supIds.map((sid) => {
                              const l = qline(sid, row.line.lineId)
                              return (
                                <div key={sid} className={`rounded px-1.5 py-1 text-xs ${row.qualityWinner === sid ? 'bg-violet-50' : 'bg-ink-50'}`}>
                                  <span className="font-semibold text-ink-700">{nameOf(sid)}:</span>{' '}
                                  <input disabled={scoring || recommending || busy || !!rfq?.award} value={l?.specNotes ?? ''} placeholder="add notes…" onChange={(e) => setCell(sid, row.line.lineId, { specNotes: e.target.value })} onBlur={(e) => saveCell(sid, row.line.lineId, { specNotes: e.target.value })} className="w-[calc(100%-4rem)] rounded border border-transparent bg-transparent px-1 hover:border-ink-200 focus:border-brand-400 focus:bg-white focus:outline-none" />
                                </div>
                              )
                            })}
                          </div>
                        </td>
                        <td className="border-l border-ink-100 px-3 py-2">{row.priceWinner ? <span className="chip bg-emerald-50 text-emerald-700">{nameOf(row.priceWinner)}</span> : '—'}</td>
                        <td className="px-3 py-2">{row.qualityWinner ? <span className="chip bg-violet-50 text-violet-700">{nameOf(row.qualityWinner)}</span> : <span className="text-xs text-ink-300">score first</span>}</td>
                        <td className="px-3 py-2">{row.fastestEta ? <span className="chip bg-sky-50 text-sky-700" title={row.fastestEtaDate}>{nameOf(row.fastestEta)}</span> : <span className="text-ink-300">—</span>}</td>
                        <td className="border-l border-ink-100 px-3 py-2">{rec ? <span className="chip bg-amber-50 font-semibold text-amber-700">{rec.supplierName}</span> : <span className="text-xs text-ink-300">run AI</span>}</td>
                        <td className="px-3 py-2 text-xs text-ink-500" style={{ minWidth: 240 }}>{rec?.reason || <span className="text-ink-300">—</span>}</td>
                      </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-ink-100 bg-ink-50/60 font-bold">
                      <td className="px-3 py-2" colSpan={3}>Grand Total</td>
                      {totalsBySup.map((t) => (
                        <Fragment key={t.sid}>
                          <td className="border-l border-ink-100 px-2 py-2 text-right" colSpan={2}>{fmt(t.total)}{!quoteCoverage(rfq.lines, quotes.find((q) => q.supplierId === t.sid)).complete && <span className="block text-xs font-normal text-amber-700">Incomplete quote</span>}</td>
                          <td colSpan={2}></td>
                        </Fragment>
                      ))}
                      <td className="border-l border-ink-100 px-3 py-2 text-emerald-700" colSpan={6}>Best total: {bestTotal == null ? 'No complete quote' : nameOf(completeTotals.find((t) => t.total === bestTotal)?.sid)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-400">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-100 ring-1 ring-emerald-300" /> Lowest price</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-violet-100 ring-1 ring-violet-300" /> Best quality match</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-100 ring-1 ring-amber-300" /> AI recommended (weighted)</span>
            <Link to={`/rfqs/${rfq.id}`} className="ml-auto font-semibold text-brand-600 hover:text-brand-700">Open RFQ →</Link>
          </div>
        </>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-card-lg animate-fade-in">{toast}</div>}
    </div>
  )
}
