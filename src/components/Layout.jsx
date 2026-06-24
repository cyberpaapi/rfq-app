import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users as UsersIcon, GitCompareArrows, Award,
  BarChart3, ShieldCheck, Bell, Search, Plus, Menu, X, UserCog, ChevronDown, Check,
  Package, Sparkles, Send, Store,
} from 'lucide-react'
import { ROLES, roleColor } from '../data/auth'
import { useAuth } from '../context/AuthContext'
import { Notifications } from '../api/client'
import { Avatar } from './ui'

const fmtAgo = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// `perm` may be a string or array (any-of). Omit to always show.
// `section` groups items under a small heading; `perm` (string|array, any-of) gates visibility.
const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/rfqs', label: 'RFQs', icon: FileText },

  { section: 'Sourcing' },
  { to: '/items', label: 'Item Catalogue', icon: Package, perm: 'rfq.create' },
  { to: '/import', label: 'AI Import', icon: Sparkles, perm: 'rfq.create' },
  { to: '/assign', label: 'Assign Suppliers', icon: Send, perm: 'rfq.create' },
  { to: '/suppliers', label: 'Suppliers', icon: UsersIcon, perm: 'supplier.manage' },

  { section: 'Evaluation' },
  { to: '/compare', label: 'Quote Comparison', icon: GitCompareArrows, perm: 'rfq.evaluate' },
  { to: '/award', label: 'Evaluation & Award', icon: Award, perm: ['rfq.evaluate', 'award.decide', 'approve.hod', 'approve.finance'] },

  { section: 'Portal & Admin' },
  { to: '/portal', label: 'Supplier Portal', icon: Store, perm: ['portal.access', 'rfq.create'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
  { to: '/audit', label: 'Audit & Compliance', icon: ShieldCheck, perm: 'audit.view' },
  { to: '/users', label: 'Users & Access', icon: UserCog, perm: 'users.manage' },
]

function Sidebar({ onNavigate }) {
  const { current, can } = useAuth()
  const visible = (n) => {
    if (!n.perm) return true
    const perms = Array.isArray(n.perm) ? n.perm : [n.perm]
    return perms.some((p) => can(p))
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
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/40">
          <span className="text-lg font-extrabold">R</span>
        </div>
        <div className="leading-tight">
          <p className="text-sm font-extrabold text-ink-900">RFQ Hub</p>
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
              {({ isActive }) => {
                const Icon = n.icon
                return (
                  <>
                    <Icon size={18} className={isActive ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600'} />
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
            <Plus size={14} /> Create RFQ
          </NavLink>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-ink-100 px-4 py-4">
        <Avatar name={current.name} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-ink-800">{current.name}</p>
          <p className="truncate text-xs text-ink-400">{ROLES[current.role]?.label}</p>
        </div>
        <span className={`chip ${roleColor(current.role)} px-2 py-0.5 text-[10px]`}>{current.role}</span>
      </div>
    </div>
  )
}

function IdentitySwitcher() {
  const { users, current, switchTo } = useAuth()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-outline gap-2 py-2">
        <Avatar name={current.name} size={22} />
        <span className="hidden max-w-28 truncate sm:inline">{current.name}</span>
        <ChevronDown size={15} className="text-ink-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card-lg animate-fade-in">
            <div className="border-b border-ink-100 px-4 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-400">View as (demo RBAC)</p>
            </div>
            <div className="max-h-80 overflow-auto py-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { switchTo(u.id); setOpen(false) }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-50"
                >
                  <Avatar name={u.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-800">{u.name}</p>
                    <p className="truncate text-xs text-ink-400">{ROLES[u.role]?.label}</p>
                  </div>
                  {u.id === current.id && <Check size={16} className="text-brand-600" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [bell, setBell] = useState(false)
  const [notifications, setNotifications] = useState([])
  const loc = useLocation()
  const { can } = useAuth()
  const unread = notifications.filter((n) => n.unread).length

  const loadNotifications = () => Notifications.list().then(setNotifications).catch(() => {})
  // Refresh on navigation so newly-triggered events show up.
  useEffect(() => { loadNotifications() }, [loc.pathname])

  const markAllRead = async () => {
    await Notifications.readAll().catch(() => {})
    loadNotifications()
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
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" placeholder="Search RFQ number, supplier, status…" />
          </div>

          <div className="flex flex-1 items-center justify-end gap-2">
            <div className="relative">
              <button className="btn-ghost relative px-2.5" onClick={() => setBell((v) => !v)}>
                <Bell size={19} />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </button>
              {bell && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBell(false)} />
                  <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card-lg animate-fade-in">
                    <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                      <p className="text-sm font-bold">Notifications</p>
                      <div className="flex items-center gap-2">
                        {unread > 0 && <button onClick={markAllRead} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Mark all read</button>}
                        <button onClick={() => setBell(false)}><X size={16} className="text-ink-400" /></button>
                      </div>
                    </div>
                    <div className="max-h-96 overflow-auto">
                      {notifications.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-400">No notifications</p>}
                      {notifications.map((n) => (
                        <div key={n.id} className={`flex gap-3 px-4 py-3 ${n.unread ? 'bg-brand-50/40' : ''}`}>
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.unread ? 'bg-brand-500' : 'bg-ink-200'}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink-800">{n.title}</p>
                            <p className="text-xs text-ink-400">{n.rfqId || ''} · {fmtAgo(n.at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <IdentitySwitcher />

            {can('rfq.create') && (
              <NavLink to="/rfqs/new" className="btn-primary hidden sm:inline-flex">
                <Plus size={16} /> New RFQ
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
