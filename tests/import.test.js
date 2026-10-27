import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as XLSX from 'xlsx'
import { extractDocument } from '../server/lib/extract.js'
import { extractItems } from '../server/lib/ai.js'

// Exercise deterministic offline behavior; AI behavior is covered with an
// injected completion client below rather than making paid network calls.
delete process.env.OPENAI_API_KEY

const lines = [
  ['Pump', 2, 'Nos', '5 kW motor'],
  ['Valve', 3, 'Nos', 'brass 25 mm'],
  ['Pipe', 12, 'MTR', '40 mm steel'],
  ['Cable', 100, 'MTR', '2.5 sqmm copper'],
  ['Filter', 6, 'PCS', 'HEPA grade'],
  ['Sensor', 4, 'Nos', 'temperature'],
  ['Switch', 8, 'Nos', '16 A'],
]

async function makePdf() {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([600, 800])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  ;[['Item', 'Quantity', 'UOM', 'Description'], ...lines].forEach((row, index) => {
    page.drawText(row.join(', '), { x: 40, y: 740 - index * 35, size: 12, font })
  })
  return Buffer.from(await pdf.save())
}

test('PDF text-layer import preserves all seven items, quantities, units, and descriptions offline', async () => {
  const extraction = await extractDocument({ buffer: await makePdf(), filename: 'seven.pdf' })
  assert.equal(extraction.kind, 'pdf')
  assert.match(extraction.text, /Switch, 8, Nos, 16 A/)
  const { items } = await extractItems(extraction)
  assert.equal(items.length, 7)
  assert.deepEqual(items.map(({ name, quantity, uom, description }) => [name, quantity, uom, description]), lines)
})

test('CSV and Excel imports preserve row fields and do not merge repeated lines', async () => {
  for (const filename of ['items.csv', 'items.xlsx']) {
    const rows = [['Item Name', 'Quantity', 'UOM', 'Specification', 'Description'], ...lines.map(([name, quantity, uom, description]) => [name, quantity, uom, 'specified', description]), ['Pump', 2, 'Nos', 'specified', '5 kW motor']]
    const buffer = filename.endsWith('.csv')
      ? Buffer.from(rows.map((row) => row.join(',')).join('\n'))
      : XLSX.write({ SheetNames: ['Items'], Sheets: { Items: XLSX.utils.aoa_to_sheet(rows) } }, { type: 'buffer', bookType: 'xlsx' })
    const extraction = await extractDocument({ buffer, filename })
    const { items } = await extractItems(extraction)
    assert.equal(items.length, 8, filename)
    assert.deepEqual(items[0].quantity, 2)
    assert.deepEqual(items[0].uom, 'Nos')
    assert.deepEqual(items[0].spec, 'specified')
    assert.deepEqual(items[0].description, '5 kW motor')
  }
})

test('image import without AI fails visibly instead of reporting zero items', async () => {
  const extraction = await extractDocument({ buffer: Buffer.from('image'), filename: 'items.png' })
  await assert.rejects(extractItems(extraction), (error) => error.status === 422 && /require AI processing/.test(error.message))
})

test('truncated AI response is retried with more tokens and a complete item is returned', async () => {
  let calls = 0
  const limits = []
  const client = { chat: { completions: { create: async (params) => {
    calls++
    limits.push(params.max_completion_tokens)
    if (calls === 1) return { choices: [{ finish_reason: 'length', message: { content: null } }] }
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ items: [{ name: 'Pump', spec: '5 kW', quantity: 2, uom: 'Nos', brand: '', model: '', partNo: '', description: 'Motor', secondaryRequirements: '' }] }) } }] }
  } } } }
  const result = await extractItems({ kind: 'text', text: 'Pump 2 Nos' }, { client })
  assert.equal(calls, 2)
  assert.equal(limits[1], limits[0] * 2)
  assert.equal(result.items[0].name, 'Pump')
  assert.equal(result.items[0].quantity, 2)
})

test('AI failure and empty AI result cannot silently become a successful import', async () => {
  for (const content of [null, '{broken', '{"items":[]}']) {
    const client = { chat: { completions: { create: async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }) } } }
    await assert.rejects(extractItems({ kind: 'text', text: 'Pump 2 Nos' }, { client }), (error) => [422, 502].includes(error.status))
  }
})
