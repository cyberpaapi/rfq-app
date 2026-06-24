import { Router } from 'express'
import * as store from '../store.js'

const router = Router()

// GET /api/notifications — newest first.
router.get('/', (_req, res) => {
  res.json([...store.all('notifications')].sort((a, b) => b.at - a.at))
})

// Mark one read.
router.post('/:id/read', (req, res) => {
  const updated = store.update('notifications', req.params.id, { unread: false })
  if (!updated) return res.status(404).json({ error: 'not found' })
  res.json(updated)
})

// Mark all read.
router.post('/read-all', (_req, res) => {
  for (const n of store.all('notifications')) {
    if (n.unread) store.update('notifications', n.id, { unread: false })
  }
  res.json({ ok: true })
})

export default router
