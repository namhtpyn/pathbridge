import { mkdtempSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

// Nuxt testing guide layout: unit (node env, pure modules) + nuxt (Nuxt runtime
// env via @nuxt/test-utils) as vitest projects. e2e stays on Playwright against
// the real built artifact (test/e2e) — separate runner, see playwright.config.ts.
export default defineConfig({
  resolve: { alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)) } },

  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
          // bun:sqlite + WAL: one writer at a time — sequential files, fresh DATA_DIR per run
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          fileParallelism: false,
          env: { DATA_DIR: mkdtempSync(join(tmpdir(), 'pb-vitest-')) },
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.test.ts'],
          environment: 'nuxt',
        },
      }),
    ],
  },
})
