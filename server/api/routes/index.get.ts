// GET /api/routes — list routes (auth + read scope). RQB.
// read-all: every route; read-own: only routes owned by the caller.
import { db } from '../../db'
import type { RouteRow } from '../../../shared/types'
import { requireReadScope } from '../../utils/permissions'

export default defineEventHandler(async (event): Promise<{ routes: RouteRow[] }> => {
  const { user, scope } = await requireReadScope(event, 'routes')
  const rows = scope === 'all'
    ? await db.query.routes.findMany({ orderBy: { path: 'asc' } })
    : await db.query.routes.findMany({ where: { userId: user.userId }, orderBy: { path: 'asc' } })
  return { routes: rows as unknown as RouteRow[] }
})
