import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, UploadCloud, FileText, FileSpreadsheet, Image as ImageIcon, File,
  Plus, Loader2, ArrowRight, X, Trash2, ChevronDown, Layers, MapPin,
  ScanSearch, Boxes, ListChecks, TriangleAlert, FilePlus2, RefreshCw,
} from 'lucide-react'
import { Ingest, Rfqs, Cluster } from '../api/client'
import { Card, Empty } from '../components/ui'
import DocViewer from '../components/DocViewer'

const iconFor = (name = '') => {
  const e = name.split('.').pop()?.toLowerCase()
  if (['xlsx', 'xls', 'csv'].includes(e)) return FileSpreadsheet
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(e)) return ImageIcon
  if (e === 'pdf') return FileText
  return File
}

const blankRow = () => ({ name: '', spec: '', quantity: 1, uom: 'PCS', description: '', brand: '', model: '', partNo: '', secondaryRequirements: '', remark: '', requiredDeliveryDate: '', tags: [], isNew: true, pages: [], sources: [], docId: null })

const VERIFIABLE = ['pdf', 'images', 'text', 'rows']

// "Found on" labels. Each instance is { docId, page, source }. Clicking opens
// verification; clicking again jumps to the next instance (next page/row, even
// across documents).
function PageLabel({ instances = [], activeIdx = -1, onClick }) {
  if (!instances.length) return null
  const shown = instances.slice(0, 8)
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick() }} title="Open verification — click again to jump to the next instance"
      className="inline-flex flex-wrap items-center gap-1 align-middle">
      <MapPin size={11} className="text-amber-500" />
      {shown.map((inst, i) => (
        <span key={i} className={`chip px-1.5 py-0.5 text-[10px] font-semibold transition ${i === activeIdx ? 'bg-amber-400 text-white ring-2 ring-amber-300' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100'}`}>
          {inst.source}
        </span>
      ))}
      {instances.length > 8 && <span className="text-[10px] text-ink-400">+{instances.length - 8}</span>}
    </button>
  )
}

