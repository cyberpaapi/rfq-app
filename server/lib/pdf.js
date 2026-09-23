// Splits a PDF buffer into smaller per-page (or per-chunk) PDFs so a huge
// document can be sent to the model in pieces instead of all at once.
import { PDFDocument } from 'pdf-lib'

// Returns { total, chunks: [{ index, fromPage, toPage, dataUrl }] }.
// Each chunk is itself a valid PDF (data URL) containing `pagesPerChunk` pages,
// which the model reads natively (text + rendered page) just like the whole file.
export async function splitPdfPages(buffer, { pagesPerChunk = 1 } = {}) {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const total = src.getPageCount()
  const chunks = []

  for (let start = 0; start < total; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, total)
    const out = await PDFDocument.create()
    const indices = []
    for (let i = start; i < end; i++) indices.push(i)
    const copied = await out.copyPages(src, indices)
    copied.forEach((p) => out.addPage(p))
    const bytes = await out.save()
    chunks.push({
      index: chunks.length,
      fromPage: start + 1,
      toPage: end,
      dataUrl: `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`,
    })
  }

  return { total, chunks }
}

// Just the first page as a PDF data URL — used for the lightweight currency-
// detection pass without splitting the whole (possibly huge) document.
export async function firstPdfPage(buffer) {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true })
  if (src.getPageCount() === 0) return null
  const out = await PDFDocument.create()
  const [p] = await out.copyPages(src, [0])
  out.addPage(p)
  const bytes = await out.save()
  return `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`
}
