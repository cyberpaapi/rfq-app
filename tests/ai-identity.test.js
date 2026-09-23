import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { recommendBestPerItem } from '../server/lib/ai.js'

test('AI recommendation contract uses stable IDs even for duplicate supplier names', async (t) => {
  let request
  const mock = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    request = JSON.parse(body)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ picks: [{ i: 0, supplierId: 'SUP-B', reason: 'Lower price for the same terms.' }] }) } }] }))
  })
  mock.listen(0, '127.0.0.1'); await once(mock, 'listening')
  const key = process.env.OPENAI_API_KEY, base = process.env.OPENAI_BASE_URL
  process.env.OPENAI_API_KEY = 'test-only'
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${mock.address().port}/v1`
  t.after(() => { mock.close(); if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; if (base === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = base })
  const result = await recommendBestPerItem([{ i: 0, item: 'Lamp', qty: 2, suppliers: [{ supplierId: 'SUP-A', name: 'Same name', rate: 20 }, { supplierId: 'SUP-B', name: 'Same name', rate: 10 }] }], { price: 100, quality: 0, delivery: 0 })
  assert.equal(result[0].supplierId, 'SUP-B')
  assert.ok(request.response_format.json_schema.schema.properties.picks.items.required.includes('supplierId'))
  assert.ok(request.messages[1].content.includes('SUP-A'))
  assert.ok(request.messages[1].content.includes('SUP-B'))
})
