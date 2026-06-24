// Sends extracted content to OpenAI and returns a clean, de-duplicated item list.
//
// Large documents are split into chunks (PDF pages, image groups, or 10-row
// spreadsheet blocks) and sent to the model 4-at-a-time in parallel, then
// stitched back together in the original order. Every item carries the page(s)
// / row-range it was found on (provenance) for the verification view.
//
// A second "clubbing" pass then asks a (configurable) model to group entries
// that refer to the SAME real-world item even when the wording differs — this
// powers the optional "Clubbed view".
//
// If no API key is configured, falls back to a naive line parser so the app still works.
import OpenAI from 'openai'
import { normalize } from './tags.js'
import { mapLimit } from './pool.js'
import { splitPdfPages } from './pdf.js'

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini'
// The "clubbing" consolidation pass uses GPT-5.5 (OpenAI's flagship, available
// in the API since Apr 2026) for better same-entity grouping. Override with
// OPENAI_CLUB_MODEL if you don't have 5.5 access (e.g. gpt-4o, gpt-4.1).
const CLUB_MODEL = process.env.OPENAI_CLUB_MODEL || 'gpt-5.5'
const CONCURRENCY = Number(process.env.AI_CONCURRENCY) || 4       // pass N chunks at a time
const PAGES_PER_CALL = Number(process.env.AI_PAGES_PER_CALL) || 1  // PDF pages per request
const ROWS_PER_CALL = Number(process.env.AI_ROWS_PER_CALL) || 10   // spreadsheet rows per request
const TEXT_LINES_PER_CALL = Number(process.env.AI_TEXT_LINES_PER_CALL) || 120

const SYSTEM = `You are a meticulous procurement assistant. Extract EVERY purchasable LINE ITEM and REQUIREMENT from the document (a quotation, BOQ, purchase list, invoice, or spreadsheet export). You may be given ONE PAGE/SECTION of a larger document — extract everything visible on it; do not worry about other pages.

FIELD SEGREGATION — follow exactly:
- "name": the CLEAN BASE product name ONLY. No ratings, sizes, options or extra words. e.g. "Inlined cabinet type exhaust fan". Never put the spec in the name.
- "spec": the short distinguishing specification that makes this item a unique variant — capacity/rating (15kW, 7.5kW), size (5kg, 2.5sqmm), phase, voltage, model, finish, options like "with VFD"/"without VFD". "" if none.
- "description": remaining details from the row/columns — motor details, zone/area, notes, any text in extra columns. Do NOT discard information.
- "secondaryRequirements": auxiliary things that must be procured ALONGSIDE this item for it to work — e.g. a panel board for a fan, a control/starter panel, power supply, mounting hardware, cabling, accessories. Write them as a short list. If the document lists such a requirement as its own nearby line, FOLD it into the related item's "secondaryRequirements" instead of making it a standalone item. Use "" when there are none.

ONE ITEM PER LINE — DO NOT MERGE:
- List EVERY line as its OWN item. Do NOT merge or sum duplicates, even if two lines look identical. A later consolidation step groups similar items, so keep each line separate here.

GENERAL:
- Be EXHAUSTIVE. Capture every item/requirement row in what you are shown.
- quantity is a number (default 1 if absent). uom is a short unit like Nos, PCS, KG, BAG, MTR.
- Section/zone headers are NOT items, but list every item under them (record the zone in description).
- Read part numbers, models, brands when present; otherwise "". Do not invent values.
- Ignore page headers/footers, totals, taxes and terms.`

const ITEM_SCHEMA = {
  name: 'rfq_items',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            name: { type: 'string' }, spec: { type: 'string' }, quantity: { type: 'number' },
            uom: { type: 'string' }, brand: { type: 'string' }, model: { type: 'string' },
            partNo: { type: 'string' }, description: { type: 'string' }, secondaryRequirements: { type: 'string' },
          },
          required: ['name', 'spec', 'quantity', 'uom', 'brand', 'model', 'partNo', 'description', 'secondaryRequirements'],
        },
      },
    },
    required: ['items'],
  },
}

