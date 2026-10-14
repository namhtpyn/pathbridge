// better-auth test-utils (better-auth.com/docs/plugins/test-utils): a SEPARATE
// test-only auth instance — never imported by server code, never shipped. It
// gives ctx.test factories: createUser (object only), saveUser (persist),
// deleteUser, login (user+session+auth headers in one call), getAuthHeaders.
// Verified against installed better-auth 1.7.7: ctx.test = { createUser,
// saveUser, deleteUser, login, getAuthHeaders, getCookies } (+ org helpers
// only with the organization plugin; no standalone createSession — login()
// wraps it).
import { betterAuth } from 'better-auth'
import { testUtils } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { apiKey } from '@better-auth/api-key'
import { db } from '../../../server/db'
import { authSchema } from '../../../server/db/schema'

export const testAuth = betterAuth({
  appName: 'pathbridge-test',
  secret: 'test-secret-0123456789abcdefghijklmnop',
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: authSchema,
  }),
  emailAndPassword: { enabled: true },
  plugins: [apiKey(), testUtils()],
})

/** Persist a user + return an authenticated session bundle (cookie headers included). */
export async function createTestUser(email = `t-${Date.now()}@pathbridge.dev`, name = 'Test User') {
  const ctx = await testAuth.$context
  const user = ctx.test.createUser({ email, name, emailVerified: true })
  const saved = await ctx.test.saveUser(user)
  const login = await ctx.test.login({ userId: saved.id })
  return { user: saved, session: login.session, headers: login.headers, token: login.token }
}
