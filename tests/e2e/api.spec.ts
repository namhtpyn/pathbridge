// E2E: public surface + auth gates + the oRPC wire (no UI).
import { expect, test as base } from '@playwright/test'
import { rpc, signIn } from './helpers'

// desktop + mobile projects run against ONE server/db: namespace fixture paths
// by project so cross-project upsert-by-path can't collide (the takeover guard
// turns a path collision into a 403). SFX is set per-test from testInfo.
let SFX = process.env.PW_WORKER_INDEX ?? 'x'
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  page: async ({ page }, use, testInfo) => {
    SFX = `${testInfo.project.name.replace(/\W+/g, '')}${process.env.PW_WORKER_INDEX ?? ''}`
    await use(page)
  },
  // api tests never touch `page` — set the suffix from request too
  // eslint-disable-next-line no-empty-pattern
  request: async ({ request }, use, testInfo) => {
    SFX = `${testInfo.project.name.replace(/\W+/g, '')}${process.env.PW_WORKER_INDEX ?? ''}`
    await use(request)
  },
})
const uniq = (base: string) => `${base}-${SFX}`

test('public: version + health', async ({ request }) => {
  expect((await (await request.get('/api/version')).json()).version).toBeTruthy()
  expect((await request.get('/health')).status()).toBe(200)
  const ready = await request.get('/health/ready')
  expect(ready.status()).toBe(200)
  expect((await ready.json()).db).toBe(true)
})

test('unauthenticated /api/* is 401', async ({ request }) => {
  for (const p of ['/api/routes', '/api/users', '/api/roles', '/api/settings', '/api/keys', '/api/logs']) {
    expect(await (await request.get(p)).status(), p).toBe(401)
  }
})

test('unauthenticated /rpc authed procedures are UNAUTHORIZED', async ({ request }) => {
  const r = await request.post('/rpc/me', { data: { json: {} } })
  expect(r.status()).toBe(401)
  const body = await r.json()
  expect(body.json.code).toBe('UNAUTHORIZED')
})

test('session procedure returns null when signed out, payload when signed in', async ({ request }) => {
  const anon = await rpc<{ user?: unknown } | null>(request, 'session')
  expect(anon).toBeNull()
  await signIn(request)
  const s = await rpc<{ user: { email: string } }>(request, 'session')
  expect(s.user.email).toBe('e2e@pathbridge.dev')
})

test('me returns admin permissions + vocabulary', async ({ request }) => {
  await signIn(request)
  const me = await rpc<{ roles: string[], permissions: Record<string, string[]>, vocabulary: Record<string, string[]> }>(request, 'me')
  expect(me.roles).toContain('admin')
  expect(me.permissions.routes).toContain('read:all')
  expect(me.vocabulary.routes.length).toBeGreaterThan(0)
})

test('routes.save create → live/list visibility → remove', async ({ request }) => {
  await signIn(request)
  const created = await rpc<{ route: { id: number, path: string } }>(request, 'routes/save', {
    path: uniq('/e2e-lifecycle'),
    target: 'http://127.0.0.1:4311',
    note: 'e2e',
  })
  expect(created.route.path).toBe(uniq('/e2e-lifecycle'))

  // count reflects it
  const count = await rpc<{ count: number }>(request, 'routes/count')
  expect(count.count).toBeGreaterThanOrEqual(1)

  // update by id (rename + note)
  const updated = await rpc<{ route: { note: string | null } }>(request, 'routes/save', {
    id: created.route.id,
    path: uniq('/e2e-lifecycle'),
    target: 'http://127.0.0.1:4311',
    note: 'e2e-updated',
  })
  expect(updated.route.note).toBe('e2e-updated')

  // strict validation rejects reserved paths through the RPC surface
  const bad = await request.post('/rpc/routes/save', {
    data: { json: { path: '/admin', target: 'http://x.com' } },
  })
  expect(bad.status()).toBe(400)

  const removed = await rpc<{ deleted: boolean }>(request, 'routes/remove', { id: created.route.id })
  expect(removed.deleted).toBe(true)
  const again = await request.post('/rpc/routes/remove', { data: { json: { id: created.route.id } } })
  expect(again.status()).toBe(404)
})

