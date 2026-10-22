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
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'bun run build >/dev/null 2>&1 && (bun test/e2e/upstream.mjs >/dev/null 2>&1 &) && DATA_DIR=$E2E_DATA_DIR PORT=4310 BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4310,http://127.0.0.1:4310 BETTER_AUTH_SECRET=e2e-secret-0123456789abcdefghijklmnop ADMIN_EMAIL=e2e@pathbridge.dev ADMIN_PASSWORD=e2e-admin-pw bun .output/server/index.mjs',
        url: 'http://127.0.0.1:4310/health',
        reuseExistingServer: true,
        timeout: 240_000,
        env: {
          E2E_DATA_DIR: process.env.E2E_DATA_DIR ?? '/tmp/pb-e2e-playwright',
        },
      },
})
