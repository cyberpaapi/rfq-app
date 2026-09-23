import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { createCloudMiddleware } from '../server/lib/cloud-store.js'
import * as store from '../server/store.js'

test('cloud requests isolate state, commit before success, and reject conflicting writes', async (t) => {
  let saved = { items: [] }, version = 0
  const database = {
    async load() { return { data: structuredClone(saved), version, dirty: false } },
    async commit(state) {
      if (state.version !== version) throw Object.assign(new Error('Reload and retry.'), { status: 409 })
      saved = structuredClone(state.data); version++
    },
  }
  const app = express()
  app.use(createCloudMiddleware(database, store.runWithState))
  app.get('/', (_req, res) => res.json(store.all('items')))
  app.post('/:id', async (req, res) => {
    store.insert('items', { id: req.params.id })
    await new Promise((resolve) => setTimeout(resolve, 30))
    if (req.params.id === 'invalid') return res.status(400).json({ error: 'invalid' })
    res.status(201).json({ saved: req.params.id })
  })
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => server.close())
  const url = `http://127.0.0.1:${server.address().port}`
  const results = await Promise.all(['one', 'two'].map((id) => fetch(`${url}/${id}`, { method: 'POST' })))
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
  assert.equal(saved.items.length, 1)
  assert.equal((await (await fetch(url)).json()).length, 1)
  assert.equal((await fetch(`${url}/invalid`, { method: 'POST' })).status, 400)
  assert.equal(saved.items.length, 1, 'failed requests must not persist partial mutations')
})
