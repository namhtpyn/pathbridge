// Shared E2E helpers: auth against the built app + oRPC wire helpers.
import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const ADMIN = { email: 'e2e@pathbridge.dev', password: 'e2e-admin-pw' }

/** Non-admin operator used by the takeover pins: routes create+read, NO update. */
export const OPERATOR = { email: 'op@pathbridge.dev', password: 'op-password-123' }

/** Sign in via the better-auth endpoint; returns the session cookie jar state. */
export async function signIn(request: APIRequestContext) {
  // better-auth rejects cookie-carrying POSTs without Origin — always send it
  const origin = new URL(process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4310').origin
  const r = await request.post('/auth/sign-in/email', { data: ADMIN, headers: { origin } })
  expect(r.status(), `sign-in failed: ${await r.text()}`).toBe(200)
}

/**
 * Ensure the `e2e-op` role (routes create+read:all, NO update) and the
 * `op@pathbridge.dev` user exist, then leave the request context signed in as
 * that operator.
 *
 * Self-contained and idempotent: it starts with an admin sign-in (role/user
 * management needs admin grants), and updates instead of creating when the
 * role/user already exists — so a test that runs alone under `--grep` builds
 * its own prerequisites instead of depending on another test having run first.
 * Leaves the context authenticated as the OPERATOR, not the admin.
 */
export async function ensureOperator(request: APIRequestContext) {
  await signIn(request)
  const statements = { routes: ['create:all', 'read:all'] }
  const roles = await rpc<{ roles: Array<{ id: string, name: string }> }>(request, 'roles/list')
  const existingRole = roles.roles.find(r => r.name === 'e2e-op')
  if (existingRole) await rpc(request, 'roles/update', { id: existingRole.id, statements })
  else await rpc(request, 'roles/save', { name: 'e2e-op', statements })

  const users = await rpc<{ users: Array<{ id: string, email: string }> }>(request, 'users/list')
  const existingUser = users.users.find(u => u.email === OPERATOR.email)
  if (existingUser) {
    await rpc(request, 'users/update', { id: existingUser.id, role: 'e2e-op' })
    await rpc(request, 'users/setPassword', { id: existingUser.id, password: OPERATOR.password }).catch(() => {})
  }
  else await rpc(request, 'users/save', { email: OPERATOR.email, name: 'Op', password: OPERATOR.password, role: 'e2e-op' })

  // explicit same-origin header: PW's request fixture omits Origin and better-auth
  // rejects origin-less POSTs once a session cookie rides along
  const origin = new URL(process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4310').origin
  const login = await request.post('/auth/sign-in/email', { data: OPERATOR, headers: { origin } })
  expect(login.status(), `operator login: ${await login.text()}`).toBe(200)
}

/** oRPC procedure call over the JSON wire ({"json": input}). */
export async function rpc<T = unknown>(
  request: APIRequestContext,
  path: string,
  input?: unknown,
): Promise<T> {
  const r = await request.post(`/rpc/${path}`, {
    data: { json: input ?? {} },
    headers: { 'content-type': 'application/json' },
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok()) {
    throw new Error(`rpc ${path} -> ${r.status()}: ${JSON.stringify(body).slice(0, 200)}`)
  }
  return (body as { json: T }).json
}

/** UI login through the real form (fills + submits, waits for the shell). */
export async function uiLogin(page: Page) {
  // listeners COLLECT; throwing inside an event handler is not an assertion
  // (it surfaces as an unhandled worker error and stays attached all test)
  const problems: string[] = []
  page.on('response', (r) => {
    if (r.url().includes('/auth/') && r.status() >= 400) {
      problems.push(`auth POST failed during login: ${r.status()} ${r.url()} ${r.request().method()}`)
    }
  })
  page.on('pageerror', (e) => problems.push(`page error during login: ${String(e).slice(0, 300)}`))
  await page.goto('/admin')
  await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.locator('input[type="email"]').first().fill(ADMIN.email)
  await page.locator('input[type="password"]').first().fill(ADMIN.password)
  // hydration race: retry click -> response until the app is interactive
  let postResponse: any
  await expect(async () => {
    const [resp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/auth/sign-in/email'), { timeout: 8_000 }),
      page.getByRole('button', { name: 'Sign in', exact: true }).click({ force: true }),
    ])
    postResponse = resp
  }).toPass({ timeout: 30_000 })
  if (!postResponse!.ok()) {
    throw new Error(`sign-in POST ${postResponse!.status()}: ${(await postResponse!.text()).slice(0, 200)}`)
  }
  // shell signal: the Routes page heading (h2) appears once the layout swaps
  await expect(page.getByRole('heading', { level: 2, name: 'Routes' })).toBeVisible({ timeout: 20_000 })
  expect(problems, `login produced errors: ${problems.join(' | ')}`).toHaveLength(0)
}
