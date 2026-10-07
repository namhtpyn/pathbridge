// Permission core: static statement vocabulary (compile-time) + runtime roles
// (DB rows). Enforcement lives here; routes call requirePermission().
//
// Statement grammar: "<action>:<scope>" e.g. "read:all", "update:own".
//   action: create | read | update | delete
//   scope:  all = act on anyone's records | own = only records you own
// "action:all" implies "action:own". Resources without ownership (settings,
// users, roles) only ever list ":all". Vocabulary law: a statement exists
// only if some route checks it.

import { createAccessControl } from 'better-auth/plugins/access'
import type { Role } from 'better-auth/plugins/access'
import { db } from '../db'
import { roles as rolesTable } from '../db/schema'
import type { H3Event } from 'h3'
import { requireSession } from './session'

export const ACTIONS = ['create', 'read', 'update', 'delete'] as const
export const SCOPES = ['all', 'own'] as const
export type Action = typeof ACTIONS[number]
export type Scope = typeof SCOPES[number]

// ---- static vocabulary ----------------------------------------------------

export const STATEMENTS = {
  pairs: ['create:all', 'read:own', 'read:all', 'update:own', 'update:all', 'delete:own', 'delete:all'],
  logs: ['read:own', 'read:all', 'delete:own', 'delete:all'],
  settings: ['read:all', 'update:all'],
  users: ['create:all', 'read:all', 'update:all', 'delete:all'],
  roles: ['create:all', 'read:all', 'update:all', 'delete:all'],
  keys: ['create:all', 'read:own', 'read:all', 'update:own', 'update:all', 'delete:own', 'delete:all'],
} as const

export type StatementMap = typeof STATEMENTS
export type Resource = keyof StatementMap

export const ac = createAccessControl(STATEMENTS)

const STATEMENT_RE = /^(create|read|update|delete):(all|own)$/

// ---- runtime roles ---------------------------------------------------------

export type RoleRow = {
  id: string
  name: string
  description: string | null
  statements: Record<string, string[]>
  builtin: boolean
}

/** All role rows from the DB (source of truth). */
export async function listRoles(): Promise<RoleRow[]> {
  const rows = await db.query.roles.findMany()
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    statements: r.statements ?? {},
    builtin: r.builtin,
  }))
}

/** Validate a statements payload against the static vocabulary.
 *  Returns error message or null. Used by the roles API (strict backend). */
export function validateStatements(stmts: unknown): string | null {
  if (typeof stmts !== 'object' || stmts === null || Array.isArray(stmts)) return 'statements must be an object'
  const map = stmts as Record<string, unknown>
  for (const [resource, actions] of Object.entries(map)) {
    if (!(resource in STATEMENTS)) return `unknown resource "${resource}"`
    if (!Array.isArray(actions)) return `statements.${resource} must be an array`
    const allowed: readonly string[] = STATEMENTS[resource as Resource]
    for (const a of actions) {
      if (typeof a !== 'string' || !STATEMENT_RE.test(a)) {
        return `"${a}" is not a valid action:scope statement (e.g. "read:all")`
      }
      if (!allowed.includes(a)) {
        return `"${a}" is not valid for resource "${resource}"`
      }
    }
  }
  return null
}

/** Build the better-auth Role objects for the auth factory (not used for
 *  enforcement — enforcement resolves from DB directly per request). */
export async function buildRoleMap(): Promise<Record<string, Role>> {
  const rows = await listRoles()
  const map: Record<string, Role> = {}
  for (const r of rows) {
    try {
      map[r.name] = ac.newRole(r.statements as never)
    } catch {
      // role predates a vocabulary change; skip it (stays unassignable)
    }
  }
  return map
}

// ---- permission resolution -------------------------------------------------

export type ResolvedUser = {
  userId: string
  email: string
  /** role names assigned to the user */
  roles: string[]
  /** union of all role statements: resource -> Set("action:scope") */
  grants: Map<Resource, Set<string>>
}

