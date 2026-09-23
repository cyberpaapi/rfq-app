import { Router } from 'express'
import { appendEvents, queryLogs } from '../lib/diagnostics.js'

const router = Router()
router.get('/', async (req, res) => {
  try { res.json(await queryLogs(req.query)) }
  catch { res.status(503).json({ error: 'Logs are temporarily unavailable.' }) }
})
router.post('/events', async (req, res) => {
  const allowed = new Set(['ui.click', 'ui.change', 'ui.navigation', 'ui.error', 'ui.identity'])
  if (!Array.isArray(req.body?.events) || req.body.events.length > 25) return res.status(400).json({ error: 'Provide up to 25 events.' })
  const events = req.body.events.filter((e) => e && allowed.has(e.event)).map((e) => ({
    event: e.event, path: e.path, message: e.message,
    level: e.event === 'ui.error' ? 'error' : 'info', actor: req.get('x-user-name') || 'System',
  }))
  try { await appendEvents(events); res.json({ recorded: events.length }) }
  catch { res.status(503).json({ error: 'Could not record diagnostics.' }) }
})
export default router
