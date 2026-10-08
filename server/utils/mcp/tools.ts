// MCP tool handlers — thin wrappers over the SAME logic the REST API uses
// (shared zod schemas, same permission enforcement via requireUser on a
// synthetic event). A tool call is exactly as privileged as the API key
// (or session) that authenticated the MCP connection: key statements are
// intersected with the owner's role grants in requireUser — no MCP-specific
// permission logic exists here.
import type { H3Event } from 'h3'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { routes } from '../../db/schema'
import { routeInputSchema } from '../route-schema'
import { requireUser, userCan, requireRecordPermission } from '../permissions'
import type { RouteRow } from '../../../shared/types'
import { publishChange } from '../change-bus'

/** Build a minimal H3 event so permission helpers resolve auth from headers. */
export function eventFor(headers: Headers): H3Event {
  // h3 v1: node req + headers; the permission path only reads
  // event.node.req.headers — synthesize exactly that surface.
  const raw: Record<string, string | string[]> = {}
  headers.forEach((v, k) => { raw[k] = v })
  return {
    node: { req: { headers: raw } },
  } as unknown as H3Event
}

async function listRoutes(): Promise<RouteRow[]> {
  return await db.query.routes.findMany({ orderBy: { path: 'asc' } }) as unknown as RouteRow[]
}

// routeInputSchema carries refinements (stripPrefix/wildcard) so .omit() is
// illegal on it (zod v4) — declare the create shape explicitly instead.
const routeBase = {
  path: z.string().min(1).max(512).describe('URL path prefix to claim, e.g. /hook or /hook/* (trailing wildcard)'),
  target: z.string().min(1).max(2048).describe('http(s) upstream URL (origin, optionally with base path)'),
  requestHeaders: z.array(z.strictObject({
    name: z.string().min(1).max(128).describe('Header name, lowercase (e.g. "host", "authorization")'),
    op: z.enum(['set', 'remove']).describe('set replaces/adds the header; remove strips it'),
    value: z.string().max(8192).optional().describe('Header value (required for op=set)'),
  })).max(20).optional().describe('Overrides applied to the REQUEST before it reaches the upstream (e.g. host, authorization, x-custom)'),
  responseHeaders: z.array(z.strictObject({
    name: z.string().min(1).max(128).describe('Header name, lowercase (e.g. "cache-control")'),
    op: z.enum(['set', 'remove']).describe('set replaces/adds the header; remove strips it'),
    value: z.string().max(8192).optional().describe('Header value (required for op=set)'),
  })).max(20).optional().describe('Overrides applied to the proxied RESPONSE before it reaches the client (e.g. cache-control, x-frame-options)'),
  stripPrefix: z.boolean().optional().describe('Strip the route prefix before forwarding (wildcard paths only)'),
  methods: z.array(z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])).optional().describe('Allowed HTTP methods; all when omitted'),
  note: z.string().max(200).optional().describe('Free-form label'),
  enabled: z.boolean().optional().describe('false parks the route'),
}

export const mcpSchemas = {
  createRoute: z.strictObject(routeBase),
  updateRoute: z.strictObject({ id: z.number().int().positive().describe('Numeric route id to update'), ...routeBase }),
  deleteRoute: z.strictObject({ id: z.number().int().positive().optional(), path: z.string().min(1).max(512).optional() }),
  getLogs: z.strictObject({ limit: z.number().int().min(1).max(1000).optional(), routeId: z.number().int().positive().optional() }),
}

export async function toolListRoutes(headers: Headers) {
  const { user } = await requireUser(eventFor(headers))
  if (!userCan(user, 'routes', 'read')) throw new Error('Forbidden: missing permission routes:read')
  const all = await listRoutes()
  // read:all sees everything; read:own only their routes
  const grants = user.grants.get('routes') ?? new Set<string>()
  if (grants.has('read:all')) return { routes: all }
  return { routes: all.filter(p => (p as unknown as { userId?: string }).userId === user.userId) }
}

