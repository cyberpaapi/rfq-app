import test from 'node:test'
import assert from 'node:assert/strict'
import { createPostgresDatabase } from '../server/lib/cloud-store.js'

test('warm database cache checks versions, isolates requests and refreshes after external changes', async () => {
  let data = { items: [{ name: 'Original' }] }, version = 1, fullReads = 0
  const sql = async (parts, ...values) => {
    const query = parts.join('?')
    if (query.includes('CREATE TABLE')) return []
    if (query.includes('SELECT data')) { fullReads++; return [{ data: structuredClone(data), version }] }
    if (query.includes('SELECT version')) return [{ version }]
    if (query.includes('UPDATE')) {
      if (values[1] !== version) return []
      data = JSON.parse(values[0]); return [{ version: ++version }]
    }
    throw new Error('Unexpected query')
  }
  const db = createPostgresDatabase(() => ({}), () => sql)
  const first = await db.load(), second = await db.load()
  assert.equal(fullReads, 1)
  first.data.items[0].name = 'Edit'
  assert.equal(second.data.items[0].name, 'Original')
  await db.commit(first)
  first.data.items[0].name = 'Mutation after commit'
  assert.equal((await db.load()).data.items[0].name, 'Edit')
  assert.equal(fullReads, 1)
  await assert.rejects(db.commit(second), { status: 409 })
  data.items[0].name = 'External'; version++
  assert.equal((await db.load()).data.items[0].name, 'External')
  assert.equal(fullReads, 2)
})
