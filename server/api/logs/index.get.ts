// GET /api/logs?limit=&pairId=&beforeId= — access log query (auth required)
import { queryAccessLog } from '../../utils/access-log'
import { requireSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  await requireSession(event)
  const q = getQuery(event)
  const limit = Number(q.limit ?? 100)
  const pairId = q.pairId !== undefined ? Number(q.pairId) : undefined
  const beforeId = q.beforeId !== undefined ? Number(q.beforeId) : undefined
  return { entries: await queryAccessLog({
    limit: Number.isFinite(limit) ? limit : 100,
    pairId: Number.isFinite(pairId as number) ? pairId : undefined,
    beforeId: Number.isFinite(beforeId as number) ? beforeId : undefined,
  }) }
})
