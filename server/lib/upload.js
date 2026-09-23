import multer from 'multer'
import { MAX_UPLOAD_BYTES } from '../../shared/uploads.js'
import { readUploadedFile, discardUpload } from './documents.js'

const multipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: process.env.VERCEL ? 4 * 1024 * 1024 : MAX_UPLOAD_BYTES },
})

export const upload = {
  single(field) {
    return async (req, res, next) => {
      if (!req.is('application/json')) return multipart.single(field)(req, res, next)
      try {
        req.file = await readUploadedFile(req.body?.uploadReceipt, req.originalUrl.split('?')[0].replace(/^\/api/, ''))
        const end = res.end.bind(res); let finishing = false
        res.end = (...args) => {
          if (finishing) return res
          finishing = true
          const cleanup = !req.file.retainBlob || res.statusCode >= 400 ? discardUpload(req.file) : Promise.resolve()
          cleanup.catch(() => console.warn('[uploads] temporary file cleanup deferred')).finally(() => end(...args))
          return res
        }
        next()
      } catch (error) { next(error) }
    }
  },
}
