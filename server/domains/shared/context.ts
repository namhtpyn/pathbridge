// Shared oRPC context + middlewares + error mapping — consumed by every
// module router. Extracted from the former server/utils/orpc.ts monolith.
// ADMIN PANEL LAW (Nam, 2026-10-11): the Admin Panel uses oRPC procedures
// ONLY (better-auth /auth/* endpoints excepted). New admin features get a
// procedure in server/domains/<domain>/<domain>.router.ts first — never a
// new $fetch('/api/...') in app/.
import { os } from '@orpc/server'
import { ORPCError } from '@orpc/server'
import type { RequestHeadersHandlerPluginContext } from '@orpc/server/plugins'
import { once } from '../../lib/once'
// permissions imports the db (bun:sqlite) — keep the chain DYNAMIC so nuxt
// prepare (jiti over Node) never statically reaches it through this module
import type { ResolvedUser } from '../../lib/permissions'
import { changeBus } from '../../lib/change-bus'
import type { ChangeEvent } from '../../lib/change-bus'

export interface ServerContext extends RequestHeadersHandlerPluginContext {
  getSessionUser: () => Promise<ResolvedUser | null>
}

export const base = os.$context<ServerContext>()

// Lazily resolve the effective user (session cookie OR Bearer API key) at
// most once per request; every sub-request in a batch shares the getter.
export const withUser = base.middleware(async ({ context, next }) => {
  const user = await context.getSessionUser()
  if (!user) {
    throw new ORPCError('UNAUTHORIZED', { message: 'authentication required' })
  }
  return next({ context: { user } })
})

import type { Resource, Action } from '../../lib/permissions'

export const withPerm = (resource: Resource, action: Action) =>
  base.use(withUser).middleware(async ({ context, next }) => {
    const { userCan } = await import('../../lib/permissions')
    if (!userCan(context.user, resource, action)) {
      throw new ORPCError('FORBIDDEN', { message: `missing permission ${resource}:${action}` })
    }
    return next()
  })

export function buildServerContext(headers: Headers | undefined) {
  const getSessionUser = once(async (): Promise<ResolvedUser | null> => {
    // requireUser resolves BOTH cookie sessions and Bearer API keys (with
    // key narrowing) — the single shared auth path used by oRPC and MCP.
    const { requireUser } = await import('../../lib/permissions')
    const raw: Record<string, string | string[]> = {}
    headers?.forEach((v, k) => { raw[k] = v })
    const event = { node: { req: { headers: raw } } }
    try {
      const { user } = await requireUser(event as never)
      return user
    }
    catch {
      return null
    }
  })
  return { reqHeaders: headers, getSessionUser }
}

// ---- shared helpers --------------------------------------------------------

/** headers -> H3-event-shaped object for permission helpers */
export function eventFromContext(context: { reqHeaders?: Headers }) {
  const raw: Record<string, string | string[]> = {}
  context.reqHeaders?.forEach((v, k) => { raw[k] = v })
  return { node: { req: { headers: raw } } } as never
}

/** requireRecordPermission throws h3 errors — remap to ORPCError codes */
export async function guardRecord(context: { reqHeaders?: Headers }, resource: 'routes' | 'logs' | 'keys', action: 'update' | 'delete', record: { userId?: string | null }) {
  const { requireRecordPermission } = await import('../../lib/permissions')
  try {
    await requireRecordPermission(eventFromContext(context), resource, action, record)
  }
  catch (e: unknown) {
    const err = e as { statusCode?: number, statusMessage?: string, message?: string }
    const code = err.statusCode === 404 ? 'NOT_FOUND' : err.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN'
    throw new ORPCError(code as 'FORBIDDEN', { message: err.statusMessage ?? err.message ?? 'forbidden' })
  }
}

export function badRequest(message: string): never {
  throw new ORPCError('BAD_REQUEST', { message })
}

export function notFound(message = 'not found'): never {
  throw new ORPCError('NOT_FOUND', { message })
}

/** Read-scope resolution: 'all' | 'own' for an ownable resource. */
export async function readScopeOf(user: ResolvedUser, resource: 'routes' | 'logs') {
  const { userCan } = await import('../../lib/permissions')
  if (userCan(user, resource, 'read', 'all')) return 'all'
  if (userCan(user, resource, 'read', 'own')) return 'own'
  return null
}

/**
 * Build a live generator: emits the initial snapshot, then re-emits whenever
 * a change event for any of `resources` fires (AsyncIteratorObject over SSE
 * via the RPCHandler). Consumers use `.liveOptions()` on the client.
 */
export async function* liveGenerator<T>(resources: ChangeEvent['resource'][], fetch: () => Promise<T>) {
  yield await fetch()
  for await (const evt of changeBus.subscribe('change')) {
    if (evt.resource === 'logs' || resources.includes(evt.resource)) {
      yield await fetch()
    }
  }
}

/** STATEMENTS as a plain mutable Record (wire-friendly, client-friendly) */
export async function vocabularyOut() {
  const { STATEMENTS } = await import('../../lib/permissions')
  return Object.fromEntries(Object.entries(STATEMENTS).map(([k, v]) => [k, [...v]]))
}
