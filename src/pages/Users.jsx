import { useEffect, useState } from 'react'
import {
  UserPlus, Shield, Check, X, Trash2, Search, KeyRound, RotateCcw, Lock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ROLES, ROLE_KEYS, PERMISSIONS, PERMISSION_KEYS, roleColor } from '../data/auth'
import { Suppliers } from '../api/client'
import { Card, SectionTitle, Avatar, Empty } from '../components/ui'

function RoleBadge({ role }) {
  return <span className={`chip ${roleColor(role)}`}>{ROLES[role]?.label || role}</span>
}

const genPassword = () => Math.random().toString(36).slice(2, 6) + '-' + Math.random().toString(36).slice(2, 6)

function CreateAccountDrawer({ open, onClose }) {
  const { addUser } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', role: 'buyer', dept: '', linkedSupplier: '', password: genPassword() })
  const [suppliers, setSuppliers] = useState([])
  useEffect(() => { if (open) Suppliers.list().then(setSuppliers).catch(() => setSuppliers([])) }, [open])
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  if (!open) return null

  const isSupplier = form.role === 'supplier'
  const valid = form.name && /.+@.+\..+/.test(form.email) && form.password.length >= 4 && (!isSupplier || form.linkedSupplier)

  const submit = () => {
    addUser({
      name: form.name,
      email: form.email,
      role: form.role,
      dept: isSupplier ? '—' : form.dept || '—',
      linkedSupplier: isSupplier ? form.linkedSupplier : null,
      password: form.password,
      status: 'active',
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-card-lg animate-slide-in">
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink-900">Create Account</h2>
            <p className="text-xs text-ink-400">An invite email is sent on creation.</p>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700"><X size={20} /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
          <div>
            <label className="label">Full name *</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="jane@opro.com" />
          </div>
          <div>
            <label className="label">Role *</label>
            <div className="grid grid-cols-1 gap-2">
              {ROLE_KEYS.map((rk) => (
                <button key={rk} onClick={() => set('role', rk)}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                    form.role === rk ? 'border-brand-400 bg-brand-50/60 ring-2 ring-brand-500/10' : 'border-ink-100 hover:bg-ink-50'
                  }`}>
                  <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${roleColor(rk)}`}><Shield size={14} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-800">{ROLES[rk].label}</p>
                    <p className="text-xs text-ink-400">{ROLES[rk].desc}</p>
                  </div>
                  <div className={`mt-0.5 grid h-5 w-5 place-items-center rounded-md border ${form.role === rk ? 'border-brand-500 bg-brand-600 text-white' : 'border-ink-300'}`}>
                    {form.role === rk && <Check size={13} />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {isSupplier ? (
            <div>
              <label className="label">Linked supplier * <span className="font-normal lowercase text-ink-400">(data isolation)</span></label>
              <select className="input" value={form.linkedSupplier} onChange={(e) => set('linkedSupplier', e.target.value)}>
                <option value="">Select supplier…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-400"><Lock size={12} /> This account will only see RFQs assigned to the linked supplier.</p>
            </div>
          ) : (
            <div>
              <label className="label">Department</label>
              <input className="input" value={form.dept} onChange={(e) => set('dept', e.target.value)} placeholder="Procurement" />
            </div>
          )}

          <div>
            <label className="label">Initial password *</label>
            <div className="flex gap-2">
              <input className="input font-mono" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="min 4 chars" />
              <button type="button" className="btn-outline shrink-0" onClick={() => set('password', genPassword())} title="Generate">
                <KeyRound size={15} /> Generate
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink-400">Shared with the user securely; they should change it on first sign-in.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-6 py-4">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!valid} onClick={submit}><UserPlus size={16} /> Create account</button>
        </div>
      </aside>
    </div>
  )
}

export default function Users() {
  const { users, current, can, roleCan, togglePermission, updateUser, removeUser, resetUsers } = useAuth()
  const [q, setQ] = useState('')
  const [drawer, setDrawer] = useState(false)

  const resetPassword = (u) => {
    const pw = prompt(`Set a new password for ${u.name}:`, genPassword())
    if (pw && pw.length >= 4) { updateUser(u.id, { password: pw }); alert(`Password updated for ${u.name}.`) }
  }

  if (!can('users.manage')) {
    return (
      <Card className="p-10">
        <Empty icon={Lock} title="Access denied" hint={`Your role (${ROLES[current.role]?.label}) cannot manage users.`} />
      </Card>
    )
  }

  const list = users.filter(
    (u) => !q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Users &amp; Access</h1>
          <p className="mt-1 text-sm text-ink-500">{users.length} accounts · {ROLE_KEYS.length} roles · role-based permissions</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={resetUsers}><RotateCcw size={16} /> Reset demo</button>
          <button className="btn-primary" onClick={() => setDrawer(true)}><UserPlus size={16} /> Create Account</button>
        </div>
      </div>

      {/* Accounts table */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-bold text-ink-900">Accounts</h2>
          <div className="relative w-64">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="input py-2 pl-9" placeholder="Search name or email…" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Last active</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {list.map((u) => (
                <tr key={u.id} className="hover:bg-ink-50/60">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} size={34} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-semibold text-ink-800">
                          {u.name}
                          {u.id === current.id && <span className="chip bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700">You</span>}
                        </p>
                        <p className="text-xs text-ink-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-ink-600">
                    {u.dept}
                    {u.linkedSupplier && <span className="ml-1.5 text-xs text-ink-400">· {u.linkedSupplier}</span>}
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => updateUser(u.id, { role: e.target.value })}
                      className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs font-semibold text-ink-700 outline-none focus:border-brand-400"
                    >
                      {ROLE_KEYS.map((rk) => <option key={rk} value={rk}>{ROLES[rk].label}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => updateUser(u.id, { status: u.status === 'active' ? 'disabled' : 'active' })}
                      className={`chip ${u.status === 'active' ? 'bg-emerald-50 text-emerald-700' : u.status === 'invited' ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-500'}`}
                    >
                      {u.status}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-ink-500">{u.lastActive}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Set / reset password" onClick={() => resetPassword(u)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><KeyRound size={15} /></button>
                      <button
                        title="Delete" disabled={u.id === current.id}
                        onClick={() => removeUser(u.id)}
                        className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Permission matrix */}
      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4">
          <SectionTitle>Role Permission Matrix</SectionTitle>
          <p className="-mt-3 text-xs text-ink-400">Click any cell to grant or revoke a permission. Administrator is locked to full access.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="px-5 py-3">Permission</th>
                {ROLE_KEYS.map((rk) => (
                  <th key={rk} className="px-3 py-3 text-center">{ROLES[rk].label.split(' ')[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {PERMISSION_KEYS.map((pk) => (
                <tr key={pk} className="hover:bg-ink-50/60">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-ink-700">{PERMISSIONS[pk].label}</p>
                    <p className="text-xs text-ink-400">{PERMISSIONS[pk].group}</p>
                  </td>
                  {ROLE_KEYS.map((rk) => {
                    const on = roleCan(rk, pk)
                    const locked = rk === 'admin'
                    return (
                      <td key={rk} className="px-3 py-2.5 text-center">
                        <button
                          disabled={locked}
                          onClick={() => togglePermission(rk, pk)}
                          title={locked ? 'Administrator always has full access' : on ? 'Revoke' : 'Grant'}
                          className={`mx-auto grid h-7 w-7 place-items-center rounded-lg transition ${
                            on ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-ink-50 text-ink-300 hover:bg-ink-100'
                          } ${locked ? 'cursor-not-allowed opacity-70' : ''}`}
                        >
                          {on ? <Check size={15} /> : <X size={13} />}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <CreateAccountDrawer open={drawer} onClose={() => setDrawer(false)} />
    </div>
  )
}
