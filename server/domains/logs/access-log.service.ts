const getDb = async () => (await import('../../db')).db
// Access log: record forwarded requests + retention sweeper.
// Insert on every proxied request (fire-and-forget, never blocks the proxy),
// DELETE older than retention every 6h + on boot (1 min after).
// lazy: nuxt prepare (jiti/Node) must not statically reach bun:sqlite
import { accessLog } from '../../db/schema'
import { getSettings } from '../settings/settings.service'
import { lt, desc, eq, and, gt, asc, inArray, sql, type SQL } from 'drizzle-orm'
import { publishChange } from '../../lib/change-bus'

export type AccessLogRow = typeof accessLog.$inferSelect

/** delta query: entries STRICTLY AFTER a cursor id, ascending (client prepends) */
export async function queryAccessLogAfter(afterId: number, limit: number, routeIds?: number[]) {
  const db = await getDb()
  const scope = routeIds === undefined ? undefined : inArray(accessLog.routeId, routeIds)
  const rows = await db.select().from(accessLog)
    .where(and(gt(accessLog.id, afterId), scope))
    .orderBy(asc(accessLog.id))
    .limit(limit)
  return rows
}

let logWriteFailed = false

export function recordAccess(entry: {
  routeId: number | null
  routePath: string | null
  method: string
  path: string
  status: number
  durationMs: number
  clientIp: string | null
  userAgent: string | null
}) {
  // fire-and-forget; log failure must never break proxying (warn once per streak)
  void getDb().then(db => db.insert(accessLog).values(entry)
    .then(() => { logWriteFailed = false; return publishChange('logs', 'create') })
    .catch((e) => { if (!logWriteFailed) { logWriteFailed = true; console.error('[access-log] write failed:', e instanceof Error ? e.message : e) } }))
    // the DB client itself can fail to load (import/migration trouble): without
    // a line here the only signal that access logging stopped is missing rows
    .catch((e) => { console.error('[access-log] disabled:', e instanceof Error ? e.message : e) })
}

export async function queryAccessLog(opts: { limit?: number, routeId?: number, routeIds?: number[], beforeId?: number }) {
  const limit = Math.min(opts.limit ?? 100, 1000)
  const conditions: SQL[] = []
  if (opts.routeId !== undefined) conditions.push(eq(accessLog.routeId, opts.routeId))
  else if (opts.routeIds !== undefined) conditions.push(inArray(accessLog.routeId, opts.routeIds))
  if (opts.beforeId !== undefined) conditions.push(lt(accessLog.id, opts.beforeId))
  const rows = await (await getDb()).select().from(accessLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(accessLog.id))
    .limit(limit)
  return rows
}

/** rows per DELETE: the db has a single writer, so an unbounded purge would
 *  hold it for the whole sweep and block every proxied request's insert */
const PURGE_BATCH = 5000

export async function purgeOldLogs() {
  const s = await getSettings()
  if (s.logRetentionDays <= 0) return 0
  const cutoff = new Date(Date.now() - s.logRetentionDays * 86400_000).toISOString()
  const db = await getDb()
  let removed = 0
  for (;;) {
    // id-subselect keeps the DELETE itself bounded (sqlite has no DELETE LIMIT
    // without the build flag); repeat until a batch comes back short
    const res = await db.run(sql`DELETE FROM access_log WHERE id IN (SELECT id FROM access_log WHERE ts < ${cutoff} LIMIT ${PURGE_BATCH})`)
    const changes = Number(res.changes ?? 0)
    removed += changes
    if (changes < PURGE_BATCH) return removed
  }
}

// start/stop the sweeper (6h interval; first run after 1 min). The handles live
// at module scope so the nitro close hook can clear them — an orphaned interval
// outlives the app and every HMR reload stacks another sweeper.
let sweeper: { first: ReturnType<typeof setTimeout>, every: ReturnType<typeof setInterval> } | null = null

export function startLogSweeper() {
  if (sweeper) return
  const purge = () => purgeOldLogs()
    .then(n => { if (n > 0) return publishChange('logs', 'delete') })
    .catch(e => console.error('[access-log] purge failed:', e instanceof Error ? e.message : e))
  const first = setTimeout(purge, 60_000)
  first.unref?.()
  const every = setInterval(purge, 6 * 3600_000)
  every.unref?.()
  sweeper = { first, every }
}

/** clear both timers (nitro close hook) so a closed/reloaded app leaves none */
export function stopLogSweeper() {
  if (!sweeper) return
  clearTimeout(sweeper.first)
  clearInterval(sweeper.every)
  sweeper = null
}
