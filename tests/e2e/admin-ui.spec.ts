// E2E: admin UI — login, pages, realtime CRUD, mobile layout (390px law).
import { expect, test } from '@playwright/test'
import { uiLogin } from './helpers'

// desktop + mobile share one server/db: namespace fixture names per project
let SFX = 'x'
test.beforeEach(({ }, testInfo) => { SFX = testInfo.project.name.replace(/\W+/g, '') })
const uniq = (base: string) => `${base}-${SFX}`

test('icon-only buttons carry hover popovers', async ({ page }) => {
  await uiLogin(page)
  // ensure a route row exists, then hover its edit pencil — the IconButton popover shows
  await page.request.post('/rpc/routes/save', { data: { json: { path: '/e2e-popover', target: 'http://127.0.0.1:4311' } } })
  await expect(page.getByRole('button', { name: 'Edit route' }).first()).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Edit route' }).first().hover()
  // popover content renders the text outside the button's aria-label
  await expect(page.locator('[data-slot="content"]').getByText('Edit route').first()).toBeVisible({ timeout: 5_000 })
  await page.request.post('/rpc/routes/remove', { data: { json: { path: '/e2e-popover' } } })
})

// desktop-only: the mobile drawer interaction for opening Profile is flaky in
// headless webkit-less runs and the modal UI is viewport-independent (the
// 390px suite covers shell layout parity separately)
test('api key rename through the profile modal', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 768, 'desktop-only: drawer profile open')
  await uiLogin(page)
  // open profile (collapsed sidebar chip or the dropdown path on desktop)
  // open Profile: mobile = drawer chip; desktop = sidebar dropdown item
  const openBtn = page.getByRole('button', { name: 'Open sidebar' })
  if (await openBtn.isVisible().catch(() => false)) await openBtn.click()
  await page.getByRole('button', { name: /Profile & API keys|chevrons-up-down|Admin/i }).first().click()
  const profileItem = page.getByRole('menuitem', { name: 'Profile' })
  if (await profileItem.isVisible().catch(() => false)) await profileItem.click()
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 10_000 })

  // create a key (header button opens the editor modal; modal submit has the same label)
  await page.getByRole('button', { name: 'Create key' }).first().click()
  await page.locator('input[placeholder="ci-deploy"]').fill(uniq('ui-key'))
  await page.getByRole('button', { name: 'Create key' }).last().click()
  // created-key modal shows the secret ONCE — dismiss it to reach the key list
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(uniq('ui-key')).first()).toBeVisible({ timeout: 10_000 })
  // rename it
  await page.getByRole('button', { name: 'Rename key' }).click()
  await page.locator('input[placeholder="key name"]').fill(uniq('ui-key-renamed'))
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByText(uniq('ui-key-renamed')).first()).toBeVisible({ timeout: 10_000 })
})

// create-success modals must CLOSE by themselves: a lingering dialog stacks with the
// next interaction (found in the 2026-10-14 UI review; each flow below submits a real
// create and asserts the dialog is gone)
test('route-create modal closes on success', async ({ page }) => {
  await uiLogin(page)
  await page.getByRole('button', { name: 'New route' }).first().click()
  await page.locator('input[name="path"]').fill(uniq('/mclose-route'))
  await page.locator('input[name="target"]').fill('http://127.0.0.1:4311')
  await page.getByRole('button', { name: 'Add route' }).click()
  await expect(page.getByRole('heading', { name: 'Create route' })).toBeHidden({ timeout: 10_000 })
  await expect(page.getByText(uniq('/mclose-route')).first()).toBeVisible({ timeout: 10_000 })
  await page.request.post('/rpc/routes/remove', { data: { json: { path: uniq('/mclose-route') } } })
})

test('user-create modal closes on success', async ({ page }) => {
  await uiLogin(page)
  await page.goto('/admin/users')
  await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Add user' }).click()
  await page.locator('input[type="email"]').fill(uniq('mclose') + '@pathbridge.dev')
  await page.locator('input[placeholder*="Jane" i], input[name="name"]').first().fill('Modal Close')
  await page.locator('input[type="password"]').fill('mclose-pass-123')
  await page.getByRole('button', { name: 'Create user' }).click()
  await expect(page.getByRole('heading', { name: 'Add user' })).toBeHidden({ timeout: 10_000 })
  await expect(page.getByText(uniq('mclose') + '@pathbridge.dev').first()).toBeVisible({ timeout: 10_000 })
})

