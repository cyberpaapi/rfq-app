import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_UPLOAD_BYTES, validateUpload } from '../shared/uploads.js'
import { signReceipt, verifyReceipt, readLimited, documentDownload } from '../server/lib/documents.js'

const metadata = { name: 'Supplier quote.pdf', size: MAX_UPLOAD_BYTES, target: '/rfqs/RFQ-123/respond' }
test('50 MB is accepted, oversized and invalid file destinations are rejected', () => {
  assert.equal(validateUpload(metadata).size, 52428800)
  for (const patch of [{ size: MAX_UPLOAD_BYTES + 1 }, { size: 0 }, { size: -1 }, { name: '../file.pdf' }, { name: 'file.exe' }, { target: '/reset' }, { target: '/items/upload' }]) {
    assert.throws(() => validateUpload({ ...metadata, ...patch }))
  }
})

test('upload references bind file identity, destination and expiry and reject tampering', () => {
  const now = Date.now(), secret = 'test-only-secret'
  const data = { ...metadata, pathname: `opro/${now}/12345678-1234-1234-1234-123456789abc.pdf`, expires: now + 60000 }
  const receipt = signReceipt(data, secret)
  assert.deepEqual(verifyReceipt(receipt, metadata.target, secret, now), data)
  assert.throws(() => verifyReceipt(receipt, '/ingest', secret, now))
  assert.throws(() => verifyReceipt(receipt, metadata.target, secret, now + 60001))
  assert.throws(() => verifyReceipt(receipt + 'x', metadata.target, secret, now))
  assert.throws(() => verifyReceipt(signReceipt({ ...data, pathname: 'https://evil.test/file' }, secret), metadata.target, secret, now))
})

test('file reader handles a full 50 MB stream and detects truncation and overflow', async () => {
  let remaining = MAX_UPLOAD_BYTES
  const stream = new ReadableStream({ pull(controller) {
    if (!remaining) return controller.close()
    const bytes = Math.min(remaining, 1024 * 1024); remaining -= bytes
    controller.enqueue(new Uint8Array(bytes).fill(65))
  } })
  const data = await readLimited(stream, MAX_UPLOAD_BYTES)
  assert.equal(data.length, MAX_UPLOAD_BYTES)
  assert.equal(data.at(-1), 65)
  const small = () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(5)); c.close() } })
  await assert.rejects(readLimited(small(), 6), /incomplete/)
  await assert.rejects(readLimited(small(), 4), /exceeds/)
})

test('expired quote originals return a clear error without requesting storage', async () => {
  await assert.rejects(documentDownload({ expiresAt: 1 }), (e) => e.status === 410)
})