test('route takeover guard: create-permission cannot repoint another user\'s route', async ({ request }) => {
  await signIn(request)
  // admin creates a route
  const victim = await rpc<{ route: { id: number } }>(request, 'routes/save', {
    path: uniq('/e2e-victim'),
    target: 'http://127.0.0.1:4311',
  })

  // operator role: routes create+read all, NO update (ensure-fresh: update if exists)
  // idempotent ensure-fresh: fetch ids, update-or-create (roles/users take id on update)
  const roles = await rpc<{ roles: Array<{ id: string, name: string }> }>(request, 'roles/list')
  const existingRole = roles.roles.find(r => r.name === 'e2e-op')
  const statements = { routes: ['create:all', 'read:all'] }
  if (existingRole) await rpc(request, 'roles/update', { id: existingRole.id, statements })
  else await rpc(request, 'roles/save', { name: 'e2e-op', statements })

  const users = await rpc<{ users: Array<{ id: string, email: string }> }>(request, 'users/list')
  const existingUser = users.users.find(u => u.email === 'op@pathbridge.dev')
  if (existingUser) {
    await rpc(request, 'users/update', { id: existingUser.id, role: 'e2e-op' })
    await rpc(request, 'users/setPassword', { id: existingUser.id, password: 'op-password-123' }).catch(() => {})
  }
  else await rpc(request, 'users/save', { email: 'op@pathbridge.dev', name: 'Op', password: 'op-password-123', role: 'e2e-op' })
  // explicit same-origin header: PW's request fixture omits Origin and better-auth
  // rejects origin-less POSTs once a session cookie rides along
  const opLogin = await request.post('/auth/sign-in/email', {
    data: { email: 'op@pathbridge.dev', password: 'op-password-123' },
    headers: { origin: 'http://127.0.0.1:4310' },
  })
  expect(opLogin.status(), `op login: ${await opLogin.text()}`).toBe(200)

  // upsert-by-path at /e2e-victim must be FORBIDDEN (H1)
  const attack = await request.post('/rpc/routes/save', {
    data: { json: { path: uniq('/e2e-victim'), target: 'http://evil.example.com' } },
  })
  expect(attack.status()).toBe(403)
  expect((await attack.json()).json.message).toContain('routes:update')

  // fresh path create is fine
  const own = await rpc<{ route: { path: string } }>(request, 'routes/save', {
    path: uniq('/e2e-op-own'), target: 'http://127.0.0.1:4311',
  })
  expect(own.route.path).toBe(uniq('/e2e-op-own'))

  // delete of the victim also forbidden
  const del = await request.post('/rpc/routes/remove', { data: { json: { id: victim.route.id } } })
  expect(del.status()).toBe(403)
})

test('scoped API key narrows permissions over /rpc', async ({ request }) => {
  await signIn(request)
  // clean slate (both e2e projects share the admin user): revoke stale twins first
  const stale = await rpc<{ keys: Array<{ id: string, name: string, enabled: boolean }> }>(request, 'keys/list')
  for (const k of stale.keys.filter(k => k.name === 'e2e-scoped')) {
    await rpc(request, 'keys/revoke', { id: k.id }).catch(() => {})
  }
  const created = await rpc<{ key: string }>(request, 'keys/create', {
    name: 'e2e-scoped',
    permissions: { routes: ['read:all'] },
  })
  expect(created.key.length).toBeGreaterThan(20)

  // scoped key: routes reads OK, users FORBIDDEN
  const auth = { authorization: `Bearer ${created.key}` }
  const routesOk = await request.post('/rpc/routes/count', { data: { json: {} }, headers: auth })
  expect(routesOk.status()).toBe(200)
  const me = await request.post('/rpc/me', { data: { json: {} }, headers: auth })
  expect((await me.json()).json.permissions.routes).toEqual(['read:all'])
  const users = await request.post('/rpc/users/list', { data: { json: {} }, headers: auth })
  expect(users.status()).toBe(403)

  // revoke, then the key dies
  const listed = await rpc<{ keys: Array<{ id: string, name: string, permissions: Record<string, string[]> | null }> }>(request, 'keys/list')
  const row = listed.keys.find(k => k.name === 'e2e-scoped')!
  expect(row.permissions).toEqual({ routes: ['read:all'] }) // stored permissions are returned
  await rpc(request, 'keys/revoke', { id: row.id })
  const after = await request.post('/rpc/routes/count', { data: { json: {} }, headers: auth })
  expect(after.status()).toBe(401)
})

test('proxy pipeline: route forwards traffic + access log records it', async ({ request }) => {
  // deterministic local upstream (tests/e2e/upstream.mjs :4311) — the app's own
  // origin would loop (target + rest includes the route path itself)
  await signIn(request)
  await rpc(request, 'routes/save', { path: uniq('/e2e-probe'), target: 'http://127.0.0.1:4311' })

  // unauthenticated proxy request goes THROUGH (proxying never depends on auth)
  const through = await request.get(uniq('/e2e-probe'))
  expect(through.status()).toBe(200)
  expect((await through.json()).ok).toBe(true)

  // the access log saw it
  const logs = await rpc<{ entries: Array<{ path: string, status: number, routePath: string | null }> }>(request, 'logs/recent', { limit: 10 })
  const hit = logs.entries.find(e => e.path === uniq('/e2e-probe'))
  expect(hit?.status).toBe(200)
  expect(hit?.routePath).toBe(uniq('/e2e-probe'))

  await rpc(request, 'routes/remove', { path: uniq('/e2e-probe') })
  expect(await (await request.get(uniq('/e2e-probe'))).status()).toBe(404)
})
