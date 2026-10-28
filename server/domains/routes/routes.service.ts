// routes service: all drizzle/domain logic for the proxy route table.
// Pure data access + record guards; the router stays thin.
import { count, eq } from 'drizzle-orm'
import { ORPCError } from '@orpc/server'
import { guardRecord, notFound, readScopeOf } from '../shared/context'
import type { ResolvedUser } from '../../lib/permissions'
// lazy db access: nuxt prepare (jiti/Node) must never statically reach
// bun:sqlite through this module — services load the client on first call
const getDb = async () => (await import('../../db')).db
import { routes as routesTable } from '../../db/schema'
import { isUniqueViolation } from '../users/users.service'
import type { StrictRouteInput } from './routes.schema'

/** Normalize a target URL: keep origin+path, strip trailing slashes. */
export function normalizeTarget(target: string) {
  const u = new URL(target) // schema guaranteed http(s), no query/hash
  return u.pathname === '/' ? u.origin : `${u.origin}${u.pathname}`.replace(/\/+$/, '')
}

/** A write that reports no row means the row was deleted mid-flight — the
 *  procedures promise a route, so fail loudly instead of returning undefined. */
function savedRow<T>(row: T | undefined) {
  if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'route vanished after write' })
  return row
}

export async function listRoutes(user: ResolvedUser) {
  const scope = await readScopeOf(user, 'routes')
  if (scope === null) return [] // fail closed: no read grant means no rows
  return await (await getDb()).query.routes.findMany({
    // explicit projection: the list contract (RouteRow) is the full row, and a
    // named column list keeps the inferred type honest without a cast
    columns: {
      id: true,
      path: true,
      target: true,
      requestHeaders: true,
      responseHeaders: true,
      methods: true,
      note: true,
      enabled: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
    },
    where: scope === 'own' ? { userId: user.userId } : undefined,
    orderBy: { path: 'asc' },
  })
}

export async function countRoutes(user: ResolvedUser) {
  const scope = await readScopeOf(user, 'routes')
  if (scope === null) return 0 // fail closed: no read grant means no rows
  const rows = await (await getDb()).select({ n: count() })
    .from(routesTable)
    .where(scope === 'own' ? eq(routesTable.userId, user.userId) : undefined)
  return rows[0]?.n ?? 0
}

/** Overlay a partial save onto the stored row. Create-only defaults must never
 *  leak in here: an omitted optional keeps its stored value (a partial save may
 *  not re-enable a parked route or wipe headers/methods/note), while an
 *  explicitly empty header/method list clears the column. */
function mergedRoute(existing: typeof routesTable.$inferSelect, data: StrictRouteInput) {
  return {
    path: data.path,
    target: normalizeTarget(data.target),
    requestHeaders: data.requestHeaders !== undefined ? (data.requestHeaders.length ? data.requestHeaders : null) : existing.requestHeaders,
    responseHeaders: data.responseHeaders !== undefined ? (data.responseHeaders.length ? data.responseHeaders : null) : existing.responseHeaders,
    methods: data.methods !== undefined ? (data.methods.length ? data.methods : null) : existing.methods,
    note: data.note ?? existing.note,
    enabled: data.enabled ?? existing.enabled,
    updatedAt: new Date().toISOString(),
  }
}

/** The unique path index is the real gate: a lost race must read as CONFLICT,
 *  never as a 500. */
function routeConflict(e: unknown, path: string): never {
  if (isUniqueViolation(e)) throw new ORPCError('CONFLICT', { message: `a route already exists at ${path}` })
  throw e
}

export async function saveRoute(
  context: Parameters<typeof guardRecord>[0] & { user: ResolvedUser },
  input: StrictRouteInput,
) {
  const { publishChange } = await import('../../lib/change-bus')
  const data = input
  const db = await getDb()

  if (data.id !== undefined) {
    // update by id — path rename allowed unless another route claims it.
    const existing = await db.query.routes.findFirst({ where: { id: data.id } })
    if (!existing) notFound('route not found')
    await guardRecord(context, 'routes', 'update', existing)
    const clash = await db.query.routes.findFirst({ where: { AND: [{ path: data.path }, { id: { ne: data.id } }] }, columns: { id: true } })
    if (clash) throw new ORPCError('CONFLICT', { message: `a route already exists at ${data.path}` })
    let updated: typeof routesTable.$inferSelect | undefined
    try {
      const rows = await db.update(routesTable).set(mergedRoute(existing, data)).where(eq(routesTable.id, data.id)).returning()
      updated = rows[0]
    }
    catch (e) {
      routeConflict(e, data.path)
    }
    await publishChange('routes', 'update')
    return { route: savedRow(updated), created: false }
  }

  // create-only defaults: a brand-new route starts enabled with empty overrides
  const row = {
    path: data.path,
    target: normalizeTarget(data.target),
    requestHeaders: data.requestHeaders?.length ? data.requestHeaders : null,
    responseHeaders: data.responseHeaders?.length ? data.responseHeaders : null,
    methods: data.methods?.length ? data.methods : null,
    note: data.note ?? null,
    enabled: data.enabled ?? true,
    updatedAt: new Date().toISOString(),
  }

  // create / upsert-by-path: an existing route at this path can only be
  // overwritten by someone who may UPDATE that record (takeover fix —
  // create permission alone must never repoint someone else's route)
  const existing = await db.query.routes.findFirst({ where: { path: data.path } })
  if (existing) {
    await guardRecord(context, 'routes', 'update', existing)
    let updated: typeof routesTable.$inferSelect | undefined
    try {
      const rows = await db.update(routesTable).set(mergedRoute(existing, data)).where(eq(routesTable.id, existing.id)).returning()
      updated = rows[0]
    }
    catch (e) {
      routeConflict(e, data.path)
    }
    await publishChange('routes', 'update')
    return { route: savedRow(updated), created: false }
  }
  const { userCan } = await import('../../lib/permissions')
  if (!userCan(context.user, 'routes', 'create')) {
    throw new ORPCError('FORBIDDEN', { message: 'missing permission routes:create' })
  }
  let created: typeof routesTable.$inferSelect | undefined
  try {
    const rows = await db.insert(routesTable).values({ ...row, userId: context.user.userId }).returning()
    created = rows[0]
  }
  catch (e) {
    routeConflict(e, data.path)
  }
  await publishChange('routes', 'create')
  return { route: savedRow(created), created: true }
}

export async function removeRoute(
  context: Parameters<typeof guardRecord>[0] & { user: ResolvedUser },
  input: { id?: number, path?: string },
) {
  const { publishChange } = await import('../../lib/change-bus')
  const db = await getDb()
  let target = input.id !== undefined
    ? await db.query.routes.findFirst({ where: { id: input.id } })
    : undefined
  if (!target && input.path !== undefined) {
    // exact path first, then the leading-slash-normalized form — two explicit
    // lookups so the resolved row never depends on OR match order
    target = await db.query.routes.findFirst({ where: { path: input.path }, orderBy: { id: 'asc' } })
    if (!target && !input.path.startsWith('/')) {
      target = await db.query.routes.findFirst({ where: { path: `/${input.path}` }, orderBy: { id: 'asc' } })
    }
  }
  if (!target) notFound('route not found')
  await guardRecord(context, 'routes', 'delete', target)
  await db.delete(routesTable).where(eq(routesTable.id, target.id))
  await publishChange('routes', 'delete')
  return { deleted: true, id: target.id, path: target.path }
}
