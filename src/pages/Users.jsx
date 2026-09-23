import { useEffect, useState } from 'react'
import { Copy, Eye, EyeOff, Lock, Pencil, Plus, Search, Shield, Trash2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { PERMISSIONS, PERMISSION_KEYS, WRITE_PERMISSIONS, WORKSPACE_PERMISSIONS } from '../../shared/roles'
import { api, Suppliers } from '../api/client'
import { roleColor } from '../data/auth'
import { Card, Empty } from '../components/ui'
import BrandIcon from '../components/BrandIcon'

const freshRole = () => ({ label: '', desc: '', permissions: [], enabled: true, readOnly: false })
const freshUser = () => ({ username: '', password: '', roleId: '', enabled: true, readOnly: false, supplierId: '' })
const selectablePermissions = PERMISSION_KEYS.filter((key) => key !== 'users.manage')
const makePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('')
}

export default function Users() {
  const { roles, users, current, saveRole, deleteRole, saveUser, deleteUser } = useAuth()
  const [query, setQuery] = useState('')
  const [roleForm, setRoleForm] = useState(null)
  const [userForm, setUserForm] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createdCredential, setCreatedCredential] = useState(null)
  const [passwordView, setPasswordView] = useState(null)
  useEffect(() => { if (current?.id === 'admin') Suppliers.list().then(setSuppliers).catch(() => {}) }, [current?.id])
  if (current?.id !== 'admin') return <Card className="p-10"><Empty icon="accounts" title="Access denied" hint="Only Administrator can manage roles and users." /></Card>

  const customRoles = roles.filter((role) => role.id !== 'admin')
  const groups = [...new Set(Object.values(PERMISSIONS).map((permission) => permission.group))].filter((group) => group !== 'Administration')
  const selectedRole = roles.find((role) => role.id === userForm?.roleId)
  const needsSupplier = selectedRole?.permissions.some((permission) => ['portal.access', 'quote.submit'].includes(permission))
  const openRole = (role = null) => { setRoleForm(role ? { ...role } : freshRole()); setUserForm(null); setError(''); setNotice('') }
  const openUser = (user = null) => { setUserForm(user ? { ...user, password: '' } : { ...freshUser(), roleId: customRoles[0]?.id || '' }); setRoleForm(null); setShowPassword(false); setError(''); setNotice(''); setCreatedCredential(null) }
  const setRole = (key, value) => setRoleForm((previous) => ({ ...previous, [key]: value }))
  const setUser = (key, value) => setUserForm((previous) => ({ ...previous, [key]: value }))
  const togglePermission = (permission) => setRoleForm((previous) => {
    let permissions = previous.permissions.includes(permission) ? previous.permissions.filter((key) => key !== permission) : [...previous.permissions, permission]
    if (permission === 'workspace.view' && !permissions.includes(permission)) permissions = permissions.filter((key) => !WORKSPACE_PERMISSIONS.includes(key))
    if (permissions.includes(permission) && WORKSPACE_PERMISSIONS.includes(permission)) permissions = [...new Set([...permissions, 'workspace.view'])]
    return { ...previous, permissions }
  })
  const selectAll = (checked) => setRoleForm((previous) => ({ ...previous, permissions: checked ? [...selectablePermissions] : [] }))
  const saveRoleForm = async (event) => {
    event.preventDefault()
    const label = roleForm.label.trim()
    if (!label) { setError('Enter a role name.'); return }
    if (roles.some((role) => role.id !== roleForm.id && role.label.toLowerCase() === label.toLowerCase())) { setError('A role with this name already exists.'); return }
    setSaving(true); setError('')
    try {
      const result = await saveRole(roleForm)
      setNotice(`${result.label} ${roleForm.id ? 'updated' : 'created'}. Assign users to this role below.`)
      setRoleForm(null)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const saveUserForm = async (event) => {
    event.preventDefault()
    const username = userForm.username.trim().toLowerCase()
    if (!username) { setError('Enter a login username.'); return }
    if (users.some((user) => user.id !== userForm.id && user.username === username)) { setError('That username is already in use.'); return }
    if (!selectedRole || selectedRole.id === 'admin') { setError('Select a role for this user.'); return }
    if ((!userForm.id || userForm.password) && userForm.password.length < 12) { setError('Use a password of at least 12 characters.'); return }
    if (needsSupplier && !userForm.supplierId) { setError('Select a supplier profile for this role.'); return }
    setSaving(true); setError('')
    try {
      const result = await saveUser(userForm)
      setNotice(`${result.username} ${userForm.id ? 'updated' : 'created'} in ${selectedRole.label}.`)
      setCreatedCredential(userForm.password ? { username: result.username, password: userForm.password } : null)
      setUserForm(null)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const removeRole = async (role) => {
    if (!window.confirm(`Delete the ${role.label} role?`)) return
    try { await deleteRole(role.id); setNotice(`${role.label} deleted.`) }
    catch (e) { setNotice(e.message) }
  }
  const removeUser = async (user) => {
    if (!window.confirm(`Delete ${user.username}? They will lose access immediately.`)) return
    try { await deleteUser(user.id); setNotice(`${user.username} deleted.`) }
    catch (e) { setNotice(e.message) }
  }
  const viewPassword = async (user) => {
    setPasswordView({ username: user.username, password: null, error: '' })
    try { setPasswordView({ ...(await api.get(`/users/${user.id}/password`)), error: '' }) }
    catch (e) { setPasswordView({ username: user.username, password: null, error: e.message }) }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-extrabold text-ink-900"><BrandIcon name="accounts" size={36} /> Roles & Users</h1><p className="mt-1 text-sm text-ink-500">Define permissions once in a role, then assign users their own logins.</p></div>
      <div className="relative"><Search size={15} className="absolute left-3 top-3 text-ink-400" /><input aria-label="Search roles and users" className="input pl-9" placeholder="Search roles or users…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
    </div>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {createdCredential && <Card className="flex flex-wrap items-center justify-between gap-3 border-emerald-200 bg-emerald-50 p-4"><div><p className="text-sm font-bold text-emerald-900">User credentials ready</p><p className="mt-1 text-xs text-emerald-800">Share these privately with {createdCredential.username}. Administrator can view the password again from the user card.</p></div><div className="flex gap-2"><button className="btn-outline" onClick={() => navigator.clipboard.writeText(`Username: ${createdCredential.username}\nPassword: ${createdCredential.password}`)}><Copy size={15} /> Copy login</button><button className="btn-ghost" onClick={() => setCreatedCredential(null)}>Dismiss</button></div></Card>}

    <section>
      <div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-bold text-ink-900">Roles</h2><p className="text-sm text-ink-500">Permissions and restrictions are shared by every assigned user.</p></div><button className="btn-primary" onClick={() => openRole()}><Plus size={16} /> Create role</button></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roles.filter((role) => `${role.label} ${role.desc}`.toLowerCase().includes(query.toLowerCase())).map((role) => <Card key={role.id} className="p-4">
          <div className="flex items-start justify-between gap-2"><span className={`chip ${roleColor(role)}`}><Shield size={13} /> {role.label}</span><div className="flex gap-1"><button type="button" aria-label={`Edit role ${role.label}`} className="btn-ghost p-1" disabled={role.id === 'admin'} onClick={() => openRole(role)}>{role.id === 'admin' ? <Lock size={15} /> : <Pencil size={15} />}</button>{role.id !== 'admin' && <button type="button" aria-label={`Delete role ${role.label}`} className="btn-ghost p-1 text-rose-600" onClick={() => removeRole(role)}><Trash2 size={15} /></button>}</div></div>
          <p className="mt-3 min-h-10 text-sm text-ink-500">{role.desc || 'Custom role'}</p>
          <p className="mt-3 text-xs font-semibold text-ink-600">{role.id === 'admin' ? 'All permissions · Protected' : `${role.permissions.length} permissions · ${!role.enabled ? 'Disabled' : role.readOnly ? 'Read-only' : 'Enabled'}`} · {users.filter((user) => user.roleId === role.id).length} users</p>
        </Card>)}
      </div>
    </section>

    <section>
      <div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-bold text-ink-900">Users</h2><p className="text-sm text-ink-500">Each user has a separate username and password, and inherits their role’s permissions.</p></div><button className="btn-primary" disabled={!customRoles.length} title={!customRoles.length ? 'Create a role first' : ''} onClick={() => openUser()}><Plus size={16} /> Add user</button></div>
      {!customRoles.length && <p className="mb-3 text-sm text-amber-700">Create a role before adding users.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {users.filter((user) => `${user.username} ${roles.find((role) => role.id === user.roleId)?.label || ''}`.toLowerCase().includes(query.toLowerCase())).map((user) => <Card key={user.id} className="p-4">
          <div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-ink-800">{user.username}</p><p className="mt-1 text-sm text-ink-500">{roles.find((role) => role.id === user.roleId)?.label || 'Missing role'}</p></div><div className="flex gap-1">{user.id !== 'admin' && <button type="button" aria-label={`View password for ${user.username}`} className="btn-ghost p-1" onClick={() => viewPassword(user)}><Eye size={15} /></button>}<button type="button" aria-label={`Edit user ${user.username}`} className="btn-ghost p-1" disabled={user.id === 'admin'} onClick={() => openUser(user)}>{user.id === 'admin' ? <Lock size={15} /> : <Pencil size={15} />}</button>{user.id !== 'admin' && <button type="button" aria-label={`Delete user ${user.username}`} className="btn-ghost p-1 text-rose-600" onClick={() => removeUser(user)}><Trash2 size={15} /></button>}</div></div>
          <p className="mt-3 text-xs font-semibold text-ink-600">{user.id === 'admin' ? 'Protected' : !user.enabled ? 'Disabled' : user.readOnly ? 'Read-only' : 'Enabled'}</p>
          {user.id !== 'admin' && !user.passwordAvailable && <p className="mt-1 text-xs text-amber-700">Reset password once to enable viewing.</p>}
        </Card>)}
      </div>
    </section>

    {passwordView && <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-4" onClick={() => setPasswordView(null)}><Card role="dialog" aria-modal="true" aria-label={`Password for ${passwordView.username}`} className="w-full max-w-md p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-ink-900">Password for {passwordView.username}</h2><button type="button" aria-label="Close password view" className="btn-ghost p-1" onClick={() => setPasswordView(null)}><X size={18} /></button></div>{passwordView.error ? <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{passwordView.error}</p> : passwordView.password === null ? <p className="mt-4 text-sm text-ink-500">Loading password…</p> : <><div className="mt-4 break-all rounded-lg border border-ink-200 bg-ink-50 p-3 font-mono text-sm text-ink-900">{passwordView.password}</div><p className="mt-3 text-xs text-ink-500">Keep this password private. Close this window when done.</p><button type="button" className="btn-primary mt-4" onClick={() => navigator.clipboard.writeText(`Username: ${passwordView.username}\nPassword: ${passwordView.password}`)}><Copy size={15} /> Copy login</button></>}</Card></div>}

    {roleForm && <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/40"><form onSubmit={saveRoleForm} noValidate role="dialog" aria-modal="true" aria-labelledby="role-editor-title" className="flex h-full w-full max-w-2xl flex-col bg-white shadow-card-lg"><div className="flex items-center justify-between border-b px-6 py-4"><h2 id="role-editor-title" className="text-lg font-bold">{roleForm.id ? 'Edit role' : 'Create role'}</h2><button type="button" aria-label="Close role editor" disabled={saving} onClick={() => setRoleForm(null)}><X size={20} /></button></div><div className="flex-1 space-y-5 overflow-auto px-6 py-5">
      <label className="block"><span className="label">Role name *</span><input className="input" value={roleForm.label} onChange={(e) => setRole('label', e.target.value)} placeholder="e.g. Procurement Reviewer" /></label>
      <label className="block"><span className="label">Description</span><textarea className="input" maxLength={240} value={roleForm.desc} onChange={(e) => setRole('desc', e.target.value)} /></label>
      <div className="space-y-3 rounded-xl bg-ink-50 p-4"><h3 className="font-semibold">Restrictions</h3><label className="flex gap-2 text-sm"><input type="checkbox" checked={roleForm.enabled} onChange={(e) => setRole('enabled', e.target.checked)} /> Role enabled</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={roleForm.readOnly} onChange={(e) => setRole('readOnly', e.target.checked)} /> Read-only for every user in this role</label></div>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Permissions</h3><p className="mt-1 text-xs text-ink-500">Changes apply to all assigned users. Workspace access is required for internal RFQ pages.</p></div><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700"><input type="checkbox" checked={selectablePermissions.every((key) => roleForm.permissions.includes(key))} onChange={(e) => selectAll(e.target.checked)} /> Select all permissions</label></div>
      {groups.map((group) => <fieldset key={group} className="rounded-xl border border-ink-100 p-4"><legend className="px-1 text-sm font-semibold">{group}</legend><div className="space-y-3">{Object.entries(PERMISSIONS).filter(([, permission]) => permission.group === group).map(([key, permission]) => <label key={key} className={`flex items-start gap-3 text-sm ${roleForm.readOnly && WRITE_PERMISSIONS.includes(key) ? 'text-ink-400' : 'text-ink-700'}`}><input className="mt-0.5" type="checkbox" checked={roleForm.permissions.includes(key)} onChange={() => togglePermission(key)} />{permission.label}</label>)}</div></fieldset>)}
    </div><div className="border-t px-6 py-4">{error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-outline" disabled={saving} onClick={() => setRoleForm(null)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : roleForm.id ? 'Save role' : 'Create role'}</button></div></div></form></div>}

    {userForm && <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/40"><form onSubmit={saveUserForm} noValidate role="dialog" aria-modal="true" aria-labelledby="user-editor-title" className="flex h-full w-full max-w-xl flex-col bg-white shadow-card-lg"><div className="flex items-center justify-between border-b px-6 py-4"><h2 id="user-editor-title" className="text-lg font-bold">{userForm.id ? 'Edit user' : 'Add user'}</h2><button type="button" aria-label="Close user editor" disabled={saving} onClick={() => setUserForm(null)}><X size={20} /></button></div><div className="flex-1 space-y-5 overflow-auto px-6 py-5">
      <label className="block"><span className="label">Login username *</span><input className="input" maxLength={80} autoComplete="off" value={userForm.username} onChange={(e) => setUser('username', e.target.value)} placeholder="Any name or identifier" /></label>
      <label className="block"><span className="label">Role *</span><select className="input" value={userForm.roleId} onChange={(e) => setUser('roleId', e.target.value)}><option value="">Select role</option>{customRoles.map((role) => <option key={role.id} value={role.id}>{role.label}{!role.enabled ? ' (disabled)' : ''}</option>)}</select></label>
      {selectedRole && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">This user inherits {selectedRole.permissions.length} permissions from <strong>{selectedRole.label}</strong>. Edit the role to update all its users.</p>}
      <div><label className="label">{userForm.id ? 'New password (leave blank to keep current)' : 'Initial password *'}</label><div className="flex gap-2"><input className="input min-w-0 flex-1" type={showPassword ? 'text' : 'password'} minLength={12} maxLength={128} autoComplete="new-password" value={userForm.password} onChange={(e) => setUser('password', e.target.value)} /><button type="button" className="btn-outline px-3" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button><button type="button" className="btn-outline" onClick={() => { setUser('password', makePassword()); setShowPassword(true) }}>Generate</button></div><p className="mt-1 text-xs text-ink-500">At least 12 characters. Administrator can view the saved password again from the user card.</p></div>
      <div className="space-y-3 rounded-xl bg-ink-50 p-4"><h3 className="font-semibold">User restrictions</h3><label className="flex gap-2 text-sm"><input type="checkbox" checked={userForm.enabled} onChange={(e) => setUser('enabled', e.target.checked)} /> User enabled</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={userForm.readOnly} onChange={(e) => setUser('readOnly', e.target.checked)} /> Read-only for this user</label></div>
      <label className="block"><span className="label">Supplier profile {needsSupplier ? '*' : '(optional)'}</span><select className="input" value={userForm.supplierId} onChange={(e) => setUser('supplierId', e.target.value)}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><p className="mt-1 text-xs text-ink-500">Required for supplier portal roles. A linked user can submit quotes only for this supplier.</p></label>
    </div><div className="border-t px-6 py-4">{error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-outline" disabled={saving} onClick={() => setUserForm(null)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : userForm.id ? 'Save user' : 'Add user'}</button></div></div></form></div>}
  </div>
}