const CLUB_SYSTEM = `You are consolidating an already-extracted procurement item list for a cleaner overview. Group entries that refer to the SAME real-world item even when wording differs — synonyms, abbreviations, word order, pluralization, or trivial spec formatting (e.g. "6W" vs "6 watt", "S.S." vs "Stainless Steel").

DO NOT group genuinely different variants: different capacity/rating/size/voltage/finish are DIFFERENT items and must stay in separate clusters.

Rules:
- Every input index must appear in EXACTLY ONE cluster.
- A cluster may contain a single item if it has no duplicates.
- For each cluster provide the best canonical "name" and "spec", a "uom", the member indices, and a short "reason" for grouping (or "unique" for singletons).`

const CLUB_SCHEMA = {
  name: 'item_clusters',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      clusters: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            name: { type: 'string' }, spec: { type: 'string' }, uom: { type: 'string' },
            members: { type: 'array', items: { type: 'number' } }, reason: { type: 'string' },
          },
          required: ['name', 'spec', 'uom', 'members', 'reason'],
        },
      },
    },
    required: ['clusters'],
  },
}

const uniq = (arr) => [...new Set(arr)]

// GPT-5.x / o-series reasoning models only accept the default temperature and
// use `max_completion_tokens`; gpt-4.x accepts `temperature` + `max_tokens`.
// Build a request that works regardless of which model is configured.
const isReasoning = (model) => /^(gpt-5|o\d)/i.test(model)
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 8000
function chatParams(model, messages, schema) {
  const p = {
    model, messages,
    max_completion_tokens: MAX_TOKENS,
    response_format: { type: 'json_schema', json_schema: schema },
  }
  if (!isReasoning(model)) p.temperature = 0
  return p
}

// Merge rows identical in BOTH name and spec — summing quantities and unioning
// provenance (the pages / row-ranges each copy was found on).
function dedup(items) {
  const map = new Map()
  for (const it of items) {
    const name = String(it.name || '').trim()
    if (!name) continue
    const spec = String(it.spec || '').trim()
    const key = normalize(name + ' | ' + spec)
    const pages = it.pages || []
    const sources = it.sources || []
    if (map.has(key)) {
      const cur = map.get(key)
      cur.quantity += Number(it.quantity) || 0
      cur.pages = uniq([...cur.pages, ...pages]).sort((a, b) => a - b)
      cur.sources = uniq([...cur.sources, ...sources])
    } else {
      map.set(key, { ...it, name, spec, quantity: Number(it.quantity) || 1, pages: [...pages], sources: [...sources] })
    }
  }
  return [...map.values()]
}

function naiveParse(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const items = []
  for (const line of lines) {
    if (/^(s\.?no|sno|item|description|total|subtotal|tax|gst|amount|qty|sheet:)/i.test(line)) continue
    const cells = line.split(/\s*[,|\t]\s*/).filter(Boolean)
    const name = (cells[0] || line).replace(/^\d+[\).\s]+/, '').trim()
    if (!name || name.length < 2) continue
    const qtyCell = cells.find((c) => /^\d+(\.\d+)?$/.test(c))
    items.push({ name, spec: '', quantity: qtyCell ? Number(qtyCell) : 1, uom: 'PCS', brand: '', model: '', partNo: '', description: '', secondaryRequirements: '', pages: [], sources: ['document'] })
  }
  return dedup(items)
}

async function callModel(client, content, label = '', schema = ITEM_SCHEMA, system = SYSTEM) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content }]
  const resp = await client.chat.completions.create(chatParams(MODEL, messages, schema))
  if (resp.choices[0].finish_reason === 'length') {
    console.warn(`[ai] ${label} hit token cap — lower AI_PAGES_PER_CALL / AI_ROWS_PER_CALL or raise AI_MAX_TOKENS.`)
  }
  try { return JSON.parse(resp.choices[0].message.content || '{"items":[]}').items || [] }
  catch { return [] }
}

// Spreadsheet variant: input is JSON rows, each tagged with its row number, and
// the model must echo that number back as `sourceRow` so we know exactly which
// row each item came from.
const ROW_SYSTEM = SYSTEM + `

INPUT FORMAT: You are given SPREADSHEET ROWS as JSON. Each entry has a "row" number and the cell values keyed by column name. Return EXACTLY ONE item per purchasable row (do not merge rows):
- Set "sourceRow" to that entry's "row" number — exactly.
- If an entry is a section header, sub-total, total, or otherwise not a purchasable item, OMIT it.
- A single cell may contain MULTIPLE LINES (e.g. a full specification). Keep that content together — put the distinguishing part in "spec" and the rest in "description". Do not split one row into many items unless it genuinely lists several distinct products.`

