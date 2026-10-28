// E2E: public surface + auth gates + the oRPC wire (no UI).
import { expect, test as base } from '@playwright/test'
import { ensureOperator, rpc, signIn } from './helpers'

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
  expect((await rpc<{ version: string }>(request, 'version')).version).toBeTruthy()
  expect((await request.get('/health')).status()).toBe(200)
  const ready = await request.get('/health/ready')
  expect(ready.status()).toBe(200)
  expect((await ready.json()).db).toBe(true)
})

test('unauthenticated authed /rpc procedures are 401', async ({ request }) => {
  for (const proc of ['routes/count', 'users/list', 'roles/list', 'settings/get', 'keys/list', 'logs/recent']) {
    const r = await request.post(`/rpc/${proc}`, { data: { json: {} } })
    expect(r.status(), proc).toBe(401)
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
  expect(me.vocabulary.routes?.length ?? 0).toBeGreaterThan(0)
})

test('routes.save create → live/list visibility → remove', async ({ request }) => {
  await signIn(request)
  const created = await rpc<{ route: { id: number, path: string } }>(request, 'routes/save', {
    path: uniq('/e2e-lifecycle'),
    target: 'http://127.0.0.1:4311',
    note: 'e2e',
  })
  expect(created.route.path).toBe(uniq('/e2e-lifecycle'))

  // count + one-shot list both reflect it
  const count = await rpc<{ count: number }>(request, 'routes/count')
  expect(count.count).toBeGreaterThanOrEqual(1)
  const listed = await rpc<Array<{ id: number, path: string }>>(request, 'routes/list')
  expect(listed.some(r => r.id === created.route.id)).toBe(true)

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

  // operator role: routes create+read all, NO update (shared ensure-fresh
  // helper — updates the role/user when a previous run created them)
  await ensureOperator(request)

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

  // the missing half of a security pin: the victim must be UNCHANGED
  await signIn(request) // back to admin
  const after = await rpc<Array<{ id: number, target: string }>>(request, 'routes/list')
  const row = after.find(r => r.id === victim.route.id)
  expect(row, 'victim route must still exist').toBeTruthy()
  expect(row?.target).toBe('http://127.0.0.1:4311')
})

// partial-update merge: a routes.save that omits `enabled` must preserve the
// stored false — never fall back to the create-time default (`enabled ?? true`)
test('routes.save partial update keeps a disabled route disabled', async ({ request }) => {
  await signIn(request)
  const path = uniq('/e2e-disabled')
  const created = await rpc<{ route: { id: number } }>(request, 'routes/save', { path, target: 'http://127.0.0.1:4311', enabled: false })
  // omit `enabled` entirely — the merge must preserve the stored false
  await rpc(request, 'routes/save', { id: created.route.id, path, target: 'http://127.0.0.1:4311' })
  const listed = await rpc<Array<{ id: number, enabled: boolean }>>(request, 'routes/list')
  expect(listed.find(r => r.id === created.route.id)?.enabled).toBe(false)
  await rpc(request, 'routes/remove', { id: created.route.id })
})

// PB-03 regression pin: the MCP create_route tool must never repoint a foreign
// route either — the old onConflictDoUpdate did exactly that under a race.
test('MCP create_route cannot take over an existing foreign route (PB-03)', async ({ request }) => {
  // self-contained under --grep: admin creates the victim, ensureOperator()
  // builds the role+user (idempotently) and leaves the context signed in as op
  await signIn(request)
  const victim = uniq('/e2e-pb03-victim')
  await rpc(request, 'routes/save', { path: victim, target: 'http://127.0.0.1:4311' })
  await ensureOperator(request)

  const mcpBody = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'create_route', arguments: { path: victim, target: 'http://127.0.0.1:4311/evil' } },
  })
  const r = await request.post('/mcp', { headers: { 'mcp-session-id': 'e2e-pb03', accept: 'application/json, text/event-stream', 'content-type': 'application/json' }, data: mcpBody })
  const text = await r.text()
  // JSON-RPC: a blocked call is a tool result with isError naming the exact
  // missing permission — matching any error text would pass on unrelated failures
  const payload = JSON.parse(text) as { result?: { isError?: boolean, content?: Array<{ text?: string }> } }
  expect(payload.result?.isError, `MCP takeover not blocked: ${text.slice(0, 200)}`).toBe(true)
  expect(payload.result?.content?.[0]?.text ?? '').toContain('routes:update')

  // the victim route is unchanged: read it back through MCP list_routes as admin
  await signIn(request)
  const listBody = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_routes', arguments: {} } })
  const lr = await request.post('/mcp', { headers: { 'mcp-session-id': 'e2e-pb03', accept: 'application/json, text/event-stream', 'content-type': 'application/json' }, data: listBody })
  const ltext = await lr.text()
  expect(ltext).toContain(victim)
  expect(ltext).not.toContain('4311/evil')

  // cleanup runs as ADMIN (the operator has no delete grant); no swallowed 403
  await rpc(request, 'routes/remove', { path: victim })
})

