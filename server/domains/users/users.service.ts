const getDb = async () => (await import('../../db')).db
// User management: list/create/update/delete users + change password.
// Owns its writes (not better-auth API calls) — password hashing uses the
// same better-auth/crypto primitives so accounts stay compatible.
import { v7 as uuidv7 } from 'uuid'
// lazy: nuxt prepare (jiti/Node) must not statically reach bun:sqlite
import { user, account, session as sessionTable, apikey } from '../../db/schema.auth'
import { hashPassword } from 'better-auth/crypto'
import { count } from 'drizzle-orm'
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

export async function listUsers() {
  const db = await getDb()
  const users = await db.query.user.findMany({
    columns: { id: true, name: true, email: true, emailVerified: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc', id: 'asc' },
  })
  // one grouped count per table — never fetch sessions/accounts to length them
  const counts = await db.select({ userId: sessionTable.userId, n: count() }).from(sessionTable).groupBy(sessionTable.userId)
  const countOf = new Map(counts.map(c => [c.userId, Number(c.n)]))
  // credential presence per user — subset columns only (never token values)
  const accounts = users.length
    ? await db.query.account.findMany({
        where: { userId: { in: users.map(u => u.id) } },
        columns: { userId: true, providerId: true, password: true },
        orderBy: { id: 'asc' },
      })
    : []
  return users.map((u) => {
    const mine = accounts.filter(a => a.userId === u.id)
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      role: u.role ?? 'viewer',
      createdAt: (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)).toISOString(),
      sessionCount: countOf.get(u.id) ?? 0,
      hasPassword: mine.some(a => a.providerId === 'credential' && a.password != null),
      oidcLinked: mine.some(a => a.providerId !== 'credential'),
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
  const exists = await (await getDb()).query.user.findFirst({ where: { id }, columns: { id: true } })
  if (!exists) return false
  if (patch.role !== undefined) await assertRolesExist(patch.role)
  const sets: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined) sets.name = patch.name
  if (patch.email !== undefined) sets.email = patch.email
  if (patch.emailVerified !== undefined) sets.emailVerified = patch.emailVerified
  if (patch.role !== undefined) sets.role = patch.role
  await (await getDb()).update(user).set(sets).where(eqUser(id))
  return true
}

export async function deleteUser(id: string) {
  const db = await getDb()
  // one transaction: sessions, credentials, API keys (no FK on apikey.referenceId)
  // and the user row must disappear together or not at all.
  db.transaction((tx) => {
    tx.delete(sessionTable).where(eqSessionUser(id)).run()
    tx.delete(account).where(eqAccountUser(id)).run()
    tx.delete(apikey).where(eq(apikey.referenceId, id)).run()
    tx.delete(user).where(eqUser(id)).run()
  })
}

export async function setPassword(id: string, password: string) {
  const exists = await (await getDb()).query.user.findFirst({ where: { id }, columns: { id: true } })
  if (!exists) return false
  const hash = await hashPassword(password)
  const cred = await (await getDb()).query.account.findFirst({
    where: { userId: id, providerId: 'credential' },
    columns: { id: true },
    orderBy: { id: 'asc' },
  })
  if (cred) {
    await (await getDb()).update(account).set({ password: hash, updatedAt: new Date() }).where(eqAccount(cred.id))
  }
  else {
    await (await getDb()).insert(account).values({
      id: uuidv7(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: hash,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }
  return true
}

// drizzle rc eq helpers bound to our tables
import { eq } from 'drizzle-orm'
function eqUser(id: string) { return eq(user.id, id) }
function eqSessionUser(id: string) { return eq(sessionTable.userId, id) }
function eqAccountUser(id: string) { return eq(account.userId, id) }
function eqAccount(id: string) { return eq(account.id, id) }
