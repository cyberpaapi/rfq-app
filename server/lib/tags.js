// Tag + naming helpers.
// Core rule: an item like "Sand 5kg" yields the base tag "Sand" — size/qty is stripped.

// A token is a "size/quantity" token if it is a number optionally glued to a unit
// (incl. inch marks/symbols and a trailing period), or a bare unit, or a pure
// dimension. Tuned against a real 23k-item catalogue.
// Full list — used only when glued to a number (e.g. "3feet", "9000btu").
const UNIT_GLUE =
  "kg|kgs|g|gm|gms|mg|t|ton|tons|tr|l|lt|ltr|ltrs|ml|cl|m|mm|cm|km|mtr|mtrs|meter|metre|metres|rmt|rft|sft|sqft|sqm|sqmm|inch|inches|in|ft|feet|foot|w|kw|mw|kwh|wh|v|kv|kva|a|ma|ah|mah|hz|rpm|btu|btus|hp|pcs|pc|nos|no|unit|units|set|sets|pkt|pack|box|bag|bags|roll|rolls|pair|pairs|dia|gauge|swg|awg|deg"
// Safe subset — may be stripped as a BARE token. ONLY non-word unit abbreviations
// (no real words like box/bag/set/gauge/meter/foot that would mangle names).
const UNIT_BARE =
  "kg|kgs|gm|gms|mg|ml|mm|cm|km|sqft|sqm|sqmm|kw|mw|kwh|wh|kv|kva|ah|mah|hz|rpm|btu|btus|pcs|nos|swg|awg|dia|ltr|ltrs|tr"
const QUOTES = "''|\"\"|\"|'|°|ø"
const SIZE_RE = new RegExp(`^\\d+([.,/x×-]\\d+)*\\s*(${UNIT_GLUE}|${QUOTES})?\\.?$`, 'i')
const UNIT_ONLY_RE = new RegExp(`^(${UNIT_BARE}|${QUOTES})$`, 'i')

// Colours are variant indicators, not part of the base product name.
const COLORS = new Set('white black blue red green grey gray yellow brown silver golden gold orange pink purple ivory beige maroon cream chrome transparent'.split(' '))
const STOP = new Set(['x', '×', '-', '–', '*', '+', '&', '#', 'of', 'the', 'no.'])

export const normalize = (s = '') => String(s).trim().replace(/\s+/g, ' ').toLowerCase()

const titleish = (s) =>
  s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ').trim()

// Derive the base material/product name (the tag) from a full item name.
// "Sand 5kg" -> "Sand"; "Copper Cable 2.5sqmm" -> "Copper Cable"; "Wall Light 6W" -> "Wall Light".
export function deriveBaseName(name = '') {
  const tokens = String(name).split(/[\s,]+/).filter(Boolean)
  const kept = tokens.filter((tok) => {
    const t = tok.replace(/[()]/g, '')
    if (!t) return false
    const low = t.toLowerCase()
    if (STOP.has(low)) return false
    if (COLORS.has(low)) return false
    if (SIZE_RE.test(t)) return false
    if (UNIT_ONLY_RE.test(t)) return false
    // pure measurement e.g. "50x50x6", "1/2", "2.5"
    if (/^[\d.,/x×-]+$/i.test(t)) return false
    // pure symbols / mojibake (ø, #, *, replacement char, etc.)
    if (/^[^a-z0-9]+$/i.test(t)) return false
    return true
  })
  let base = kept.join(' ').trim()
  // If we stripped everything (name was all sizes), fall back to the raw name.
  if (!base) base = String(name).trim()
  return titleish(base)
}

// Canonical tag list with case-insensitive uniqueness.
// `existing` is an array of current tags; returns the canonical form to use.
export function canonicalTag(tag, existing = []) {
  const want = normalize(tag)
  const hit = existing.find((t) => normalize(t) === want)
  return hit || titleish(tag.trim())
}

// Merge a new tag into a set without case-insensitive duplicates.
export function addTagUnique(tags = [], tag) {
  const canon = canonicalTag(tag, tags)
  if (tags.some((t) => normalize(t) === normalize(canon))) return tags
  return [...tags, canon]
}
