import { Router } from 'express'
import * as store from '../store.js'
import { roleCan } from '../../shared/roles.js'

const router = Router()

const visibleTo = (notice, account) => {
  if (account.supplierId) return false
  if (!(notice.audience || ['workspace.view']).some((permission) => roleCan(account, permission))) return false
  if (notice.type === 'approval_request') {
    const rfq = store.find('rfqs', notice.rfqId)
    if (!rfq || rfq.approvals?.[notice.approvalRole] || !['Evaluation', 'Pending Approval'].includes(rfq.status) || (rfq.approvalRequestedAt && notice.at < rfq.approvalRequestedAt)) return false
  }
  return true
}
const present = (notice, account) => ({
  id: notice.id, type: notice.type, title: notice.title, rfqId: notice.rfqId, at: notice.at,
  unread: notice.unread !== false && !(notice.readBy || []).includes(account.id),
})

// Each account sees and reads only its relevant notifications.
router.get('/', (req, res) => {
  res.json(store.all('notifications').filter((notice) => visibleTo(notice, req.accessRole)).sort((a, b) => b.at - a.at).map((notice) => present(notice, req.accessRole)))
})

// Mark one read.
router.post('/:id/read', (req, res) => {
  const notice = store.find('notifications', req.params.id)
  if (!notice || !visibleTo(notice, req.accessRole)) return res.status(404).json({ error: 'not found' })
  const readBy = [...new Set([...(notice.readBy || []), req.accessRole.id])]
  const updated = store.update('notifications', notice.id, { readBy })
  res.json(present(updated, req.accessRole))
})

// Mark all read.
router.post('/read-all', (req, res) => {
  for (const notice of store.all('notifications')) {
    if (visibleTo(notice, req.accessRole) && notice.unread !== false && !(notice.readBy || []).includes(req.accessRole.id)) {
      store.update('notifications', notice.id, { readBy: [...(notice.readBy || []), req.accessRole.id] })
    }
  }
  res.json({ ok: true })
})

export default router
