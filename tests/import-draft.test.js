import test from 'node:test'
import assert from 'node:assert/strict'
import { draftFromImport } from '../shared/importDraft.js'

test('AI extraction populates the shared RFQ wizard without collapsing duplicate rows', () => {
  const draft = draftFromImport([
    { name: 'Pump', spec: '5 kW', description: 'Stainless steel', quantity: 2, uom: 'PCS', brand: 'A', model: 'M1', partNo: 'P-5', secondaryRequirements: 'Starter panel', remark: 'Urgent', requiredDeliveryDate: '2026-11-10', itemId: 'ITEM-1', sku: 'SKU-1' },
    { name: 'Pump', spec: '5 kW', quantity: 3, uom: 'PCS' },
    { name: '  ', quantity: 1 },
  ], [{ name: 'Pump schedule.xlsx', file: { name: 'Pump schedule.xlsx' } }, { name: 'Specification.pdf', file: { name: 'Specification.pdf' } }])

  assert.equal(draft.form.title, 'Pump schedule')
  assert.equal(draft.form.description, 'Imported from Pump schedule.xlsx, Specification.pdf')
  assert.deepEqual(draft.files.map((file) => file.name), ['Pump schedule.xlsx', 'Specification.pdf'])
  assert.equal(draft.form.currency, 'USD')
  assert.match(draft.form.creationDate, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(draft.lines.length, 2)
  assert.notEqual(draft.lines[0]._key, draft.lines[1]._key)
  assert.deepEqual(draft.lines.map((line) => line.quantity), [2, 3])
  assert.equal(draft.lines[0].secondaryRequirements, 'Starter panel')
  assert.equal(draft.lines[0].requiredDeliveryDate, '2026-11-10')
  assert.equal(draft.lines[0].sku, 'SKU-1')
  assert.equal(draft.lines[1].name, 'Pump')
})
