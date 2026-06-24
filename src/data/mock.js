// Shared display constants + helpers. Live data now comes from the backend API
// (see src/api/client.js); this file only holds status/formatting helpers and
// the small catalogue tree used as a fallback on the manual Create-RFQ screen.

export const CURRENCY = '$'

export const STATUS = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  RESPONSE: 'Responses Received',
  EVALUATION: 'Evaluation',
  APPROVAL: 'Pending Approval',
  AWARDED: 'Awarded',
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
}

// Ordered workflow used by the status tracker.
export const WORKFLOW = [
  STATUS.DRAFT,
  STATUS.PUBLISHED,
  STATUS.RESPONSE,
  STATUS.EVALUATION,
  STATUS.APPROVAL,
  STATUS.AWARDED,
]

export const statusStyle = (s) => {
  switch (s) {
    case STATUS.DRAFT:
      return 'bg-ink-100 text-ink-600'
    case STATUS.PUBLISHED:
      return 'bg-blue-50 text-blue-700'
    case STATUS.RESPONSE:
      return 'bg-violet-50 text-violet-700'
    case STATUS.EVALUATION:
      return 'bg-amber-50 text-amber-700'
    case STATUS.APPROVAL:
      return 'bg-orange-50 text-orange-700'
    case STATUS.AWARDED:
      return 'bg-emerald-50 text-emerald-700'
    case STATUS.CANCELLED:
      return 'bg-rose-50 text-rose-700'
    case STATUS.CLOSED:
      return 'bg-ink-900 text-white'
    default:
      return 'bg-ink-100 text-ink-600'
  }
}

export const categories = ['Electronics', 'Raw Materials', 'Services']

// Small catalogue tree shown on the manual Create-RFQ screen when the live
// item catalogue is empty. The screen prefers live items from /api/items.
export const itemTree = [
  {
    group: 'Lighting',
    items: [
      { name: 'Wall Light', brand: 'Lumina', model: 'WL-6D', part: 'LM-WL6D', uom: 'PCS' },
      { name: 'Spike Light', brand: 'Lumina', model: 'SPK-12', part: 'LM-SPK12', uom: 'PCS' },
      { name: 'Foot Light Type-1', brand: 'Brightspark', model: 'FL-1', part: 'BS-FL1', uom: 'PCS' },
      { name: 'Flood Light 50W', brand: 'Brightspark', model: 'FLD-50', part: 'BS-FLD50', uom: 'PCS' },
    ],
  },
  {
    group: 'Cabling',
    items: [
      { name: 'Copper Cable 2.5sqmm', brand: 'Volt & Wire', model: 'CU-2.5', part: 'VW-CU25', uom: 'MTR' },
      { name: 'Conduit Pipe 25mm', brand: 'Volt & Wire', model: 'CP-25', part: 'VW-CP25', uom: 'MTR' },
    ],
  },
]

export const fmt = (n) =>
  CURRENCY + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtShort = (n) => {
  if (n >= 1000) return CURRENCY + (n / 1000).toFixed(1) + 'k'
  return CURRENCY + n
}