const ROW_ITEM_SCHEMA = {
  name: 'rfq_row_items',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            name: { type: 'string' }, spec: { type: 'string' }, quantity: { type: 'number' },
            uom: { type: 'string' }, brand: { type: 'string' }, model: { type: 'string' },
            partNo: { type: 'string' }, description: { type: 'string' }, secondaryRequirements: { type: 'string' },
            sourceRow: { type: 'number' },
          },
          required: ['name', 'spec', 'quantity', 'uom', 'brand', 'model', 'partNo', 'description', 'secondaryRequirements', 'sourceRow'],
        },
      },
    },
    required: ['items'],
  },
}

// ---- Supplier quotation extraction (adds unit price) ----------------------
const QUOTE_SYSTEM = `You are reading a SUPPLIER QUOTATION. Extract EVERY quoted line item with its UNIT PRICE.
- "name": clean base product name.
- "spec": distinguishing specification, "" if none.
- "quantity": quantity quoted (number, default 1).
- "uom": short unit (Nos, PCS, KG, MTR…).
- "unitPrice": the PER-UNIT price/rate as a NUMBER, no currency symbols. If only a line total is shown, divide it by the quantity. Use 0 if no price is present.
- "leadTime": delivery lead-time text if present, else "".
- "warranty": warranty text if present, else "".
Be exhaustive — one item per quoted line. Ignore sub-totals, totals, taxes, and terms.`

const QUOTE_FIELDS = {
  name: { type: 'string' }, spec: { type: 'string' }, quantity: { type: 'number' },
  uom: { type: 'string' }, unitPrice: { type: 'number' }, leadTime: { type: 'string' }, warranty: { type: 'string' },
}
const QUOTE_REQ = ['name', 'spec', 'quantity', 'uom', 'unitPrice', 'leadTime', 'warranty']
const QUOTE_ITEM_SCHEMA = {
  name: 'quote_items', strict: true,
  schema: { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: QUOTE_FIELDS, required: QUOTE_REQ } } }, required: ['items'] },
}
const QUOTE_ROW_SYSTEM = QUOTE_SYSTEM + `

INPUT FORMAT: spreadsheet ROWS as JSON, each with a "row" number. Return exactly one item per quoted row and echo its "row" number into "sourceRow".`
const QUOTE_ROW_SCHEMA = {
  name: 'quote_row_items', strict: true,
  schema: { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { ...QUOTE_FIELDS, sourceRow: { type: 'number' } }, required: [...QUOTE_REQ, 'sourceRow'] } } }, required: ['items'] },
}

// ---- Quote → RFQ line matching --------------------------------------------
const MATCH_MODEL = process.env.OPENAI_MATCH_MODEL || MODEL

const MATCH_SYSTEM = `You map a SUPPLIER QUOTATION's line items onto a buyer's RFQ line items.
For EACH rfq line (referenced by its index "i"), choose the quote line index that refers to the SAME item, or -1 if nothing matches.
Use these signals, in priority order:
1. QUANTITY — the same item almost always has the SAME quantity in both lists. Strong signal.
2. Item NAME / SPECIFICATION similarity — allow synonyms, abbreviations, reordered words, brand/model differences, minor wording.
3. ORDER — quote lines are OFTEN (not always) in the same order as the rfq lines, so a quote line at a similar position is a good tie-breaker.
Rules:
- Each quote line may be used for AT MOST ONE rfq line.
- Return EXACTLY one entry per rfq line: its rfqIndex and the chosen quoteIndex (or -1).
- Prefer a confident -1 over a wrong match.`

const MATCH_SCHEMA = {
  name: 'quote_match', strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      matches: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, properties: { rfqIndex: { type: 'number' }, quoteIndex: { type: 'number' } }, required: ['rfqIndex', 'quoteIndex'] },
      },
    },
    required: ['matches'],
  },
}

