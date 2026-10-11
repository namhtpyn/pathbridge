import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // bun:sqlite + WAL: one writer at a time — run test files sequentially,
    // each in a fresh DATA_DIR (set per-file in the tests' setup below)
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    env: { DATA_DIR: '/tmp/pb-vitest-db' },
  },
})
