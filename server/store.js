// Tiny JSON-file persistence layer. Swap these repo functions for a real DB later.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { nanoid } from 'nanoid'
import { deriveBaseName, addTagUnique, normalize } from './lib/tags.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const DB_PATH = join(DATA_DIR, 'db.json')

// Fixed dates so the seeded demo always looks "current" relative to the doc.
const DAY = 86400000
const now = Date.now()
const day = (n) => new Date(now + n * DAY).toISOString().slice(0, 10)

const seed = () => ({
  suppliers: [
    { id: 'SUP-001', name: 'Lumina Electricals Pvt Ltd', category: 'Electronics', email: 'sales@lumina.co', phone: '+91 98200 11111', location: 'Mumbai, IN', qualified: true, rating: 4.7, scores: { price: 78, quality: 92, delivery: 85 }, ratings: [], previouslyInvited: true, tags: ['Wall Light', 'Spike Light', 'LED'], notes: 'Preferred lighting vendor.', createdAt: now },
    { id: 'SUP-002', name: 'Brightspark Lighting Co.', category: 'Electronics', email: 'rfq@brightspark.com', phone: '+91 99000 22222', location: 'Pune, IN', qualified: true, rating: 4.4, scores: { price: 88, quality: 80, delivery: 76 }, ratings: [], previouslyInvited: true, tags: ['Foot Light', 'Flood Light', 'LED'], notes: '', createdAt: now },
    { id: 'SUP-003', name: 'NovaSteel Raw Materials', category: 'Raw Materials', email: 'bids@novasteel.in', phone: '+91 97000 33333', location: 'Jamshedpur, IN', qualified: true, rating: 4.1, scores: { price: 72, quality: 82, delivery: 70 }, ratings: [], previouslyInvited: false, tags: ['Steel', 'ISMB', 'Angle'], notes: '', createdAt: now },
    { id: 'SUP-004', name: 'Apex Industrial Services', category: 'Services', email: 'hello@apexsvc.com', phone: '+91 96000 44444', location: 'Bengaluru, IN', qualified: true, rating: 3.9, scores: { price: 84, quality: 68, delivery: 72 }, ratings: [], previouslyInvited: false, tags: ['AMC', 'HVAC'], notes: '', createdAt: now },
    { id: 'SUP-005', name: 'GreenSource Materials', category: 'Raw Materials', email: 'sales@greensource.in', phone: '+91 95000 55555', location: 'Ahmedabad, IN', qualified: true, rating: 4.5, scores: { price: 90, quality: 86, delivery: 80 }, ratings: [], previouslyInvited: false, tags: ['Sand', 'Cement', 'Aggregate'], notes: '', createdAt: now },
  ],
  items: [
    mkItem({ name: 'Wall Light 6W', uom: 'PCS', category: 'Electronics', brand: 'Lumina', extraTags: ['LED'] }),
    mkItem({ name: 'Spike Light 12W', uom: 'PCS', category: 'Electronics', brand: 'Lumina' }),
    mkItem({ name: 'Sand 5kg', uom: 'BAG', category: 'Raw Materials' }),
    mkItem({ name: 'Sand 10kg', uom: 'BAG', category: 'Raw Materials' }),
    mkItem({ name: 'Copper Cable 2.5sqmm', uom: 'MTR', category: 'Electronics', brand: 'Volt & Wire' }),
  ],
  rfqs: [
    // Active RFQ with two quotes — drives Compare / Award / Reports.
    {
      id: 'RFQ-2026-0042', title: 'Landscape Lighting — Phase 2',
      description: 'Outdoor lighting fixtures for the campus landscape upgrade, Block C & D.',
      status: 'Evaluation', buyer: 'Madhu', category: 'Electronics', currency: 'USD',
      deadline: day(3), validity: day(30), deliveryLocation: 'OPRO Warehouse, Pune',
      paymentTerms: '30 days net', budget: 9500, attachments: [], approvals: {}, clarifications: [],
      createdAt: now - 12 * DAY,
      lines: [
        line('LN-42-1', { name: 'Wall Light', spec: '6W dimmable CRI90', qty: 50, uom: 'PCS', brand: 'Lumina', model: 'WL-6D', partNo: 'LM-WL6D', requiredDeliveryDate: day(20) }),
        line('LN-42-2', { name: 'Wall Light', spec: '6W dimmable CRI90 warm', qty: 60, uom: 'PCS', brand: 'Lumina', model: 'WL-6DW', partNo: 'LM-WL6DW', requiredDeliveryDate: day(20) }),
        line('LN-42-3', { name: 'Spike Light', spec: '12W white finish', qty: 150, uom: 'PCS', brand: 'Lumina', model: 'SPK-12', partNo: 'LM-SPK12', requiredDeliveryDate: day(25) }),
        line('LN-42-4', { name: 'Foot Light Type-1', spec: 'recessed step light', qty: 35, uom: 'PCS', brand: 'Brightspark', model: 'FL-1', partNo: 'BS-FL1', requiredDeliveryDate: day(25) }),
      ],
      assignments: [
        { id: 'ASG-42-1', supplierId: 'SUP-001', supplierName: 'Lumina Electricals Pvt Ltd', type: 'full', lineIds: ['LN-42-1', 'LN-42-2', 'LN-42-3', 'LN-42-4'], createdAt: now - 10 * DAY },
        { id: 'ASG-42-2', supplierId: 'SUP-002', supplierName: 'Brightspark Lighting Co.', type: 'full', lineIds: ['LN-42-1', 'LN-42-2', 'LN-42-3', 'LN-42-4'], createdAt: now - 10 * DAY },
      ],
    },
    // Published, one response in — appears in pipeline / aging.
    {
      id: 'RFQ-2026-0041', title: 'Structural Steel — Mezzanine',
      description: 'Hot-rolled steel sections for the mezzanine fabrication.',
      status: 'Published', buyer: 'Indresh', category: 'Raw Materials', currency: 'USD',
      deadline: day(6), validity: day(40), deliveryLocation: 'Site Office, Jamshedpur',
      paymentTerms: '45 days net', budget: 28000, attachments: [], approvals: {}, clarifications: [],
      createdAt: now - 5 * DAY,
      lines: [
        line('LN-41-1', { name: 'ISMB 200', spec: 'I-beam 200mm', qty: 4000, uom: 'KG', brand: 'NovaSteel', model: 'ISMB200', partNo: 'NS-MB200' }),
        line('LN-41-2', { name: 'ISA 50x50x6', spec: 'Equal angle', qty: 1200, uom: 'KG', brand: 'NovaSteel', model: 'ISA50', partNo: 'NS-A50' }),
      ],
      assignments: [
        { id: 'ASG-41-1', supplierId: 'SUP-003', supplierName: 'NovaSteel Raw Materials', type: 'full', lineIds: ['LN-41-1', 'LN-41-2'], createdAt: now - 4 * DAY },
        { id: 'ASG-41-2', supplierId: 'SUP-005', supplierName: 'GreenSource Materials', type: 'full', lineIds: ['LN-41-1', 'LN-41-2'], createdAt: now - 4 * DAY },
      ],
    },
    // Awarded — drives savings reporting.
    {
      id: 'RFQ-2026-0039', title: 'Indoor Fixtures — Office Fit-out',
      description: 'Panel lights & downlights for the new office floor.',
      status: 'Awarded', buyer: 'Indresh', category: 'Electronics', currency: 'USD',
      deadline: day(-20), validity: day(-5), deliveryLocation: 'OPRO HQ, Bengaluru',
      paymentTerms: '30 days net', budget: 6200, attachments: [],
      approvals: { hod: { decision: 'approved', by: 'Samir Panigrahi', at: now - 22 * DAY }, finance: { decision: 'approved', by: 'Priya Nair', at: now - 21 * DAY } },
      clarifications: [],
      award: { type: 'full', supplierId: 'SUP-001', supplierName: 'Lumina Electricals Pvt Ltd', amount: 5180, at: now - 20 * DAY },
      createdAt: now - 35 * DAY,
      lines: [
        line('LN-39-1', { name: 'Panel Light 36W', spec: '600x600 recessed', qty: 80, uom: 'PCS', brand: 'Lumina', model: 'PL-36', partNo: 'LM-PL36' }),
      ],
      assignments: [
        { id: 'ASG-39-1', supplierId: 'SUP-001', supplierName: 'Lumina Electricals Pvt Ltd', type: 'full', lineIds: ['LN-39-1'], createdAt: now - 30 * DAY },
      ],
    },
    // Draft — nothing sent yet.
    {
      id: 'RFQ-2026-0038', title: 'Cabling Bulk Order',
      description: 'Copper cabling and conduits for electrical rough-in.',
      status: 'Draft', buyer: 'Madhu', category: 'Electronics', currency: 'USD',
      deadline: day(10), validity: day(30), deliveryLocation: 'OPRO Warehouse, Pune',
      paymentTerms: '30 days net', budget: 4100, attachments: [], approvals: {}, clarifications: [],
      createdAt: now - 1 * DAY,
      lines: [
        line('LN-38-1', { name: 'Copper Cable 2.5sqmm', spec: 'FR PVC', qty: 2000, uom: 'MTR', brand: 'Volt & Wire', model: 'CU-2.5', partNo: 'VW-CU25' }),
      ],
      assignments: [],
    },
  ],
  quotes: [
    {
      id: 'QTE-42-001', rfqId: 'RFQ-2026-0042', supplierId: 'SUP-001', supplierName: 'Lumina Electricals Pvt Ltd',
      paymentTerms: '30 days net', notes: 'Bulk discount applied.', submittedAt: now - 6 * DAY,
      lines: [
        { lineId: 'LN-42-1', name: 'Wall Light', rate: 1.32, qty: 50, leadTime: '18 days', warranty: '2 years', eta: day(18), remark: '4W non-dimmable offered' },
        { lineId: 'LN-42-2', name: 'Wall Light', rate: 1.32, qty: 60, leadTime: '18 days', warranty: '2 years', eta: day(18), remark: '' },
        { lineId: 'LN-42-3', name: 'Spike Light', rate: 43.16, qty: 150, leadTime: '20 days', warranty: '2 years', eta: day(20), remark: 'Sand Black finish (req: White)' },
        { lineId: 'LN-42-4', name: 'Foot Light Type-1', rate: 9.33, qty: 35, leadTime: '20 days', warranty: '2 years', eta: day(20), remark: '' },
      ],
    },
    {
      id: 'QTE-42-002', rfqId: 'RFQ-2026-0042', supplierId: 'SUP-002', supplierName: 'Brightspark Lighting Co.',
      paymentTerms: 'Advance 50%', notes: '', submittedAt: now - 5 * DAY,
      lines: [
        { lineId: 'LN-42-1', name: 'Wall Light', rate: 4.63, qty: 50, leadTime: '22 days', warranty: '3 years', eta: day(22), remark: 'Triac dimming, CRI80 (req CRI90 - clarify)' },
        { lineId: 'LN-42-2', name: 'Wall Light', rate: 4.63, qty: 60, leadTime: '22 days', warranty: '3 years', eta: day(22), remark: '' },
        { lineId: 'LN-42-3', name: 'Spike Light', rate: 15.73, qty: 150, leadTime: '24 days', warranty: '3 years', eta: day(24), remark: 'White finish ✓' },
        { lineId: 'LN-42-4', name: 'Foot Light Type-1', rate: 8.86, qty: 35, leadTime: '24 days', warranty: '3 years', eta: day(24), remark: '' },
      ],
    },
    {
      id: 'QTE-41-001', rfqId: 'RFQ-2026-0041', supplierId: 'SUP-003', supplierName: 'NovaSteel Raw Materials',
      paymentTerms: '45 days net', notes: '', submittedAt: now - 3 * DAY,
      lines: [
        { lineId: 'LN-41-1', name: 'ISMB 200', rate: 0.82, qty: 4000, leadTime: '28 days', warranty: 'NA', eta: day(28), remark: '' },
        { lineId: 'LN-41-2', name: 'ISA 50x50x6', rate: 0.79, qty: 1200, leadTime: '28 days', warranty: 'NA', eta: day(28), remark: '' },
      ],
    },
  ],
  audit: [
    { id: 'AUD-seed-1', rfqId: 'RFQ-2026-0042', user: 'Madhu', action: 'Moved to Evaluation', field: 'Status', old: 'Responses Received', value: 'Evaluation', at: now - 1 * DAY },
    { id: 'AUD-seed-2', rfqId: 'RFQ-2026-0042', user: 'System', action: 'Quote received from Brightspark Lighting Co.', field: 'Quotes', old: '1', value: '2', at: now - 5 * DAY },
    { id: 'AUD-seed-3', rfqId: 'RFQ-2026-0039', user: 'Priya Nair', action: 'Approved costing sheet', field: 'Approval', old: '—', value: 'Approved', at: now - 21 * DAY },
  ],
  notifications: [
    { id: 'NTF-seed-1', type: 'response', title: 'New quote from Brightspark Lighting', rfqId: 'RFQ-2026-0042', unread: true, at: now - 5 * DAY },
    { id: 'NTF-seed-2', type: 'deadline', title: 'Deadline approaching — Structural Steel', rfqId: 'RFQ-2026-0041', unread: true, at: now - 1 * DAY },
    { id: 'NTF-seed-3', type: 'award', title: 'Office Fit-out awarded to Lumina', rfqId: 'RFQ-2026-0039', unread: false, at: now - 20 * DAY },
  ],
  tags: ['Wall Light', 'Spike Light', 'LED', 'Foot Light', 'Flood Light', 'Steel', 'ISMB', 'Angle', 'AMC', 'HVAC', 'Sand', 'Cement', 'Aggregate', 'Copper Cable'],
})

