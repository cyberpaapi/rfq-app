import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

export const LOG_POLICY = { days: 15, maxEntries: 20000, maxBytes: 25 * 1024 * 1024 }
const context = new AsyncLocalStorage()
const localPath = join(process.env.RFQ_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '../data'), 'diagnostics.json')
let localEntries, queue = Promise.resolve(), sql, initialized

export function redact(value) {
  return String(value ?? '').replace(/(?:Bearer\s+|sk-(?:proj-)?|ghp_)[A-Za-z0-9_.-]+/gi, '[redacted]')
    .replace(/((?:password|token|api[_-]?key|authorization|cookie)["']?\s*[:=]\s*)["']?[^\s,;"'}]+/gi, '$1[redacted]')
    .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, '$1[redacted]@').slice(0, 1000)
}

export function cleanEvent(event) {
  return {
    id: randomUUID(), at: Date.now(),
    level: ['info', 'warn', 'error'].includes(event.level) ? event.level : 'info',
    event: redact(event.event || 'event').slice(0, 80),
    actor: redact(event.actor || 'System').slice(0, 80),
    requestId: redact(event.requestId).slice(0, 80),
    method: redact(event.method).slice(0, 10), path: redact(String(event.path || '').split('?')[0]).slice(0, 200),
    status: Number(event.status) || 0, durationMs: Math.max(0, Math.round(Number(event.durationMs) || 0)),
    message: redact(event.message),
    // Details use explicitly selected metadata; never request bodies or file contents.
    details: redact(JSON.stringify(event.details || {})).slice(0, 1000),
  }
}

export function trimEntries(entries, now = Date.now()) {
  const fresh = entries.filter((e) => e.at >= now - LOG_POLICY.days * 86400000).slice(-LOG_POLICY.maxEntries)
  let bytes = 0, start = fresh.length
  while (start > 0) {
    const size = Buffer.byteLength(JSON.stringify(fresh[start - 1]))
    if (bytes + size > LOG_POLICY.maxBytes) break
    bytes += size; start--
  }
  return fresh.slice(start)
}

async function initialize() {
  if (!process.env.DATABASE_URL) return
  sql ||= neon(process.env.DATABASE_URL)
  initialized ||= sql`CREATE TABLE IF NOT EXISTS opro_logs (
    id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
    entry jsonb NOT NULL, bytes integer NOT NULL
  )`.catch((e) => { initialized = null; throw e })
  await initialized
}

async function localTask(fn) {
  const task = queue.then(async () => {
    if (!localEntries) {
      try { localEntries = JSON.parse(await readFile(localPath, 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e; localEntries = [] }
    }
    localEntries = trimEntries(localEntries)
    return fn()
  })
  queue = task.catch(() => {})
  return task
}

export async function appendEvents(events) {
  const entries = events.slice(0, 25).map(cleanEvent)
  if (!entries.length) return
  if (process.env.DATABASE_URL) {
    await initialize()
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(729351)`,
      sql`INSERT INTO opro_logs (entry, bytes) SELECT value, octet_length(value::text) FROM jsonb_array_elements(${JSON.stringify(entries)}::jsonb)`,
      sql`DELETE FROM opro_logs WHERE at < now() - interval '15 days'`,
      sql`WITH ranked AS (SELECT id, row_number() OVER (ORDER BY id DESC) AS n,
        sum(bytes) OVER (ORDER BY id DESC) AS total FROM opro_logs)
        DELETE FROM opro_logs WHERE id IN (SELECT id FROM ranked WHERE n > ${LOG_POLICY.maxEntries} OR total > ${LOG_POLICY.maxBytes})`,
    ])
  } else {
    await localTask(async () => {
      localEntries = trimEntries([...localEntries, ...entries])
      await mkdir(dirname(localPath), { recursive: true })
      await writeFile(localPath + '.tmp', JSON.stringify(localEntries))
      await rename(localPath + '.tmp', localPath)
    })
  }
}

export async function queryLogs({ q = '', level = '', limit = 200 } = {}) {
  limit = Math.min(1000, Math.max(1, Number(limit) || 200))
  q = String(q).slice(0, 100); level = ['info', 'warn', 'error'].includes(level) ? level : ''
  if (process.env.DATABASE_URL) {
    await initialize()
    const rows = await sql`SELECT entry FROM opro_logs WHERE at >= now() - interval '15 days'
      AND (${level} = '' OR entry->>'level' = ${level}) AND (${q} = '' OR entry::text ILIKE ${'%' + q + '%'}) ORDER BY id DESC LIMIT ${limit}`
    const [stats] = await sql`SELECT count(*)::int AS count, coalesce(sum(bytes),0)::bigint AS bytes FROM opro_logs WHERE at >= now() - interval '15 days'`
    return { entries: rows.map((r) => r.entry), stats: { count: stats.count, bytes: Number(stats.bytes) }, policy: LOG_POLICY }
  }
  return localTask(() => ({ entries: localEntries.filter((e) => (!level || e.level === level) && JSON.stringify(e).toLowerCase().includes(q.toLowerCase())).slice(-limit).reverse(),
    stats: { count: localEntries.length, bytes: localEntries.reduce((n, e) => n + Buffer.byteLength(JSON.stringify(e)), 0) }, policy: LOG_POLICY }))
}

export function recordAction(action, details = {}) {
  const state = context.getStore()
  if (!state) return
  state.actionCount++
  if (state.actions.length < 12) state.actions.push({ action, ...details })
}

export async function loggedCompletion(client, params) {
  const start = Date.now()
  try {
    const response = await client.chat.completions.create(params)
    recordAction('ai.complete', { model: params.model, ms: Date.now() - start, tokens: response.usage?.total_tokens || 0 })
    return response
  } catch (error) {
    recordAction('ai.error', { model: params.model, ms: Date.now() - start, error: redact(error.message) })
    const state = context.getStore(); if (state) state.aiError = true
    throw error
  }
}

export function requestLogging(req, res, next) {
  if (!req.path.startsWith('/api/') || req.path === '/api/health' || req.path === '/api/logs/events') return next()
  const state = { requestId: randomUUID(), actions: [], actionCount: 0 }, start = Date.now()
  res.setHeader('X-Request-ID', state.requestId)
  const json = res.json.bind(res)
  res.json = (value) => { if (value?.error) state.error = redact(value.error); return json(value) }
  const end = res.end.bind(res)
  let finishing = false
  res.end = (...args) => {
    if (finishing) return res
    finishing = true
    const entry = { event: 'api.request', requestId: state.requestId, actor: req.get('x-user-name') || 'System',
      method: req.method, path: req.originalUrl, status: res.statusCode, durationMs: Date.now() - start,
      level: res.statusCode >= 500 || state.aiError ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      message: state.error || `${req.method} ${req.originalUrl.split('?')[0]}`, details: { actions: state.actions, actionCount: state.actionCount, aiError: !!state.aiError } }
    appendEvents([entry]).catch((e) => { console.error('[diagnostics] logging failed:', redact(e.message)); if (!res.headersSent) res.setHeader('X-Log-Status', 'unavailable') }).finally(() => end(...args))
    return res
  }
  context.run(state, next)
}
