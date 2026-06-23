// Turns an uploaded file into either plain text or page images, ready for the AI step.
import * as XLSX from 'xlsx'
import Papa from 'papaparse'

const ext = (name = '') => (name.split('.').pop() || '').toLowerCase()

const isImage = (e) => ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(e)
const imgMime = (e) => ({ jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif', bmp: 'bmp' }[e] || 'png')

// Best-effort text layer — only used by the no-API-key fallback parser.
async function pdfText(buffer) {
  try {
    const { default: pdfParse } = await import('pdf-parse')
    return ((await pdfParse(buffer)).text || '').trim()
  } catch {
    return ''
  }
}

export async function extractDocument({ buffer, filename }) {
  const e = ext(filename)

  if (isImage(e)) {
    const b64 = buffer.toString('base64')
    return { kind: 'images', images: [`data:image/${imgMime(e)};base64,${b64}`], meta: { type: 'image' } }
  }

  // Send the PDF straight to the model — it reads each page's text and renders
  // the page internally, so no local rasterisation is needed. `text` is kept
  // only for the no-key fallback path.
  if (e === 'pdf') {
    return {
      kind: 'pdf',
      filename,
      dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}`,
      text: await pdfText(buffer),
      meta: { type: 'pdf', bytes: buffer.length },
    }
  }

  if (e === 'xlsx' || e === 'xls') {
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const parts = wb.SheetNames.map((sn) => `# Sheet: ${sn}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[sn]))
    return { kind: 'text', text: parts.join('\n\n'), meta: { type: 'xlsx', sheets: wb.SheetNames } }
  }

  if (e === 'csv') {
    const text = buffer.toString('utf8')
    // Light validation/normalisation through papaparse.
    const parsed = Papa.parse(text.trim(), { skipEmptyLines: true })
    const norm = parsed.data.map((row) => (Array.isArray(row) ? row.join(', ') : row)).join('\n')
    return { kind: 'text', text: norm, meta: { type: 'csv', rows: parsed.data.length } }
  }

  // txt, md, json, anything else → treat as text
  return { kind: 'text', text: buffer.toString('utf8'), meta: { type: 'text' } }
}
