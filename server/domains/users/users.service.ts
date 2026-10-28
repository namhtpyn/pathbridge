const getDb = async () => (await import('../../db')).db
// User management: list/create/update/delete users + change password.
// Owns its writes (not better-auth API calls) — password hashing uses the
// same better-auth/crypto primitives so accounts stay compatible.
import { v7 as uuidv7 } from 'uuid'
import { ORPCError } from '@orpc/server'
// lazy: nuxt prepare (jiti/Node) must not statically reach bun:sqlite
import { user, account, session as sessionTable, apikey, verification } from '../../db/schema.auth'
import { routes as routesTable } from '../../db/schema'
import { hashPassword } from 'better-auth/crypto'
import { and, count, eq, gt, inArray, sql } from 'drizzle-orm'
import { badRequest } from '../shared/context'

export type AdminUserView = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: string
  createdAt: string
  sessionCount: number
  hasPassword: boolean
  oidcLinked: boolean
}

/** SQLite unique-constraint failure — bun's driver code or the raw message. */
export function isUniqueViolation(e: unknown) {
  if (!(e instanceof Error)) return false
  const code = (e as { code?: unknown }).code
  return (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) || e.message.includes('UNIQUE')
}

export async function listUsers() {
  const db = await getDb()
  const users = await db.query.user.findMany({
    columns: { id: true, name: true, email: true, emailVerified: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc', id: 'asc' },
  })
  if (users.length === 0) return []
  const ids = users.map(u => u.id)
  // one grouped count per table — never fetch sessions/accounts to length them
  const counts = await db
    .select({ userId: sessionTable.userId, n: count() })
    .from(sessionTable)
    .where(and(inArray(sessionTable.userId, ids), gt(sessionTable.expiresAt, new Date())))
    .groupBy(sessionTable.userId)
  const countOf = new Map(counts.map(c => [c.userId, Number(c.n)]))
  // credential presence per user — decided in SQL, the hash never leaves the DB
  const accounts = await db
    .select({
      userId: account.userId,
      providerId: account.providerId,
      hasPw: sql<number>`${account.password} is not null`,
    })
    .from(account)
    .where(inArray(account.userId, ids))
  const hasPassword = new Set(accounts.filter(a => a.providerId === 'credential' && Boolean(a.hasPw)).map(a => a.userId))
  const oidcLinked = new Set(accounts.filter(a => a.providerId !== 'credential').map(a => a.userId))
  return users.map((u) => {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      role: u.role ?? 'viewer',
      createdAt: (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)).toISOString(),
      sessionCount: countOf.get(u.id) ?? 0,
      hasPassword: hasPassword.has(u.id),
      oidcLinked: oidcLinked.has(u.id),
    }
  })
}

/** every role name in a comma list must exist — a typo must not mint a zero-grant user. */
async function assertRolesExist(role: string) {
  const names = role.split(',').map(r => r.trim()).filter(Boolean)
  const rows = await (await getDb()).query.roles.findMany({ columns: { name: true }, orderBy: { name: 'asc' } })
  const known = new Set(rows.map(r => r.name))
  for (const n of names) {
    if (!known.has(n)) badRequest(`unknown role: ${n}`)
  }
}

export async function createUser(email: string, name: string, password: string, role = 'viewer', emailVerified = true) {
  await assertRolesExist(role)
  const id = uuidv7()
  const now = new Date()
  const hash = await hashPassword(password)
  // one transaction: no orphan user rows if the account insert fails.
  // bun:sqlite is a SYNC driver — the callback must not be async.
  const db = await getDb()
  db.transaction((tx) => {
    tx.insert(user).values({
      id, email, name, emailVerified, role, createdAt: now, updatedAt: now,
    }).run()
    tx.insert(account).values({
      id: uuidv7(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: hash,
      createdAt: now,
      updatedAt: now,
    }).run()
  })
}

export async function updateUser(id: string, patch: { name?: string, email?: string, emailVerified?: boolean, role?: string }) {
  const db = await getDb()
  const exists = await db.query.user.findFirst({ where: { id }, columns: { id: true } })
  if (!exists) return false
  if (patch.role !== undefined) await assertRolesExist(patch.role)
  if (patch.email !== undefined) {
    const taken = await db.query.user.findFirst({ where: { email: patch.email }, columns: { id: true } })
    if (taken && taken.id !== id) throw new ORPCError('CONFLICT', { message: 'email already in use' })
  }
  const sets: Partial<Pick<typeof user.$inferInsert, 'name' | 'email' | 'emailVerified' | 'role' | 'updatedAt'>> = { updatedAt: new Date() }
  if (patch.name !== undefined) sets.name = patch.name
  if (patch.email !== undefined) sets.email = patch.email
  if (patch.emailVerified !== undefined) sets.emailVerified = patch.emailVerified
  if (patch.role !== undefined) sets.role = patch.role
  await db.update(user).set(sets).where(eqUser(id))
  return true
}

export async function deleteUser(id: string) {
  const db = await getDb()
  const target = await db.query.user.findFirst({ where: { id }, columns: { email: true } })
  if (!target) return false
  // one transaction: sessions, credentials, pending tokens, API keys (no FK on
  // apikey.referenceId), owned routes and the user row must disappear together.
  db.transaction((tx) => {
    tx.delete(sessionTable).where(eqSessionUser(id)).run()
    tx.delete(account).where(eqAccountUser(id)).run()
    // verification rows are keyed by identifier (= email), not user_id
    tx.delete(verification).where(eq(verification.identifier, target.email)).run()
    tx.delete(apikey).where(eq(apikey.referenceId, id)).run()
    // unowned routes survive the account: a dangling owner id would look like
    // a live grant to nobody
    tx.update(routesTable).set({ userId: null }).where(eq(routesTable.userId, id)).run()
    tx.delete(user).where(eqUser(id)).run()
  })
  return true
}

export async function setPassword(id: string, password: string) {
  const db = await getDb()
  const exists = await db.query.user.findFirst({ where: { id }, columns: { id: true } })
  if (!exists) return false
  const hash = await hashPassword(password) // outside the tx: hashing is async
  const now = new Date()
  // find + write in ONE sync transaction: two concurrent calls must not both
  // miss and insert a second credential row.
  db.transaction((tx) => {
    const cred = tx.select({ id: account.id }).from(account)
      .where(and(eqAccountUser(id), eq(account.providerId, 'credential')))
      .get()
    if (cred) {
      tx.update(account).set({ password: hash, updatedAt: now }).where(eqAccount(cred.id)).run()
    }
    else {
      tx.insert(account).values({
        id: uuidv7(),
        accountId: id,
        providerId: 'credential',
        userId: id,
        password: hash,
        createdAt: now,
        updatedAt: now,
      }).run()
    }
  })
  return true
}

// drizzle rc eq helpers bound to our tables
function eqUser(id: string) { return eq(user.id, id) }
function eqSessionUser(id: string) { return eq(sessionTable.userId, id) }
function eqAccountUser(id: string) { return eq(account.userId, id) }
function eqAccount(id: string) { return eq(account.id, id) }
