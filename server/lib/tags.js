// Tag + naming helpers.
// Core rule: an item like "Sand 5kg" yields the base tag "Sand" — size/qty is stripped.

// A token is a "size/quantity" token if it is a number optionally glued to a unit,
// or a bare unit, or a pure number.
const UNIT =
  '(kg|kgs|g|gm|gms|mg|t|ton|tons|l|lt|ltr|ltrs|ml|cl|m|mm|cm|km|sqmm|sqm|sqft|w|kw|mw|v|kv|a|ma|hz|pcs|pc|nos|no|unit|units|inch|in|ft|set|sets|pkt|pack|box|bag|bags|roll|rolls|pair|pairs|dia|"|\')'
const SIZE_RE = new RegExp(`^\\d+([.,/x×]\\d+)*\\s*${UNIT}?$`, 'i')
const UNIT_ONLY_RE = new RegExp(`^${UNIT}$`, 'i')
// e.g. 2.5sqmm, 6w, 50x50x6, 10kg, 1/2"
const NUM_ANYWHERE_RE = /\d/

const STOP = new Set(['x', '×', '-', '–', 'of', 'the', 'a', 'an'])

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
    if (STOP.has(t.toLowerCase())) return false
    if (SIZE_RE.test(t)) return false
    if (UNIT_ONLY_RE.test(t)) return false
    // tokens that are mostly a measurement e.g. "50x50x6", "1/2", "2.5"
    if (/^[\d.,/x×-]+$/i.test(t)) return false
    // glued number+unit not caught above, e.g. "6W" handled by SIZE_RE; keep "Type-1"
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
