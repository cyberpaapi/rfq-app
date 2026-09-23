import { Router } from 'express'
import { accountForRequest, checkCredentials, clearLoginFailures, endSession, loginThrottle, publicAccount, recordFailedLogin, startSession } from '../lib/auth.js'
import * as store from '../store.js'

const router = Router()

router.get('/me', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const active = accountForRequest(req)
  if (!active) return res.status(401).json({ error: 'Please sign in.' })
  res.json({ account: publicAccount(active.account) })
})

router.post('/login', async (req, res) => {
  if (!process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH) return res.status(503).json({ error: 'Administrator login is not configured.' })
  const username = String(req.body?.username || '').trim().toLowerCase()
  const password = req.body?.password
  if (!username || typeof password !== 'string' || username.length > 80 || password.length > 128) return res.status(401).json({ error: 'Invalid username or password.' })
  const attempt = loginThrottle(req, username)
  if (attempt.locked) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' })
  try {
    const account = await checkCredentials(username, password)
    if (!account) {
      recordFailedLogin(attempt.id, attempt.existing)
      return res.status(401).json({ error: 'Invalid username or password.' })
    }
    clearLoginFailures(attempt.id, attempt.existing)
    startSession(req, res, account)
    store.logAudit({ user: account.username, action: 'Signed in', field: 'Account', value: account.username })
    res.json({ account: publicAccount(account) })
  } catch (error) {
    console.error('[auth] login failed:', error.message)
    res.status(503).json({ error: 'Sign-in is temporarily unavailable.' })
  }
})

router.post('/logout', (req, res) => {
  endSession(req, res)
  res.status(204).end()
})

export default router
