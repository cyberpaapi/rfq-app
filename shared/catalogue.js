// Source workbook column order and labels, shared by import, forms and table.
export const CATALOGUE_COLUMNS = [
  ['name', 'Item Name'], ['aiName', 'AI Name'], ['description', 'Description'],
  ['sku', 'SKU'], ['category', 'Category'], ['subcategory', 'Subcategory'],
  ['uom', 'Usage unit'], ['partNo', 'Part Number (MPN)'], ['unitName', 'Unit Name'],
].map(([key, label]) => ({ key, label }))
export const catalogueText = (value) => value == null ? '' : String(value)
export const catalogueMatches = (item, query) => {
  const needle = String(query || '').trim().replace(/\s+/g, ' ').toLowerCase()
  return !needle || [...CATALOGUE_COLUMNS.map(({ key }) => item[key]), item.baseName, ...(item.tags || [])]
    .some((value) => catalogueText(value).replace(/\s+/g, ' ').toLowerCase().includes(needle))
}
