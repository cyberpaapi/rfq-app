import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { hashPassword } from '../server/lib/auth.js'

test('procurement API regression checks on isolated data', async (t) => {
  const data = await mkdtemp(join(tmpdir(), 'opro-regression-'))
  const port = 44123
  const adminPassword = 'test-only-admin-password-123'
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), RFQ_DATA_DIR: data, OPENAI_API_KEY: '', ADMIN_BOOTSTRAP_USERNAME: 'admin', ADMIN_BOOTSTRAP_PASSWORD_HASH: await hashPassword(adminPassword), ACCOUNT_PASSWORD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64url') }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  server.stdout.on('data', (x) => { output += x })
  server.stderr.on('data', (x) => { output += x })
  t.after(async () => { const exited = once(server, 'exit'); server.kill(); await exited; await rm(data, { recursive: true, force: true }) })
  let adminCookie = ''
  const request = async (path, body, method = 'POST', cookie = adminCookie, extraHeaders = {}) => {
    const res = await fetch(`http://localhost:${port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-opro-request': '1', ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }, ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) })
    return { status: res.status, data: await res.json(), requestId: res.headers.get('x-request-id') }
  }
  for (let i = 0; i < 100; i++) {
    try { if ((await request('/health', null, 'GET')).status === 200) break } catch {}
    if (server.exitCode != null || i === 99) throw new Error(output || 'API did not start')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const login = async (username, password) => {
    const res = await fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-opro-request': '1' }, body: JSON.stringify({ username, password }) })
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] || '' }
  }
  assert.equal((await request('/roles', null, 'GET', '')).status, 401)
  assert.equal((await request('/roles', null, 'GET', '', { 'x-role-key': 'admin' })).status, 401)
  assert.equal((await login('admin', 'wrong-password')).status, 401)
  const signedIn = await login('admin', adminPassword)
  assert.equal(signedIn.status, 200)
  adminCookie = signedIn.cookie
  assert.ok(adminCookie.startsWith('opro_session='))
  assert.equal((await request('/auth/me', null, 'GET')).data.account.username, 'admin')
  assert.equal((await request('/roles', {}, 'POST', adminCookie, { 'x-opro-request': '0' })).status, 403)
  let rfq
  await t.test('catalogue fields, full-catalogue search, pagination and metadata', async () => {
    const fields = { name: 'Catalogue source fixture', aiName: 'AI-UNIQUE-LOOKUP', description: 'Full description', sku: '00042', category: 'Custom category', subcategory: 'Custom subcategory', uom: '', partNo: 'MPN-UNIQUE-LOOKUP', unitName: 'Source unit' }
    const added = await request('/items', fields)
    assert.equal(added.status, 201)
    for (const [key, value] of Object.entries(fields)) assert.equal(added.data.item[key], value)
    const search = await request('/items?paged=true&q=AI-UNIQUE-LOOKUP', null, 'GET')
    assert.equal(search.data.total, 1)
    assert.equal(search.data.items[0].sku, '00042')
    assert.equal((await request('/items?paged=true&q=MPN-UNIQUE-LOOKUP&offset=1', null, 'GET')).data.items.length, 0)
    const meta = await request('/items/meta', null, 'GET')
    assert.ok(meta.data.categories.includes('Custom category'))
    assert.ok(meta.data.subcategories.includes('Custom subcategory'))
    await request(`/items/${added.data.item.id}`, { aiName: 'Edited AI', subcategory: 'Edited subcategory', unitName: '' }, 'PUT')
    const edited = await request('/items?paged=true&q=Edited%20AI', null, 'GET')
    assert.equal(edited.data.items[0].unitName, '')
    assert.equal(edited.data.items[0].subcategory, 'Edited subcategory')
  })
  await t.test('shared roles enforce restrictions and protect Administrator', async () => {
    const cookies = new Map()
    const asRole = (path, role, body, method = body ? 'POST' : 'GET') => request(path, body, method, cookies.get(role) || '', { 'x-role-key': role, 'x-supplier-id': 'SUP-002' })
    const roles = await request('/roles', null, 'GET')
    assert.equal(roles.data.length, 1)
    assert.ok(!JSON.stringify(roles.data).includes('passwordHash'))
    const created = await request('/roles', { label: 'Restricted Reviewer', username: 'reviewer', password: 'reviewer-password-123', permissions: ['workspace.view', 'rfq.evaluate'], readOnly: true })
    assert.equal(created.status, 201)
    assert.equal(created.data.passwordAvailable, true)
    assert.equal((await request(`/roles/${created.data.id}/password`, null, 'GET', '')).status, 401)
    for (let attempt = 0; attempt < 2; attempt++) {
      const revealed = await request(`/roles/${created.data.id}/password`, null, 'GET')
      assert.equal(revealed.status, 200)
      assert.deepEqual(revealed.data, { username: 'reviewer', password: 'reviewer-password-123' })
    }
    assert.ok(!JSON.stringify((await request('/roles', null, 'GET')).data).includes('reviewer-password-123'))
    const secondAccount = await request('/roles', { label: 'Second Reviewer', username: 'reviewer2', password: 'reviewer2-password-123', permissions: ['workspace.view', 'rfq.evaluate'] })
    assert.equal(secondAccount.status, 201)
    assert.equal(secondAccount.data.username, 'reviewer2')
    assert.equal((await request('/roles', null, 'GET')).data.length, 3)
    const key = created.data.id
    cookies.set(key, (await login('reviewer', 'reviewer-password-123')).cookie)
    assert.equal((await asRole(`/roles/${key}/password`, key)).status, 403)
    assert.equal((await asRole('/rfqs', key)).status, 200)
    assert.equal((await asRole('/rfqs', key, { title: 'Denied' })).status, 403)
    assert.equal((await asRole('/rfqs/RFQ-2026-0042/recommend', key, {})).status, 403)
    assert.equal((await asRole('/uploads/prepare', key, { target: '/ingest' })).status, 403)
    assert.equal((await asRole('/reports', key)).status, 403)
    assert.equal((await asRole('/export/comparison/RFQ-2026-0042', key)).status, 403)
    assert.equal((await asRole('/roles', key, { label: 'Escalation', permissions: [] })).status, 403)
    assert.equal((await request('/roles/admin', { label: 'Changed', permissions: [], version: 1 }, 'PUT')).status, 403)
    const changed = await request(`/roles/${key}`, { ...created.data, enabled: false }, 'PUT')
    assert.equal(changed.status, 200)
    assert.equal((await asRole('/rfqs', key)).status, 401)
    assert.equal((await request(`/roles/${key}`, created.data, 'PUT')).status, 409)
    assert.equal((await asRole('/rfqs', '')).status, 401)
    assert.equal((await asRole('/rfqs', 'unknown')).status, 401)
    const supplier = await request('/roles', { label: 'Supplier account', username: 'supplier01', password: 'supplier-password-123', permissions: ['portal.access', 'quote.submit'], supplierId: 'SUP-001' })
    assert.equal(supplier.status, 201)
    cookies.set('supplier', (await login('supplier01', 'supplier-password-123')).cookie)
    const own = await asRole('/rfqs/RFQ-2026-0042', 'supplier', null, 'GET')
    assert.equal(own.status, 200)
    assert.ok(own.data.quotes.every((q) => q.supplierId === 'SUP-001'))
    assert.equal((await asRole('/rfqs/RFQ-2026-0041', 'supplier')).status, 403)
    assert.equal((await asRole('/rfqs/RFQ-2026-0042/quote', 'supplier', { supplierId: 'SUP-002' })).status, 403)
    assert.equal((await asRole('/uploads/prepare', 'supplier', { target: '/rfqs/RFQ-2026-0041/quote-upload', name: 'quote.csv', size: 10 })).status, 403)
    const creator = await request('/roles', { label: 'Draft Author', username: 'author', password: 'author-password-123', permissions: ['workspace.view', 'rfq.create'] })
    cookies.set(creator.data.id, (await login('author', 'author-password-123')).cookie)
    const draft = await asRole('/rfqs', creator.data.id, { title: 'Draft only', lines: [{ name: 'Lamp', qty: 1 }] })
    assert.equal(draft.status, 201)
    assert.equal((await asRole(`/rfqs/${draft.data.id}/assign`, creator.data.id, { supplierId: 'SUP-001' })).status, 403)
    assert.equal((await asRole(`/rfqs/${draft.data.id}/approve/`, creator.data.id, { role: 'finance', decision: 'approved' })).status, 403)
    assert.equal((await asRole(`/rfqs/${draft.data.id}/recommend/`, creator.data.id, {})).status, 403)
    assert.equal((await asRole('/rfqs', creator.data.id, { status: 'Awarded' })).status, 400)
    const resetPassword = await request(`/roles/${creator.data.id}`, { ...creator.data, password: 'new-author-password-123' }, 'PUT')
    assert.equal(resetPassword.status, 200)
    assert.equal((await request(`/roles/${creator.data.id}/password`, null, 'GET')).data.password, 'new-author-password-123')
    assert.equal((await asRole('/rfqs', creator.data.id)).status, 401)
    assert.equal((await login('author', 'author-password-123')).status, 401)
    const newLogin = await login('author', 'new-author-password-123')
    assert.equal(newLogin.status, 200)
    assert.equal((await request('/rfqs', null, 'GET', newLogin.cookie)).status, 200)
    const loggedOut = await fetch(`http://localhost:${port}/api/auth/logout`, { method: 'POST', headers: { Cookie: newLogin.cookie, 'x-opro-request': '1' } })
    assert.equal(loggedOut.status, 204)
    assert.equal((await request('/rfqs', null, 'GET', newLogin.cookie)).status, 401)
  })
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
  await t.test('diagnostics correlate failed requests and record sanitized UI events', async () => {
    const failed = await request(`/rfqs/${rfq.id}/award`, { supplierId: 'SUP-001' })
    assert.ok(failed.requestId)
    const logs = await request(`/logs?q=${failed.requestId}`, null, 'GET')
    assert.equal(logs.data.entries.length, 1)
    assert.equal(logs.data.entries[0].status, failed.status)
    assert.equal(logs.data.entries[0].level, 'warn')
    assert.equal((await request('/logs/events', { events: [{ event: 'ui.click', message: 'Save password=secret', path: '/award' }] })).data.recorded, 1)
    const clicks = await request('/logs?q=ui.click', null, 'GET')
    assert.ok(!JSON.stringify(clicks.data.entries).includes('secret'))
    assert.equal(clicks.data.policy.maxEntries, 20000)
    assert.equal((await request('/logs/events', { events: Array(26).fill({ event: 'ui.click' }) })).status, 400)
  })
})
