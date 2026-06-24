import { useEffect, useState } from 'react'
import { ShieldCheck, Search, Clock } from 'lucide-react'
import { Audit as AuditApi } from '../api/client'
import { Card, Avatar, Spinner, Empty } from '../components/ui'

const fmtTime = (ts) => new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Audit() {
  const [q, setQ] = useState('')
  const [log, setLog] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => AuditApi(q ? { q } : undefined).then(setLog), q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Audit & Compliance</h1>
        <p className="mt-1 text-sm text-ink-500">Immutable trail of every action — user, time, old & new value.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck size={20} /></div>
            <div>
              <p className="text-sm text-ink-500">Compliance status</p>
              <p className="font-bold text-emerald-600">All checks passing</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-ink-600">
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Role-based access enforced</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Supplier data isolated</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Every action logged with old → new</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Approval authorization logged</li>
          </ul>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink-900">Activity Log</h2>
            <div className="relative w-56">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} className="input py-2 pl-9" placeholder="Search log…" />
            </div>
          </div>

          {!log ? (
            <Spinner />
          ) : log.length === 0 ? (
            <Empty icon={ShieldCheck} title="No audit entries" hint="Actions you take in the app will appear here." />
          ) : (
            <div className="space-y-1">
              {log.map((a) => (
                <div key={a.id} className="flex gap-3 rounded-xl px-2 py-3 hover:bg-ink-50">
                  <Avatar name={a.user === 'System' ? 'SY' : a.user} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-800">
                      <span className="font-semibold">{a.user}</span> · {a.action}
                      {a.rfqId && <span className="ml-1.5 font-mono text-xs text-brand-600">{a.rfqId}</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                      <span className="flex items-center gap-1"><Clock size={12} />{fmtTime(a.at)}</span>
                      {a.field && <><span className="text-ink-300">·</span><span>{a.field}:</span></>}
                      {a.old !== '' && a.old !== '—' && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-600 line-through">{a.old}</span>}
                      {a.value && <><span className="text-ink-300">→</span><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{a.value}</span></>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
