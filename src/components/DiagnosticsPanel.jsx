import { useEffect, useState } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import { api } from '../api/client'
import { Card, Spinner } from './ui'

export default function DiagnosticsPanel() {
  const [q, setQ] = useState(''), [level, setLevel] = useState(''), [revision, refresh] = useState(0)
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      setLoading(true); setError('')
      api.get('/logs', { q, level, limit: 500 }).then((value) => { if (active) setData(value) }).catch((e) => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [q, level, revision])
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `opro-logs-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url)
  }
  return <Card className="p-5" data-no-telemetry>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold text-ink-900">Actions & Debug Logs</h2><p className="mt-1 text-xs text-ink-500">Requests, changes, clicks, navigation, AI processing and errors. Input values and uploaded contents are excluded.</p></div>
      <div className="flex gap-2"><button className="btn-outline" disabled={loading} onClick={() => refresh((n) => n + 1)}><RefreshCw size={15} /> Refresh</button><button className="btn-outline" disabled={!data} onClick={download}><Download size={15} /> Download shown logs</button></div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      <input aria-label="Search debug logs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, error or request ID…" className="input min-w-52 flex-1" />
      <select aria-label="Log level" className="input w-auto" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">All levels</option><option value="error">Errors</option><option value="warn">Warnings</option><option value="info">Info</option></select>
    </div>
    {data && <p className="my-3 text-xs text-ink-500">{data.stats.count.toLocaleString()} retained entries · {(data.stats.bytes / 1048576).toFixed(2)} MB of 25 MB log content · up to 15 days / 20,000 entries. Oldest entries expire first; cleanup runs on activity. Showing {data.entries.length} latest matches.</p>}
    {error && <p role="alert" className="my-3 text-sm text-rose-700">{error}</p>}
    {loading && !data ? <Spinner /> : <div className="mt-3 max-h-[650px] space-y-2 overflow-auto">
      {data?.entries.map((entry) => <details key={entry.id} className="rounded-xl border border-ink-100 px-3 py-2 text-sm">
        <summary className="cursor-pointer"><span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${entry.level === 'error' ? 'bg-rose-50 text-rose-700' : entry.level === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>{entry.level}</span><span className="font-semibold">{entry.event}</span> · {entry.message}<span className="ml-2 text-xs text-ink-400">{new Date(entry.at).toLocaleString()}</span></summary>
        <div className="mt-2 space-y-1 break-words text-xs text-ink-500"><p>{entry.actor} · {entry.method} {entry.path}{entry.status ? ` · HTTP ${entry.status} · ${entry.durationMs} ms` : ''}</p>{entry.requestId && <p className="font-mono">Request ID: {entry.requestId}</p>}<pre className="whitespace-pre-wrap rounded bg-ink-50 p-2">{entry.details}</pre></div>
      </details>)}
      {data?.entries.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No matching events yet.</p>}
    </div>}
  </Card>
}
