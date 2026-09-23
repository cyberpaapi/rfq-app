import test from 'node:test'
import assert from 'node:assert/strict'
import { encryptAccountPassword, decryptAccountPassword } from '../server/lib/account-passwords.js'

test('account passwords are encrypted with fresh nonces and bound to one account', () => {
  const previous = process.env.ACCOUNT_PASSWORD_ENCRYPTION_KEY
  process.env.ACCOUNT_PASSWORD_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64url')
  try {
    const first = encryptAccountPassword('temporary-password-123', 'role-1')
    const second = encryptAccountPassword('temporary-password-123', 'role-1')
    assert.notEqual(first, second)
    assert.ok(!first.includes('temporary-password-123'))
    assert.equal(decryptAccountPassword(first, 'role-1'), 'temporary-password-123')
    assert.throws(() => decryptAccountPassword(first, 'role-2'), /cannot be decrypted/)
    assert.throws(() => decryptAccountPassword(first.slice(0, -2) + 'xx', 'role-1'), /cannot be decrypted/)
    assert.equal(decryptAccountPassword(null, 'role-1'), null)
  } finally {
    if (previous === undefined) delete process.env.ACCOUNT_PASSWORD_ENCRYPTION_KEY
    else process.env.ACCOUNT_PASSWORD_ENCRYPTION_KEY = previous
  }
})
