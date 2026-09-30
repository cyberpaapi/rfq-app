import { track } from '../diagnostics'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Menu, X, LogOut, Volume2, VolumeX,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Notifications } from '../api/client'
import { Avatar } from './ui'
import BrandIcon from './BrandIcon'

const fmtAgo = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// `perm` may be a string or array (any-of). Omit to always show.
// `section` groups items under a small heading; `perm` (string|array, any-of) gates visibility.
const nav = [
  { to: '/', label: 'Dashboard', art: 'dashboard', end: true, perm: 'reports.view' },
  { to: '/rfqs', label: 'RFQs', art: 'rfq', perm: 'workspace.view' },

  { section: 'Sourcing' },
  { to: '/items', label: 'Item Catalogue', art: 'items', perm: 'rfq.create' },
  { to: '/import', label: 'AI Import', art: 'ai', perm: ['rfq.create', 'ai.use'], all: true },
  { to: '/assign', label: 'Assign Suppliers', art: 'assign', perm: 'rfq.create' },
  { to: '/suppliers', label: 'Suppliers', art: 'suppliers', perm: ['supplier.manage', 'supplier.create'] },

  { section: 'Evaluation' },
  { to: '/compare', label: 'Quote Comparison', art: 'compare', perm: 'rfq.evaluate' },
  { to: '/award', label: 'Evaluation & Award', art: 'award', perm: ['rfq.evaluate', 'award.decide', 'approve.hod', 'approve.finance'] },

  { section: 'Portal & Admin' },
  { to: '/supplier', label: 'Supplier Portal', art: 'portal', perm: ['portal.access', 'supplier.response.edit'] },
  { to: '/reports', label: 'Reports', art: 'reports', perm: 'reports.view' },
  { to: '/audit', label: 'Audit & Compliance', art: 'audit', perm: 'audit.view' },
  { to: '/users', label: 'Roles & Users', art: 'accounts', perm: 'users.manage' },
  { to: '/currencies', label: 'Currencies', art: 'cost', perm: 'users.manage' },
]

