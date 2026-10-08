import { db } from '../../db'
import { roles as rolesTable } from '../../db/schema'
import { validateStatements, requirePermission } from '../../utils/permissions'
import { eq } from 'drizzle-orm'
import { publishChange } from '../../utils/change-bus'


export default defineEventHandler(async (event) => {
  await requirePermission(event, 'roles', 'update')
  const id = getRouterParam(event, 'id') ?? ''
  const row = await db.query.roles.findFirst({ where: { id } })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Role not found' })
  const body = await readBody(event)
  if (body?.name !== undefined && body.name !== row.name) {
    throw createError({ statusCode: 400, statusMessage: 'name is immutable' })
  }
  if (row.builtin && body?.statements !== undefined) {
    throw createError({ statusCode: 400, statusMessage: 'builtin roles cannot be modified' })
  }
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (body?.description !== undefined) {
    if (body.description === null || (typeof body.description === 'string' && body.description.trim())) {
      patch.description = body.description === null ? null : body.description.trim()
    } else {
      throw createError({ statusCode: 400, statusMessage: 'description: must be a non-empty string or null' })
    }
  }
  if (body?.statements !== undefined) {
    const stmtErr = validateStatements(body.statements)
    if (stmtErr) throw createError({ statusCode: 400, statusMessage: stmtErr })
    patch.statements = body.statements
  }
  await db.update(rolesTable).set(patch).where(eq(rolesTable.id, id))
  const fresh = await db.query.roles.findFirst({ where: { id } })
  await publishChange('roles', 'update')
  return { role: fresh }
})
