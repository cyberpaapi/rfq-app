// Tiny JSON-file persistence layer. Swap these repo functions for a real DB later.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { nanoid } from 'nanoid'
import { deriveBaseName, addTagUnique, normalize } from './lib/tags.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const DB_PATH = join(DATA_DIR, 'db.json')

const seed = () => ({
  suppliers: [
    { id: 'SUP-001', name: 'Lumina Electricals Pvt Ltd', category: 'Electronics', email: 'sales@lumina.co', phone: '+91 98200 11111', location: 'Mumbai, IN', qualified: true, rating: 4.7, scores: { price: 78, quality: 92, delivery: 85 }, ratings: [], previouslyInvited: true, tags: ['Wall Light', 'Spike Light', 'LED'], notes: 'Preferred lighting vendor.', createdAt: Date.now() },
    { id: 'SUP-002', name: 'Brightspark Lighting Co.', category: 'Electronics', email: 'rfq@brightspark.com', phone: '+91 99000 22222', location: 'Pune, IN', qualified: true, rating: 4.4, scores: { price: 88, quality: 80, delivery: 76 }, ratings: [], previouslyInvited: true, tags: ['Foot Light', 'Flood Light', 'LED'], notes: '', createdAt: Date.now() },
    { id: 'SUP-003', name: 'NovaSteel Raw Materials', category: 'Raw Materials', email: 'bids@novasteel.in', phone: '+91 97000 33333', location: 'Jamshedpur, IN', qualified: true, rating: 4.1, scores: { price: 72, quality: 82, delivery: 70 }, ratings: [], previouslyInvited: false, tags: ['Steel', 'ISMB', 'Angle'], notes: '', createdAt: Date.now() },
    { id: 'SUP-004', name: 'Apex Industrial Services', category: 'Services', email: 'hello@apexsvc.com', phone: '+91 96000 44444', location: 'Bengaluru, IN', qualified: true, rating: 3.9, scores: { price: 84, quality: 68, delivery: 72 }, ratings: [], previouslyInvited: false, tags: ['AMC', 'HVAC'], notes: '', createdAt: Date.now() },
    { id: 'SUP-005', name: 'GreenSource Materials', category: 'Raw Materials', email: 'sales@greensource.in', phone: '+91 95000 55555', location: 'Ahmedabad, IN', qualified: true, rating: 4.5, scores: { price: 90, quality: 86, delivery: 80 }, ratings: [], previouslyInvited: false, tags: ['Sand', 'Cement', 'Aggregate'], notes: '', createdAt: Date.now() },
  ],
  items: [
    mkItem({ name: 'Wall Light 6W', uom: 'PCS', category: 'Electronics', brand: 'Lumina', extraTags: ['LED'] }),
    mkItem({ name: 'Spike Light 12W', uom: 'PCS', category: 'Electronics', brand: 'Lumina' }),
    mkItem({ name: 'Sand 5kg', uom: 'BAG', category: 'Raw Materials' }),
    mkItem({ name: 'Sand 10kg', uom: 'BAG', category: 'Raw Materials' }),
    mkItem({ name: 'Copper Cable 2.5sqmm', uom: 'MTR', category: 'Electronics', brand: 'Volt & Wire' }),
  ],
  rfqs: [
    {
      id: 'RFQ-2026-0042', title: 'Landscape Lighting — Phase 2', description: 'Outdoor fixtures for campus upgrade.',
      status: 'Draft', currency: 'USD', createdAt: Date.now(),
      lines: [
        { lineId: 'LN-' + nanoid(8), itemId: null, name: 'Wall Light 6W', qty: 50, uom: 'PCS' },
        { lineId: 'LN-' + nanoid(8), itemId: null, name: 'Spike Light 12W', qty: 150, uom: 'PCS' },
      ],
      assignments: [],
    },
  ],
  quotes: [],
  tags: ['Wall Light', 'Spike Light', 'LED', 'Foot Light', 'Flood Light', 'Steel', 'ISMB', 'Angle', 'AMC', 'HVAC', 'Sand', 'Cement', 'Aggregate', 'Copper Cable'],
})

function mkItem({ name, baseName, spec = '', uom = 'PCS', category = 'General', brand = '', model = '', partNo = '', description = '', extraTags = [] }) {
  // `baseName` (the clean product family, used as the primary tag) can be supplied
  // explicitly. `spec` is the distinguishing variant kept out of the name.
  const bn = (baseName && baseName.trim()) || deriveBaseName(name)
  let tags = [bn]
  for (const t of extraTags) tags = addTagUnique(tags, t)
  return { id: 'ITM-' + nanoid(6), name, baseName: bn, spec, uom, category, brand, model, partNo, description, tags, createdAt: Date.now() }
}

let db = null

function ensure() {
  if (db) return
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (existsSync(DB_PATH)) {
    db = JSON.parse(readFileSync(DB_PATH, 'utf8'))
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
// Returns { item, created } — reuses an existing item with the same name + spec
// (so "Exhaust fan" @ 7.5kW and @ 15kW are distinct catalogue entries).
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
