// Drizzle client over bun:sqlite (rc, Relations v2). Schema applied via drizzle-kit
// migration files in ./drizzle; DATA_DIR holds pathbridge.db.
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { routes, relations, user, session, account, verification, apiKey as apikeyTable, roles as rolesTableDef } from './schema'

const dataDir = process.env.DATA_DIR || './data'
mkdirSync(dataDir, { recursive: true })

const sqlite = new Database(join(dataDir, 'pathbridge.db'))
sqlite.exec('PRAGMA journal_mode = WAL;')
sqlite.exec('PRAGMA foreign_keys = ON;')

// apply drizzle-kit migrations (tracked in __migrations)
sqlite.exec(`CREATE TABLE IF NOT EXISTS __migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)`)
try {
  const drizzleDir = process.env.DRIZZLE_DIR || join(process.cwd(), 'drizzle')
  const dirs = readdirSync(drizzleDir).sort()
  for (const dir of dirs) {
    const applied = sqlite.query('SELECT 1 FROM __migrations WHERE name = ?').get(dir)
    if (applied) continue
    const sqlFile = readdirSync(join(drizzleDir, dir)).find((f: string) => f.endsWith('.sql'))
    if (!sqlFile) continue
    const raw = readFileSync(join(drizzleDir, dir, sqlFile), 'utf8')
    const stmts = raw.split('--> statement-breakpoint').map((s: string) => s.trim()).filter(Boolean)
    for (const stmt of stmts) sqlite.exec(stmt)
    sqlite.query('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)').run(dir, new Date().toISOString())
  }
}
catch (e) {
  // bundled builds may not carry ./drizzle; warn but keep serving (tables must exist)
  const msg = e instanceof Error ? e.message : String(e)
  console.warn('migration skip:', msg)
}

// tables-only schema object (namespace import carries type exports too)
const tables = { user, session, account, verification, routes }

// rc: `schema` lives inside defineRelations() — drizzle() takes relations only
export const db = drizzle({ client: sqlite, relations })
export { tables }
