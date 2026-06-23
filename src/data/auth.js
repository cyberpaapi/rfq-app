// IAM model — roles, permissions and seed accounts for the RFQ Hub demo.

// Every gate-able capability in the app.
export const PERMISSIONS = {
  'rfq.create':     { group: 'RFQ',       label: 'Create / edit RFQ' },
  'rfq.publish':    { group: 'RFQ',       label: 'Publish & cancel RFQ' },
  'rfq.evaluate':   { group: 'RFQ',       label: 'Evaluate quotes' },
  'approve.hod':    { group: 'Approval',  label: 'Approve as Dept. HOD' },
  'approve.finance':{ group: 'Approval',  label: 'Approve as Finance Head' },
  'award.decide':   { group: 'Approval',  label: 'Award / reject' },
  'supplier.manage':{ group: 'Master',    label: 'Manage suppliers' },
  'users.manage':   { group: 'Admin',     label: 'Manage users & roles' },
  'reports.view':   { group: 'Insights',  label: 'View reports' },
  'audit.view':     { group: 'Insights',  label: 'View audit log' },
  'portal.access':  { group: 'Supplier',  label: 'Supplier portal (own RFQs)' },
}

export const PERMISSION_KEYS = Object.keys(PERMISSIONS)

// Role definitions. `*` = all permissions.
export const ROLES = {
  admin: {
    label: 'Administrator',
    desc: 'Full system access including user management.',
    color: 'rose',
    permissions: '*',
  },
  buyer: {
    label: 'Procurement Buyer',
    desc: 'Creates RFQs, invites suppliers and runs evaluation.',
    color: 'brand',
    permissions: ['rfq.create', 'rfq.publish', 'rfq.evaluate', 'award.decide', 'supplier.manage', 'reports.view', 'audit.view'],
  },
  hod: {
    label: 'Department HOD',
    desc: 'Technical approval authority for awarded quotations.',
    color: 'violet',
    permissions: ['approve.hod', 'rfq.evaluate', 'reports.view', 'audit.view'],
  },
  finance: {
    label: 'Finance Head',
    desc: 'Approves costing sheet and final award (financial).',
    color: 'emerald',
    permissions: ['approve.finance', 'award.decide', 'reports.view', 'audit.view'],
  },
  auditor: {
    label: 'Auditor',
    desc: 'Read-only access to reports and the compliance trail.',
    color: 'amber',
    permissions: ['reports.view', 'audit.view'],
  },
  supplier: {
    label: 'Supplier',
    desc: 'External vendor — sees only their own assigned RFQs.',
    color: 'ink',
    permissions: ['portal.access'],
  },
}

export const ROLE_KEYS = Object.keys(ROLES)

export const roleColor = (key) => {
  const map = {
    rose: 'bg-rose-50 text-rose-700',
    brand: 'bg-brand-50 text-brand-700',
    violet: 'bg-violet-50 text-violet-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    ink: 'bg-ink-100 text-ink-600',
  }
  return map[ROLES[key]?.color] || map.ink
}

export const roleHasPermission = (roleKey, perm) => {
  const role = ROLES[roleKey]
  if (!role) return false
  return role.permissions === '*' || role.permissions.includes(perm)
}

// Seed accounts. (Demo passwords — replace with a real hashed-credential backend.)
export const seedUsers = [
  { id: 'U-001', name: 'Madhu',        email: 'madhu@opro.com',    role: 'buyer',    dept: 'Procurement', status: 'active', lastActive: '2026-06-19 10:42', linkedSupplier: null, password: 'rfq@1234' },
  { id: 'U-002', name: 'Indresh Bhatia', email: 'indresh@opro.com', role: 'buyer',   dept: 'Procurement', status: 'active', lastActive: '2026-06-18 17:05', linkedSupplier: null, password: 'rfq@1234' },
  { id: 'U-003', name: 'Samir Panigrahi', email: 'samir@opro.com', role: 'hod',      dept: 'Engineering', status: 'active', lastActive: '2026-06-19 09:18', linkedSupplier: null, password: 'rfq@1234' },
  { id: 'U-004', name: 'Priya Nair',   email: 'priya@opro.com',    role: 'finance',  dept: 'Finance',     status: 'active', lastActive: '2026-06-19 08:50', linkedSupplier: null, password: 'rfq@1234' },
  { id: 'U-005', name: 'IT Admin',     email: 'admin@opro.com',    role: 'admin',    dept: 'IT',          status: 'active', lastActive: '2026-06-19 11:00', linkedSupplier: null, password: 'admin@123' },
  { id: 'U-006', name: 'Ravi Kulkarni', email: 'ravi@audit.opro.com', role: 'auditor', dept: 'Internal Audit', status: 'active', lastActive: '2026-06-15 14:30', linkedSupplier: null, password: 'rfq@1234' },
  { id: 'U-007', name: 'Lumina Sales', email: 'sales@lumina.co',   role: 'supplier', dept: '—',           status: 'active', lastActive: '2026-06-18 13:22', linkedSupplier: 'SUP-001', password: 'rfq@1234' },
  { id: 'U-008', name: 'Volt & Wire Rep', email: 'quotes@voltwire.co', role: 'supplier', dept: '—',       status: 'invited', lastActive: '—', linkedSupplier: 'SUP-005', password: '' },
]
