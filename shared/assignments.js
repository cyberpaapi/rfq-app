// A full assignment follows the current RFQ item list; a partial assignment
// exposes only its explicitly selected item IDs.
export function assignedRfqLines(rfq, supplierId) {
  const assignments = (rfq?.assignments || []).filter((assignment) => assignment.supplierId === supplierId)
  if (!assignments.length) return []
  if (assignments.some((assignment) => assignment.type === 'full')) return rfq.lines || []
  const ids = new Set(assignments.flatMap((assignment) => assignment.lineIds || []))
  return (rfq.lines || []).filter((line) => ids.has(line.lineId))
}
