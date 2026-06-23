import express from 'express'
import cors from 'cors'
import * as store from './store.js'
import suppliers from './routes/suppliers.js'
import items from './routes/items.js'
import rfqs from './routes/rfqs.js'
import ingest from './routes/ingest.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, ai: !!process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-4o-mini') : 'fallback' }),
)

app.get('/api/tags', (_req, res) => res.json(store.allTags()))
app.post('/api/reset', (_req, res) => { store.reset(); res.json({ ok: true }) })

app.use('/api/suppliers', suppliers)
app.use('/api/items', items)
app.use('/api/rfqs', rfqs)
app.use('/api/ingest', ingest)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'server error' })
})

app.listen(PORT, () => {
  console.log(`\n  RFQ Hub API  →  http://localhost:${PORT}/api`)
  console.log(`  AI engine    →  ${process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-4o-mini') : 'fallback (no OPENAI_API_KEY)'}\n`)
})
