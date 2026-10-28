// better-auth testUtils end-to-end: the test-only instance must create users,
// sessions, and auth headers against the real sqlite db (via the same
// relations-v2 drizzle adapter the app uses) — no HTTP, no password hashing.
import { describe, expect, it } from 'vitest'
import { testAuth, createTestUser } from './helpers/test-auth'
import { db } from '../../server/db'
import { user as userTable } from '../../server/db/schema'
import { eq } from 'drizzle-orm'

describe('better-auth testUtils (test-only auth instance)', () => {
  it('creates + persists a user via ctx.test.saveUser', async () => {
    const { user } = await createTestUser()
    const rows = await db.select().from(userTable).where(eq(userTable.id, user.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.email).toBe(user.email)
  })

  it('login() returns a session row + a token the bearer path accepts', async () => {
    const { user, session, token } = await createTestUser()
    expect(session.userId).toBeTruthy()
    // not a tautology: send the token back over the wire-shaped bearer path and
    // assert it resolves to the same user
    const res = await testAuth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${token}` }),
    })
    expect(res?.user?.id).toBe(user.id)
  })

  it('the session authenticates against the app-style getSession call', async () => {
    const { headers } = await createTestUser()
    // testAuth mirrors the app config (same adapter/plugins), so its own
    // getSession with the login cookie headers proves the session is real
    const res = await testAuth.api.getSession({ headers })
    expect(res?.user).toBeTruthy()
    expect(res?.session).toBeTruthy()
  })
})
