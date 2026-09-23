import express from 'express'
import auth from './routes/auth.js'
import logs from './routes/logs.js'
import uploads from './routes/uploads.js'
import roles from './routes/roles.js'
import users from './routes/users.js'
import { accessControl } from './lib/access.js'
import { requestLogging } from './lib/diagnostics.js'
import * as store from './store.js'
import suppliers from './routes/suppliers.js'
import items from './routes/items.js'
import rfqs from './routes/rfqs.js'
import ingest from './routes/ingest.js'
import audit from './routes/audit.js'
import notifications from './routes/notifications.js'
import reports from './routes/reports.js'
import exporter from './routes/export.js'

const app = express()

app.use(requestLogging)
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    ai: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-5.4-mini') : 'fallback',
    clubModel: process.env.OPENAI_CLUB_MODEL || 'gpt-5.5',
  }),
)


app.use('/api', (req, res, next) => {
  if (process.env.DATABASE_URL) return store.cloudPersistence(req, res, next)
  if (process.env.VERCEL) return res.status(503).json({ error: 'Hosted database is not configured.' })
  next()
})

// Browser writes must come from the app's same-origin client. A custom header
// blocks cross-site forms while the session cookie stays HttpOnly.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (req.get('x-opro-request') !== '1') return res.status(403).json({ error: 'Invalid request origin.' })
  const origin = req.get('origin')
  if (origin) {
    try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Invalid request origin.' }) }
    catch { return res.status(403).json({ error: 'Invalid request origin.' }) }
  }
  next()
})
app.use('/api/auth', auth)
app.use('/api', accessControl)
app.use('/api/roles', roles)
app.use('/api/users', users)
app.use('/api/logs', logs)
app.use('/api/uploads', uploads)

app.get('/api/tags', (_req, res) => res.json(store.allTags()))
app.post('/api/reset', (_req, res) => { store.reset(); res.json({ ok: true }) })

app.use('/api/suppliers', suppliers)
app.use('/api/items', items)
app.use('/api/rfqs', rfqs)
app.use('/api/ingest', ingest)
app.use('/api/audit', audit)
app.use('/api/notifications', notifications)
app.use('/api/reports', reports)
app.use('/api/export', exporter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large. Use the direct upload flow for files up to 50 MB.' : err.message || 'server error' })
})

export default app
