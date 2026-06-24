import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { seedUsers, ROLES, ROLE_KEYS, PERMISSION_KEYS } from '../data/auth'
import { setActor } from '../api/client'

const AuthContext = createContext(null)
const LS_USERS = 'rfq.users'
const LS_CURRENT = 'rfq.currentUser'
const LS_PERMS = 'rfq.rolePerms'

const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

// Build the editable permission map from the static role definitions.
const seedPerms = () =>
  Object.fromEntries(
    ROLE_KEYS.map((rk) => [rk, ROLES[rk].permissions === '*' ? '*' : [...ROLES[rk].permissions]]),
  )

export function AuthProvider({ children }) {
  const [users, setUsers] = useState(() => load(LS_USERS, seedUsers))
  const [currentId, setCurrentId] = useState(() => load(LS_CURRENT, 'U-001'))
  const [perms, setPerms] = useState(() => load(LS_PERMS, seedPerms()))

  useEffect(() => { localStorage.setItem(LS_USERS, JSON.stringify(users)) }, [users])
  useEffect(() => { localStorage.setItem(LS_CURRENT, JSON.stringify(currentId)) }, [currentId])
  useEffect(() => { localStorage.setItem(LS_PERMS, JSON.stringify(perms)) }, [perms])

  const current = useMemo(
    () => users.find((u) => u.id === currentId) || users[0],
    [users, currentId],
  )

  // Keep the API client's audit actor in sync with the active identity.
  useEffect(() => { setActor(current?.name) }, [current])

  // Permission lookups now use the editable map.
  const roleCan = (roleKey, perm) => {
    const p = perms[roleKey]
    if (!p) return false
    return p === '*' || p.includes(perm)
  }
  const can = (perm) => roleCan(current?.role, perm)

  const togglePermission = (roleKey, perm) => {
    setPerms((prev) => {
      const p = prev[roleKey]
      if (p === '*') return prev // admin stays all-access
      const has = p.includes(perm)
      return { ...prev, [roleKey]: has ? p.filter((x) => x !== perm) : [...p, perm] }
    })
  }

  const addUser = (data) => {
    const id = 'U-' + String(users.length + 1).padStart(3, '0')
    const user = { id, status: 'invited', lastActive: '—', dept: '', linkedSupplier: null, password: '', ...data }
    setUsers((prev) => [...prev, user])
    return user
  }

  const updateUser = (id, patch) =>
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))

  const removeUser = (id) => setUsers((prev) => prev.filter((u) => u.id !== id))

  const switchTo = (id) => setCurrentId(id)

  const resetUsers = () => {
    setUsers(seedUsers)
    setCurrentId('U-001')
    setPerms(seedPerms())
  }

  const value = {
    users, current, perms, can, roleCan, togglePermission,
    addUser, updateUser, removeUser, switchTo, resetUsers,
    permissionKeys: PERMISSION_KEYS,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
