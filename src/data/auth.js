export { ROLES, ROLE_KEYS, PERMISSIONS, PERMISSION_KEYS } from '../../shared/roles'
export const roleColor = (role) => ({
  rose: 'bg-rose-50 text-rose-700', brand: 'bg-brand-50 text-brand-700', violet: 'bg-violet-50 text-violet-700',
  emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', ink: 'bg-ink-100 text-ink-600',
}[role?.color] || 'bg-ink-100 text-ink-600')
