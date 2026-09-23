let events = [], timer, sending = false
const actor = () => {
  try {
    return localStorage.getItem('rfq.activeRoleLabel') || 'System'
  } catch { return 'System' }
}
function flush() {
  clearTimeout(timer); timer = null
  if (sending || !events.length) return
  const batch = events.splice(0, 25)
  sending = true
  fetch('/api/logs/events', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'x-user-name': actor(), 'x-role-key': localStorage.getItem('rfq.activeRole') || 'admin' }, body: JSON.stringify({ events: batch }) })
    .catch(() => {}).finally(() => { sending = false; if (events.length) timer = setTimeout(flush, 1500) })
}
export function track(event, message) {
  events.push({ event, message: String(message || '').slice(0, 400), path: location.pathname })
  if (events.length > 100) events.shift()
  if (events.length >= 25 || event === 'ui.error') flush()
  else if (!timer) timer = setTimeout(flush, 10000)
}
export function installDiagnostics() {
  document.addEventListener('click', (e) => {
    const control = e.target.closest?.('button,a,[role="button"],[role="checkbox"]')
    if (!control || control.closest('[data-no-telemetry]')) return
    track('ui.click', control.getAttribute('aria-label') || control.getAttribute('title') || control.textContent.trim().slice(0, 100) || control.tagName)
  }, true)
  document.addEventListener('change', (e) => {
    if (!e.target.matches?.('input,select,textarea') || e.target.closest('[data-no-telemetry]')) return
    if (e.target.type === 'password') return
    track('ui.change', `Changed ${e.target.getAttribute('aria-label') || e.target.name || e.target.type || e.target.tagName.toLowerCase()}`)
  }, true)
  window.addEventListener('error', (e) => track('ui.error', `${e.message} (${String(e.filename || '').split('?')[0]}:${e.lineno})`))
  window.addEventListener('unhandledrejection', (e) => track('ui.error', e.reason?.message || 'Unhandled promise rejection'))
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  track('ui.navigation', 'Opened page')
}
