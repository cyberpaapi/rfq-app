import { Router } from 'express'
import * as store from '../store.js'

const router = Router()

const round = (n) => Math.round(n)
const today = () => new Date().toISOString().slice(0, 10)

const CLOSED_STATES = ['Awarded', 'Closed', 'Cancelled']

// Amount actually committed by an award (full or split).
const awardAmount = (r) => {
  if (!r.award) return 0
  if (r.award.type === 'split') return r.award.splits?.reduce((a, s) => a + (s.amount || 0), 0) || r.award.amount || 0
  return r.award.amount || 0
}

// GET /api/reports — everything the Reports + Dashboard screens need, computed live.
router.get('/', (_req, res) => {
  const rfqs = store.all('rfqs')
  const quotes = store.all('quotes')
  const suppliers = store.all('suppliers')
  const t = today()

  const awarded = rfqs.filter((r) => r.status === 'Awarded' && r.award && r.award.type !== 'reject')
  const open = rfqs.filter((r) => !CLOSED_STATES.includes(r.status))
  const pendingApproval = rfqs.filter((r) => r.status === 'Pending Approval')
  const expired = rfqs.filter((r) => r.deadline && r.deadline < t && !CLOSED_STATES.includes(r.status))

  const totalBudget = awarded.reduce((a, r) => a + (r.budget || 0), 0)
  const totalAwarded = awarded.reduce((a, r) => a + awardAmount(r), 0)
  const savings = Math.max(0, totalBudget - totalAwarded)

  // Supplier participation.
  const participation = suppliers.map((s) => {
    const invited = rfqs.filter((r) => r.assignments?.some((a) => a.supplierId === s.id)).length
    const responded = new Set(quotes.filter((q) => q.supplierId === s.id).map((q) => q.rfqId)).size
    const won = awarded.filter((r) => r.award?.supplierId === s.id || r.award?.splits?.some((x) => x.supplierId === s.id)).length
    return {
      id: s.id, name: s.name,
      received: invited,
      responseRate: invited ? round((responded / invited) * 100) : 0,
      awardRate: invited ? round((won / invited) * 100) : 0,
    }
  })

  const savingsByRfq = awarded.map((r) => ({
    id: r.id, title: r.title, budget: r.budget || 0, awarded: awardAmount(r),
    savings: Math.max(0, (r.budget || 0) - awardAmount(r)),
    pct: r.budget ? round(((r.budget - awardAmount(r)) / r.budget) * 100) : 0,
  }))

  const aging = open.map((r) => ({
    id: r.id, title: r.title, status: r.status, deadline: r.deadline,
    expired: !!(r.deadline && r.deadline < t),
  }))

  const categories = ['Electronics', 'Raw Materials', 'Services', 'General']
  const byCategory = categories
    .map((c) => ({ name: c, value: rfqs.filter((r) => r.category === c).length }))
    .filter((c) => c.value > 0)

  const summaryRows = rfqs.map((r) => ({
    id: r.id, title: r.title, status: r.status, buyer: r.buyer,
    invited: r.assignments?.length || 0,
    responded: new Set(quotes.filter((q) => q.rfqId === r.id).map((q) => q.supplierId)).size,
    budget: r.budget || 0,
  }))

  res.json({
    summary: {
      openRfqs: open.length,
      pendingApproval: pendingApproval.length,
      awardedCount: awarded.length,
      expiredCount: expired.length,
      savings,
      savingsPct: totalBudget ? round((savings / totalBudget) * 100) : 0,
      avgResponseRate: participation.length ? round(participation.reduce((a, p) => a + p.responseRate, 0) / participation.length) : 0,
    },
    savingsByRfq,
    participation,
    aging,
    byCategory,
    summaryRows,
  })
})

export default router
