// Drizzle client over bun:sqlite (rc, Relations v2). Schema applied via drizzle-kit
// migration files in ./drizzle; DATA_DIR holds pathbridge.db.
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs'
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
const drizzleDir = process.env.DRIZZLE_DIR || join(process.cwd(), 'drizzle')
let dirs: string[]
try {
  dirs = readdirSync(drizzleDir, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name).sort()
}
catch (e) {
  // ONLY a genuinely missing dir (bundled builds ship without ./drizzle) may
  // keep serving; every other readdir failure is a real boot error.
  if ((e as NodeJS.ErrnoException)?.code === 'ENOENT' && !existsSync(drizzleDir)) {
    console.warn('[db] migration dir missing, skipping:', drizzleDir)
    dirs = []
  }
  else {
    throw e
  }
}

// PRAGMA foreign_keys is CONNECTION state: snapshot it BEFORE any migration
// toggles it and restore that exact value in `finally`. Replaying a migration's
// pragma chunks would execute its trailing `PRAGMA foreign_keys = OFF` and
// leave FK enforcement disabled for the whole process.
const fkSnapshot = sqlite.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()
const fkOn = fkSnapshot?.foreign_keys === 1

try {
  for (const dir of dirs) {
    const applied = sqlite.query('SELECT 1 FROM __migrations WHERE name = ?').get(dir)
    if (applied) continue
    const sqlFiles = readdirSync(join(drizzleDir, dir)).filter((f: string) => f.endsWith('.sql'))
    // EXACTLY one .sql per folder: >1 is ambiguous, and 0 means the migration's
    // SQL is lost — skipping it would journal nothing while later migrations
    // apply, leaving the db permanently one migration behind with no error.
    if (sqlFiles.length !== 1) {
      throw new Error(`${dir} declares ${sqlFiles.length} .sql files — exactly one migration per folder`)
    }
    const sqlFile = sqlFiles[0]!
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
      // restore the SNAPSHOT, never a blind ON and never the migration's own
      // pragma chunks: a trailing `foreign_keys = OFF` must not escape
      if (fkOff) sqlite.exec(`PRAGMA foreign_keys = ${fkOn ? 'ON' : 'OFF'}`)
    }
  }
}
catch (e) {
  // a real migration failure must be loud — serving a wrong schema is worse
  throw new Error(`migration failed: ${e instanceof Error ? e.message : String(e)}`)
}

// rc: `schema` lives inside defineRelations() — drizzle() takes relations only
export const db = drizzle({ client: sqlite, relations })
