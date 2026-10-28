// roles service: drizzle logic for the RBAC role table
import { eq } from 'drizzle-orm'
import { ORPCError } from '@orpc/server'
import { v7 as uuidv7 } from 'uuid'
import { badRequest, notFound, vocabularyOut } from '../shared/context'
// lazy db access: nuxt prepare (jiti/Node) must never statically reach
// bun:sqlite through this module — services load the client on first call
const getDb = async () => (await import('../../db')).db
import { roles as rolesTable } from '../../db/schema'

export async function listRoles() {
  const rows = await (await getDb()).query.roles.findMany({
    columns: { id: true, name: true, description: true, statements: true, builtin: true },
    orderBy: { name: 'asc' },
  })
  return { roles: rows, vocabulary: await vocabularyOut() }
}

export async function createRole(input: {
  name: string, description?: string | null, statements?: Record<string, string[]>,
}) {
  const { publishChange } = await import('../../lib/change-bus')
  const name = input.name.trim().toLowerCase()
  const stmtErr = (await import('../../lib/permissions')).validateStatements(input.statements ?? {})
  if (stmtErr) badRequest(stmtErr)
  const id = uuidv7()
  const now = new Date().toISOString()
  const statements = input.statements ?? {}
  const description = input.description ?? null
  // the unique index is the real gate — a pre-check loses to a concurrent create
  const res = await (await getDb()).insert(rolesTable)
    .values({ id, name, description, statements, builtin: false, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
  if (res.changes === 0) throw new ORPCError('CONFLICT', { message: `role "${name}" already exists` })
  await publishChange('roles', 'create')
  return { role: { id, name, description, statements, builtin: false } }
}

export async function updateRole(input: {
  id: string, description?: string | null, statements?: Record<string, string[]>,
}) {
  const { publishChange } = await import('../../lib/change-bus')
  const row = await (await getDb()).query.roles.findFirst({ where: { id: input.id } })
  if (!row) notFound('role not found')
  // every update is refused, not just statements: seed-roles rewrites builtin
  // descriptions at boot, so a description edit would silently revert
  if (row.builtin) badRequest('builtin roles cannot be modified')
  const patch: Partial<Pick<typeof rolesTable.$inferInsert, 'description' | 'statements' | 'updatedAt'>> = { updatedAt: new Date().toISOString() }
  if (input.description !== undefined) patch.description = input.description ?? null
  if (input.statements !== undefined) {
    const stmtErr = (await import('../../lib/permissions')).validateStatements(input.statements)
    if (stmtErr) badRequest(stmtErr)
    patch.statements = input.statements
  }
  await (await getDb()).update(rolesTable).set(patch).where(eq(rolesTable.id, input.id))
  await publishChange('roles', 'update')
  // re-read: the row may have been deleted between the write and the read
  const saved = await (await getDb()).query.roles.findFirst({ where: { id: input.id } })
  if (!saved) notFound('role not found')
  return { role: saved }
}

export async function removeRole(input: { id: string }) {
  const { publishChange } = await import('../../lib/change-bus')
  const row = await (await getDb()).query.roles.findFirst({ where: { id: input.id } })
  if (!row) notFound('role not found')
  if (row.builtin) badRequest('builtin roles cannot be deleted')
  // user.role is a comma list ('viewer,custom') — an exact match misses those
  // holders and the delete would silently strip grants. LIKE narrows, then
  // every candidate is split-tested exactly.
  const candidates = await (await getDb()).query.user.findMany({
    where: { role: { like: `%${row.name}%` } },
    columns: { id: true, role: true },
    orderBy: { id: 'asc' },
  })
  const holders = candidates.filter(u => (u.role ?? '').split(',').map(r => r.trim()).includes(row.name))
  if (holders.length > 0) throw new ORPCError('CONFLICT', { message: `role still assigned to ${holders.length} user(s)` })
  await (await getDb()).delete(rolesTable).where(eq(rolesTable.id, input.id))
  await publishChange('roles', 'delete')
  return { ok: true }
}
