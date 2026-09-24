export const localToday = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

export const rfqCreationDate = (rfq) => {
  if (validDate(rfq?.creationDate)) return rfq.creationDate
  const time = Number(rfq?.createdAt)
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString().slice(0, 10) : ''
}
