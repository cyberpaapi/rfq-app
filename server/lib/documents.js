import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { get, list, del, issueSignedToken, presignUrl } from '@vercel/blob'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'
import { MAX_UPLOAD_BYTES, DOCUMENT_RETENTION_DAYS, DOCUMENT_BUDGET_BYTES, validateUpload } from '../../shared/uploads.js'
import { recordAction } from './diagnostics.js'

const options = () => ({ token: process.env.BLOB_READ_WRITE_TOKEN })
const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const signature = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url')

export function signReceipt(data, secret = process.env.BLOB_READ_WRITE_TOKEN) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${body}.${signature(body, secret)}`
}

export function verifyReceipt(receipt, target, secret = process.env.BLOB_READ_WRITE_TOKEN, now = Date.now()) {
  if (typeof receipt !== 'string' || receipt.length > 4000 || !secret) throw fail('Invalid upload reference.')
  const [body, sig, extra] = receipt.split('.')
  const expected = signature(body, secret)
  if (extra || !sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw fail('Invalid upload reference.')
  let data
  try { data = JSON.parse(Buffer.from(body, 'base64url').toString()) } catch { throw fail('Invalid upload reference.') }
  validateUpload(data)
  if (data.target !== target || !Number.isFinite(data.expires) || data.expires < now) throw fail('Upload expired or belongs to another action. Upload the file again.')
  if (!/^opro\/\d{13}\/[a-f0-9-]{36}\.[a-z]+$/.test(data.pathname)) throw fail('Invalid upload path.')
  return data
}

// This store belongs only to OPRO. Expire its documents on upload activity.
// Budget checking is a guard for normal usage, not a distributed reservation.
export async function cleanupDocuments() {
  let cursor, total = 0
  do {
    const page = await list({ ...options(), prefix: 'opro/', limit: 1000, cursor })
    const expired = []
    for (const blob of page.blobs) {
      if (new Date(blob.uploadedAt).getTime() < Date.now() - DOCUMENT_RETENTION_DAYS * 86400000) expired.push(blob.pathname)
      else total += blob.size
    }
    if (expired.length) await del(expired, options())
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return total
}

export async function prepareUpload(input) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw fail('File storage is not configured.', 503)
  const data = validateUpload(input)
  const used = await cleanupDocuments()
  if (used + data.size > DOCUMENT_BUDGET_BYTES) throw fail('The 500 MB document storage budget is full. Older documents expire after 15 days; try again after cleanup.', 507)
  const created = Date.now()
  const pathname = `opro/${created}/${randomUUID()}.${data.ext}`
  const expires = created + 3600000
  const clientToken = await generateClientTokenFromReadWriteToken({
    ...options(), pathname, maximumSizeInBytes: data.size, allowedContentTypes: [data.contentType],
    validUntil: expires, addRandomSuffix: false, allowOverwrite: false,
  })
  recordAction('upload.authorized', { size: data.size, type: data.contentType, target: data.target })
  return { pathname, contentType: data.contentType, clientToken, receipt: signReceipt({ ...data, pathname, expires, retainedUntil: created + DOCUMENT_RETENTION_DAYS * 86400000 }) }
}

export async function readLimited(stream, expectedSize) {
  const chunks = []; let size = 0
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_UPLOAD_BYTES || size > expectedSize) { await reader.cancel(); throw fail('Uploaded file exceeds the allowed size.', 413) }
      chunks.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  if (size !== expectedSize) throw fail('Upload is incomplete. Please upload the file again.')
  return Buffer.concat(chunks, size)
}

export async function readUploadedFile(receipt, target) {
  const data = verifyReceipt(receipt, target)
  const result = await get(data.pathname, { ...options(), access: 'private', useCache: false, abortSignal: AbortSignal.timeout(60000) })
  if (!result || result.statusCode !== 200) throw fail('Uploaded file was not found. Please upload it again.', 404)
  if (result.blob.size !== data.size) { await result.stream.cancel(); throw fail('Uploaded file size does not match.', 413) }
  const buffer = await readLimited(result.stream, data.size)
  recordAction('upload.received', { size: data.size, type: data.contentType })
  return { originalname: data.name, mimetype: data.contentType, size: data.size, buffer,
    blob: { pathname: data.pathname, expiresAt: data.retainedUntil } }
}

export async function discardUpload(file) {
  if (file?.blob) await del(file.blob.pathname, options())
}

export async function documentDownload(blob) {
  if (blob.expiresAt <= Date.now()) throw fail('The original document expired after 15 days. Its extracted quote data is still available.', 410)
  const signed = await issueSignedToken({ ...options(), pathname: blob.pathname, operations: ['get'], validUntil: Date.now() + 300000 })
  const { presignedUrl } = await presignUrl(signed, { pathname: blob.pathname, operation: 'get', access: 'private' })
  return presignedUrl
}
