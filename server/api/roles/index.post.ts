import { db } from '../../db'
import { roles as rolesTable } from '../../db/schema'
import { listRoles, validateStatements, STATEMENTS, requirePermission } from '../../utils/permissions'
import { eq } from 'drizzle-orm'
import { createError } from 'h3'

const NAME_RE = /^[a-z0-9][a-z0-9-]{1,31}$/

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'roles', 'create')
  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim().toLowerCase() : ''
  if (!NAME_RE.test(name)) throw createError({ statusCode: 400, statusMessage: 'name: 2-32 chars, lowercase letters/digits/hyphens' })
  const description = typeof body?.description === 'string' && body.description.trim() ? body.description.trim() : null
  if (body?.description !== undefined && body?.description !== null && description === null && body.description !== '') {
    throw createError({ statusCode: 400, statusMessage: 'description: must be a non-empty string or null' })
  }
  const stmtErr = validateStatements(body?.statements)
  if (stmtErr) throw createError({ statusCode: 400, statusMessage: stmtErr })
  const statements = (body.statements ?? {}) as Record<string, string[]>
  const exists = await db.query.roles.findFirst({ where: { name } })
  if (exists) throw createError({ statusCode: 409, statusMessage: `role "${name}" already exists` })
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.insert(rolesTable).values({ id, name, description, statements, builtin: false, createdAt: now, updatedAt: now })
  return { role: { id, name, description, statements, builtin: false } }
})
