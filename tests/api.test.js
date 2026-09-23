import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'

test('procurement API regression checks on isolated data', async (t) => {
  const data = await mkdtemp(join(tmpdir(), 'opro-regression-'))
  const port = 44123
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), RFQ_DATA_DIR: data, OPENAI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  server.stdout.on('data', (x) => { output += x })
  server.stderr.on('data', (x) => { output += x })
  t.after(async () => { const exited = once(server, 'exit'); server.kill(); await exited; await rm(data, { recursive: true, force: true }) })
  const request = async (path, body, method = 'POST') => {
    const res = await fetch(`http://localhost:${port}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) })
    return { status: res.status, data: await res.json() }
  }
  for (let i = 0; i < 100; i++) {
    try { if ((await request('/health', null, 'GET')).status === 200) break } catch {}
    if (server.exitCode != null || i === 99) throw new Error(output || 'API did not start')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  let rfq
  await t.test('create RFQ, reject invalid assignments, assign suppliers', async () => {
    const result = await request('/rfqs', { title: 'Regression fixture', lines: [{ name: 'Lamp', qty: 2 }, { name: 'Cable', qty: 3 }] })
    assert.equal(result.status, 201); rfq = result.data
    assert.equal((await request(`/rfqs/${rfq.id}/assign`, { supplierId: 'SUP-001', type: 'partial', lineIds: [] })).status, 400)
    assert.equal((await request(`/rfqs/${rfq.id}/assign`, { supplierId: 'SUP-001', type: 'partial', lineIds: ['unknown'] })).status, 400)
    for (const supplierId of ['SUP-001', 'SUP-002']) assert.equal((await request(`/rfqs/${rfq.id}/assign`, { supplierId })).status, 200)
  })
  await t.test('repeat submissions replace quotes and canonicalize supplier identity', async () => {
    const body = { supplierId: 'SUP-001', supplierName: 'Wrong name', lines: [{ lineId: rfq.lines[0].lineId, rate: 1 }] }
    for (let i = 0; i < 2; i++) assert.equal((await request(`/rfqs/${rfq.id}/quote`, body)).status, 201)
    const result = await request(`/rfqs/${rfq.id}`, null, 'GET')
    assert.equal(result.data.quotes.length, 1)
    assert.equal(result.data.quotes[0].supplierName, 'A')
    assert.equal((await request(`/rfqs/${rfq.id}/quote`, { ...body, supplierId: 'SUP-003' })).status, 400)
  })
  await t.test('award rejects incomplete cheap bids and missing split items', async () => {
    assert.equal((await request(`/rfqs/${rfq.id}/award`, { supplierId: 'SUP-001', amount: 0 })).status, 400)
    assert.equal((await request(`/rfqs/${rfq.id}/award`, { type: 'split', awards: [{ supplierId: 'SUP-001', lineIds: [rfq.lines[0].lineId] }] })).status, 400)
  })
  await t.test('comparison can add a missing quote line, rejects invalid values', async () => {
    assert.equal((await request(`/rfqs/${rfq.id}/quotes/SUP-001`, { lines: [{ lineId: rfq.lines[1].lineId, rate: 10 }] }, 'PUT')).status, 200)
    assert.equal((await request(`/rfqs/${rfq.id}/quotes/SUP-001`, { lines: [{ lineId: rfq.lines[1].lineId, rate: -1 }] }, 'PUT')).status, 400)
    const result = await request(`/rfqs/${rfq.id}`, null, 'GET')
    assert.equal(result.data.quotes[0].lines.length, 2)
  })
  await t.test('full assignments include newly added RFQ items', async () => {
    const result = await request(`/rfqs/${rfq.id}`, { lines: [...rfq.lines, { name: 'Extra', qty: 1 }] }, 'PUT')
    assert.equal(result.status, 200)
    assert.equal(result.data.assignments[0].lineIds.length, 3)
    assert.equal((await request(`/rfqs/${rfq.id}`, { lines: rfq.lines }, 'PUT')).status, 200)
  })
  await t.test('award totals are computed on server and finalization is immutable', async () => {
    const result = await request(`/rfqs/${rfq.id}/award`, { supplierId: 'SUP-001', amount: 0.01 })
    assert.equal(result.status, 200)
    assert.equal(result.data.award.amount, 32)
    assert.equal((await request(`/rfqs/${rfq.id}/award`, { type: 'reject' })).status, 400)
    assert.equal((await request(`/rfqs/${rfq.id}/quotes/SUP-001`, { lines: [{ lineId: rfq.lines[0].lineId, rate: 999 }] }, 'PUT')).status, 409)
    assert.equal((await request(`/rfqs/${rfq.id}/status`, { status: 'Draft' })).status, 409)
  })
  await t.test('recommendation validates weights and fails visibly without AI', async () => {
    assert.equal((await request('/rfqs/RFQ-2026-0042/recommend', { weights: { price: 0, quality: 0, delivery: 0 } })).status, 400)
    assert.equal((await request('/rfqs/RFQ-2026-0042/recommend', { weights: { price: 100, quality: 0, delivery: 0 } })).status, 503)
  })
})
