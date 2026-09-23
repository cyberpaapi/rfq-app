import { useEffect, useRef, useState } from 'react'
import { UploadCloud, Trash2, ChevronDown, X, Layers, ChevronLeft, ChevronRight, AlertTriangle, Link2, Check, Search } from 'lucide-react'
import { Empty } from './ui'
import { Items } from '../api/client'

// Searchable catalogue picker — maps an RFQ line to a database item by its SKU.
// Searches by item name or SKU; on pick, the row gets the item's itemId + sku.
function CatalogueMapper({ value, onPick }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  useEffect(() => {
    if (!open) return
    let active = true
    const t = setTimeout(() => { Items.list({ q }).then((r) => active && setResults(r.slice(0, 25))).catch(() => {}) }, 200)
    return () => { active = false; clearTimeout(t) }
  }, [q, open])

  const mapped = !!value?.sku
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} title="Map this item to a catalogue SKU"
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${mapped ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100'}`}>
        {mapped ? <><Check size={11} /> SKU {value.sku}</> : <><Link2 size={11} /> Map to catalogue</>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-1 w-72 overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card-lg">
            <div className="relative border-b border-ink-100 p-2">
              <Search size={13} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item name or SKU…" className="w-full rounded-lg border border-ink-200 py-1.5 pl-7 pr-2 text-sm outline-none focus:border-brand-400" />
            </div>
            <div className="max-h-60 overflow-auto">
              {results.map((it) => (
                <button key={it.id} onClick={() => { onPick({ itemId: it.id, sku: it.sku || '' }); setOpen(false) }} className="block w-full px-3 py-2 text-left hover:bg-ink-50">
                  <p className="truncate text-sm font-semibold text-ink-800">{it.name}</p>
                  <p className="text-xs text-ink-400">SKU {it.sku || '—'} · {it.category}</p>
                </button>
              ))}
              {results.length === 0 && <p className="px-3 py-3 text-xs text-ink-400">No catalogue matches{q ? '' : ' — type to search'}.</p>}
            </div>
            {mapped && <button onClick={() => { onPick({ itemId: null, sku: '' }); setOpen(false) }} className="block w-full border-t border-ink-100 px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50">Clear mapping</button>}
          </div>
        </>
      )}
    </div>
  )
}

// Columns: the mandatory spec-screen set PLUS the pre-existing fields we keep
// (Required Delivery Date, Secondary Requirements). Shared by AI Import and the
// manual Create-RFQ wizard so both show items the same way.
const HEADERS = ['Item Name', 'Specification', 'Brand', 'Model No.', 'Part No.', 'Quantity', 'Unit', 'Upload Photo', 'Remark', 'Required Delivery Date', 'Secondary Requirements']
const COLSPAN = HEADERS.length + 1 // + actions column

// Editable cell: clamps to 3 lines; click to expand into a full editor.
function Cell({ value, onChange, placeholder = '—', type = 'text', className = '' }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    if (type === 'textarea') return <textarea autoFocus value={value ?? ''} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} rows={4} className={`w-full resize-y rounded-md border border-brand-300 bg-white p-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/20 ${className}`} />
    return <input autoFocus type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} className={`w-full rounded-md border border-brand-300 bg-white p-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/20 ${className}`} />
  }
  const has = value != null && value !== ''
  return <div onClick={() => setEditing(true)} title="Click to edit / expand" className={`min-h-[1.5rem] cursor-text whitespace-pre-wrap break-words text-sm line-clamp-3 ${className}`}>{has ? String(value) : <span className="text-ink-300">{placeholder}</span>}</div>
}

// Specification shows spec + extracted description together; edit targets spec
// (description is editable in the row detail expander).
function SpecCell({ row, on }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <textarea autoFocus value={row.spec || ''} onChange={(e) => on({ spec: e.target.value })} onBlur={() => setEditing(false)} placeholder="Specification" rows={4} className="w-full resize-y rounded-md border border-brand-300 bg-white p-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/20" />
  const combined = [row.spec, row.description].filter(Boolean).join('\n')
  return <div onClick={() => setEditing(true)} title="Click to edit / expand" className="min-h-[1.5rem] cursor-text whitespace-pre-wrap break-words text-sm line-clamp-3">{combined || <span className="text-ink-300">—</span>}</div>
}

// Real image upload — stores the picked image as a data URL and previews a thumb.
function PhotoCell({ value, onChange }) {
  const isImg = typeof value === 'string' && value.startsWith('data:image')
  const onFile = (f) => { if (!f) return; const r = new FileReader(); r.onload = () => onChange(r.result); r.readAsDataURL(f) }
  return (
    <div className="flex items-center gap-1.5">
      {isImg && <a href={value} target="_blank" rel="noreferrer" title="View image"><img src={value} alt="" className="h-9 w-9 rounded object-cover ring-1 ring-ink-200" /></a>}
      <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
        <UploadCloud size={14} /> {isImg ? 'change' : (value ? <span className="max-w-20 truncate">{value}</span> : 'browse')}
        <input type="file" hidden accept="image/*" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      </label>
      {value && <button onClick={() => onChange('')} title="Remove" className="text-ink-300 hover:text-rose-500"><X size={12} /></button>}
    </div>
  )
}