// Token-overlap fallback (no API key) — name similarity + exact-quantity bonus
// + small same-position bonus. Returns rfqIndex -> quoteIndex (or -1).
function heuristicMatch(rfqLines, quoteLines) {
  const tokens = (s) => normalize(s).split(/\s+/).filter(Boolean)
  const sim = (a, b) => {
    const A = new Set(tokens(a)), B = new Set(tokens(b))
    if (!A.size || !B.size) return 0
    let inter = 0
    A.forEach((t) => { if (B.has(t)) inter++ })
    return inter / Math.max(A.size, B.size)
  }
  const used = new Set()
  const map = new Array(rfqLines.length).fill(-1)
  rfqLines.forEach((L, ri) => {
    let best = -1, bestScore = 0
    quoteLines.forEach((q, qi) => {
      if (used.has(qi)) return
      const qtyEq = Number(q.quantity) === Number(L.qty)
      const score = sim(`${L.name} ${L.spec || ''}`, `${q.name} ${q.spec || ''}`) + (qtyEq ? 0.5 : 0) + (ri === qi ? 0.15 : 0)
      if (score > bestScore) { bestScore = score; best = qi }
    })
    if (best >= 0 && bestScore >= 0.3) { map[ri] = best; used.add(best) }
  })
  return map
}

// AI-driven matching with a heuristic fallback. Returns { map, engine } where
// map[rfqIndex] = quoteIndex (or -1). Robust for ~250 items (one compact call).
export async function matchQuoteLines(rfqLines = [], quoteLines = []) {
  if (!quoteLines.length || !rfqLines.length) return { map: new Array(rfqLines.length).fill(-1), engine: null }
  if (!process.env.OPENAI_API_KEY) return { map: heuristicMatch(rfqLines, quoteLines), engine: 'fallback' }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const rfq = rfqLines.map((l, i) => ({ i, name: l.name, spec: l.spec || '', qty: Number(l.qty) || 0, uom: l.uom || '' }))
  const quote = quoteLines.map((q, i) => ({ i, name: q.name, spec: q.spec || '', qty: Number(q.quantity) || 0, uom: q.uom || '' }))
  try {
    const messages = [
      { role: 'system', content: MATCH_SYSTEM },
      { role: 'user', content: `RFQ lines (${rfq.length}):\n${JSON.stringify(rfq)}\n\nQUOTE lines (${quote.length}):\n${JSON.stringify(quote)}` },
    ]
    const resp = await client.chat.completions.create(chatParams(MATCH_MODEL, messages, MATCH_SCHEMA))
    const arr = JSON.parse(resp.choices[0].message.content || '{"matches":[]}').matches || []
    const map = new Array(rfqLines.length).fill(-1)
    const used = new Set()
    for (const m of arr) {
      const ri = Number(m.rfqIndex), qi = Number(m.quoteIndex)
      if (ri >= 0 && ri < rfqLines.length && qi >= 0 && qi < quoteLines.length && map[ri] === -1 && !used.has(qi)) {
        map[ri] = qi; used.add(qi)
      }
    }
    return { map, engine: MATCH_MODEL }
  } catch (e) {
    console.warn('[ai] quote match failed, using heuristic:', e.message)
    return { map: heuristicMatch(rfqLines, quoteLines), engine: 'heuristic' }
  }
}

