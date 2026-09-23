import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function encryptionKey() {
  const encoded = process.env.ACCOUNT_PASSWORD_ENCRYPTION_KEY || ''
  const key = Buffer.from(encoded, 'base64url')
  if (key.length !== 32 || key.toString('base64url') !== encoded) {
    throw new Error('Account password viewing is not configured. Set ACCOUNT_PASSWORD_ENCRYPTION_KEY to a 32-byte base64url secret.')
  }
  return key
}

export function encryptAccountPassword(password, accountId) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce)
  cipher.setAAD(Buffer.from(accountId))
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptAccountPassword(saved, accountId) {
  if (!saved) return null
  try {
    const [version, nonce, tag, encrypted, extra] = saved.split('.')
    if (version !== 'v1' || extra || !nonce || !tag || !encrypted) throw new Error('Invalid encrypted password')
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(nonce, 'base64url'))
    decipher.setAAD(Buffer.from(accountId))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('This password cannot be decrypted. Check the account encryption key, then reset the password if needed.')
  }
}
