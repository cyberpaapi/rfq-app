import { Router } from 'express'
import { prepareUpload } from '../lib/documents.js'
import { MAX_UPLOAD_BYTES } from '../../shared/uploads.js'

const router = Router()
// Hosted routes are protected by Vercel Authentication for ALL deployments.
// Do not disable that protection without replacing it with application auth.
router.get('/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({ direct: !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.VERCEL, maxBytes: MAX_UPLOAD_BYTES })
})
router.post('/prepare', async (req, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await prepareUpload(req.body || {})) }
  catch (error) { res.status(error.status || 400).json({ error: error.message }) }
})
export default router
