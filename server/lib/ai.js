// Sends extracted content to OpenAI and returns a clean, de-duplicated item list.
// If no API key is configured, falls back to a naive line parser so the app still works.
import OpenAI from 'openai'
import { normalize } from './tags.js'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const SYSTEM = `You are a meticulous procurement assistant. Extract EVERY purchasable LINE ITEM and REQUIREMENT from the document (a quotation, BOQ, purchase list, invoice, or spreadsheet export). The document may span MULTIPLE pages/images — read all of them.

FIELD SEGREGATION — follow exactly:
- "name": the CLEAN BASE product name ONLY. No ratings, sizes, options or extra words. e.g. "Inlined cabinet type exhaust fan". Never put the spec in the name.
- "spec": the short distinguishing specification that makes this item a unique variant — capacity/rating (15kW, 7.5kW), size (5kg, 2.5sqmm), phase, voltage, model, finish, options like "with VFD"/"without VFD". e.g. "7.5kW, 3 phase, with VFD". "" if none.
- "description": ALL remaining details from the row and its columns — motor details, panel-board requirement, zone/area it belongs to, power requirement, notes, any text in extra columns. Do NOT discard information; put everything that isn't name/spec/qty/uom here. Keep it concise but complete.

WHAT MAKES AN ITEM DISTINCT:
- Two rows with the SAME name but DIFFERENT spec are DIFFERENT items — capture each.
- Merge ONLY rows truly identical in BOTH name and spec — then SUM their quantities. Otherwise keep separate.

SECONDARY REQUIREMENTS:
- Lines that are auxiliary requirements rather than the primary equipment — "Panel Board Requirement", "Power Requirement for Ventilation Fans", control panels, infrastructure, accessories — MUST still be captured. Set "secondary": true for these. Primary equipment is "secondary": false.

GENERAL:
- Be EXHAUSTIVE. Capture every item/requirement row across all pages and sections. Do not stop early or skip rows.
- quantity is a number (default 1 if absent). uom is a short unit like Nos, PCS, KG, BAG, MTR.
- Section/zone headers (e.g. "Staff Kitchen", "Show Kitchen") are NOT items themselves, but list every item under them (record the zone in description).
- Read part numbers, models, brands when present; otherwise "". Do not invent values.
- Ignore page headers/footers, totals, taxes and terms.`

const ITEM_SCHEMA = {
  name: 'rfq_items',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            spec: { type: 'string' },
            quantity: { type: 'number' },
            uom: { type: 'string' },
            brand: { type: 'string' },
            model: { type: 'string' },
            partNo: { type: 'string' },
            description: { type: 'string' },
            secondary: { type: 'boolean' },
          },
          required: ['name', 'spec', 'quantity', 'uom', 'brand', 'model', 'partNo', 'description', 'secondary'],
        },
      },
    },
    required: ['items'],
  },
}

// Merge only rows identical in BOTH name and spec — summing their quantities.
// Rows that differ in spec stay as separate items.
function dedup(items) {
  const map = new Map()
  for (const it of items) {
    const name = String(it.name || '').trim()
    if (!name) continue
    const spec = String(it.spec || '').trim()
    const key = normalize(name + ' | ' + spec)
    if (map.has(key)) {
      map.get(key).quantity += Number(it.quantity) || 0
    } else {
      map.set(key, { ...it, name, spec, quantity: Number(it.quantity) || 1 })
    }
  }
  return [...map.values()]
}

// Very small heuristic parser for when there is no API key.
function naiveParse(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const items = []
  for (const line of lines) {
    if (/^(s\.?no|sno|item|description|total|subtotal|tax|gst|amount|qty|sheet:)/i.test(line)) continue
    const cells = line.split(/\s*[,|\t]\s*/).filter(Boolean)
    const name = (cells[0] || line).replace(/^\d+[\).\s]+/, '').trim()
    if (!name || name.length < 2) continue
    const qtyCell = cells.find((c) => /^\d+(\.\d+)?$/.test(c))
    items.push({ name, spec: '', quantity: qtyCell ? Number(qtyCell) : 1, uom: 'PCS', brand: '', model: '', partNo: '', description: '', secondary: false })
  }
  return dedup(items).slice(0, 200)
}

export async function extractItems(extraction) {
  const hasKey = !!process.env.OPENAI_API_KEY
  if (!hasKey) {
    const text = extraction.text || (extraction.kind === 'text' ? extraction.text : '') || ''
    return { items: dedup(naiveParse(text)), engine: 'fallback', note: 'No OPENAI_API_KEY — used naive parser.' }
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const content = [{ type: 'text', text: 'Extract ALL line items from this document. It may have multiple pages.' }]

  if (extraction.kind === 'pdf') {
    // Send the PDF directly — the model reads text + page images natively.
    content.push({ type: 'file', file: { filename: extraction.filename || 'document.pdf', file_data: extraction.dataUrl } })
  } else if (extraction.kind === 'images') {
    // detail:'high' is essential — without it the image is downsampled and dense
    // table text becomes unreadable, so only a few items get picked up.
    for (const url of extraction.images) content.push({ type: 'image_url', image_url: { url, detail: 'high' } })
  } else {
    content.push({ type: 'text', text: '\n\nDOCUMENT:\n' + (extraction.text || '').slice(0, 80000) })
  }

  const resp = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 8000,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content },
    ],
    response_format: { type: 'json_schema', json_schema: ITEM_SCHEMA },
  })

  if (resp.choices[0].finish_reason === 'length') {
    console.warn('[ai] response hit max_tokens — item list may be truncated. Consider raising max_tokens.')
  }

  let parsed = { items: [] }
  try {
    parsed = JSON.parse(resp.choices[0].message.content || '{"items":[]}')
  } catch {
    parsed = { items: [] }
  }
  return { items: dedup(parsed.items || []), engine: MODEL }
}
