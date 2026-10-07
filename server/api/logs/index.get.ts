// GET /api/logs?limit=&routeId=&beforeId= — access log query.
// read-all: every log; read-own: logs for routes the caller owns.
import { queryAccessLog } from '../../utils/access-log'
import { requireReadScope } from '../../utils/permissions'
import { db } from '../../db'

export default defineEventHandler(async (event) => {
  const { user, scope } = await requireReadScope(event, 'logs')
  const q = getQuery(event)
  const limit = Number(q.limit ?? 100)
  const routeId = q.routeId !== undefined ? Number(q.routeId) : undefined
  const beforeId = q.beforeId !== undefined ? Number(q.beforeId) : undefined

  if (scope === 'all') {
    return { entries: await queryAccessLog({
      limit: Number.isFinite(limit) ? limit : 100,
      routeId: Number.isFinite(routeId as number) ? routeId : undefined,
      beforeId: Number.isFinite(beforeId as number) ? beforeId : undefined,
    }) }
  }

  // own: restrict to the caller's routes (routeId filter must also be owned)
  const own = await db.query.routes.findMany({ where: { userId: user.userId }, columns: { id: true } })
  const ownIds = new Set(own.map(p => p.id))
  if (routeId !== undefined && !ownIds.has(routeId)) {
    return { entries: [] }
  }
  const entries = []
  for (const pid of ownIds) {
    const batch = await queryAccessLog({
      limit: Number.isFinite(limit) ? limit : 100,
      routeId: pid,
      beforeId: Number.isFinite(beforeId as number) ? beforeId : undefined,
    })
    entries.push(...batch)
  }
  entries.sort((a, b) => b.id - a.id)
  return { entries: entries.slice(0, Number.isFinite(limit) ? limit : 100) }
})
