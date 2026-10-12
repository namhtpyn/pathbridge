// logs service: scoped access-log queries (own-scope filtering, parity with old REST)
import { readScopeOf } from '../shared/context'
import type { ResolvedUser } from '../../utils/permissions'
// lazy db access: nuxt prepare (jiti/Node) must never statically reach
// bun:sqlite through this module — services load the client on first call
const getDb = async () => (await import('../../db')).db

export async function queryLogsScoped(user: ResolvedUser, input: { limit?: number, routeId?: number, beforeId?: number }) {
  const { queryAccessLog } = await import('../../utils/access-log')
  const limit = input.limit ?? 100
  const routeId = input.routeId
  if ((await readScopeOf(user, 'logs')) === 'all') {
    return await queryAccessLog({ limit, routeId, beforeId: input.beforeId })
  }
  // read:own — only logs for routes the caller owns
  const own = await (await getDb()).query.routes.findMany({ where: { userId: user.userId }, columns: { id: true } })
  const ownIds = new Set(own.map(p => p.id))
  if (routeId !== undefined && !ownIds.has(routeId)) return []
  const entries: Array<{ id: number }> = []
  for (const pid of ownIds) {
    const batch = await queryAccessLog({ limit, routeId: pid, beforeId: input.beforeId }) as Array<{ id: number }>
    entries.push(...batch)
  }
  entries.sort((a, b) => b.id - a.id)
  return entries.slice(0, limit)
}
