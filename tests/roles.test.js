import test from 'node:test'
import assert from 'node:assert/strict'
import { seedRoles, roleCan, validateRole } from '../shared/roles.js'
import { checkAccess } from '../server/lib/access.js'

test('role definitions contain no named accounts and admin cannot be delegated', () => {
  const roles = seedRoles()
  assert.equal(roles.length, 6)
  assert.ok(roles.every((r) => !r.name && !r.email && !r.password))
  assert.throws(() => validateRole({ label: 'Administrator', permissions: [] }, roles), /already exists/)
  assert.throws(() => validateRole({ label: 'Backdoor', permissions: ['users.manage'] }, roles), /reserved/)
  assert.throws(() => validateRole({ label: 'Backdoor', permissions: '*' }, roles), /valid permissions/)
  assert.throws(() => validateRole({ label: 'Buyer', permissions: ['rfq.create'] }, roles), /workspace/)
})

test('read-only, disabled, AI and export restrictions are applied by API policy', () => {
  const role = { id: 'custom', enabled: true, readOnly: true, permissions: ['workspace.view', 'rfq.create', 'rfq.evaluate', 'ai.use', 'data.export'] }
  assert.equal(checkAccess(role, 'GET', '/rfqs'), true)
  assert.equal(checkAccess(role, 'POST', '/rfqs'), false)
  assert.equal(checkAccess(role, 'PUT', '/rfqs/a/quotes/b'), false)
  assert.equal(checkAccess(role, 'POST', '/uploads/prepare', { target: '/ingest' }), false)
  assert.equal(roleCan(role, 'ai.use'), false)
  assert.equal(checkAccess({ ...role, enabled: false }, 'GET', '/rfqs'), false)
  assert.equal(checkAccess({ ...role, permissions: ['workspace.view'] }, 'GET', '/export/comparison/x'), false)
  assert.equal(checkAccess({ ...role, readOnly: false, permissions: ['workspace.view', 'rfq.evaluate'] }, 'POST', '/rfqs/x/recommend'), false)
  assert.equal(checkAccess({ ...role, readOnly: false }, 'POST', '/roles'), false)
  const creator = { id: 'creator', enabled: true, permissions: ['workspace.view', 'rfq.create'] }
  assert.equal(checkAccess(creator, 'POST', '/rfqs/x/approve/', { role: 'finance' }), false)
  assert.equal(checkAccess(creator, 'POST', '/RFQS/x/ReCoMmEnD/'), false)
  assert.equal(checkAccess(creator, 'POST', '/uploads/prepare', { target: '/rfqs/x/quote-upload/' }), false)
})