function Sidebar({ onNavigate }) {
  const { current, can } = useAuth()
  const visible = (n) => {
    if (!n.perm) return true
    const perms = Array.isArray(n.perm) ? n.perm : [n.perm]
    return n.all ? perms.every((p) => can(p)) : perms.some((p) => can(p))
  }
  // Keep a section header only if at least one item under it is visible.
  const allowed = nav.filter((n, i) => {
    if (n.section) {
      for (let j = i + 1; j < nav.length && !nav[j].section; j++) if (visible(nav[j])) return true
      return false
    }
    return visible(n)
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <BrandIcon name="mark" size={42} />
        <div className="leading-tight">
          <p className="text-sm font-extrabold text-ink-900">OPRO</p>
          <p className="text-[11px] font-medium text-ink-400">Procurement Suite</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {allowed.map((n) =>
          n.section ? (
            <p key={n.section} className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-ink-300">{n.section}</p>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
                }`
              }
            >
              {() => {
                return (
                  <>
                    <BrandIcon name={n.art} size={28} />
                    {n.label}
                  </>
                )
              }}
            </NavLink>
          ),
        )}
      </nav>

      {can('rfq.create') && (
        <div className="m-3 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
          <p className="text-sm font-bold">Need a new quote?</p>
          <p className="mt-1 text-xs text-brand-100">Start an RFQ from Excel, the item tree or search.</p>
          <NavLink
            to="/rfqs/new"
            onClick={onNavigate}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-white/25"
          >
            <BrandIcon name="create" size={19} /> Create RFQ
          </NavLink>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-ink-100 px-4 py-4">
        <Avatar name={current.label} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-ink-800">{current.label}</p>
          <p className="truncate text-xs text-ink-400">{current.username}{current.readOnly ? ' · Read-only' : ''}</p>
        </div>
      </div>
    </div>
  )
}

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [bell, setBell] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('opro.notificationSound') !== 'off')
  const seenIds = useRef(null)
  const audioContext = useRef(null)
  const loc = useLocation()
  const navigate = useNavigate()
  useEffect(() => { track('ui.navigation', `Opened ${loc.pathname}`) }, [loc.pathname])
  const { can, current, logout } = useAuth()
  const canViewNotifications = can('workspace.view') && !current.supplierId
  const unread = notifications.filter((n) => n.unread).length

  const chime = useCallback(async () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return
      const ctx = audioContext.current || (audioContext.current = new AudioContext())
      if (ctx.state === 'suspended') await ctx.resume()
      for (const [offset, frequency] of [[0, 660], [0.13, 880]]) {
        const oscillator = ctx.createOscillator()
        const volume = ctx.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency
        volume.gain.setValueAtTime(0.0001, ctx.currentTime + offset)
        volume.gain.exponentialRampToValueAtTime(0.025, ctx.currentTime + offset + 0.015)
        volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.16)
        oscillator.connect(volume).connect(ctx.destination)
        oscillator.start(ctx.currentTime + offset)
        oscillator.stop(ctx.currentTime + offset + 0.17)
      }
    } catch { /* The browser may block audio before user interaction. */ }
  }, [])
  const loadNotifications = useCallback(async () => {
    try {
      const fresh = await Notifications.list()
      const previous = seenIds.current
      if (previous && soundOn && document.visibilityState === 'visible' && fresh.some((n) => n.unread && !previous.has(n.id) && ['approval_request', 'response', 'clarification'].includes(n.type))) chime()
      seenIds.current = new Set(fresh.map((n) => n.id))
      setNotifications(fresh)
    } catch { /* Keep the last list during a transient network failure. */ }
  }, [chime, soundOn])
  useEffect(() => {
    if (!canViewNotifications) return
    loadNotifications()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') loadNotifications() }, 30000)
    const onFocus = () => loadNotifications()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [canViewNotifications, current.id, loc.pathname, loadNotifications])
  useEffect(() => { setBell(false) }, [loc.pathname])
  useEffect(() => {
    if (!bell) return
    const onKeyDown = (event) => { if (event.key === 'Escape') setBell(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bell])
  useEffect(() => () => { audioContext.current?.close().catch(() => {}) }, [])

  const markAllRead = async () => {
    try { await Notifications.readAll(); await loadNotifications() } catch { /* Retry on next refresh. */ }
  }
  const openNotification = (notice) => {
    setBell(false)
    if (notice.unread) {
      setNotifications((items) => items.map((item) => item.id === notice.id ? { ...item, unread: false } : item))
      Notifications.read(notice.id).catch(() => loadNotifications())
    }
    if (notice.rfqId) navigate(notice.type === 'approval_request' ? `/award?rfq=${encodeURIComponent(notice.rfqId)}` : `/rfqs/${encodeURIComponent(notice.rfqId)}`)
  }
  const toggleSound = () => {
    const enabled = !soundOn
    setSoundOn(enabled)
    localStorage.setItem('opro.notificationSound', enabled ? 'on' : 'off')
  }
  const toggleBell = () => {
    setBell((open) => !open)
    loadNotifications()
    if (soundOn) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext
        if (AudioContext) {
          audioContext.current ||= new AudioContext()
          audioContext.current.resume().catch(() => {})
        }
      } catch { /* Audio is optional if the browser blocks it. */ }
    }
  }

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-ink-100 bg-white lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-card-lg animate-slide-in">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-100 bg-white/80 px-4 py-3 backdrop-blur-md lg:px-6">
          <button className="btn-ghost lg:hidden -ml-2 px-2" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>

          <div className="relative hidden max-w-md flex-1 sm:block">
            <BrandIcon name="search" size={21} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2" />
            <input className="input pl-9" placeholder="Search RFQ number, supplier, status…" />
          </div>

          <div className="flex flex-1 items-center justify-end gap-2">
            {canViewNotifications && <div className="relative">
              <span role="status" aria-atomic="true" className="sr-only">{unread ? `${unread} unread notifications` : 'No unread notifications'}</span>
              <button type="button" className="btn-ghost relative min-h-11 min-w-11 px-2.5" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={bell} aria-haspopup="dialog" onClick={toggleBell}>
                <BrandIcon name="bell" size={25} />
                {unread > 0 && (
                  <span className="absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white" aria-hidden="true">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
              {bell && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBell(false)} />
                  <div role="dialog" aria-label="Notifications" className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card-lg animate-fade-in">
                    <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                      <p className="text-sm font-bold text-ink-900">Notifications {unread > 0 && <span className="ml-1 text-brand-600">({unread})</span>}</p>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={toggleSound} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-50 hover:text-ink-900" aria-label={soundOn ? 'Mute notification sound' : 'Enable notification sound'} title={soundOn ? 'Mute sound' : 'Enable sound'}>{soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
                        <button type="button" onClick={() => setBell(false)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-50 hover:text-ink-900" aria-label="Close notifications"><X size={17} /></button>
                      </div>
                    </div>
                    {unread > 0 && <div className="border-b border-ink-100 px-4 py-2 text-right"><button type="button" onClick={markAllRead} className="text-xs font-semibold text-brand-700 hover:underline">Mark all read</button></div>}
                    <div className="max-h-96 overflow-auto">
                      {notifications.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-400">No notifications</p>}
                      {notifications.map((n) => (
                        <button type="button" key={n.id} onClick={() => openNotification(n)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-brand-50/70 focus-visible:bg-brand-50 ${n.unread ? 'bg-brand-50/40' : ''}`}>
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.unread ? 'bg-brand-500' : 'bg-ink-200'}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink-800">{n.title}</p>
                            <p className="text-xs text-ink-400">{n.rfqId || ''} · {fmtAgo(n.at)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>}

            <span className="hidden items-center gap-2 rounded-xl border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 sm:inline-flex"><Avatar name={current.label} size={22} />{current.label}</span>
            <button type="button" className="btn-outline px-3 py-2" onClick={logout} aria-label="Sign out"><LogOut size={16} /><span className="hidden sm:inline">Sign out</span></button>

            {can('rfq.create') && (
              <NavLink to="/rfqs/new" className="btn-primary hidden sm:inline-flex">
                <BrandIcon name="create" size={20} /> New RFQ
              </NavLink>
            )}
          </div>
        </header>

        <main key={loc.pathname} className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
