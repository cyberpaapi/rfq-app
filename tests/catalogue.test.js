import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { readCatalogue, replaceCatalogue } from '../server/lib/catalogue.js'
import { CATALOGUE_COLUMNS, catalogueMatches } from '../shared/catalogue.js'

test('catalogue import chooses Fully_edited over Summary and preserves every source column', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Summary'], ['not an item']]), 'Summary')
  const row = ['  Original  name ', 'AI NAME', 'Long description', '00017', '', 'Pumps', 'Each', 'MPN-900', '']
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([CATALOGUE_COLUMNS.map((c) => c.label), row]), 'Fully_edited')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Item Name'], ['Excluded']]), 'Remove Items')
  const result = readCatalogue(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { strict: true })
  assert.equal(result.items.length, 1)
  assert.deepEqual(CATALOGUE_COLUMNS.map((c) => result.items[0][c.key]), row)
  assert.equal(catalogueMatches(result.items[0], 'MPN-900'), true)
  assert.equal(catalogueMatches(result.items[0], 'ai name'), true)
  assert.equal(catalogueMatches(result.items[0], 'Pumps'), true)
})

test('catalogue replacement is complete, retains matched identities/history, and leaves transactions unchanged', () => {
  const data = { items: [{ id: 'old-match', name: 'Old name', sku: '001', priceHistory: [{ price: 5 }], lastBoughtPrice: 5 }, { id: 'removed', name: 'Removed', sku: '002' }], tags: ['Stale'], rfqs: [{ id: 'RFQ', lines: [{ itemId: 'removed', name: 'Historic name' }] }], quotes: [{ price: 7 }], roles: [{ id: 'admin' }], suppliers: [{ tags: ['Supplier tag'] }], audit: [] }
  const before = JSON.stringify(data)
  const rows = [{ name: 'Edited name', aiName: 'AI NAME', sku: '001', category: '', uom: '', partNo: 'P1', subcategory: 'Sub', unitName: 'Unit' }, { name: 'New name', sku: '003' }]
  const result = replaceCatalogue(data, rows, 'source.xlsx', 1)
  assert.equal(result.data.items.length, 2)
  assert.equal(result.data.items[0].id, 'old-match')
  assert.deepEqual(result.data.items[0].priceHistory, [{ price: 5 }])
  assert.equal(result.data.items[0].category, '')
  assert.equal(result.data.items[0].uom, '')
  assert.equal(result.data.items[0].unitName, 'Unit')
  assert.equal(result.data.items.some((i) => i.id === 'removed'), false)
  assert.deepEqual(result.data.rfqs, data.rfqs)
  assert.deepEqual(result.data.quotes, data.quotes)
  assert.deepEqual(result.data.roles, data.roles)
  assert.equal(JSON.stringify(data), before)
  assert.equal(result.data.tags.includes('Stale'), false)
  assert.equal(result.data.tags.includes('Supplier tag'), true)
  assert.throws(() => replaceCatalogue(data, [], 'empty'), /non-empty/)
})
