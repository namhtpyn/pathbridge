// logs service: scoped access-log queries (own-scope filtering, parity with old REST)
import { readScopeOf } from '../shared/context'
import type { ResolvedUser } from '../../lib/permissions'
// lazy db access: nuxt prepare (jiti/Node) must never statically reach
// bun:sqlite through this module — services load the client on first call
const getDb = async () => (await import('../../db')).db

export async function queryLogsScoped(user: ResolvedUser, input: { limit?: number, routeId?: number, beforeId?: number }) {
  const { queryAccessLog } = await import('./access-log.service')
  const limit = input.limit ?? 100
  const routeId = input.routeId
  if ((await readScopeOf(user, 'logs')) === 'all') {
    return await queryAccessLog({ limit, routeId, beforeId: input.beforeId })
  }
  // read:own — only logs for routes the caller owns (one query over the owned ids)
  const own = await (await getDb()).query.routes.findMany({ where: { userId: user.userId }, columns: { id: true }, orderBy: { id: 'asc' } })
  const ownIds = own.map(p => p.id)
  if (routeId !== undefined && !ownIds.includes(routeId)) return []
  // keep the requested routeId: queryAccessLog prefers it over routeIds, so a
  // single-route query returns that route's rows instead of every owned route
  return await queryAccessLog({ limit, routeId, routeIds: ownIds, beforeId: input.beforeId })
}

/** highest own-scope access-log id at subscribe time — the delta tail's cursor,
 *  so the stream never re-sends rows the client already has. */
export async function latestLogId(user: ResolvedUser) {
  const rows = await queryLogsScoped(user, { limit: 1 })
  return rows.length ? rows[0]!.id : 0
}

export async function queryLogsAfter(user: ResolvedUser, input: { afterId: number, limit?: number }) {
  const { queryAccessLogAfter } = await import('./access-log.service')
  const limit = input.limit ?? 100
  if ((await readScopeOf(user, 'logs')) === 'all') {
    return await queryAccessLogAfter(input.afterId, limit)
  }
  const own = await (await getDb()).query.routes.findMany({ where: { userId: user.userId }, columns: { id: true }, orderBy: { id: 'asc' } })
  return await queryAccessLogAfter(input.afterId, limit, own.map(p => p.id))
}
