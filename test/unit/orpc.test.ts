// oRPC procedure-level tests per orpc.dev/docs/recipes/testing-and-mocking:
// call procedures directly (validation + middleware + handler, no HTTP) and
// use implement() for test-specific handlers. Runs in the unit project
// (node env on bun): procedures that touch the db need real bun:sqlite —
// happy-dom's nuxt env cannot provide it.
import { describe, expect, it } from 'vitest'
import { call, implement } from '@orpc/server'
import { appRouter } from '../../server/domains/app.router'
import { metaRouter } from '../../server/domains/meta/meta.router'

// meta.version is permission-free by design (used by the login screen) — safe to call directly
describe('orpc: meta.version via direct call (no HTTP)', () => {
  it('returns the app version', async () => {
    const res = await call(appRouter.version, {})
    expect(res).toMatchObject({ version: expect.any(String) })
  })

  it('authConfig exposes the login form gates', async () => {
    const res = await call(appRouter.authConfig, {})
    expect(res).toMatchObject({ passwordEnabled: expect.any(Boolean), oidcEnabled: expect.any(Boolean) })
  })
})

describe('orpc: implement() mock', () => {
  it('creates a test twin of a procedure', async () => {
    const fakeVersion = implement(appRouter.version).handler(() => ({ version: 'test-9.9.9' }))
    await expect(call(fakeVersion, {})).resolves.toEqual({ version: 'test-9.9.9' })
  })

  it('keeps the router importable and typed', () => {
    expect(metaRouter).toBeDefined()
    expect((metaRouter as Record<string, unknown>).version).toBeDefined()
  })
})
