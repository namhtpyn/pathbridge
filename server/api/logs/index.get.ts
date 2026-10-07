// GET /api/logs?limit=&pairId=&beforeId= — access log query.
// read-all: every log; read-own: logs for pairs the caller owns.
import { queryAccessLog } from '../../utils/access-log'
import { requireReadScope } from '../../utils/permissions'
import { db } from '../../db'

export default defineEventHandler(async (event) => {
  const { user, scope } = await requireReadScope(event, 'logs')
  const q = getQuery(event)
  const limit = Number(q.limit ?? 100)
  const pairId = q.pairId !== undefined ? Number(q.pairId) : undefined
  const beforeId = q.beforeId !== undefined ? Number(q.beforeId) : undefined

  if (scope === 'all') {
    return { entries: await queryAccessLog({
      limit: Number.isFinite(limit) ? limit : 100,
      pairId: Number.isFinite(pairId as number) ? pairId : undefined,
      beforeId: Number.isFinite(beforeId as number) ? beforeId : undefined,
    }) }
  }

  // own: restrict to the caller's pairs (pairId filter must also be owned)
  const own = await db.query.pairs.findMany({ where: { userId: user.userId }, columns: { id: true } })
  const ownIds = new Set(own.map(p => p.id))
  if (pairId !== undefined && !ownIds.has(pairId)) {
    return { entries: [] }
  }
  const entries = []
  for (const pid of ownIds) {
    const batch = await queryAccessLog({
      limit: Number.isFinite(limit) ? limit : 100,
      pairId: pid,
      beforeId: Number.isFinite(beforeId as number) ? beforeId : undefined,
    })
    entries.push(...batch)
  }
  entries.sort((a, b) => b.id - a.id)
  return { entries: entries.slice(0, Number.isFinite(limit) ? limit : 100) }
})
