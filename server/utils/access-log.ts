// Access log: record forwarded requests + retention sweeper.
// Insert on every proxied request (fire-and-forget, never blocks the proxy),
// DELETE older than retention every 6h + on boot (1 min after).
import { db } from '../db'
import { accessLog } from '../db/schema'
import { getSettings } from './settings'
import { lt, desc, eq, and, type SQL } from 'drizzle-orm'
import { publishChange } from './change-bus'

export interface AccessLogRow {
  id: number
  ts: string
  routeId: number | null
  routePath: string | null
  method: string
  path: string
  status: number
  durationMs: number
  clientIp: string | null
  userAgent: string | null
}

export function recordAccess(entry: {
  routeId: number | null
  routePath: string | null
  method: string
  path: string
  status: number
  durationMs: number
  clientIp: string | null
  userAgent: string | null
}): void {
  // fire-and-forget; log failure must never break proxying
  db.insert(accessLog).values(entry)
    .then(() => publishChange('logs', 'create'))
    .catch(() => {})
}

export async function queryAccessLog(opts: { limit?: number, routeId?: number, beforeId?: number }): Promise<AccessLogRow[]> {
  const limit = Math.min(opts.limit ?? 100, 1000)
  const conditions: SQL[] = []
  if (opts.routeId !== undefined) conditions.push(eq(accessLog.routeId, opts.routeId))
  if (opts.beforeId !== undefined) conditions.push(lt(accessLog.id, opts.beforeId))
  const rows = await db.select().from(accessLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(accessLog.id))
    .limit(limit)
  return rows as unknown as AccessLogRow[]
}

export async function purgeOldLogs(): Promise<number> {
  const s = await getSettings()
  if (s.logRetentionDays <= 0) return 0
  const cutoff = new Date(Date.now() - s.logRetentionDays * 86400_000).toISOString()
  const res = await db.delete(accessLog).where(lt(accessLog.ts, cutoff)).returning({ id: accessLog.id })
  return res.length
}

// start sweeper (6h interval; first run after 1 min). unref'd so bun exits freely.
export function startLogSweeper(): void {
  const t = setTimeout(() => { purgeOldLogs().catch(() => {}) }, 60_000)
  t.unref?.()
  const i = setInterval(() => { purgeOldLogs().catch(() => {}) }, 6 * 3600_000)
  i.unref?.()
}