// Build the ordered list of work units. Each unit carries:
//   { content, pages:[n...], source:'Page 3' | 'Rows 1-10' }
async function buildChunks(extraction) {
  if (extraction.kind === 'pdf') {
    const { total, chunks } = await splitPdfPages(extraction.buffer, { pagesPerChunk: PAGES_PER_CALL })
    return {
      pages: total,
      units: chunks.map((c) => {
        const range = []
        for (let p = c.fromPage; p <= c.toPage; p++) range.push(p)
        return {
          source: c.toPage > c.fromPage ? `Page ${c.fromPage}-${c.toPage}` : `Page ${c.fromPage}`,
          pages: range,
          content: [
            { type: 'text', text: `Extract ALL line items from this page (pages ${c.fromPage}-${c.toPage} of ${total}).` },
            { type: 'file', file: { filename: `page-${c.fromPage}.pdf`, file_data: c.dataUrl } },
          ],
        }
      }),
    }
  }

  if (extraction.kind === 'images') {
    return {
      pages: extraction.images.length,
      units: extraction.images.map((url, i) => ({
        source: `Image ${i + 1}`, pages: [i + 1],
        content: [
          { type: 'text', text: `Extract ALL line items from this image (${i + 1} of ${extraction.images.length}).` },
          { type: 'image_url', image_url: { url, detail: 'high' } },
        ],
      })),
    }
  }

  // Spreadsheets: parse row-by-row, send 10 structured rows per request.
  // Each row keeps its real number; multi-line cells stay intact (no newline
  // splitting), and the model echoes back which row each item came from.
  if (extraction.kind === 'rows') {
    const sheets = extraction.sheets || []
    const multi = extraction.multiSheet
    const flat = []
    const rowLabels = {}
    for (const s of sheets) {
      for (const r of s.rows) {
        rowLabels[r.id] = multi ? `${s.name} R${r.excelRow}` : `Row ${r.excelRow}`
        const data = {}
        r.cells.forEach((c, i) => {
          if (c == null || String(c).trim() === '') return
          const key = (s.header[i] && String(s.header[i]).trim()) || `Col${i + 1}`
          data[key] = c
        })
        flat.push(multi ? { row: r.id, sheet: s.name, ...data } : { row: r.id, ...data })
      }
    }
    const units = []
    for (let i = 0; i < flat.length; i += ROWS_PER_CALL) {
      const group = flat.slice(i, i + ROWS_PER_CALL)
      units.push({
        rowMode: true,
        source: `Rows ${group[0]?.row}-${group[group.length - 1]?.row}`,
        content: [{ type: 'text', text: 'Extract the line item from EACH spreadsheet row below. Echo each row\'s "row" value into "sourceRow".\n\n' + JSON.stringify(group) }],
      })
    }
    return { pages: flat.length, units, rowLabels }
  }

  // Generic long text: split into line blocks, repeating the header for context.
  const allLines = String(extraction.text || '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (allLines.length <= TEXT_LINES_PER_CALL) {
    return { pages: 1, units: [{ source: 'Document', pages: [1], content: [{ type: 'text', text: 'Extract ALL line items from this document.\n\n' + (extraction.text || '').slice(0, 80000) }] }] }
  }
  const header = allLines[0]
  const body = allLines.slice(1)
  const units = []
  for (let i = 0; i < body.length; i += TEXT_LINES_PER_CALL) {
    const block = [header, ...body.slice(i, i + TEXT_LINES_PER_CALL)].join('\n')
    units.push({ source: `Block ${units.length + 1}`, pages: [units.length + 1], content: [{ type: 'text', text: `Extract ALL line items from this section.\n\n` + block }] })
  }
  return { pages: units.length, units }
}

// Second pass: cluster near-duplicate items into "clubs" for the clubbed view.
async function clubItems(client, items) {
  if (items.length < 2) return { clubs: null, engine: null }
  const list = items.map((it, i) => ({ i, name: it.name, spec: it.spec, uom: it.uom, quantity: it.quantity }))
  let clusters = []
  try {
    const messages = [
      { role: 'system', content: CLUB_SYSTEM },
      { role: 'user', content: 'Cluster these extracted items. Return clusters with member indices.\n\n' + JSON.stringify(list) },
    ]
    const resp = await client.chat.completions.create(chatParams(CLUB_MODEL, messages, CLUB_SCHEMA))
    clusters = JSON.parse(resp.choices[0].message.content || '{"clusters":[]}').clusters || []
  } catch (e) {
    console.warn(`[ai] clubbing pass (${CLUB_MODEL}) failed:`, e.message)
    return { clubs: null, engine: null }
  }

  // Map clusters back onto the basic items; ensure every index is covered once.
  const seen = new Set()
  const clubs = []
  for (const c of clusters) {
    const members = (c.members || []).filter((i) => Number.isInteger(i) && i >= 0 && i < items.length && !seen.has(i))
    if (!members.length) continue
    members.forEach((i) => seen.add(i))
    const mItems = members.map((i) => items[i])
    clubs.push({
      name: c.name || mItems[0].name,
      spec: c.spec || mItems[0].spec || '',
      uom: c.uom || mItems[0].uom || 'PCS',
      quantity: mItems.reduce((a, x) => a + (Number(x.quantity) || 0), 0),
      members,
      count: members.length,
      reason: members.length > 1 ? (c.reason || 'similar items') : 'unique',
      pages: uniq(mItems.flatMap((x) => x.pages || [])).sort((a, b) => a - b),
      sources: uniq(mItems.flatMap((x) => x.sources || [])),
    })
  }
  // Any items the model missed become their own singleton clubs.
  items.forEach((it, i) => {
    if (seen.has(i)) return
    clubs.push({ name: it.name, spec: it.spec || '', uom: it.uom || 'PCS', quantity: Number(it.quantity) || 0, members: [i], count: 1, reason: 'unique', pages: it.pages || [], sources: it.sources || [] })
  })
  return { clubs, engine: CLUB_MODEL }
}