export default function Import() {
  const nav = useNavigate()
  const inputRef = useRef(null)
  const anotherRef = useRef(null)
  const cycleRef = useRef({})

  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reclustering, setReclustering] = useState(false)
  const [meta, setMeta] = useState(null)
  const [docs, setDocs] = useState([])     // [{ id, name, file, sourceKind, sheets, sourceText }]
  const [rows, setRows] = useState(null)    // basic view — individual items (each with docId)
  const [clubs, setClubs] = useState(null)  // clubbed view (resolved with memberItems)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [creating, setCreating] = useState(false)

  const [view, setView] = useState('basic')
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyDocId, setVerifyDocId] = useState(null)
  const [verifyTarget, setVerifyTarget] = useState(null)
  const [active, setActive] = useState(null) // { key, idx }

  // Attach the member row objects to each club so the clubbed view is immune to
  // later index shifts in the basic list.
  const resolveClubs = (clubsRaw, sourceRows) =>
    clubsRaw ? clubsRaw.map((c) => ({ ...c, memberItems: (c.members || []).map((i) => sourceRows[i]).filter(Boolean) })) : null

  const pick = (f) => { setFile(f); setRows(null); setDocs([]); setClubs(null); setMeta(null); setError(null); setVerifyOpen(false); setVerifyDocId(null); setView('basic'); cycleRef.current = {} }

  const processFile = async (f, append = false) => {
    setBusy(true); setError(null)
    try {
      const res = await Ingest(f)
      const docId = 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
      const newDoc = { id: docId, name: f.name, file: f, sourceKind: res.sourceKind, sheets: res.sheetData || null, sourceText: res.sourceText || null }
      const mapped = res.items.map((it) => ({ ...it, quantity: it.quantity ?? 1, remark: it.remark || '', requiredDeliveryDate: it.requiredDeliveryDate || '', secondaryRequirements: it.secondaryRequirements || '', docId }))

      if (append) {
        const allRows = [...(rows || []), ...mapped]
        setDocs((d) => [...d, newDoc])
        setRows(allRows)
        setMeta((m) => ({ ...m, engine: res.engine, note: res.note, pages: res.pages, chunks: res.chunks }))
        await recluster(allRows)
      } else {
        setDocs([newDoc])
        setRows(mapped)
        setClubs(resolveClubs(res.clubs, mapped))
        setMeta({ engine: res.engine, clubEngine: res.clubEngine, note: res.note, sourceKind: res.sourceKind, count: res.count, newItems: res.newItems, pages: res.pages, chunks: res.chunks })
      }
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  // Re-run the clubbing pass over the full accumulated list.
  const recluster = async (sourceRows) => {
    setReclustering(true)
    try {
      const res = await Cluster(sourceRows.map((r) => ({ name: r.name, spec: r.spec, uom: r.uom, quantity: Number(r.quantity) || 0, pages: r.pages, sources: r.sources })))
      setClubs(resolveClubs(res.clubs, sourceRows))
      setMeta((m) => ({ ...m, clubEngine: res.clubEngine || m?.clubEngine }))
    } catch { /* leave clubs as-is */ } finally { setReclustering(false) }
  }

  const setRow = (i, patch) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i))
  const addRow = () => setRows((r) => [...(r || []), blankRow()])

  const instancesFor = (item) => (item.pages || []).map((p, i) => ({ docId: item.docId, page: p, source: item.sources?.[i] || `Page ${p}` }))

  const jump = (key, instances) => {
    if (!instances?.length) return
    const nextIdx = ((cycleRef.current[key] ?? -1) + 1) % instances.length
    cycleRef.current[key] = nextIdx
    const inst = instances[nextIdx]
    setActive({ key, idx: nextIdx })
    setVerifyDocId(inst.docId)
    setVerifyTarget({ page: inst.page, source: inst.source, nonce: Date.now() })
    setVerifyOpen(true)
  }

  const openVerification = () => {
    if (!verifyDocId) setVerifyDocId(docs.find((d) => VERIFIABLE.includes(d.sourceKind))?.id || docs[0]?.id)
    setVerifyOpen((v) => !v)
  }

  const createRfq = async () => {
    setCreating(true)
    try {
      const rfq = await Rfqs.create({
        title: docs[0] ? docs[0].name.replace(/\.[^.]+$/, '') : 'Imported RFQ',
        description: docs.length ? `Imported from ${docs.map((d) => d.name).join(', ')}` : '',
        lines: rows.filter((r) => r.name.trim()).map((r) => ({ itemId: r.itemId, name: r.name, spec: r.spec, description: r.description, qty: Number(r.quantity) || 1, uom: r.uom, brand: r.brand || '', model: r.model || '', partNo: r.partNo || '', secondaryRequirements: r.secondaryRequirements || '', remark: r.remark || '', requiredDeliveryDate: r.requiredDeliveryDate || '' })),
      })
      nav(`/assign/${rfq.id}`)
    } finally { setCreating(false) }
  }

  const Icon = file ? iconFor(file.name) : UploadCloud
  const verifyDoc = docs.find((d) => d.id === verifyDocId) || docs[0]
  const canVerify = docs.some((d) => VERIFIABLE.includes(d.sourceKind))
  const showViewer = verifyOpen && verifyDoc && VERIFIABLE.includes(verifyDoc.sourceKind)
  const withSecondary = rows ? rows.filter((r) => (r.secondaryRequirements || '').trim()).length : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-ink-900"><Sparkles className="text-brand-500" /> AI Document Import</h1>
        <p className="mt-1 text-sm text-ink-500">Big files are split (PDF pages / 10-row spreadsheet blocks) and read in parallel. The <b>Basic view</b> lists every line individually; the <b>Clubbed view</b> groups similar ones.</p>
      </div>

      {/* Upload (first document) */}
      {!rows && (
        <Card className="p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]) }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed px-5 py-5 transition ${dragOver ? 'border-brand-400 bg-brand-50/60' : 'border-ink-200 hover:bg-ink-50'}`}
            >
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${file ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-400'}`}><Icon size={22} /></div>
              <div className="min-w-0">
                {file ? (
                  <><p className="truncate font-semibold text-ink-800">{file.name}</p><p className="text-xs text-ink-400">{(file.size / 1024).toFixed(0)} KB · click to change</p></>
                ) : (
                  <><p className="font-semibold text-ink-700">Drop a file or click to browse</p><p className="text-xs text-ink-400">.xlsx .csv .txt .pdf .png .jpg — large files are chunked automatically</p></>
                )}
              </div>
              <input ref={inputRef} type="file" hidden accept=".xlsx,.xls,.csv,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp,.gif" onChange={(e) => e.target.files[0] && pick(e.target.files[0])} />
            </div>
            <button className="btn-primary h-12 px-6" disabled={!file || busy} onClick={() => processFile(file, false)}>{busy ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <><Sparkles size={16} /> Extract items</>}</button>
          </div>
          {error && <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><X size={16} className="mt-0.5 shrink-0" /> {error}</div>}
        </Card>
      )}

      {/* Results */}
      {rows && (
        <Card className="p-5">
          {/* Documents strip */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">{docs.length} doc{docs.length > 1 ? 's' : ''}:</span>
            {docs.map((d) => {
              const DIcon = iconFor(d.name)
              return <span key={d.id} className="inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-xs font-medium text-ink-600"><DIcon size={12} /> {d.name}</span>
            })}
            <button onClick={() => anotherRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-brand-300 px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <FilePlus2 size={12} />} Process another document
            </button>
            <input ref={anotherRef} type="file" hidden accept=".xlsx,.xls,.csv,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp,.gif" onChange={(e) => { if (e.target.files[0]) processFile(e.target.files[0], true); e.target.value = '' }} />
          </div>

          {/* Tabs + actions */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-ink-100 p-1">
              <button onClick={() => setView('basic')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${view === 'basic' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}><ListChecks size={15} /> Basic view <span className="chip bg-ink-100 px-1.5 py-0 text-[10px]">{rows.length}</span></button>
              <button onClick={() => setView('clubbed')} disabled={!clubs} title={clubs ? '' : 'Clubbed view needs the AI clubbing pass (API key).'} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40 ${view === 'clubbed' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}><Boxes size={15} /> Clubbed view {clubs && <span className="chip bg-ink-100 px-1.5 py-0 text-[10px]">{clubs.length}</span>}</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {meta?.pages > 1 && <span className="chip bg-violet-50 text-violet-700">{meta.pages} {meta.sourceKind === 'rows' ? 'rows' : 'pages'} · {meta.chunks} chunks</span>}
              {withSecondary > 0 && <span className="chip bg-sky-50 text-sky-700">{withSecondary} with add-ons</span>}
              {meta && <span className="chip bg-ink-100 text-ink-500">extract: {meta.engine}</span>}
              {meta?.clubEngine && <span className="chip bg-ink-100 text-ink-500">club: {meta.clubEngine}</span>}
              {canVerify && <button onClick={openVerification} className={`btn-outline ${showViewer ? 'border-brand-300 bg-brand-50 text-brand-700' : ''}`}><ScanSearch size={15} /> {showViewer ? 'Close verification' : 'Open Verification'}</button>}
              {view === 'basic' && <button className="btn-outline" onClick={addRow}><Plus size={15} /> Add item</button>}
            </div>
          </div>
          {meta?.note && <p className="mb-3 text-xs text-violet-600">{meta.note}</p>}

          <div className={`grid gap-5 ${showViewer ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
            <div className="min-w-0">
              {view === 'basic' ? (
                <BasicTable rows={rows} setRow={setRow} removeRow={removeRow} active={active} jump={jump} instancesFor={instancesFor} />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                    <span><b>Similar items are clubbed</b> by {meta?.clubEngine || 'the AI'}. This is a convenience overview — <button onClick={() => setView('basic')} className="font-semibold underline">check the Basic view</button> to verify before creating the RFQ.</span>
                    <button onClick={() => recluster(rows)} disabled={reclustering} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                      {reclustering ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-cluster
                    </button>
                  </div>
                  {clubs?.map((c, i) => <ClubCard key={i} club={c} idx={i} active={active} jump={jump} instancesFor={instancesFor} />)}
                </div>
              )}
            </div>

            {showViewer && (
              <DocViewer file={verifyDoc.file} kind={verifyDoc.sourceKind} sourceText={verifyDoc.sourceText} sheets={verifyDoc.sheets} target={verifyTarget} onClose={() => setVerifyOpen(false)} />
            )}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
            <p className="text-xs text-ink-400">The <b>Basic view</b> is the source of truth used to create the RFQ. Edits there flow into the new RFQ.</p>
            <button className="btn-primary" disabled={creating || rows.length === 0} onClick={createRfq}>{creating ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : <>Create RFQ <ArrowRight size={16} /></>}</button>
          </div>
        </Card>
      )}

      {!rows && !busy && <Card className="p-6"><Empty icon={Sparkles} title="Extracted items will appear here" hint="Upload a document and run extraction." /></Card>}
    </div>
  )
}

function ClubCard({ club, idx, active, jump, instancesFor }) {
  const [open, setOpen] = useState(false)
  const clubbed = club.count > 1
  const key = `c${idx}`
  const members = club.memberItems || []
  const clubInstances = members.flatMap((m) => instancesFor(m))
  return (
    <div className={`rounded-xl border p-3 ${clubbed ? 'border-violet-200 bg-violet-50/30' : 'border-ink-100'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-ink-800">{club.name}{club.spec && <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-500">{club.spec}</span>}</p>
        <span className="text-xs text-ink-400">· {club.quantity} {club.uom}</span>
        {clubbed && <span className="chip bg-violet-100 text-violet-700">{club.count} clubbed</span>}
        <div className="ml-auto"><PageLabel instances={clubInstances} activeIdx={active?.key === key ? active.idx : -1} onClick={() => jump(key, clubInstances)} /></div>
      </div>
      {clubbed && (
        <>
          <button onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700">
            <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} /> {open ? 'Hide' : 'Show'} {club.count} members · {club.reason}
          </button>
          {open && (
            <div className="mt-2 space-y-1 border-l-2 border-violet-200 pl-3">
              {members.map((m, j) => {
                const mkey = `c${idx}m${j}`
                const minst = instancesFor(m)
                return (
                  <div key={j} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-ink-700">{m.name}{m.spec && <span className="ml-1 text-xs text-ink-400">· {m.spec}</span>}</span>
                    <span className="text-xs text-ink-400">{m.quantity} {m.uom}</span>
                    <PageLabel instances={minst} activeIdx={active?.key === mkey ? active.idx : -1} onClick={() => jump(mkey, minst)} />
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Editable cell: shows up to 3 lines clamped; click to expand into a full editor.
function Cell({ value, onChange, placeholder = '—', type = 'text', className = '' }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    if (type === 'textarea') return <textarea autoFocus value={value ?? ''} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} rows={4} className={`w-full resize-y rounded-md border border-brand-300 bg-white p-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/20 ${className}`} />
    return <input autoFocus type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} className={`w-full rounded-md border border-brand-300 bg-white p-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/20 ${className}`} />
  }
  const has = value != null && value !== ''
  return <div onClick={() => setEditing(true)} title="Click to edit / expand" className={`min-h-[1.5rem] cursor-text whitespace-pre-wrap break-words text-sm line-clamp-3 ${className}`}>{has ? String(value) : <span className="text-ink-300">{placeholder}</span>}</div>
}

// Specification cell shows spec + extracted description together (clamped); edit
// targets the spec field (description lives in the row detail expander).
function SpecCell({ row, on }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <textarea autoFocus value={row.spec || ''} onChange={(e) => on({ spec: e.target.value })} onBlur={() => setEditing(false)} placeholder="Specification" rows={4} className="w-full resize-y rounded-md border border-brand-300 bg-white p-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/20" />
  const combined = [row.spec, row.description].filter(Boolean).join('\n')
  return <div onClick={() => setEditing(true)} title="Click to edit / expand" className="min-h-[1.5rem] cursor-text whitespace-pre-wrap break-words text-sm line-clamp-3">{combined || <span className="text-ink-300">—</span>}</div>
}

function PhotoCell({ value, onChange }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
      <UploadCloud size={14} /> {value ? <span className="max-w-24 truncate">{value}</span> : 'browse'}
      <input type="file" hidden accept="image/*" onChange={(e) => e.target.files[0] && onChange(e.target.files[0].name)} />
    </label>
  )
}

function BasicTable({ rows, setRow, removeRow, active, jump, instancesFor }) {
  if (!rows.length) return <Empty icon={Layers} title="No items" hint="Add an item or process another document." />
  const HEADERS = ['Item Name', 'Specification', 'Brand', 'Model No.', 'Part No.', 'Quantity', 'Unit', 'Upload Photo', 'Remark']
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[1040px] border-collapse text-sm">
        <thead>
          <tr className="bg-ink-50 text-left text-xs font-bold uppercase tracking-wide text-ink-600">
            {HEADERS.map((h) => <th key={h} className="border-b border-ink-200 px-3 py-2.5">{h}</th>)}
            <th className="border-b border-ink-200 px-2 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row, i) => <BasicRow key={i} row={row} i={i} setRow={setRow} removeRow={removeRow} active={active} jump={jump} instancesFor={instancesFor} />)}
        </tbody>
      </table>
    </div>
  )
}

function BasicRow({ row, i, setRow, removeRow, active, jump, instancesFor }) {
  const [open, setOpen] = useState(false)
  const key = `b${i}`
  const inst = instancesFor(row)
  const on = (patch) => setRow(i, patch)
  return (
    <>
      <tr className="align-top hover:bg-ink-50/40">
        <td className="w-56 px-3 py-2">
          <div className="flex items-start gap-1">
            <button onClick={() => setOpen((o) => !o)} title="More fields" className="mt-0.5 shrink-0 text-ink-300 hover:text-brand-600"><ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} /></button>
            <div className="min-w-0 flex-1">
              <Cell value={row.name} onChange={(v) => on({ name: v })} placeholder="Item name" type="textarea" className="font-semibold text-ink-800" />
              <div className="mt-1"><PageLabel instances={inst} activeIdx={active?.key === key ? active.idx : -1} onClick={() => jump(key, inst)} /></div>
              {(row.secondaryRequirements || '').trim() && <p className="mt-1 line-clamp-2 text-[11px] text-sky-600">+ also needs: {row.secondaryRequirements}</p>}
            </div>
          </div>
        </td>
        <td className="w-64 px-3 py-2"><SpecCell row={row} on={on} /></td>
        <td className="w-32 px-3 py-2"><Cell value={row.brand} onChange={(v) => on({ brand: v })} type="textarea" /></td>
        <td className="w-28 px-3 py-2"><Cell value={row.model} onChange={(v) => on({ model: v })} /></td>
        <td className="w-28 px-3 py-2"><Cell value={row.partNo} onChange={(v) => on({ partNo: v })} /></td>
        <td className="w-20 px-3 py-2"><Cell value={row.quantity} onChange={(v) => on({ quantity: v })} type="number" className="text-right" /></td>
        <td className="w-20 px-3 py-2"><Cell value={row.uom} onChange={(v) => on({ uom: v })} placeholder="Unit" /></td>
        <td className="w-28 px-3 py-2"><PhotoCell value={row.photo} onChange={(v) => on({ photo: v })} /></td>
        <td className="w-40 px-3 py-2"><Cell value={row.remark} onChange={(v) => on({ remark: v })} type="textarea" /></td>
        <td className="px-2 py-2"><button onClick={() => removeRow(i)} className="rounded-lg p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button></td>
      </tr>
      {open && (
        <tr className="bg-ink-50/50">
          <td colSpan={10} className="px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className="mb-1 block text-xs font-semibold text-ink-500">Required delivery date</label><input type="date" value={row.requiredDeliveryDate || ''} onChange={(e) => on({ requiredDeliveryDate: e.target.value })} className="input py-1.5 text-sm" /></div>
              <div className="sm:col-span-2"><label className="mb-1 block text-xs font-semibold text-ink-500">Secondary requirements <span className="font-normal text-ink-400">(needed alongside, e.g. panel board for a fan)</span></label><textarea value={row.secondaryRequirements || ''} onChange={(e) => on({ secondaryRequirements: e.target.value })} className="input min-h-14 text-sm" /></div>
              <div className="sm:col-span-3"><label className="mb-1 block text-xs font-semibold text-ink-500">Additional details</label><textarea value={row.description || ''} onChange={(e) => on({ description: e.target.value })} className="input min-h-14 text-sm" /></div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