// Build a fully-shaped RFQ line with all item-detail fields (spec 1.1).
function line(lineId, p = {}) {
  return {
    lineId, itemId: p.itemId || null,
    name: p.name || '', spec: p.spec || '', description: p.description || '',
    qty: p.qty ?? 1, uom: p.uom || 'PCS',
    brand: p.brand || '', model: p.model || '', partNo: p.partNo || '',
    secondaryRequirements: p.secondaryRequirements || '',
    photo: p.photo || '', remark: p.remark || '', requiredDeliveryDate: p.requiredDeliveryDate || '',
    attachment: p.attachment || '',
  }
}

function mkItem({ name, baseName, spec = '', uom = 'PCS', category = 'General', brand = '', model = '', partNo = '', description = '', extraTags = [] }) {
  const bn = (baseName && baseName.trim()) || deriveBaseName(name)
  let tags = [bn]
  for (const t of extraTags) tags = addTagUnique(tags, t)
  return { id: 'ITM-' + nanoid(6), name, baseName: bn, spec, uom, category, brand, model, partNo, description, tags, createdAt: now }
}

let db = null

function ensure() {
  if (db) return
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (existsSync(DB_PATH)) {
    db = JSON.parse(readFileSync(DB_PATH, 'utf8'))
    // Forward-compat: make sure newer collections exist on older db files.
    for (const c of ['suppliers', 'items', 'rfqs', 'quotes', 'audit', 'notifications', 'tags']) {
      if (!db[c]) db[c] = []
    }
  } else {
    db = seed()
    flush()
  }
}

