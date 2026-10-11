import { z } from 'zod'
// oRPC server: router mounted at /rpc via the Fetch API adapter.
// Auth = our existing better-auth instance (session resolved from request
// headers, exactly like the REST API); permissions reuse requireUser/
// userCan so oRPC procedures inherit the same RBAC (incl. API-key
// narrowing) with zero duplicated logic.
//
// ADMIN PANEL LAW (Nam, 2026-10-11): the Admin Panel uses oRPC procedures
// ONLY (better-auth /auth/* endpoints excepted). The REST /api/* surface is
// the scripting/MCP-facing API, not the UI's transport. New admin features
// get procedures here first — never a new $fetch('/api/...') in app/.
import { os } from '@orpc/server'
import { ORPCError } from '@orpc/server'
import type { RequestHeadersHandlerPluginContext } from '@orpc/server/plugins'
import { eq, desc } from 'drizzle-orm'
import { once } from './once'
import { userCan, STATEMENTS, requireRecordPermission, validateStatements } from './permissions'
import type { ResolvedUser } from './permissions'
import { db } from '../db'
import { routes as routesTable, roles as rolesTable, apiKey as apiKeyTable } from '../db/schema'
import type { RouteRow } from '../../shared/types'
import { changeBus } from './change-bus'
import type { ChangeEvent } from './change-bus'

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

// ---- shared helpers --------------------------------------------------------

/** headers -> H3-event-shaped object for permission helpers (REST parity) */
function eventFromContext(context: { reqHeaders?: Headers }) {
  const raw: Record<string, string | string[]> = {}
  context.reqHeaders?.forEach((v, k) => { raw[k] = v })
  return { node: { req: { headers: raw } } } as never
}

/** requireRecordPermission throws h3 errors — remap to ORPCError codes */
async function guardRecord(context: { reqHeaders?: Headers }, resource: 'routes' | 'logs' | 'keys', action: 'update' | 'delete', record: { userId?: string | null }) {
  try {
    await requireRecordPermission(eventFromContext(context), resource, action, record)
  }
  catch (e: unknown) {
    const err = e as { statusCode?: number, statusMessage?: string, message?: string }
    const code = err.statusCode === 404 ? 'NOT_FOUND' : err.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN'
    throw new ORPCError(code as 'FORBIDDEN', { message: err.statusMessage ?? err.message ?? 'forbidden' })
  }
}

function badRequest(message: string): never {
  throw new ORPCError('BAD_REQUEST', { message })
}

function notFound(message = 'not found'): never {
  throw new ORPCError('NOT_FOUND', { message })
}

/** Read-scope resolution: 'all' | 'own' for an ownable resource. */
function readScopeOf(user: ResolvedUser, resource: 'routes' | 'logs'): 'all' | 'own' | null {
  if (userCan(user, resource, 'read', 'all')) return 'all'
  if (userCan(user, resource, 'read', 'own')) return 'own'
  return null
}

/** Normalize a target URL: keep origin+path, strip trailing slashes. */
function normalizeTarget(target: string): string {
  const u = new URL(target) // schema guaranteed http(s), no query/hash
  return u.pathname === '/' ? u.origin : `${u.origin}${u.pathname}`.replace(/\/+$/, '')
}

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

/** scoped logs query shared by recent/tail (own-scope filtering, REST parity) */
async function queryLogsScoped(user: ResolvedUser, input: { limit?: number, routeId?: number, beforeId?: number }) {
  const { queryAccessLog } = await import('./access-log')
  const limit = input.limit ?? 100
  const routeId = input.routeId
  if (readScopeOf(user, 'logs') === 'all') {
    return await queryAccessLog({ limit, routeId, beforeId: input.beforeId })
  }
  // read:own — only logs for routes the caller owns
  const own = await db.query.routes.findMany({ where: { userId: user.userId }, columns: { id: true } })
  const ownIds = new Set(own.map(p => p.id))
  if (routeId !== undefined && !ownIds.has(routeId)) return []
  const entries: Array<{ id: number }> = []
  for (const pid of ownIds) {
    const batch = await queryAccessLog({ limit, routeId: pid, beforeId: input.beforeId }) as Array<{ id: number }>
    entries.push(...batch)
  }
  entries.sort((a, b) => b.id - a.id)
  return entries.slice(0, limit)
}

