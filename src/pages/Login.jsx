import { useState } from 'react'
import { ArrowRight, LockKeyhole, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BrandIcon from '../components/BrandIcon'

export default function Login({ error: sessionError = '' }) {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await login(username, password) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10">
    <div className="w-full max-w-md rounded-3xl border border-ink-100 bg-white p-8 shadow-card-lg sm:p-10">
      <div className="mb-8 flex items-center gap-3">
        <BrandIcon name="mark" size={48} />
        <div><p className="font-extrabold text-ink-900">OPRO</p><p className="text-xs text-ink-400">Procurement Suite</p></div>
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">Sign in</h1>
      <p className="mt-2 text-sm leading-6 text-ink-500">Use the username and password given to you by your administrator.</p>
      <form onSubmit={submit} className="mt-8 space-y-5" data-no-telemetry>
        <label className="block"><span className="label">Username</span><span className="relative block"><UserRound size={17} className="absolute left-3 top-3 text-ink-400" /><input className="input pl-10" autoComplete="username" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} /></span></label>
        <label className="block"><span className="label">Password</span><span className="relative block"><LockKeyhole size={17} className="absolute left-3 top-3 text-ink-400" /><input className="input pl-10" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></span></label>
        {(error || sessionError) && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error || sessionError}</p>}
        <button className="btn-primary w-full justify-center py-3" disabled={busy}>{busy ? 'Signing in…' : <>Sign in <ArrowRight size={17} /></>}</button>
      </form>
      <p className="mt-7 text-xs text-ink-400">Access is limited to accounts created by the administrator.</p>
    </div>
  </div>
}
