import { useState } from 'react'
import { Plus, Shield, X, Lock, Search, Pencil } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { PERMISSIONS, WRITE_PERMISSIONS, WORKSPACE_PERMISSIONS } from '../../shared/roles'
import { roleColor } from '../data/auth'
import { Card, Empty } from '../components/ui'

const freshRole = () => ({ label: '', desc: '', permissions: [], enabled: true, readOnly: false })
export default function Users() {
  const { roles, current, saveRole, refreshRoles } = useAuth()
  const [query, setQuery] = useState(''), [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  if (current.id !== 'admin') return <Card className="p-10"><Empty icon={Lock} title="Access denied" hint="Only Administrator can manage roles." /></Card>
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const toggle = (permission) => setForm((f) => {
    let permissions = f.permissions.includes(permission) ? f.permissions.filter((p) => p !== permission) : [...f.permissions, permission]
    if (permission === 'workspace.view' && !permissions.includes(permission)) permissions = permissions.filter((p) => !WORKSPACE_PERMISSIONS.includes(p))
    if (permissions.includes(permission) && WORKSPACE_PERMISSIONS.includes(permission)) permissions = [...new Set([...permissions, 'workspace.view'])]
    return { ...f, permissions }
  })
  const save = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try { await saveRole(form); setForm(null) } catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  const groups = [...new Set(Object.values(PERMISSIONS).map((p) => p.group))].filter((g) => g !== 'Administration')
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold text-ink-900">Roles & Access</h1><p className="mt-1 text-sm text-ink-500">{roles.length} roles · shared permissions and restrictions</p></div>
      <button className="btn-primary" onClick={() => { setForm(freshRole()); setError('') }}><Plus size={16} /> Create role</button>
    </div>
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink-500">Administrator always has full access. Disabled roles cannot use the app.</p><div className="relative"><Search size={15} className="absolute left-3 top-3 text-ink-400" /><input aria-label="Search roles" className="input pl-9" placeholder="Search roles…" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roles.filter((r) => `${r.label} ${r.desc}`.toLowerCase().includes(query.toLowerCase())).map((role) => <div key={role.id} className="rounded-xl border border-ink-100 p-4">
          <div className="flex items-start justify-between gap-2"><span className={`chip ${roleColor(role)}`}><Shield size={13} /> {role.label}</span><button aria-label={`Edit ${role.label}`} className="btn-ghost p-1" disabled={role.id === 'admin'} onClick={() => { setForm({ ...role, permissions: [...role.permissions] }); setError('') }}>{role.id === 'admin' ? <Lock size={15} /> : <Pencil size={15} />}</button></div>
          <p className="mt-3 min-h-10 text-sm text-ink-500">{role.desc || 'Custom role'}</p>
          <p className="mt-3 text-xs font-semibold text-ink-600">{role.id === 'admin' ? 'All permissions · Protected' : `${role.permissions.length} permissions · ${!role.enabled ? 'Disabled' : role.readOnly ? 'Read-only' : 'Enabled'}`}</p>
        </div>)}
      </div>
    </Card>
    <p className="text-xs text-ink-400">The role picker previews access inside this protected workspace. Separate user sign-in and role assignments are needed before sharing with untrusted users.</p>
    {form && <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/40">
      <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="role-editor-title" className="flex h-full w-full max-w-2xl flex-col bg-white shadow-card-lg">
        <div className="flex items-center justify-between border-b px-6 py-4"><h2 id="role-editor-title" className="text-lg font-bold">{form.id ? 'Edit role' : 'Create role'}</h2><button type="button" aria-label="Close role editor" disabled={saving} onClick={() => setForm(null)}><X size={20} /></button></div>
        <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
          <label className="block"><span className="label">Role name</span><input className="input" required maxLength={60} value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Procurement Reviewer" /></label>
          <label className="block"><span className="label">Description</span><textarea className="input" maxLength={240} value={form.desc} onChange={(e) => set('desc', e.target.value)} /></label>
          <div className="rounded-xl bg-ink-50 p-4 space-y-3"><h3 className="font-semibold">Restrictions</h3><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Role enabled</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.readOnly} onChange={(e) => set('readOnly', e.target.checked)} /> Read-only: block all changes, submissions, approvals and AI calls</label></div>
          <div><h3 className="font-semibold">Permissions</h3><p className="mt-1 text-xs text-ink-500">Unchecked permissions are denied. Enable workspace access for internal RFQ pages. Read-only overrides write permissions.</p></div>
          {groups.map((group) => <fieldset key={group} className="rounded-xl border border-ink-100 p-4"><legend className="px-1 text-sm font-semibold">{group}</legend><div className="space-y-3">{Object.entries(PERMISSIONS).filter(([, p]) => p.group === group).map(([key, permission]) => <label key={key} className={`flex items-start gap-3 text-sm ${form.readOnly && WRITE_PERMISSIONS.includes(key) ? 'text-ink-400' : 'text-ink-700'}`}><input className="mt-0.5" type="checkbox" checked={form.permissions.includes(key)} onChange={() => toggle(key)} />{permission.label}</label>)}</div></fieldset>)}
          {error && <p role="alert" className="text-sm text-rose-700">{error} <button type="button" className="underline" onClick={async () => { await refreshRoles(); setForm(null) }}>Reload roles</button></p>}
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4"><button type="button" className="btn-outline" disabled={saving} onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" disabled={saving || !form.label.trim()}>{saving ? 'Saving…' : form.id ? 'Save changes' : 'Create role'}</button></div>
      </form>
    </div>}
  </div>
}
