// Shared oRPC context + middlewares + error mapping — consumed by every
// module router. Extracted from the former server/utils/orpc.ts monolith.
// ADMIN PANEL LAW (Nam, 2026-10-11): the Admin Panel uses oRPC procedures
// ONLY (better-auth /auth/* endpoints excepted). New admin features get a
// procedure in server/domains/<domain>/<domain>.router.ts first — never a
// new $fetch('/api/...') in app/.
import { os } from '@orpc/server'
import { ORPCError } from '@orpc/server'
import type { RequestHeadersHandlerPluginContext } from '@orpc/server/plugins'
import type { H3Event } from 'h3'
import { once } from '../../lib/once'
// permissions imports the db (bun:sqlite) — keep the chain DYNAMIC so nuxt
// prepare (jiti over Node) never statically reaches it through this module
import type { ResolvedUser } from '../../lib/permissions'
import { changeBus } from '../../lib/change-bus'
import type { ChangeEvent } from '../../lib/change-bus'

export interface ServerContext extends RequestHeadersHandlerPluginContext {
  getSessionUser: () => Promise<ResolvedUser | null>
  /** aborted when the client connection closes — live generators must stop on it */
  signal?: AbortSignal
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

export function buildServerContext(headers: Headers | undefined, signal?: AbortSignal) {
  const getSessionUser = once(async (): Promise<ResolvedUser | null> => {
    // requireUser resolves BOTH cookie sessions and Bearer API keys (with
    // key narrowing) — the single shared auth path used by oRPC and MCP.
    const { requireUser } = await import('../../lib/permissions')
    try {
      const { user } = await requireUser(eventFromHeaders(headers))
      return user
    }
    catch (e: unknown) {
      // only "no/!invalid credentials" means anonymous; a DB outage must not be
      // laundered into a 401 (it silently signs every authenticated caller out)
      if (!isUnauthorized(e)) {
        console.error('[ctx] session lookup failed:', e)
        throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'session lookup failed' })
      }
      return null
    }
  })
  return { reqHeaders: headers, signal, getSessionUser }
}

// ---- shared helpers --------------------------------------------------------

/** Build the minimal H3 event the permission helpers read (event.node.req.headers).
 *  One shim for oRPC context helpers and the MCP tools — a duplicated fake event
 *  is a silent auth bypass waiting to happen. */
export function eventFromHeaders(headers: Headers | undefined) {
  const raw: Record<string, string | string[]> = {}
  headers?.forEach((v, k) => { raw[k] = v })
  return { node: { req: { headers: raw } } } as unknown as H3Event
}

/** headers -> H3-event for permission helpers */
export function eventFromContext(context: { reqHeaders?: Headers }) {
  return eventFromHeaders(context.reqHeaders)
}

/** requireRecordPermission throws h3 errors — remap to ORPCError codes */
export async function guardRecord(context: { reqHeaders?: Headers }, resource: 'routes' | 'logs', action: 'update' | 'delete', record: { userId?: string | null }) {
  const { requireRecordPermission } = await import('../../lib/permissions')
  try {
    await requireRecordPermission(eventFromContext(context), resource, action, record)
  }
  catch (e: unknown) {
    const err = e as { statusCode?: number, statusMessage?: string, message?: string }
    // h3 errors carry a statusCode — remap those; anything else is an infra
    // failure masquerading as authz, which hides outages: log + 500.
    if (typeof err.statusCode !== 'number') {
      console.error('[guard] unexpected permission-check failure:', e)
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'permission check failed' })
    }
    const code = err.statusCode === 404 ? 'NOT_FOUND' : err.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN'
    throw new ORPCError(code, { message: err.statusMessage ?? err.message ?? 'forbidden' })
  }
}

export function badRequest(message: string): never {
  throw new ORPCError('BAD_REQUEST', { message })
}

