import { Router } from 'express'
import * as store from '../store.js'
import { normalize } from '../lib/tags.js'

const router = Router()

// GET /api/audit?rfqId=&q=   — newest first.
router.get('/', (req, res) => {
  const { rfqId, q } = req.query
  let list = [...store.all('audit')].sort((a, b) => b.at - a.at)
  if (rfqId) list = list.filter((a) => a.rfqId === rfqId)
  if (q) {
    const needle = normalize(q)
    list = list.filter((a) =>
      [a.rfqId, a.user, a.action, a.field, a.old, a.value].some((v) => normalize(v || '').includes(needle)),
    )
  }
  res.json(list)
})

export default router
