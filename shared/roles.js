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
  'users.manage': { group: 'Administration', label: 'Manage accounts and roles (Administrator only)' },
}
export const PERMISSION_KEYS = Object.keys(PERMISSIONS)
export const WORKSPACE_PERMISSIONS = ['rfq.create', 'rfq.publish', 'rfq.evaluate', 'approve.hod', 'approve.finance', 'award.decide', 'supplier.manage', 'reports.view', 'data.export']
export const WRITE_PERMISSIONS = ['rfq.create', 'rfq.publish', 'ai.use', 'approve.hod', 'approve.finance', 'award.decide', 'supplier.manage', 'quote.submit', 'users.manage']
export const ROLES = {
  admin: { label: 'Administrator', desc: 'Full access and account administration.', color: 'rose', permissions: '*' },
}
export const ROLE_KEYS = Object.keys(ROLES)
export const seedRoles = (username = 'admin') => [{ id: 'admin', username: username.toLowerCase(), enabled: true, readOnly: false, builtIn: true, version: 1, ...ROLES.admin }]
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
  const username = String(input.username || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._@-]{2,79}$/.test(username)) throw new Error('Enter a username of 3-80 letters, numbers, dots, dashes or @.')
  if (roles.some((r) => r.id !== existing?.id && r.username === username)) throw new Error('That username is already in use.')
  if (!Array.isArray(input.permissions) || input.permissions.some((p) => !PERMISSION_KEYS.includes(p) || p === 'users.manage')) throw new Error('Choose valid permissions. Role administration is reserved for Administrator.')
  if (input.permissions.some((p) => WORKSPACE_PERMISSIONS.includes(p)) && !input.permissions.includes('workspace.view')) throw new Error('Enable workspace access for these procurement permissions.')
  const supplierId = String(input.supplierId || '')
  if ((input.permissions.includes('portal.access') || input.permissions.includes('quote.submit')) && !supplierId) throw new Error('Select the supplier profile for portal access.')
  return { label, username, desc: String(input.desc || '').trim().slice(0, 240), enabled: input.enabled !== false,
    readOnly: input.readOnly === true, permissions: [...new Set(input.permissions)], supplierId,
    color: existing?.color || 'ink' }
}
