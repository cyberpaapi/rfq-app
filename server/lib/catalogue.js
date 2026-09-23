import * as XLSX from 'xlsx'
import { createHash } from 'node:crypto'
import { CATALOGUE_COLUMNS, catalogueText } from '../../shared/catalogue.js'
import { deriveBaseName, normalize } from './tags.js'

export function readCatalogue(buffer, { strict = false } = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.SheetNames.includes('Fully_edited') ? 'Fully_edited' : workbook.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: '', raw: false })
  const headers = rows.shift() || []
  if (strict && JSON.stringify(headers) !== JSON.stringify(CATALOGUE_COLUMNS.map((c) => c.label))) throw new Error('The source must contain the nine Fully_edited catalogue headers in order.')
  const aliases = { name: ['Item', 'Name'], category: ['Category Name'], uom: ['UOM', 'Unit'], sku: ['Item Code', 'Sku Code'], partNo: ['Part No.', 'MPN'] }
  const indices = CATALOGUE_COLUMNS.map(({ key, label }) => headers.findIndex((h) => [label, ...(aliases[key] || [])].some((a) => normalize(a) === normalize(h))))
  if (indices[0] < 0) throw new Error('The catalogue needs an Item Name column.')
  const items = rows.filter((r) => r.some((v) => v !== '' && v != null)).map((row) => Object.fromEntries(CATALOGUE_COLUMNS.map(({ key }, i) => [key, catalogueText(row[indices[i]])])))
  if (strict && (!items.length || items.some((i) => !i.name.trim()))) throw new Error('Every catalogue row must have an Item Name.')
  return { sheet, headers, items }
}

// Build a complete replacement in memory before touching either database.
export function replaceCatalogue(data, payloads, source, timestamp = Date.now()) {
  if (!payloads.length || payloads.some((i) => !i.name?.trim())) throw new Error('A non-empty catalogue with valid item names is required.')
  const index = (key) => {
    const map = new Map()
    for (const item of data.items || []) { const value = normalize(item[key]); if (value) map.set(value, map.has(value) ? null : item) }
    return map
  }
  const skus = index('sku'), names = index('name'), used = new Set()
  let matched = 0
  const items = payloads.map((payload, row) => {
    const candidate = (payload.sku && skus.get(normalize(payload.sku))) || names.get(normalize(payload.name))
    const previous = candidate && !used.has(candidate.id) ? candidate : null
    let id = previous?.id || `ITM-${createHash('sha256').update(`${payload.sku}\0${payload.name}\0${row}`).digest('hex').slice(0, 20)}`
    if (used.has(id)) throw new Error('Duplicate item identity in replacement catalogue.')
    used.add(id); if (previous) matched++
    const fields = Object.fromEntries(CATALOGUE_COLUMNS.map(({ key }) => [key, catalogueText(payload[key])]))
    const baseName = deriveBaseName(fields.name)
    return { id, ...fields, baseName, tags: [baseName], spec: '', brand: '', model: '',
      priceHistory: previous?.priceHistory || [], lastBoughtPrice: previous?.lastBoughtPrice ?? null,
      lastBoughtAt: previous?.lastBoughtAt ?? null, createdAt: previous?.createdAt || timestamp }
  })
  const tags = new Map()
  for (const tag of [...items.flatMap((i) => i.tags), ...(data.suppliers || []).flatMap((s) => s.tags || [])]) if (tag && !tags.has(normalize(tag))) tags.set(normalize(tag), tag)
  const catalogue = { source, sheet: 'Fully_edited', headers: CATALOGUE_COLUMNS.map((c) => c.label), count: items.length, loadedAt: timestamp }
  const audit = [...(data.audit || []), { id: `AUD-catalogue-${timestamp}`, rfqId: null, user: 'Administrator', action: 'Replaced item catalogue from Fully_edited', field: 'Catalogue', old: String(data.items?.length || 0), value: `${items.length} items; ${source}`, at: timestamp }]
  return { data: { ...data, items, tags: [...tags.values()], catalogue, audit }, matched }
}
