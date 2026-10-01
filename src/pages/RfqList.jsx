import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, SlidersHorizontal, Download, Eye, Check, Loader2 } from 'lucide-react'
import { Rfqs, Suppliers } from '../api/client'
import { STATUS } from '../data/mock'
import { Card, StatusBadge, Empty, Spinner, Drawer } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { rfqCreationDate } from '../../shared/rfqDates'

const FILTERS = ['All', 'Open', 'Awarded', 'Closed', 'Expired']
const today = new Date().toISOString().slice(0, 10)

export default function RfqList() {
  const { can } = useAuth()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('All')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [rfqs, setRfqs] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [viewId, setViewId] = useState('')
  const [suppliers, setSuppliers] = useState([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [assignmentType, setAssignmentType] = useState('full')
  const [selectedLineIds, setSelectedLineIds] = useState([])
  const [assignmentError, setAssignmentError] = useState('')
  const [assignmentMessage, setAssignmentMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const loadRfqs = useCallback(async () => { setRfqs(await Rfqs.list()); setLoadError('') }, [])
  useEffect(() => { loadRfqs().catch((error) => setLoadError(error.message)) }, [loadRfqs])

  const categories = useMemo(() => [...new Set((rfqs || []).map((rfq) => rfq.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rfqs])
  const supplierOptions = useMemo(() => {
    const byId = new Map()
    for (const rfq of rfqs || []) for (const assignment of rfq.assignments || []) byId.set(assignment.supplierId, assignment.supplierName || assignment.supplierId)
    return [...byId].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rfqs])
  const viewedRfq = rfqs?.find((rfq) => rfq.id === viewId)
  const canAssign = can('rfq.create') && viewedRfq && !viewedRfq.award && ![STATUS.AWARDED, STATUS.CLOSED, STATUS.CANCELLED].includes(viewedRfq.status) && viewedRfq.lines?.length > 0
  const availableSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.qualified !== false && !viewedRfq?.assignments?.some((assignment) => assignment.supplierId === supplier.id)).sort((a, b) => a.name.localeCompare(b.name)), [suppliers, viewedRfq])

  const list = useMemo(() => {
    if (!rfqs) return []
    const search = q.trim().toLowerCase()
    return rfqs.filter((r) => {
      const matchesQ =
        !search ||
        [r.id, r.title, r.buyer, ...(r.assignments || []).map((a) => a.supplierName || a.supplierId)]
          .some((value) => String(value || '').toLowerCase().includes(search))
      const expired = r.deadline && r.deadline < today && ![STATUS.AWARDED, STATUS.CLOSED].includes(r.status)
      const open = ![STATUS.AWARDED, STATUS.CLOSED, STATUS.CANCELLED].includes(r.status)
      const matchesF =
        filter === 'All' ||
        (filter === 'Open' && open) ||
        (filter === 'Awarded' && r.status === STATUS.AWARDED) ||
        (filter === 'Closed' && r.status === STATUS.CLOSED) ||
        (filter === 'Expired' && expired)
      const creationDate = rfqCreationDate(r)
      return matchesQ && matchesF &&
        (!supplierFilter || r.assignments?.some((a) => a.supplierId === supplierFilter)) &&
        (!categoryFilter || r.category === categoryFilter) &&
        (!dateFrom || creationDate >= dateFrom) &&
        (!dateTo || creationDate <= dateTo)
    })
  }, [q, filter, supplierFilter, categoryFilter, dateFrom, dateTo, rfqs])

  const openSupplierView = async (id) => {
    setViewId(id); setAssignmentError(''); setAssignmentMessage(''); setSelectedSupplierId(''); setAssignmentType('full'); setSelectedLineIds([])
    if (can('rfq.create')) {
      try { setSuppliers(await Suppliers.list()) }
      catch (error) { setAssignmentError(error.message) }
    }
  }
  const addSupplier = async () => {
    if (!viewedRfq || !selectedSupplierId || (assignmentType === 'partial' && !selectedLineIds.length)) return
    setBusy(true); setAssignmentError(''); setAssignmentMessage('')
    try {
      await Rfqs.assign(viewedRfq.id, { supplierId: selectedSupplierId, type: assignmentType, lineIds: assignmentType === 'partial' ? selectedLineIds : [] })
      await loadRfqs()
      setAssignmentMessage(viewedRfq.status === STATUS.DRAFT ? 'Supplier selected. Publish the RFQ when it is ready to send.' : 'Supplier added to this RFQ.')
      setSelectedSupplierId(''); setAssignmentType('full'); setSelectedLineIds([])
    } catch (error) { setAssignmentError(error.message) }
    finally { setBusy(false) }
  }
  const clearFilters = () => { setQ(''); setFilter('All'); setSupplierFilter(''); setCategoryFilter(''); setDateFrom(''); setDateTo('') }
  const hasFilters = !!(q || supplierFilter || categoryFilter || dateFrom || dateTo || filter !== 'All')

  if (!rfqs && !loadError) return <Card><Spinner label="Loading RFQs…" /></Card>
  if (!rfqs) return <Card className="p-6 text-rose-700" role="alert">{loadError}</Card>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Request for Quotations</h1>
          <p className="mt-1 text-sm text-ink-500">{rfqs.length} total · {list.length} shown</p>
        </div>
        {can('rfq.create') && <Link to="/rfqs/new" className="btn-primary"><Plus size={16} /> Create RFQ</Link>}
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search RFQs</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" placeholder="Search RFQ number, title, buyer or supplier…" />
          </label>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <SlidersHorizontal size={16} className="mr-1 hidden shrink-0 text-ink-400 sm:block" />
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`chip whitespace-nowrap border transition ${
                  filter === f ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-500 hover:bg-ink-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr_auto] xl:items-end">
          <label className="block"><span className="label">Supplier</span><select className="input" value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}><option value="">All suppliers</option>{supplierOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="block"><span className="label">Category</span><select className="input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label className="block"><span className="label">Created from</span><input type="date" className="input" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label className="block"><span className="label">Created to</span><input type="date" className="input" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label>
          {hasFilters && <button type="button" className="btn-outline h-10" onClick={clearFilters}>Clear</button>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <Empty icon="rfq" title="No RFQs match your filters" hint="Try a different search or filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-3">RFQ</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Buyer</th>
                  <th className="px-5 py-3">Suppliers</th>
                  <th className="px-5 py-3">Creation Date</th>
                  <th className="px-5 py-3">Responses</th>
                  <th className="px-5 py-3">Deadline</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">RFQ file</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {list.map((r) => (
                  <tr key={r.id} className="group transition hover:bg-ink-50/60">
                    <td className="px-5 py-3.5">
                      <Link to={`/rfqs/${r.id}`} className="block">
                        <p className="font-semibold text-ink-800 group-hover:text-brand-700">{r.title}</p>
                        <p className="text-xs text-ink-400">{r.id}</p>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-ink-600">{r.category}</td>
                    <td className="px-5 py-3.5 text-ink-600">{r.buyer}</td>
                    <td className="px-5 py-3.5"><button type="button" onClick={() => openSupplierView(r.id)} className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500" aria-label={`View ${r.assignments?.length || 0} suppliers for ${r.title}`}><Eye size={15} /> View ({r.assignments?.length || 0})</button></td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-ink-600">{rfqCreationDate(r) || '—'}</td>
                    <td className="px-5 py-3.5 text-ink-600">{r.quoteCount ?? 0}/{r.assignments?.length ?? 0}</td>
                    <td className={`px-5 py-3.5 ${r.deadline && r.deadline < today ? 'text-rose-500' : 'text-ink-600'}`}>{r.deadline || '—'}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={r.status} /></td>
                    <td className="px-5 py-3.5"><a href={Rfqs.exportRfqItemsUrl(r.id)} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-brand-700 hover:underline" aria-label={`Download ${r.id} RFQ`}><Download size={14} /> Download</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Drawer open={!!viewedRfq} onClose={() => setViewId('')} title="RFQ suppliers" subtitle={viewedRfq ? `${viewedRfq.title} · ${viewedRfq.id}` : ''} width="max-w-xl" footer={viewedRfq && can('rfq.create') && <Link to={`/assign/${encodeURIComponent(viewedRfq.id)}`} onClick={() => setViewId('')} className="btn-outline">Open assignment workspace</Link>}>
        {viewedRfq && <>
          <div className="flex items-center justify-between"><p className="text-sm font-semibold text-ink-800">Selected suppliers</p><span className="chip bg-brand-50 text-brand-700">{viewedRfq.assignments?.length || 0}</span></div>
          {!viewedRfq.assignments?.length ? <p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-500">No suppliers selected for this RFQ yet.</p> : <div className="space-y-2">{viewedRfq.assignments.map((assignment) => {
            const names = (viewedRfq.lines || []).filter((line) => assignment.lineIds?.includes(line.lineId)).map((line) => line.name)
            return <div key={assignment.id || assignment.supplierId} className="rounded-xl border border-ink-100 p-3"><p className="font-semibold text-ink-800">{assignment.supplierName || assignment.supplierId}</p><p className="mt-1 text-xs text-ink-500">{assignment.type === 'full' ? `Full RFQ · ${names.length || viewedRfq.lines.length} items` : `${names.length} assigned item${names.length === 1 ? '' : 's'}`}</p>{assignment.type === 'partial' && <p className="mt-1 text-xs text-ink-600">{names.join(', ') || 'No current items'}</p>}</div>
          })}</div>}
          {canAssign && <div className="space-y-3 border-t border-ink-100 pt-5">
            <div><h3 className="font-semibold text-ink-900">Add supplier</h3><p className="mt-1 text-xs text-ink-500">{viewedRfq.status === STATUS.DRAFT ? 'Supplier selection remains a draft until the RFQ is published.' : 'The supplier can access the assigned items immediately.'}</p></div>
            <label className="block"><span className="label">Supplier</span><select className="input" value={selectedSupplierId} onChange={(event) => setSelectedSupplierId(event.target.value)}><option value="">Select a supplier</option>{availableSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            {!availableSuppliers.length && <p className="text-xs text-ink-500">No more qualified suppliers are available.</p>}
            <fieldset className="space-y-2"><legend className="label">Items to assign</legend><label className="flex items-center gap-2 text-sm text-ink-700"><input type="radio" name="assignment-type" checked={assignmentType === 'full'} onChange={() => setAssignmentType('full')} /> Full RFQ</label><label className="flex items-center gap-2 text-sm text-ink-700"><input type="radio" name="assignment-type" checked={assignmentType === 'partial'} onChange={() => setAssignmentType('partial')} /> Selected items</label></fieldset>
            {assignmentType === 'partial' && <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-ink-100 p-3"><button type="button" className="mb-1 text-xs font-semibold text-brand-700 hover:underline" onClick={() => setSelectedLineIds(selectedLineIds.length === viewedRfq.lines.length ? [] : viewedRfq.lines.map((line) => line.lineId))}>{selectedLineIds.length === viewedRfq.lines.length ? 'Clear all' : 'Select all'}</button>{viewedRfq.lines.map((line) => <label key={line.lineId} className="flex items-start gap-2 rounded px-1 py-1 text-sm text-ink-700 hover:bg-ink-50"><input type="checkbox" className="mt-1" checked={selectedLineIds.includes(line.lineId)} onChange={() => setSelectedLineIds((ids) => ids.includes(line.lineId) ? ids.filter((id) => id !== line.lineId) : [...ids, line.lineId])} /><span>{line.name}</span></label>)}</div>}
            {assignmentError && <p role="alert" className="text-sm text-rose-700">{assignmentError}</p>}{assignmentMessage && <p role="status" className="text-sm text-emerald-700">{assignmentMessage}</p>}
            <button type="button" className="btn-primary" disabled={busy || !selectedSupplierId || (assignmentType === 'partial' && !selectedLineIds.length)} onClick={addSupplier}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Add supplier</button>
          </div>}
        </>}
      </Drawer>
    </div>
  )
}
