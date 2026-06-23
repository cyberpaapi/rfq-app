import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { statusStyle } from '../data/mock'

export function Card({ className = '', children }) {
  return <div className={`card ${className}`}>{children}</div>
}

export function StatusBadge({ status }) {
  return <span className={`chip ${statusStyle(status)}`}>{status}</span>
}

export function Stat({ icon: Icon, label, value, sub, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
  }
  return (
    <Card className="p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-ink-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-ink-400">{sub}</p>}
        </div>
        {Icon && (
          <div className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </Card>
  )
}

export function SectionTitle({ children, action }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-base font-bold text-ink-900">{children}</h2>
      {action}
    </div>
  )
}

export function Empty({ icon: Icon, title, hint }) {
  return (
    <div className="grid place-items-center py-16 text-center">
      {Icon && (
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-ink-100 text-ink-400">
          <Icon size={22} />
        </div>
      )}
      <p className="font-semibold text-ink-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-400">{hint}</p>}
    </div>
  )
}

export function Avatar({ name, size = 36 }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 65% 55%)` }}
    >
      {initials}
    </div>
  )
}

export function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-400">
      <Loader2 size={18} className="animate-spin" /> {label || 'Loading…'}
    </div>
  )
}

export function Tag({ children, onRemove, tone = 'ink' }) {
  const tones = {
    ink: 'bg-ink-100 text-ink-600',
    brand: 'bg-brand-50 text-brand-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <span className={`chip ${tones[tone]}`}>
      {children}
      {onRemove && (
        <button onClick={onRemove} className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-black/10">
          <X size={11} />
        </button>
      )}
    </span>
  )
}

// Free-form tag editor with suggestions. Enforces case-insensitive uniqueness locally.
export function TagInput({ value = [], onChange, suggestions = [], placeholder = 'Add tag + Enter' }) {
  const [text, setText] = useState('')
  const norm = (s) => s.trim().toLowerCase()
  const add = (t) => {
    const v = t.trim()
    if (!v) return
    if (value.some((x) => norm(x) === norm(v))) { setText(''); return }
    onChange([...value, v])
    setText('')
  }
  const filtered = suggestions
    .filter((s) => !value.some((v) => norm(v) === norm(s)) && (!text || norm(s).includes(norm(text))))
    .slice(0, 6)
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-ink-200 p-2 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-500/10">
        {value.map((t) => (
          <Tag key={t} tone="brand" onRemove={() => onChange(value.filter((x) => x !== t))}>{t}</Tag>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(text) }
            if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          placeholder={value.length ? '' : placeholder}
          className="min-w-24 flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-ink-400"
        />
      </div>
      {text && filtered.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {filtered.map((s) => (
            <button key={s} onClick={() => add(s)} className="chip bg-ink-50 text-ink-500 hover:bg-brand-50 hover:text-brand-700">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// Shows the first `limit` items, then a "+N more" pill that expands; "Shrink" retracts.
export function ClampList({ items = [], limit = 5, render }) {
  const [open, setOpen] = useState(false)
  const shown = open ? items : items.slice(0, limit)
  const extra = items.length - limit
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((it, i) => render(it, i))}
      {items.length > limit && (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
          className="chip border border-ink-200 bg-white text-ink-500 hover:bg-ink-50"
        >
          {open ? 'Shrink' : `+${extra} more`}
        </button>
      )}
    </div>
  )
}

// Truncates long text with a more/less toggle.
export function ExpandableText({ text, clamp = 110, className = 'text-sm text-ink-500' }) {
  const [open, setOpen] = useState(false)
  if (!text) return <span className="text-ink-300">—</span>
  const long = text.length > clamp
  return (
    <p className={className}>
      {open || !long ? text : text.slice(0, clamp).trimEnd() + '… '}
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="font-semibold text-brand-600 hover:text-brand-700">
          {open ? ' less' : 'more'}
        </button>
      )}
    </p>
  )
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'max-w-md' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside className={`absolute right-0 top-0 flex h-full w-full ${width} flex-col bg-white shadow-card-lg animate-slide-in`}>
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{title}</h2>
            {subtitle && <p className="text-xs text-ink-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700"><X size={20} /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-6 py-4">{footer}</div>}
      </aside>
    </div>
  )
}

export function Progress({ value, tone = 'brand' }) {
  const tones = { brand: 'bg-brand-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500' }
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={`h-full rounded-full ${tones[tone]}`} style={{ width: `${value}%` }} />
    </div>
  )
}
