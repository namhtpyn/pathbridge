import { z } from 'zod'
// oRPC server: router mounted at /rpc via the Fetch API adapter.
// Auth = our existing better-auth instance (session resolved from request
// headers, exactly like the REST API); permissions reuse requireUser/
// userCan so oRPC procedures inherit the same RBAC (incl. API-key
// narrowing) with zero duplicated logic.
import { os } from '@orpc/server'
import { ORPCError } from '@orpc/server'
import type { RequestHeadersHandlerPluginContext } from '@orpc/server/plugins'
import { once } from './once'
import { userCan } from './permissions'
import type { ResolvedUser } from './permissions'

export interface ServerContext extends RequestHeadersHandlerPluginContext {
  getSessionUser: () => Promise<ResolvedUser | null>
}

const base = os.$context<ServerContext>()

// Lazily resolve the effective user (session cookie OR Bearer API key) at
// most once per request; every sub-request in a batch shares the getter.
const withUser = base.middleware(async ({ context, next }) => {
  const user = await context.getSessionUser()
  if (!user) {
    throw new ORPCError('UNAUTHORIZED', { message: 'authentication required' })
  }
  return next({ context: { user } })
})

const withPerm = (resource: string, action: string) =>
  base.use(withUser).middleware(async ({ context, next }) => {
    if (!userCan(context.user, resource as never, action as never)) {
      throw new ORPCError('FORBIDDEN', { message: `missing permission ${resource}:${action}` })
    }
    return next()
  })

export function buildServerContext(headers: Headers | undefined): ServerContext {
  const getSessionUser = once(async (): Promise<ResolvedUser | null> => {
    // requireUser resolves BOTH cookie sessions and Bearer API keys (with
    // key narrowing) — the single shared auth path used by REST and MCP.
    const { requireUser } = await import('./permissions')
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

// ---- procedures (M1: one live end-to-end; more migrate in M4) ----

import { db } from '../db'
import { routes as routesTable } from '../db/schema'
import { desc } from 'drizzle-orm'
import type { RouteRow } from '../../shared/types'
import { changeBus } from './change-bus'
import type { ChangeEvent } from './change-bus'

/**
 * Build a live generator: emits the initial snapshot, then re-emits whenever
 * a change event for any of `resources` fires (AsyncIteratorObject over SSE
 * via the RPCHandler). Consumers use `.liveOptions()` on the client.
 */
async function* liveGenerator<T>(resources: ChangeEvent['resource'][], fetch: () => Promise<T>) {
  yield await fetch()
  for await (const evt of changeBus.subscribe('change')) {
    if (evt.resource === 'logs' || resources.includes(evt.resource)) {
      yield await fetch()
    }
  }
}

export const router = os.router({
  hello: base.handler(() => ({ message: 'pathbridge oRPC', ts: new Date().toISOString() })),

  me: base.use(withUser).handler(({ context }) => ({
    id: context.user.userId,
    email: context.user.email,
    grants: Object.fromEntries([...context.user.grants].map(([r, st]) => [r, [...st]])),
  })),

  routes: {
    list: base.use(withPerm('routes', 'read')).handler(async (): Promise<RouteRow[]> => {
      const rows = await db.query.routes.findMany({ orderBy: { path: 'asc' } })
      return rows as unknown as RouteRow[]
    }),
    count: base.use(withPerm('routes', 'read')).handler(async () => {
      const rows = await db.query.routes.findMany({ columns: { id: true } })
      return { count: rows.length }
    }),
    /** live list — pushes a fresh snapshot on every routes change */
    live: base.use(withPerm('routes', 'read')).handler(() => liveGenerator(['routes'], async () =>
      (await db.query.routes.findMany({ orderBy: { path: 'asc' } })) as unknown as RouteRow[])),
  },

  logs: {
    recent: base
      .use(withPerm('logs', 'read'))
      .input(z.object({ limit: z.number().int().min(1).max(1000).optional() }))
      .handler(async ({ input }) => {
        const { queryAccessLog } = await import('./access-log')
        return { entries: await queryAccessLog({ limit: input?.limit ?? 50 }) }
      }),
    /** live tail — initial batch, then a new entry list whenever logs grow */
    tail: base
      .use(withPerm('logs', 'read'))
      .input(z.object({ limit: z.number().int().min(1).max(1000).optional() }))
      .handler(({ input }) => liveGenerator(['logs'], async () => {
        const { queryAccessLog } = await import('./access-log')
        return { entries: await queryAccessLog({ limit: input?.limit ?? 50 }) }
      })),
  },
})

export type Router = typeof router