/** STATEMENTS as a plain mutable Record (wire-friendly, client-friendly) */
function vocabularyOut(): Record<string, string[]> {
  return Object.fromEntries(Object.entries(STATEMENTS).map(([k, v]) => [k, [...v]]))
}

/** parse stored key permissions (plain or double-JSON-encoded) */
function parseKeyPermissions(raw: string | null | undefined): Record<string, string[]> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed
  }
  catch {
    return null
  }
}

// ---- input schemas ---------------------------------------------------------

const headerOverrideInput = z.strictObject({
  name: z.string().min(1).max(128),
  op: z.enum(['set', 'remove']),
  value: z.string().max(8192).optional(),
})

const routeSaveInput = z.strictObject({
  /** present = update this row; absent = create/upsert-by-path */
  id: z.number().int().positive().optional(),
  path: z.string().min(1).max(512),
  target: z.string().min(1).max(2048),
  requestHeaders: z.array(headerOverrideInput).max(20).optional(),
  responseHeaders: z.array(headerOverrideInput).max(20).optional(),
  stripPrefix: z.boolean().optional().default(false),
  methods: z.array(z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])).optional(),
  note: z.string().max(200).optional(),
  enabled: z.boolean().optional().default(true),
})

const logsPageInput = z.strictObject({
  limit: z.number().int().min(1).max(1000).optional(),
  routeId: z.number().int().positive().optional(),
  beforeId: z.number().int().positive().optional(),
})

const userSaveInput = z.strictObject({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
  role: z.string().regex(/^[a-z0-9][a-z0-9,-]*[a-z0-9]$/).optional(),
  emailVerified: z.boolean().optional(),
})

const userUpdateInput = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
  emailVerified: z.boolean().optional(),
  role: z.string().regex(/^[a-z0-9][a-z0-9,-]*[a-z0-9]$/).optional(),
})

const roleSaveInput = z.strictObject({
  name: z.string().min(2).max(32).regex(/^[a-z0-9][a-z0-9-]{1,31}$/, 'name: 2-32 chars, lowercase letters/digits/hyphens'),
  description: z.string().max(500).nullable().optional(),
  statements: z.record(z.string(), z.array(z.string())).optional(),
})

const roleUpdateInput = z.strictObject({
  id: z.string().min(1),
  description: z.string().max(500).nullable().optional(),
  statements: z.record(z.string(), z.array(z.string())).optional(),
})

const oidcProviderInput = z.strictObject({
  /**
   * EXISTING provider id only — used to match the stored provider and keep
   * its callback path stable. New providers MUST omit it entirely: the id
   * (and thus the /auth/callback/:id path) is ALWAYS generated server-side
   * with crypto.randomUUID(); client-chosen ids for new providers would
   * let a caller craft callback paths.
   */
  id: z.string().min(2).max(36).optional(),
  label: z.string().min(1).max(64),
  issuer: z.string().url().max(512),
  clientId: z.string().min(1).max(255),
  clientSecret: z.string().max(512).optional(),
})

const oidcSaveInput = z.strictObject({
  providers: z.array(oidcProviderInput).max(20),
})

const settingsSaveInput = z.strictObject({
  disablePasswordLogin: z.boolean().optional(),
  logRetentionDays: z.number().int().min(0).max(3650).optional(),
})

const keyCreateInput = z.strictObject({
  name: z.string().min(1).max(64),
  expiresIn: z.number().int().positive().max(365 * 24 * 3600).optional(), // seconds; omit = no expiry
  permissions: z.record(z.string(), z.array(z.string())).optional(),
})

// ---- router ----------------------------------------------------------------