test('role-create modal closes on success', async ({ page }) => {
  await uiLogin(page)
  await page.goto('/admin/roles')
  await expect(page.getByRole('button', { name: 'New role' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'New role' }).click()
  await page.locator('input[name="name"], input[placeholder="e.g. auditor"]').first().fill(uniq('mclose-role'))
  await page.getByRole('button', { name: 'Create role' }).click()
  await expect(page.getByRole('heading', { name: 'New role' })).toBeHidden({ timeout: 10_000 })
  await expect(page.getByText(uniq('mclose-role')).first()).toBeVisible({ timeout: 10_000 })
})

test('key-create editor closes and secret dialog shows once', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 768, 'desktop-only: drawer profile open')
  await uiLogin(page)
  const openBtn = page.getByRole('button', { name: 'Open sidebar' })
  if (await openBtn.isVisible().catch(() => false)) await openBtn.click()
  await page.getByRole('button', { name: /Profile & API keys|chevrons-up-down|Admin/i }).first().click()
  const profileItem = page.getByRole('menuitem', { name: 'Profile' })
  if (await profileItem.isVisible().catch(() => false)) await profileItem.click()
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Create key' }).first().click()
  await page.locator('input[placeholder="ci-deploy"]').fill(uniq('mclose-key'))
  await page.getByRole('button', { name: 'Create key' }).last().click()
  // secret dialog appears ONCE
  await expect(page.getByRole('heading', { name: 'API key created' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Done' }).click()
  // secret dialog AND the create editor are both gone
  await expect(page.getByRole('heading', { name: 'API key created' })).toBeHidden({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Create API key' })).toBeHidden({ timeout: 10_000 })
})

// sign-out must tear down the profile modal: the previous user's key list must not
// survive the session switch (stale-privileged-data regression pin)
test('profile modal does not survive sign-out', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 768, 'desktop-only: drawer profile open')
  await uiLogin(page)
  const openBtn = page.getByRole('button', { name: 'Open sidebar' })
  if (await openBtn.isVisible().catch(() => false)) await openBtn.click()
  await page.getByRole('button', { name: /Profile & API keys|chevrons-up-down|Admin/i }).first().click()
  const profileItem = page.getByRole('menuitem', { name: 'Profile' })
  if (await profileItem.isVisible().catch(() => false)) await profileItem.click()
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 10_000 })

  // sign out from the dropdown WHILE the profile modal is open (worst case)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /chevrons-up-down|Admin/i }).first().click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 })
})

// logs tail semantics (Nam's model, 2026-10-14): one merged list — deltas prepend,
// oldest evicted, size stays at what the user loaded; Load more cursor-pages BELOW
// the window WHILE THE TAIL KEEPS RUNNING (no mode switch, no Resume button)
test('logs: live window stays at 50 as new traffic arrives (prepend + evict)', async ({ page }) => {
  await uiLogin(page)
  // seed history first — a fresh DB has no rows, and the window assert needs 50
  await page.request.post('/rpc/routes/save', { data: { json: { path: uniq('/log-live'), target: 'http://127.0.0.1:4311' } } })
  for (let i = 0; i < 55; i++) await page.request.get(uniq('/log-live'))
  await page.goto('/admin/logs')
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('table tbody tr')).toHaveCount(50, { timeout: 10_000 })

  // 5 more arrive: prepend, list stays 50
  for (let i = 0; i < 5; i++) await page.request.get(uniq('/log-live'))
  await expect(page.locator('table tbody tr').first()).toContainText(uniq('/log-live'), { timeout: 15_000 })
  await expect(page.locator('table tbody tr')).toHaveCount(50, { timeout: 15_000 })
  await page.request.post('/rpc/routes/remove', { data: { json: { path: uniq('/log-live') } } })
})

test('logs: Load more grows list to 100 and live keeps appending while paged', async ({ page }) => {
  await uiLogin(page)
  // seed 60+ rows of history BEFORE visiting
  await page.request.post('/rpc/routes/save', { data: { json: { path: uniq('/log-page'), target: 'http://127.0.0.1:4311' } } })
  for (let i = 0; i < 110; i++) await page.request.get(uniq('/log-page'))
  await page.goto('/admin/logs')
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('table tbody tr')).toHaveCount(50, { timeout: 10_000 })
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.locator('table tbody tr')).toHaveCount(100, { timeout: 15_000 })

  // live continues WHILE paged: new traffic prepends and the list stays at 100
  for (let i = 0; i < 5; i++) await page.request.get(uniq('/log-page'))
  await expect(page.locator('table tbody tr').first()).toContainText(uniq('/log-page'), { timeout: 15_000 })
  await expect(page.locator('table tbody tr')).toHaveCount(100, { timeout: 15_000 })
  // and the Resume button is gone for good
  await expect(page.getByRole('button', { name: 'Resume live tail' })).toHaveCount(0)
  await page.request.post('/rpc/routes/remove', { data: { json: { path: uniq('/log-page') } } })
})

