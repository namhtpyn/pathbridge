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
  const rows = await (await getDb()).query.roles.findMany({ orderBy: { name: 'asc' } })
  return { roles: rows, vocabulary: await vocabularyOut() }
}

export async function createRole(input: {
  name: string, description?: string | null, statements?: Record<string, string[]>,
}) {
  const { publishChange } = await import('../../lib/change-bus')
  const name = input.name.trim().toLowerCase()
  const description = input.description?.trim() ? input.description.trim() : null
  const stmtErr = (await import('../../lib/permissions')).validateStatements(input.statements ?? {})
  if (stmtErr) badRequest(stmtErr)
  const exists = await (await getDb()).query.roles.findFirst({ where: { name } })
  if (exists) throw new ORPCError('CONFLICT', { message: `role "${name}" already exists` })
  const id = uuidv7()
  const now = new Date().toISOString()
  const statements = input.statements ?? {}
  await (await getDb()).insert(rolesTable).values({ id, name, description, statements, builtin: false, createdAt: now, updatedAt: now })
  await publishChange('roles', 'create')
  return { role: { id, name, description, statements, builtin: false } }
}

export async function updateRole(input: {
  id: string, description?: string | null, statements?: Record<string, string[]>,
}) {
  const { publishChange } = await import('../../lib/change-bus')
  const row = await (await getDb()).query.roles.findFirst({ where: { id: input.id } })
  if (!row) notFound('Role not found')
  if (row.builtin && input.statements !== undefined) badRequest('builtin roles cannot be modified')
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (input.description !== undefined) {
    if (input.description === null || input.description.trim()) patch.description = input.description === null ? null : input.description.trim()
    else badRequest('description: must be a non-empty string or null')
  }
  if (input.statements !== undefined) {
    const stmtErr = (await import('../../lib/permissions')).validateStatements(input.statements)
    if (stmtErr) badRequest(stmtErr)
    patch.statements = input.statements
  }
  await (await getDb()).update(rolesTable).set(patch).where(eq(rolesTable.id, input.id))
  await publishChange('roles', 'update')
  return { role: await (await getDb()).query.roles.findFirst({ where: { id: input.id } }) }
}

export async function removeRole(input: { id: string }) {
  const { publishChange } = await import('../../lib/change-bus')
  const row = await (await getDb()).query.roles.findFirst({ where: { id: input.id } })
  if (!row) notFound('Role not found')
  if (row.builtin) badRequest('builtin roles cannot be deleted')
  const holders = await (await getDb()).query.user.findMany({ where: { role: row.name } })
  if (holders.length > 0) throw new ORPCError('CONFLICT', { message: `role still assigned to ${holders.length} user(s)` })
  await (await getDb()).delete(rolesTable).where(eq(rolesTable.id, input.id))
  await publishChange('roles', 'delete')
  return { ok: true }
}