function flush() {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
}

export function reset() {
  db = seed()
  flush()
  return db
}

// ---- generic collection access -------------------------------------------
export const all = (coll) => { ensure(); return db[coll] }
export const find = (coll, id) => { ensure(); return db[coll].find((x) => x.id === id) }

export function insert(coll, doc) {
  ensure()
  db[coll].push(doc)
  flush()
  return doc
}

export function update(coll, id, patch) {
  ensure()
  const idx = db[coll].findIndex((x) => x.id === id)
  if (idx === -1) return null
  db[coll][idx] = { ...db[coll][idx], ...patch, id }
  flush()
  return db[coll][idx]
}

export function remove(coll, id) {
  ensure()
  const before = db[coll].length
  db[coll] = db[coll].filter((x) => x.id !== id)
  flush()
  return before !== db[coll].length
}

// ---- audit + notifications (spec 5 & 6) -----------------------------------
export function logAudit({ rfqId = null, user = 'System', action, field = '', old = '', value = '' }) {
  ensure()
  const entry = { id: newId('AUD'), rfqId, user, action, field, old: String(old ?? ''), value: String(value ?? ''), at: Date.now() }
  db.audit.push(entry)
  flush()
  return entry
}

export function notify({ type = 'info', title, rfqId = null }) {
  ensure()
  const n = { id: newId('NTF'), type, title, rfqId, unread: true, at: Date.now() }
  db.notifications.push(n)
  flush()
  return n
}