// live toggle: switching Live OFF freezes the list (new traffic does NOT appear);
// switching back ON re-subscribes and fresh traffic flows again
test('logs: Live toggle pauses and resumes the tail', async ({ page }) => {
  await uiLogin(page)
  await page.request.post('/rpc/routes/save', { data: { json: { path: uniq('/log-tgl'), target: 'http://127.0.0.1:4311' } } })
  await page.request.get(uniq('/log-tgl'))
  await page.goto('/admin/logs')
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 })

  // pause — the seed row is already in the list; new traffic must NOT grow it
  const rowsAtPause = await page.locator('table tbody tr').count()
  await page.getByRole('switch', { name: /live log tail toggle/i }).click()
  await expect(page.getByText('paused', { exact: true })).toBeVisible({ timeout: 5_000 })
  await page.waitForTimeout(1_500)
  for (let i = 0; i < 3; i++) await page.request.get(uniq('/log-tgl'))
  await page.waitForTimeout(3_000)
  await expect(page.locator('table tbody tr')).toHaveCount(rowsAtPause, { timeout: 5_000 })

  // resume — the tail reconnects and new traffic prepends
  await page.getByRole('switch', { name: /live log tail toggle/i }).click()
  for (let i = 0; i < 3; i++) await page.request.get(uniq('/log-tgl'))
  await expect(page.locator('table tbody tr').first()).toContainText(uniq('/log-tgl'), { timeout: 15_000 })
  await page.request.post('/rpc/routes/remove', { data: { json: { path: uniq('/log-tgl') } } })
})

test.describe('admin shell', () => {
  test('login form → shell, session persists, sign-out works', async ({ page }) => {
    await page.goto('/admin')
    // anonymous -> login card (not the shell)
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 })
    await uiLogin(page)

    // reload keeps the session (no login card)
    await page.reload()
    await expect(page.locator('input[type="password"]').first()).toBeHidden({ timeout: 15_000 })

    if ((page.viewportSize()?.width ?? 1280) >= 768) {
      // desktop shell: sidebar user chip -> dropdown -> Sign out
      await expect(page.getByText('Admin', { exact: true }).first()).toBeVisible()
      await page.getByRole('button', { name: /Admin|circle-user|chevrons/i }).first().click()
      await page.getByRole('menuitem', { name: 'Sign out' }).click()
      await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 })
    }
  })

  test('routes CRUD through the UI, realtime without reload', async ({ page }) => {
    await uiLogin(page)
    // create via modal
    await page.getByRole('button', { name: 'New route' }).click()
    await page.locator('[name="path"] input, input[name="path"]').first().fill('/e2e-ui-route')
    await page.locator('[name="target"] input, input[name="target"]').first().fill('http://127.0.0.1:4311')
    await page.getByRole('button', { name: 'Add route' }).click()
    // row appears in the table (live query — no reload)
    const row = page.locator('tr', { hasText: '/e2e-ui-route' }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })

    // it forwards for real
    expect(await (await page.request.get('/e2e-ui-route')).status()).toBe(200)

    // delete via row action
    await row.getByRole('button', { name: 'Delete route' }).click()
    // confirm if the app asks (page.on('dialog') covers native confirm)
    page.once('dialog', d => d.accept().catch(() => {}))
    const confirmBtn = page.getByRole('button', { name: /^delete$/i }).last()
    try { await confirmBtn.click({ timeout: 2_000 }) } catch { /* no confirm step */ }
    await expect(row).toBeHidden({ timeout: 15_000 })
    expect(await (await page.request.get('/e2e-ui-route')).status()).toBe(404)
  })

  const pages = [['Users', 'Users'], ['Roles', 'Roles'], ['Settings', 'Settings'], ['Logs', 'Access log']] as const
  for (const [nav, heading] of pages) {
    test(`nav: ${nav} page renders`, async ({ page }) => {
      await uiLogin(page)
      // mobile: nav links live behind the drawer
      const openBtn = page.getByRole('button', { name: 'Open sidebar' })
      if (await openBtn.isVisible().catch(() => false)) await openBtn.click()
      await page.getByRole('link', { name: new RegExp(`^${nav}$`, 'i') }).first().click()
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible({ timeout: 10_000 })
    })
  }
})

test.describe('mobile 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('no horizontal scroll anywhere in the shell', async ({ page }) => {
    await uiLogin(page)
    // 390px: nav lives behind the drawer — open it before each navigation
    const openDrawer = async () => {
      const btn = page.getByRole('button', { name: 'Open sidebar' })
      if (await btn.isVisible().catch(() => false)) await btn.click()
    }
    for (const nav of ['Users', 'Roles', 'Settings', 'Logs']) {
      await openDrawer()
      await page.getByRole('link', { name: new RegExp(`^${nav}$`, 'i') }).first().click()
      await page.waitForTimeout(400)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${nav} overflows`).toBeLessThanOrEqual(0)
    }
  })
})
