import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanEvent, redact, trimEntries, LOG_POLICY } from '../server/lib/diagnostics.js'

test('log rotation retains the newest 20,000 and expires old entries', () => {
  const now = Date.now()
  const entries = Array.from({ length: 20010 }, (_, id) => ({ id, at: now }))
  const kept = trimEntries([{ id: 'expired', at: now - 16 * 86400000 }, ...entries], now)
  assert.equal(kept.length, 20000)
  assert.equal(kept[0].id, 10)
  assert.equal(kept.at(-1).id, 20009)
  assert.deepEqual(trimEntries([{ at: now - 16 * 86400000 }], now), [])
})

test('large logs rotate oldest first at the byte cap', () => {
  const now = Date.now()
  const entries = Array.from({ length: 30 }, (_, id) => ({ id, at: now, message: 'x'.repeat(1024 * 1024) }))
  const kept = trimEntries(entries, now)
  assert.ok(kept.reduce((n, e) => n + Buffer.byteLength(JSON.stringify(e)), 0) <= LOG_POLICY.maxBytes)
  assert.equal(kept.at(-1).id, 29)
  assert.ok(kept[0].id > 0)
})

test('diagnostics redact credentials, omit arbitrary bodies, and bound metadata', () => {
  const secret = 'SUPERSECRET123'
  for (const input of [`Bearer ${secret}`, `password=${secret}`, `{"apiKey":"${secret}"}`, `postgresql://user:${secret}@host/db`, `sk-proj-${secret}`]) {
    assert.ok(!redact(input).includes(secret), input)
  }
  const event = cleanEvent({ path: '/api/rfqs?token=secret', message: 'x'.repeat(2000), body: { password: secret }, details: { token: secret } })
  assert.equal(event.path, '/api/rfqs')
  assert.equal(event.message.length, 1000)
  assert.equal(event.body, undefined)
  assert.ok(!event.details.includes(secret))
})