// ---- global tag registry ---------------------------------------------------
export function allTags() { ensure(); return db.tags }

export function registerTag(tag) {
  ensure()
  const next = addTagUnique(db.tags, tag)
  if (next !== db.tags) { db.tags = next; flush() }
  return db.tags.find((t) => normalize(t) === normalize(tag))
}

export function registerTags(tags = []) {
  for (const t of tags) registerTag(t)
  return db.tags
}

// ---- items: dedup-aware upsert used by the AI pipeline --------------------
export function upsertItem(payload) {
  ensure()
  const name = String(payload.name || '').trim()
  if (!name) return { item: null, created: false }
  const spec = String(payload.spec || '').trim()
  const idOf = (i) => normalize((i.name || '') + ' | ' + (i.spec || ''))
  const key = normalize(name + ' | ' + spec)
  const existing = db.items.find((i) => idOf(i) === key)
  if (existing) return { item: existing, created: false }
  const item = mkItem({
    name,
    baseName: payload.baseName,
    spec,
    uom: payload.uom || 'PCS',
    category: payload.category || 'General',
    brand: payload.brand || '',
    model: payload.model || '',
    partNo: payload.partNo || '',
    description: payload.description || '',
    extraTags: payload.extraTags || [],
  })
  db.items.push(item)
  registerTags(item.tags)
  flush()
  return { item, created: true }
}

export const newId = (prefix) => prefix + '-' + nanoid(8)
