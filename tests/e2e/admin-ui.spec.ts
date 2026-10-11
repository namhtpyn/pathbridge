// E2E: admin UI — login, pages, realtime CRUD, mobile layout (390px law).
import { expect, test } from '@playwright/test'
import { uiLogin } from './helpers'

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