function Row({ row, i, onChange, onRemove, nameExtra, mappable }) {
  const [open, setOpen] = useState(false)
  const on = (patch) => onChange(i, patch)
  const unmapped = mappable && !row.sku
  return (
    <>
      <tr className="align-top hover:bg-ink-50/40">
        <td className="relative w-56 px-3 py-2">
          {/* Unmapped warning — sits in the left gutter, outside the table columns */}
          {unmapped && <AlertTriangle size={16} className="absolute -left-6 top-3 text-amber-500" title="Not mapped to a catalogue item — pick its SKU" />}
          <div className="flex items-start gap-1">
            <button onClick={() => setOpen((o) => !o)} title="More fields" className="mt-0.5 shrink-0 text-ink-300 hover:text-brand-600"><ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} /></button>
            <div className="min-w-0 flex-1">
              <Cell value={row.name} onChange={(v) => on({ name: v })} placeholder="Item name" type="textarea" className="font-semibold text-ink-800" />
              {mappable && <div className="mt-1"><CatalogueMapper value={{ sku: row.sku }} onPick={(p) => on(p)} /></div>}
              {nameExtra && <div className="mt-1">{nameExtra(row, i)}</div>}
            </div>
          </div>
        </td>
        <td className="w-64 px-3 py-2"><SpecCell row={row} on={on} /></td>
        <td className="w-32 px-3 py-2"><Cell value={row.brand} onChange={(v) => on({ brand: v })} type="textarea" /></td>
        <td className="w-28 px-3 py-2"><Cell value={row.model} onChange={(v) => on({ model: v })} /></td>
        <td className="w-28 px-3 py-2"><Cell value={row.partNo} onChange={(v) => on({ partNo: v })} /></td>
        <td className="w-20 px-3 py-2"><Cell value={row.quantity} onChange={(v) => on({ quantity: v })} type="number" className="text-right" /></td>
        <td className="w-20 px-3 py-2"><Cell value={row.uom} onChange={(v) => on({ uom: v })} placeholder="Unit" /></td>
        <td className="w-32 px-3 py-2"><PhotoCell value={row.photo} onChange={(v) => on({ photo: v })} /></td>
        <td className="w-40 px-3 py-2"><Cell value={row.remark} onChange={(v) => on({ remark: v })} type="textarea" /></td>
        <td className="w-36 px-3 py-2"><input type="date" value={row.requiredDeliveryDate || ''} onChange={(e) => on({ requiredDeliveryDate: e.target.value })} className="w-full rounded-md border border-ink-200 bg-white p-1.5 text-sm outline-none focus:border-brand-300" /></td>
        <td className="w-48 px-3 py-2"><Cell value={row.secondaryRequirements} onChange={(v) => on({ secondaryRequirements: v })} placeholder="e.g. panel board for a fan" type="textarea" className="text-sky-700" /></td>
        <td className="px-2 py-2"><button onClick={() => onRemove(i)} className="rounded-lg p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button></td>
      </tr>
      {open && (
        <tr className="bg-ink-50/50">
          <td colSpan={COLSPAN} className="px-4 py-3">
            <label className="mb-1 block text-xs font-semibold text-ink-500">Additional details</label>
            <textarea value={row.description || ''} onChange={(e) => on({ description: e.target.value })} placeholder="Other details — motor details, zone, notes…" className="input min-h-14 text-sm" />
          </td>
        </tr>
      )}
    </>
  )
}

// rows: array of item objects (name, spec, brand, model, partNo, quantity, uom,
//   photo, remark, requiredDeliveryDate, description, secondaryRequirements)
// onChange(i, patch) · onRemove(i) · nameExtra(row, i) optional ReactNode
export default function ItemsTable({ rows, onChange, onRemove, nameExtra, mappable = false, emptyHint = 'Add an item or import a document.' }) {
  const scrollRef = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const updateEdges = () => {
    const el = scrollRef.current
    if (!el) return
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }
  useEffect(() => {
    const el = scrollRef.current
    updateEdges()
    if (!el || typeof ResizeObserver === 'undefined') return
    // Recompute when the table is resized (e.g. the verification panel opens
    // and squeezes the column) — not just on window resize.
    const ro = new ResizeObserver(() => updateEdges())
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows?.length])
  const nudge = (dx) => scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' })

  if (!rows?.length) return <Empty icon={Layers} title="No items" hint={emptyHint} />

  // Arrow buttons sit on the header row at the left/right edges.
  const arrowBtn = 'absolute top-1 z-20 grid h-8 w-8 place-items-center rounded-full border border-ink-200 bg-white text-ink-600 shadow-md transition hover:bg-ink-50 hover:text-brand-600'
  return (
    <div className="relative">
      <div ref={scrollRef} onScroll={updateEdges} className={`overflow-x-auto rounded-xl border border-ink-100 ${mappable ? 'pl-7' : ''}`}>
        <table className="w-full min-w-[1320px] border-collapse text-sm">
          <thead>
            <tr className="bg-ink-50 text-left text-xs font-bold uppercase tracking-wide text-ink-600">
              {HEADERS.map((h) => <th key={h} className="border-b border-ink-200 px-3 py-2.5">{h}</th>)}
              <th className="border-b border-ink-200 px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((row, i) => <Row key={i} row={row} i={i} onChange={onChange} onRemove={onRemove} nameExtra={nameExtra} mappable={mappable} />)}
          </tbody>
        </table>
      </div>
      {edges.left && <button type="button" aria-label="Scroll columns left" onClick={() => nudge(-360)} className={`${arrowBtn} left-1.5`}><ChevronLeft size={18} /></button>}
      {edges.right && <button type="button" aria-label="Scroll columns right" onClick={() => nudge(360)} className={`${arrowBtn} right-1.5`}><ChevronRight size={18} /></button>}
    </div>
  )
}