export async function toolUpsertRoute(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.createRoute.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid route payload')
  const strict = routeInputSchema.safeParse(parsed.data) // security boundary: same rules as REST
  if (!strict.success) throw new Error(strict.error.issues[0]?.message ?? 'invalid route payload')
  const { user } = await requireUser(eventFor(headers))
  const data = strict.data

  // upsert-by-path semantics identical to PUT /api/routes
  const existing = await db.query.routes.findFirst({ where: { path: data.path } })
  if (existing) {
    await requireRecordPermission(eventFor(headers), 'routes', 'update', existing)
    const u = new URL(data.target)
    const targetUrl = u.pathname === '/' ? u.origin : `${u.origin}${u.pathname}`.replace(/\/+$/, '')
    await db.update(routes).set({
      target: targetUrl,
      requestHeaders: data.requestHeaders?.length ? data.requestHeaders : null,
      responseHeaders: data.responseHeaders?.length ? data.responseHeaders : null,
      stripPrefix: data.stripPrefix,
      methods: data.methods ?? null,
      note: data.note !== undefined ? data.note.slice(0, 200) : null,
      enabled: data.enabled,
      updatedAt: new Date().toISOString(),
    }).where(eq(routes.id, existing.id))
    await publishChange('routes', 'update')
  return { route: await db.query.routes.findFirst({ where: { id: existing.id } }) }
  }
  if (!userCan(user, 'routes', 'create')) throw new Error('Forbidden: missing permission routes:create')
  const u = new URL(data.target)
  const targetUrl = u.pathname === '/' ? u.origin : `${u.origin}${u.pathname}`.replace(/\/+$/, '')
  const created = await db.insert(routes).values({
    path: data.path,
    target: targetUrl,
    requestHeaders: data.requestHeaders?.length ? data.requestHeaders : null,
      responseHeaders: data.responseHeaders?.length ? data.responseHeaders : null,
    stripPrefix: data.stripPrefix,
    methods: data.methods ?? null,
    note: data.note !== undefined ? data.note.slice(0, 200) : null,
    enabled: data.enabled,
    userId: user.userId,
    updatedAt: new Date().toISOString(),
  }).onConflictDoUpdate({ target: routes.path, set: { target: targetUrl, updatedAt: new Date().toISOString() } }).returning()
  await publishChange('routes', 'create')
  return { route: created[0] ?? await db.query.routes.findFirst({ where: { path: data.path } }) }
}

export async function toolUpdateRouteById(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.updateRoute.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid route payload')
  if (!parsed.data.id) throw new Error('id is required for update')
  const strict = routeInputSchema.safeParse(parsed.data)
  if (!strict.success) throw new Error(strict.error.issues[0]?.message ?? 'invalid route payload')
  const { user } = await requireUser(eventFor(headers))
  const data = strict.data
  const existing = await db.query.routes.findFirst({ where: { id: data.id } })
  if (!existing) throw new Error('route not found')
  await requireRecordPermission(eventFor(headers), 'routes', 'update', existing)
  const routeId: number = data.id as number
  const clash = await db.query.routes.findFirst({ where: { AND: [{ path: data.path }, { id: { ne: routeId } }] }, columns: { id: true } })
  if (clash) throw new Error(`a route already exists at ${data.path}`)
  const u = new URL(data.target)
  const targetUrl = u.pathname === '/' ? u.origin : `${u.origin}${u.pathname}`.replace(/\/+$/, '')
  await db.update(routes).set({
    path: data.path,
    target: targetUrl,
    requestHeaders: data.requestHeaders?.length ? data.requestHeaders : null,
      responseHeaders: data.responseHeaders?.length ? data.responseHeaders : null,
    stripPrefix: data.stripPrefix,
    methods: data.methods ?? null,
    note: data.note !== undefined ? data.note.slice(0, 200) : null,
    enabled: data.enabled,
    updatedAt: new Date().toISOString(),
  }).where(eq(routes.id, routeId))
  return { route: await db.query.routes.findFirst({ where: { id: routeId } }) }
}

export async function toolDeleteRoute(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.deleteRoute.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid delete payload')
  const target = parsed.data.id
    ? await db.query.routes.findFirst({ where: { id: parsed.data.id } })
    : parsed.data.path
      ? await db.query.routes.findFirst({ where: { OR: [{ path: parsed.data.path }, { path: `/${parsed.data.path.replace(/^\//, '')}` }] } })
      : null
  if (!target) throw new Error('route not found')
  await requireRecordPermission(eventFor(headers), 'routes', 'delete', target)
  await db.delete(routes).where(eq(routes.id, target.id))
  await publishChange('routes', 'delete')
  return { deleted: true, id: target.id, path: target.path }
}

export async function toolGetLogs(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.getLogs.safeParse(input ?? {})
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid logs payload')
  const { user } = await requireUser(eventFor(headers))
  const grants = user.grants.get('logs') ?? new Set<string>()
  if (!grants.has('read:all') && !grants.has('read:own')) throw new Error('Forbidden: missing permission logs:read')

  const { queryAccessLog } = await import('../access-log')
  const limit = parsed.data.limit ?? 100
  const routeId = parsed.data.routeId

  if (grants.has('read:all')) {
    return { entries: await queryAccessLog({ limit, routeId }) }
  }
  // read:own — only logs for routes the caller owns
  const own = await db.query.routes.findMany({ where: { userId: user.userId }, columns: { id: true } })
  const ownIds = new Set(own.map(p => p.id))
  if (routeId !== undefined && !ownIds.has(routeId)) return { entries: [] }
  const entries = []
  for (const pid of ownIds) entries.push(...await queryAccessLog({ limit, routeId: pid }))
  entries.sort((a, b) => b.id - a.id)
  return { entries: entries.slice(0, limit) }
}