export const router = os.router({
  // ---------- public (login screen) ----------

  /** public auth capabilities for the login screen (was GET /api/auth-config) */
  authConfig: base.handler(async () => {
    const { resolveAuthPolicy } = await import('./auth')
    const p = await resolveAuthPolicy()
    return {
      passwordEnabled: p.passwordEnabled,
      oidcEnabled: p.oidcEnabled,
      providers: p.oidcProviders.map(x => ({ id: x.id, label: x.label })),
    }
  }),

  /** build version (was GET /api/version) */
  version: base.handler(() => ({ version: process.env.APP_VERSION || 'dev' })),

  // ---------- session ----------

  /** session payload for the admin shell; null when signed out (SSR-safe) */
  session: base.handler(async ({ context }) => {
    const { requireSession } = await import('./session')
    try {
      const session = await requireSession(eventFromContext(context))
      return {
        user: { id: session.user.id, name: session.user.name, email: session.user.email },
        session: { expiresAt: session.session.expiresAt },
      }
    }
    catch {
      return null
    }
  }),

  me: base.use(withUser).handler(({ context }) => ({
    id: context.user.userId,
    email: context.user.email,
    roles: context.user.roles,
    permissions: Object.fromEntries([...context.user.grants].map(([r, st]) => [r, [...st]])),
    vocabulary: vocabularyOut(),
  })),

  // ---------- routes ----------

  routes: {
    /** live list — own-scope filtered (REST parity); snapshot on every change */
    live: base.use(withPerm('routes', 'read')).handler(({ context }) =>
      liveGenerator(['routes'], async () => {
        const scope = readScopeOf(context.user, 'routes')
        const rows = scope === 'own'
          ? await db.query.routes.findMany({ where: { userId: context.user.userId }, orderBy: { path: 'asc' } })
          : await db.query.routes.findMany({ orderBy: { path: 'asc' } })
        return rows as unknown as RouteRow[]
      }),
    ),

    count: base.use(withPerm('routes', 'read')).handler(async ({ context }) => {
      const scope = readScopeOf(context.user, 'routes')
      const rows = scope === 'own'
        ? await db.query.routes.findMany({ where: { userId: context.user.userId }, columns: { id: true } })
        : await db.query.routes.findMany({ columns: { id: true } })
      return { count: rows.length }
    }),

    /** save (create/update/upsert) — REST PUT /api/routes semantics, takeover-safe */
    save: base.use(withUser).input(routeSaveInput).handler(async ({ context, input }) => {
      const { routeInputSchema } = await import('./route-schema')
      const { publishChange } = await import('./change-bus')
      // strict security boundary: the loose input above is UX-shaped; the
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
        const existing = await db.query.routes.findFirst({ where: { id: data.id } })
        if (!existing) notFound('route not found')
        await guardRecord(context, 'routes', 'update', existing)
        const clash = await db.query.routes.findFirst({ where: { AND: [{ path: data.path }, { id: { ne: data.id } }] }, columns: { id: true } })
        if (clash) throw new ORPCError('CONFLICT', { message: `a route already exists at ${data.path}` })
        await db.update(routesTable).set(row).where(eq(routesTable.id, data.id))
        await publishChange('routes', 'update')
        return { route: await db.query.routes.findFirst({ where: { id: data.id } }) }
      }

      // create / upsert-by-path: an existing route at this path can only be
      // overwritten by someone who may UPDATE that record (takeover fix —
      // create permission alone must never repoint someone else's route)
      const existing = await db.query.routes.findFirst({ where: { path: data.path } })
      if (existing) {
        await guardRecord(context, 'routes', 'update', existing)
        await db.update(routesTable).set(row).where(eq(routesTable.id, existing.id))
        await publishChange('routes', 'update')
        return { route: await db.query.routes.findFirst({ where: { id: existing.id } }) }
      }
      if (!userCan(context.user, 'routes', 'create')) {
        throw new ORPCError('FORBIDDEN', { message: 'missing permission routes:create' })
      }
      await db.insert(routesTable).values({ ...row, userId: context.user.userId })
      await publishChange('routes', 'create')
      return { route: await db.query.routes.findFirst({ where: { path: data.path } }) }
    }),

    /** remove by numeric id (preferred) or path */
    remove: base.use(withUser).input(z.strictObject({
      id: z.number().int().positive().optional(),
      path: z.string().min(1).max(512).optional(),
    })).handler(async ({ context, input }) => {
      const { publishChange } = await import('./change-bus')
      const target = input.id
        ? await db.query.routes.findFirst({ where: { id: input.id } })
        : input.path
          ? await db.query.routes.findFirst({ where: { OR: [{ path: input.path }, { path: `/${input.path.replace(/^\//, '')}` }] } })
          : null
      if (!target) notFound('route not found')
      await guardRecord(context, 'routes', 'delete', target)
      await db.delete(routesTable).where(eq(routesTable.id, target.id))
      await publishChange('routes', 'delete')
      return { deleted: true, id: target.id, path: target.path }
    }),
  },

  // ---------- logs ----------

  logs: {
    /** snapshot query (SSR-safe; no SSE during server render) */
    recent: base
      .use(withPerm('logs', 'read'))
      .input(logsPageInput)
      .handler(async ({ context, input }) => ({ entries: await queryLogsScoped(context.user, input ?? {}) })),

    /** live tail — initial batch, then fresh entries whenever logs grow */
    tail: base
      .use(withPerm('logs', 'read'))
      .input(logsPageInput)
      .handler(({ context, input }) =>
        liveGenerator(['logs'], async () => ({ entries: await queryLogsScoped(context.user, input ?? {}) }))),
  },

  // ---------- users ----------

  users: {
    /** one-shot user list (live twin below for realtime UIs) */
    list: base.use(withPerm('users', 'read')).handler(async () => {
      const { listUsers } = await import('./users')
      return { users: await listUsers() }
    }),

    /** live user list — refreshes on any users change */
    live: base.use(withPerm('users', 'read')).handler(() => liveGenerator(['users'], async () => {
      const { listUsers } = await import('./users')
      return { users: await listUsers() }
    })),

    save: base.use(withPerm('users', 'create')).input(userSaveInput).handler(async ({ context, input }) => {
      const { createUser } = await import('./users')
      const { publishChange } = await import('./change-bus')
      // assigning a role requires roles:update (viewer default otherwise)
      let role = 'viewer'
      if (input.role) {
        if (!userCan(context.user, 'roles', 'update')) {
          throw new ORPCError('FORBIDDEN', { message: 'missing permission roles:update (needed to assign a role)' })
        }
        role = input.role
      }
      try {
        await createUser(input.email, input.name, input.password, role, input.emailVerified ?? true)
        await publishChange('users', 'create')
        return { ok: true }
      }
      catch (e: unknown) {
        const msg = e instanceof Error && e.message.includes('UNIQUE') ? 'email already in use' : 'create failed'
        throw new ORPCError('CONFLICT', { message: msg })
      }
    }),

    update: base.use(withPerm('users', 'update')).input(userUpdateInput).handler(async ({ context, input }) => {
      const { updateUser } = await import('./users')
      const { publishChange } = await import('./change-bus')
      if (input.role !== undefined && !userCan(context.user, 'roles', 'update')) {
        throw new ORPCError('FORBIDDEN', { message: 'missing permission roles:update (needed to assign a role)' })
      }
      const { id, ...patch } = input
      if (Object.keys(patch).length === 0) badRequest('nothing to update')
      await updateUser(id, patch)
      await publishChange('users', 'update')
      return { ok: true }
    }),

    setPassword: base.use(withPerm('users', 'update')).input(z.strictObject({
      id: z.string().min(1),
      password: z.string().min(8).max(128),
    })).handler(async ({ input }) => {
      const { setPassword } = await import('./users')
      await setPassword(input.id, input.password)
      return { ok: true }
    }),

    remove: base.use(withPerm('users', 'delete')).input(z.strictObject({
      id: z.string().min(1),
    })).handler(async ({ context, input }) => {
      const { deleteUser } = await import('./users')
      const { publishChange } = await import('./change-bus')
      if (input.id === context.user.userId) badRequest('cannot delete your own account')
      await deleteUser(input.id)
      await publishChange('users', 'delete')
      return { ok: true }
    }),
  },

  // ---------- roles ----------

  roles: {
    /** one-shot role list + vocabulary (live twin below for realtime UIs) */
    list: base.use(withPerm('roles', 'read')).handler(async () => {
      const rows = await db.query.roles.findMany({ orderBy: { name: 'asc' } })
      return { roles: rows, vocabulary: vocabularyOut() }
    }),

    /** live role list — refreshes on any roles change */
    live: base.use(withPerm('roles', 'read')).handler(() => liveGenerator(['roles'], async () => {
      const rows = await db.query.roles.findMany({ orderBy: { name: 'asc' } })
      return { roles: rows, vocabulary: vocabularyOut() }
    })),

    save: base.use(withPerm('roles', 'create')).input(roleSaveInput).handler(async ({ input }) => {
      const { publishChange } = await import('./change-bus')
      const name = input.name.trim().toLowerCase()
      const description = input.description?.trim() ? input.description.trim() : null
      const stmtErr = validateStatements(input.statements ?? {})
      if (stmtErr) badRequest(stmtErr)
      const exists = await db.query.roles.findFirst({ where: { name } })
      if (exists) throw new ORPCError('CONFLICT', { message: `role "${name}" already exists` })
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const statements = input.statements ?? {}
      await db.insert(rolesTable).values({ id, name, description, statements, builtin: false, createdAt: now, updatedAt: now })
      await publishChange('roles', 'create')
      return { role: { id, name, description, statements, builtin: false } }
    }),

    update: base.use(withPerm('roles', 'update')).input(roleUpdateInput).handler(async ({ input }) => {
      const { publishChange } = await import('./change-bus')
      const row = await db.query.roles.findFirst({ where: { id: input.id } })
      if (!row) notFound('Role not found')
      if (row.builtin && input.statements !== undefined) badRequest('builtin roles cannot be modified')
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
      if (input.description !== undefined) {
        if (input.description === null || input.description.trim()) patch.description = input.description === null ? null : input.description.trim()
        else badRequest('description: must be a non-empty string or null')
      }
      if (input.statements !== undefined) {
        const stmtErr = validateStatements(input.statements)
        if (stmtErr) badRequest(stmtErr)
        patch.statements = input.statements
      }
      await db.update(rolesTable).set(patch).where(eq(rolesTable.id, input.id))
      await publishChange('roles', 'update')
      return { role: await db.query.roles.findFirst({ where: { id: input.id } }) }
    }),

    remove: base.use(withPerm('roles', 'delete')).input(z.strictObject({
      id: z.string().min(1),
    })).handler(async ({ input }) => {
      const { publishChange } = await import('./change-bus')
      const row = await db.query.roles.findFirst({ where: { id: input.id } })
      if (!row) notFound('Role not found')
      if (row.builtin) badRequest('builtin roles cannot be deleted')
      const holders = await db.query.user.findMany({ where: { role: row.name } })
      if (holders.length > 0) throw new ORPCError('CONFLICT', { message: `role still assigned to ${holders.length} user(s)` })
      await db.delete(rolesTable).where(eq(rolesTable.id, input.id))
      await publishChange('roles', 'delete')
      return { ok: true }
    }),
  },

  // ---------- settings ----------

  settings: {
    get: base.use(withPerm('settings', 'read')).handler(async () => {
      const { getSettings } = await import('./settings')
      const s = await getSettings()
      // never expose secrets through the RPC surface (legacy /api/settings
      // parity: only the two public knobs)
      return { disablePasswordLogin: s.disablePasswordLogin, logRetentionDays: s.logRetentionDays }
    }),

    save: base.use(withPerm('settings', 'update')).input(settingsSaveInput).handler(async ({ input }) => {
      const { setSetting } = await import('./settings')
      const { rebuildAuth } = await import('./auth')
      const { publishChange } = await import('./change-bus')
      // disabling password login requires at least one fully-configured provider
      if (input.disablePasswordLogin === true) {
        const { getOidcProviders } = await import('./oidc')
        const providers = await getOidcProviders()
        if (providers.length === 0) badRequest('configure an OIDC provider before disabling password login')
      }
      for (const [k, v] of Object.entries(input)) await setSetting(k as 'logRetentionDays', v)
      await rebuildAuth()
      await publishChange('settings', 'update')
      return { ok: true }
    }),
  },

  // ---------- OIDC providers ----------

  oidc: {
    list: base.use(withPerm('settings', 'read')).handler(async () => {
      const { getOidcProviders, providersToPublic } = await import('./oidc')
      return { providers: providersToPublic(await getOidcProviders()) }
    }),

    save: base.use(withPerm('settings', 'update')).input(oidcSaveInput).handler(async ({ input }) => {
      const { getOidcProviders, setOidcProviders, validProviderId, newProviderId } = await import('./oidc')
      type OidcProvider = import('./oidc').OidcProvider
      const { rebuildAuth } = await import('./auth')
      const existing = await getOidcProviders()
      const out: OidcProvider[] = []
      const seen = new Set<string>()
      for (const p of input.providers) {
        const incomingId = p.id?.trim().toLowerCase() ?? ''
        // an id is only accepted when it matches an EXISTING provider (keeps its
        // callback path stable); anything else is a NEW provider whose id is
        // generated here, server-side — never taken from the request body
        const prevId = existing.find(e => e.id === incomingId)
        const id = prevId ? incomingId : newProviderId()
        if (!validProviderId(id)) {
          // legacy slug ids (e.g. the migrated single 'oidc' provider) are not
          // uuids; accept them ONLY when they already exist in storage
          const isStoredLegacy = prevId !== undefined && id === incomingId
          if (!isStoredLegacy) badRequest(`invalid provider id: ${id}`)
        }
        if (seen.has(id)) badRequest(`duplicate provider id: ${id}`)
        seen.add(id)
        const prev = existing.find(e => e.id === id)
        const clientSecret = p.clientSecret && p.clientSecret.length > 0 ? p.clientSecret : (prev?.clientSecret ?? '')
        if (!clientSecret) badRequest(`client secret required for ${id} (or stored previously)`)
        out.push({ id, label: p.label.trim(), issuer: p.issuer.trim().replace(/\/+$/, ''), clientId: p.clientId.trim(), clientSecret })
      }
      await setOidcProviders(out)
      await rebuildAuth() // discovery for new providers runs at auth build
      return { providers: out.map(({ clientSecret: _s, ...rest }) => ({ ...rest, secretSet: true })) }
    }),
  },

  // ---------- API keys (current user) ----------

  keys: {
    /** current user's keys (ownership = referenceId); no secrets, real perms */
    list: base.use(withUser).handler(async ({ context }) => {
      const rows = await db.select().from(apiKeyTable).where(eq(apiKeyTable.referenceId, context.user.userId)).orderBy(desc(apiKeyTable.createdAt))
      return { keys: rows.map(k => ({
        id: k.id,
        name: k.name,
        start: k.start,
        enabled: k.enabled,
        expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
        lastRequest: k.lastRequest ? k.lastRequest.toISOString() : null,
        requestCount: k.requestCount,
        // json-mode column: drizzle types it unknown after select
        permissions: parseKeyPermissions(typeof k.permissions === 'string' ? k.permissions : JSON.stringify(k.permissions) ?? null),
      })) }
    }),

    create: base.use(withUser).input(keyCreateInput).handler(async ({ context, input }) => {
      const { getAuth } = await import('./auth')
      const { publishChange } = await import('./change-bus')
      // validate resource names + statements exist in the RBAC vocabulary
      const clean: Record<string, string[]> = {}
      if (input.permissions) {
        for (const [resource, statements] of Object.entries(input.permissions)) {
          if (!(resource in STATEMENTS)) badRequest(`unknown resource: ${resource}`)
          const vocab: readonly string[] = STATEMENTS[resource as keyof typeof STATEMENTS]
          for (const st of statements) {
            if (!vocab.includes(st)) badRequest(`unknown statement ${resource}:${st}`)
          }
          clean[resource] = statements
        }
      }
      const auth = await getAuth()
      const res = await auth.api.createApiKey({
        body: {
          name: input.name,
          userId: context.user.userId,
          ...(input.expiresIn ? { expiresIn: input.expiresIn } : {}),
          ...(Object.keys(clean).length > 0 ? { permissions: clean } : {}),
        },
      })
      await publishChange('keys', 'create')
      return { key: res.key, referenceId: res.referenceId, name: input.name }
    }),

    revoke: base.use(withUser).input(z.strictObject({ id: z.string().min(1) })).handler(async ({ context, input }) => {
      const { publishChange } = await import('./change-bus')
      // verify ownership before revoking (key must belong to the caller)
      const owned = (await db.select().from(apiKeyTable).where(eq(apiKeyTable.id, input.id)))[0]
      if (!owned || owned.referenceId !== context.user.userId) notFound('key not found')
      await db.delete(apiKeyTable).where(eq(apiKeyTable.id, input.id))
      await publishChange('keys', 'delete')
      return { ok: true }
    }),
  },
})

export type Router = typeof router