/** 401-shaped error = "no valid credentials", the one failure that means anonymous. */
function isUnauthorized(e: unknown) {
  const err = e as { statusCode?: number, status?: number } | null
  return err?.statusCode === 401 || err?.status === 401
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

const ABORTED = Symbol('aborted')
const IDLE = Symbol('idle')

/**
 * Abort-aware puller over an async iterator, for the SSE generators.
 *
 * A client that disconnects must end its generator: otherwise the change-bus
 * listener (and, for logs, a DB re-query per event) outlives the connection for
 * the lifetime of the process. On abort every pull resolves `{ done: true }` and
 * `close()` calls `iterator.return()` — the publisher unsubscribes on return,
 * not on garbage collection.
 *
 * `idleMs` gives up waiting after that long and returns undefined instead, so a
 * caller can flush an already-buffered backlog without blocking on the next
 * event. The in-flight pull is kept for the following call, so a late event is
 * never dropped.
 */
export function pullIterator<T>(src: AsyncIterable<T>, signal?: AbortSignal) {
  const it: AsyncIterator<T> = src[Symbol.asyncIterator]()
  let inflight: Promise<IteratorResult<T>> | undefined
  let aborting: Promise<typeof ABORTED> | undefined

  const take = () => (inflight ??= it.next())
  const abortWait = () => {
    if (!signal) return undefined
    if (signal.aborted) return Promise.resolve(ABORTED)
    aborting ??= new Promise<typeof ABORTED>((resolve) => {
      signal.addEventListener('abort', () => resolve(ABORTED), { once: true })
    })
    return aborting
  }

  return {
    /** next item; `{done}` when closed or aborted; undefined when `idleMs` elapses */
    async next(idleMs?: number): Promise<IteratorResult<T> | undefined> {
      if (signal?.aborted) return { done: true, value: undefined }
      const races: Promise<IteratorResult<T> | typeof ABORTED | typeof IDLE>[] = [take()]
      if (idleMs !== undefined) {
        races.push(new Promise<typeof IDLE>((resolve) => { setTimeout(() => resolve(IDLE), idleMs) }))
      }
      const abort = abortWait()
      if (abort) races.push(abort)
      const r = await Promise.race(races)
      if (r === IDLE) return undefined
      if (r === ABORTED) return { done: true, value: undefined }
      inflight = undefined
      return r
    },
    async close() {
      await it.return?.(undefined)
    },
  }
}

/**
 * Build a live generator: emits the initial snapshot, then re-emits whenever
 * a change event for any of `resources` fires (AsyncIteratorObject over SSE
 * via the RPCHandler). Consumers use `.liveOptions()` on the client.
 */
export async function* liveGenerator<T>(
  resources: ChangeEvent['resource'][],
  fetch: () => Promise<T>,
  signal?: AbortSignal,
) {
  // Subscribe BEFORE the snapshot fetch: the publisher buffers events (up to
  // 100), so a change that lands while the snapshot is being read is not lost.
  const bus = pullIterator(changeBus.subscribe('change'), signal)
  try {
    yield await fetch()
    // Flush that backlog into at most ONE extra frame: the snapshot is already
    // stale, so N buffered events mean one refetch, not N identical frames.
    let stale = false
    for (;;) {
      const r = await bus.next(0)
      if (!r) break
      if (r.done) return
      if (resources.includes(r.value.resource)) stale = true
    }
    if (stale) {
      try {
        yield await fetch()
      }
      catch (e) {
        console.error('[live] snapshot failed, skipping frame:', e instanceof Error ? e.message : e)
      }
    }
    for (;;) {
      const r = await bus.next()
      if (!r || r.done) return
      // strict filter — access-log publishes a 'logs' event on EVERY proxied
      // request; waking unrelated live streams on it multiplies traffic into
      // DB re-queries. A snapshot fetch failure must not kill the stream.
      if (!resources.includes(r.value.resource)) continue
      try {
        yield await fetch()
      }
      catch (e) {
        console.error('[live] snapshot failed, skipping frame:', e instanceof Error ? e.message : e)
      }
    }
  }
  finally {
    await bus.close()
  }
}

/** STATEMENTS as a plain mutable Record (wire-friendly, client-friendly) */
export async function vocabularyOut() {
  const { STATEMENTS } = await import('../../lib/permissions')
  return Object.fromEntries(Object.entries(STATEMENTS).map(([k, v]) => [k, [...v]]))
}
