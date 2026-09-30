import { localToday } from './rfqDates.js'

// Keep each extracted row independent, including duplicate item names. The
// shared Create RFQ wizard uses _key only for editing; the server assigns IDs.
export function draftFromImport(rows = [], documents = []) {
  const names = documents.map((document) => document.name).filter(Boolean)
  return {
    form: {
      title: names[0]?.replace(/\.[^.]+$/, '') || 'Imported RFQ',
      description: names.length ? `Imported from ${names.join(', ')}` : '',
      creationDate: localToday(), currency: 'USD', deadline: '',
      deliveryLocation: '', paymentTerms: '30 days net', category: '',
    },
    lines: rows.filter((row) => typeof row.name === 'string' && row.name.trim()).map((row, index) => ({
      _key: `ai-${index}`, itemId: row.itemId || null, sku: row.sku || '',
      name: row.name.trim(), spec: row.spec || '', description: row.description || '',
      brand: row.brand || '', model: row.model || '', partNo: row.partNo || '',
      quantity: Number(row.quantity) > 0 ? Number(row.quantity) : 1,
      uom: row.uom || 'PCS', secondaryRequirements: row.secondaryRequirements || '',
      remark: row.remark || '', requiredDeliveryDate: row.requiredDeliveryDate || '',
      photo: row.photo || '', attachment: row.attachment || '',
    })),
  }
}
