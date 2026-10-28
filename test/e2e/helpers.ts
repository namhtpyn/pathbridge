// Shared E2E helpers: auth against the built app + oRPC wire helpers.
import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const ADMIN = { email: 'e2e@pathbridge.dev', password: 'e2e-admin-pw' }

/** Sign in via the better-auth endpoint; returns the session cookie jar state. */
export async function signIn(request: APIRequestContext) {
  // better-auth rejects cookie-carrying POSTs without Origin — always send it
  const origin = new URL(process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4310').origin
  const r = await request.post('/auth/sign-in/email', { data: ADMIN, headers: { origin } })
  expect(r.status(), `sign-in failed: ${await r.text()}`).toBe(200)
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
