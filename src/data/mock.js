// Centralised mock data + helpers for the RFQ Hub demo.

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

export const suppliers = [
  {
    id: 'SUP-001',
    name: 'Lumina Electricals Pvt Ltd',
    category: 'Electronics',
    rating: 4.7,
    qualified: true,
    previouslyInvited: true,
    contact: 'sales@lumina.co',
    location: 'Mumbai, IN',
    rfqsReceived: 42,
    responseRate: 91,
    awardRate: 38,
  },
  {
    id: 'SUP-002',
    name: 'Brightspark Lighting Co.',
    category: 'Electronics',
    rating: 4.4,
    qualified: true,
    previouslyInvited: true,
    contact: 'rfq@brightspark.com',
    location: 'Pune, IN',
    rfqsReceived: 31,
    responseRate: 84,
    awardRate: 29,
  },
  {
    id: 'SUP-003',
    name: 'NovaSteel Raw Materials',
    category: 'Raw Materials',
    rating: 4.1,
    qualified: true,
    previouslyInvited: true,
    contact: 'bids@novasteel.in',
    location: 'Jamshedpur, IN',
    rfqsReceived: 27,
    responseRate: 76,
    awardRate: 41,
  },
  {
    id: 'SUP-004',
    name: 'Apex Industrial Services',
    category: 'Services',
    rating: 3.9,
    qualified: true,
    previouslyInvited: false,
    contact: 'hello@apexsvc.com',
    location: 'Bengaluru, IN',
    rfqsReceived: 12,
    responseRate: 67,
    awardRate: 22,
  },
  {
    id: 'SUP-005',
    name: 'Volt & Wire Components',
    category: 'Electronics',
    rating: 4.2,
    qualified: false,
    previouslyInvited: false,
    contact: 'quotes@voltwire.co',
    location: 'Chennai, IN',
    rfqsReceived: 8,
    responseRate: 55,
    awardRate: 12,
  },
  {
    id: 'SUP-006',
    name: 'GreenSource Materials',
    category: 'Raw Materials',
    rating: 4.5,
    qualified: true,
    previouslyInvited: false,
    contact: 'sales@greensource.in',
    location: 'Ahmedabad, IN',
    rfqsReceived: 19,
    responseRate: 80,
    awardRate: 33,
  },
]

export const categories = ['Electronics', 'Raw Materials', 'Services']

// Item catalogue shown as a tree on the create screen.
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
  {
    group: 'Hardware',
    items: [
      { name: 'Mounting Bracket', brand: 'Apex', model: 'MB-S', part: 'AX-MBS', uom: 'PCS' },
      { name: 'Junction Box IP65', brand: 'Apex', model: 'JB-65', part: 'AX-JB65', uom: 'PCS' },
    ],
  },
]