test('MCP requires auth: anonymous tools/list is 401 and leaks no tool surface', async ({ request }) => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
  const r = await request.post('/mcp', {
    headers: { 'mcp-session-id': 'e2e-mcp-anon', accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
    data: body,
  })
  expect(r.status()).toBe(401)
  const text = await r.text()
  // a 401 must not come back as a JSON-RPC result carrying the catalog
  let parsed: { result?: { tools?: unknown } } = {}
  try { parsed = JSON.parse(text) } catch { /* plain/empty 401 body is fine */ }
  expect(parsed.result?.tools).toBeUndefined()
  expect(text).not.toContain('list_routes')
})

test('MCP honors key narrowing: a routes:read:all key cannot create_route', async ({ request }) => {
  await signIn(request)
  const keyName = uniq('e2e-mcp-scoped')
  // clean slate (both e2e projects share the admin user): revoke stale twins first
  const stale = await rpc<{ keys: Array<{ id: string, name: string }> }>(request, 'keys/list')
  for (const k of stale.keys.filter(k => k.name === keyName)) {
    await rpc(request, 'keys/revoke', { id: k.id }).catch(() => {})
  }
  const created = await rpc<{ id: string, key: string }>(request, 'keys/create', {
    name: keyName,
    permissions: { routes: ['read:all'] },
  })
  const deniedPath = uniq('/e2e-mcp-denied')
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'create_route', arguments: { path: deniedPath, target: 'http://127.0.0.1:4311' } },
  })
  const r = await request.post('/mcp', {
    headers: {
      authorization: `Bearer ${created.key}`,
      'mcp-session-id': 'e2e-mcp-scoped',
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    data: body,
  })
  const text = await r.text()
  // same contract as the takeover pin: tool result, isError, exact permission named
  const payload = JSON.parse(text) as { result?: { isError?: boolean, content?: Array<{ text?: string }> } }
  expect(payload.result?.isError, `create_route not denied: ${text.slice(0, 200)}`).toBe(true)
  expect(payload.result?.content?.[0]?.text ?? '').toContain('routes:create')

  await signIn(request)
  const listed = await rpc<Array<{ path: string }>>(request, 'routes/list')
  expect(listed.some(x => x.path === deniedPath), 'denied create must not write').toBe(false)
  await rpc(request, 'keys/revoke', { id: created.id })
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

  // rename (own key; plugin updateApiKey underneath)
  const toRename = await rpc<{ keys: Array<{ id: string, name: string, permissions: Record<string, string[]> | null }> }>(request, 'keys/list')
  const target = toRename.keys.find(k => k.name === 'e2e-scoped')!
  expect(target.permissions).toEqual({ routes: ['read:all'] }) // stored permissions are returned
  await rpc(request, 'keys/rename', { id: target.id, name: 'e2e-renamed' })
  const renamed = await rpc<{ keys: Array<{ name: string }> }>(request, 'keys/list')
  expect(renamed.keys.some(k => k.name === 'e2e-renamed')).toBe(true)
  // rename validation: empty name rejected
  const bad = await request.post('/rpc/keys/rename', { data: { json: { id: target.id, name: '' } } })
  expect(bad.status()).toBe(400)

  // revoke, then the key dies
  const listed = await rpc<{ keys: Array<{ id: string, name: string }> }>(request, 'keys/list')
  const row = listed.keys.find(k => k.name === 'e2e-renamed')!
  await rpc(request, 'keys/revoke', { id: row.id })
  const after = await request.post('/rpc/routes/count', { data: { json: {} }, headers: auth })
  expect(after.status()).toBe(401)
})

test('proxy: exact route forwards to the target URL verbatim; wildcard appends the remainder', async ({ request }) => {
  await signIn(request)
  // exact route whose TARGET carries its own path: the upstream must receive
  // exactly that path — the original request path is NOT appended
  const exact = await rpc<{ route: { id: number, path: string } }>(request, 'routes/save', {
    path: uniq('/e2e-exact/hook'),
    target: 'http://127.0.0.1:4311/upstream-hook',
  })
  const viaExact = await request.get(uniq('/e2e-exact/hook'))
  expect(viaExact.status()).toBe(200)
  expect((await viaExact.json()).path).toBe('/upstream-hook')
  await rpc(request, 'routes/remove', { path: uniq('/e2e-exact/hook') })

  // wildcard always appends the remainder after its base
  await rpc(request, 'routes/save', {
    path: uniq('/e2e-wild') + '/*',
    target: 'http://127.0.0.1:4311/base',
  })
  const viaWild = await request.get(uniq('/e2e-wild') + '/rest/of')
  expect(viaWild.status()).toBe(200)
  expect((await viaWild.json()).path).toBe('/base/rest/of')
  await rpc(request, 'routes/remove', { path: uniq('/e2e-wild') + '/*' })
})

test('proxy pipeline: route forwards traffic + access log records it', async ({ request }) => {
  // deterministic local upstream (test/e2e/upstream.mjs :4311) — the app's own
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
