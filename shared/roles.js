export const PERMISSIONS = {
  'workspace.view': { group: 'Workspace', label: 'View RFQs and procurement data' },
  'rfq.create': { group: 'Sourcing', label: 'Create / edit RFQs, catalogue and assignments' },
  'rfq.publish': { group: 'Sourcing', label: 'Publish / cancel RFQs' },
  'rfq.evaluate': { group: 'Evaluation', label: 'Compare and edit quotes' },
  'ai.use': { group: 'Evaluation', label: 'Use paid AI extraction and recommendations' },
  'approve.hod': { group: 'Approval', label: 'Approve as Department HOD' },
  'approve.finance': { group: 'Approval', label: 'Approve as Finance Head' },
  'award.decide': { group: 'Approval', label: 'Award / reject quotations' },
  'supplier.manage': { group: 'Sourcing', label: 'Manage suppliers' },
  'reports.view': { group: 'Insights', label: 'View reports and dashboard' },
  'audit.view': { group: 'Insights', label: 'View audit and debug logs' },
  'data.export': { group: 'Insights', label: 'Export data and download quote originals' },
  'portal.access': { group: 'Supplier', label: 'Access supplier portal' },
  'quote.submit': { group: 'Supplier', label: 'Submit supplier quotes and clarifications' },
  'users.manage': { group: 'Administration', label: 'Manage roles (Administrator only)' },
}
export const PERMISSION_KEYS = Object.keys(PERMISSIONS)
export const WORKSPACE_PERMISSIONS = ['rfq.create', 'rfq.publish', 'rfq.evaluate', 'approve.hod', 'approve.finance', 'award.decide', 'supplier.manage', 'reports.view', 'data.export']
export const WRITE_PERMISSIONS = ['rfq.create', 'rfq.publish', 'ai.use', 'approve.hod', 'approve.finance', 'award.decide', 'supplier.manage', 'quote.submit', 'users.manage']
export const ROLES = {
  admin: { label: 'Administrator', desc: 'Full access and role administration.', color: 'rose', permissions: '*' },
  buyer: { label: 'Procurement Buyer', desc: 'Sources quotations and evaluates suppliers.', color: 'brand', permissions: ['workspace.view', 'rfq.create', 'rfq.publish', 'rfq.evaluate', 'ai.use', 'award.decide', 'supplier.manage', 'reports.view', 'audit.view', 'data.export', 'portal.access', 'quote.submit'] },
  hod: { label: 'Department HOD', desc: 'Evaluates quotations and provides technical approval.', color: 'violet', permissions: ['workspace.view', 'rfq.evaluate', 'approve.hod', 'reports.view', 'audit.view', 'data.export'] },
  finance: { label: 'Finance Head', desc: 'Reviews financials and approves awards.', color: 'emerald', permissions: ['workspace.view', 'approve.finance', 'award.decide', 'reports.view', 'audit.view', 'data.export'] },
  auditor: { label: 'Auditor', desc: 'Read-only procurement, reports and audit access.', color: 'amber', readOnly: true, permissions: ['workspace.view', 'reports.view', 'audit.view', 'data.export'] },
  supplier: { label: 'Supplier', desc: 'Uses the supplier portal to submit quotations.', color: 'ink', permissions: ['portal.access', 'quote.submit', 'ai.use'] },
}
export const ROLE_KEYS = Object.keys(ROLES)
export const seedRoles = () => Object.entries(ROLES).map(([id, role]) => ({ id, enabled: true, readOnly: false, builtIn: true, version: 1, ...role }))
export function roleCan(role, permission) {
  if (!role?.enabled) return false
  if (role.id === 'admin') return true
  if (permission === 'users.manage') return false
  if (role.readOnly && WRITE_PERMISSIONS.includes(permission)) return false
  return Array.isArray(role.permissions) && role.permissions.includes(permission)
}
export function validateRole(input, roles, existing) {
  const label = String(input.label || '').trim()
  if (!label || label.length > 60) throw new Error('Enter a role name between 1 and 60 characters.')
  if (roles.some((r) => r.id !== existing?.id && r.label.toLowerCase() === label.toLowerCase())) throw new Error('A role with this name already exists.')
  if (!Array.isArray(input.permissions) || input.permissions.some((p) => !PERMISSION_KEYS.includes(p) || p === 'users.manage')) throw new Error('Choose valid permissions. Role administration is reserved for Administrator.')
  if (input.permissions.some((p) => WORKSPACE_PERMISSIONS.includes(p)) && !input.permissions.includes('workspace.view')) throw new Error('Enable workspace access for these procurement permissions.')
  return { label, desc: String(input.desc || '').trim().slice(0, 240), enabled: input.enabled !== false,
    readOnly: input.readOnly === true, permissions: [...new Set(input.permissions)], color: existing?.color || 'ink' }
}
