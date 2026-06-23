import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, UploadCloud, FileText, FileSpreadsheet, Image as ImageIcon, File,
  Plus, Loader2, ArrowRight, X, Trash2, ChevronDown, Layers,
} from 'lucide-react'
import { Ingest, Rfqs } from '../api/client'
import { Card, Tag, Empty } from '../components/ui'

const iconFor = (name = '') => {
  const e = name.split('.').pop()?.toLowerCase()
  if (['xlsx', 'xls', 'csv'].includes(e)) return FileSpreadsheet
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(e)) return ImageIcon
  if (e === 'pdf') return FileText
  return File
}

const blankRow = () => ({ name: '', spec: '', quantity: 1, uom: 'PCS', description: '', secondary: false, tags: [], isNew: true })

export default function Import() {
  const nav = useNavigate()
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [meta, setMeta] = useState(null) // {engine, note, sourceKind, count, newItems}
  const [rows, setRows] = useState(null) // editable items
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [creating, setCreating] = useState(false)

  const pick = (f) => { setFile(f); setRows(null); setMeta(null); setError(null) }

  const run = async () => {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const res = await Ingest(file)
      setMeta({ engine: res.engine, note: res.note, sourceKind: res.sourceKind, count: res.count, newItems: res.newItems })
      setRows(res.items.map((it) => ({ ...it, quantity: it.quantity ?? 1 })))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const setRow = (i, patch) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i))
  const addRow = () => setRows((r) => [...r, blankRow()])

  const createRfq = async () => {
    setCreating(true)
    try {
      const rfq = await Rfqs.create({
        title: file ? file.name.replace(/\.[^.]+$/, '') : 'Imported RFQ',
        description: file ? `Imported from ${file.name}` : '',
        lines: rows
          .filter((r) => r.name.trim())
          .map((r) => ({ itemId: r.itemId, name: r.name, spec: r.spec, description: r.description, qty: Number(r.quantity) || 1, uom: r.uom })),
      })
      nav(`/assign/${rfq.id}`)
    } finally {
      setCreating(false)
    }
  }

  const Icon = file ? iconFor(file.name) : UploadCloud

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-ink-900">
          <Sparkles className="text-brand-500" /> AI Document Import
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Every upload is read by AI — names, specs, descriptions and tags are segregated automatically. Review and edit everything before creating the RFQ.
        </p>
      </div>

      {/* Upload */}
      <Card className="p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]) }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed px-5 py-5 transition ${
              dragOver ? 'border-brand-400 bg-brand-50/60' : 'border-ink-200 hover:bg-ink-50'
            }`}
          >
            <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${file ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-400'}`}>
              <Icon size={22} />
            </div>
            <div className="min-w-0">
              {file ? (
                <>
                  <p className="truncate font-semibold text-ink-800">{file.name}</p>
                  <p className="text-xs text-ink-400">{(file.size / 1024).toFixed(0)} KB · click to change</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-ink-700">Drop a file or click to browse</p>
                  <p className="text-xs text-ink-400">.xlsx .csv .txt .pdf .png .jpg — PDFs go straight to the model</p>
                </>
              )}
            </div>
            <input ref={inputRef} type="file" hidden accept=".xlsx,.xls,.csv,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp,.gif"
              onChange={(e) => e.target.files[0] && pick(e.target.files[0])} />
          </div>
          <button className="btn-primary h-12 px-6" disabled={!file || busy} onClick={run}>
            {busy ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <><Sparkles size={16} /> Extract items</>}
          </button>
        </div>
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            <X size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
      </Card>

      {/* Editable results */}
      {rows && (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip bg-brand-50 text-brand-700">{rows.length} items</span>
              <span className="chip bg-emerald-50 text-emerald-700">{rows.filter((r) => r.isNew).length} new</span>
              <span className="chip bg-amber-50 text-amber-700">{rows.filter((r) => r.secondary).length} secondary</span>
              {meta && <span className="chip bg-ink-100 text-ink-500">engine: {meta.engine}</span>}
            </div>
            <button className="btn-outline" onClick={addRow}><Plus size={15} /> Add row</button>
          </div>
          {meta?.note && <p className="mb-3 text-xs text-amber-600">{meta.note}</p>}

          <div className="space-y-2">
            {rows.map((row, i) => (
              <EditableRow key={i} row={row} onChange={(p) => setRow(i, p)} onRemove={() => removeRow(i)} />
            ))}
            {rows.length === 0 && <Empty icon={Layers} title="No items" hint="Add a row or re-extract." />}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
            <p className="text-xs text-ink-400">Edit anything above — changes flow into the new RFQ.</p>
            <button className="btn-primary" disabled={creating || rows.length === 0} onClick={createRfq}>
              {creating ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : <>Create RFQ <ArrowRight size={16} /></>}
            </button>
          </div>
        </Card>
      )}

      {!rows && !busy && (
        <Card className="p-6"><Empty icon={Sparkles} title="Extracted items will appear here" hint="Upload a document and run extraction." /></Card>
      )}
    </div>
  )
}

function EditableRow({ row, onChange, onRemove }) {
  const [showDesc, setShowDesc] = useState(false)
  return (
    <div className={`rounded-xl border p-3 ${row.secondary ? 'border-amber-200 bg-amber-50/30' : 'border-ink-100'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={row.name} onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Item name (base)" className="input min-w-48 flex-1 py-1.5 font-semibold"
        />
        <input
          value={row.spec} onChange={(e) => onChange({ spec: e.target.value })}
          placeholder="spec / variant" className="input w-44 py-1.5"
        />
        <input
          type="number" min="0" step="any" value={row.quantity} onChange={(e) => onChange({ quantity: e.target.value })}
          className="input w-20 py-1.5 text-right" title="Quantity"
        />
        <input
          value={row.uom} onChange={(e) => onChange({ uom: e.target.value })}
          className="input w-20 py-1.5" placeholder="UOM"
        />
        <button onClick={onRemove} className="rounded-lg p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => setShowDesc((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
          <ChevronDown size={13} className={`transition ${showDesc ? 'rotate-180' : ''}`} /> Description
        </button>
        <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-600">
          <input type="checkbox" checked={!!row.secondary} onChange={(e) => onChange({ secondary: e.target.checked })} className="h-3.5 w-3.5 accent-amber-500" />
          Secondary requirement
        </label>
        <div className="ml-auto flex flex-wrap gap-1">
          {(row.tags || []).map((t) => <Tag key={t} tone={t === row.baseName ? 'emerald' : 'ink'}>{t}</Tag>)}
          {row.secondary && <Tag tone="ink">Secondary</Tag>}
        </div>
      </div>

      {showDesc && (
        <textarea
          value={row.description} onChange={(e) => onChange({ description: e.target.value })}
          placeholder="All other details — motor details, panel-board requirement, zone, notes…"
          className="input mt-2 min-h-20 text-sm"
        />
      )}
      {!showDesc && row.description && (
        <p className="mt-1.5 line-clamp-1 text-xs text-ink-400">{row.description}</p>
      )}
    </div>
  )
}
