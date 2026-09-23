import multer from 'multer'

// In-memory uploads, 25MB cap — files are parsed then discarded.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (process.env.VERCEL ? 4 : 25) * 1024 * 1024 },
})
