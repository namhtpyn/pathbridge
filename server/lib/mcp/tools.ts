// MCP tool handlers — thin wrappers sharing the SAME services as the oRPC procedures
// (shared zod schemas, same permission enforcement via requireUser on a
// synthetic event built from the request headers). A tool call is exactly as
// privileged as the API key (or session) that authenticated the MCP connection:
// key statements are intersected with the owner's role grants in requireUser —
// no MCP-specific permission logic exists here.
import { z } from 'zod'
import { routeInputSchema } from '../../domains/routes/routes.schema'
import { requireUser, userCan } from '../permissions'
import { eventFromHeaders } from '../../domains/shared/context'
import * as routesSvc from '../../domains/routes/routes.service'
import * as logsSvc from '../../domains/logs/logs.service'

// Tool shapes are DERIVED from the strict edge schema so REST and MCP validation
// cannot drift; only .describe() text is added, no field rules are re-declared.
const routeFields = {
  path: routeInputSchema.shape.path.describe('URL path to claim: "/hook" (exact) or "/hook/*" (subtree)'),
  target: routeInputSchema.shape.target.describe('http(s) upstream URL; a base path is forwarded (exact: verbatim, wildcard: prefix)'),
  requestHeaders: routeInputSchema.shape.requestHeaders.describe('Overrides applied to the REQUEST before it reaches the upstream (e.g. host, authorization)'),
  responseHeaders: routeInputSchema.shape.responseHeaders.describe('Overrides applied to the proxied RESPONSE before it reaches the client (e.g. cache-control)'),
  methods: routeInputSchema.shape.methods.describe('Allowed HTTP methods; all when omitted'),
  note: routeInputSchema.shape.note.describe('Free-form label'),
  enabled: routeInputSchema.shape.enabled.describe('false parks the route'),
}

export const mcpSchemas = {
  createRoute: z.strictObject(routeFields),
  updateRoute: z.strictObject({
    ...routeFields,
    id: z.number().int().positive().describe('Numeric id of the route to update'),
  }),
  deleteRoute: z.strictObject({
    id: z.number().int().positive().optional().describe('Numeric route id (preferred)'),
    // derived from the strict edge schema: a path that could never have been
    // stored must not be accepted for deletion either
    path: routeInputSchema.shape.path.optional().describe('Route path, with the leading "/"'),
  }).refine(i => (i.id !== undefined) !== (i.path !== undefined), { message: 'provide id or path' }),
  getLogs: z.strictObject({
    limit: z.number().int().min(1).max(1000).optional().describe('Max entries (default 100)'),
    routeId: z.number().int().positive().optional().describe('Only entries for this route'),
    beforeId: z.number().int().positive().optional().describe('Only entries older than this id (paging)'),
  }),
}

export async function toolListRoutes(headers: Headers) {
  const { user } = await requireUser(eventFromHeaders(headers))
  if (!userCan(user, 'routes', 'read')) throw new Error('Forbidden: missing permission routes:read')
  // own/all filtering lives in the service (fail-closed when no read grant)
  return { routes: await routesSvc.listRoutes(user) }
}

export async function toolUpsertRoute(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.createRoute.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid route payload')
  const strict = routeInputSchema.safeParse(parsed.data) // security boundary: same rules as REST
  if (!strict.success) throw new Error(strict.error.issues[0]?.message ?? 'invalid route payload')
  const { user } = await requireUser(eventFromHeaders(headers))
  // upsert-by-path, takeover guard, publishChange and error codes all live in
  // the service — a tool call must behave exactly like routes.save
  const { route } = await routesSvc.saveRoute({ reqHeaders: headers, user }, strict.data)
  return { route }
}

export async function toolUpdateRouteById(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.updateRoute.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid route payload')
  const strict = routeInputSchema.safeParse(parsed.data)
  if (!strict.success) throw new Error(strict.error.issues[0]?.message ?? 'invalid route payload')
  const { user } = await requireUser(eventFromHeaders(headers))
  const { route } = await routesSvc.saveRoute({ reqHeaders: headers, user }, strict.data)
  return { route }
}

export async function toolDeleteRoute(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.deleteRoute.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid delete payload')
  const { user } = await requireUser(eventFromHeaders(headers))
  return await routesSvc.removeRoute({ reqHeaders: headers, user }, parsed.data)
}

export async function toolGetLogs(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.getLogs.safeParse(input ?? {})
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid logs payload')
  const { user } = await requireUser(eventFromHeaders(headers))
  if (!userCan(user, 'logs', 'read')) throw new Error('Forbidden: missing permission logs:read')
  // scoping (own = only the caller's routes) and beforeId paging live in the
  // logs service — one query, identical to the oRPC logs.recent procedure
  const entries = await logsSvc.queryLogsScoped(user, parsed.data)
  // same payload shape as REST: latestId is the newest id IN THE PAGE, which the
  // client uses to reconcile its tail cursor
  return { entries, latestId: entries.reduce((max, e) => Math.max(max, e.id), 0) }
}