// Re-run the clubbing pass over an arbitrary item list — used when a second
// document is appended so the Clubbed view groups across ALL accumulated items.
// `items` should carry pages/sources so the clubbed groups keep their provenance.
export async function clusterItems(items = []) {
  if (!process.env.OPENAI_API_KEY || items.length < 2) return { clubs: null, engine: null }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const { clubs, engine } = await clubItems(client, items)
  return { clubs, clubEngine: engine }
}

export async function extractItems(extraction, opts = {}) {
  const quote = !!opts.quote // supplier-quote mode → extract unit prices, skip clubbing
  const hasKey = !!process.env.OPENAI_API_KEY
  if (!hasKey) {
    const text = extraction.text || ''
    return { items: naiveParse(text), clubs: null, engine: 'fallback', clubEngine: null, note: 'No OPENAI_API_KEY — used naive parser.', pages: 1, chunks: 1 }
  }

  const itemSchema = quote ? QUOTE_ITEM_SCHEMA : ITEM_SCHEMA
  const itemSystem = quote ? QUOTE_SYSTEM : SYSTEM
  const rowSchema = quote ? QUOTE_ROW_SCHEMA : ROW_ITEM_SCHEMA
  const rowSystem = quote ? QUOTE_ROW_SYSTEM : ROW_SYSTEM

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const { pages, units, rowLabels } = await buildChunks(extraction)

  // Fan out (≤ CONCURRENCY in flight); tag every item with its provenance.
  // A single chunk failing (rate limit, transient error) must NOT sink the whole
  // job — it just contributes no items.
  const perChunk = await mapLimit(units, CONCURRENCY, async (u) => {
    try {
      if (u.rowMode) {
        // Spreadsheet rows: provenance is the exact row the model echoed back.
        const raw = await callModel(client, u.content, u.source, rowSchema, rowSystem)
        return raw.map((it) => {
          const id = Number(it.sourceRow) || 0
          const { sourceRow, ...rest } = it
          return { ...rest, pages: id ? [id] : [], sources: id ? [rowLabels?.[id] || `Row ${id}`] : [] }
        })
      }
      const raw = await callModel(client, u.content, u.source, itemSchema, itemSystem)
      return raw.map((it) => ({ ...it, pages: u.pages, sources: [u.source] }))
    } catch (e) {
      console.warn(`[ai] chunk "${u.source}" failed:`, e.message)
      return []
    }
  })

  // Stitch in document order. NO de-duplication here — the Basic view shows
  // every individual line/row as its own item with its own provenance. The
  // Clubbed view (below) is what groups similar entries.
  const items = []
  perChunk.forEach((arr) => arr.forEach((it) => items.push(it)))

  // Clubbed view (best-effort; never blocks the basic result). Skipped for quotes.
  const { clubs, engine: clubEngine } = quote ? { clubs: null, engine: null } : await clubItems(client, items)

  const unitWord = extraction.kind === 'rows' ? 'row(s)' : extraction.kind === 'pdf' ? 'page(s)' : 'section(s)'
  const note = units.length > 1 ? `Parsed ${pages} ${unitWord} in ${units.length} chunks, ${CONCURRENCY}-way parallel.` : undefined
  return { items, clubs, engine: MODEL, clubEngine, note, pages, chunks: units.length }
}