const today = new Date('2026-06-19')
const addDays = (n) => {
  const d = new Date(today)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export const rfqs = [
  {
    id: 'RFQ-2026-0042',
    title: 'Landscape Lighting — Phase 2',
    description: 'Outdoor lighting fixtures for the campus landscape upgrade, Block C & D.',
    status: STATUS.EVALUATION,
    buyer: 'Madhu',
    category: 'Electronics',
    currency: 'USD',
    created: addDays(-12),
    deadline: addDays(3),
    validity: addDays(30),
    deliveryLocation: 'OPRO Warehouse, Pune',
    paymentTerms: '30 days net',
    budget: 9500,
    invited: ['SUP-001', 'SUP-002'],
    responded: ['SUP-001', 'SUP-002'],
    items: [
      { sno: 1, name: 'Wall Light', desc: 'Dimmable 6W CRI90', qty: 50, uom: 'PCS', brand: 'Lumina', model: 'WL-6D', part: 'LM-WL6D', delivery: addDays(20) },
      { sno: 2, name: 'Wall Light', desc: 'Dimmable 6W CRI90 (warm)', qty: 60, uom: 'PCS', brand: 'Lumina', model: 'WL-6DW', part: 'LM-WL6DW', delivery: addDays(20) },
      { sno: 3, name: 'Spike Light', desc: 'White finish, 12W', qty: 150, uom: 'PCS', brand: 'Lumina', model: 'SPK-12', part: 'LM-SPK12', delivery: addDays(25) },
      { sno: 4, name: 'Foot Light Type-1', desc: 'Recessed step light', qty: 35, uom: 'PCS', brand: 'Brightspark', model: 'FL-1', part: 'BS-FL1', delivery: addDays(25) },
    ],
    quotes: {
      'SUP-001': {
        leadTime: '18 days', warranty: '2 years', payment: '30 days net',
        lines: { 1: 1.32, 2: 1.32, 3: 43.16, 4: 9.33 },
        notes: { 1: '4W non-dimmable', 3: 'Sand Black finish', },
      },
      'SUP-002': {
        leadTime: '22 days', warranty: '3 years', payment: 'Advance 50%',
        lines: { 1: 4.63, 2: 4.63, 3: 15.73, 4: 8.86 },
        notes: { 1: 'Triac dimming, CRI80', 3: 'White finish ✓', },
      },
    },
  },
  {
    id: 'RFQ-2026-0041',
    title: 'Structural Steel — Mezzanine',
    description: 'Hot-rolled steel sections for the mezzanine fabrication.',
    status: STATUS.PUBLISHED,
    buyer: 'Indresh',
    category: 'Raw Materials',
    currency: 'USD',
    created: addDays(-5),
    deadline: addDays(6),
    validity: addDays(40),
    deliveryLocation: 'Site Office, Jamshedpur',
    paymentTerms: '45 days net',
    budget: 28000,
    invited: ['SUP-003', 'SUP-006'],
    responded: ['SUP-003'],
    items: [
      { sno: 1, name: 'ISMB 200', desc: 'I-beam 200mm', qty: 4000, uom: 'KG', brand: 'NovaSteel', model: 'ISMB200', part: 'NS-MB200', delivery: addDays(30) },
      { sno: 2, name: 'ISA 50x50x6', desc: 'Equal angle', qty: 1200, uom: 'KG', brand: 'NovaSteel', model: 'ISA50', part: 'NS-A50', delivery: addDays(30) },
    ],
    quotes: {
      'SUP-003': { leadTime: '28 days', warranty: 'NA', payment: '45 days net', lines: { 1: 0.82, 2: 0.79 }, notes: {} },
    },
  },
  {
    id: 'RFQ-2026-0040',
    title: 'AMC — HVAC Servicing',
    description: 'Annual maintenance contract for chillers and AHUs.',
    status: STATUS.APPROVAL,
    buyer: 'Madhu',
    category: 'Services',
    currency: 'USD',
    created: addDays(-20),
    deadline: addDays(-2),
    validity: addDays(60),
    deliveryLocation: 'OPRO HQ, Bengaluru',
    paymentTerms: 'Quarterly',
    budget: 15000,
    invited: ['SUP-004'],
    responded: ['SUP-004'],
    items: [
      { sno: 1, name: 'Chiller AMC', desc: 'Comprehensive, 2 units', qty: 2, uom: 'NOS', brand: 'Apex', model: 'AMC-CH', part: 'AX-AMCCH', delivery: addDays(7) },
      { sno: 2, name: 'AHU Servicing', desc: 'Quarterly, 8 units', qty: 8, uom: 'NOS', brand: 'Apex', model: 'AMC-AHU', part: 'AX-AMCAHU', delivery: addDays(7) },
    ],
    quotes: {
      'SUP-004': { leadTime: 'Immediate', warranty: '1 year', payment: 'Quarterly', lines: { 1: 5200, 2: 480 }, notes: {} },
    },
  },
  {
    id: 'RFQ-2026-0039',
    title: 'Indoor Fixtures — Office Fit-out',
    description: 'Panel lights & downlights for the new office floor.',
    status: STATUS.AWARDED,
    buyer: 'Indresh',
    category: 'Electronics',
    currency: 'USD',
    created: addDays(-35),
    deadline: addDays(-20),
    validity: addDays(-5),
    deliveryLocation: 'OPRO HQ, Bengaluru',
    paymentTerms: '30 days net',
    budget: 6200,
    awardedTo: 'SUP-001',
    awardedPrice: 5180,
    invited: ['SUP-001', 'SUP-002', 'SUP-005'],
    responded: ['SUP-001', 'SUP-002'],
    items: [
      { sno: 1, name: 'Panel Light 36W', desc: '600x600 recessed', qty: 80, uom: 'PCS', brand: 'Lumina', model: 'PL-36', part: 'LM-PL36', delivery: addDays(-10) },
    ],
    quotes: {},
  },
  {
    id: 'RFQ-2026-0038',
    title: 'Cabling Bulk Order',
    description: 'Copper cabling and conduits for electrical rough-in.',
    status: STATUS.DRAFT,
    buyer: 'Madhu',
    category: 'Electronics',
    currency: 'USD',
    created: addDays(-1),
    deadline: addDays(10),
    validity: addDays(30),
    deliveryLocation: 'OPRO Warehouse, Pune',
    paymentTerms: '30 days net',
    budget: 4100,
    invited: [],
    responded: [],
    items: [
      { sno: 1, name: 'Copper Cable 2.5sqmm', desc: 'FR PVC', qty: 2000, uom: 'MTR', brand: 'Volt & Wire', model: 'CU-2.5', part: 'VW-CU25', delivery: addDays(15) },
    ],
    quotes: {},
  },
  {
    id: 'RFQ-2026-0037',
    title: 'Switchgear Panels',
    description: 'LT distribution panels for substation 2.',
    status: STATUS.CLOSED,
    buyer: 'Indresh',
    category: 'Electronics',
    currency: 'USD',
    created: addDays(-60),
    deadline: addDays(-45),
    validity: addDays(-20),
    deliveryLocation: 'Substation 2, Pune',
    paymentTerms: '50% advance',
    budget: 41000,
    awardedTo: 'SUP-002',
    awardedPrice: 38900,
    invited: ['SUP-001', 'SUP-002'],
    responded: ['SUP-001', 'SUP-002'],
    items: [],
    quotes: {},
  },
]

export const auditLog = [
  { id: 1, rfq: 'RFQ-2026-0042', user: 'Madhu', time: '2026-06-19 10:42', action: 'Moved to Evaluation', field: 'Status', old: 'Responses Received', value: 'Evaluation' },
  { id: 2, rfq: 'RFQ-2026-0042', user: 'System', time: '2026-06-18 14:10', action: 'Quote received', field: 'Quotes', old: '1', value: '2' },
  { id: 3, rfq: 'RFQ-2026-0041', user: 'Indresh', time: '2026-06-14 09:30', action: 'Published RFQ', field: 'Status', old: 'Draft', value: 'Published' },
  { id: 4, rfq: 'RFQ-2026-0040', user: 'Madhu', time: '2026-06-12 16:05', action: 'Submitted for approval', field: 'Status', old: 'Evaluation', value: 'Pending Approval' },
  { id: 5, rfq: 'RFQ-2026-0039', user: 'Finance Head', time: '2026-05-28 11:20', action: 'Approved costing sheet', field: 'Approval', old: '—', value: 'Approved' },
  { id: 6, rfq: 'RFQ-2026-0039', user: 'Indresh', time: '2026-05-27 13:00', action: 'Awarded to Lumina Electricals', field: 'Award', old: '—', value: 'SUP-001' },
]

export const notifications = [
  { id: 1, type: 'response', title: 'New quote from Brightspark Lighting', rfq: 'RFQ-2026-0042', time: '2h ago', unread: true },
  { id: 2, type: 'approval', title: 'HVAC AMC awaiting Finance approval', rfq: 'RFQ-2026-0040', time: '5h ago', unread: true },
  { id: 3, type: 'deadline', title: 'Deadline approaching — Structural Steel', rfq: 'RFQ-2026-0041', time: '1d ago', unread: true },
  { id: 4, type: 'clarification', title: 'Clarification request on Spike Light finish', rfq: 'RFQ-2026-0042', time: '1d ago', unread: false },
  { id: 5, type: 'award', title: 'Office Fit-out awarded to Lumina', rfq: 'RFQ-2026-0039', time: '3w ago', unread: false },
]

export const supplierById = (id) => suppliers.find((s) => s.id === id)
export const rfqById = (id) => rfqs.find((r) => r.id === id)

export const fmt = (n) =>
  CURRENCY + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtShort = (n) => {
  if (n >= 1000) return CURRENCY + (n / 1000).toFixed(1) + 'k'
  return CURRENCY + n
}
