import test from 'node:test'
import assert from 'node:assert/strict'
import { isPriced, quoteCoverage, scoreCandidates, validateAward } from '../shared/evaluation.js'
import { matchQuoteLines } from '../server/lib/ai.js'

const lines = [{ lineId: '1', name: 'Lamp', qty: 2 }, { lineId: '2', name: 'Cable', qty: 3 }]
const suppliers = [{ id: 'A', name: 'Same name' }, { id: 'B', name: 'Same name' }]
const rfq = { status: 'Evaluation', lines }
const quotes = [
  { supplierId: 'A', lines: [{ lineId: '1', rate: 1 }, { lineId: '2', rate: 0 }] },
  { supplierId: 'B', lines: [{ lineId: '1', rate: 5 }, { lineId: '2', rate: 10 }] },
]

test('missing, zero, negative and non-finite rates cannot win', () => {
  for (const rate of [undefined, null, '', 0, -2, NaN, Infinity, 'bad']) assert.equal(isPriced({ rate }), false)
  assert.equal(isPriced({ rate: '1.25' }), true)
})
test('incomplete cheap bids are not eligible for a full award', () => {
  assert.deepEqual(quoteCoverage(lines, quotes[0]), { count: 1, complete: false, total: 2 })
  assert.deepEqual(quoteCoverage(lines, quotes[1]), { count: 2, complete: true, total: 40 })
  assert.throws(() => validateAward(rfq, quotes, suppliers, { supplierId: 'A' }), /no valid price/)
})
test('full award uses persisted prices and stable supplier IDs', () => {
  const result = validateAward(rfq, quotes, suppliers, { supplierId: 'B', amount: 0.01 })
  assert.equal(result.amount, 40)
  assert.equal(result.supplierId, 'B')
})
test('split award rejects empty, missing, duplicate, unknown and unpriced allocations', () => {
  for (const awards of [[], [{ supplierId: 'B', lineIds: ['1'] }], [{ supplierId: 'B', lineIds: ['1', '1', '2'] }], [{ supplierId: 'B', lineIds: ['1', 'x'] }], [{ supplierId: 'A', lineIds: ['1', '2'] }], [{ supplierId: 'x', lineIds: ['1', '2'] }]]) {
    assert.throws(() => validateAward(rfq, quotes, suppliers, { type: 'split', awards }))
  }
})
test('valid split covers every item and recomputes its total', () => {
  const result = validateAward(rfq, quotes, suppliers, { type: 'split', amount: 1, awards: [{ supplierId: 'A', lineIds: ['1'], amount: 1 }, { supplierId: 'B', lineIds: ['2'], amount: 1 }] })
  assert.equal(result.amount, 32)
})
test('finalized RFQs cannot be awarded or rejected again', () => {
  for (const status of ['Awarded', 'Closed', 'Cancelled']) assert.throws(() => validateAward({ ...rfq, status }, quotes, suppliers, { type: 'reject' }))
})
test('weighted scoring uses current price even when historical price scores disagree', () => {
  const ranked = scoreCandidates([{ sid: 'A', rate: 100 }, { sid: 'B', rate: 50 }], { price: 100, quality: 0, delivery: 0 }, { A: { scores: { price: 100 } }, B: { scores: { price: 1 } } })
  assert.equal(ranked[0].sid, 'B')
})
test('quality weights and delivery weights change winners using quoted terms', () => {
  const candidates = [{ sid: 'A', rate: 50, quality: 20, eta: '2026-10-01' }, { sid: 'B', rate: 100, quality: 99, eta: '2026-11-01' }]
  assert.equal(scoreCandidates(candidates, { price: 0, quality: 100, delivery: 0 })[0].sid, 'B')
  assert.equal(scoreCandidates(candidates, { price: 0, quality: 0, delivery: 100 })[0].sid, 'A')
})
test('invalid delivery dates do not poison the weighted scores', () => {
  const ranked = scoreCandidates([{ sid: 'A', rate: 10, eta: 'bad' }, { sid: 'B', rate: 20, eta: '2026-10-01' }], { price: 30, quality: 40, delivery: 30 })
  assert.ok(ranked.every((c) => Number.isFinite(c.score)))
})

test('quote fallback never matches unrelated items just because quantities agree', async (t) => {
  const key = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = ''
  t.after(() => { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key })
  const result = await matchQuoteLines([{ name: 'Copper cable', qty: 10 }], [{ name: 'Office chair', quantity: 10 }])
  assert.deepEqual(result.map, [-1])
  const reordered = await matchQuoteLines([{ name: 'Copper cable', qty: 10 }, { name: 'Wall lamp', qty: 2 }], [{ name: 'Wall lamp', quantity: 2 }, { name: 'Copper cable', quantity: 10 }])
  assert.deepEqual(reordered.map, [1, 0])
})
