import { defineConfig } from 'drizzle-kit'

// Migrations are HAND-WRITTEN (boot runner applies ./drizzle folders). The
// generator is pointed at a scratch dir outside the boot chain so an accidental
// `drizzle-kit generate` can never inject a CREATE TABLE folder that bricks the
// next boot (see AGENTS.md — generate/push/pull are forbidden).
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './.drizzle-scratch',
})
