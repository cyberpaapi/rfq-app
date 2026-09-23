import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { hashPassword } from '../server/lib/auth.js'

test('legacy role-picker database can accept the first admin login', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'opro-auth-migration-'))
  const port = 44124
  await writeFile(join(dir, 'db.json'), JSON.stringify({
    authVersion: 1,
    roles: [{ id: 'admin', label: 'Administrator', permissions: '*' }, { id: 'buyer', label: 'Buyer', permissions: ['workspace.view'] }],
    items: [{ id: 'KEEP-ITEM', name: 'Keep this procurement record' }],
    suppliers: [], rfqs: [], quotes: [], audit: [], notifications: [], tags: [],
  }))
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), RFQ_DATA_DIR: dir, ADMIN_BOOTSTRAP_USERNAME: 'admin', ADMIN_BOOTSTRAP_PASSWORD_HASH: await hashPassword('migration-test-password-123') }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  server.stdout.on('data', (chunk) => { output += chunk })
  server.stderr.on('data', (chunk) => { output += chunk })
  t.after(async () => { const exited = once(server, 'exit'); server.kill(); await exited; await rm(dir, { recursive: true, force: true }) })
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break } catch {}
    if (server.exitCode != null || i === 99) throw new Error(output || 'API did not start')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const login = await fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-opro-request': '1' }, body: JSON.stringify({ username: 'admin', password: 'migration-test-password-123' }) })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  const roles = await fetch(`http://localhost:${port}/api/roles`, { headers: { Cookie: cookie } })
  assert.deepEqual((await roles.json()).map((account) => account.id), ['admin'])
  const data = JSON.parse(await readFile(join(dir, 'db.json'), 'utf8'))
  assert.equal(data.authVersion, 2)
  assert.equal(data.items[0].id, 'KEEP-ITEM')
  assert.equal(data.sessions.length, 1)
})
