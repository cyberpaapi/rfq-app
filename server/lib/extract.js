// Turns an uploaded file into either plain text, page images, or STRUCTURED
// spreadsheet rows, ready for the AI step.
import * as XLSX from 'xlsx'

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

// Read a workbook into structured rows, preserving each row as ONE record even
// when a cell holds a multi-line value (e.g. a full specification). Every data
// row gets a stable global `id` (for the verification table) and keeps its real
// Excel row number (`excelRow`).
function buildSheets(wb) {
  let idCounter = 0
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    if (!ws || !ws['!ref']) return { name, header: [], rows: [] }
    const range = XLSX.utils.decode_range(ws['!ref'])
    const raw = []
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cells = []
      let any = false
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
        // `w` is the formatted text (keeps dates/decimals readable); fall back to raw value.
        const v = cell ? (cell.w != null ? cell.w : (cell.v != null ? cell.v : '')) : ''
        const s = String(v)
        if (s.trim()) any = true
        cells.push(s)
      }
      raw.push({ excelRow: R + 1, cells, blank: !any })
    }
    const firstIdx = raw.findIndex((r) => !r.blank)
    const header = firstIdx >= 0 ? raw[firstIdx].cells : []
    const rows = raw.slice(firstIdx + 1).filter((r) => !r.blank).map((r) => ({ id: ++idCounter, excelRow: r.excelRow, cells: r.cells }))
    return { name, header, rows }
  })
  return sheets
}

export async function extractDocument({ buffer, filename }) {
  const e = ext(filename)

  if (isImage(e)) {
    const b64 = buffer.toString('base64')
    return { kind: 'images', images: [`data:image/${imgMime(e)};base64,${b64}`], meta: { type: 'image' } }
  }

  if (e === 'pdf') {
    return {
      kind: 'pdf',
      filename,
      buffer,
      dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}`,
      text: await pdfText(buffer),
      meta: { type: 'pdf', bytes: buffer.length },
    }
  }

  // Spreadsheets (and CSV) → structured rows, row by row.
  if (e === 'xlsx' || e === 'xls' || e === 'csv') {
    const wb = e === 'csv'
      ? XLSX.read(buffer.toString('utf8'), { type: 'string' })
      : XLSX.read(buffer, { type: 'buffer' })
    const sheets = buildSheets(wb)
    const multiSheet = sheets.length > 1
    // Plain-text rendering kept only for the no-key fallback parser.
    const text = sheets.map((s) => [s.header.join(', '), ...s.rows.map((r) => r.cells.join(', '))].join('\n')).join('\n\n')
    return { kind: 'rows', sheets, multiSheet, text, meta: { type: e === 'csv' ? 'csv' : 'xlsx', sheets: wb.SheetNames, rows: sheets.reduce((a, s) => a + s.rows.length, 0) } }
  }

  // txt, md, json, anything else → treat as text
  return { kind: 'text', text: buffer.toString('utf8'), meta: { type: 'text' } }
}
