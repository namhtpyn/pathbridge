// DELETE /api/routes/:ref — remove a route by numeric id (preferred) or by
// path-without-leading-slash (legacy). Auth required. Read-back via RQB.
import { eq, or } from 'drizzle-orm'
import { db } from '../../db'
import { routes } from '../../db/schema'
import type { RouteRow } from '../../../shared/types'
import { requireRecordPermission } from '../../utils/permissions'
import { publishChange } from '../../utils/change-bus'

export default defineEventHandler(async (event): Promise<{ routes: RouteRow[] }> => {
  const ref = getRouterParam(event, 'path')
  if (!ref) throw createError({ statusCode: 400, statusMessage: 'missing reference' })

  const decoded = decodeURIComponent(ref)
  const id = Number(decoded)
  const target = Number.isInteger(id) && id > 0
    ? await db.query.routes.findFirst({ where: { id } })
    : await db.query.routes.findFirst({ where: { OR: [{ path: `/${decoded}` }, { path: decoded }] } })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'route not found' })

  await requireRecordPermission(event, 'routes', 'delete', target)
  await db.delete(routes).where(eq(routes.id, target.id))
  const rows = await db.query.routes.findMany({ orderBy: { path: 'asc' } })
  await publishChange('routes', 'delete')
  return { routes: rows as unknown as RouteRow[] }
})
