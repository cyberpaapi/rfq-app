export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const DOCUMENT_RETENTION_DAYS = 15
export const DOCUMENT_BUDGET_BYTES = 500 * 1024 * 1024

const types = {
  pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
}

export function validateUpload({ name, size, target }) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_UPLOAD_BYTES) throw new Error('Choose a non-empty file up to 50 MB.')
  if (typeof name !== 'string' || name.length > 200 || /[\x00-\x1f\\/]/.test(name)) throw new Error('Invalid file name.')
  const ext = name.split('.').at(-1).toLowerCase()
  const rfqAttachment = /^\/rfqs\/[^/]+\/attachments$/.test(target || '')
  const supplierAttachment = /^\/rfqs\/[^/]+\/(?:quote-attachments|item-attachments\/[^/]+)$/.test(target || '')
  const itemImage = /^\/rfqs\/[^/]+\/item-images\/[^/]+$/.test(target || '')
  if (!types[ext] && !((rfqAttachment || supplierAttachment) && /^[a-z0-9]{1,12}$/.test(ext))) throw new Error('Choose a PDF, spreadsheet, text file or supported image.')
  if (!/^\/(?:ingest|(?:items|suppliers)\/upload|rfqs\/[^/]+\/(?:respond|quote-upload|quote-upload-queue|attachments|quote-attachments|item-attachments\/[^/]+|item-images\/[^/]+))$/.test(target || '')) throw new Error('Invalid upload destination.')
  if (/^\/(items|suppliers)\//.test(target) && !['xlsx', 'xls', 'csv'].includes(ext)) throw new Error('Choose an Excel or CSV file for this import.')
  if (itemImage && !['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) throw new Error('Choose a PNG, JPEG, WebP or GIF image.')
  return { name, size, target, ext, contentType: types[ext] || 'application/octet-stream' }
}
