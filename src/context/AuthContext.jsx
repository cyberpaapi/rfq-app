import { createContext, useContext, useEffect, useState } from 'react'
import { roleCan } from '../../shared/roles'
import { api, setActiveRole } from '../api/client'

const AuthContext = createContext(null)
const initialRole = () => {
  const saved = localStorage.getItem('rfq.activeRole')
  if (saved) return saved
  const legacy = JSON.parse(localStorage.getItem('rfq.currentUser') || 'null')
  return ({ 'U-001': 'buyer', 'U-002': 'buyer', 'U-003': 'hod', 'U-004': 'finance', 'U-005': 'admin', 'U-006': 'auditor', 'U-007': 'supplier', 'U-008': 'supplier' })[legacy] || 'admin'
}
export function AuthProvider({ children }) {
  const [roleId, setRoleId] = useState(() => { let id; try { id = initialRole() } catch { id = 'admin' }; setActiveRole(id); return id })
  const [roles, setRoles] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const refreshRoles = async () => {
    try { const value = await api.get('/roles'); setRoles(value); setLoaded(true); setError('') }
    catch (e) { setError(e.message) }
  }
  useEffect(() => {
    for (const key of ['rfq.users', 'rfq.currentUser', 'rfq.rolePerms']) localStorage.removeItem(key)
    refreshRoles()
    const refresh = () => { refreshRoles() }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  const current = roles.find((r) => r.id === roleId) || { id: roleId, label: 'Unavailable role', enabled: false, permissions: [] }
  useEffect(() => {
    localStorage.setItem('rfq.activeRole', roleId)
    localStorage.setItem('rfq.activeRoleLabel', current.label)
    setActiveRole(roleId, current.label)
  }, [roleId, current.label])
  const switchTo = (id) => {
    const role = roles.find((r) => r.id === id && r.enabled)
    if (!role) return
    setActiveRole(id, role.label); localStorage.setItem('rfq.activeRole', id); setRoleId(id)
  }
  const saveRole = async (form) => {
    if (current.id !== 'admin') throw new Error('Only Administrator can manage roles.')
    const role = form.id ? await api.put(`/roles/${form.id}`, form) : await api.post('/roles', form)
    setRoles((previous) => form.id ? previous.map((r) => r.id === role.id ? role : r) : [...previous, role])
    return role
  }
  const value = { roles, current, can: (permission) => roleCan(current, permission), switchTo, saveRole, refreshRoles }
  if (!loaded) return <div className="p-10 text-sm text-ink-600">{error || 'Loading roles…'}{error && <button className="btn-outline ml-3" onClick={refreshRoles}>Retry</button>}</div>
  return <AuthContext.Provider value={value}><div key={`${current.id}:${current.version}:${current.enabled}`}>{children}</div></AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
