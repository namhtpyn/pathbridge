// routes service: all drizzle/domain logic for the proxy route table.
// Pure data access + record guards; the router stays thin.
import { eq } from 'drizzle-orm'
import { ORPCError } from '@orpc/server'
import { guardRecord, badRequest, notFound, readScopeOf } from '../shared/context'
import type { ResolvedUser } from '../../utils/permissions'
// lazy db access: nuxt prepare (jiti/Node) must never statically reach
// bun:sqlite through this module — services load the client on first call
const getDb = async () => (await import('../../db')).db
import { routes as routesTable } from '../../db/schema'
import type { RouteRow } from '../../../shared/types'

/** Normalize a target URL: keep origin+path, strip trailing slashes. */
export function normalizeTarget(target: string): string {
  const u = new URL(target) // schema guaranteed http(s), no query/hash
  return u.pathname === '/' ? u.origin : `${u.origin}${u.pathname}`.replace(/\/+$/, '')
}

export async function listRoutes(user: ResolvedUser): Promise<RouteRow[]> {
  const scope = await readScopeOf(user, 'routes')
  const rows = scope === 'own'
    ? await (await getDb()).query.routes.findMany({ where: { userId: user.userId }, orderBy: { path: 'asc' } })
    : await (await getDb()).query.routes.findMany({ orderBy: { path: 'asc' } })
  return rows as unknown as RouteRow[]
}

export async function countRoutes(user: ResolvedUser): Promise<number> {
  const scope = await readScopeOf(user, 'routes')
  const rows = scope === 'own'
    ? await (await getDb()).query.routes.findMany({ where: { userId: user.userId }, columns: { id: true } })
    : await (await getDb()).query.routes.findMany({ columns: { id: true } })
  return rows.length
}

export async function saveRoute(
  context: Parameters<typeof guardRecord>[0] & { user: ResolvedUser },
  input: {
    id?: number, path: string, target: string,
    requestHeaders?: Array<{ name: string, op: 'set' | 'remove', value?: string }>,
    responseHeaders?: Array<{ name: string, op: 'set' | 'remove', value?: string }>,
    stripPrefix: boolean, methods?: string[], note?: string, enabled: boolean,
  },
) {
  const { routeInputSchema } = await import('../../utils/route-schema')
  const { publishChange } = await import('../../utils/change-bus')
  // strict security boundary: the loose router input above is UX-shaped; the
  // strict schema (refinements incl. reserved paths + header rules)
  // re-validates everything the UI sends
  const strict = routeInputSchema.safeParse(input)
  if (!strict.success) {
    const issue = strict.error.issues[0]
    badRequest(issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid route payload')
  }
  const data = strict.data

  const row = {
    path: data.path,
    target: normalizeTarget(data.target),
    requestHeaders: data.requestHeaders?.length ? data.requestHeaders : null,
    responseHeaders: data.responseHeaders?.length ? data.responseHeaders : null,
    stripPrefix: data.stripPrefix,
    methods: data.methods ?? null,
    note: data.note !== undefined ? data.note.slice(0, 200) : null,
    enabled: data.enabled,
    updatedAt: new Date().toISOString(),
  }

  if (data.id !== undefined) {
    // update by id — path rename allowed unless another route claims it
    const existing = await (await getDb()).query.routes.findFirst({ where: { id: data.id } })
    if (!existing) notFound('route not found')
    await guardRecord(context, 'routes', 'update', existing)
    const clash = await (await getDb()).query.routes.findFirst({ where: { AND: [{ path: data.path }, { id: { ne: data.id } }] }, columns: { id: true } })
    if (clash) throw new ORPCError('CONFLICT', { message: `a route already exists at ${data.path}` })
    await (await getDb()).update(routesTable).set(row).where(eq(routesTable.id, data.id))
    await publishChange('routes', 'update')
    return { route: await (await getDb()).query.routes.findFirst({ where: { id: data.id } }), created: false }
  }

  // create / upsert-by-path: an existing route at this path can only be
  // overwritten by someone who may UPDATE that record (takeover fix —
  // create permission alone must never repoint someone else's route)
  const existing = await (await getDb()).query.routes.findFirst({ where: { path: data.path } })
  if (existing) {
    await guardRecord(context, 'routes', 'update', existing)
    await (await getDb()).update(routesTable).set(row).where(eq(routesTable.id, existing.id))
    await publishChange('routes', 'update')
    return { route: await (await getDb()).query.routes.findFirst({ where: { id: existing.id } }), created: false }
  }
  const { userCan } = await import('../../utils/permissions')
  if (!userCan(context.user, 'routes', 'create')) {
    throw new ORPCError('FORBIDDEN', { message: 'missing permission routes:create' })
  }
  await (await getDb()).insert(routesTable).values({ ...row, userId: context.user.userId })
  await publishChange('routes', 'create')
  return { route: await (await getDb()).query.routes.findFirst({ where: { path: data.path } }), created: true }
}

export async function removeRoute(
  context: Parameters<typeof guardRecord>[0] & { user: ResolvedUser },
  input: { id?: number, path?: string },
) {
  const { publishChange } = await import('../../utils/change-bus')
  const target = input.id
    ? await (await getDb()).query.routes.findFirst({ where: { id: input.id } })
    : input.path
      ? await (await getDb()).query.routes.findFirst({ where: { OR: [{ path: input.path }, { path: `/${input.path.replace(/^\//, '')}` }] } })
      : null
  if (!target) notFound('route not found')
  await guardRecord(context, 'routes', 'delete', target)
  await (await getDb()).delete(routesTable).where(eq(routesTable.id, target.id))
  await publishChange('routes', 'delete')
  return { deleted: true, id: target.id, path: target.path }
}
