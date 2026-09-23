import { createContext, useContext, useEffect, useState } from 'react'
import { roleCan } from '../../shared/roles'
import { api, Auth } from '../api/client'
import Login from '../pages/Login'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [current, setCurrent] = useState(null)
  const [roles, setRoles] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshRoles = async () => {
    if (current?.id !== 'admin') return
    const [roleList, userList] = await Promise.all([api.get('/roles'), api.get('/users')])
    setRoles(roleList)
    setUsers(userList)
    return roleList
  }
  const refreshSession = async () => {
    try {
      const value = await Auth.me()
      setCurrent(value.account)
      setError('')
    } catch (e) {
      if (e.status !== 401) setError(e.message)
      setCurrent(null)
      setRoles([])
      setUsers([])
    } finally { setLoading(false) }
  }
  useEffect(() => {
    for (const key of ['rfq.activeRole', 'rfq.activeRoleLabel', 'rfq.currentUser', 'rfq.users', 'rfq.rolePerms', 'rfq.supplierSession']) localStorage.removeItem(key)
    refreshSession()
    const onFocus = () => { refreshSession() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  useEffect(() => { if (current?.id === 'admin') refreshRoles().catch((e) => setError(e.message)) }, [current?.id])

  const login = async (username, password) => {
    const result = await Auth.login(username, password)
    setCurrent(result.account)
    setError('')
  }
  const logout = async () => {
    try { await Auth.logout() } finally { setCurrent(null); setRoles([]); setUsers([]) }
  }
  const saveRole = async (form) => {
    if (current?.id !== 'admin') throw new Error('Only Administrator can manage accounts.')
    const role = form.id ? await api.put(`/roles/${form.id}`, form) : await api.post('/roles', form)
    setRoles((previous) => form.id ? previous.map((r) => r.id === role.id ? role : r) : [...previous, role])
    return role
  }
  const deleteRole = async (id) => {
    if (current?.id !== 'admin') throw new Error('Only Administrator can manage accounts.')
    await api.del(`/roles/${id}`)
    setRoles((previous) => previous.filter((role) => role.id !== id))
  }
  const saveUser = async (form) => {
    if (current?.id !== 'admin') throw new Error('Only Administrator can manage users.')
    const user = form.id ? await api.put(`/users/${form.id}`, form) : await api.post('/users', form)
    setUsers((previous) => form.id ? previous.map((item) => item.id === user.id ? user : item) : [...previous, user])
    return user
  }
  const deleteUser = async (id) => {
    if (current?.id !== 'admin') throw new Error('Only Administrator can manage users.')
    await api.del(`/users/${id}`)
    setUsers((previous) => previous.filter((user) => user.id !== id))
  }
  const value = { current, roles, users, can: (permission) => roleCan(current, permission), login, logout,
    saveRole, deleteRole, saveUser, deleteUser, refreshRoles, refreshSession }
  if (loading) return <div className="p-10 text-sm text-ink-600">Checking your session…</div>
  return <AuthContext.Provider value={value}>{current ? children : <Login error={error} />}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
