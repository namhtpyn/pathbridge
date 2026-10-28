// oRPC procedure-level tests per orpc.dev/docs/recipes/testing-and-mocking:
// call procedures directly (validation + middleware + handler, no HTTP) and
// use implement() for test-specific handlers. Runs in the unit project
// (node env on bun): procedures that touch the db need real bun:sqlite —
// happy-dom's nuxt env cannot provide it.
import { describe, expect, it } from 'vitest'
import { call } from '@orpc/server'
import { appRouter } from '../../server/domains/app.router'
import type { ResolvedUser } from '../../server/lib/permissions'

// every procedure's context needs getSessionUser; oRPC's 3rd call arg is
// CallOptions ({ context }), not the bare context object
const ctx = (getSessionUser: () => Promise<ResolvedUser | null>) => ({ context: { getSessionUser } })
describe('orpc: meta.version via direct call (no HTTP)', () => {
  it('returns the app version', async () => {
    const res = await call(appRouter.version, undefined, ctx(async () => null))
    expect(res).toMatchObject({ version: expect.any(String) })
  })

  it('authConfig exposes the login form gates', async () => {
    const res = await call(appRouter.authConfig, undefined, ctx(async () => null))
    expect(res).toMatchObject({ passwordEnabled: expect.any(Boolean), oidcEnabled: expect.any(Boolean) })
  })
})

// the property this suite is best placed to pin: a withPerm-guarded procedure
// rejects a resolved user without the grant (denial coverage is otherwise only
// exercised over HTTP in e2e)
describe('orpc: permission guards at the procedure level', () => {
  it('routes.count denies a user without routes:read', async () => {
    const user: ResolvedUser = { userId: 'u1', email: 'u1@x', roles: [], grants: new Map() } // no grants
    await expect(call(appRouter.routes.count, undefined, ctx(async () => user)))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
