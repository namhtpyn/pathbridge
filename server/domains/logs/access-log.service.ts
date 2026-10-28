const getDb = async () => (await import('../../db')).db
// Access log: record forwarded requests + retention sweeper.
// Insert on every proxied request (fire-and-forget, never blocks the proxy),
// DELETE older than retention every 6h + on boot (1 min after).
// lazy: nuxt prepare (jiti/Node) must not statically reach bun:sqlite
import { accessLog } from '../../db/schema'
import { getSettings } from '../settings/settings.service'
import { lt, desc, eq, and, gt, asc, inArray, type SQL } from 'drizzle-orm'
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
    .catch(() => {})
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

export async function purgeOldLogs() {
  const s = await getSettings()
  if (s.logRetentionDays <= 0) return 0
  const cutoff = new Date(Date.now() - s.logRetentionDays * 86400_000).toISOString()
  const res = await (await getDb()).delete(accessLog).where(lt(accessLog.ts, cutoff)).run()
  return Number(res.changes)
}

// start sweeper (6h interval; first run after 1 min). unref'd so bun exits freely.
let sweeperStarted = false
export function startLogSweeper() {
  if (sweeperStarted) return
  sweeperStarted = true
  const purge = () => purgeOldLogs()
    .then(n => { if (n > 0) return publishChange('logs', 'delete') })
    .catch(e => console.error('[access-log] purge failed:', e instanceof Error ? e.message : e))
  const t = setTimeout(purge, 60_000)
  t.unref?.()
  const i = setInterval(purge, 6 * 3600_000)
  i.unref?.()
}
