import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

// Nuxt testing guide layout: unit (node env, pure modules) + nuxt (Nuxt runtime
// env via @nuxt/test-utils) as vitest projects. e2e stays on Playwright against
// the real built artifact (tests/e2e) — separate runner, see playwright.config.ts.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          // bun:sqlite + WAL: one writer at a time — sequential files, fresh DATA_DIR per run
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          fileParallelism: false,
          env: { DATA_DIR: '/tmp/pb-vitest-db' },
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['tests/nuxt/**/*.test.ts'],
          environment: 'nuxt',
        },
      }),
    ],
  },
})
