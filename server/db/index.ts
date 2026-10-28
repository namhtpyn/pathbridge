// Drizzle client over bun:sqlite (rc, Relations v2). Schema applied via drizzle-kit
// migration files in ./drizzle; DATA_DIR holds pathbridge.db.
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { routes, relations, user, session, account, verification } from './schema'

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
// concurrent writers (access-log inserts vs admin writes) can raise
// SQLITE_BUSY on the spot — wait instead of failing
sqlite.exec('PRAGMA busy_timeout = 5000')
try {
  const drizzleDir = process.env.DRIZZLE_DIR || join(process.cwd(), 'drizzle')
  const dirs = readdirSync(drizzleDir, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name).sort()
  for (const dir of dirs) {
    const applied = sqlite.query('SELECT 1 FROM __migrations WHERE name = ?').get(dir)
    if (applied) continue
    const sqlFiles = readdirSync(join(drizzleDir, dir)).filter((f: string) => f.endsWith('.sql'))
    if (sqlFiles.length > 1) throw new Error(`${dir} declares ${sqlFiles.length} .sql files — one migration per folder`)
    const sqlFile = sqlFiles[0]
    if (!sqlFile) continue
    const raw = readFileSync(join(drizzleDir, dir, sqlFile), 'utf-8')
    // strip leading `--` comment lines per chunk: a comment-only chunk (e.g. a
    // trailing explanation after the last breakpoint) makes sqlite.exec throw
    // "no valid SQL statement" AFTER the real statements ran — losing the
    // journal row and re-running the migration on every boot
    const stmts = raw.split('--> statement-breakpoint')
      .map(s => s.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n').trim())
      .filter(Boolean)
    // PRAGMA statements are connection state, not schema: SQLite ignores them
    // inside a transaction, so table-recreate migrations must toggle
    // foreign_keys=OFF around the atomic block instead.
    const pragmas = stmts.filter(st => /^PRAGMA\b/i.test(st))
    const ddl = stmts.filter(st => !/^PRAGMA\b/i.test(st))
    const fkOff = pragmas.some(p => /foreign_keys\s*=\s*(off|0|false)/i.test(p))
    if (fkOff) sqlite.exec('PRAGMA foreign_keys = OFF')
    // ATOMIC: DDL + the journal row commit together, so a crash mid-migration
    // rolls back and retries cleanly next boot instead of half-applying and
    // silently skipping every later migration
    sqlite.exec('BEGIN')
    try {
      for (const stmt of ddl) sqlite.exec(stmt)
      sqlite.query('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)').run(dir, new Date().toISOString())
      sqlite.exec('COMMIT')
      console.log(`[db] applied migration ${dir}`)
    }
    catch (e) {
      sqlite.exec('ROLLBACK')
      throw e
    }
    finally {
      if (fkOff) sqlite.exec('PRAGMA foreign_keys = ON')
      for (const p of pragmas) sqlite.exec(p)
    }
  }
}
catch (e) {
  // ONLY the missing-drizzle case (bundled builds) may keep serving; a real
  // migration failure must be loud — serving a wrong schema is worse.
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('ENOENT')) console.warn('[db] migration dir missing, skipping:', msg)
  else throw new Error(`migration failed: ${msg}`)
}

// rc: `schema` lives inside defineRelations() — drizzle() takes relations only
export const db = drizzle({ client: sqlite, relations })
