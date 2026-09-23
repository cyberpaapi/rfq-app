import { useEffect, useState } from 'react'
import { Copy, Eye, EyeOff, Lock, Pencil, Plus, Search, Shield, Trash2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { PERMISSIONS, PERMISSION_KEYS, WRITE_PERMISSIONS, WORKSPACE_PERMISSIONS } from '../../shared/roles'
import { api, Suppliers } from '../api/client'
import { roleColor } from '../data/auth'
import { Card, Empty } from '../components/ui'
import BrandIcon from '../components/BrandIcon'

const freshAccount = () => ({ label: '', username: '', password: '', desc: '', permissions: [], enabled: true, readOnly: false, supplierId: '' })
const selectablePermissions = PERMISSION_KEYS.filter((key) => key !== 'users.manage')
const makePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('')
}

export default function Users() {
  const { roles, current, saveRole, deleteRole } = useAuth()
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createdCredential, setCreatedCredential] = useState(null)
  const [passwordView, setPasswordView] = useState(null)
  useEffect(() => { if (current?.id === 'admin') Suppliers.list().then(setSuppliers).catch(() => {}) }, [current?.id])
  if (current?.id !== 'admin') return <Card className="p-10"><Empty icon="accounts" title="Access denied" hint="Only Administrator can manage accounts." /></Card>

  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))
  const toggle = (permission) => setForm((previous) => {
    let permissions = previous.permissions.includes(permission) ? previous.permissions.filter((p) => p !== permission) : [...previous.permissions, permission]
    if (permission === 'workspace.view' && !permissions.includes(permission)) permissions = permissions.filter((p) => !WORKSPACE_PERMISSIONS.includes(p))
    if (permissions.includes(permission) && WORKSPACE_PERMISSIONS.includes(permission)) permissions = [...new Set([...permissions, 'workspace.view'])]
    return { ...previous, permissions }
  })
  const selectAll = (checked) => setForm((previous) => ({
    ...previous,
    permissions: checked ? [...selectablePermissions] : [],
    supplierId: checked ? previous.supplierId : '',
  }))
  const validate = () => {
    if (!form.label.trim()) return 'Enter a role name.'
    if (!/^[a-z0-9][a-z0-9._@-]{2,79}$/.test(form.username.trim().toLowerCase())) return 'Enter a username of at least 3 letters, numbers, dots, dashes or @.'
    if ((!form.id || form.password) && (form.password.length < 12 || form.password.length > 128)) return 'Use a password of 12–128 characters.'
    if (roles.some((role) => role.id !== form.id && role.label.toLowerCase() === form.label.trim().toLowerCase())) return 'A role with this name already exists.'
    if (roles.some((role) => role.id !== form.id && role.username === form.username.trim().toLowerCase())) return 'That username is already in use.'
    if (form.permissions.some((permission) => ['portal.access', 'quote.submit'].includes(permission)) && !form.supplierId) return 'Select a supplier profile for portal permissions, or uncheck those permissions.'
    return ''
  }
  const save = async (event) => {
    event.preventDefault()
    const problem = validate()
    if (problem) { setError(problem); return }
    setSaving(true); setError('')
    try {
      const result = await saveRole(form)
      setNotice(`${result.label} (${result.username}) ${form.id ? 'updated' : 'created'}.`)
      setCreatedCredential(form.password ? { username: result.username, password: form.password } : null)
      setForm(null)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const remove = async (account) => {
    if (!window.confirm(`Delete ${account.label} (${account.username})? They will lose access immediately.`)) return
    try { await deleteRole(account.id); setNotice(`${account.label} deleted.`) }
    catch (e) { setNotice(e.message) }
  }
  const viewPassword = async (account) => {
    setPasswordView({ username: account.username, password: null, error: '' })
    try {
      const credential = await api.get(`/roles/${account.id}/password`)
      setPasswordView({ ...credential, error: '' })
    } catch (error) {
      setPasswordView({ username: account.username, password: null, error: error.message })
    }
  }
  const groups = [...new Set(Object.values(PERMISSIONS).map((permission) => permission.group))].filter((group) => group !== 'Administration')
  const portal = form?.permissions?.some((permission) => ['portal.access', 'quote.submit'].includes(permission))
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-extrabold text-ink-900"><BrandIcon name="accounts" size={36} /> Accounts & Access</h1><p className="mt-1 text-sm text-ink-500">Create a login, role, permissions and restrictions for each person.</p></div>
      <button className="btn-primary" onClick={() => { setForm(freshAccount()); setShowPassword(false); setError(''); setNotice(''); setCreatedCredential(null) }}><Plus size={16} /> Create account</button>
    </div>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {createdCredential && <Card className="flex flex-wrap items-center justify-between gap-3 border-emerald-200 bg-emerald-50 p-4"><div><p className="text-sm font-bold text-emerald-900">Account credentials ready</p><p className="mt-1 text-xs text-emerald-800">Share these privately with {createdCredential.username}. Administrator can view this password again from the account card.</p></div><div className="flex gap-2"><button className="btn-outline" onClick={() => navigator.clipboard.writeText(`Username: ${createdCredential.username}\nPassword: ${createdCredential.password}`)}><Copy size={15} /> Copy login</button><button className="btn-ghost" onClick={() => setCreatedCredential(null)}>Dismiss</button></div></Card>}
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink-500">Administrator is the only pre-created account. New accounts stay limited to their selected permissions.</p><div className="relative"><Search size={15} className="absolute left-3 top-3 text-ink-400" /><input aria-label="Search accounts" className="input pl-9" placeholder="Search account or role…" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roles.filter((role) => `${role.label} ${role.username} ${role.desc}`.toLowerCase().includes(query.toLowerCase())).map((role) => <div key={role.id} className="rounded-xl border border-ink-100 p-4">
          <div className="flex items-start justify-between gap-2"><span className={`chip ${roleColor(role)}`}><Shield size={13} /> {role.label}</span><div className="flex gap-1">{role.id !== 'admin' && <button type="button" aria-label={`View password for ${role.label}`} className="btn-ghost p-1" onClick={() => viewPassword(role)}><Eye size={15} /></button>}<button aria-label={`Edit ${role.label}`} className="btn-ghost p-1" disabled={role.id === 'admin'} onClick={() => { setForm({ ...role, password: '' }); setShowPassword(false); setError(''); setNotice('') }}>{role.id === 'admin' ? <Lock size={15} /> : <Pencil size={15} />}</button>{role.id !== 'admin' && <button aria-label={`Delete ${role.label}`} className="btn-ghost p-1 text-rose-600" onClick={() => remove(role)}><Trash2 size={15} /></button>}</div></div>
          <p className="mt-3 text-sm font-semibold text-ink-800">{role.username}</p>
          <p className="mt-1 min-h-10 text-sm text-ink-500">{role.desc || 'Custom role'}</p>
          <p className="mt-3 text-xs font-semibold text-ink-600">{role.id === 'admin' ? 'All permissions · Protected' : `${role.permissions.length} permissions · ${!role.enabled ? 'Disabled' : role.readOnly ? 'Read-only' : 'Enabled'}`}</p>
          {role.id !== 'admin' && !role.passwordAvailable && <p className="mt-1 text-xs text-amber-700">Reset password once to enable viewing.</p>}
        </div>)}
      </div>
    </Card>
    {passwordView && <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-4" onClick={() => setPasswordView(null)}><Card role="dialog" aria-modal="true" aria-label={`Password for ${passwordView.username}`} className="w-full max-w-md p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-ink-900">Password for {passwordView.username}</h2><button type="button" aria-label="Close password view" className="btn-ghost p-1" onClick={() => setPasswordView(null)}><X size={18} /></button></div>{passwordView.error ? <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{passwordView.error}</p> : passwordView.password === null ? <p className="mt-4 text-sm text-ink-500">Loading password…</p> : <><div className="mt-4 rounded-lg border border-ink-200 bg-ink-50 p-3 font-mono text-sm break-all text-ink-900">{passwordView.password}</div><p className="mt-3 text-xs text-ink-500">Keep this password private. Close this window when done.</p><button type="button" className="btn-primary mt-4" onClick={() => navigator.clipboard.writeText(`Username: ${passwordView.username}\nPassword: ${passwordView.password}`)}><Copy size={15} /> Copy login</button></>}</Card></div>}
    {form && <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/40">
      <form onSubmit={save} noValidate role="dialog" aria-modal="true" aria-labelledby="account-editor-title" className="flex h-full w-full max-w-2xl flex-col bg-white shadow-card-lg">
        <div className="flex items-center justify-between border-b px-6 py-4"><h2 id="account-editor-title" className="text-lg font-bold">{form.id ? 'Edit account' : 'Create account'}</h2><button type="button" aria-label="Close account editor" disabled={saving} onClick={() => setForm(null)}><X size={20} /></button></div>
        <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="label">Role name *</span><input className="input" required maxLength={60} value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Procurement Reviewer" /></label><label className="block"><span className="label">Login username *</span><input className="input" required maxLength={80} autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="e.g. reviewer01" /></label></div>
          <label className="block"><span className="label">Description</span><textarea className="input" maxLength={240} value={form.desc} onChange={(e) => set('desc', e.target.value)} /></label>
          <div><label className="label">{form.id ? 'New password (leave blank to keep current)' : 'Initial password *'}</label><div className="flex gap-2"><input className="input min-w-0 flex-1" type={showPassword ? 'text' : 'password'} minLength={12} maxLength={128} required={!form.id} autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} /><button type="button" className="btn-outline px-3" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button><button type="button" className="btn-outline" onClick={() => { set('password', makePassword()); setShowPassword(true) }}>Generate</button>{form.password && <button type="button" className="btn-outline px-3" aria-label="Copy password" onClick={() => navigator.clipboard.writeText(form.password)}><Copy size={17} /></button>}</div><p className="mt-1 text-xs text-ink-500">At least 12 characters. Administrator can view the saved password again from the account card.</p></div>
          <div className="space-y-3 rounded-xl bg-ink-50 p-4"><h3 className="font-semibold">Restrictions</h3><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Account enabled</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.readOnly} onChange={(e) => set('readOnly', e.target.checked)} /> Read-only: block changes, submissions, approvals and AI calls</label></div>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Permissions</h3><p className="mt-1 text-xs text-ink-500">Unchecked permissions are denied. Workspace access is required for internal RFQ pages. Read-only overrides write permissions.</p></div><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700"><input type="checkbox" checked={selectablePermissions.every((key) => form.permissions.includes(key))} onChange={(event) => selectAll(event.target.checked)} /> Select all permissions</label></div>
          {groups.map((group) => <fieldset key={group} className="rounded-xl border border-ink-100 p-4"><legend className="px-1 text-sm font-semibold">{group}</legend><div className="space-y-3">{Object.entries(PERMISSIONS).filter(([, permission]) => permission.group === group).map(([key, permission]) => <label key={key} className={`flex items-start gap-3 text-sm ${form.readOnly && WRITE_PERMISSIONS.includes(key) ? 'text-ink-400' : 'text-ink-700'}`}><input className="mt-0.5" type="checkbox" checked={form.permissions.includes(key)} onChange={() => toggle(key)} />{permission.label}</label>)}</div></fieldset>)}
          {portal && <label className="block"><span className="label">Supplier profile *</span><select className="input" value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)} required><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><p className="mt-1 text-xs text-ink-500">This login can submit quotes only for its linked supplier.</p></label>}
        </div>
        <div className="border-t px-6 py-4">{error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-outline" disabled={saving} onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save changes' : 'Create account'}</button></div></div>
      </form>
    </div>}
  </div>
}
