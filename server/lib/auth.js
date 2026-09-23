import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import * as store from '../store.js'

const scrypt = promisify(scryptCallback)
const COOKIE = 'opro_session'
const SESSION_MS = 12 * 60 * 60 * 1000
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const digest = (value) => createHash('sha256').update(value).digest('hex')

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('Use a password of 12-128 characters.')
  const salt = randomBytes(16).toString('base64url')
  const key = await scrypt(password, salt, 64, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${key.toString('base64url')}`
}

export async function verifyPassword(password, encoded) {
  const parts = String(encoded || '').split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, salt, value] = parts
  if (Number(n) !== SCRYPT.N || Number(r) !== SCRYPT.r || Number(p) !== SCRYPT.p) return false
  const expected = Buffer.from(value, 'base64url')
  if (expected.length !== 64 || typeof password !== 'string' || password.length > 128) return false
  const actual = await scrypt(password, salt, expected.length, SCRYPT)
  return timingSafeEqual(actual, expected)
}

const cookieValue = (req) => {
  const raw = req.get('cookie') || ''
  const entry = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))
  return entry ? entry.slice(COOKIE.length + 1) : ''
}
const secure = (req) => process.env.VERCEL === '1' || req.secure || req.get('x-forwarded-proto') === 'https'
function setCookie(req, res, token = '') {
  const flags = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${token ? SESSION_MS / 1000 : 0}`]
  if (secure(req)) flags.push('Secure')
  res.setHeader('Set-Cookie', flags.join('; '))
  res.setHeader('Cache-Control', 'no-store')
}

export function publicAccount(account) {
  if (!account) return null
  const { id, username, label, desc, enabled, readOnly, permissions, supplierId, color, version } = account
  return { id, username, label, desc, enabled, readOnly, permissions, supplierId, color, version }
}

export function accountForRequest(req) {
  const roles = store.getRoles()
  const token = cookieValue(req)
  if (!token || token.length > 128) return null
  const session = store.all('sessions').find((s) => s.tokenHash === digest(token))
  if (!session || session.expiresAt <= Date.now()) return null
  const account = roles.find((r) => r.id === session.accountId && r.enabled)
  if (!account || account.version !== session.accountVersion) return null
  if (account.id === 'admin' && session.adminFingerprint !== digest(process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH || '')) return null
  return { account, session }
}

export async function checkCredentials(username, password) {
  const account = store.getRoles().find((r) => r.username === String(username || '').trim().toLowerCase() && r.enabled)
  const storedHash = account?.id === 'admin' ? process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH : account?.passwordHash
  // Do one expensive check even for unknown names; responses remain generic.
  if (!storedHash) {
    await scrypt(String(password || '').slice(0, 128), 'unknown-account-salt', 64, SCRYPT)
    return null
  }
  return await verifyPassword(password, storedHash) ? account : null
}

export function startSession(req, res, account) {
  const token = randomBytes(32).toString('base64url')
  const sessions = store.all('sessions')
  for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].expiresAt <= Date.now()) sessions.splice(i, 1)
  store.insert('sessions', {
    id: store.newId('SES'), tokenHash: digest(token), accountId: account.id,
    accountVersion: account.version, adminFingerprint: account.id === 'admin' ? digest(process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH || '') : '',
    expiresAt: Date.now() + SESSION_MS,
  })
  setCookie(req, res, token)
}

export function endSession(req, res) {
  const active = accountForRequest(req)
  if (active) store.remove('sessions', active.session.id)
  setCookie(req, res)
}

export function loginThrottle(req, username) {
  // Older databases had role-picker records but no login-attempt collection.
  store.getRoles()
  const id = digest(String(username || '').trim().toLowerCase())
  const existing = store.all('loginAttempts').find((row) => row.id === id)
  return { id, existing, locked: !!existing?.lockedUntil && existing.lockedUntil > Date.now() }
}

export function recordFailedLogin(id, previous) {
  const count = previous?.updatedAt > Date.now() - 15 * 60 * 1000 ? previous.count + 1 : 1
  const patch = { count, updatedAt: Date.now(), lockedUntil: count >= 5 ? Date.now() + 15 * 60 * 1000 : 0 }
  if (previous) store.update('loginAttempts', id, patch)
  else store.insert('loginAttempts', { id, ...patch })
  store.commitOnError()
}

export function clearLoginFailures(id, previous) {
  if (previous) store.remove('loginAttempts', id)
}
