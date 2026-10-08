// PUT /api/routes — upsert one route (auth required). Zod-validated input
// (backend security boundary); insert/upsert on the core API (RQB has no
// upsert); read-back via RQB.
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { routes } from '../../db/schema'
import type { RouteRow } from '../../../shared/types'
import { routeInputSchema } from '../../utils/route-schema'
import { requireUser, userCan, requireRecordPermission } from '../../utils/permissions'
import { publishChange } from '../../utils/change-bus'

export default defineEventHandler(async (event): Promise<{ routes: RouteRow[] }> => {
  const { user } = await requireUser(event)
  const body: unknown = await readBody(event)

  const parsed = routeInputSchema.safeParse(body)
  if (!parsed.success) {
    const issue: { path: (string | number | symbol)[], message: string } | undefined = parsed.error.issues[0]
    throw createError({
      statusCode: 400,
      statusMessage: issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid route payload',
    })
  }

  const { path, target } = parsed.data
  const u = new URL(target) // re-parsed; schema guaranteed http(s), no query/hash

  // keep origin+path (path prefix is forwarded); strip any trailing slash on the path
  const targetUrl = u.pathname === '/' ? u.origin : `${u.origin}${u.pathname}`.replace(/\/+$/, '')

  const row = {
    path,
    target: targetUrl,
    requestHeaders: parsed.data.requestHeaders?.length ? parsed.data.requestHeaders : null,
    responseHeaders: parsed.data.responseHeaders?.length ? parsed.data.responseHeaders : null,
    stripPrefix: parsed.data.stripPrefix,
    methods: parsed.data.methods ?? null,
    note: parsed.data.note !== undefined ? parsed.data.note.slice(0, 200) : null,
    enabled: parsed.data.enabled,
    updatedAt: new Date().toISOString(),
  }

  if (parsed.data.id !== undefined) {
    // update by id — path rename allowed unless another route already claims it
    const routeId: number = parsed.data.id
    const existing = await db.query.routes.findFirst({ where: { id: routeId } })
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'route not found' })
    }
    await requireRecordPermission(event, 'routes', 'update', existing)
    const clash = await db.query.routes.findFirst({ where: { AND: [{ path }, { id: { ne: routeId } }] }, columns: { id: true } })
    if (clash) {
      throw createError({ statusCode: 409, statusMessage: `a route already exists at ${path}` })
    }
    const updated = await db.update(routes).set(row).where(eq(routes.id, routeId)).returning({ id: routes.id })
    if (updated.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'route not found' })
    }
  }
  else {
    // create — new routes belong to their creator (unless policy changes later)
    if (!userCan(user, 'routes', 'create')) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden: missing permission routes:create' })
    }
    await db.insert(routes).values({ ...row, userId: user.userId })
      .onConflictDoUpdate({ target: routes.path, set: row })
  }

  const rows = await db.query.routes.findMany({ orderBy: { path: 'asc' } })
  await publishChange('routes', 'update')
  return { routes: rows as unknown as RouteRow[] }
})
