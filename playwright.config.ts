import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 60_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4310',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // mobile-first law: every e2e test also runs at 390px (chromium engine —
    // webkit isn't shipped in CI; the law is the viewport, not the engine)
    { name: 'mobile', use: {
      browserName: 'chromium',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    } },
  ],
  // two servers, both owned by Playwright: the echo upstream (otherwise it was
  // spawned inline & detached — a crash there looked like a proxy bug and
  // nothing ever tore it down) and the built app under test
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : [
        {
          command: 'bun test/e2e/upstream.mjs',
          url: 'http://127.0.0.1:4311/echo?p=1',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
        {
          command: 'bun run build >/dev/null 2>&1 && DATA_DIR=$E2E_DATA_DIR PORT=4310 BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4310,http://127.0.0.1:4310 BETTER_AUTH_SECRET=e2e-secret-0123456789abcdefghijklmnop ADMIN_EMAIL=e2e@pathbridge.dev ADMIN_PASSWORD=e2e-admin-pw bun .output/server/index.mjs',
          url: 'http://127.0.0.1:4310/health/ready',
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
          env: {
            // fresh DB per run — a persistent dir made run 2 fail with 403s on
            // fixtures that a previous run already created
            E2E_DATA_DIR: process.env.E2E_DATA_DIR || mkdtempSync(join(tmpdir(), 'pb-e2e-')),
          },
        },
      ],
})
