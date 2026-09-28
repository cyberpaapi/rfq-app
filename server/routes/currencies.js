import { Router } from 'express'
import * as store from '../store.js'

const router = Router()
const response = (item) => ({ code: item.code, name: item.name, active: item.active, base: item.code === 'USD' })

router.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(store.getCurrencies().map(response))
})

router.post('/', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase()
  const name = String(req.body?.name || '').trim()
  if (!/^[A-Z]{3}$/.test(code)) return res.status(400).json({ error: 'Enter a three-letter currency code.' })
  if (!name || name.length > 80) return res.status(400).json({ error: 'Enter a currency name of up to 80 characters.' })
  if (store.getCurrencies().some((item) => item.code === code)) return res.status(409).json({ error: 'This currency already exists.' })
  const item = { id: code, code, name, active: true, base: code === 'USD' }
  store.insert('currencies', item)
  store.logAudit({ user: 'Administrator', action: 'Added currency', field: code, value: name })
  res.status(201).json(response(item))
})

router.put('/:code', (req, res) => {
  const code = req.params.code.toUpperCase()
  const item = store.getCurrencies().find((entry) => entry.code === code)
  if (!item) return res.status(404).json({ error: 'Currency not found.' })
  const name = req.body?.name === undefined ? item.name : String(req.body.name).trim()
  if (!name || name.length > 80) return res.status(400).json({ error: 'Enter a currency name of up to 80 characters.' })
  if (typeof req.body?.active !== 'boolean') return res.status(400).json({ error: 'Choose whether the currency is active.' })
  if (code === 'USD' && !req.body.active) return res.status(400).json({ error: 'USD is the base currency and must stay active.' })
  const updated = store.update('currencies', item.id, { name, active: req.body.active })
  store.logAudit({ user: 'Administrator', action: 'Updated currency', field: code, old: JSON.stringify(response(item)), value: JSON.stringify(response(updated)) })
  res.json(response(updated))
})

export default router