/** Resolve a user's effective permissions from their roles. */
export async function resolveUser(user: { id: string, email: string, role: string }): Promise<ResolvedUser> {
  const names = user.role.split(',').map(s => s.trim()).filter(Boolean)
  const all = await listRoles()
  const grants = new Map<Resource, Set<string>>()
  for (const name of names) {
    const row = all.find(r => r.name === name)
    if (!row) continue
    for (const [resource, actions] of Object.entries(row.statements)) {
      const key = resource as Resource
      if (!(key in STATEMENTS)) continue
      const allowed: readonly string[] = STATEMENTS[key]
      let set = grants.get(key)
      if (!set) { set = new Set(); grants.set(key, set) }
      for (const a of actions) if (allowed.includes(a)) set.add(a)
    }
  }
  return { userId: user.id, email: user.email, roles: names, grants }
}

/** Pure check against resolved grants. Scope omitted = any scope.
 *  "action:all" satisfies "action:own". */
export function userCan(u: ResolvedUser, resource: Resource, action: Action, scope?: Scope): boolean {
  const set = u.grants.get(resource)
  if (!set) return false
  if (scope) {
    if (set.has(`${action}:${scope}`)) return true
    if (scope === 'own' && set.has(`${action}:all`)) return true
    return false
  }
  return set.has(`${action}:all`) || set.has(`${action}:own`)
}

// ---- enforcement -----------------------------------------------------------

/** Thrown as H3 403 with the missing permission named. */
function forbidden(resource: Resource, statement: string): never {
  throw createError({
    statusCode: 403,
    statusMessage: `Forbidden: missing permission ${resource}:${statement}`,
  })
}

export type AppSessionLike = Awaited<ReturnType<typeof requireSession>>

/** Authenticated user with resolved permissions. */
export async function requireUser(event: H3Event): Promise<{ session: AppSessionLike, user: ResolvedUser }> {
  const session = await requireSession(event)
  const role = (session.user as unknown as { role?: string | null }).role ?? 'viewer'
  let user = await resolveUser({ id: session.user.id, email: session.user.email, role })

  // API-key scoping: a key's permissions can only NARROW the owner's grants,
  // never expand them (a key is a credential of its owner, not a new principal).
  const keyPerms = (session as unknown as { apiKeyPermissions?: Record<string, string[]> | null }).apiKeyPermissions
  if (keyPerms && Object.keys(keyPerms).length > 0) {
    const narrowed = new Map<Resource, Set<string>>()
    for (const [resource, statements] of Object.entries(keyPerms)) {
      if (!(resource in STATEMENTS)) continue
      const ownerGrants = user.grants.get(resource as Resource)
      if (!ownerGrants) continue // key cannot grant what the owner lacks
      const allowed: readonly string[] = STATEMENTS[resource as Resource]
      const set = new Set<string>()
      for (const st of statements) {
        if (allowed.includes(st) && ownerGrants.has(st)) set.add(st)
      }
      if (set.size > 0) narrowed.set(resource as Resource, set)
    }
    user = { ...user, grants: narrowed }
  }
  return { session, user }
}

/** Require a permission. Scope omitted = any; pass 'own'/'all' to be strict. */
export async function requirePermission(event: H3Event, resource: Resource, action: Action, scope?: Scope) {
  const { user } = await requireUser(event)
  if (!userCan(user, resource, action, scope)) forbidden(resource, scope ? `${action}:${scope}` : action)
  return user
}

/** Require read on an ownable resource; returns the widest scope held. */
export async function requireReadScope(event: H3Event, resource: Resource): Promise<{ user: ResolvedUser, scope: 'all' | 'own' }> {
  const { user } = await requireUser(event)
  if (userCan(user, resource, 'read', 'all')) return { user, scope: 'all' }
  if (userCan(user, resource, 'read', 'own')) return { user, scope: 'own' }
  forbidden(resource, 'read')
}

/** Require an action on a specific record — enforces ownership for own-scope. */
export async function requireRecordPermission(
  event: H3Event,
  resource: Resource,
  action: Action,
  record: { userId?: string | null },
) {
  const { user } = await requireUser(event)
  if (userCan(user, resource, action, 'all')) return user
  if (userCan(user, resource, action, 'own')) {
    if (record.userId && record.userId === user.userId) return user
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: you can only act on your own records' })
  }
  forbidden(resource, `${action}:own`)
}
