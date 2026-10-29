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

test('supplier quote rows keep extra columns in the matching item description', async () => {
  const csv = [
    'Item Name,Quantity,Unit,Unit Price,Description,Country of Origin,Certification,Batch No,Amount,Brand',
    'Pump,2,PCS,19,Stainless body,Japan,ISO 9001,B-17,38,Acme',
    'Valve,3,PCS,8,Brass body,India,CE,V-22,24,FlowCo',
  ].join('\n')
  const fallback = await extractItems(await extractDocument({ buffer: Buffer.from(csv), filename: 'quote.csv' }), { quote: true })
  assert.equal(fallback.items.length, 2)
  assert.equal(fallback.items[0].unitPrice, 19)
  assert.match(fallback.items[0].description, /Stainless body.*Country of Origin: Japan.*Certification: ISO 9001.*Batch No: B-17/)
  assert.doesNotMatch(fallback.items[0].description, /India|38|Acme/)
  assert.match(fallback.items[1].description, /Brass body.*Country of Origin: India.*Certification: CE.*Batch No: V-22/)

  const template = XLSX.utils.aoa_to_sheet([
    ['Item Name', 'Specification', 'Description', 'Offered Description', 'Supplier Remarks', 'Country of Origin', 'Unit Price'],
    ['Pump', 'Buyer spec 5 kW', 'Buyer description only', 'Stainless supplier offer', 'Packed separately', 'Japan', 19],
  ])
  const buffer = XLSX.write({ SheetNames: ['Quote'], Sheets: { Quote: template } }, { type: 'buffer', bookType: 'xlsx' })
  const extraction = await extractDocument({ buffer, filename: 'quote.xlsx' })
  const client = { chat: { completions: { create: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ items: [{ name: 'Pump', spec: '', description: 'Stainless supplier offer', quantity: 2, uom: 'PCS', brand: '', model: '', partNo: '', unitPrice: 19, leadTime: '', warranty: '', sourceRow: 1 }] }) } }] }) } } }
  const ai = await extractItems(extraction, { quote: true, client })
  assert.match(ai.items[0].description, /Stainless supplier offer.*Supplier Remarks: Packed separately.*Country of Origin: Japan/)
  assert.doesNotMatch(ai.items[0].description, /Buyer spec|Buyer description|Unit Price/)
  assert.equal(ai.items[0].description.match(/Stainless supplier offer/g).length, 1)
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
