// User management: list/create/update/delete users + change password.
// Owns its writes (not better-auth API calls) — password hashing uses the
// same better-auth/crypto primitives so accounts stay compatible.
import { db } from '../db'
import { user, account, session as sessionTable } from '../db/schema'
import { hashPassword } from 'better-auth/crypto'

export interface AdminUserView {
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

export async function listUsers(): Promise<AdminUserView[]> {
  const users = await db.query.user.findMany({ orderBy: (u, { asc }) => asc(u.createdAt) })
  const accounts = await db.query.account.findMany()
  const sessions = await db.query.session.findMany()
  return users.map((u) => {
    const mine = accounts.filter(a => a.userId === u.id)
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      role: u.role ?? 'viewer',
      createdAt: (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)).toISOString(),
      sessionCount: sessions.filter(s => s.userId === u.id).length,
      hasPassword: mine.some(a => a.providerId === 'credential' && a.password != null),
      oidcLinked: mine.some(a => a.providerId !== 'credential'),
    }
  })
}

export async function createUser(email: string, name: string, password: string, role = 'viewer', emailVerified = true): Promise<void> {
  const id = crypto.randomUUID()
  const now = new Date()
  const hash = await hashPassword(password)
  // one transaction: no orphan user rows if the account insert fails.
  // bun:sqlite is a SYNC driver — the callback must not be async.
  db.transaction((tx) => {
    tx.insert(user).values({
      id, email, name, emailVerified, role, createdAt: now, updatedAt: now,
    }).run()
    tx.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: hash,
      createdAt: now,
      updatedAt: now,
    }).run()
  })
}

export async function updateUser(id: string, patch: { name?: string, email?: string, emailVerified?: boolean, role?: string }): Promise<void> {
  const sets: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined) sets.name = patch.name
  if (patch.email !== undefined) sets.email = patch.email
  if (patch.emailVerified !== undefined) sets.emailVerified = patch.emailVerified
  if (patch.role !== undefined) sets.role = patch.role
  await db.update(user).set(sets).where(eqUser(id))
}

export async function deleteUser(id: string): Promise<void> {
  await db.delete(sessionTable).where(eqSessionUser(id))
  await db.delete(account).where(eqAccountUser(id))
  await db.delete(user).where(eqUser(id))
}

export async function setPassword(id: string, password: string): Promise<void> {
  const hash = await hashPassword(password)
  const rows = await db.query.account.findMany()
  const cred = rows.find(a => a.userId === id && a.providerId === 'credential')
  if (cred) {
    await db.update(account).set({ password: hash, updatedAt: new Date() }).where(eqAccount(cred.id))
  }
  else {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: hash,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }
}

// drizzle rc eq helpers bound to our tables
import { eq } from 'drizzle-orm'
function eqUser(id: string) { return eq(user.id, id) }
function eqSessionUser(id: string) { return eq(sessionTable.userId, id) }
function eqAccountUser(id: string) { return eq(account.userId, id) }
function eqAccount(id: string) { return eq(account.id, id) }
