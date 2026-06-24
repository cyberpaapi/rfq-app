import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { X, ChevronLeft, ChevronRight, FileText, Loader2, ZoomIn, ZoomOut, Maximize, Move } from 'lucide-react'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const PAN_STEP = 60

// Verification panel for the uploaded document.
//  - PDF: one page at a time; `target.page` jumps to a page.
//  - Image: shows the image.
//  - Spreadsheet ('rows'): renders the sheet AS A TABLE; `target.page` (a row id)
//    scrolls to and highlights that exact row.
//  - Text: shows the source text and scrolls to a line.
// PDF/images use transform zoom+pan (wheel/drag/arrows/WASD); table/text use
// font-scale zoom + native scroll (arrows/WASD scroll, Ctrl+wheel zooms).
export default function DocViewer({ file, kind, sourceText, sheets, target, onClose }) {
  const [pdf, setPdf] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const canvasRef = useRef(null)
  const imgUrlRef = useRef(null)
  const scrollBodyRef = useRef(null)
  const stageRef = useRef(null)
  const drag = useRef(null)
  const renderTask = useRef(null)

  const transformable = kind === 'pdf' || kind === 'images'
  const scrollable = kind === 'text' || kind === 'rows'

  const zoomBy = useCallback((f) => setZoom((z) => clamp(+(z * f).toFixed(3), 0.4, 6)), [])
  const resetView = useCallback(() => { setZoom(1); setOffset({ x: 0, y: 0 }) }, [])

  useEffect(() => {
    if (kind !== 'pdf' || !file) return
    let cancelled = false
    setLoading(true)
    file.arrayBuffer()
      .then((buf) => pdfjsLib.getDocument({ data: buf }).promise)
      .then((doc) => { if (!cancelled) { setPdf(doc); setNumPages(doc.numPages); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [file, kind])

  useEffect(() => {
    if (kind !== 'images' || !file) return
    const url = URL.createObjectURL(file)
    imgUrlRef.current = url
    return () => URL.revokeObjectURL(url)
  }, [file, kind])

  // React to a click target.
  useEffect(() => {
    if (!target) return
    if (kind === 'pdf' && target.page) { setPage(clamp(target.page, 1, numPages || target.page)); setOffset({ x: 0, y: 0 }) }
    if (kind === 'images') setOffset({ x: 0, y: 0 })
    if (kind === 'rows' && target.page) flashRow(scrollBodyRef.current?.querySelector(`[data-row="${target.page}"]`))
    if (kind === 'text' && target.source) {
      const m = String(target.source).match(/(\d+)/)
      flashRow(scrollBodyRef.current?.querySelector(`[data-row="${m ? Number(m[1]) : 1}"]`))
    }
    stageRef.current?.focus()
  }, [target, kind, numPages])

  function flashRow(el) {
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-amber-400', 'bg-amber-50')
    setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400', 'bg-amber-50'), 1800)
  }

  // Render the current PDF page. Zoom is baked INTO the render scale (and we
  // render at devicePixelRatio) so the page stays crisp when magnified instead
  // of being a CSS-stretched low-res bitmap. Re-renders whenever zoom changes.
  useEffect(() => {
    if (kind !== 'pdf' || !pdf || !canvasRef.current) return
    let cancelled = false
    pdf.getPage(page).then((p) => {
      if (cancelled) return
      const canvas = canvasRef.current
      const dpr = window.devicePixelRatio || 1
      const containerW = canvas.parentElement?.clientWidth || 600
      const base = p.getViewport({ scale: 1 })
      const fit = clamp((containerW - 24) / base.width, 0.4, 3) // fit page to panel width at 100%
      const cssScale = fit * zoom                                // on-screen size
      // Render at higher pixel density, capped so the canvas can't get huge.
      const MAX_EDGE = 5000
      let pxScale = cssScale * dpr
      pxScale = Math.min(pxScale, MAX_EDGE / base.width, MAX_EDGE / base.height)
      const viewport = p.getViewport({ scale: pxScale })
      const ctx = canvas.getContext('2d')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${Math.floor(base.width * cssScale)}px`
      canvas.style.height = `${Math.floor(base.height * cssScale)}px`
      if (renderTask.current) { try { renderTask.current.cancel() } catch { /* ignore */ } }
      renderTask.current = p.render({ canvasContext: ctx, viewport })
      renderTask.current.promise.catch(() => { /* cancelled / superseded */ })
    })
    return () => { cancelled = true }
  }, [pdf, page, kind, zoom])

  const onKeyDown = (e) => {
    const key = e.key.toLowerCase()
    if (transformable) {
      if (key === 'arrowup' || key === 'w') setOffset((o) => ({ ...o, y: o.y + PAN_STEP }))
      else if (key === 'arrowdown' || key === 's') setOffset((o) => ({ ...o, y: o.y - PAN_STEP }))
      else if (key === 'arrowleft' || key === 'a') setOffset((o) => ({ ...o, x: o.x + PAN_STEP }))
      else if (key === 'arrowright' || key === 'd') setOffset((o) => ({ ...o, x: o.x - PAN_STEP }))
      else if (key === '+' || key === '=') zoomBy(1.15)
      else if (key === '-' || key === '_') zoomBy(1 / 1.15)
      else return
      e.preventDefault()
    } else if (scrollable) {
      const el = scrollBodyRef.current
      if (!el) return
      if (key === 'arrowup' || key === 'w') el.scrollTop -= PAN_STEP
      else if (key === 'arrowdown' || key === 's') el.scrollTop += PAN_STEP
      else if (key === 'arrowleft' || key === 'a') el.scrollLeft -= PAN_STEP
      else if (key === 'arrowright' || key === 'd') el.scrollLeft += PAN_STEP
      else if (key === '+' || key === '=') zoomBy(1.15)
      else if (key === '-' || key === '_') zoomBy(1 / 1.15)
      else return
      e.preventDefault()
    }
  }

  const onWheel = (e) => {
    if (transformable) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 0.9) }
    else if (scrollable && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 0.9) }
  }

  const onMouseDown = (e) => { if (transformable) drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y } }
  const onMouseMove = (e) => { if (drag.current) setOffset({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }) }
  const endDrag = () => { drag.current = null }

  // Images: CSS scale (raster). PDF: pan only — zoom is rendered into the canvas.
  const tf = { transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: 'center center', transition: drag.current ? 'none' : 'transform 80ms ease-out' }
  const tfPan = { transform: `translate(${offset.x}px, ${offset.y}px)`, transition: drag.current ? 'none' : 'transform 80ms ease-out' }

  return (
    <div className="sticky top-20 flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-700">
          <FileText size={15} className="shrink-0 text-brand-500" />
          <span className="truncate">{file?.name || 'Verification'}</span>
        </div>
        <div className="flex items-center gap-1">
          {kind === 'pdf' && numPages > 0 && (
            <div className="mr-1 flex items-center gap-0.5 text-xs">
              <button className="rounded p-1 hover:bg-ink-100 disabled:opacity-30" disabled={page <= 1} onClick={() => { setPage((p) => Math.max(1, p - 1)); setOffset({ x: 0, y: 0 }) }}><ChevronLeft size={15} /></button>
              <span className="w-14 text-center font-semibold text-ink-600">{page}/{numPages}</span>
              <button className="rounded p-1 hover:bg-ink-100 disabled:opacity-30" disabled={page >= numPages} onClick={() => { setPage((p) => Math.min(numPages, p + 1)); setOffset({ x: 0, y: 0 }) }}><ChevronRight size={15} /></button>
            </div>
          )}
          <button title="Zoom out" className="rounded p-1 hover:bg-ink-100" onClick={() => zoomBy(1 / 1.2)}><ZoomOut size={15} /></button>
          <span className="w-10 text-center text-xs font-semibold text-ink-600">{Math.round(zoom * 100)}%</span>
          <button title="Zoom in" className="rounded p-1 hover:bg-ink-100" onClick={() => zoomBy(1.2)}><ZoomIn size={15} /></button>
          <button title="Reset view" className="rounded p-1 hover:bg-ink-100" onClick={resetView}><Maximize size={14} /></button>
          <button onClick={onClose} className="ml-1 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><X size={16} /></button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-b border-ink-100 bg-white px-3 py-1 text-[11px] text-ink-400">
        <Move size={11} /> {transformable ? 'Scroll to zoom · drag or arrows / WASD to pan' : 'Ctrl+scroll or buttons to zoom · arrows / WASD to scroll'}
      </div>

      <div
        ref={stageRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        className={`flex-1 outline-none ${transformable ? 'overflow-hidden ' + (drag.current ? 'cursor-grabbing' : 'cursor-grab') : 'overflow-auto'} bg-ink-100/40 p-3`}
      >
        {kind === 'pdf' && (
          loading ? <div className="flex items-center justify-center gap-2 py-20 text-sm text-ink-400"><Loader2 size={18} className="animate-spin" /> Loading document…</div>
            : <div className="flex min-h-full items-center justify-center" style={tfPan}><canvas ref={canvasRef} className="rounded-lg bg-white shadow-sm" /></div>
        )}

        {kind === 'images' && (
          <div className="flex min-h-full items-center justify-center" style={tf}>
            <img src={imgUrlRef.current} alt="uploaded document" className="rounded-lg bg-white shadow-sm" draggable={false} />
          </div>
        )}

        {kind === 'rows' && (
          <div ref={scrollBodyRef} className="h-full overflow-auto rounded-lg bg-white" style={{ fontSize: `${0.75 * zoom}rem` }}>
            {(sheets || []).map((s, si) => (
              <div key={si} className="mb-4">
                {(sheets.length > 1) && <p className="px-2 py-1 text-xs font-bold text-ink-600">{s.name}</p>}
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {(s.header || []).map((h, i) => (
                        <th key={i} className="sticky top-0 z-10 border border-ink-200 bg-ink-100 px-2 py-1 text-left font-semibold text-ink-700">{h || `Col ${i + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(s.rows || []).map((r) => (
                      <tr key={r.id} data-row={r.id} className="even:bg-ink-50/40">
                        {(r.cells.length ? r.cells : ['']).map((c, i) => (
                          <td key={i} className="border border-ink-100 px-2 py-1 align-top text-ink-700">
                            <span className="whitespace-pre-wrap break-words">{c}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {s.truncated && <p className="px-2 py-1 text-xs italic text-ink-400">… more rows not shown in preview.</p>}
              </div>
            ))}
            {(!sheets || sheets.length === 0) && <p className="py-20 text-center text-sm text-ink-400">No sheet data.</p>}
          </div>
        )}

        {kind === 'text' && (
          <div ref={scrollBodyRef} className="h-full overflow-auto rounded-lg bg-white p-3 font-mono leading-relaxed text-ink-700" style={{ fontSize: `${0.75 * zoom}rem` }}>
            {String(sourceText || 'No preview available.').split(/\r?\n/).map((ln, i) => (
              <div key={i} data-row={i} className="flex gap-3 rounded px-1">
                <span className="w-8 shrink-0 select-none text-right text-ink-300">{i}</span>
                <span className="whitespace-pre-wrap break-all">{ln}</span>
              </div>
            ))}
          </div>
        )}

        {!['pdf', 'images', 'rows', 'text'].includes(kind) && <p className="py-20 text-center text-sm text-ink-400">Preview not available for this file type.</p>}
      </div>
    </div>
  )
}
